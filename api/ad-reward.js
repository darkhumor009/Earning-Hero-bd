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

    const secretKey = crypto
      .createHmac("sha256", "WebAppData")
      .update(botToken)
      .digest();

    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

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
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {

    const {
      initData,
      adId
    } = req.body || {};

    const botToken =
      process.env.TELEGRAM_BOT_TOKEN;

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseKey =
      process.env.SUPABASE_SECRET_KEY;


    if (!botToken || !supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        success: false,
        message: "Server configuration is incomplete"
      });
    }


    // Verify Telegram user
    const telegramUser =
      verifyTelegramInitData(
        initData || "",
        botToken
      );


    if (!telegramUser?.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid Telegram authentication"
      });
    }


    const telegramId =
      Number(telegramUser.id);

    const id =
      Number(adId);


    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid Ad ID"
      });
    }


    // Ad reward through Supabase RPC
    // (নোট: আপনার Supabase-এ ডাইরেক্ট লিংকের রিওয়ার্ড যোগ করার জন্য আলাদা কোনো RPC ফাংশন যেমন claim_ad_reward তৈরি করা থাকতে পারে, অথবা নিচে সরাসরি পয়েন্ট যোগ করার লজিক রাখতে পারেন)
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/claim_ad_reward`,
      {
        method: "POST",

        headers: {
          "apikey": supabaseKey,
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          p_telegram_id: telegramId,
          p_ad_id: id
        })
      }
    );


    const text =
      await response.text();


    if (!response.ok) {

      console.error(
        "AD REWARD RPC ERROR:",
        text
      );

      let message =
        "Ad reward failed";

      try {

        const parsed =
          JSON.parse(text);

        message =
          parsed.message ||
          parsed.error ||
          message;

      } catch {}


      return res.status(400).json({
        success: false,
        message: message
      });

    }


    const result =
      JSON.parse(text);

    const row =
      Array.isArray(result)
        ? result[0]
        : result;


    return res.status(200).json({

      success: true,

      reward:
        Number(row?.reward || 0),

      balance:
        Number(row?.new_balance || 0),

      message:
        "Reward added successfully"

    });


  } catch (error) {

    console.error(
      "AD REWARD ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  }

}
