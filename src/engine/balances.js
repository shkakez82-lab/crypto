// src/engine/balances.js
import { ethers } from "ethers";
import { CHAINS } from "../config.js";
import { fetchNativePrice } from "./donate.js";

const BACKEND_BASE = import.meta.env.VITE_BACKEND_URL || window.location.origin;
const MORALIS_API_KEY = process.env.MORALIS_API_KEY; // set in your env
const COINGECKO_API = "https://api.coingecko.com/api/v3/simple/token_price";

// --- DROP-IN REPLACEMENT FOR COVALENT ---
export async function fetchBalancesCovalent(address, chainId) {
  try {
    const chain = CHAINS.find(c => c.chainId === chainId);
    if (!chain) return [];

    // 1️⃣ Get token balances from Moralis
    const moralisUrl = `https://deep-index.moralis.io/api/v2/${address}/erc20?chain=${chain.name.toLowerCase()}`;
    const r = await fetch(moralisUrl, {
      headers: { "X-API-Key": MORALIS_API_KEY }
    });
    const tokens = await r.json();

    if (!Array.isArray(tokens)) return [];

    // 2️⃣ Fetch USD prices from CoinGecko (batch by contract)
    const tokenPrices = {};
    const contractAddresses = tokens.map(t => t.token_address).join(",");
    if (contractAddresses) {
      const priceResp = await fetch(
        `${COINGECKO_API}/${chain.coingeckoId}?contract_addresses=${contractAddresses}&vs_currencies=usd`
      );
      const priceJson = await priceResp.json();
      Object.assign(tokenPrices, priceJson);
    }

    // 3️⃣ Map into same structure as Covalent
    return tokens
      .filter(t => t.token_address && t.balance && t.balance !== "0")
      .map(t => {
        const price = tokenPrices[t.token_address.toLowerCase()]?.usd || 0;
        return {
          tokenSymbol: t.symbol,
          tokenAddress: t.token_address.toLowerCase(),
          balanceRaw: t.balance,
          decimals: t.decimals || 18,
          contract_decimals: t.decimals || 18,
          quote: price * (parseFloat(ethers.formatUnits(t.balance, t.decimals || 18)) || 0),
        };
      });
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
