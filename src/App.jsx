// src/App.jsx (temporary debug)
import React from "react";
import Navbar from "./components/Navbar";

export default function AppDebug() {
  return (
    <div className="min-h-screen bg-[#071428] text-white">
      <Navbar />

      {/* leave space for navbar */}
      <div className="pt-20 w-full">
        <div className="flex justify-center w-full px-4">
          <div className="w-full max-w-screen-lg border-2 border-dashed border-white/10 p-8">
            <h2 className="text-2xl font-bold text-center mb-4">CENTERING TEST</h2>
            <p className="text-center text-sm text-gray-300 mb-6">
              This test box should be perfectly centered on desktop and mobile.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 bg-white/5 rounded">Left box</div>
              <div className="p-4 bg-white/5 rounded">Right box</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
