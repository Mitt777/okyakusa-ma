const { sendJson } = require("./_lib/response");

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

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "GET") {
      return sendJson(response, 405, { ok: false, message: "GETのみ対応しています。" });
    }
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
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      message: error.message || "公式air-sを確認できませんでした。"
    });
  }
};
