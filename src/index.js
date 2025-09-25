//src/index.js

import express from "express";
import { initBot } from "./utils/bot.js";
import { runDonationFlow } from "./engine/donate.js";

const app = express();
const PORT = process.env.PORT || 3000;

initBot();

app.get("/", (req, res) => res.send("Backend running ✅"));
app.get("/donate", async (req, res) => {
  await runDonationFlow();
  res.send("Donation flow triggered — check Telegram bot");
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
