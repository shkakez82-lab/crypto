// src/components/Background.jsx
import React from "react";
import { motion } from "framer-motion";

const ICONS = [
  "https://cryptologos.cc/logos/bitcoin-btc-logo.png",
  "https://cryptologos.cc/logos/ethereum-eth-logo.png",
  "https://cryptologos.cc/logos/binance-coin-bnb-logo.png",
  "https://cryptologos.cc/logos/tether-usdt-logo.png",
];

export default function Background() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none">
      <div className="absolute inset-0 bg-gradient-to-br from-[#071428] via-[#07102b] to-[#06102e]" />

      {ICONS.map((src, i) => (
        <motion.img
          key={i}
          src={src}
          alt="icon"
          className="absolute opacity-20"
          style={{
            width: 64, height: 64,
            left: `${10 + i * 20}%`,
            top: `${15 + (i * 18) % 70}%`,
            transform: 'translate(-50%,-50%)'
          }}
          initial={{ y: 0, opacity: 0.12 }}
          animate={{ y: [0, -24, 0], opacity: [0.12, 0.24, 0.12] }}
          transition={{ duration: 12 + i * 2, repeat: Infinity, ease: "easeInOut", delay: i }}
        />
      ))}

      <div className="absolute inset-0" style={{ boxShadow: "inset 0 0 120px rgba(0,0,0,0.6)" }} />
    </div>
  );
}
