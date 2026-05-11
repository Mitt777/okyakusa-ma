const SHEET_NAME = "requests";
const EXPECTED_SECRET = "CHANGE_ME";

const HEADERS = [
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
];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || "{}");

    if (EXPECTED_SECRET !== "CHANGE_ME" && payload.secret !== EXPECTED_SECRET) {
      return json_({ ok: false, message: "Invalid secret" }, 403);
    }

    const record = payload.record || {};
    const sheet = getSheet_();
    const row = HEADERS.map((header) => record[header] || "");
    sheet.appendRow(row);

    return json_({ ok: true, request_id: record.request_id });
  } catch (error) {
    return json_({ ok: false, message: error.message }, 500);
  }
}

function getSheet_() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  const firstRow = sheet.getRange(1, 1, 1, HEADERS.length).getValues()[0];
  const hasHeaders = firstRow.some(Boolean);

  if (!hasHeaders) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function json_(data, statusCode) {
  return ContentService
    .createTextOutput(JSON.stringify({ ...data, statusCode }))
    .setMimeType(ContentService.MimeType.JSON);
}
