import crypto from "crypto";

function verifyTelegramInitData(initData, botToken) {
  try {
    const params = new URLSearchParams(initData);

    const receivedHash = params.get("hash");

    if (!receivedHash) {
      return null;
    }

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

    if (calculatedHash !== receivedHash) {
      return null;
    }

    const userData = params.get("user");

    if (!userData) {
      return null;
    }

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
      initData
    } = req.body || {};

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
      initData || "",
      botToken
    );

    if (!telegramUser?.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid Telegram authentication"
      });
    }

    const telegramId = Number(telegramUser.id);

    /*
      Your Monetag main zone
    */
    const zoneId = 11720389;

    /*
      Unique event ID
    */
    const ymid =
      `${telegramId}_${Date.now()}_${crypto.randomUUID()}`;

    /*
      Get current settings
    */
    const settingsResponse = await fetch(
      `${supabaseUrl}/rest/v1/settings?select=ad_reward,daily_ad_limit&limit=1`,
      {
        headers: {
          apikey: supabaseKey
        }
      }
    );

    const settingsText =
      await settingsResponse.text();

    if (!settingsResponse.ok) {
      return res.status(500).json({
        success: false,
        message: "Failed to load settings"
      });
    }

    const settings =
      JSON.parse(settingsText)[0] || {};

    const reward =
      Number(settings.ad_reward || 50);

    const dailyLimit =
      Number(settings.daily_ad_limit || 20);

    /*
      Check today's ads
    */
    const todayStart =
      new Date();

    todayStart.setHours(0, 0, 0, 0);

    const todayStartISO =
      todayStart.toISOString();

    const countResponse = await fetch(
      `${supabaseUrl}/rest/v1/ad_history?telegram_id=eq.${telegramId}&created_at=gte.${encodeURIComponent(todayStartISO)}&select=id`,
      {
        headers: {
          apikey: supabaseKey
        }
      }
    );

    const countText =
      await countResponse.text();

    if (!countResponse.ok) {
      return res.status(500).json({
        success: false,
        message: "Failed to check daily ads"
      });
    }

    const todayAds =
      JSON.parse(countText).length;

    if (todayAds >= dailyLimit) {
      return res.status(400).json({
        success: false,
        message: "Daily ad limit reached"
      });
    }

    /*
      Save pending ad event
    */
    const insertResponse = await fetch(
      `${supabaseUrl}/rest/v1/ad_events`,
      {
        method: "POST",

        headers: {
          apikey: supabaseKey,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },

        body: JSON.stringify({
          ymid,
          telegram_id: telegramId,
          zone_id: zoneId,
          reward,
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
      ymid,
      reward,
      dailyLimit,
      todayAds
    });

  } catch (error) {

    console.error(
      "AD START ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}
