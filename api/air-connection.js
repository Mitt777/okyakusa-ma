const { readJsonBody, sendJson } = require("./_lib/response");

function cleanText(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

function safeSegment(value, fallback = "connection") {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64) || fallback;
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return sendJson(response, 405, { ok: false, message: "POSTのみ対応しています。" });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return sendJson(response, 503, {
        ok: false,
        code: "blob_not_configured",
        message: "Vercel Blobが未設定です。"
      });
    }

    const body = await readJsonBody(request);
    const createdAt = new Date().toISOString();
    const officialAirId = safeSegment(body.officialAirId || body.officialRequestId, "official");
    const connectionId = safeSegment(body.connectionId, `conn_${Date.now().toString(36)}`);
    const record = {
      v: 1,
      connectionId,
      officialAirId,
      officialRequestId: cleanText(body.officialRequestId, 80),
      officialCardUrl: safeUrl(body.officialCardUrl),
      customerAirId: safeSegment(body.customerAirId, "customer"),
      storeName: cleanText(body.storeName || "このお店", 100),
      customerLabel: cleanText(body.customerLabel || "air-sユーザー", 80),
      comment: cleanText(body.comment || "このお店の空気を残しました。", 240),
      status: "requested",
      createdAt
    };

    const { put } = await import("@vercel/blob");
    const pathname = `airs/connections/${officialAirId}/${connectionId}.json`;
    const blob = await put(pathname, JSON.stringify(record, null, 2), {
      access: "public",
      addRandomSuffix: false,
      contentType: "application/json; charset=utf-8"
    });

    return sendJson(response, 200, {
      ok: true,
      record,
      url: blob.url,
      pathname: blob.pathname
    });
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      message: error.message || "つながり申請を保存できませんでした。"
    });
  }
};
