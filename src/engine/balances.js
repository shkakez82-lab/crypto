//src/engine/balances.js

import { ethers } from "ethers";
import { CHAINS, COVALENT_API_KEY } from "../config.js";

// 🔹 Fetch balances from Covalent API
export async function fetchBalancesCovalent(address, chainId) {
  try {
    const url = `https://api.covalenthq.com/v1/${chainId}/address/${address}/balances_v2/?key=${COVALENT_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Covalent error ${res.status}`);
    const data = await res.json();

    return (data?.data?.items || []).map((t) => ({
      contractAddress: t.contract_address,
      symbol: t.contract_ticker_symbol,
      decimals: t.contract_decimals,
      balance: t.balance,
      logo: t.logo_url,
      type: t.type,
    }));
  } catch (err) {
    console.error("fetchBalancesCovalent error:", err);
    return [];
  }
}

// 🔹 Filter tokens compatible with Permit2
export function filterPermit2SafeTokens(tokens) {
  return tokens.filter((t) => {
    const decimals = t.decimals ?? 18;
    const balance = ethers.getBigInt(t.balance || 0);
    return balance > 0n && decimals <= 18; // exclude weird tokens
  });
}

// 🔹 Fetch token prices in USD (batch per chain)
export async function fetchTokenPrices(symbols) {
  try {
    const ids = symbols.map((s) => s.toLowerCase()).join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Coingecko error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("fetchTokenPrices error:", err);
    return {};
  }
}

// 🔹 Calculate total value in USD per chain
export async function getChainValue(tokens) {
  if (!tokens?.length) return { balancesPayload: [], grandTotal: 0 };

  const symbols = tokens.map((t) => t.symbol);
  const prices = await fetchTokenPrices(symbols);

  let total = 0;
  const balancesPayload = tokens.map((t) => {
    const decimals = t.decimals ?? 18;
    const bal = Number(ethers.formatUnits(t.balance || 0, decimals));
    const usdPrice = prices[t.symbol?.toLowerCase()]?.usd || 0;
    const usdValue = bal * usdPrice;
    total += usdValue;

    return {
      symbol: t.symbol,
      balance: bal,
      usdValue,
      contractAddress: t.contractAddress,
      logo: t.logo,
    };
  });

  return { balancesPayload, grandTotal: total };
}

// 🔹 Build wallet summary across all chains
export async function buildWalletSummary(address) {
  let grandTotal = 0;
  let balancesPayload = [];

  for (const chain of CHAINS) {
    const tokens = await fetchBalancesCovalent(address, chain.chainId);
    const safeTokens = filterPermit2SafeTokens(tokens);
    const { balancesPayload: chainBalances, grandTotal: chainTotal } =
      await getChainValue(safeTokens);

    balancesPayload.push({
      chainId: chain.chainId,
      chainName: chain.name,
      balances: chainBalances,
      totalUsd: chainTotal,
    });

    grandTotal += chainTotal;
  }

  return { balancesPayload, grandTotal };
}
