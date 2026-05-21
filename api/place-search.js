const { fetchPlacesObservation } = require("./_lib/places");
const { readJsonBody, sendJson } = require("./_lib/response");

function compact(value) {
  return String(value || "").trim();
}

function candidatePayload(place) {
  return {
    place_id: place.place_id || "",
    name: place.name || "",
    address: place.address || "",
    category: place.primary_type_label || place.primary_type || "",
    rating: place.rating,
    user_rating_count: place.user_rating_count,
    google_maps_url: place.google_maps_uri || "",
    website_url: place.website_uri || "",
    phone: place.phone || "",
    business_status: place.business_status || "",
    photos_count: place.photos_count || 0
  };
}

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return sendJson(response, 405, { ok: false, message: "POSTのみ対応しています。" });
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
