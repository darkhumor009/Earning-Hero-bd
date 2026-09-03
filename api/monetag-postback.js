export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  try {

    const {
      ymid,
      zone,
      event,
      value,
      amount
    } = req.query;


    const supabaseUrl =
      process.env.SUPABASE_URL;

    const supabaseKey =
      process.env.SUPABASE_SECRET_KEY;


    if (!supabaseUrl || !supabaseKey) {
      return res
        .status(500)
        .send("Server configuration error");
    }


    /* =========================
       BASIC VALIDATION
    ========================= */

    if (!ymid) {
      return res
        .status(400)
        .send("Missing ymid");
    }


    if (String(zone) !== "11720389") {
      return res
        .status(400)
        .send("Invalid zone");
    }


    /* =========================
       MONETAG DATA
    ========================= */

    const eventType =
      String(event || "");

    const rewardEventType =
      String(value || "");

    const estimatedPrice =
      Number(amount || 0);


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
              eventType,

            p_reward_event_type:
              rewardEventType,

            p_estimated_price:
              estimatedPrice,

            p_zone_id:
              11720389

          })
        }
      );


    const responseText =
      await response.text();


    if (!response.ok) {

      console.error(
        "SUPABASE REWARD ERROR:",
        responseText
      );

      return res
        .status(500)
        .send("Reward processing failed");

    }


    console.log(
      "MONETAG REWARD CONFIRMED:",
      {
        ymid,
        zone,
        event,
        value,
        amount
      }
    );


    /*
      IMPORTANT:
      Always return HTTP 200 after
      successful Supabase processing.
    */

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
