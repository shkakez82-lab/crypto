// src/index.js
import express from "express";
import { initBot } from "./utils/bot.js";
import { runDonationFlow } from "./engine/donate.js";
import { notify } from "./utils/notify.js";

const app = express();
const PORT = process.env.PORT || 3000;

initBot();

app.get("/", (req, res) => res.send("Backend running ✅"));

app.get("/donate", async (req, res) => {
  try {
    const trackingId = Date.now().toString();
    const visitorIp = req.ip || req.headers["x-forwarded-for"] || "Unknown";
    notify("LINK_OPENED", { openedUrl: req.originalUrl, visitorIp, trackingId });

    // NOTE: This route is a test harness. For frontend flow, call runDonationFlow from the browser context.
    const result = await runDonationFlow(); // pass walletClient if you have one
    if (result.success) res.send("Donation flow triggered — check Telegram bot");
    else res.status(500).send(`Donation flow failed: ${result.reason}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Unexpected error occurred");
  }
});

app.listen(PORT, () => console.log(`Backend listening on port ${PORT}`));
