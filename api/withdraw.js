export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const {
      telegram_id,
      amount,
      payment_method,
      payment_number
    } = req.body || {};

    // =========================
    // BASIC VALIDATION
    // =========================

    if (!telegram_id) {
      return res.status(400).json({
        success: false,
        message: "Telegram ID is required"
      });
    }

    const withdrawAmount = Number(amount);

    if (!Number.isInteger(withdrawAmount) || withdrawAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid withdrawal amount"
      });
    }

    if (!payment_method) {
      return res.status(400).json({
        success: false,
        message: "Payment method is required"
      });
    }

    if (!payment_number) {
      return res.status(400).json({
        success: false,
        message: "Payment number is required"
      });
    }

    // =========================
    // ENVIRONMENT VARIABLES
    // =========================

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({
        success: false,
        message: "Supabase environment variables are missing"
      });
    }

    // =========================
    // LOAD SETTINGS
    // =========================

    const settingsResponse = await fetch(
      `${supabaseUrl}/rest/v1/settings?select=minimum_withdraw,maintenance_mode&limit=1`,
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
        "Settings error:",
        settingsText
      );

      return res.status(500).json({
        success: false,
        message: "Failed to load withdrawal settings"
      });
    }

    const settingsData = JSON.parse(settingsText);
    const settings = settingsData[0];

    const minimumWithdraw =
      Number(settings?.minimum_withdraw || 500);

    if (settings?.maintenance_mode === true) {
      return res.status(503).json({
        success: false,
        message: "Withdrawal is temporarily unavailable"
      });
    }

    // =========================
    // MINIMUM WITHDRAWAL
    // =========================

    if (withdrawAmount < minimumWithdraw) {
      return res.status(400).json({
        success: false,
        message:
          `Minimum withdrawal is ${minimumWithdraw} points`
      });
    }

    // =========================
    // FIND USER
    // =========================

    const userResponse = await fetch(
      `${supabaseUrl}/rest/v1/users?telegram_id=eq.${encodeURIComponent(telegram_id)}&select=id,telegram_id,balance,status&limit=1`,
      {
        method: "GET",
        headers: {
          "apikey": supabaseKey
        }
      }
    );

    const userText = await userResponse.text();

    if (!userResponse.ok) {
      console.error(
        "User lookup error:",
        userText
      );

      return res.status(500).json({
        success: false,
        message: "Failed to find user"
      });
    }

    const users = JSON.parse(userText);
    const user = users[0];

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User account not found"
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Your account is not active"
      });
    }

    const currentBalance =
      Number(user.balance || 0);

    // =========================
    // BALANCE CHECK
    // =========================

    if (currentBalance < withdrawAmount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance"
      });
    }

    // =========================
    // CHECK PENDING REQUEST
    // =========================

    const pendingResponse = await fetch(
      `${supabaseUrl}/rest/v1/withdrawals?telegram_id=eq.${encodeURIComponent(telegram_id)}&status=eq.pending&select=id&limit=1`,
      {
        method: "GET",
        headers: {
          "apikey": supabaseKey
        }
      }
    );

    const pendingText =
      await pendingResponse.text();

    if (!pendingResponse.ok) {
      console.error(
        "Pending withdrawal check error:",
        pendingText
      );

      return res.status(500).json({
        success: false,
        message: "Could not check withdrawal status"
      });
    }

    const pendingRequests =
      JSON.parse(pendingText);

    if (pendingRequests.length > 0) {
      return res.status(400).json({
        success: false,
        message:
          "You already have a pending withdrawal"
      });
    }

    // =========================
    // CREATE WITHDRAWAL
    // =========================

    const withdrawalResponse = await fetch(
      `${supabaseUrl}/rest/v1/withdrawals`,
      {
        method: "POST",
        headers: {
          "apikey": supabaseKey,
          "Content-Type": "application/json",
          "Prefer": "return=representation"
        },
        body: JSON.stringify({
          telegram_id: Number(telegram_id),
          amount: withdrawAmount,
          payment_method: payment_method,
          payment_number: payment_number,
          status: "pending"
        })
      }
    );

    const withdrawalText =
      await withdrawalResponse.text();

    if (!withdrawalResponse.ok) {
      console.error(
        "Withdrawal insert error:",
        withdrawalText
      );

      return res.status(500).json({
        success: false,
        message: "Failed to create withdrawal request",
        details: withdrawalText
      });
    }

    // =========================
    // DEDUCT BALANCE
    // =========================

    const newBalance =
      currentBalance - withdrawAmount;

    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/users?id=eq.${user.id}`,
      {
        method: "PATCH",
        headers: {
          "apikey": supabaseKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          balance: newBalance
        })
      }
    );

    const updateText =
      await updateResponse.text();

    if (!updateResponse.ok) {
      console.error(
        "Balance update error:",
        updateText
      );

      // Important:
      // The withdrawal was already inserted.
      // Return an error so it can be investigated.
      return res.status(500).json({
        success: false,
        message:
          "Withdrawal created but balance update failed",
        details: updateText
      });
    }

    // =========================
    // SUCCESS
    // =========================

    return res.status(200).json({
      success: true,
      message:
        "Withdrawal request submitted successfully",
      withdrawal: {
        amount: withdrawAmount,
        payment_method: payment_method,
        status: "pending"
      },
      balance: newBalance
    });

  } catch (error) {

    console.error(
      "WITHDRAW API ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      details: error.message
    });
  }
}
