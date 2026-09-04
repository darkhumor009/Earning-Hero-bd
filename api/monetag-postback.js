import crypto from "crypto";

export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  try {

    /* =========================
       GET MONETAG PARAMETERS
    ========================= */

    const {
      ymid,
      event_type,
      zone_id,
      request_var,
      telegram_id,
      reward_event_type,
      estimated_price
    } = req.query;


    /* =========================
       SUPABASE CONFIG
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
       LOG POSTBACK
    ========================= */

    console.log(
      "MONETAG POSTBACK RECEIVED:",
      {
        ymid,
        event_type,
        zone_id,
        request_var,
        telegram_id,
        reward_event_type,
        estimated_price
      }
    );


    /* =========================
       CHECK YMID
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


    /* =========================
       CHECK ZONE
    ========================= */

    if (String(zone_id) !== "11720389") {

      console.error(
        "POSTBACK ERROR: Invalid zone",
        zone_id
      );

      return res
        .status(400)
        .send("Invalid zone");
    }


    /* =========================
       ONLY IMPRESSION
    ========================= */

    if (String(event_type) !== "impression") {

      console.log(
        "Ignoring non-impression event:",
        event_type
      );

      return res
        .status(200)
        .send("OK");
    }


    /* =========================
       REWARD EVENT
       
       Monetag documentation:
       yes = paid
       no  = unpaid
    ========================= */

    const rewardType =
      String(reward_event_type || "")
        .toLowerCase()
        .trim();


    if (rewardType !== "yes") {

      console.log(
        "Ignoring unpaid event:",
        rewardType
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
            apikey: supabaseKey,

            Authorization:
              `Bearer ${supabaseKey}`,

            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({

            p_ymid:
              String(ymid),

            p_event_type:
              String(event_type),

            p_reward_event_type:
              String(reward_event_type),

            p_estimated_price:
              Number(estimated_price || 0),

            p_zone_id:
              Number(zone_id)

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
       SUCCESS LOG
    ========================= */

    console.log(
      "MONETAG REWARD CONFIRMED:",
      {
        ymid,
        event_type,
        zone_id,
        reward_event_type,
        estimated_price,
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
