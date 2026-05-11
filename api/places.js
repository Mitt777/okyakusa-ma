const { assertBetaSecret, readJsonBody, sendJson } = require("./_lib/response");
const { fetchPlacesObservation } = require("./_lib/places");

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return sendJson(response, 405, { ok: false, message: "POSTのみ対応しています。" });
    }

    assertBetaSecret(request);
    const input = await readJsonBody(request);
    const result = await fetchPlacesObservation(input);
    return sendJson(response, 200, result);
  } catch (error) {
    return sendJson(response, error.statusCode || 500, {
      ok: false,
      message: error.message
    });
  }
};
