const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function locatedStores(project) {
  return (Array.isArray(project?.stores) ? project.stores : [])
    .map((store, index) => ({
      index,
      lat: safeNumber(store.lat),
      lng: safeNumber(store.lng)
    }))
    .filter((store) => store.lat !== null && store.lng !== null)
    .slice(0, 20);
}

function staticMapUrl(stores) {
  const key = process.env.GOOGLE_MAPS_STATIC_API_KEY;
  if (!key || !stores.length) return "";
  const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
  url.searchParams.set("size", "640x315");
  url.searchParams.set("scale", "2");
  url.searchParams.set("format", "jpg");
  url.searchParams.set("maptype", "roadmap");
  stores.forEach((store) => {
    const label = store.index < 9 ? String(store.index + 1) : "";
    const marker = [
      "color:0x2f7f64",
      label ? `label:${label}` : "",
      `${store.lat},${store.lng}`
    ].filter(Boolean).join("|");
    url.searchParams.append("markers", marker);
  });
  url.searchParams.set("key", key);
  return url.toString();
}

async function sendStaticMapImage(project, response) {
  if (!process.env.GOOGLE_MAPS_STATIC_API_KEY) {
    return sendJson(response, 503, { ok: false, error: "GOOGLE_MAPS_STATIC_API_KEYが未設定です。" });
  }
  const imageUrl = staticMapUrl(locatedStores(project));
  if (!imageUrl) return sendJson(response, 404, { ok: false, error: "地図画像に使える緯度経度がありません。" });
  const mapResponse = await fetch(imageUrl);
  if (!mapResponse.ok) {
    return sendJson(response, mapResponse.status, { ok: false, error: "Maps Static API画像を取得できませんでした。" });
  }
  const body = Buffer.from(await mapResponse.arrayBuffer());
  response.setHeader("content-type", mapResponse.headers.get("content-type") || "image/jpeg");
  response.setHeader("cache-control", "public, max-age=3600, s-maxage=86400");
  return response.status(200).send(body);
}

function publicMapHtml(project, mapId, request) {
  const baseUrl = publicBaseUrl(request);
  const pageUrl = `${baseUrl}/m/${encodeURIComponent(mapId)}`;
  const imageUrl = `${baseUrl}/api/maps?og=1&amp;mapId=${escapeHtml(encodeURIComponent(mapId))}`;
  const title = escapeHtml(`${project.title || "店舗MAP"} | map-s`);
  const description = escapeHtml(project.description || "Google Maps由来の店舗情報を、軽い公開MAPとしてまとめました。");
  const canonical = escapeHtml(pageUrl);
  const meta = `
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="map-s">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${imageUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">`;
  const htmlPath = path.join(process.cwd(), "index.html");
  let html = fs.readFileSync(htmlPath, "utf8");
  html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  html = html.replace(/<meta name="description" content="[^"]*">/i, `<meta name="description" content="${description}">`);
  return html.replace("</head>", `${meta}\n</head>`);
}

function sendPublicMapHtml(project, mapId, request, response) {
  response.setHeader("content-type", "text/html; charset=utf-8");
  response.setHeader("cache-control", "public, max-age=0, must-revalidate");
  return response.status(200).send(publicMapHtml(project, mapId, request));
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
      if (url.searchParams.get("og") === "1" || request.query?.og === "1") {
        return sendStaticMapImage(project, response);
      }
      if (url.searchParams.get("public") === "1" || request.query?.public === "1") {
        return sendPublicMapHtml(project, mapId, request, response);
      }
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
