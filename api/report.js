const { sendJson } = require("./_lib/response");
const { fetchPlacesObservation } = require("./_lib/places");
const { generateDiagnosisJson } = require("./_lib/gemini");
const { buildMonthlyReport } = require("./_lib/monthly");

function hasReportData(report, key) {
  const value = report?.[key];
  return value && Object.values(value).some((item) => item !== "" && item !== null && item !== undefined);
}

function normalizeRequestForDiagnosis(request) {
  return {
    ...request,
    store_query: request.store_query || request.store_name || request.name || "",
    website_url: request.website_url || request.website || "",
    google_maps_url: request.google_maps_url || request.maps_url || "",
    instagram_url: request.instagram_url || "",
    youtube_url: request.youtube_url || "",
    facebook_url: request.facebook_url || "",
    line_url: request.line_url || "",
    x_url: request.x_url || "",
    tiktok_url: request.tiktok_url || "",
    sns_url: request.sns_url || ""
  };
}

async function enrichMissingReportData(report) {
  const request = normalizeRequestForDiagnosis(report.request || {});
  if (!request.store_query) return report;

  const needsMaps = !hasReportData(report, "maps_observation");
  const needsAi = !hasReportData(report, "ai_diagnosis");
  const needsMonthly = !hasReportData(report, "monthly_report");
  if (!needsMaps && !needsAi && !needsMonthly) return report;

  const placesObservation = needsMaps
    ? await fetchPlacesObservation(request)
    : (report.raw?.maps_observation || null);
  const aiDiagnosis = needsAi
    ? await generateDiagnosisJson(request, placesObservation)
    : (report.raw?.ai_diagnosis || report.ai_diagnosis || null);
  const monthlyReport = needsMonthly
    ? buildMonthlyReport(request, placesObservation, aiDiagnosis)
    : (report.raw?.monthly_report || report.monthly_report || null);

  return {
    ...report,
    maps_observation: needsMaps ? {
      maps_score: placesObservation?.maps_report?.maps_score ?? "",
      maps_category: placesObservation?.primary_place?.primary_type_label || placesObservation?.primary_place?.primary_type || "",
      matched_name: placesObservation?.primary_place?.name || "",
      matched_address: placesObservation?.primary_place?.address || "",
      rating: placesObservation?.primary_place?.rating ?? "",
      user_rating_count: placesObservation?.primary_place?.user_rating_count ?? "",
      google_maps_uri: placesObservation?.primary_place?.google_maps_uri || "",
      website_uri: placesObservation?.primary_place?.website_uri || "",
      photos_count: placesObservation?.primary_place?.photos_count ?? ""
    } : report.maps_observation,
    ai_diagnosis: needsAi ? {
      ...(aiDiagnosis?.diagnosis || aiDiagnosis || {}),
      generated_on_read: true
    } : report.ai_diagnosis,
    monthly_report: needsMonthly ? monthlyReport : report.monthly_report,
    raw: {
      ...(report.raw || {}),
      maps_observation: needsMaps ? placesObservation : report.raw?.maps_observation,
      ai_diagnosis: needsAi ? aiDiagnosis : report.raw?.ai_diagnosis,
      monthly_report: needsMonthly ? monthlyReport : report.raw?.monthly_report
    }
  };
}

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "GET") {
      return sendJson(response, 405, { ok: false, message: "GETのみ対応しています。" });
    }

    const id = request.query?.id || request.query?.request_id || "";
    if (!id) {
      return sendJson(response, 400, { ok: false, message: "idが必要です。" });
    }

    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
    if (!scriptUrl) {
      return sendJson(response, 500, { ok: false, message: "GOOGLE_SCRIPT_URLが未設定です。" });
    }

    const url = new URL(scriptUrl);
    url.searchParams.set("action", "report");
    url.searchParams.set("request_id", id);
    url.searchParams.set("secret", process.env.GOOGLE_SCRIPT_SECRET || "");

    const sheetResponse = await fetch(url.toString(), {
      method: "GET",
      headers: { "accept": "application/json" }
    });

    const text = await sheetResponse.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return sendJson(response, 502, {
        ok: false,
        message: "Apps Scriptの応答をJSONとして読み取れませんでした。",
        detail: text.slice(0, 500)
      });
    }

    if (!sheetResponse.ok || !data.ok) {
      return sendJson(response, data.statusCode || sheetResponse.status || 502, data);
    }

    let report = data.report || {};
    if (process.env.REPAIR_REPORT_ON_READ === "true") {
      try {
        report = await enrichMissingReportData(report);
      } catch (error) {
        report = {
          ...report,
          repair_error: {
            message: error.message,
            created_at: new Date().toISOString()
          }
        };
      }
    }
    return sendJson(response, 200, { ...data, report });
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      message: error.message
    });
  }
};
