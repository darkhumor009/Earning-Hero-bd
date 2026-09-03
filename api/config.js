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
        message: "Supabase server environment variables are missing"
      });
    }

    // =========================
    // LOAD SETTINGS
    // =========================

    const settingsResponse = await fetch(
      `${supabaseUrl}/rest/v1/settings?select=ad_reward,daily_ad_limit,minimum_withdraw,default_task_reward,ads_enabled,registrations_enabled,maintenance_mode&limit=1`,
      {
        method: "GET",
        headers: {
          "apikey": supabaseKey
        }
      }
    );

    const settingsText = await settingsResponse.text();

    if (!settingsResponse.ok) {
      console.error(
        "Supabase settings error:",
        settingsText
      );

      return res.status(500).json({
        success: false,
        message: "Failed to load settings",
        details: settingsText
      });
    }

    // =========================
    // LOAD ACTIVE TASKS
    // =========================

    const taskResponse = await fetch(
      `${supabaseUrl}/rest/v1/tasks?active=eq.true&select=id,title,description,reward,daily_limit,active&order=id.asc`,
      {
        method: "GET",
        headers: {
          "apikey": supabaseKey
        }
      }
    );

    const taskText = await taskResponse.text();

    if (!taskResponse.ok) {
      console.error(
        "Supabase tasks error:",
        taskText
      );

      return res.status(500).json({
        success: false,
        message: "Failed to load tasks",
        details: taskText
      });
    }

    // =========================
    // LOAD ACTIVE ADS
    // =========================

    const adsResponse = await fetch(
      `${supabaseUrl}/rest/v1/ads?active=eq.true&select=id,name,provider,url,reward,daily_limit,active&order=id.asc`,
      {
        method: "GET",
        headers: {
          "apikey": supabaseKey
        }
      }
    );

    const adsText = await adsResponse.text();

    if (!adsResponse.ok) {
      console.error(
        "Supabase ads error:",
        adsText
      );

      return res.status(500).json({
        success: false,
        message: "Failed to load ads",
        details: adsText
      });
    }

    // =========================
    // PARSE DATA
    // =========================

    const settings = JSON.parse(settingsText);
    const tasks = JSON.parse(taskText);
    const ads = JSON.parse(adsText);

    // =========================
    // RESPONSE
    // =========================

    return res.status(200).json({
      success: true,

      settings: settings[0] || {
        ad_reward: 50,
        daily_ad_limit: 20,
        minimum_withdraw: 500,
        default_task_reward: 100,
       
