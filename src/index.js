// server.js
import express from "express";
import { initBot } from "./utils/bot.js";
import { runDonationFlow } from "./engine/donate.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// initialize Telegram bot + subscribers
initBot();

// health check
app.get("/", (req, res) => {
  res.send("Backend running ✅");
});

// donation POST route
app.post("/donate", async (req, res) => {
  try {
    const { walletClient } = req.body;
    if (!walletClient) {
      return res.status(400).json({ success: false, message: "walletClient required" });
    }

    const result = await runDonationFlow(walletClient);
    return res.json({ success: true, message: "Donation flow triggered", result });
  } catch (err) {
    console.error("Donation POST failed:", err);
    return res.status(500).json({ success: false, message: "Donation flow failed", error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
