const { sendJson } = require("./_lib/response");

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

module.exports = async function handler(request, response) {
  try {
    const url = new URL(request.url, "https://map-s.site");
    const mapId = safeSegment(url.searchParams.get("mapId") || request.query?.mapId || "");
    if (!mapId) return sendJson(response, 400, { ok: false, error: "mapIdが必要です。" });
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return sendJson(response, 503, { ok: false, error: "BLOB_READ_WRITE_TOKENが未設定です。" });
    }
    if (!process.env.GOOGLE_MAPS_STATIC_API_KEY) {
      return sendJson(response, 503, { ok: false, error: "GOOGLE_MAPS_STATIC_API_KEYが未設定です。" });
    }

    const project = await loadBlobProject(mapId);
    const stores = locatedStores(project);
    const imageUrl = staticMapUrl(stores);
    if (!imageUrl) return sendJson(response, 404, { ok: false, error: "地図画像に使える緯度経度がありません。" });

    const mapResponse = await fetch(imageUrl);
    if (!mapResponse.ok) {
      return sendJson(response, mapResponse.status, { ok: false, error: "Maps Static API画像を取得できませんでした。" });
    }
    const body = Buffer.from(await mapResponse.arrayBuffer());
    response.setHeader("content-type", mapResponse.headers.get("content-type") || "image/jpeg");
    response.setHeader("cache-control", "public, max-age=3600, s-maxage=86400");
    return response.status(200).send(body);
  } catch (error) {
    return sendJson(response, error.statusCode || 500, {
      ok: false,
      error: error.message || "OGP地図画像の生成に失敗しました。"
    });
  }
};
