import React from "react";

export default function Footer() {
  return (
    <footer className="bg-black/70 text-white py-4 mt-12 text-center">
      <p>© {new Date().getFullYear()} MVP Donation Dapp – Built by APEX</p>
    </footer>
  );
}
