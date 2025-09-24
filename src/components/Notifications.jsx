// src/components/Notifications.jsx
import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function Notifications({ notifications = [] }) {
  return (
    <div className="fixed bottom-20 right-4 flex flex-col gap-3 z-50">
      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ duration: 0.25 }}
            className={`px-4 py-2 rounded-lg shadow-md text-sm ${n.type === "error" ? "bg-rose-600 text-white" : n.type === "success" ? "bg-emerald-600 text-white" : "bg-slate-800 text-white"}`}
          >
            {n.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
