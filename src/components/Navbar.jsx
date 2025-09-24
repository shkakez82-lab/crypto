// src/components/Navbar.jsx
import React from "react";
import GuideModal from "./GuideModal";

export default function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/70 backdrop-blur-md border-b border-white/10">
      <div className="max-w-screen-lg mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-teal-400 flex items-center justify-center text-white font-bold">
            A
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">MVP Donation</div>
            <div className="text-xs text-slate-600">Multi-chain sweep</div>
          </div>
        </div>

        {/* How it works / guide moved here (top-right) */}
        <div>
          <GuideModal />
        </div>
      </div>
    </nav>
  );
}
