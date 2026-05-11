function sendJson(response, statusCode, payload) {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.status(statusCode).send(JSON.stringify(payload));
}

async function readJsonBody(request) {
  if (!request.body) return {};
  if (typeof request.body === "string") return JSON.parse(request.body);
  return request.body;
}

function assertBetaSecret(request) {
  const expected = process.env.BETA_API_SECRET;
  if (!expected) return;

  const provided = request.headers["x-beta-api-secret"] || "";
  if (provided !== expected) {
    const error = new Error("BETA_API_SECRETが一致しません。");
    error.statusCode = 401;
    throw error;
  }
}

module.exports = {
  assertBetaSecret,
  readJsonBody,
  sendJson
};
