
// src/engine/balances.js
import { ethers } from "ethers";
import { COVALENT_API_KEY, CHAINS } from "../config.js";
import { fetchNativePrice } from "./donate.js";


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

/*balance logic*/
export async function buildWalletSummary(address) {
  const chainBalances = [];
    for (const chain of CHAINS) {
      const raw = await fetchBalancesCovalent(address, chain.chainId);
      const filtered = filterPermit2SafeTokens(raw);

      const rpcProvider = new ethers.JsonRpcProvider(chain.rpcUrl);
      const nativeRaw = await rpcProvider.getBalance(address);
      const nativeFormatted = parseFloat(ethers.formatEther(nativeRaw));
      const nativePrice = await fetchNativePrice(chain.nativeSymbol);
      const nativeUSD = nativeFormatted * nativePrice;

      chainBalances.push({
        chainId: chain.chainId,
        name: chain.name,
        native: nativeFormatted,
        nativeUSD,
        tokens: filtered,
        totalValue: getChainValue(filtered) + nativeUSD,
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

  return { balancesPayload, grandTotal };
}
