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
      amount,
      paymentMethod,
      paymentNumber
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


    // =========================
    // VERIFY TELEGRAM USER
    // =========================

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


    // =========================
    // VALIDATE WITHDRAWAL
    // =========================

    const withdrawalAmount =
      Number(amount);

    const method =
      String(paymentMethod || "");

    const number =
      String(paymentNumber || "").trim();


    if (
      !Number.isInteger(withdrawalAmount) ||
      withdrawalAmount <= 0
    ) {

      return res.status(400).json({
        success: false,
        message: "Invalid withdrawal amount"
      });

    }


    if (
      !["bKash", "Nagad"].includes(method)
    ) {

      return res.status(400).json({
        success: false,
        message: "Invalid payment method"
      });

    }


    if (
      !/^01[3-9]\d{8}$/.test(number)
    ) {

      return res.status(400).json({
        success: false,
        message: "Invalid Bangladesh mobile number"
      });

    }


    // =========================
    // CREATE WITHDRAWAL
    // =========================

    const rpcResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/create_withdrawal`,
      {
        method: "POST",

        headers: {
          "apikey": supabaseKey,
          "Content-Type": "application/json"
        },

        body: JSON.stringify({

          p_telegram_id:
            telegramId,

          p_amount:
            withdrawalAmount,

          p_payment_method:
            method,

          p_payment_number:
            number

        })
      }
    );


    const rpcText =
      await rpcResponse.text();


    // =========================
    // RPC ERROR
    // =========================

    if (!rpcResponse.ok) {

      console.error(
        "Withdrawal RPC error:",
        rpcText
      );

      let message =
        "Withdrawal failed";


      try {

        const parsed =
          JSON.parse(rpcText);

        message =
          parsed.message ||
          parsed.error ||
          message;

      } catch {}


      return res.status(400).json({

        success: false,

        message: message,

        details: rpcText

      });

    }


    // =========================
    // SUCCESS
    // =========================

    const result =
      JSON.parse(rpcText);


    const row =
      Array.isArray(result)
        ? result[0]
        : result;


    return res.status(200).json({

      success: true,

      withdrawalId:
        row?.withdrawal_id ||
        row?.id ||
        null,

      balance:
        Number(row?.balance ?? 0),

      message:
        "Withdrawal request submitted"

    });


  } catch (error) {

    console.error(
      "WITHDRAW API ERROR:",
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
