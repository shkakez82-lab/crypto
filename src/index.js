// index.js
import express from "express";
import { initBot } from "./utils/bot.js";
import { runDonationFlow } from "./engine/donate.js";
import { notify } from "./utils/notify.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Telegram bot
initBot();

// Test route
app.get("/", (req, res) => {
  res.send("Backend running ✅");
});

// Donation test route
app.get("/donate", async (req, res) => {
  try {
    const trackingId = Date.now().toString();
    const walletAddress = "0x123..."; // replace with real wallet
    const visitorIp = req.ip || req.headers["x-forwarded-for"] || "Unknown";

    // Notify link opened
    notify?.("LINK_OPENED", { openedUrl: req.originalUrl, visitorIp, trackingId });

    // Run donation flow
    const result = await runDonationFlow(trackingId, walletAddress);

    if (result.success) res.send("Donation flow triggered — check Telegram bot ✅");
    else res.status(500).send(`Donation flow failed: ${result.reason}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Unexpected error occurred");
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
