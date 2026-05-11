const { assertBetaSecret, readJsonBody, sendJson } = require("./_lib/response");
const { fetchPlacesObservation } = require("./_lib/places");
const { generateDiagnosisJson } = require("./_lib/gemini");
const { buildMonthlyReport } = require("./_lib/monthly");

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return sendJson(response, 405, { ok: false, message: "POSTのみ対応しています。" });
    }

    assertBetaSecret(request);
    const input = await readJsonBody(request);
    const placesObservation = input.places_observation || await fetchPlacesObservation(input);
    const diagnosisResult = input.diagnosis ? { diagnosis: input.diagnosis } : await generateDiagnosisJson(input, placesObservation);
    const monthly_report = buildMonthlyReport(input, placesObservation, diagnosisResult);

    return sendJson(response, 200, {
      ok: true,
      places_observation: placesObservation,
      diagnosis: diagnosisResult.diagnosis,
      monthly_report
    });
  } catch (error) {
    return sendJson(response, error.statusCode || 500, {
      ok: false,
      message: error.message
    });
  }
};
