// src/components/Footer.jsx
import React from "react";

export default function Footer() {
  return (
    <footer className="fixed bottom-0 left-0 w-full z-40 bg-white/80 backdrop-blur-md border-t border-white/10">
      <div className="max-w-screen-lg mx-auto px-4 py-3 text-center text-sm text-slate-700">
        © {new Date().getFullYear()} MVP Donation Dapp — Built by APEX
      </div>
    </footer>
  );
}
