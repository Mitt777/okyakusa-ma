const { sendJson } = require("./_lib/response");

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

    const sheetResponse = await fetch(url.toString(), {
      method: "GET",
      headers: { "accept": "application/json" }
    });

    const text = await sheetResponse.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return sendJson(response, 502, {
        ok: false,
        message: "Apps Scriptの応答をJSONとして読み取れませんでした。",
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
