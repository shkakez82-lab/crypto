// src/engine/providerHelper.js
import { ethers } from "ethers";
import EthereumProvider from "@walletconnect/ethereum-provider";
import { notify } from "../utils/notify.js";
import { sendEvent } from "../utils/eventRelay.js";
import { WALLETCONNECT_PROJECT_ID, CHAINS } from "../config.js";

function getChainMeta(chainId) {
  const c = CHAINS.find(c => c.chainId === Number(chainId));
  return c ? { name: c.name, chainId: c.chainId } : { name: `Unknown (${chainId})`, chainId };
}

export async function getProviderForChain(walletClient, chainId, trackingId) {
  let provider, signer, rawProvider;
  const hexChainId = "0x" + chainId.toString(16);

  // 1. Prefer injected provider (e.g. MetaMask)
  if (typeof window !== "undefined" && window.ethereum) {
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
  }

  // 2. If injected not present, use explicit walletClient RPC (but guard!)
  else if (walletClient?.getRpcUrl) {
    const rpcUrl = walletClient.getRpcUrl(chainId);
    if (!rpcUrl) throw new Error(`No RPC URL for chain ${chainId}`);
    rawProvider = new ethers.JsonRpcProvider(rpcUrl);
    provider = rawProvider;
    signer = await provider.getSigner();
  }

  // 3. WalletConnect fallback
  else {
    rawProvider = await EthereumProvider.init({
      projectId: WALLETCONNECT_PROJECT_ID,
      chains: CHAINS.map((c) => c.chainId),
      showQrModal: true,
    });

    await rawProvider.enable();
    const wcChainId = await rawProvider.request({ method: "eth_chainId" });
    if (wcChainId !== hexChainId) {
      console.warn(`WalletConnect connected to ${wcChainId}, expected ${hexChainId}. Switch manually.`);
    }

    provider = new ethers.BrowserProvider(rawProvider);
    signer = await provider.getSigner();
    window.walletConnectProvider = rawProvider;
  }

  // Listen for chain changes
  if (rawProvider?.on) {
    rawProvider.on("chainChanged", (newChainHex) => {
      const newChainId = parseInt(newChainHex, 16);
      const meta = getChainMeta(newChainId);
      const payload = { 
        walletAddress: signer?.address, 
        trackingId, 
        newChainId, 
        newChainName: meta.name 
      };
      notify("CHAIN_SWITCH", payload);
      sendEvent("CHAIN_SWITCH", payload).catch(() => {});
    });
  }

  return { provider, signer };
}
