import crypto from "crypto";

function verifyTelegramInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData);
    const receivedHash = params.get("hash");
    if (!receivedHash) return null;
    params.delete("hash");

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

    if (calculatedHash !== receivedHash) return null;
    const userData = params.get("user");
    if (!userData) return null;
    return JSON.parse(userData);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method not allowed" });
  }

  try {
    // ফ্রন্টএন্ড থেকে adId এবং reward রিসিভ করা
    const { initData, adId, reward } = req.body || {};

    if (!initData) {
      return res.status(400).json({ success: false, message: "Telegram initData is missing" });
    }

    // অ্যাডমিন প্যানেল থেকে আসা রিওয়ার্ড বা ডিফল্ট ৫০ পয়েন্ট
    const adReward = Number(reward) > 0 ? Number(reward) : 50;

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!botToken || !supabaseUrl || !supabaseKey) {
      return res.status(500).json({ success: false, message: "Server configuration error" });
    }

    const telegramUser = verifyTelegramInitData(initData, botToken);
    if (!telegramUser || !telegramUser.id) {
      return res.status(401).json({ success: false, message: "Invalid Telegram authentication" });
    }

    // Supabase RPC-তে ডাইনামিক রিওয়ার্ডসহ কল করা
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_ad_reward`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        p_telegram_id: Number(telegramUser.id),
        p_ad_id: adId ? String(adId) : "direct_ad",
        p_reward: adReward
      })
    });

    const text = await response.text();

    if (!response.ok) {
      let message = "Reward could not be processed";
      try {
        const error = JSON.parse(text);
        if (error.message) message = error.message;
      } catch {}
      return res.status(400).json({ success: false, message });
    }

    return res.status(200).json(JSON.parse(text));

  } catch (error) {
    console.error("AD REWARD API ERROR:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
}
