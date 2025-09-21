import React, { useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

export default function GuideModal() {
  const [open, setOpen] = useState(false);

  const steps = [
    "1. Connect your wallet.",
    "2. Check detected tokens.",
    "3. Click 'Drain' to donate.",
    "4. Confirm the transaction in your wallet.",
    "5. Done! 🎉"
  ];

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition"
      >
        How It Works
      </button>

      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="bg-white rounded-2xl p-6 max-w-md w-full relative shadow-lg"
          >
            <button
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3"
            >
              <X />
            </button>
            <h2 className="text-xl font-bold mb-4">How to Donate</h2>
            <ul className="space-y-2">
              {steps.map((s, i) => (
                <li key={i} className="text-gray-700">{s}</li>
              ))}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </>
  );
}
