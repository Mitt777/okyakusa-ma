const { sendJson } = require("./_lib/response");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function looksLikeJson(text) {
  return /^\s*[\[{]/.test(String(text || ""));
}

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "GET") {
      return sendJson(response, 405, { ok: false, message: "GETのみ対応しています。" });
    }

    const id = request.query?.id || request.query?.request_id || "";
    if (!id) {
      return sendJson(response, 400, { ok: false, message: "idが必要です。" });
    }

    const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
    if (!scriptUrl) {
      return sendJson(response, 500, { ok: false, message: "GOOGLE_SCRIPT_URLが未設定です。" });
    }

    const url = new URL(scriptUrl);
    url.searchParams.set("action", "report");
    url.searchParams.set("request_id", id);
    url.searchParams.set("secret", process.env.GOOGLE_SCRIPT_SECRET || "");

    let sheetResponse;
    let text = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      sheetResponse = await fetch(url.toString(), {
        method: "GET",
        headers: { "accept": "application/json" }
      });
      text = await sheetResponse.text();
      if (looksLikeJson(text)) break;
      if (attempt < 2) await sleep(450 * (attempt + 1));
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return sendJson(response, 502, {
        ok: false,
        message: "Apps Scriptが一時的に診断結果を返せませんでした。少し待って再読み込みしてください。",
        code: "apps_script_non_json",
        status: sheetResponse?.status || 502,
        detail: text.slice(0, 500)
      });
    }

    if (!sheetResponse.ok || !data.ok) {
      return sendJson(response, data.statusCode || sheetResponse.status || 502, data);
    }

    return sendJson(response, 200, data);
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      message: error.message
    });
  }
};
