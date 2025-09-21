// src/components/PriceTicker.jsx
import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const COINGECKO_IDS = [
  "bitcoin","ethereum","binancecoin","matic-network","solana",
  "tether","usd-coin","dai","arbitrum","optimism","dogecoin","shiba-inu"
];

export default function PriceTicker() {
  const [coins, setCoins] = useState([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    let mounted = true;
    async function fetchMarkets() {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COINGECKO_IDS.join(",")}&order=market_cap_desc&per_page=100&page=1&sparkline=false&price_change_percentage=24h`
        );
        const data = await res.json();
        if (!mounted) return;
        setCoins(data);
      } catch (err) {
        console.error("Ticker fetch failed", err);
      }
    }
    fetchMarkets();
    const iv = setInterval(fetchMarkets, 30000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  // rotate index every 3s
  useEffect(() => {
    const iv = setInterval(() => setIndex(i => (i + 1) % Math.max(1, coins.length)), 3000);
    return () => clearInterval(iv);
  }, [coins.length]);

  if (!coins.length) return <div className="py-2 text-xs text-center text-gray-300">Loading prices…</div>;

  const item = coins[index];

  return (
    <div className="w-full bg-black/65 text-white py-2 border-t border-b border-white/5">
      <div className="max-w-screen-lg mx-auto px-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
            className="flex items-center justify-center gap-4"
          >
            <img src={item.image} alt={item.symbol} className="w-6 h-6 rounded-full" />
            <div className="flex items-baseline gap-2">
              <div className="text-sm font-medium">{item.name}</div>
              <div className="text-sm text-gray-300">${item.current_price?.toLocaleString()}</div>
              <div className={`text-sm font-semibold ${item.price_change_percentage_24h >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {item.price_change_percentage_24h?.toFixed(2)}%
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
