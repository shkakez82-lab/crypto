import React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between px-6 py-4 bg-black/70 backdrop-blur-md shadow-md fixed w-full z-50">
      <h1 className="text-2xl font-bold text-white">MVP Donation</h1>
      <ConnectButton />
    </nav>
  );
}
