const { readJsonBody, sendJson } = require("./_lib/response");

const MAX_TEXT = 240;
const ALLOWED_KINDS = new Set(["customer", "official"]);

function safeSegment(value, fallback = "airs") {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64) || fallback;
}

function cleanText(value, max = MAX_TEXT) {
  return String(value || "").trim().slice(0, max);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

function buildAirsRecord(body) {
  const kind = ALLOWED_KINDS.has(body.kind) ? body.kind : "customer";
  const createdAt = new Date().toISOString();
  const storeName = cleanText(body.storeName || "好きなお店", 80);
  const requestId = cleanText(body.requestId, 80);
  const airId = safeSegment(body.airId, `airs_${Date.now().toString(36)}`);
  return {
    v: 1,
    airId,
    kind,
    storeName,
    requestId,
    officialCardUrl: safeUrl(body.officialCardUrl || body.sourceUrl),
    sourceUrl: safeUrl(body.sourceUrl || body.officialCardUrl),
    personaKey: cleanText(body.personaKey, 32),
    image: safeUrl(body.image) || cleanText(body.image, 180),
    comment: cleanText(body.comment, MAX_TEXT),
    timeLabel: cleanText(body.timeLabel, 40),
    createdAt
  };
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
    const record = buildAirsRecord(body || {});
    const { put } = await import("@vercel/blob");
    const folder = record.kind === "official" ? "official" : "posts";
    const storeSegment = safeSegment(record.requestId || record.storeName, "store");
    const pathname = `airs/${folder}/${storeSegment}/${record.airId}.json`;
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
      message: error.message
    });
  }
};
