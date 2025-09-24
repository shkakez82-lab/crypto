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
        <div className="fixed inset-0 z-50 bg-black/60">
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
            className="absolute left-1/2 top-[70px] -translate-x-1/2 bg-white rounded-2xl p-6 w-[90%] max-w-md shadow-lg"
          >
            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              aria-label="Close guide"
              className="absolute top-3 right-3 text-slate-600 hover:text-slate-800 text-xl leading-none"
            >
              ×
            </button>

            <h2 className="text-xl font-bold mb-4 text-slate-900 text-center">
              How to Donate
            </h2>

            <div className="space-y-3 text-slate-700">
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="min-w-[28px] h-6 flex items-center justify-center rounded-md bg-slate-100 text-slate-800 font-semibold">
                    {i + 1}
                  </div>
                  <div className="text-sm">{s}</div>
                </div>
              ))}
              <div className="mt-4 text-xs text-slate-500 text-center">
                Tip: If you don't see your wallet on mobile, try connecting via WalletConnect from the Connect modal.
              </div>
            </div>

            <div className="mt-6 flex items-center justify-center">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-sm rounded-md bg-slate-800 text-white hover:bg-slate-900 transition"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
