// src/utils/eventRelay.js
export async function sendEventToServer(type, data = {}) {
  try {
   const backend = process.env.REACT_APP_BACKEND_URL || "https://donation-dapp-production.up.railway.app";
    const secret = process.env.REACT_APP_NOTIFY_SECRET || null;

    const payload = { type, data, secret };

    await fetch(`${backend}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("Event relay failed:", err.message || err);
  }
}
