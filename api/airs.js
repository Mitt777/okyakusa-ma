const { readJsonBody, sendJson } = require("./_lib/response");
const crypto = require("crypto");

const MAX_TEXT = 240;
const ALLOWED_KINDS = new Set(["customer", "official"]);
const ALLOWED_VISIBILITY = new Set(["private", "link", "public"]);
const ENTRY_PHOTO_SLOTS = new Set(["exterior", "entrance", "access"]);
const CONNECTION_STATUSES = new Set(["requested", "approved", "published", "hidden"]);
const EGO_NOTE_STATUSES = new Set(["draft", "published", "hidden"]);

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
  const serial = cleanText(body.cardSerial, 80) || cardSerial(kind, storeName, createdAt);
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
    photoUrl: safeUrl(body.photoUrl),
    photoPathname: cleanText(body.photoPathname, 180),
    photoVisibility: ALLOWED_VISIBILITY.has(body.photoVisibility) ? body.photoVisibility : "private",
    comment: cleanText(body.comment, MAX_TEXT),
    timeLabel: cleanText(body.timeLabel, 40),
    recoveryCore: cleanText(body.recoveryCore || body.recovery_core, 40),
    recovery_core: cleanText(body.recoveryCore || body.recovery_core, 40),
    feelingButton: cleanText(body.feelingButton || body.feeling_button, 80),
    feeling_button: cleanText(body.feelingButton || body.feeling_button, 80),
    feelingLabel: cleanText(body.feelingLabel || body.feeling_label, 120),
    feeling_label: cleanText(body.feelingLabel || body.feeling_label, 120),
    moodLabel: cleanText(body.moodLabel || body.mood_label, 80),
    mood_label: cleanText(body.moodLabel || body.mood_label, 80),
    revisitReason: cleanText(body.revisitReason || body.revisit_reason, 160),
    revisit_reason: cleanText(body.revisitReason || body.revisit_reason, 160),
    cardStyleSource: cleanText(body.cardStyleSource || body.card_style_source || "selected", 40),
    card_style_source: cleanText(body.cardStyleSource || body.card_style_source || "selected", 40),
    industrySkin: cleanText(body.industrySkin || body.industry_skin, 40),
    industry_skin: cleanText(body.industrySkin || body.industry_skin, 40),
    moodTime: cleanText(body.moodTime || body.mood_time, 40),
    mood_time: cleanText(body.moodTime || body.mood_time, 40),
    createdAt,
    created_at: createdAt,
    firstPublishedAt: kind === "official" ? createdAt : "",
    first_published_at: kind === "official" ? createdAt : "",
    officialVerifiedAt: kind === "official" ? cleanText(body.officialVerifiedAt || createdAt, 40) : "",
    official_verified_at: kind === "official" ? cleanText(body.officialVerifiedAt || createdAt, 40) : "",
    version: 1,
    editionType: cleanText(body.editionType || (kind === "official" ? "official_beta" : "memory_beta"), 40),
    edition_type: cleanText(body.editionType || (kind === "official" ? "official_beta" : "memory_beta"), 40),
    editionLabel: cleanText(body.editionLabel || (kind === "official" ? "公式ページβ" : "air-s β"), 80),
    edition_label: cleanText(body.editionLabel || (kind === "official" ? "公式ページβ" : "air-s β"), 80),
    sourceSnapshot: {
      sourceUrl: safeUrl(body.sourceUrl || body.officialCardUrl),
      officialCardUrl: safeUrl(body.officialCardUrl || body.sourceUrl),
      storeName,
      requestId,
      placeId: cleanText(body.placeId, 120),
      recoveryCore: cleanText(body.recoveryCore || body.recovery_core, 40),
      feelingButton: cleanText(body.feelingButton || body.feeling_button, 80),
      moodLabel: cleanText(body.moodLabel || body.mood_label, 80),
      revisitReason: cleanText(body.revisitReason || body.revisit_reason, 160),
      capturedAt: createdAt
    },
    source_snapshot: {
      sourceUrl: safeUrl(body.sourceUrl || body.officialCardUrl),
      officialCardUrl: safeUrl(body.officialCardUrl || body.sourceUrl),
      storeName,
      requestId,
      placeId: cleanText(body.placeId, 120),
      recoveryCore: cleanText(body.recoveryCore || body.recovery_core, 40),
      feelingButton: cleanText(body.feelingButton || body.feeling_button, 80),
      moodLabel: cleanText(body.moodLabel || body.mood_label, 80),
      revisitReason: cleanText(body.revisitReason || body.revisit_reason, 160),
      capturedAt: createdAt
    },
    cardSerial: serial,
    card_serial: serial
  };
  const contentHash = stableHash(baseRecord);
  return {
    ...baseRecord,
    contentHash,
    content_hash: contentHash
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
    created_at: createdAt,
    firstPublishedAt: createdAt,
    first_published_at: createdAt,
    version: 1,
    editionType: "entry_ease_photo",
    edition_type: "entry_ease_photo",
    editionLabel: "入りやすさ写真β",
    edition_label: "入りやすさ写真β",
    sourceSnapshot: {
      storeName,
      requestId,
      slot,
      capturedAt: createdAt
    },
    source_snapshot: {
      storeName,
      requestId,
      slot,
      capturedAt: createdAt
    }
  };
  const contentHash = stableHash(baseRecord);
  return {
    ...baseRecord,
    contentHash,
    content_hash: contentHash
  };
}

function buildAirsMapRecord(body) {
  const createdAt = new Date().toISOString();
  const items = Array.isArray(body.items) ? body.items.slice(0, 12) : [];
  const safeItems = items.map((item, index) => ({
    order: index + 1,
    storeName: cleanText(item.storeName || "好きな場所", 80),
    sourceUrl: safeUrl(item.sourceUrl),
    image: safeUrl(item.image) || cleanText(item.image, 180),
    photoUrl: item.includePhoto ? safeUrl(item.photoUrl) : "",
    comment: cleanText(item.comment || "この空気だった。", 180),
    timeLabel: cleanText(item.timeLabel, 40),
    recoveryCore: cleanText(item.recoveryCore || item.recovery_core, 40),
    feelingButton: cleanText(item.feelingButton || item.feeling_button, 80),
    feelingLabel: cleanText(item.feelingLabel || item.feeling_label, 120),
    moodLabel: cleanText(item.moodLabel || item.mood_label, 80),
    moodTime: cleanText(item.moodTime || item.mood_time, 40),
    revisitReason: cleanText(item.revisitReason || item.revisit_reason, 160),
    personaKey: cleanText(item.personaKey, 32),
    placeId: cleanText(item.placeId, 120),
    cardSerial: cleanText(item.cardSerial, 80)
  }));
  const mapId = safeSegment(body.mapId, `map_${Date.now().toString(36)}`);
  const serial = cleanText(body.cardSerial, 80) || cardSerial("customer", body.title || "airs-map", createdAt);
  const baseRecord = {
    v: 1,
    kind: "airs_map",
    mapId,
    visibility: "link",
    title: cleanText(body.title || "私のair-s Map", 80),
    note: cleanText(body.note || "好きだった場所の空気を、少しだけ束ねました。", 180),
    items: safeItems,
    createdAt,
    created_at: createdAt,
    firstPublishedAt: createdAt,
    first_published_at: createdAt,
    version: 1,
    editionType: "airs_map_link_beta",
    edition_type: "airs_map_link_beta",
    editionLabel: "リンク限定Map β",
    edition_label: "リンク限定Map β",
    sourceSnapshot: {
      itemCount: safeItems.length,
      title: cleanText(body.title || "私のair-s Map", 80),
      capturedAt: createdAt
    },
    source_snapshot: {
      itemCount: safeItems.length,
      title: cleanText(body.title || "私のair-s Map", 80),
      capturedAt: createdAt
    },
    cardSerial: serial,
    card_serial: serial
  };
  const contentHash = stableHash(baseRecord);
  return {
    ...baseRecord,
    contentHash,
    content_hash: contentHash
  };
}

function normalizeEgoNoteStatus(value) {
  return EGO_NOTE_STATUSES.has(value) ? value : "draft";
}

function buildEgoNoteRecord(body) {
  const createdAt = new Date().toISOString();
  const storeName = cleanText(body.storeName || "このお店", 100);
  const requestId = cleanText(body.requestId, 80);
  const noteId = safeSegment(body.noteId, `ego_${Date.now().toString(36)}`);
  const status = normalizeEgoNoteStatus(body.status);
  const serial = cleanText(body.cardSerial, 80) || cardSerial("official", storeName || "ego-note", createdAt);
  const baseRecord = {
    v: 1,
    kind: "ego_note",
    noteId,
    storeName,
    requestId,
    sourceType: cleanText(body.sourceType || "manual", 40),
    sourceUrl: safeUrl(body.sourceUrl),
    phrase: cleanText(body.phrase || "今週見つかった言葉", 160),
    summary: cleanText(body.summary || "", 220),
    aiSummary: cleanText(body.aiSummary || body.summary || "", 220),
    status,
    visibility: status === "published" ? "public_card" : "private",
    createdAt,
    created_at: createdAt,
    firstPublishedAt: status === "published" ? createdAt : "",
    first_published_at: status === "published" ? createdAt : "",
    version: 1,
    editionType: "ego_reflection_beta",
    edition_type: "ego_reflection_beta",
    editionLabel: "エゴサーチ反映β",
    edition_label: "エゴサーチ反映β",
    sourceSnapshot: {
      sourceType: cleanText(body.sourceType || "manual", 40),
      sourceUrl: safeUrl(body.sourceUrl),
      phrase: cleanText(body.phrase || "", 160),
      capturedAt: createdAt
    },
    source_snapshot: {
      sourceType: cleanText(body.sourceType || "manual", 40),
      sourceUrl: safeUrl(body.sourceUrl),
      phrase: cleanText(body.phrase || "", 160),
      capturedAt: createdAt
    },
    cardSerial: serial,
    card_serial: serial
  };
  const contentHash = stableHash(baseRecord);
  return {
    ...baseRecord,
    contentHash,
    content_hash: contentHash
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

async function listEgoNotes({ storeName, requestId, statuses, limit = 150 }) {
  const { list } = await import("@vercel/blob");
  const result = await list({ prefix: "airs/ego-notes/", limit });
  const blobs = result.blobs || [];
  const notes = [];
  for (const blob of blobs) {
    if (!blob.pathname.endsWith(".json")) continue;
    try {
      const record = await fetchBlobRecord(blob);
      if (!matchesAdminRecord(record, storeName, requestId)) continue;
      const status = normalizeEgoNoteStatus(record.status);
      if (statuses && !statuses.has(status)) continue;
      notes.push({
        noteId: record.noteId || "",
        storeName: record.storeName || storeName,
        requestId: record.requestId || "",
        sourceType: record.sourceType || "manual",
        sourceUrl: record.sourceUrl || "",
        phrase: record.phrase || "",
        summary: record.summary || "",
        aiSummary: record.aiSummary || record.summary || "",
        status,
        createdAt: record.createdAt || "",
        firstPublishedAt: record.firstPublishedAt || "",
        editionType: record.editionType || "",
        editionLabel: record.editionLabel || "",
        cardSerial: record.cardSerial || "",
        contentHash: record.contentHash || "",
        sourceSnapshot: record.sourceSnapshot || null,
        pathname: blob.pathname,
        url: blob.url
      });
    } catch {
      // Ignore malformed beta records.
    }
  }
  return notes.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
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
      entryPhotos: [],
      egoNotes: []
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
  const egoNotes = await listEgoNotes({ storeName, requestId });

  return sendJson(response, 200, {
    ok: true,
    configured: true,
    officials,
    connections,
    entryPhotos,
    egoNotes,
    counts: {
      officials: officials.length,
      connections: connections.length,
      entryPhotos: entryPhotos.length,
      egoNotes: egoNotes.length
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

async function handleEgoNotesLookup(request, response) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(response, 200, { ok: true, configured: false, egoNotes: [] });
  }
  const storeName = compact(request.query?.store || request.query?.storeName);
  const requestId = compact(request.query?.requestId || request.query?.id);
  if (!storeName && !requestId) {
    return sendJson(response, 400, { ok: false, message: "storeまたはrequestIdが必要です。" });
  }
  const onlyPublished = String(request.query?.published || "") === "1";
  const egoNotes = await listEgoNotes({
    storeName,
    requestId,
    limit: 120,
    statuses: onlyPublished ? new Set(["published"]) : undefined
  });
  return sendJson(response, 200, { ok: true, configured: true, egoNotes });
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

async function handleEgoNoteSave(request, response) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(response, 503, {
      ok: false,
      code: "blob_not_configured",
      message: "Vercel Blobが未設定です。"
    });
  }
  const body = await readJsonBody(request);
  if (!cleanText(body?.phrase, 160) && !cleanText(body?.summary || body?.aiSummary, 220)) {
    return sendJson(response, 400, { ok: false, message: "掲載候補の言葉を入力してください。" });
  }
  const record = buildEgoNoteRecord(body || {});
  if (!record.storeName && !record.requestId) {
    return sendJson(response, 400, { ok: false, message: "店名または受付IDが必要です。" });
  }
  const { put } = await import("@vercel/blob");
  const storeSegment = safeSegment(record.requestId || record.storeName, "store");
  const pathname = `airs/ego-notes/${storeSegment}/${record.noteId}.json`;
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

async function handleEgoNoteStatusUpdate(request, response) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(response, 503, {
      ok: false,
      code: "blob_not_configured",
      message: "Vercel Blobが未設定です。"
    });
  }
  const body = await readJsonBody(request);
  const noteId = safeSegment(body.noteId, "");
  const pathname = String(body.pathname || "");
  const nextStatus = normalizeEgoNoteStatus(body.status);
  if (!noteId && !pathname) {
    return sendJson(response, 400, { ok: false, message: "noteIdが必要です。" });
  }
  const { list, put } = await import("@vercel/blob");
  const result = await list({ prefix: "airs/ego-notes/", limit: 200 });
  const target = (result.blobs || []).find((blob) => {
    if (pathname && blob.pathname === pathname) return true;
    return noteId && blob.pathname.endsWith(`/${noteId}.json`);
  });
  if (!target) {
    return sendJson(response, 404, { ok: false, message: "掲載候補が見つかりませんでした。" });
  }
  const existing = await fetchBlobRecord(target);
  const updatedAt = new Date().toISOString();
  const updated = {
    ...existing,
    status: nextStatus,
    visibility: nextStatus === "published" ? "public_card" : "private",
    updatedAt,
    firstPublishedAt: nextStatus === "published" ? (existing.firstPublishedAt || updatedAt) : existing.firstPublishedAt || "",
    first_published_at: nextStatus === "published" ? (existing.first_published_at || existing.firstPublishedAt || updatedAt) : existing.first_published_at || existing.firstPublishedAt || ""
  };
  updated.contentHash = stableHash(updated);
  updated.content_hash = updated.contentHash;
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

async function handleAirsPhotoSave(request, response) {
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
  const airId = safeSegment(body.airId, `airs_${Date.now().toString(36)}`);
  const storeSegment = safeSegment(body.storeName, "store");
  const pathname = `airs/photos/${storeSegment}/${airId}.${image.ext}`;
  const blob = await put(pathname, image.bytes, {
    access: "public",
    addRandomSuffix: false,
    contentType: image.mimeType
  });

  return sendJson(response, 200, {
    ok: true,
    photoUrl: blob.url,
    photoPathname: blob.pathname
  });
}

async function handleAirsMapLookup(request, response) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(response, 200, { ok: true, configured: false, map: null });
  }
  const mapId = safeSegment(request.query?.mapId || request.query?.id, "");
  if (!mapId) {
    return sendJson(response, 400, { ok: false, message: "mapIdが必要です。" });
  }
  const { list } = await import("@vercel/blob");
  const result = await list({ prefix: `airs/maps/${mapId}.json`, limit: 1 });
  const blob = (result.blobs || [])[0];
  if (!blob) return sendJson(response, 404, { ok: false, message: "Mapが見つかりませんでした。" });
  const map = await fetchBlobRecord(blob);
  return sendJson(response, 200, { ok: true, configured: true, map });
}

async function handleAirsMapSave(request, response) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return sendJson(response, 503, {
      ok: false,
      code: "blob_not_configured",
      message: "Vercel Blobが未設定です。"
    });
  }
  const body = await readJsonBody(request);
  const record = buildAirsMapRecord(body || {});
  if (!record.items.length) {
    return sendJson(response, 400, { ok: false, message: "Mapにするair-sが必要です。" });
  }
  const { put } = await import("@vercel/blob");
  const pathname = `airs/maps/${record.mapId}.json`;
  const blob = await put(pathname, JSON.stringify(record, null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json; charset=utf-8"
  });
  return sendJson(response, 200, {
    ok: true,
    map: record,
    url: blob.url,
    pathname: blob.pathname
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
  updated.content_hash = updated.contentHash;

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
    if (request.method === "GET" && action === "ego-notes") {
      return handleEgoNotesLookup(request, response);
    }
    if (request.method === "GET" && action === "published-connections") {
      return handlePublishedConnectionsLookup(request, response);
    }
    if (request.method === "GET" && action === "map") {
      return handleAirsMapLookup(request, response);
    }
    if (request.method === "POST" && action === "connect") {
      return handleConnectionRequest(request, response);
    }
    if (request.method === "POST" && action === "connection-status") {
      return handleConnectionStatusUpdate(request, response);
    }
    if (request.method === "POST" && action === "ego-note-status") {
      return handleEgoNoteStatusUpdate(request, response);
    }
    if (request.method === "POST" && action === "entry-photo") {
      return handleEntryPhotoSave(request, response);
    }
    if (request.method === "POST" && action === "ego-note") {
      return handleEgoNoteSave(request, response);
    }
    if (request.method === "POST" && action === "photo") {
      return handleAirsPhotoSave(request, response);
    }
    if (request.method === "POST" && action === "map") {
      return handleAirsMapSave(request, response);
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
