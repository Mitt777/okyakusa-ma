const REQUIRED_FIELDS = ["store_query", "area", "category", "owner_name", "email"];
const { fetchPlacesObservation } = require("./_lib/places");
const { generateDiagnosisJson } = require("./_lib/gemini");
const { buildMonthlyReport } = require("./_lib/monthly");

function json(response, statusCode = 200) {
  return { response, statusCode };
}

function makeRequestId() {
  const alphabet = "23456789abcdefghijkmnopqrstuvwxyz";
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `req_${Date.now().toString(36)}_${suffix}`;
}

function normalizePayload(body) {
  const payload = {};
  for (const [key, value] of Object.entries(body || {})) {
    payload[key] = typeof value === "string" ? value.trim() : value;
  }
  return payload;
}

module.exports = async function handler(request, response) {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");

  function send(result) {
    response.status(result.statusCode).send(JSON.stringify(result.response));
  }

  if (request.method !== "POST") {
    return send(json({ ok: false, message: "POSTのみ対応しています。" }, 405));
  }

  let body;
  try {
    body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  } catch {
    return send(json({ ok: false, message: "送信内容を読み取れませんでした。" }, 400));
  }

  const payload = normalizePayload(body);

  if (payload.okm_hp_guard) {
    return send(json({ ok: true, request_id: makeRequestId() }));
  }

  const missing = REQUIRED_FIELDS.filter((field) => !payload[field]);
  if (missing.length > 0) {
    return send(json({ ok: false, message: "必須項目が不足しています。", missing }, 400));
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return send(json({ ok: false, message: "メールアドレスの形式を確認してください。" }, 400));
  }

  const requestId = makeRequestId();
  const record = {
    request_id: requestId,
    created_at: new Date().toISOString(),
    status: "受付",
    store_name: payload.store_query,
    area: payload.area,
    category: payload.category,
    google_maps_url: payload.google_maps_url || "",
    website_url: payload.website_url || "",
    target_keywords: payload.target_keywords || "",
    instagram_url: payload.instagram_url || "",
    sns_url: payload.sns_url || "",
    current_problem: payload.current_problem || "",
    owner_name: payload.owner_name,
    email: payload.email,
    user_agent: request.headers["user-agent"] || "",
    source: "okyakusa-ma.com"
  };

  let enrichment = {};
  if (process.env.AUTO_ENRICH_DIAGNOSIS === "true") {
    try {
      const places_observation = await fetchPlacesObservation(payload);
      const ai_diagnosis = await generateDiagnosisJson(payload, places_observation);
      const monthly_report = buildMonthlyReport(payload, places_observation, ai_diagnosis);
      enrichment = { places_observation, ai_diagnosis, monthly_report };
    } catch (error) {
      enrichment = {
        enrichment_error: {
          message: error.message,
          created_at: new Date().toISOString()
        }
      };
    }
  }

  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
  if (!scriptUrl) {
    return send(json({
      ok: true,
      request_id: requestId,
      stored: false,
      message: "受付IDを発行しました。Google Sheets連携は未設定です。"
    }));
  }

  try {
    const sheetResponse = await fetch(scriptUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        secret: process.env.GOOGLE_SCRIPT_SECRET || "",
        record,
        ...enrichment
      })
    });

    if (!sheetResponse.ok) {
      throw new Error(`Google Sheets連携でエラーが返りました: ${sheetResponse.status}`);
    }

    return send(json({
      ok: true,
      request_id: requestId,
      stored: true,
      enriched: Boolean(enrichment.places_observation || enrichment.ai_diagnosis || enrichment.monthly_report),
      enrichment_error: enrichment.enrichment_error || null
    }));
  } catch (error) {
    return send(json({
      ok: false,
      request_id: requestId,
      message: "受付データの保存に失敗しました。時間をおいて再度お試しください。",
      detail: error.message
    }, 502));
  }
};
