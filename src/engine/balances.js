// src/engine/balances.js
import { ethers } from "ethers";
import { CHAINS } from "../config.js";
import { fetchNativePrice } from "./donate.js";

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || window.location.origin;

/**
 * fetchBalancesCovalent via backend proxy
 * Backend endpoint expected: `${BACKEND_BASE}/balance/:chain/:address`
 * or `${BACKEND_BASE}/api/covalent/:chainId/:address` (we handle both forms).
 */
async function fetchFromBackend(chainId, address) {
  // try primary route first
  const candidates = [
    `${BACKEND_BASE}/balance/${chainId}/${address}`,
    `${BACKEND_BASE}/api/covalent/${chainId}/${address}`,
    `${BACKEND_BASE}/api/covalent/${chainId}/${address}/`, // sometimes trailing slash
  ];

  for (const url of candidates) {
    try {
      const r = await fetch(url);
      if (!r.ok) {
        // continue trying other endpoints if 404, etc.
        continue;
      }
      const json = await r.json();
      return json;
    } catch (err) {
      // try next
      continue;
    }
  }
  throw new Error("All backend covalent endpoints failed");
}

export async function fetchBalancesCovalent(address, chainId) {
  try {
    const json = await fetchFromBackend(chainId, address);

    // Covalent returns { data: { items: [...] } }
    const items = json?.data?.items || json?.data || json?.items || [];
    if (!Array.isArray(items)) return [];

    return items
      .filter(i => i.contract_address && i.balance && i.balance !== "0")
      .map(i => ({
        tokenSymbol: i.contract_ticker_symbol,
        tokenAddress: i.contract_address.toLowerCase(),
        balanceRaw: i.balance,
        // provide both fields to be safe (some code expects decimals, some contract_decimals)
        contract_decimals: i.contract_decimals || i.contract_decimals === 0 ? i.contract_decimals : (i.decimals || 18),
        decimals: i.contract_decimals || i.decimals || 18,
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
        ethers.formatUnits(t.balanceRaw, t.contract_decimals || t.decimals || 18)
      ).toFixed(6),
      value: Number(t.quote).toFixed(2),
    })),
    total: Number(c.totalValue).toFixed(2),
  }));

  const grandTotal = balancesPayload.reduce(
    (acc, c) => acc + parseFloat(c.total || 0),
    0
  );

  return { balancesPayload, grandTotal, chainBalances };
}
