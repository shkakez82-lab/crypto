// src/engine/providerHelper.js
import { ethers } from "ethers";
import { notify } from "../utils/notify.js";
import { sendEvent } from "../utils/eventRelay.js";
import { WALLETCONNECT_PROJECT_ID } from "../config.js";
import WalletConnectProvider from "@walletconnect/web3-provider";

// Unified provider/signer helper supporting injected + WalletConnect
export async function getProviderForChain(walletClient, chainId, trackingId) {
  let provider, signer;

  // WalletConnect integration
  if (walletClient?.type === "walletconnect") {
    const wcProvider = new WalletConnectProvider({
      projectId: WALLETCONNECT_PROJECT_ID,
      chainId,
      rpc: { [chainId]: walletClient.getRpcUrl(chainId) },
    });
    await wcProvider.enable();
    provider = new ethers.BrowserProvider(wcProvider);
    signer = await provider.getSigner();
  }
  // Injected provider (MetaMask, Brave, mobile in-app wallets)
  else if (typeof window !== "undefined" && window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
  }
  // Fallback JSON-RPC (for readonly or test)
  else if (walletClient?.getRpcUrl) {
    provider = new ethers.JsonRpcProvider(walletClient.getRpcUrl(chainId));
    signer = provider.getSigner();
  } else {
    throw new Error("No valid provider found for chain " + chainId);
  }

  // Attach global events (disconnect / chain change)
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
