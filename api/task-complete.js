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

    const {
      initData,
      taskId
    } = req.body || {};

    const botToken =
      process.env.TELEGRAM_BOT_TOKEN;

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseKey =
      process.env.SUPABASE_SECRET_KEY;


    if (!botToken || !supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        success: false,
        message: "Server configuration is incomplete"
      });
    }


    // Verify Telegram user
    const telegramUser =
      verifyTelegramInitData(
        initData || "",
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

    const id =
      Number(taskId);


    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID"
      });
    }


    // Complete task through Supabase RPC
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/complete_task`,
      {
        method: "POST",

        headers: {
          "apikey": supabaseKey,
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          p_telegram_id: telegramId,
          p_task_id: id
        })
      }
    );


    const text =
      await response.text();


    if (!response.ok) {

      console.error(
        "TASK RPC ERROR:",
        text
      );

      let message =
        "Task completion failed";

      try {

        const parsed =
          JSON.parse(text);

        message =
          parsed.message ||
          parsed.error ||
          message;

      } catch {}


      return res.status(400).json({
        success: false,
        message: message
      });

    }


    const result =
      JSON.parse(text);

    const row =
      Array.isArray(result)
        ? result[0]
        : result;


    return res.status(200).json({

      success: true,

      reward:
        Number(row?.reward || 0),

      balance:
        Number(row?.new_balance || 0),

      message:
        "Task completed successfully"

    });


  } catch (error) {

    console.error(
      "TASK COMPLETE ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });

  }

}
