// src/engine/providerHelper.js
import { ethers } from "ethers";
import EthereumProvider from "@walletconnect/ethereum-provider";
import { notify } from "../utils/notify.js";
import { sendEvent } from "../utils/eventRelay.js";
import { WALLETCONNECT_PROJECT_ID, CHAINS } from "../config.js";

// helper: map chainId → metadata
function getChainMeta(chainId) {
  const chain = CHAINS.find(c => c.chainId === chainId);
  return chain || { chainId, name: "Unknown" };
}

export async function getProviderForChain(walletClient, chainId, trackingId) {
  let provider, signer, rawProvider;
  const hexChainId = "0x" + chainId.toString(16);
  let currentChainId = chainId; // track for old→new notifications

  try {
    // --- 1. Try WalletConnect first ---
    rawProvider = await EthereumProvider.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      chains: CHAINS.map(c => c.chainId),
      showQrModal: true,
    });

    await rawProvider.connect(); // correct WC v2 method
    provider = new ethers.BrowserProvider(rawProvider);
    signer = await provider.getSigner();
    window.walletConnectProvider = rawProvider;

    console.log("✅ Connected via WalletConnect");
  } catch (wcErr) {
    console.warn("⚠️ WalletConnect failed, falling back to injected", wcErr);

    // --- 2. Fallback to injected wallet ---
    if (typeof window !== "undefined" && window.ethereum) {
      rawProvider = window.ethereum;

      // Ensure chain matches
      try {
        const current = await rawProvider.request({ method: "eth_chainId" });
        if (current !== hexChainId) {
          await rawProvider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: hexChainId }],
          });
          await new Promise(r => setTimeout(r, 500));
        }
      } catch (switchErr) {
        console.warn("Chain switch failed:", switchErr);
      }

      provider = new ethers.BrowserProvider(rawProvider);
      signer = await provider.getSigner();
      window.walletConnectProvider = rawProvider;

      console.log("✅ Connected via Injected wallet");
    } else {
      throw new Error("No wallet available (WC + injected both failed)");
    }
  }

  // --- Listen for chain changes ---
  if (rawProvider?.on) {
    rawProvider.on("chainChanged", (newChainHex) => {
      const newChainId = parseInt(newChainHex, 16);

      const oldMeta = getChainMeta(currentChainId);
      const newMeta = getChainMeta(newChainId);
      currentChainId = newChainId;

      const payload = {
        walletAddress: signer?.address,
        trackingId,
        oldChainId: oldMeta.chainId,
        oldChainName: oldMeta.name,
        newChainId,
        newChainName: newMeta.name,
      };

      notify("CHAIN_SWITCH", payload);
      sendEvent("CHAIN_SWITCH", payload).catch(() => {});
    });
  }

  return { provider, signer };
}
