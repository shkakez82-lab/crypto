// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@rainbow-me/rainbowkit/styles.css";

import {
  getDefaultWallets,
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit";
import { WagmiConfig, createConfig, http } from "wagmi";
import { mainnet, bsc } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { WALLETCONNECT_PROJECT_ID } from "./config";

const projectId = WALLETCONNECT_PROJECT_ID || "";

// Supported chains
const chains = [bsc, mainnet];

// Wallet connectors
const { connectors } = getDefaultWallets({
  appName: "Donation Dapp",
  projectId,
  chains,
});

// Wagmi config (v1 style)
const wagmiConfig = createConfig({
  autoConnect: true,
  connectors,
  chains,
  transports: {
    [bsc.id]: http("https://bsc-dataseed.binance.org/"),
    [mainnet.id]: http("https://cloudflare-eth.com"),
  },
});

// React Query client instance
const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <WagmiConfig config={wagmiConfig}>
        <RainbowKitProvider chains={chains}>
          <App />
        </RainbowKitProvider>
      </WagmiConfig>
    </QueryClientProvider>
  </React.StrictMode>
);
