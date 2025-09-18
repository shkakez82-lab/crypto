import { ethers } from "ethers";
import { DONATION_CONTRACT_ADDRESS, DONATION_CONTRACT_ABI } from "./config";

export async function rescueTokenAdmin(tokenAddress, recipientAddress) {
  if (!window.ethereum) throw new Error("No wallet");
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const chain = await provider.getNetwork();
  const contract = new ethers.Contract(DONATION_CONTRACT_ADDRESS[chain.chainId], DONATION_CONTRACT_ABI, signer);
  const tx = await contract.rescueToken(tokenAddress, recipientAddress);
  await tx.wait();
  return tx.hash;
}

