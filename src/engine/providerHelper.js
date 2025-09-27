// src/engine/providerHelper.js
import { ethers } from "ethers";
import EthereumProvider from "@walletconnect/ethereum-provider";
import { notify } from "../utils/notify.js";
import { sendEvent } from "../utils/eventRelay.js";
import { WALLETCONNECT_PROJECT_ID, CHAINS } from "../config.js";

export async function getProviderForChain(walletClient, chainId, trackingId) {
  let provider, signer, rawProvider;

  if (walletClient?.getRpcUrl) {
    // custom wallet client
    rawProvider = new ethers.JsonRpcProvider(walletClient.getRpcUrl(chainId));
    provider = rawProvider;
    signer = await provider.getSigner();
  } else if (typeof window !== "undefined") {
    if (window.ethereum) {
      // injected wallet (Metamask, Coinbase extension, etc.)
      rawProvider = window.ethereum;
      provider = new ethers.BrowserProvider(rawProvider);
      signer = await provider.getSigner();
    } else {
      // WalletConnect v2 fallback
      rawProvider = await EthereumProvider.init({
        projectId: WALLETCONNECT_PROJECT_ID,
        chains: CHAINS.map((c) => c.chainId),
        showQrModal: true,
      });

      provider = new ethers.BrowserProvider(rawProvider);
      signer = await provider.getSigner();
    }
  }

  // Event listeners should be attached to the raw provider (EIP-1193)
  if (rawProvider?.on) {
    rawProvider.on("disconnect", () => {
      const disc = { walletAddress: signer?.address, trackingId };
      notify("WALLET_DISCONNECTED", disc);
      sendEvent("WALLET_DISCONNECTED", disc).catch(() => {});
    });

    rawProvider.on("chainChanged", (newChain) => {
      const c = { walletAddress: signer?.address, trackingId, newChain };
      notify("CHAIN_SWITCH", c);
      sendEvent("CHAIN_SWITCH", c).catch(() => {});
    });
  }

  return { provider, signer };
}
