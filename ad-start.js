import crypto from "crypto";

function verifyTelegramInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData || "");
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

    const { initData } = req.body || {};

    if (!initData) {
      return res.status(400).json({
        success: false,
        message: "Telegram authentication is missing"
      });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!botToken || !supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        success: false,
        message: "Server configuration is incomplete"
      });
    }

    const telegramUser = verifyTelegramInitData(
      initData,
      botToken
    );

    if (!telegramUser?.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid Telegram authentication"
      });
    }

    const telegramId = Number(telegramUser.id);

    if (!Number.isSafeInteger(telegramId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Telegram user ID"
      });
    }

    /*
      Main Monetag zone
    */
    const zoneId = 11720389;

    /*
      Unique ID for this ad session.
      This same ymid will be sent to Monetag
      and later returned in the postback.
    */
    const ymid =
      `${telegramId}_${Date.now()}_${crypto.randomUUID()}`;

    /*
      Load settings
    */
    const settingsResponse = await fetch(
      `${supabaseUrl}/rest/v1/settings?select=ad_reward,daily_ad_limit&limit=1`,
      {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    );

    const settingsText =
      await settingsResponse.text();

    if (!settingsResponse.ok) {

      console.error(
        "SETTINGS ERROR:",
        settingsText
      );

      return res.status(500).json({
        success: false,
        message: "Failed to load settings"
      });
    }

    let settingsData;

    try {
      settingsData = JSON.parse(settingsText);
    } catch {
      return res.status(500).json({
        success: false,
        message: "Invalid settings response"
      });
    }

    const settings =
      settingsData[0] || {};

    const reward =
      Number(settings.ad_reward || 50);

    const dailyLimit =
      Number(settings.daily_ad_limit || 20);

    /*
      Current date in UTC.
      Supabase timestamps are normally UTC.
    */
    const now = new Date();

    const todayStart =
      new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate()
        )
      );

    const todayStartISO =
      todayStart.toISOString();

    /*
      Count today's ad events for this user.
    */
    const countResponse = await fetch(
      `${supabaseUrl}/rest/v1/ad_events?telegram_id=eq.${telegramId}&created_at=gte.${encodeURIComponent(todayStartISO)}&select=id`,
      {
        method: "GET",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    );

    const countText =
      await countResponse.text();

    if (!countResponse.ok) {

      console.error(
        "AD COUNT ERROR:",
        countText
      );

      return res.status(500).json({
        success: false,
        message: "Failed to check daily ad limit"
      });
    }

    let existingEvents = [];

    try {
      existingEvents =
        JSON.parse(countText);
    } catch {
      existingEvents = [];
    }

    const todayAds =
      existingEvents.length;

    if (todayAds >= dailyLimit) {
      return res.status(400).json({
        success: false,
        message: "Daily ad limit reached"
      });
    }

    /*
      Create pending ad event.
    */
    const insertResponse = await fetch(
      `${supabaseUrl}/rest/v1/ad_events`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          ymid: ymid,
          telegram_id: telegramId,
          zone_id: zoneId,
          reward: reward,
          status: "pending"
        })
      }
    );

    const insertText =
      await insertResponse.text();

    if (!insertResponse.ok) {

      console.error(
        "AD EVENT INSERT ERROR:",
        insertText
      );

      return res.status(500).json({
        success: false,
        message: "Failed to create ad session"
      });
    }

    return res.status(200).json({
      success: true,
      ymid: ymid,
      reward: reward,
      dailyLimit: dailyLimit,
      todayAds: todayAds
    });

  } catch (error) {

    console.error(
      "AD START API ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}
