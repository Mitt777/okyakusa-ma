const { readJsonBody, sendJson } = require("./_lib/response");

const STYLE_PRESETS = {
  soft_handdrawn: {
    label: "やわらかい手描き背景調",
    prompt: "soft hand-drawn animated background feel, warm daylight, gentle colors, small local shop atmosphere, storybook-like but grounded"
  },
  evening_light: {
    label: "夕方の灯りカード調",
    prompt: "warm evening light, cozy storefront glow, cinematic but quiet, inviting small shop card, amber window light"
  },
  quiet_postcard: {
    label: "静かなショップカード調",
    prompt: "calm illustrated postcard, restrained colors, paper texture, quiet local shop mood, elegant and trustworthy"
  }
};

function parseDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/(?:png|jpe?g|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase(),
    data: match[2]
  };
}

function safeText(value, fallback = "") {
  return String(value || fallback).trim().slice(0, 120);
}

function buildPrompt(body) {
  const style = STYLE_PRESETS[body.styleKey] || STYLE_PRESETS.soft_handdrawn;
  const storeName = safeText(body.storeName, "このお店");
  const worldviewType = safeText(body.worldviewType, "お店世界観タイプ");
  const area = safeText(body.area, "");
  const category = safeText(body.category, "小さなお店");

  return `
あなたは「お客様.COM」の世界観ショップカード用ビジュアルを作るAIです。
アップロードされた店舗写真を参考に、実写そのものではなく、ショップカード背景として使える縦長のイラストに再構成してください。

店舗情報:
- 店名: ${storeName}
- エリア: ${area}
- 業種: ${category}
- 世界観タイプ: ${worldviewType}
- 変換スタイル: ${style.label}

表現方針:
- ${style.prompt}
- 3:4の縦長カード背景として使いやすい構図
- 店舗写真の入口、看板、空間の雰囲気、灯り、素材感を参考にする
- 文字、ロゴ、人物の顔、ナンバープレートは正確に再現しようとしない
- 特定の映画スタジオ、作品、存命作家の画風を模倣しない
- 派手な広告画像ではなく、小さなお店の「入りやすさ」と「保存したくなる空気」を両立する
- 下部にカード文字を重ねるため、下30%は少し暗めで落ち着いた余白を作る

画像だけを生成してください。`;
}

function extractImagePart(data) {
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.find((part) => part.inlineData?.data || part.inline_data?.data);
}

async function generateWorldviewCard(body) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      message: "GEMINI_API_KEYが未設定です。画像生成APIの器だけ利用できます。"
    };
  }

  const sourceImage = parseDataUrl(body.sourceImageDataUrl);
  if (!sourceImage) {
    return {
      ok: false,
      configured: true,
      message: "画像データを読み取れませんでした。PNG / JPEG / WebPを指定してください。"
    };
  }

  if (sourceImage.data.length > 9_500_000) {
    return {
      ok: false,
      configured: true,
      message: "画像サイズが大きすぎます。少し小さい画像でお試しください。"
    };
  }

  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt(body) },
            {
              inlineData: {
                mimeType: sourceImage.mimeType,
                data: sourceImage.data
              }
            }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        imageConfig: {
          aspectRatio: "3:4"
        }
      }
    })
  });

  if (!response.ok) {
    return {
      ok: false,
      configured: true,
      model,
      message: "画像生成に失敗しました。",
      detail: await response.text()
    };
  }

  const data = await response.json();
  const imagePart = extractImagePart(data);
  const inlineData = imagePart?.inlineData || imagePart?.inline_data;
  if (!inlineData?.data) {
    return {
      ok: false,
      configured: true,
      model,
      message: "画像生成結果に画像が含まれていませんでした。"
    };
  }

  return {
    ok: true,
    configured: true,
    model,
    style: STYLE_PRESETS[body.styleKey]?.label || STYLE_PRESETS.soft_handdrawn.label,
    imageDataUrl: `data:${inlineData.mimeType || "image/png"};base64,${inlineData.data}`,
    note: "登録写真をもとに、世界観カード用のイメージとして再構成しました。実際の店舗写真ではありません。"
  };
}

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return sendJson(response, 405, { ok: false, message: "POSTのみ対応しています。" });
    }
    const body = await readJsonBody(request);
    const result = await generateWorldviewCard(body || {});
    return sendJson(response, 200, result);
  } catch (error) {
    return sendJson(response, 200, {
      ok: false,
      configured: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY),
      message: "世界観カード生成でエラーが発生しました。",
      detail: error.message
    });
  }
};
