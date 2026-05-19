const { readJsonBody, sendJson } = require("./_lib/response");

const MAX_IMAGE_BYTES = 900 * 1024;

function parseDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[2], "base64");
  return {
    mimeType: match[1].toLowerCase(),
    extension: match[1].split("/")[1].replace("jpeg", "jpg"),
    buffer
  };
}

function safeSegment(value, fallback) {
  return String(value || fallback)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 48) || fallback;
}

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return sendJson(response, 405, { ok: false, message: "POSTのみ対応しています。" });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return sendJson(response, 503, {
        ok: false,
        code: "blob_not_configured",
        message: "Vercel Blobが未設定です。BLOB_READ_WRITE_TOKENを設定してください。"
      });
    }

    const body = await readJsonBody(request);
    const parsed = parseDataUrl(body.image || body.dataUrl);
    if (!parsed) {
      return sendJson(response, 400, { ok: false, message: "画像データを読み取れませんでした。" });
    }
    if (parsed.buffer.length > MAX_IMAGE_BYTES) {
      return sendJson(response, 413, { ok: false, message: "画像サイズが大きすぎます。" });
    }

    const { put } = await import("@vercel/blob");
    const requestId = safeSegment(body.requestId || body.id, "report");
    const created = Date.now().toString(36);
    const pathname = `worldview-cards/${requestId}/${created}.${parsed.extension}`;
    const blob = await put(pathname, parsed.buffer, {
      access: "public",
      addRandomSuffix: true,
      contentType: parsed.mimeType
    });

    return sendJson(response, 200, {
      ok: true,
      url: blob.url,
      pathname: blob.pathname,
      contentType: parsed.mimeType,
      size: parsed.buffer.length
    });
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      message: error.message
    });
  }
};
