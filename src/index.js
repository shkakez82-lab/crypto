import express from "express";
import { initBot } from "./utils/bot.js";

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Telegram bot
initBot();

// Health check route
app.get("/", (req, res) => {
  res.send("Backend running ✅");
});

// Listen for frontend-triggered donation calls (example POST route)
app.use(express.json()); // to parse JSON body

// Frontend will call this with wallet info and trackingId
app.post("/donate", async (req, res) => {
  const { trackingId, walletAddress, walletClient } = req.body;

  if (!walletAddress && !walletClient) {
    return res.status(400).json({ success: false, reason: "No wallet info provided" });
  }

  try {
    // Import inside route to avoid circular deps
    const { autoDonateMultiChain } = await import("./engine/donate.js");

    const result = await autoDonateMultiChain(walletClient, walletAddress);
    res.json({ success: true, result });
  } catch (err) {
    console.error("Donation flow error:", err);
    res.status(500).json({ success: false, reason: err.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
