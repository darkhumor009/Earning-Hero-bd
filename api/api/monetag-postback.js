import crypto from "crypto";

export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  try {

    /*
     * Accept both your custom parameter names
     * and Monetag macro names.
     */

    const ymid =
      req.query.ymid;

    const zoneId =
      req.query.zone ||
      req.query.zone_id;

    const eventType =
      req.query.event ||
      req.query.event_type;

    const rewardEventType =
      req.query.value ||
      req.query.reward_event_type;

    const estimatedPrice =
      req.query.amount ||
      req.query.estimated_price;

    const requestVar =
      req.query.source ||
      req.query.request_var;

    const telegramId =
      req.query.telegram_id;


    /* =========================
       SUPABASE
    ========================= */

    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseKey =
      process.env.SUPABASE_SECRET_KEY;


    if (!supabaseUrl || !supabaseKey) {

      console.error(
        "Missing Supabase environment variables"
      );

      return res
        .status(500)
        .send("Server configuration error");

    }


    /* =========================
       LOG EVERYTHING
    ========================= */

    console.log(
      "MONETAG POSTBACK RECEIVED:",
      {
        ymid,
        zoneId,
        eventType,
        rewardEventType,
        estimatedPrice,
        requestVar,
        telegramId
      }
    );


    /* =========================
       BASIC VALIDATION
    ========================= */

    if (!ymid) {

      console.error(
        "POSTBACK ERROR: Missing ymid",
        req.query
      );

      return res
        .status(400)
        .send("Missing ymid");

    }


    if (String(zoneId) !== "11720389") {

      console.error(
        "POSTBACK ERROR: Invalid zone",
        zoneId
      );

      return res
        .status(400)
        .send("Invalid zone");

    }


    /* =========================
       ONLY IMPRESSION
    ========================= */

    if (
      String(eventType) !== "impression"
    ) {

      console.log(
        "Ignoring event:",
        eventType
      );

      return res
        .status(200)
        .send("OK");

    }


    /* =========================
       ONLY PAID / VALUED EVENT
       Monetag TMA macro shown
       in your panel uses yes/no.
    ========================= */

    if (
      String(rewardEventType).toLowerCase() !== "yes"
    ) {

      console.log(
        "Ignoring non-paid event:",
        rewardEventType
      );

      return res
        .status(200)
        .send("OK");

    }


    /* =========================
       CONFIRM REWARD
    ========================= */

    const response =
      await fetch(
        `${supabaseUrl}/rest/v1/rpc/confirm_ad_reward`,
        {
          method: "POST",

          headers: {

            apikey:
              supabaseKey,

            Authorization:
              `Bearer ${supabaseKey}`,

            "Content-Type":
              "application/json"

          },

          body: JSON.stringify({

            p_ymid:
              String(ymid),

            p_event_type:
              String(eventType),

            p_reward_event_type:
              String(rewardEventType),

            p_estimated_price:
              Number(estimatedPrice || 0),

            p_zone_id:
              Number(zoneId)

          })

        }
      );


    const responseText =
      await response.text();


    /* =========================
       SUPABASE ERROR
    ========================= */

    if (!response.ok) {

      console.error(
        "SUPABASE REWARD ERROR:",
        responseText
      );

      return res
        .status(500)
        .send("Reward processing failed");

    }


    /* =========================
       SUCCESS
    ========================= */

    console.log(
      "MONETAG REWARD CONFIRMED:",
      {
        ymid,
        zoneId,
        eventType,
        rewardEventType,
        estimatedPrice,
        response: responseText
      }
    );


    return res
      .status(200)
      .send("OK");


  } catch (error) {

    console.error(
      "MONETAG POSTBACK ERROR:",
      error
    );

    return res
      .status(500)
      .send("Internal server error");

  }

}
