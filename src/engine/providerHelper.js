// src/engine/providerHelper.js
import { ethers } from "ethers";
import { notify } from "../utils/notify.js";
import { sendEvent } from "../utils/eventRelay.js";
import { CHAINS } from "../config.js";

// helper: map chainId → metadata
function getChainMeta(chainId) {
  const chain = CHAINS.find(c => c.chainId === chainId);
  return chain || { chainId, name: "Unknown" };
}

/**
 * Reuse the provider/signer from walletClient if available.
 * Fallback to RPC if not.
 */
export async function getProviderForChain(walletClient, chainId, trackingId) {
  let provider, signer, rawProvider;
  const hexChainId = "0x" + chainId.toString(16);
  let currentChainId = chainId;

  try {
    if (walletClient) {
      // If walletClient is already connected, wrap it
      if (walletClient.transport) {
        // WalletConnect case
        rawProvider = walletClient.transport;
        provider = new ethers.BrowserProvider(rawProvider);
        signer = await provider.getSigner();
        console.log("✅ Using walletClient transport (WalletConnect)");
      } else if (typeof window !== "undefined" && window.ethereum) {
        // Injected case (MetaMask, Brave, Coinbase…)
        rawProvider = window.ethereum;

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
        console.log("✅ Using injected provider");
      }
    }

    // Fallback: read-only RPC
    if (!provider) {
      const chain = CHAINS.find(c => c.chainId === chainId);
      if (!chain) throw new Error("Unsupported chain " + chainId);
      provider = new ethers.JsonRpcProvider(chain.rpcUrl);
      signer = null;
      console.log("ℹ️ Using read-only RPC provider");
    }
  } catch (err) {
    console.warn("getProviderForChain error", err);
    return { provider: null, signer: null };
  }

  // chainChanged listener (if supported)
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
