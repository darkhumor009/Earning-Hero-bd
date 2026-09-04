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

    const { initData, startParam } = req.body || {}; // startParam বা initData থেকে রেফারেল কোড রিসিভ করার ব্যবস্থা

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
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`
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
    // CREATE USER (WITH REFERRAL LOGIC)
    // =========================

    if (!user) {

      // রেফারেল আইডি হ্যান্ডেল করা (যেমন: start_param বা body থেকে আসা ref_ID)
      let referredBy = null;
      let rawStartParam = startParam || new URLSearchParams(initData).get("start_param");

      if (rawStartParam) {
        if (rawStartParam.startsWith('ref_')) {
          referredBy = Number(rawStartParam.replace('ref_', ''));
        } else {
          referredBy = Number(rawStartParam);
        }
      }

      // নিজের আইডি নিজেকে রেফার করা থেকে বাঁচাতে চেক
      if (referredBy === telegramId) {
        referredBy = null;
      }

      const createResponse =
        await fetch(
          `${supabaseUrl}/rest/v1/users`,
          {
            method: "POST",

            headers: {
              "apikey": supabaseKey,
              "Authorization": `Bearer ${supabaseKey}`,
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

              status: "active",

              referred_by: referredBy, // কে ইনভাইট করেছে তা সেভ হবে

              invited_count: 0

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


      // যদি কেউ সফলভাবে রেফার করে থাকে, তবে ইনভাইটরের ব্যালেন্স এবং কাউন্ট আপডেট করা
      if (referredBy) {
        try {
          // ১. প্রথমে অ্যাডমিন সেটিংস থেকে রেফারেল রিওয়ার্ড পয়েন্ট কত তা ফেচ করা (ডিফল্ট ৫০ পয়েন্ট ধরতে পারেন)
          let rewardPoints = 50; 
          const settingsRes = await fetch(`${supabaseUrl}/rest/v1/settings?select=referral_reward`, {
            headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` }
          });
          if (settingsRes.ok) {
            const settingsData = await settingsRes.json();
            if (settingsData && settingsData.length > 0 && settingsData[0].referral_reward) {
              rewardPoints = Number(settingsData[0].referral_reward);
            }
          }

          // ২. ইনভাইটরের বর্তমান ডাটা আনা (যাতে ব্যালেন্স ও invited_count ঠিকমতো বাড়ানো যায়)
          const inviterRes = await fetch(`${supabaseUrl}/rest/v1/users?telegram_id=eq.${referredBy}&select=*`, {
            headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` }
          });
          
          if (inviterRes.ok) {
            const inviterData = await inviterRes.json();
            if (inviterData && inviterData.length > 0) {
              const inviter = inviterData[0];
              const newBalance = Number(inviter.balance || 0) + rewardPoints;
              const newTotalEarned = Number(inviter.total_earned || 0) + rewardPoints;
              const newInvitedCount = Number(inviter.invited_count || 0) + 1;

              // ৩. Supabase-এ ইনভাইটরের ডাটা আপডেট করা
              await fetch(`${supabaseUrl}/rest/v1/users?telegram_id=eq.${referredBy}`, {
                method: "PATCH",
                headers: {
                  "apikey": supabaseKey,
                  "Authorization": `Bearer ${supabaseKey}`,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  balance: newBalance,
                  total_earned: newTotalEarned,
                  invited_count: newInvitedCount
                })
              });
            }
          }
        } catch (refErr) {
          console.error("Referral bonus update error:", refErr);
        }
      }

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
          user.status,

        referred_by: 
          user.referred_by,

        invited_count: 
          Number(user.invited_count || 0)

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
