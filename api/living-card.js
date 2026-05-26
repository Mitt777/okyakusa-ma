const { generateLivingCardCopy } = require("./_lib/gemini");
const { readJsonBody, sendJson } = require("./_lib/response");

function compact(value) {
  return String(value || "").trim();
}

function normalizePlace(input) {
  const location = input.location || {};
  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lng);
  return {
    place_id: compact(input.place_id),
    name: compact(input.name),
    address: compact(input.address),
    category: compact(input.category || input.primary_type_label || input.primary_type),
    rating: typeof input.rating === "number" ? input.rating : null,
    user_rating_count: typeof input.user_rating_count === "number" ? input.user_rating_count : null,
    photos_count: Number(input.photos_count || 0),
    google_maps_url: compact(input.google_maps_url || input.google_maps_uri),
    website_url: compact(input.website_url || input.website_uri),
    business_status: compact(input.business_status),
    location: Number.isFinite(latitude) && Number.isFinite(longitude)
      ? { latitude, longitude }
      : null
  };
}

async function hasStreetView(location) {
  const apiKey = process.env.GOOGLE_STREET_VIEW_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !location) return false;

  const url = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  url.searchParams.set("location", `${location.latitude},${location.longitude}`);
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url);
    if (!response.ok) return false;
    const data = await response.json();
    return data.status === "OK";
  } catch (error) {
    return false;
  }
}

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return sendJson(response, 405, { ok: false, message: "POSTのみ対応しています。" });
    }

    const body = await readJsonBody(request);
    const place = normalizePlace(body.place || body.candidate || {});
    if (!place.name && !place.place_id) {
      return sendJson(response, 400, { ok: false, message: "お店候補を選択してください。" });
    }

    const copy = await generateLivingCardCopy(place);
    const streetViewAvailable = await hasStreetView(place.location);
    const streetViewImageUrl = streetViewAvailable
      ? `/api/street-view?lat=${encodeURIComponent(place.location.latitude)}&lng=${encodeURIComponent(place.location.longitude)}`
      : "";

    return sendJson(response, 200, {
      ok: true,
      place,
      copy,
      visual: {
        street_view_available: streetViewAvailable,
        street_view_image_url: streetViewImageUrl,
        fallback: !streetViewAvailable
      },
      attribution: {
        text: "Map data and Street View imagery: Google Maps",
        google_maps_url: place.google_maps_url
      }
    });
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      message: error.message || "カード生成に失敗しました。"
    });
  }
};
