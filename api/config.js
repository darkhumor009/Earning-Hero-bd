import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    const botToken = process.env.TELEGRAM_BOT_TOKEN; // টেলিগ্রাম বট টোকেন ভ্যারিয়েবল

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        success: false,
        message: "Supabase environment variables are missing"
      });
    }

    const headers = {
      "apikey": supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`
    };

    // =========================
    // GET TELEGRAM USER FROM QUERY
    // =========================
    const initData = req.query.initData || req.headers["x-telegram-init-data"];
    let telegramId = null;

    if (initData && botToken) {
      try {
        const urlParams = new URLSearchParams(initData);
        const hash = urlParams.get("hash");
        urlParams.delete("hash");
        const paramsList = Array.from(urlParams.entries());
        paramsList.sort(([a], [b]) => a.localeCompare(b));
        const dataCheckString = paramsList.map(([key, val]) => `${key}=${val}`).join("\n");
        
        const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
        const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

        if (calculatedHash === hash) {
          const userStr = urlParams.get("user");
          if (userStr) {
            const userObj = JSON.parse(userStr);
            telegramId = userObj.id;
          }
        }
      } catch (e) {
        console.error("InitData validation error in config:", e);
      }
    }

    // =========================
    // FETCH USER COMPLETED ADS
    // =========================
    let completedAdIds = [];
    if (telegramId) {
      const userRes = await fetch(`${supabaseUrl}/rest/v1/users?telegram_id=eq.${telegramId}&select=completed_ads`, {
        method: "GET",
        headers
      });
      if (userRes.ok) {
        const userData = await userRes.json();
        if (userData && userData.length > 0 && userData[0].completed_ads) {
          completedAdIds = userData[0].completed_ads; // এটি অ্যারে হতে হবে (যেমন: [1, 2, 3])
        }
      }
    }

    // =========================
    // SETTINGS
    // =========================

    const settingsResponse = await fetch(
      `${supabaseUrl}/rest/v1/settings?select=ad_reward,daily_ad_limit,minimum_withdraw,default_task_reward,ads_enabled,registrations_enabled,maintenance_mode&limit=1`,
      {
        method: "GET",
        headers
      }
    );

    const settingsText = await settingsResponse.text();

    if (!settingsResponse.ok) {
      console.error("SETTINGS ERROR:", settingsText);

      return res.status(500).json({
        success: false,
        message: "Failed to load settings",
        details: settingsText
      });
    }

    // =========================
    // TASKS
    // =========================

    const tasksResponse = await fetch(
      `${supabaseUrl}/rest/v1/tasks?active=eq.true&select=id,title,description,reward,daily_limit,active&order=id.asc`,
      {
        method: "GET",
        headers
      }
    );

    const tasksText = await tasksResponse.text();

    if (!tasksResponse.ok) {
      console.error("TASKS ERROR:", tasksText);

      return res.status(500).json({
        success: false,
        message: "Failed to load tasks",
        details: tasksText
      });
    }

    // =========================
    // ADS
    // =========================

    const adsResponse = await fetch(
      `${supabaseUrl}/rest/v1/ads?active=eq.true&select=id,name,provider,url,reward,daily_limit,active&order=id.asc`,
      {
        method: "GET",
        headers
      }
    );

    const adsText = await adsResponse.text();

    if (!adsResponse.ok) {
      console.error("ADS ERROR:", adsText);

      return res.status(500).json({
        success: false,
        message: "Failed to load ads",
        details: adsText
      });
    }

    // =========================
    // PARSE DATA
    // =========================

    let settings;
    let tasks;
    let ads;

    try {
      settings = JSON.parse(settingsText);
      tasks = JSON.parse(tasksText);
      ads = JSON.parse(adsText);
    } catch (parseError) {
      console.error("JSON PARSE ERROR:", parseError);

      return res.status(500).json({
        success: false,
        message: "Invalid Supabase response",
        details: parseError.message
      });
    }

    // =========================
    // FILTER OUT COMPLETED ADS
    // =========================
    let filteredAds = Array.isArray(ads) ? ads : [];
    if (completedAdIds.length > 0) {
      filteredAds = filteredAds.filter(ad => !completedAdIds.includes(ad.id));
    }

    // =========================
    // SUCCESS
    // =========================

    return res.status(200).json({
      success: true,

      settings: settings[0] || {
        ad_reward: 50,
        daily_ad_limit: 20,
        minimum_withdraw: 500,
        default_task_reward: 100,
        ads_enabled: true,
        registrations_enabled: true,
        maintenance_mode: false
      },

      tasks: Array.isArray(tasks) ? tasks : [],

      ads: filteredAds // এখন ইউজার যে অ্যাডগুলো দেখে ফেলেছে, সেগুলো আর দেখাবে না
    });

  } catch (error) {
    console.error("CONFIG API CRASH:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      details: error.message
    });
  }
}
