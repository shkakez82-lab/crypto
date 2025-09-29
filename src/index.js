// src/index.js (server)
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { initBot } from "./utils/bot.js";
import { notify } from "./utils/notify.js";

const app = express();

// --- CORS setup ---
const allowedOrigins = [
  "https://filterclaim.vercel.app", // replace with your Vercel domain
  "http://localhost:5173"         // dev mode
];

app.use(cors({
  origin: function (origin, callback) {
    // allow requests with no origin (like curl, Postman, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error("CORS not allowed from this origin"), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(bodyParser.json());

// --- Routes ---
app.get("/", (req, res) => res.send("Backend + bot running ✅"));

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

// --- Start server + bot ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  initBot();
});
