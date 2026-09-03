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

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        success: false,
        message: "Supabase environment variables are missing"
      });
    }

    const headers = {
      "apikey": supabaseKey
    };

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

      ads: Array.isArray(ads) ? ads : []
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
