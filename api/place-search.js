const { fetchPlacesObservation } = require("./_lib/places");
const { generateLivingCardCopy } = require("./_lib/gemini");
const { readJsonBody, sendJson } = require("./_lib/response");

function compact(value) {
  return String(value || "").trim();
}

function candidatePayload(place) {
  return {
    place_id: place.place_id || "",
    name: place.name || "",
    address: place.address || "",
    location: place.location || null,
    category: place.primary_type_label || place.primary_type || "",
    rating: place.rating,
    user_rating_count: place.user_rating_count,
    google_maps_url: place.google_maps_uri || "",
    website_url: place.website_uri || "",
    lat: place.lat,
    lng: place.lng,
    phone: place.phone || "",
    business_status: place.business_status || "",
    photos_count: place.photos_count || 0,
    weekday_descriptions: place.current_weekday_descriptions?.length
      ? place.current_weekday_descriptions
      : place.weekday_descriptions || [],
    parking_options: place.parking_options || null,
    payment_options: place.payment_options || null,
    service_options: place.service_options || null,
    review_summary: place.review_summary || "",
    editorial_summary: place.editorial_summary || place.generative_summary || ""
  };
}

function normalizeCardPlace(input) {
  const location = input.location || {};
  const latitude = Number(location.latitude ?? location.lat ?? input.lat);
  const longitude = Number(location.longitude ?? location.lng ?? input.lng);
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

function streetViewApiKey() {
  return process.env.GOOGLE_STREET_VIEW_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
}

async function hasStreetView(location) {
  const apiKey = streetViewApiKey();
  if (!apiKey || !location) return false;

  const url = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
  url.searchParams.set("location", `${location.latitude},${location.longitude}`);
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("key", apiKey);

  try {
    const apiResponse = await fetch(url);
    if (!apiResponse.ok) return false;
    const data = await apiResponse.json();
    return data.status === "OK";
  } catch (error) {
    return false;
  }
}

async function sendStreetView(request, response) {
  const apiKey = streetViewApiKey();
  const latitude = Number(request.query.lat);
  const longitude = Number(request.query.lng);

  if (!apiKey || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    response.status(404).send("Street View is not available.");
    return;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/streetview");
  url.searchParams.set("size", "960x640");
  url.searchParams.set("location", `${latitude},${longitude}`);
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("fov", "82");
  url.searchParams.set("pitch", "4");
  url.searchParams.set("key", apiKey);

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      response.status(upstream.status).send("Street View is not available.");
      return;
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await upstream.arrayBuffer());
    response.setHeader("content-type", contentType);
    response.setHeader("cache-control", "no-store");
    response.status(200).send(buffer);
  } catch (error) {
    response.status(502).send("Street View fetch failed.");
  }
}

async function sendLivingCard(request, response) {
  const body = await readJsonBody(request);
  const place = normalizeCardPlace(body.place || body.candidate || {});
  if (!place.name && !place.place_id) {
    return sendJson(response, 400, { ok: false, message: "お店候補を選択してください。" });
  }

  const copy = await generateLivingCardCopy(place);
  const streetViewAvailable = await hasStreetView(place.location);
  const streetViewImageUrl = streetViewAvailable
    ? `/api/place-search?action=street-view&lat=${encodeURIComponent(place.location.latitude)}&lng=${encodeURIComponent(place.location.longitude)}`
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
}

module.exports = async function handler(request, response) {
  try {
    const action = compact(request.query?.action);
    if (request.method === "GET" && action === "street-view") {
      return sendStreetView(request, response);
    }

    if (request.method !== "POST") {
      return sendJson(response, 405, { ok: false, message: "POSTのみ対応しています。" });
    }

    if (action === "living-card") {
      return sendLivingCard(request, response);
    }

    const body = await readJsonBody(request);
    const storeQuery = compact(body.store_query || body.query);
    const area = compact(body.area);
    const category = compact(body.category);
    if (!storeQuery && !area) {
      return sendJson(response, 400, {
        ok: false,
        message: "店名、地域名、Google Maps URLなどを入力してください。"
      });
    }

    const observation = await fetchPlacesObservation({
      store_query: storeQuery,
      area,
      category
    });

    return sendJson(response, 200, {
      ok: true,
      query: observation.query,
      configured: observation.configured,
      candidates: (observation.candidates || []).slice(0, 5).map(candidatePayload)
    });
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      message: error.message || "お店候補を取得できませんでした。"
    });
  }
};
