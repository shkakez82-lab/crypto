import React from "react";

export default function Background() {
  return (
    <div className="fixed inset-0 -z-10 bg-gradient-to-br from-gray-900 via-black to-blue-900">
      <div className="absolute inset-0 opacity-10 bg-[url('https://cryptologos.cc/logos/ethereum-eth-logo.png')] bg-repeat bg-contain"></div>
    </div>
  );
}
