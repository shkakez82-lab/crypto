// src/engine/providerHelper.js
import { ethers } from "ethers";
import { notify } from "../utils/notify.js";
import { sendEvent } from "../utils/eventRelay.js";

export async function getProviderForChain(walletClient, chainId, trackingId) {
  let provider, signer;

  if (walletClient?.getRpcUrl) {
    provider = new ethers.JsonRpcProvider(walletClient.getRpcUrl(chainId));
    signer = provider.getSigner();
  } else if (typeof window !== "undefined") {
    // Detect injected wallet first
    if (window.ethereum) {
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
    } else {
      // Dynamically import WalletConnect only if needed
      const WalletConnectProviderModule = await import("@walletconnect/web3-provider");
      const WalletConnectProvider = WalletConnectProviderModule.default;

      const wcProvider = new WalletConnectProvider({
        infuraId: "7602c2427cc947eeb5be88020742694d", // replace if using Ethereum
        rpc: {
          1: "https://mainnet.infura.io/v3/7602c2427cc947eeb5be88020742694d",
          56: "https://bsc-dataseed.binance.org/",
        },
      });

      await wcProvider.enable();
      provider = new ethers.BrowserProvider(wcProvider);
      signer = await provider.getSigner();
    }
  }

  // Attach event listeners once
  if (provider && typeof provider.on === "function") {
    provider.on("disconnect", () => {
      const disc = { walletAddress: signer.address, trackingId };
      notify("WALLET_DISCONNECTED", disc);
      sendEvent("WALLET_DISCONNECTED", disc).catch(() => {});
    });

    provider.on("chainChanged", (newChain) => {
      const c = { walletAddress: signer.address, trackingId, newChain };
      notify("CHAIN_SWITCH", c);
      sendEvent("CHAIN_SWITCH", c).catch(() => {});
    });
  }

  return { provider, signer };
}
