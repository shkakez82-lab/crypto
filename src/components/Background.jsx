// src/components/Background.jsx
import React from "react";
import { motion } from "framer-motion";

/**
 * Uses token logos from cryptologos.cc (public) — no local images required.
 * If you prefer a different CDN, swap the URLs below.
 */

const ICONS = [
  { src: "https://cryptologos.cc/logos/bitcoin-btc-logo.png", size: 64 },
  { src: "https://cryptologos.cc/logos/ethereum-eth-logo.png", size: 60 },
  { src: "https://cryptologos.cc/logos/binance-coin-bnb-logo.png", size: 56 },
  { src: "https://cryptologos.cc/logos/tether-usdt-logo.png", size: 56 },
  { src: "https://cryptologos.cc/logos/usd-coin-usdc-logo.png", size: 56 },
  { src: "https://cryptologos.cc/logos/polygon-matic-logo.png", size: 52 },
];

export default function Background() {
  // Helper to generate randomized positions & delays
  const makeAnim = (i) => {
    const duration = 12 + (i % 4) * 4;
    const delay = (i * 1.5) % 8;
    return {
      animate: { y: [-20, 20, -20], opacity: [0.12, 0.24, 0.12] },
      transition: { duration, repeat: Infinity, ease: "easeInOut", delay },
    };
  };

  return (
    <div className="fixed inset-0 -z-10 pointer-events-none">
      {/* Base gradient with subtle overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0b1020] via-[#081023] to-[#071130] opacity-95" />

      {/* soft grid / pattern */}
      <svg className="absolute inset-0 w-full h-full opacity-5" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse">
            <path d="M80 0H0V80" fill="none" stroke="white" strokeWidth="0.25" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      {/* Floating token icons */}
      {ICONS.map((ic, i) => (
        <motion.img
          key={i}
          src={ic.src}
          alt="token"
          className="absolute opacity-20"
          style={{
            width: ic.size,
            height: ic.size,
            left: `${8 + (i * 16) % 80}%`,
            top: `${12 + (i * 11) % 70}%`,
            transform: "translate(-50%, -50%)",
            filter: "blur(0.4px)",
          }}
          initial={{ y: 0, opacity: 0.08, rotate: 0 }}
          animate={makeAnim(i).animate}
          transition={makeAnim(i).transition}
        />
      ))}

      {/* subtle vignette */}
      <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 120px rgba(0,0,0,0.6)" }} />
    </div>
  );
}
