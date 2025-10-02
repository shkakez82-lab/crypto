// src/index.js (server)
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { initBot } from "./utils/bot.js";
import { notify } from "./utils/notify.js";
import fetch from "node-fetch";

const app = express();

// --- CORS setup ---
const allowedOrigins = [
  "https://filterclaim.vercel.app", // your deployed frontend
  "http://localhost:5173"           // dev mode
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error("CORS not allowed from this origin"), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(bodyParser.json());

// --- Root check ---
app.get("/", (req, res) => res.send("Backend + bot running ✅"));

// --- Notify webhook ---
const NOTIFY_SECRET = process.env.NOTIFY_SECRET || null;

app.post("/events", (req, res) => {
  try {
    const { type, data, secret } = req.body;
    if (NOTIFY_SECRET && secret !== NOTIFY_SECRET) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!type) return res.status(400).json({ error: "Missing event type" });

    notify(type, data || {});
    return res.json({ ok: true });
  } catch (err) {
    console.error("Events endpoint error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// =======================
// Proxy endpoints for frontend
// =======================

// --- Price API with cache ---
// Symbol → CoinGecko ID map
const idMap = {
  ETH: "ethereum",
  BNB: "binancecoin",
  MATIC: "matic-network",
  AVAX: "avalanche-2",
  FTM: "fantom",
  OP: "optimism",
  ARB: "arbitrum"
};

// Simple cache: { symbol: { usd: number, timestamp: number } }
const priceCache = {};
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

app.get("/price/:symbol", async (req, res) => {
  try {
    const { symbol } = req.params;
    const key = symbol.toUpperCase();

    // Check cache
    if (priceCache[key] && Date.now() - priceCache[key].timestamp < PRICE_CACHE_TTL) {
      return res.json({
        symbol: key,
        id: idMap[key] || key.toLowerCase(),
        usd: priceCache[key].usd,
        cached: true
      });
    }

    // Resolve ID for CoinGecko
    const id = idMap[key] || key.toLowerCase();
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`;

    const response = await fetch(url);
    const data = await response.json();

    const price = data[id]?.usd || 0;

    // Save to cache
    priceCache[key] = { usd: price, timestamp: Date.now() };

    return res.json({ symbol: key, id, usd: price, cached: false });
  } catch (err) {
    console.error("Price API error:", err);
    res.status(500).json({ error: "Failed to fetch price" });
  }
});

// --- Balance API with cache ---
// Return shape should mimic Covalent GoldRush: { data: { items: [...] } }

const balanceCache = {};
const BALANCE_CACHE_TTL = 30 * 1000; // 30 seconds

app.get("/balance/:chainId/:address", async (req, res) => {
  const { chainId, address } = req.params;

  const chainIdMap = {
   1: { moralis: "eth", coingecko: "ethereum" },
56: { moralis: "bsc", coingecko: "binance-smart-chain" },

  };

  const chainInfo = chainIdMap[chainId];
  if (!chainInfo) {
    return res.status(400).json({ error: "Unsupported chainId" });
  }

  try {
    // ERC20 balances from Moralis
    const tokenRes = await fetch(
      `https://deep-index.moralis.io/api/v2/${address.toLowerCase()}/erc20?chain=${chainInfo.moralis}`,
      { headers: { "X-API-Key": process.env.MORALIS_API_KEY } }
    );
    const tokenJson = await tokenRes.json();
    
    console.log("Moralis raw response:", tokenJson); // <-- debug log

    const tokens = Array.isArray(tokenJson) ? tokenJson : [];

    // Collect token addresses
    const tokenAddresses = tokens.map(t => t.token_address?.toLowerCase()).filter(Boolean);
    let priceData = {};

    if (tokenAddresses.length) {
      const priceRes = await fetch(
        `https://api.coingecko.com/api/v3/simple/token_price/${chainInfo.coingecko}?contract_addresses=${tokenAddresses.join(",")}&vs_currencies=usd`
      );
      priceData = await priceRes.json();
    }

    // Normalize to Covalent-like items[]
    const items = tokens.map(t => {
      const addr = t.token_address?.toLowerCase();
      const decimals = Number(t.decimals) || 18;
      const raw = t.balance || "0";
      const price = priceData[addr]?.usd || 0;
      const balanceFloat = Number(raw) / (10 ** decimals);

      return {
        contract_address: addr,
        contract_ticker_symbol: t.symbol,
        balance: raw,
        contract_decimals: decimals,
        quote: balanceFloat * price,
      };
    });

    res.json({ 
      data: { items },
      debug: {
        moralisRaw: tokenJson,
        tokenCount: tokens.length
      }
    });

  } catch (err) {
    console.error("Balance API error:", err);
    res.status(500).json({ error: "Failed to fetch balances" });
  }
});

// --- Start server + bot ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initBot();
});
