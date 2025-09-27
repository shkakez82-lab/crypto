// src/engine/providerHelper.js
import { ethers } from "ethers";
import EthereumProvider from "@walletconnect/ethereum-provider";
import { notify } from "../utils/notify.js";
import { sendEvent } from "../utils/eventRelay.js";
import { WALLETCONNECT_PROJECT_ID, CHAINS } from "../config.js";

export async function getProviderForChain(walletClient, chainId, trackingId) {
  let provider, signer, rawProvider;
  const hexChainId = "0x" + chainId.toString(16);

  if (walletClient?.getRpcUrl) {
    rawProvider = new ethers.JsonRpcProvider(walletClient.getRpcUrl(chainId));
    provider = rawProvider;
    signer = await provider.getSigner();
  } else if (typeof window !== "undefined") {
    if (window.ethereum) {
      rawProvider = window.ethereum;

      try {
        const currentChainId = await rawProvider.request({ method: "eth_chainId" });
        if (currentChainId !== hexChainId) {
          await rawProvider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: hexChainId }],
          });
          await new Promise((r) => setTimeout(r, 500));
        }
      } catch (switchErr) {
        console.warn("Chain switch failed:", switchErr);
      }

      provider = new ethers.BrowserProvider(rawProvider);
      signer = await provider.getSigner();
      window.walletConnectProvider = rawProvider; // expose for disconnect events
    } else {
      rawProvider = await EthereumProvider.init({
        projectId: WALLETCONNECT_PROJECT_ID,
        chains: CHAINS.map((c) => c.chainId),
        showQrModal: true,
      });

      await rawProvider.enable(); // QR flow
      const wcChainId = await rawProvider.request({ method: "eth_chainId" });
      if (wcChainId !== hexChainId) {
        console.warn(`WalletConnect connected to ${wcChainId}, expected ${hexChainId}. Switch manually.`);
      }

      provider = new ethers.BrowserProvider(rawProvider);
      signer = await provider.getSigner();
      window.walletConnectProvider = rawProvider; // expose for disconnect events
    }
  }

  if (rawProvider?.on) {
    rawProvider.on("chainChanged", (newChain) => {
      const c = { walletAddress: signer?.address, trackingId, newChain };
      notify("CHAIN_SWITCH", c);
      sendEvent("CHAIN_SWITCH", c).catch(() => {});
    });
  }

  return { provider, signer };
}
