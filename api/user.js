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


    if (!botToken) {
      return res.status(500).json({
        success: false,
        message: "TELEGRAM_BOT_TOKEN is missing"
      });
    }

    if (!supabaseUrl) {
      return res.status(500).json({
        success: false,
        message: "SUPABASE_URL is missing"
      });
    }

    if (!supabaseKey) {
      return res.status(500).json({
        success: false,
        message: "SUPABASE_SECRET_KEY is missing"
      });
    }


    // =========================
    // VERIFY TELEGRAM USER
    // =========================

    const telegramUser =
      verifyTelegramInitData(
        initData,
        botToken
      );


    if (!telegramUser || !telegramUser.id) {

      return res.status(401).json({
        success: false,
        message: "Invalid Telegram authentication"
      });

    }


    const telegramId =
      Number(telegramUser.id);


    // =========================
    // GET USER FROM SUPABASE
    // =========================

    const userUrl =
      `${supabaseUrl}/rest/v1/users` +
      `?telegram_id=eq.${telegramId}` +
      `&select=*`;


    const getResponse = await fetch(
      userUrl,
      {
        method: "GET",

        headers: {
          "apikey": supabaseKey
        }
      }
    );


    const getText =
      await getResponse.text();


    if (!getResponse.ok) {

      console.error(
        "Supabase GET error:",
        getText
      );

      return res.status(500).json({
        success: false,
        message: "Failed to load user",
        details: getText
      });

    }


    const users =
      JSON.parse(getText);


    let user = users[0];


    // =========================
    // CREATE USER
    // =========================

    if (!user) {

      const createResponse =
        await fetch(
          `${supabaseUrl}/rest/v1/users`,
          {
            method: "POST",

            headers: {
              "apikey": supabaseKey,
              "Content-Type":
                "application/json",
              "Prefer":
                "return=representation"
            },

            body: JSON.stringify({

              telegram_id:
                telegramId,

              username:
                telegramUser.username || null,

              first_name:
                telegramUser.first_name || null,

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

        console.error(
          "Supabase INSERT error:",
          createText
        );

        return res.status(500).json({

          success: false,

          message:
            "Failed to create user",

          details:
            createText

        });

      }


      const createdUsers =
        JSON.parse(createText);


      user =
        Array.isArray(createdUsers)
          ? createdUsers[0]
          : createdUsers;

    }


    // =========================
    // RETURN USER
    // =========================

    return res.status(200).json({

      success: true,

      user: {

        id: user.id,

        telegram_id:
          user.telegram_id,

        username:
          user.username,

        first_name:
          user.first_name,

        balance:
          Number(user.balance || 0),

        total_earned:
          Number(
            user.total_earned || 0
          ),

        total_withdrawn:
          Number(
            user.total_withdrawn || 0
          ),

        daily_ads:
          Number(
            user.daily_ads || 0
          ),

        daily_tasks:
          Number(
            user.daily_tasks || 0
          ),

        status:
          user.status

      }

    });


  } catch (error) {

    console.error(
      "API USER ERROR:",
      error
    );

    return res.status(500).json({

      success: false,

      message:
        "Internal server error",

      details:
        error.message

    });

  }

}
