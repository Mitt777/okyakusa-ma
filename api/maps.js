const crypto = require("crypto");
const { readJsonBody, sendJson } = require("./_lib/response");

const MAX_STORES = 100;

function text(value, maxLength = 300) {
  return String(value || "").trim().slice(0, maxLength);
}

function safeUrl(value) {
  const url = text(value, 1000);
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) return "";
  return url;
}

function safeSegment(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).filter(([key, item]) =>
    /^[a-zA-Z0-9_]+$/.test(key) && typeof item === "boolean"
  ));
}

function createMapId() {
  return `map_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
}

function normalizeStore(store) {
  const name = text(store?.name || store?.store_name || store?.title || "名称未設定", 160);
  const address = text(store?.address || store?.formatted_address || "", 240);
  const category = text(store?.category || store?.primaryType || "", 80);
  const websiteUrl = safeUrl(store?.websiteUrl || store?.website_url || store?.website || "");
  const mapsUrl = safeUrl(store?.mapsUrl || store?.google_maps_url || store?.maps_url || store?.url || "");
  const id = safeSegment(store?.id || store?.place_id) || `store_${crypto.randomBytes(4).toString("hex")}`;
  return {
    id,
    placeId: text(store?.place_id || store?.placeId || (/^maps_store_/.test(id) ? "" : id), 160),
    name,
    address,
    category,
    websiteUrl,
    mapsUrl,
    rating: store?.rating || null,
    userRatingCount: safeNumber(store?.userRatingCount ?? store?.user_rating_count),
    businessStatus: text(store?.businessStatus || store?.business_status || "", 60),
    weekdayDescriptions: Array.isArray(store?.weekdayDescriptions || store?.weekday_descriptions)
      ? (store.weekdayDescriptions || store.weekday_descriptions).slice(0, 7).map((item) => text(item, 120)).filter(Boolean)
      : [],
    parkingOptions: safeObject(store?.parkingOptions || store?.parking_options),
    paymentOptions: safeObject(store?.paymentOptions || store?.payment_options),
    serviceOptions: safeObject(store?.serviceOptions || store?.service_options),
    reviewSummary: text(store?.reviewSummary || store?.review_summary || "", 240),
    editorialSummary: text(store?.editorialSummary || store?.editorial_summary || "", 240),
    lat: safeNumber(store?.lat ?? store?.latitude ?? store?.location?.latitude),
    lng: safeNumber(store?.lng ?? store?.longitude ?? store?.location?.longitude)
  };
}

function normalizeTheme(value) {
  const theme = text(value, 40);
  return ["cafe", "clean", "travel"].includes(theme) ? theme : "cafe";
}

function contentHash(project) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      title: project.title,
      description: project.description,
      theme: project.theme,
      stores: project.stores
    }))
    .digest("hex");
}

function publicBaseUrl(request) {
  const host = request.headers["x-forwarded-host"] || request.headers.host || "map-s.site";
  const proto = request.headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
}

function buildProject(body) {
  const stores = Array.isArray(body?.stores)
    ? body.stores.slice(0, MAX_STORES).map(normalizeStore).filter((store) => store.name)
    : [];
  const now = new Date().toISOString();
  const mapId = safeSegment(body?.mapId) || createMapId();
  const project = {
    version: 1,
    mapId,
    title: text(body?.title || "店舗MAP", 140),
    description: text(body?.description || "", 800),
    theme: normalizeTheme(body?.theme),
    stores,
    source: "map-s.site_beta",
    createdAt: now,
    updatedAt: now
  };
  return {
    ...project,
    contentHash: contentHash(project)
  };
}

async function loadBlobProject(mapId) {
  const { list } = await import("@vercel/blob");
  const pathname = `map-s/projects/${mapId}.json`;
  const result = await list({ prefix: pathname, limit: 1 });
  const blob = (result.blobs || []).find((item) => item.pathname === pathname) || result.blobs?.[0];
  if (!blob) return null;
  const response = await fetch(blob.url, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json();
}

async function saveBlobProject(project) {
  const { put } = await import("@vercel/blob");
  const pathname = `map-s/projects/${project.mapId}.json`;
  return put(pathname, JSON.stringify(project, null, 2), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true
  });
}

module.exports = async function handler(request, response) {
  try {
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return sendJson(response, 503, {
        ok: false,
        error: "BLOB_READ_WRITE_TOKENが未設定です。map-sの公開URL保存はVercel Blob接続後に利用できます。"
      });
    }

    if (request.method === "GET") {
      const url = new URL(request.url, "https://map-s.site");
      const mapId = safeSegment(url.searchParams.get("mapId") || request.query?.mapId || "");
      if (!mapId) return sendJson(response, 400, { ok: false, error: "mapIdが必要です。" });
      const project = await loadBlobProject(mapId);
      if (!project) return sendJson(response, 404, { ok: false, error: "MAPが見つかりませんでした。" });
      return sendJson(response, 200, { ok: true, project });
    }

    if (request.method === "POST") {
      const body = await readJsonBody(request);
      const project = buildProject(body);
      if (!project.stores.length) {
        return sendJson(response, 400, { ok: false, error: "店舗を1件以上追加してください。" });
      }
      const blob = await saveBlobProject(project);
      const baseUrl = publicBaseUrl(request);
      const publicUrl = `${baseUrl}/m/${project.mapId}`;
      const embedUrl = `${baseUrl}/embed/${project.mapId}`;
      return sendJson(response, 200, {
        ok: true,
        project,
        blobUrl: blob.url,
        publicUrl,
        embedUrl,
        embedCode: `<iframe src="${embedUrl}" width="100%" height="520" style="border:0;border-radius:12px;" loading="lazy"></iframe>`
      });
    }

    response.setHeader("allow", "GET, POST");
    return sendJson(response, 405, { ok: false, error: "method not allowed" });
  } catch (error) {
    return sendJson(response, error.statusCode || 500, {
      ok: false,
      error: error.message || "map-sの処理に失敗しました。"
    });
  }
};
