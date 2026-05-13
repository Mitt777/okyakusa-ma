function clampScore(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function fallbackDiagnosis(input, placesObservation) {
  const mapsScore = clampScore(placesObservation?.maps_report?.maps_score, 55);
  const planScore = mapsScore < 60 ? 48 : 62;
  const totalScore = Math.round((mapsScore * 0.42) + (planScore * 0.24) + 22);
  const storeName = placesObservation?.primary_place?.name || input.store_query || "診断店舗";

  return {
    generated_by: "fallback",
    store_name: storeName,
    total_score: clampScore(totalScore, 60),
    scores: {
      maps_score: mapsScore,
      review_score: placesObservation?.primary_place?.user_rating_count ? 68 : 45,
      meo_score: mapsScore,
      seo_score: input.website_url ? 55 : null,
      geo_score: 50,
      previsit_anxiety_score: planScore,
      save_score: 60,
      plan_score: planScore,
      impulse_score: 50,
      worldview_score: 58,
      cx_score: 55
    },
    summary: `${storeName}はGoogle Maps上で発見される土台があります。次は、初来店の人が安心して向かえるPlan情報を整える段階です。`,
    strengths: [
      "Google Maps上で店舗候補を確認できます",
      "地域検索から発見される土台があります",
      "診断レポート化できる公開情報があります"
    ],
    weaknesses: placesObservation?.maps_report?.weaknesses?.slice(0, 3) || [
      "駐車場・入口・席・価格などの来店前情報が不足している可能性があります",
      "口コミ・写真・SNSが来店準備情報へ接続しきれていません",
      "今すぐ行く理由を作るImpulse情報が弱い可能性があります"
    ],
    top_fix: placesObservation?.maps_report?.quick_fixes?.[0] || "Google MapsとInstagramに駐車場・入口・席・価格の情報を追加する",
    video_ideas: [
      { title: "駐車場から入口まで15秒", tag: "Plan", reason: "初来店の不安を消す" },
      { title: "一番気持ちよく過ごせる席", tag: "Save", reason: "保存したくなる空気を見せる" },
      { title: "今日の仕込み・湯気・音", tag: "Impulse", reason: "今行きたい理由を作る" }
    ],
    owner_explanation: "この診断は、味や技術ではなく、初めてのお客様から見た選びやすさを可視化するものです。"
  };
}

function extractJson(text) {
  if (!text) throw new Error("Gemini response is empty");
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Gemini response did not contain JSON");
  return JSON.parse(match[0]);
}

function buildPrompt(input, placesObservation) {
  return `
あなたは「お客様どっと混む」の店舗診断AIです。
Google Maps観測値、店舗入力、独自診断モデルをもとに、店舗オーナーが納得して行動できる診断JSONを作ってください。

重要:
- 断定しすぎず、観測値と仮説を分ける
- SEO/MEO/Mapsの事実を先に置き、Save→Plan→Impulseへ翻訳する
- target_keywordsがある場合は、実順位ではなく「その語で見つかるための情報整備度」として扱う
- 「この店のことだ」と感じる具体的な言葉にする
- 点数は絶対評価ではなく改善目安
- 口コミ本文や外部画像の転載は禁止用はしない

入力:
${JSON.stringify({ input, placesObservation }, null, 2)}

次のJSONだけを返してください。余計な説明文は禁止です。
{
  "generated_by": "gemini",
  "store_name": "string",
  "total_score": 0,
  "scores": {
    "maps_score": 0,
    "review_score": 0,
    "meo_score": 0,
    "seo_score": 0,
    "geo_score": 0,
    "previsit_anxiety_score": 0,
    "save_score": 0,
    "plan_score": 0,
    "impulse_score": 0,
    "worldview_score": 0,
    "cx_score": 0
  },
  "summary": "string",
  "maps_findings": ["string"],
  "seo_findings": ["string"],
  "strengths": ["string", "string", "string"],
  "weaknesses": ["string", "string", "string"],
  "lost_customers": ["string", "string", "string"],
  "top_fix": "string",
  "video_ideas": [
    {"title": "string", "tag": "Save|Plan|Impulse", "reason": "string"},
    {"title": "string", "tag": "Save|Plan|Impulse", "reason": "string"},
    {"title": "string", "tag": "Save|Plan|Impulse", "reason": "string"}
  ],
  "owner_explanation": "string",
  "paid_beta_hint": "string"
}`;
}

async function generateDiagnosisJson(input, placesObservation) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      message: "GEMINI_API_KEYが未設定です。",
      diagnosis: fallbackDiagnosis(input, placesObservation)
    };
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(input, placesObservation) }]
        }
      ],
      generationConfig: {
        temperature: 0.35,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const diagnosis = extractJson(text);

  return {
    ok: true,
    configured: true,
    model,
    diagnosis
  };
}

module.exports = {
  fallbackDiagnosis,
  generateDiagnosisJson
};
