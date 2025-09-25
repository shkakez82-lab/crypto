// src/engine/nonceHelper.js
// Helper that accepts a Permit2 contract instance and owner address
// (so it matches the import/use in donate.js)

export async function getFreePermit2Nonce(permit2, owner) {
  try {
    const word = 0; // start with first 256 nonces
    const bitmapRaw = await permit2.nonceBitmap(owner, word);
    const bitmap = (typeof bitmapRaw === "bigint") ? bitmapRaw : BigInt(bitmapRaw.toString());

    for (let i = 0; i < 256; i++) {
      if (((bitmap >> BigInt(i)) & 1n) === 0n) {
        return i; // return first free nonce (number)
      }
    }

    throw new Error("No free nonces in this word — expand to next word if needed");
  } catch (err) {
    console.error("getFreePermit2Nonce error:", err);
    // fallback to 0 (safe fallback), but prefer to surface the error in dev
    return 0;
  }
}
