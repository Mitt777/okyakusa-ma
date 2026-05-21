const { readJsonBody, sendJson } = require("./_lib/response");

const MAX_TEXT = 240;
const ALLOWED_KINDS = new Set(["customer", "official"]);
const ALLOWED_VISIBILITY = new Set(["private", "link", "public"]);

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

function compact(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return compact(value)
    .toLowerCase()
    .replace(/[\s　]+/g, "")
    .replace(/[・･.,，。]/g, "");
}

function isLikelyMatch(record, storeName, placeId) {
  const recordPlaceId = compact(record.placeId);
  if (placeId && recordPlaceId && placeId === recordPlaceId) return true;
  const target = normalize(storeName);
  const source = normalize(record.storeName);
  if (!target || !source) return false;
  return target === source || target.includes(source) || source.includes(target);
}

function buildAirsRecord(body) {
  const kind = ALLOWED_KINDS.has(body.kind) ? body.kind : "customer";
  const createdAt = new Date().toISOString();
  const storeName = cleanText(body.storeName || "好きなお店", 80);
  const requestId = cleanText(body.requestId, 80);
  const airId = safeSegment(body.airId, `airs_${Date.now().toString(36)}`);
  const visibility = ALLOWED_VISIBILITY.has(body.visibility) ? body.visibility : "private";
  return {
    v: 1,
    airId,
    kind,
    visibility,
    storeName,
    requestId,
    placeId: cleanText(body.placeId, 120),
    address: cleanText(body.address, 180),
    category: cleanText(body.category, 80),
    rating: Number.isFinite(Number(body.rating)) ? Number(body.rating) : null,
    ownerEmail: cleanText(body.ownerEmail || body.email, 160),
    officialCardUrl: safeUrl(body.officialCardUrl || body.sourceUrl),
    sourceUrl: safeUrl(body.sourceUrl || body.officialCardUrl),
    personaKey: cleanText(body.personaKey, 32),
    image: safeUrl(body.image) || cleanText(body.image, 180),
    comment: cleanText(body.comment, MAX_TEXT),
    timeLabel: cleanText(body.timeLabel, 40),
    createdAt
  };
}

function buildConnectionRecord(body) {
  const createdAt = new Date().toISOString();
  const officialAirId = safeSegment(body.officialAirId || body.officialRequestId, "official");
  const connectionId = safeSegment(body.connectionId, `conn_${Date.now().toString(36)}`);
  return {
    v: 1,
    connectionId,
    officialAirId,
    officialRequestId: cleanText(body.officialRequestId, 80),
    officialCardUrl: safeUrl(body.officialCardUrl),
    customerAirId: safeSegment(body.customerAirId, "customer"),
    storeName: cleanText(body.storeName || "このお店", 100),
    customerLabel: cleanText(body.customerLabel || "air-sユーザー", 80),
    comment: cleanText(body.comment || "このお店の空気を残しました。", MAX_TEXT),
    status: "requested",
    createdAt
  };
}

async function handleOfficialLookup(request, response) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(response, 200, { ok: true, official: null, configured: false });
  }

  const storeName = compact(request.query?.store || request.query?.storeName);
  const placeId = compact(request.query?.placeId);
  if (!storeName && !placeId) {
    return sendJson(response, 400, { ok: false, message: "storeまたはplaceIdが必要です。" });
  }

  const { list } = await import("@vercel/blob");
  const result = await list({ prefix: "airs/official/", limit: 100 });
  const blobs = result.blobs || [];
  for (const blob of blobs) {
    try {
      const blobResponse = await fetch(blob.url);
      const record = await blobResponse.json();
      if (isLikelyMatch(record, storeName, placeId)) {
        return sendJson(response, 200, {
          ok: true,
          configured: true,
          official: {
            airId: record.airId || "",
            storeName: record.storeName || storeName,
            requestId: record.requestId || "",
            officialCardUrl: record.officialCardUrl || record.sourceUrl || "",
            image: record.image || "",
            personaKey: record.personaKey || "",
            timeLabel: record.timeLabel || "",
            pathname: blob.pathname,
            url: blob.url
          }
        });
      }
    } catch {
      // Ignore malformed beta records and keep looking.
    }
  }

  return sendJson(response, 200, { ok: true, configured: true, official: null });
}

async function handleConnectionRequest(request, response) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(response, 503, {
      ok: false,
      code: "blob_not_configured",
      message: "Vercel Blobが未設定です。"
    });
  }

  const body = await readJsonBody(request);
  const record = buildConnectionRecord(body || {});
  const { put } = await import("@vercel/blob");
  const pathname = `airs/connections/${record.officialAirId}/${record.connectionId}.json`;
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
}

async function handleAirsSave(request, response) {
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
}

module.exports = async function handler(request, response) {
  try {
    const action = String(request.query?.action || "");
    if (request.method === "GET" && action === "official") {
      return handleOfficialLookup(request, response);
    }
    if (request.method === "POST" && action === "connect") {
      return handleConnectionRequest(request, response);
    }
    if (request.method === "POST") return handleAirsSave(request, response);
    return sendJson(response, 405, { ok: false, message: "対応していないメソッドです。" });
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      message: error.message
    });
  }
};
