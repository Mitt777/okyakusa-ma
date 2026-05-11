const EXPECTED_SECRET = "CHANGE_ME";

const SHEETS = {
  requests: [
    "request_id",
    "created_at",
    "status",
    "store_name",
    "area",
    "category",
    "google_maps_url",
    "website_url",
    "instagram_url",
    "sns_url",
    "current_problem",
    "owner_name",
    "email",
    "user_agent",
    "source"
  ],
  store_identity: [
    "request_id",
    "identity_status",
    "matched_store_name",
    "matched_address",
    "matched_phone",
    "maps_category",
    "website_match",
    "sns_match",
    "identity_notes"
  ],
  scores: [
    "request_id",
    "total_score",
    "maps_score",
    "review_score",
    "meo_score",
    "seo_score",
    "geo_score",
    "instagram_score",
    "sns_video_score",
    "previsit_anxiety_score",
    "save_score",
    "plan_score",
    "impulse_score",
    "worldview_score",
    "borrowed_scenery_score",
    "own_charm_conversion_score",
    "cx_score",
    "strongest_axis",
    "weakest_axis",
    "top_fix",
    "video_idea_1",
    "video_idea_2",
    "video_idea_3"
  ],
  reports: [
    "request_id",
    "short_id",
    "report_status",
    "report_path",
    "report_title",
    "published_at",
    "line_share_text",
    "email_subject",
    "email_body",
    "paid_cta_type",
    "stripe_product_key",
    "payment_status",
    "stripe_customer_id",
    "stripe_checkout_session_id",
    "stripe_subscription_id"
  ],
  maps_observations: [
    "request_id",
    "created_at",
    "query",
    "identity_status",
    "identity_score",
    "matched_place_id",
    "matched_store_name",
    "matched_address",
    "maps_category",
    "rating",
    "user_rating_count",
    "website_uri",
    "phone",
    "google_maps_uri",
    "photos_count",
    "maps_score",
    "maps_strengths",
    "maps_weaknesses",
    "maps_quick_fixes",
    "raw_json"
  ],
  ai_diagnoses: [
    "request_id",
    "created_at",
    "generated_by",
    "store_name",
    "total_score",
    "maps_score",
    "review_score",
    "meo_score",
    "seo_score",
    "geo_score",
    "previsit_anxiety_score",
    "save_score",
    "plan_score",
    "impulse_score",
    "worldview_score",
    "cx_score",
    "summary",
    "strengths",
    "weaknesses",
    "top_fix",
    "video_ideas",
    "raw_json"
  ],
  monthly_reports: [
    "request_id",
    "created_at",
    "month",
    "store_name",
    "status",
    "maps_rating",
    "maps_review_count",
    "maps_score",
    "total_score",
    "this_month_focus",
    "action_items",
    "video_plan",
    "next_review_questions",
    "raw_json"
  ],
  api_errors: [
    "request_id",
    "created_at",
    "message",
    "raw_json"
  ]
};

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");

    if (EXPECTED_SECRET !== "CHANGE_ME" && payload.secret !== EXPECTED_SECRET) {
      return json_({ ok: false, message: "Invalid secret" }, 403);
    }

    const record = payload.record || {};
    setupSheets();

    const headers = SHEETS.requests;
    const sheet = getSheet_("requests", headers);
    const row = headers.map((header) => record[header] || "");
    sheet.appendRow(row);

    if (payload.places_observation) {
      appendMapsObservation_(record.request_id, payload.places_observation);
    }

    if (payload.ai_diagnosis) {
      appendAiDiagnosis_(record.request_id, payload.ai_diagnosis);
    }

    if (payload.monthly_report) {
      appendMonthlyReport_(record.request_id, payload.monthly_report);
    }

    if (payload.enrichment_error) {
      appendApiError_(record.request_id, payload.enrichment_error);
    }

    return json_({ ok: true, request_id: record.request_id });
  } catch (error) {
    return json_({ ok: false, message: error.message }, 500);
  }
}

function doGet(e) {
  try {
    const params = e.parameter || {};

    if (EXPECTED_SECRET !== "CHANGE_ME" && params.secret !== EXPECTED_SECRET) {
      return json_({ ok: false, message: "Invalid secret" }, 403);
    }

    if (params.action !== "report") {
      return json_({ ok: false, message: "Unknown action" }, 400);
    }

    const requestId = params.request_id || "";
    if (!requestId) {
      return json_({ ok: false, message: "request_id is required" }, 400);
    }

    setupSheets();

    const report = buildReportPayload_(requestId);
    if (!report.request) {
      return json_({ ok: false, message: "Report not found", request_id: requestId }, 404);
    }

    return json_({
      ok: true,
      request_id: requestId,
      report: report
    });
  } catch (error) {
    return json_({ ok: false, message: error.message }, 500);
  }
}

function appendMapsObservation_(requestId, observation) {
  const sheet = getSheet_("maps_observations", SHEETS.maps_observations);
  const primary = observation.primary_place || {};
  const report = observation.maps_report || {};
  const row = [
    requestId,
    new Date(),
    observation.query || "",
    observation.identity && observation.identity.status || "",
    observation.identity && observation.identity.score || "",
    primary.place_id || "",
    primary.name || "",
    primary.address || "",
    primary.primary_type_label || primary.primary_type || "",
    primary.rating || "",
    primary.user_rating_count || "",
    primary.website_uri || "",
    primary.phone || "",
    primary.google_maps_uri || "",
    primary.photos_count || "",
    report.maps_score || "",
    stringify_(report.strengths),
    stringify_(report.weaknesses),
    stringify_(report.quick_fixes),
    stringify_(observation)
  ];
  sheet.appendRow(row);
}

function buildReportPayload_(requestId) {
  const request = findLatestRow_("requests", requestId);
  const maps = findLatestRow_("maps_observations", requestId);
  const diagnosis = findLatestRow_("ai_diagnoses", requestId);
  const monthly = findLatestRow_("monthly_reports", requestId);
  const apiError = findLatestRow_("api_errors", requestId);

  return {
    request: request,
    maps_observation: maps,
    ai_diagnosis: diagnosis,
    monthly_report: monthly,
    api_error: apiError,
    raw: {
      maps_observation: parseJsonSafe_(maps && maps.raw_json),
      ai_diagnosis: parseJsonSafe_(diagnosis && diagnosis.raw_json),
      monthly_report: parseJsonSafe_(monthly && monthly.raw_json),
      api_error: parseJsonSafe_(apiError && apiError.raw_json)
    }
  };
}

function findLatestRow_(sheetName, requestId) {
  const headers = SHEETS[sheetName];
  const sheet = getSheet_(sheetName, headers);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;

  const requestIdIndex = headers.indexOf("request_id");
  let found = null;

  for (let i = 1; i < values.length; i += 1) {
    if (String(values[i][requestIdIndex]) === String(requestId)) {
      found = rowToObject_(headers, values[i]);
    }
  }

  return found;
}

function rowToObject_(headers, row) {
  const object = {};
  headers.forEach((header, index) => {
    const value = row[index];
    object[header] = value instanceof Date ? value.toISOString() : value;
  });
  return object;
}

function appendAiDiagnosis_(requestId, aiResult) {
  const diagnosis = aiResult.diagnosis || aiResult;
  const scores = diagnosis.scores || {};
  const sheet = getSheet_("ai_diagnoses", SHEETS.ai_diagnoses);
  const row = [
    requestId,
    new Date(),
    diagnosis.generated_by || aiResult.model || "",
    diagnosis.store_name || "",
    diagnosis.total_score || "",
    scores.maps_score || "",
    scores.review_score || "",
    scores.meo_score || "",
    scores.seo_score || "",
    scores.geo_score || "",
    scores.previsit_anxiety_score || "",
    scores.save_score || "",
    scores.plan_score || "",
    scores.impulse_score || "",
    scores.worldview_score || "",
    scores.cx_score || "",
    diagnosis.summary || "",
    stringify_(diagnosis.strengths),
    stringify_(diagnosis.weaknesses),
    diagnosis.top_fix || "",
    stringify_(diagnosis.video_ideas),
    stringify_(aiResult)
  ];
  sheet.appendRow(row);
}

function appendMonthlyReport_(requestId, monthlyReport) {
  const metrics = monthlyReport.observed_metrics || {};
  const scores = monthlyReport.score_snapshot || {};
  const sheet = getSheet_("monthly_reports", SHEETS.monthly_reports);
  const row = [
    requestId,
    new Date(),
    monthlyReport.month || "",
    monthlyReport.store_name || "",
    monthlyReport.status || "",
    metrics.maps_rating || "",
    metrics.maps_review_count || "",
    metrics.maps_score || "",
    scores.total_score || "",
    monthlyReport.this_month_focus || "",
    stringify_(monthlyReport.action_items),
    stringify_(monthlyReport.video_plan),
    stringify_(monthlyReport.next_review_questions),
    stringify_(monthlyReport)
  ];
  sheet.appendRow(row);
}

function appendApiError_(requestId, error) {
  const sheet = getSheet_("api_errors", SHEETS.api_errors);
  sheet.appendRow([
    requestId,
    new Date(),
    error.message || "",
    stringify_(error)
  ]);
}

function setupSheets() {
  Object.keys(SHEETS).forEach((sheetName) => {
    getSheet_(sheetName, SHEETS[sheetName]);
  });
}

function getSheet_(sheetName, headers) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const hasHeaders = firstRow.some(Boolean);

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function json_(data, statusCode) {
  return ContentService
    .createTextOutput(JSON.stringify({ ...data, statusCode }))
    .setMimeType(ContentService.MimeType.JSON);
}

function stringify_(value) {
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

function parseJsonSafe_(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}
