// src/engine/providerHelper.js
import { ethers } from "ethers";
import EthereumProvider from "@walletconnect/ethereum-provider";
import { notify } from "../utils/notify.js";
import { sendEvent } from "../utils/eventRelay.js";
import { WALLETCONNECT_PROJECT_ID, CHAINS } from "../config.js";

/**
 * Returns { provider, signer, walletType }
 * - walletType: "custom" | "injected" | "walletconnect"
 *
 * Note: trackingId is passed so events this helper emits can be correlated.
 */
export async function getProviderForChain(walletClient, chainId, trackingId) {
  let provider = null;
  let signer = null;
  let rawProvider = null;
  let walletType = "unknown";
  const hexChainId = "0x" + chainId.toString(16);

  if (walletClient?.getRpcUrl) {
    // custom RPC wallet client
    rawProvider = new ethers.JsonRpcProvider(walletClient.getRpcUrl(chainId));
    provider = rawProvider;
    signer = await provider.getSigner();
    walletType = "custom";
  } else if (typeof window !== "undefined") {
    if (window.ethereum) {
      // injected wallet (MetaMask, Coinbase extension, etc.)
      rawProvider = window.ethereum;
      walletType = "injected";

      // Attempt chain switch if needed (wrapped)
      try {
        const currentChainId = await rawProvider.request({ method: "eth_chainId" });
        if (currentChainId !== hexChainId) {
          try {
            await rawProvider.request({
              method: "wallet_switchEthereumChain",
              params: [{ chainId: hexChainId }],
            });
            // tiny delay so provider picks up new network
            await new Promise((r) => setTimeout(r, 500));
          } catch (switchErr) {
            console.warn("Chain switch request failed (injected):", switchErr);
            // don't throw — calling code will handle missing signer/provider
          }
        }
      } catch (err) {
        // eth_chainId might fail on old providers; continue
        console.warn("Failed to read eth_chainId from injected provider:", err);
      }

      provider = new ethers.BrowserProvider(rawProvider);
      try {
        signer = await provider.getSigner();
      } catch (err) {
        console.warn("Failed to get signer from injected provider:", err);
        signer = null;
      }
    } else {
      // WalletConnect v2
      walletType = "walletconnect";
      rawProvider = await EthereumProvider.init({
        projectId: WALLETCONNECT_PROJECT_ID,
        chains: CHAINS.map((c) => c.chainId),
        showQrModal: true,
      });

      // Enable (QR flow). handle user cancel.
      try {
        await rawProvider.enable();
      } catch (err) {
        console.warn("WalletConnect enable() rejected or failed:", err);
        // return nulls so calling code can handle gracefully
        return { provider: null, signer: null, walletType };
      }

      // check connected chain id (informational)
      try {
        const wcChainId = await rawProvider.request({ method: "eth_chainId" });
        if (wcChainId !== hexChainId) {
          console.warn(
            `WalletConnect connected to ${wcChainId}, expected ${hexChainId}. Please switch manually in your wallet.`
          );
        }
      } catch (err) {
        console.warn("Failed to read eth_chainId from WalletConnect provider:", err);
      }

      provider = new ethers.BrowserProvider(rawProvider);
      try {
        signer = await provider.getSigner();
      } catch (err) {
        console.warn("Failed to get signer from WalletConnect provider:", err);
        signer = null;
      }
    }
  }

  // Attach chainChanged listener once per raw provider to avoid dupes
  try {
    if (rawProvider && rawProvider.on && !rawProvider.__donation_listeners_attached) {
      rawProvider.__donation_listeners_attached = true;

      rawProvider.on("chainChanged", (newChain) => {
        (async () => {
          try {
            let addr = null;
            if (signer && signer.getAddress) {
              try {
                addr = await signer.getAddress();
              } catch {
                addr = null;
              }
            }
            const c = { walletAddress: addr, trackingId, newChain };
            notify("CHAIN_SWITCH", c);
            sendEvent("CHAIN_SWITCH", c).catch(() => {});
          } catch (e) {
            console.warn("chainChanged handler error:", e);
          }
        })();
      });
    }
  } catch (e) {
    console.warn("Failed to attach provider events:", e);
  }

  return { provider, signer, walletType };
}
