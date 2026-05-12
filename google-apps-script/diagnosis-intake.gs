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
    "detail_level",
    "business_status",
    "current_opening_hours",
    "secondary_hours_count",
    "price_level",
    "price_range",
    "parking_options",
    "payment_options",
    "accessibility_options",
    "service_options",
    "editorial_summary",
    "generative_summary",
    "review_summary",
    "reviews_count_returned",
    "maps_missing_items",
    "maps_checked_items",
    "maps_completion_score",
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
  const headers = getHeaders_(sheet);
  const primary = observation.primary_place || {};
  const report = observation.maps_report || {};
  const record = {
    request_id: requestId,
    created_at: new Date(),
    query: observation.query || "",
    identity_status: observation.identity && observation.identity.status || "",
    identity_score: observation.identity && observation.identity.score || "",
    matched_place_id: primary.place_id || "",
    matched_store_name: primary.name || "",
    matched_address: primary.address || "",
    maps_category: primary.primary_type_label || primary.primary_type || "",
    rating: primary.rating || "",
    user_rating_count: primary.user_rating_count || "",
    website_uri: primary.website_uri || "",
    phone: primary.phone || "",
    google_maps_uri: primary.google_maps_uri || "",
    photos_count: primary.photos_count || "",
    maps_score: report.maps_score || "",
    detail_level: observation.detail_level || "",
    business_status: primary.business_status || "",
    current_opening_hours: stringify_(primary.current_weekday_descriptions),
    secondary_hours_count: primary.secondary_hours_count || "",
    price_level: primary.price_level || "",
    price_range: stringify_(primary.price_range),
    parking_options: stringify_(primary.parking_options),
    payment_options: stringify_(primary.payment_options),
    accessibility_options: stringify_(primary.accessibility_options),
    service_options: stringify_(primary.service_options),
    editorial_summary: primary.editorial_summary || "",
    generative_summary: primary.generative_summary || "",
    review_summary: primary.review_summary || "",
    reviews_count_returned: primary.reviews_count_returned || "",
    maps_missing_items: stringify_(report.missing_items),
    maps_checked_items: stringify_(report.checked_items),
    maps_completion_score: report.completion_score || "",
    maps_strengths: stringify_(report.strengths),
    maps_weaknesses: stringify_(report.weaknesses),
    maps_quick_fixes: stringify_(report.quick_fixes),
    raw_json: stringify_(observation)
  };
  sheet.appendRow(headers.map((header) => record[header] || ""));
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
  const sheet = getSheet_(sheetName, SHEETS[sheetName]);
  const headers = getHeaders_(sheet);
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
  } else {
    const existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
    const missingHeaders = headers.filter((header) => existingHeaders.indexOf(header) === -1);
    if (missingHeaders.length > 0) {
      const startColumn = existingHeaders.filter(Boolean).length + 1;
      sheet.getRange(1, startColumn, 1, missingHeaders.length).setValues([missingHeaders]);
    }
  }

  return sheet;
}

function getHeaders_(sheet) {
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].filter(Boolean);
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
