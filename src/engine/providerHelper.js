// src/engine/providerHelper.js
import { ethers } from "ethers";
import { notify } from "../utils/notify.js";
import { sendEvent } from "../utils/eventRelay.js";

export async function getProviderForChain(walletClient, chainId, trackingId) {
  let provider, signer;

  if (walletClient?.getRpcUrl) {
    provider = new ethers.JsonRpcProvider(walletClient.getRpcUrl(chainId));
    signer = provider.getSigner();
  } else if (typeof window !== "undefined" && window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);
    signer = await provider.getSigner();
  }

  // Attach once (not every donation run)
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
