import express from "express";
import { initBot } from "./utils/bot.js";
import { runDonationFlow } from "./engine/donate.js";

const app = express();
const PORT = process.env.PORT || 3000;

// initialize Telegram bot
initBot();

// test route to confirm backend is alive
app.get("/", (req, res) => {
  res.send("Backend running ✅");
});

// donation test route
app.get("/donate", async (req, res) => {
  const trackingId = Date.now().toString();
  const walletAddress = "0x123..."; // replace with real later
  await runDonationFlow(trackingId, walletAddress);
  res.send("Donation flow triggered — check Telegram bot");
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
