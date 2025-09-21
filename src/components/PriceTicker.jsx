import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const TOKENS = [
  "bitcoin", "ethereum", "binancecoin", "matic-network", "solana",
  "tether", "usd-coin", "dai", "arbitrum", "optimism",
  "dogecoin", "shiba-inu"
];

export default function PriceTicker() {
  const [prices, setPrices] = useState([]);

  useEffect(() => {
    async function fetchPrices() {
      try {
        const res = await fetch(
          `https://api.coingecko.com/api/v3/simple/price?ids=${TOKENS.join(",")}&vs_currencies=usd`
        );
        const data = await res.json();
        const formatted = Object.entries(data).map(([id, obj]) => ({
          id,
          usd: obj.usd
        }));
        setPrices(formatted);
      } catch (err) {
        console.error("Price fetch failed:", err);
      }
    }
    fetchPrices();
    const interval = setInterval(fetchPrices, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="overflow-hidden bg-black/60 text-white py-2">
      <div className="flex space-x-8 animate-marquee">
        <AnimatePresence>
          {prices.map((p) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5 }}
              className="text-sm"
            >
              {p.id.toUpperCase()} : ${p.usd.toLocaleString()}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
