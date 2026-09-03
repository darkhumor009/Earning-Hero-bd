import crypto from "crypto";

function verifyTelegramInitData(initData, botToken) {
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

  try {
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
        message: "Telegram initData is required"
      });
    }

    const botToken = process.env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return res.status(500).json({
        success: false,
        message: "Telegram bot token is not configured"
      });
    }

    const telegramUser = verifyTelegramInitData(
      initData,
      botToken
    );

    if (!telegramUser || !telegramUser.id) {
      return res.status(401).json({
        success: false,
        message: "Invalid Telegram authentication"
      });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        success: false,
        message: "Supabase environment variables are missing"
      });
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/users?telegram_id=eq.${telegramUser.id}`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      return res.status(500).json({
        success: false,
        message: "Failed to load user",
        error: errorText
      });
    }

    const users = await response.json();

    let user;

    if (users.length > 0) {
      user = users[0];
    } else {
      const createResponse = await fetch(
        `${supabaseUrl}/rest/v1/users`,
        {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation"
          },
          body: JSON.stringify({
            telegram_id: telegramUser.id,
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

      if (!createResponse.ok) {
        const errorText = await createResponse.text();

        return res.status(500).json({
          success: false,
          message: "Failed to create user",
          error: errorText
        });
      }

      const createdUsers = await createResponse.json();
      user = createdUsers[0];
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        balance: user.balance,
        total_earned: user.total_earned,
        total_withdrawn: user.total_withdrawn,
        daily_ads: user.daily_ads,
        daily_tasks: user.daily_tasks,
        status: user.status
      }
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}
