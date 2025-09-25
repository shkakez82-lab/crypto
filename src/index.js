import express from "express";
import bodyParser from "body-parser";
import { runDonationFlow } from "./engine/donate.js";
import { initBot } from "./utils/bot.js";

const app = express();
app.use(bodyParser.json());

// health check
app.get("/", (req, res) => {
  res.send("Donation backend + bot running ✅");
});

// donation trigger
app.post("/donate", async (req, res) => {
  try {
    const { walletAddress } = req.body;
    if (!walletAddress) {
      return res.status(400).json({ error: "walletAddress is required" });
    }

    await donate(walletAddress);
    res.json({ success: true, message: "Donation flow executed" });
  } catch (err) {
    console.error("Donation error:", err);
    res.status(500).json({ error: "Donation flow failed" });
  }
});

// start server + bot
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initBot(); // start Telegram bot subscriber
});
