const { readJsonBody, sendJson } = require("./_lib/response");
const crypto = require("crypto");

const MAX_TEXT = 240;
const ALLOWED_KINDS = new Set(["customer", "official"]);
const ALLOWED_VISIBILITY = new Set(["private", "link", "public"]);
const ENTRY_PHOTO_SLOTS = new Set(["exterior", "entrance", "access"]);
const CONNECTION_STATUSES = new Set(["requested", "approved", "published", "hidden"]);

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

function stableHash(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex")
    .slice(0, 16);
}

function cardSerial(kind, storeName, createdAt) {
  const prefix = kind === "official" ? "OKC" : "AIR";
  const date = createdAt.slice(0, 10).replace(/-/g, "");
  const store = safeSegment(storeName, "store").slice(0, 10).toUpperCase();
  return `${prefix}-${date}-${store}-${Date.now().toString(36).toUpperCase()}`;
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
  const baseRecord = {
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
    createdAt,
    firstPublishedAt: kind === "official" ? createdAt : "",
    version: 1,
    editionType: cleanText(body.editionType || (kind === "official" ? "official_beta" : "memory_beta"), 40),
    editionLabel: cleanText(body.editionLabel || (kind === "official" ? "公式ページβ" : "air-s β"), 80),
    cardSerial: cleanText(body.cardSerial, 80) || cardSerial(kind, storeName, createdAt)
  };
  return {
    ...baseRecord,
    contentHash: stableHash(baseRecord)
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

function normalizeConnectionStatus(value) {
  return CONNECTION_STATUSES.has(value) ? value : "requested";
}

function parseImageDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) return null;
  const mimeType = match[1] === "image/jpg" ? "image/jpeg" : match[1];
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > 1_400_000) return null;
  const ext = mimeType === "image/webp" ? "webp" : mimeType === "image/png" ? "png" : "jpg";
  return { bytes, mimeType, ext };
}

function buildEntryPhotoRecord(body, imageUrl, pathname) {
  const createdAt = new Date().toISOString();
  const slot = ENTRY_PHOTO_SLOTS.has(body.slot) ? body.slot : "exterior";
  const storeName = cleanText(body.storeName || "このお店", 100);
  const requestId = cleanText(body.requestId, 80);
  const baseRecord = {
    v: 1,
    kind: "entry_photo",
    slot,
    storeName,
    requestId,
    title: cleanText(body.title || "", 40),
    caption: cleanText(body.caption || "", 140),
    imageUrl,
    imagePathname: pathname,
    visibility: "public_card",
    createdAt,
    version: 1,
    editionType: "entry_ease_photo",
    editionLabel: "入りやすさ写真β"
  };
  return {
    ...baseRecord,
    contentHash: stableHash(baseRecord)
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

async function fetchBlobRecord(blob) {
  const blobResponse = await fetch(blob.url);
  return blobResponse.json();
}

async function listEntryPhotos({ storeName, requestId, limit = 150 }) {
  const { list } = await import("@vercel/blob");
  const result = await list({ prefix: "airs/entry-photos/", limit });
  const blobs = result.blobs || [];
  const photos = [];
  for (const blob of blobs) {
    if (!blob.pathname.endsWith(".json")) continue;
    try {
      const record = await fetchBlobRecord(blob);
      if (matchesAdminRecord(record, storeName, requestId)) {
        photos.push({
          slot: record.slot || "",
          storeName: record.storeName || storeName,
          requestId: record.requestId || "",
          title: record.title || "",
          caption: record.caption || "",
          imageUrl: record.imageUrl || "",
          createdAt: record.createdAt || "",
          contentHash: record.contentHash || "",
          pathname: blob.pathname,
          url: blob.url
        });
      }
    } catch {
      // Ignore malformed beta records.
    }
  }
  const slotOrder = { exterior: 1, entrance: 2, access: 3 };
  return photos.sort((a, b) => (slotOrder[a.slot] || 9) - (slotOrder[b.slot] || 9));
}

function matchesAdminRecord(record, storeName, requestId) {
  if (requestId && compact(record.requestId || record.officialRequestId) === requestId) return true;
  return isLikelyMatch(record, storeName, "");
}

async function handleAdminLookup(request, response) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(response, 200, {
      ok: true,
      configured: false,
      officials: [],
      connections: [],
      entryPhotos: []
    });
  }

  const storeName = compact(request.query?.store || request.query?.storeName);
  const requestId = compact(request.query?.requestId || request.query?.id);
  if (!storeName && !requestId) {
    return sendJson(response, 400, { ok: false, message: "storeまたはrequestIdが必要です。" });
  }

  const { list } = await import("@vercel/blob");
  const officialsResult = await list({ prefix: "airs/official/", limit: 150 });
  const officialBlobs = officialsResult.blobs || [];
  const officials = [];
  const officialIds = new Set();

  for (const blob of officialBlobs) {
    try {
      const record = await fetchBlobRecord(blob);
      if (matchesAdminRecord(record, storeName, requestId)) {
        const official = {
          airId: record.airId || "",
          storeName: record.storeName || storeName,
          requestId: record.requestId || "",
          officialCardUrl: record.officialCardUrl || record.sourceUrl || "",
          ownerEmail: record.ownerEmail || "",
          image: record.image || "",
          comment: record.comment || "",
          timeLabel: record.timeLabel || "",
          createdAt: record.createdAt || "",
          cardSerial: record.cardSerial || "",
          contentHash: record.contentHash || "",
          editionType: record.editionType || "",
          editionLabel: record.editionLabel || "",
          pathname: blob.pathname,
          url: blob.url
        };
        officials.push(official);
        if (official.airId) officialIds.add(official.airId);
      }
    } catch {
      // Ignore malformed beta records.
    }
  }

  const connectionsResult = await list({ prefix: "airs/connections/", limit: 150 });
  const connectionBlobs = connectionsResult.blobs || [];
  const connections = [];
  for (const blob of connectionBlobs) {
    try {
      const record = await fetchBlobRecord(blob);
      const officialMatch = officialIds.has(record.officialAirId);
      if (officialMatch || matchesAdminRecord(record, storeName, requestId)) {
        connections.push({
          connectionId: record.connectionId || "",
          officialAirId: record.officialAirId || "",
          officialRequestId: record.officialRequestId || "",
          officialCardUrl: record.officialCardUrl || "",
          customerAirId: record.customerAirId || "",
          storeName: record.storeName || storeName,
          customerLabel: record.customerLabel || "air-sユーザー",
          comment: record.comment || "",
          status: record.status || "requested",
          createdAt: record.createdAt || "",
          pathname: blob.pathname,
          url: blob.url
        });
      }
    } catch {
      // Ignore malformed beta records.
    }
  }

  const entryPhotos = await listEntryPhotos({ storeName, requestId });

  return sendJson(response, 200, {
    ok: true,
    configured: true,
    officials,
    connections,
    entryPhotos,
    counts: {
      officials: officials.length,
      connections: connections.length,
      entryPhotos: entryPhotos.length
    }
  });
}

async function listConnections({ storeName, requestId, statuses = null, limit = 150 }) {
  const { list } = await import("@vercel/blob");
  const result = await list({ prefix: "airs/connections/", limit });
  const blobs = result.blobs || [];
  const connections = [];
  for (const blob of blobs) {
    try {
      const record = await fetchBlobRecord(blob);
      const status = normalizeConnectionStatus(record.status);
      const statusMatch = !statuses || statuses.has(status);
      if (statusMatch && matchesAdminRecord(record, storeName, requestId)) {
        connections.push({
          connectionId: record.connectionId || "",
          officialAirId: record.officialAirId || "",
          officialRequestId: record.officialRequestId || "",
          officialCardUrl: record.officialCardUrl || "",
          customerAirId: record.customerAirId || "",
          storeName: record.storeName || storeName,
          customerLabel: record.customerLabel || "air-sユーザー",
          comment: record.comment || "",
          status,
          createdAt: record.createdAt || "",
          approvedAt: record.approvedAt || "",
          publishedAt: record.publishedAt || "",
          contentHash: record.contentHash || "",
          pathname: blob.pathname,
          url: blob.url
        });
      }
    } catch {
      // Ignore malformed beta records.
    }
  }
  return connections.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function handlePublishedConnectionsLookup(request, response) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(response, 200, { ok: true, configured: false, connections: [] });
  }
  const storeName = compact(request.query?.store || request.query?.storeName);
  const requestId = compact(request.query?.requestId || request.query?.id);
  if (!storeName && !requestId) {
    return sendJson(response, 400, { ok: false, message: "storeまたはrequestIdが必要です。" });
  }
  const connections = await listConnections({
    storeName,
    requestId,
    statuses: new Set(["approved", "published"]),
    limit: 150
  });
  return sendJson(response, 200, { ok: true, configured: true, connections });
}

async function handleEntryPhotosLookup(request, response) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(response, 200, { ok: true, configured: false, entryPhotos: [] });
  }
  const storeName = compact(request.query?.store || request.query?.storeName);
  const requestId = compact(request.query?.requestId || request.query?.id);
  if (!storeName && !requestId) {
    return sendJson(response, 400, { ok: false, message: "storeまたはrequestIdが必要です。" });
  }
  const entryPhotos = await listEntryPhotos({ storeName, requestId, limit: 120 });
  return sendJson(response, 200, { ok: true, configured: true, entryPhotos });
}

async function handleEntryPhotoSave(request, response) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(response, 503, {
      ok: false,
      code: "blob_not_configured",
      message: "Vercel Blobが未設定です。"
    });
  }

  const body = await readJsonBody(request);
  const image = parseImageDataUrl(body.imageDataUrl);
  if (!image) {
    return sendJson(response, 400, { ok: false, message: "画像を1.4MB以下のJPEG/PNG/WebPで送信してください。" });
  }

  const { put } = await import("@vercel/blob");
  const slot = ENTRY_PHOTO_SLOTS.has(body.slot) ? body.slot : "exterior";
  const storeSegment = safeSegment(body.requestId || body.storeName, "store");
  const stamp = Date.now().toString(36);
  const imagePathname = `airs/entry-photos/${storeSegment}/${slot}-${stamp}.${image.ext}`;
  const imageBlob = await put(imagePathname, image.bytes, {
    access: "public",
    addRandomSuffix: false,
    contentType: image.mimeType
  });
  const record = buildEntryPhotoRecord(body || {}, imageBlob.url, imageBlob.pathname);
  const recordPathname = `airs/entry-photos/${storeSegment}/${slot}.json`;
  const recordBlob = await put(recordPathname, JSON.stringify(record, null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json; charset=utf-8"
  });

  return sendJson(response, 200, {
    ok: true,
    record,
    url: recordBlob.url,
    pathname: recordBlob.pathname
  });
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

async function handleConnectionStatusUpdate(request, response) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(response, 503, {
      ok: false,
      code: "blob_not_configured",
      message: "Vercel Blobが未設定です。"
    });
  }

  const body = await readJsonBody(request);
  const connectionId = safeSegment(body.connectionId, "");
  const pathname = String(body.pathname || "");
  const nextStatus = normalizeConnectionStatus(body.status);
  if (!connectionId && !pathname) {
    return sendJson(response, 400, { ok: false, message: "connectionIdが必要です。" });
  }

  const { list, put } = await import("@vercel/blob");
  const result = await list({ prefix: "airs/connections/", limit: 200 });
  const target = (result.blobs || []).find((blob) => {
    if (pathname && blob.pathname === pathname) return true;
    return connectionId && blob.pathname.endsWith(`/${connectionId}.json`);
  });
  if (!target) {
    return sendJson(response, 404, { ok: false, message: "つながり申請が見つかりませんでした。" });
  }

  const existing = await fetchBlobRecord(target);
  const updatedAt = new Date().toISOString();
  const updated = {
    ...existing,
    status: nextStatus,
    updatedAt,
    approvedAt: ["approved", "published"].includes(nextStatus) ? (existing.approvedAt || updatedAt) : existing.approvedAt || "",
    publishedAt: nextStatus === "published" ? (existing.publishedAt || updatedAt) : existing.publishedAt || ""
  };
  updated.contentHash = stableHash(updated);

  const blob = await put(target.pathname, JSON.stringify(updated, null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json; charset=utf-8"
  });

  return sendJson(response, 200, {
    ok: true,
    record: updated,
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
    if (request.method === "GET" && action === "admin") {
      return handleAdminLookup(request, response);
    }
    if (request.method === "GET" && action === "entry-photos") {
      return handleEntryPhotosLookup(request, response);
    }
    if (request.method === "GET" && action === "published-connections") {
      return handlePublishedConnectionsLookup(request, response);
    }
    if (request.method === "POST" && action === "connect") {
      return handleConnectionRequest(request, response);
    }
    if (request.method === "POST" && action === "connection-status") {
      return handleConnectionStatusUpdate(request, response);
    }
    if (request.method === "POST" && action === "entry-photo") {
      return handleEntryPhotoSave(request, response);
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
