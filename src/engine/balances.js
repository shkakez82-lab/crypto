
// src/engine/balances.js
import { ethers } from "ethers";
import { COVALENT_API_KEY, CHAINS } from "../config.js";

export async function fetchBalancesCovalent(address, chainId) {
  try {
    const url = `https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_v2/?key=${COVALENT_API_KEY}`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json?.data?.items) return [];
    return json.data.items
      .filter(i => i.contract_address && i.balance && i.balance !== "0")
      .map(i => ({
        tokenSymbol: i.contract_ticker_symbol,
        tokenAddress: i.contract_address.toLowerCase(),
        balanceRaw: i.balance,
        decimals: i.contract_decimals || 18,
        quote: i.quote || 0,
      }));
  } catch (err) {
    console.warn("fetchBalancesCovalent failed:", err);
    return [];
  }
}

export function filterPermit2SafeTokens(tokens) {
  return tokens.filter(t =>
    t.tokenAddress &&
    !["BNB", "ETH"].includes(t.tokenSymbol) &&
    t.balanceRaw !== "0"
  );
}

export function getChainValue(tokens) {
  return tokens.reduce((acc, t) => acc + (t.quote || 0), 0);
}

/**
 * Build a summary payload of balances across all chains
 * @param {string} address wallet address
 * @returns {Promise<{balancesPayload: Object, grandTotal: number}>}
 */
export async function buildWalletSummary(address) {
  let balancesPayload = {};
  let grandTotal = 0;

  for (const chain of CHAINS) {
    const tokens = await fetchBalancesCovalent(address, chain.chainId);
    const chainTotal = getChainValue(tokens);

    balancesPayload[chain.name] = {
      tokens,
      chainTotal: Number(chainTotal.toFixed(2)),
    };

    grandTotal += chainTotal;
  }

  return { balancesPayload, grandTotal };
}
