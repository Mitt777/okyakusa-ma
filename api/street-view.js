module.exports = async function handler(request, response) {
  const apiKey = process.env.GOOGLE_STREET_VIEW_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
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
};
