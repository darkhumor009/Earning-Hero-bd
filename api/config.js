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

    // Load Settings
    const settingsResponse = await fetch(
      `${supabaseUrl}/rest/v1/settings?select=ad_reward,daily_ad_limit,minimum_withdraw,default_task_reward,ads_enabled,registrations_enabled,maintenance_mode&limit=1`,
      {
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

    // Load Active Tasks
    const taskResponse = await fetch(
      `${supabaseUrl}/rest/v1/tasks?active=eq.true&select=id,title,description,reward,daily_limit,active&order=id.asc`,
      {
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

    const settings = JSON.parse(settingsText);
    const tasks = JSON.parse(taskText);

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

      tasks: Array.isArray(tasks)
        ? tasks
        : []
    });

  } catch (error) {
    console.error(
      "CONFIG API ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      details: error.message
    });
  }
}
