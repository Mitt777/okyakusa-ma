const qrHandler = require("./_lib/qr-handler");
const worldviewCardImageHandler = require("./_lib/worldview-card-image-handler");
const { sendJson } = require("./_lib/response");

module.exports = function handler(request, response) {
  const mediaHandler = String(request.query?.handler || "");

  if (mediaHandler === "qr") {
    return qrHandler(request, response);
  }

  if (mediaHandler === "worldview-card-image") {
    return worldviewCardImageHandler(request, response);
  }

  return sendJson(response, 404, {
    ok: false,
    message: "指定された画像処理が見つかりません。",
  });
};
