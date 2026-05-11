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

    return json_({ ok: true, request_id: record.request_id });
  } catch (error) {
    return json_({ ok: false, message: error.message }, 500);
  }
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
