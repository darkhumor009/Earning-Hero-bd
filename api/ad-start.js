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

    if (calculatedHash !== receivedHash) {
      return null;
    }

    const userData = params.get("user");

    if (!userData) return null;

    return JSON.parse(userData);

  } catch (error) {
    console.error("Telegram verification error:", error);
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
        message: "Telegram initData is missing"
      });
    }

    const botToken =
      process.env.TELEGRAM_BOT_TOKEN;

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseKey =
      process.env.SUPABASE_SECRET_KEY;

    if (!botToken || !supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        success: false,
        message: "Server configuration error"
      });
    }


    /* =========================
       VERIFY TELEGRAM USER
    ========================= */

    const telegramUser =
      verifyTelegramInitData(
        initData,
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


    /* =========================
       MONETAG ZONE
    ========================= */

    const zoneId = 11720389;


    /* =========================
       GET SETTINGS
    ========================= */

    const settingsResponse =
      await fetch(
        `${supabaseUrl}/rest/v1/settings?select=ad_reward,daily_ad_limit&limit=1`,
        {
          method: "GET",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`
          }
        }
      );

    if (!settingsResponse.ok) {

      const errorText =
        await settingsResponse.text();

      console.error(
        "SETTINGS ERROR:",
        errorText
      );

      return res.status(500).json({
        success: false,
        message: "Failed to load settings"
      });
    }


    const settingsData =
      await settingsResponse.json();

    const settings =
      settingsData[0] || {};


    const reward =
      Number(settings.ad_reward || 50);

    const dailyLimit =
      Number(settings.daily_ad_limit || 20);


    /* =========================
       TODAY START
    ========================= */

    const todayStart =
      new Date();

    todayStart.setHours(
      0,
      0,
      0,
      0
    );

    const todayStartISO =
      todayStart.toISOString();


    /* =========================
       CHECK TODAY'S ADS
    ========================= */

    const countResponse =
      await fetch(
        `${supabaseUrl}/rest/v1/ad_events?telegram_id=eq.${telegramId}&created_at=gte.${encodeURIComponent(todayStartISO)}&select=id,status`,
        {
          method: "GET",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`
          }
        }
      );


    if (!countResponse.ok) {

      const errorText =
        await countResponse.text();

      console.error(
        "AD COUNT ERROR:",
        errorText
      );

      return res.status(500).json({
        success: false,
        message: "Failed to check daily ads"
      });
    }


    const adEvents =
      await countResponse.json();


    /*
      Count only successfully rewarded ads.
    */

    const todayAds =
      adEvents.filter(
        item => item.status === "completed"
      ).length;


    if (todayAds >= dailyLimit) {

      return res.status(400).json({
        success: false,
        message: "Daily ad limit reached"
      });

    }


    /* =========================
       CREATE UNIQUE YMID
    ========================= */

    const ymid =
      `${telegramId}_${Date.now()}_${crypto.randomUUID()}`;


    /* =========================
       CREATE PENDING AD EVENT
    ========================= */

    const insertResponse =
      await fetch(
        `${supabaseUrl}/rest/v1/ad_events`,
        {
          method: "POST",

          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal"
          },

          body: JSON.stringify({

            ymid: ymid,

            telegram_id:
              telegramId,

            zone_id:
              zoneId,

            reward:
              reward,

            status:
              "pending"

          })
        }
      );


    if (!insertResponse.ok) {

      const errorText =
        await insertResponse.text();

      console.error(
        "AD EVENT INSERT ERROR:",
        errorText
      );

      return res.status(500).json({
        success: false,
        message: "Failed to create ad session"
      });

    }


    /* =========================
       RETURN TO FRONTEND
    ========================= */

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
