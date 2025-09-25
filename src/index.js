// src/index.js (server)
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { initBot } from "./utils/bot.js";
import { notify } from "./utils/notify.js";

const app = express();
app.use(cors()); // allow requests from your frontend origin
app.use(bodyParser.json());

app.get("/", (req, res) => res.send("Backend + bot running ✅"));

// Security: optional shared secret to avoid open relay
const NOTIFY_SECRET = process.env.NOTIFY_SECRET || null;

app.post("/events", (req, res) => {
  try {
    const { type, data, secret } = req.body;
    if (NOTIFY_SECRET && secret !== NOTIFY_SECRET) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!type) return res.status(400).json({ error: "Missing event type" });

    notify(type, data || {});
    return res.json({ ok: true });
  } catch (err) {
    console.error("Events endpoint error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// start server + bot
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initBot(); // start Telegram subscriber
});
