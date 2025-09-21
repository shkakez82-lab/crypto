import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export default function Notifications({ notifications }) {
  return (
    <div className="fixed bottom-4 right-4 space-y-3 z-50">
      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="px-4 py-2 rounded-lg shadow-md bg-gray-900 text-white text-sm"
          >
            {n.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
