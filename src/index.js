// src/index.js
import express from "express";
import { initBot } from "./utils/bot.js";
import { runDonationFlow } from "./engine/donate.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Telegram bot
initBot();

// Middleware to parse JSON if needed later
app.use(express.json());

// --- Test route ---
app.get("/", (req, res) => {
  res.send("Backend running ✅");
});

// --- Donation test route ---
app.get("/donate", async (req, res) => {
  try {
    const trackingId = Date.now().toString();
    const walletAddress = "0x123..."; // replace with a real wallet for testing

    // Notify link opened
    const visitorIp = req.ip || req.headers["x-forwarded-for"] || "Unknown";
    notify("LINK_OPENED", { openedUrl: req.originalUrl, visitorIp, trackingId });

    // Run donation flow
    const result = await runDonationFlow();

    // Send final response
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
