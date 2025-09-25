import express from "express";
import bodyParser from "body-parser";
import { initBot } from "./utils/bot.js";

const app = express();
app.use(bodyParser.json());

// health check
app.get("/", (req, res) => {
  res.send("Donation backend + bot running ✅");
});

// start server + bot
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initBot(); // ✅ start Telegram bot subscriber
});
