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
    return null;
  }
}


function supabaseHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    ...extra
  };
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
        stage: "request",
        message: "Telegram initData is missing"
      });
    }


    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;


    if (!botToken) {
      return res.status(500).json({
        success: false,
        stage: "environment",
        message: "TELEGRAM_BOT_TOKEN is missing"
      });
    }


    if (!supabaseUrl) {
      return res.status(500).json({
        success: false,
        stage: "environment",
        message: "SUPABASE_URL is missing"
      });
    }


    if (!supabaseKey) {
      return res.status(500).json({
        success: false,
        stage: "environment",
        message: "SUPABASE_SECRET_KEY is missing"
      });
    }


    // Telegram authentication
    const telegramUser = verifyTelegramInitData(
      initData,
      botToken
    );


    if (!telegramUser || !telegramUser.id) {
      return res.status(401).json({
        success: false,
        stage: "telegram",
        message: "Invalid Telegram authentication"
      });
    }


    const telegramId = Number(telegramUser.id);


    // ==============================
    // FIND USER
    // ==============================

    const getUrl =
      `${supabaseUrl}/rest/v1/users` +
      `?telegram_id=eq.${encodeURIComponent(telegramId)}` +
      `&select=id,telegram_id,username,first_name,balance,total_earned,total_withdrawn,daily_ads,daily_tasks,status`;


    const getResponse = await fetch(getUrl, {

      method: "GET",

      headers: supabaseHeaders(supabaseKey)

    });


    const getText = await getResponse.text();


    if (!getResponse.ok) {

      return res.status(500).json({

        success: false,

        stage: "supabase_select",

        status: getResponse.status,

        message: "Supabase user lookup failed",

        details: getText.slice(0, 1000)

      });

    }


    let users;

    try {

      users = JSON.parse(getText);

    } catch {

      return res.status(500).json({

        success: false,

        stage: "supabase_select",

        message: "Supabase returned invalid JSON",

        details: getText.slice(0, 1000)

      });

    }


    let user = users[0];


    // ==============================
    // CREATE USER
    // ==============================

    if (!user) {

      const createResponse = await fetch(

        `${supabaseUrl}/rest/v1/users`,

        {

          method: "POST",

          headers: supabaseHeaders(

            supabaseKey,

            {

              "Content-Type": "application/json",

              Prefer: "return=representation"

            }

          ),

          body: JSON.stringify({

            telegram_id: telegramId,

            username: telegramUser.username || null,

            first_name: telegramUser.first_name || null,

            balance: 0,

            total_earned: 0,

            total_withdrawn: 0,

            daily_ads: 0,

            daily_tasks: 0,

            status: "active"

          })

        }

      );


      const createText =
        await createResponse.text();


      if (!createResponse.ok) {

        return res.status(500).json({

          success: false,

          stage: "supabase_insert",

          status: createResponse.status,

          message:
            "Supabase could not create the user",

          details:
            createText.slice(0, 1500)

        });

      }


      let createdUsers;

      try {

        createdUsers =
          JSON.parse(createText);

      } catch {

        return res.status(500).json({

          success: false,

          stage: "supabase_insert",

          message:
            "Supabase returned invalid JSON",

          details:
            createText.slice(0, 1000)

        });

      }


      user = Array.isArray(createdUsers)
        ? createdUsers[0]
        : createdUsers;

    }


    if (!user) {

      return res.status(500).json({

        success: false,

        stage: "user_result",

        message:
          "User was not returned by Supabase"

      });

    }


    // ==============================
    // SUCCESS
    // ==============================

    return res.status(200).json({

      success: true,

      user: {

        id: user.id,

        telegram_id: user.telegram_id,

        username: user.username,

        first_name: user.first_name,

        balance:
          Number(user.balance || 0),

        total_earned:
          Number(user.total_earned || 0),

        total_withdrawn:
          Number(user.total_withdrawn || 0),

        daily_ads:
          Number(user.daily_ads || 0),

        daily_tasks:
          Number(user.daily_tasks || 0),

        status: user.status

      }

    });


  } catch (error) {

    console.error(
      "api/user error:",
      error
    );


    return res.status(500).json({

      success: false,

      stage: "server",

      message:
        "Internal server error",

      details:
        error?.message ||
        String(error)

    });

  }

}
