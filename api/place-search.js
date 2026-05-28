const { fetchPlacesObservation } = require("./_lib/places");
const { generateClipCaptionAdvice, generateLivingCardCopy } = require("./_lib/gemini");
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

function aerialViewApiKey() {
  return process.env.GOOGLE_AERIAL_VIEW_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
}

function aerialHeaders(apiKey) {
  return {
    "content-type": "application/json",
    "X-Goog-Api-Key": apiKey
  };
}

function pickAerialVideoUri(data) {
  const uris = data?.uris || {};
  const video = uris.MP4_HIGH || uris.MP4_MEDIUM || uris.MP4_LOW || {};
  const image = uris.IMAGE || {};
  return {
    landscape_uri: video.landscapeUri || "",
    portrait_uri: video.portraitUri || "",
    thumbnail_uri: image.landscapeUri || image.portraitUri || ""
  };
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

async function lookupAerialVideo(apiKey, params) {
  const url = new URL("https://aerialview.googleapis.com/v1/videos:lookupVideo");
  if (params.videoId) url.searchParams.set("videoId", params.videoId);
  if (params.address) url.searchParams.set("address", params.address);

  const upstream = await fetch(url, {
    method: "GET",
    headers: aerialHeaders(apiKey)
  });
  const text = await upstream.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { raw: text };
  }
  return { ok: upstream.ok, status: upstream.status, data };
}

async function renderAerialVideo(apiKey, address) {
  const url = new URL("https://aerialview.googleapis.com/v1/videos:renderVideo");
  const upstream = await fetch(url, {
    method: "POST",
    headers: aerialHeaders(apiKey),
    body: JSON.stringify({ address })
  });
  const text = await upstream.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { raw: text };
  }
  return { ok: upstream.ok, status: upstream.status, data };
}

async function sendAerialCard(request, response) {
  const apiKey = aerialViewApiKey();
  if (!apiKey) {
    return sendJson(response, 200, {
      ok: true,
      configured: false,
      mode: "aerial",
      status: "not_configured",
      message: "Aerial View APIキーが未設定です。GOOGLE_AERIAL_VIEW_API_KEYを設定すると試せます。"
    });
  }

  const body = await readJsonBody(request);
  const place = normalizeCardPlace(body.place || body.candidate || {});
  const address = compact(body.address || place.address);
  if (!address) {
    return sendJson(response, 400, {
      ok: false,
      message: "Aerial View用の住所が取得できませんでした。"
    });
  }

  const lookup = await lookupAerialVideo(apiKey, { address });
  let data = lookup.data;
  let source = "lookup";

  if (!lookup.ok && lookup.status === 404) {
    const render = await renderAerialVideo(apiKey, address);
    data = render.data;
    source = "render";

    const videoId = data?.metadata?.videoId || data?.videoId || "";
    if (render.ok && data?.state === "ACTIVE" && videoId) {
      const activeLookup = await lookupAerialVideo(apiKey, { videoId });
      if (activeLookup.ok) {
        data = activeLookup.data;
        source = "render_lookup";
      }
    } else if (!render.ok) {
      const status = data?.error?.status || "";
      const message = status === "INVALID_ARGUMENT"
        ? "Aerial Viewは現在、対応地域や住所形式に制限があります。この店舗ではStreet View Cardをご利用ください。"
        : data?.error?.message || "Aerial View動画を生成できませんでした。";
      return sendJson(response, 200, {
        ok: true,
        configured: true,
        mode: "aerial",
        status: "unavailable",
        place,
        address,
        message,
        detail_status: status,
        attribution: "Aerial View imagery: Google Maps"
      });
    }
  } else if (!lookup.ok) {
    return sendJson(response, 200, {
      ok: true,
      configured: true,
      mode: "aerial",
      status: "unavailable",
      place,
      address,
      message: data?.error?.message || "Aerial View動画を取得できませんでした。",
      detail_status: data?.error?.status || "",
      attribution: "Aerial View imagery: Google Maps"
    });
  }

  const video = pickAerialVideoUri(data);
  const videoId = data?.metadata?.videoId || data?.videoId || "";
  if (data?.state === "ACTIVE" && video.landscape_uri) {
    return sendJson(response, 200, {
      ok: true,
      configured: true,
      mode: "aerial",
      status: "active",
      source,
      place,
      address,
      video_id: videoId,
      video,
      message: "Cinematic Shop Card動画を表示できます。",
      attribution: "Aerial View imagery: Google Maps"
    });
  }

  if (data?.state === "PROCESSING") {
    return sendJson(response, 200, {
      ok: true,
      configured: true,
      mode: "aerial",
      status: "processing",
      source,
      place,
      address,
      video_id: videoId,
      message: "Aerial View動画を生成中です。完了まで1時間から数時間かかる場合があります。",
      attribution: "Aerial View imagery: Google Maps"
    });
  }

  return sendJson(response, 200, {
    ok: true,
    configured: true,
    mode: "aerial",
    status: "unavailable",
    source,
    place,
    address,
    message: "この住所ではAerial View動画をまだ表示できません。",
    attribution: "Aerial View imagery: Google Maps"
  });
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

async function sendClipCaption(request, response) {
  const body = await readJsonBody(request);
  const description = compact(body.description);
  const storeName = compact(body.storeName || body.store_name);
  const currentCaption = compact(body.currentCaption || body.current_caption);
  const cutCount = Math.max(1, Math.min(3, Number(body.cutCount || body.cut_count || 1)));

  if (!description && !storeName && !currentCaption) {
    return sendJson(response, 400, {
      ok: false,
      message: "投稿文にしたい内容を短く入力してください。"
    });
  }

  const advice = await generateClipCaptionAdvice({
    storeName,
    description,
    currentCaption,
    cutCount
  });

  return sendJson(response, 200, {
    ok: true,
    advice
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

    if (action === "aerial-card") {
      return sendAerialCard(request, response);
    }

    if (action === "clip-caption") {
      return sendClipCaption(request, response);
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
