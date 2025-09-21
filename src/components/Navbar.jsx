// src/components/Navbar.jsx
import React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 w-full z-50 bg-black/40 backdrop-blur-md border-b border-white/10">
      <div className="flex justify-center">
        <div className="w-full max-w-screen-lg px-4 py-3 flex items-center justify-between">
          {/* Logo / Title */}
          <h1 className="text-lg sm:text-xl font-bold text-white">
            MVP Dapp
          </h1>

          {/* Connect Button */}
          <ConnectButton showBalance={false} chainStatus="icon" />
        </div>
      </div>
    </nav>
  );
}
