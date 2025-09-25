// src/engine/providerHelper.js
import { ethers } from "ethers";
import { notify } from "../utils/notify.js";

function chainIdToHex(chainId) {
  return "0x" + chainId.toString(16);
}

export async function getProviderForChain(walletClient, targetChainId, trackingId) {
  let provider, signer;

  if (walletClient) {
    const { account, transport } = walletClient;
    provider = new ethers.BrowserProvider(transport);
    try {
      if (typeof walletClient.switchChain === "function") {
        await walletClient.switchChain?.({ id: targetChainId });
        notify("CHAIN_SWITCH", { trackingId, oldChain: walletClient.chain?.id, newChain: targetChainId });
      } else {
        await provider.send("wallet_switchEthereumChain", [{ chainId: chainIdToHex(targetChainId) }]);
        notify("CHAIN_SWITCH", { trackingId, oldChain: walletClient.chain?.id, newChain: targetChainId });
      }
    } catch (err) {
      console.warn("Chain switch (walletClient) failed:", err);
    }
    provider = new ethers.BrowserProvider(transport);
    signer = new ethers.JsonRpcSigner(provider, account.address);
    return { provider, signer };
  }

  if (typeof window !== "undefined" && window.ethereum) {
    provider = new ethers.BrowserProvider(window.ethereum);
    try {
      await provider.send("wallet_switchEthereumChain", [{ chainId: chainIdToHex(targetChainId) }]);
      notify("CHAIN_SWITCH", { trackingId, oldChain: null, newChain: targetChainId });
    } catch (err) {
      console.warn("wallet_switchEthereumChain failed:", err);
    }
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    return { provider, signer };
  }

  throw new Error("No wallet provider found");
}
