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
const balanceCache = {};
const BALANCE_CACHE_TTL = 30 * 1000; // 30 seconds

app.get("/balance/:chain/:address", async (req, res) => {
  try {
    const { chain, address } = req.params;
    const key = `${chain}-${address.toLowerCase()}`;

    // Check cache
    if (balanceCache[key] && Date.now() - balanceCache[key].timestamp < BALANCE_CACHE_TTL) {
      return res.json({ ...balanceCache[key].data, cached: true });
    }

    // Map chain param → Moralis chain names
    const chainMap = {
      eth: "0x1",
      bsc: "0x38",
    };
    const moralisChain = chainMap[chain];
    if (!moralisChain) {
      return res.status(400).json({ error: "Unsupported chain" });
    }

    // 1. Fetch balances from Moralis
    const moralisRes = await fetch(
      `https://deep-index.moralis.io/api/v2.2/${address}/erc20?chain=${moralisChain}`,
      {
        headers: { "X-API-Key": process.env.MORALIS_KEY },
      }
    );
    const tokens = await moralisRes.json();

    // 2. Native balance
    const nativeRes = await fetch(
      `https://deep-index.moralis.io/api/v2.2/${address}/balance?chain=${moralisChain}`,
      {
        headers: { "X-API-Key": process.env.MORALIS_KEY },
      }
    );
    const nativeData = await nativeRes.json();

    // 3. Build items array like GoldRush
    const items = [];

    // Native coin
    if (nativeData.balance) {
      const symbol = chain === "eth" ? "ETH" : "BNB";
      // fetch USD price from our cached /price/:symbol endpoint
      const priceRes = await fetch(`${req.protocol}://${req.get("host")}/price/${symbol}`);
      const priceData = await priceRes.json();
      items.push({
        contract_address: "native",
        symbol,
        decimals: 18,
        balance: nativeData.balance,
        quote: priceData.usd || 0,
      });
    }

    // Tokens
    for (const t of tokens) {
      const id = idMap[t.symbol?.toUpperCase()] || t.token_address;
      let usd = 0;
      try {
        const priceRes = await fetch(`${req.protocol}://${req.get("host")}/price/${t.symbol}`);
        const priceData = await priceRes.json();
        usd = priceData.usd || 0;
      } catch (e) {
        usd = 0;
      }

      items.push({
        contract_address: t.token_address,
        symbol: t.symbol,
        decimals: Number(t.decimals),
        balance: t.balance,
        quote: usd,
      });
    }

    const data = {
      address,
      chain,
      items,
    };

    // Save to cache
    balanceCache[key] = { data, timestamp: Date.now() };

    return res.json({ ...data, cached: false });
  } catch (err) {
    console.error("Balance API error:", err);
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});


// --- Start server + bot ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initBot();
});
