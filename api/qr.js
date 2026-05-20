const { readJsonBody, sendJson } = require("./_lib/response");

const MAX_URL_LENGTH = 2200;

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return sendJson(response, 405, { ok: false, message: "POSTのみ対応しています。" });
    }

    const body = await readJsonBody(request);
    const url = safeUrl(body?.url);
    if (!url) {
      return sendJson(response, 400, { ok: false, message: "QRコードにするURLが不正です。" });
    }
    if (url.length > MAX_URL_LENGTH) {
      return sendJson(response, 400, { ok: false, message: "URLが長すぎるためQRコードにできません。" });
    }

    const QRCode = require("qrcode");
    const options = {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 720,
      color: {
        dark: "#183b2f",
        light: "#ffffff"
      }
    };
    const [svg, png] = await Promise.all([
      QRCode.toString(url, { ...options, type: "svg" }),
      QRCode.toDataURL(url, { ...options, type: "image/png" })
    ]);

    return sendJson(response, 200, {
      ok: true,
      url,
      svg,
      png
    });
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      message: error.message
    });
  }
};
