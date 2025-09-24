// src/components/Background.jsx
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";

/**
 * Fetch a small set of coin images from CoinGecko and animate them.
 * This avoids broken icons from third-party CDNs.
 */

const COINS = [
  "bitcoin","ethereum","binancecoin","matic-network","solana",
  "tether","usd-coin","dai","arbitrum","optimism","dogecoin","shiba-inu"
];

function rand(min, max) { return Math.random() * (max - min) + min; }

export default function Background() {
  const [icons, setIcons] = useState([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${COINS.join(",")}&order=market_cap_desc&per_page=100&page=1&sparkline=false`);
        const data = await res.json();
        if (!mounted || !Array.isArray(data)) return;

        // Create up to 10 animated tokens with random positions/durations
        const items = (data.slice(0, 10)).map((d, i) => ({
          src: d.image,
          left: `${rand(5, 95).toFixed(2)}%`,
          top: `${rand(5, 90).toFixed(2)}%`,
          size: Math.round(rand(36, 92)),
          delay: rand(0, 5),
          duration: Math.round(rand(8, 20))
        }));
        setIcons(items);
      } catch (err) {
        console.warn("Background icons load failed:", err);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none">
      {/* brighter but soft gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-sky-100 via-emerald-100 to-teal-50" />

      {/* subtle pattern overlay */}
      <svg className="absolute inset-0 w-full h-full opacity-6" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="120" height="120" patternUnits="userSpaceOnUse">
            <path d="M120 0H0V120" fill="none" stroke="#ffffff" strokeWidth="0.2" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* floating icons */}
      {icons.map((ic, i) => (
        <motion.img
          key={i}
          src={ic.src}
          alt={`icon-${i}`}
          className="absolute"
          style={{
            width: ic.size,
            height: ic.size,
            left: ic.left,
            top: ic.top,
            transform: "translate(-50%, -50%)",
            opacity: 0.18,
            filter: "drop-shadow(0 6px 24px rgba(0,0,0,0.06))"
          }}
          initial={{ y: 0 }}
          animate={{ y: [0, rand(8, 28), 0] }}
          transition={{ duration: ic.duration, repeat: Infinity, repeatType: "loop", ease: "easeInOut", delay: ic.delay }}
        />
      ))}

      {/* soft vignette */}
      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 120px rgba(0,0,0,0.06)" }} />
    </div>
  );
}
