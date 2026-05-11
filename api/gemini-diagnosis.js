const { assertBetaSecret, readJsonBody, sendJson } = require("./_lib/response");
const { generateDiagnosisJson } = require("./_lib/gemini");
const { fetchPlacesObservation } = require("./_lib/places");

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return sendJson(response, 405, { ok: false, message: "POSTのみ対応しています。" });
    }

    assertBetaSecret(request);
    const input = await readJsonBody(request);
    const placesObservation = input.places_observation || await fetchPlacesObservation(input);
    const result = await generateDiagnosisJson(input, placesObservation);
    return sendJson(response, 200, {
      ...result,
      places_observation: placesObservation
    });
  } catch (error) {
    return sendJson(response, error.statusCode || 500, {
      ok: false,
      message: error.message
    });
  }
};
