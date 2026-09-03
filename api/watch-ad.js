import crypto from "crypto";

function verifyTelegramInitData(initData, botToken) {

  try {

    const params =
      new URLSearchParams(initData || "");

    const receivedHash =
      params.get("hash");

    if (!receivedHash) {
      return null;
    }

    params.delete("hash");

    const dataCheckString =
      [...params.entries()]
        .sort(([a], [b]) =>
          a.localeCompare(b)
        )
        .map(([key, value]) =>
          `${key}=${value}`
        )
        .join("\n");

    const secretKey =
      crypto
        .createHmac(
          "sha256",
          "WebAppData"
        )
        .update(botToken)
        .digest();

    const calculatedHash =
      crypto
        .createHmac(
          "sha256",
          secretKey
        )
        .update(dataCheckString)
        .digest("hex");

    if (
      calculatedHash !== receivedHash
    ) {
      return null;
    }

    const userData =
      params.get("user");

    if (!userData) {
      return null;
    }

    return JSON.parse(userData);

  } catch {

    return null;

  }
}


export default async function handler(
  req,
  res
) {

  if (req.method !== "POST") {

    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });

  }

  try {

    const {
      initData
    } = req.body || {};

    if (!initData) {

      return res.status(400).json({
        success: false,
        message:
          "Telegram authentication is missing"
      });

    }

    const botToken =
      process.env.TELEGRAM_BOT_TOKEN;

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseKey =
      process.env.SUPABASE_SECRET_KEY;

    if (
      !botToken ||
      !supabaseUrl ||
      !supabaseKey
    ) {

      return res.status(500).json({
        success: false,
        message:
          "Server configuration is incomplete"
      });

    }

    const telegramUser =
      verifyTelegramInitData(
        initData,
        botToken
      );

    if (!telegramUser?.id) {

      return res.status(401).json({
        success: false,
        message:
          "Invalid Telegram authentication"
      });

    }

    const telegramId =
      Number(telegramUser.id);

    /*
      Get pending ad session.
    */
    const response =
      await fetch(
        `${supabaseUrl}/rest/v1/ad_events?telegram_id=eq.${telegramId}&status=eq.pending&order=created_at.desc&limit=1`,
        {
          method: "GET",
          headers: {
            apikey: supabaseKey,
            Authorization:
              `Bearer ${supabaseKey}`
          }
        }
      );

    const text =
      await response.text();

    if (!response.ok) {

      console.error(
        "AD SESSION ERROR:",
        text
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to find ad session"
      });

    }

    let events;

    try {

      events =
        JSON.parse(text);

    } catch {

      events = [];

    }

    if (!events.length) {

      return res.status(400).json({
        success: false,
        message:
          "No active ad session found"
      });

    }

    const event =
      events[0];

    return res.status(200).json({

      success: true,

      ymid:
        event.ymid,

      reward:
        Number(event.reward || 0)

    });

  } catch (error) {

    console.error(
      "WATCH AD API ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Internal server error"
    });

  }

}
