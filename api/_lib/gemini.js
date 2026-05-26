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
  const missingItems = placesObservation?.maps_report?.weaknesses || [];
  const hasParking = Boolean(placesObservation?.primary_place?.parking_options);
  const hasHours = Boolean(placesObservation?.primary_place?.current_opening_hours || placesObservation?.primary_place?.weekday_descriptions);
  const entryEaseScore = clampScore(Math.round((mapsScore * 0.45) + (hasParking ? 15 : 0) + (hasHours ? 15 : 0) + 12), planScore);

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
      entry_ease_score: entryEaseScore,
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
    entry_ease_diagnosis: {
      title: "THE お店入りやすさ診断 Lite",
      score: entryEaseScore,
      summary: `${storeName}は、Google Maps上の基本情報をもとに来店前の安心材料を整える余地があります。特に、初めての人が「どこに停めて、どこから入り、何を頼めばよいか」を想像できる情報が効きます。`,
      reasons: [
        hasHours ? "営業時間は確認できるため、行くタイミングの不安は下げられます。" : "営業時間が来店前に見えにくい可能性があります。",
        hasParking ? "駐車場情報は確認できるため、車で向かう不安は下げられます。" : "駐車場や入口までの流れが見えにくい可能性があります。",
        missingItems[0] || "写真・説明文・SNSを来店前情報としてつなげる余地があります。"
      ],
      missing_photos: [
        "外観と看板が一緒に分かる写真",
        "入口から席までの流れが分かる写真",
        "代表メニューと価格感が伝わる写真"
      ],
      quick_actions: [
        "Google Mapsに「初めての方へ」の短い説明を足す",
        "駐車場から入口までの15秒動画を撮る",
        "入口・席・代表メニューの写真を3枚そろえる"
      ],
      maps_copy: "初めての方も入りやすいよう、入口・駐車場・席の雰囲気が分かる情報を整えています。"
    },
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
- THE お店入りやすさ診断は、外観、入口、営業中感、駐車場、価格感、席・店内、初回導線、安心写真を軸に見る
- 「入りにくい」と断定せず、何を見てそう判断したか、何を足すと安心が増えるかを書く
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
    "entry_ease_score": 0,
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
  "entry_ease_diagnosis": {
    "title": "THE お店入りやすさ診断 Lite",
    "score": 0,
    "summary": "string",
    "reasons": ["何を見て入りやすい/入りにくいと判断したか", "string", "string"],
    "missing_photos": ["今すぐ撮るべき写真", "string", "string"],
    "quick_actions": ["明日できる改善", "string", "string"],
    "maps_copy": "Google Mapsに足す短い説明文案"
  },
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

function fallbackLivingCardCopy(place) {
  const name = place?.name || "このお店";
  const category = place?.primary_type_label || place?.category || "お店";
  const area = place?.address ? place.address.split(/[、,]/)[0] : "";
  return {
    generated_by: "fallback",
    headline: `${name}の空気が、入口から伝わる一枚に。`,
    subcopy: `${area ? `${area}の` : ""}${category}として見えている公開情報をもとに、初めてのお客様が雰囲気を想像しやすいショップカードに整えます。`,
    worldview_type: "craft_trust",
    worldview_label: "手ざわりのある信頼",
    accent_words: ["外観", "安心感", "お店らしさ"]
  };
}

function buildLivingCardPrompt(place) {
  return `
あなたは okyakusa-ma.com の Living Shop Card コピーライターです。
Google Maps上の公開情報だけを材料に、店主が「自分のお店もこんなふうに見えるの？」と思える短いカードコピーJSONを作ってください。

重要:
- Google公式サービスのような表現にしない
- 断定しすぎない
- SEO/MEO業者っぽい言葉にしない
- 店舗の内部情報や未確認情報を足さない
- 15秒で読める、温かいが軽いコピーにする

店舗公開情報:
${JSON.stringify(place, null, 2)}

次のJSONだけを返してください。余計な説明は禁止です。
{
  "generated_by": "gemini",
  "headline": "string",
  "subcopy": "string",
  "worldview_type": "craft_trust|worldview_immersion|daily_companion|local_community|entry_anxiety_relief|tourism_destination|quiet_resonance|live_impulse",
  "worldview_label": "string",
  "accent_words": ["string", "string", "string"]
}`;
}

async function generateLivingCardCopy(place) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return fallbackLivingCardCopy(place);

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: buildLivingCardPrompt(place) }]
          }
        ],
        generationConfig: {
          temperature: 0.48,
          responseMimeType: "application/json"
        }
      })
    });

    if (!response.ok) return fallbackLivingCardCopy(place);

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    return extractJson(text);
  } catch (error) {
    return fallbackLivingCardCopy(place);
  }
}

module.exports = {
  fallbackDiagnosis,
  generateDiagnosisJson,
  generateLivingCardCopy
};
