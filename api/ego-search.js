const { readJsonBody, sendJson } = require("./_lib/response");

function fallbackEgoSearch(body) {
  const storeName = body.storeName || "診断店舗";
  const area = body.area || "地域";
  const category = body.category || "お店";
  const maps = body.maps || {};
  const ai = body.ai || {};
  const rating = maps.rating || "未判定";
  const reviews = maps.user_rating_count || "0";
  const hasWebsite = Boolean(body.websiteUrl);
  const hasInstagram = Boolean(body.instagramUrl);
  const geoScore = Number(ai.geo_score || 0);

  return {
    generated_by: "fallback",
    title: `${storeName}は「${area}で見つかる${category}」として見えています`,
    summary: `現時点では、Google Mapsの評価${rating}・口コミ${reviews}件、${hasWebsite ? "公式サイト" : "Maps/SNS"}の情報をもとに見え方が作られます。AI検索に推薦されるには「誰に、どんな時に、なぜ良い店か」をもう少し明文化すると強くなります。`,
    items: [
      { label: "AIに見える店像", value: `${area}の${category}`, note: "地域名と業種から要約されやすい状態です。" },
      { label: "信頼材料", value: `${rating} / ${reviews}件`, note: "評価と口コミ数はAI要約の入口になります。" },
      { label: "Web導線", value: hasWebsite ? "公式サイトあり" : "公式サイト弱め", note: hasWebsite ? "ページ内の説明文を整える余地があります。" : "Maps説明文とSNSプロフィールが重要です。" },
      { label: "SNS補助", value: hasInstagram ? "Instagramあり" : "未確認", note: "雰囲気や世界観の補助情報になります。" },
      { label: "GEO状態", value: geoScore ? `${geoScore}点` : "未判定", note: "AIが推薦理由に使える材料の目安です。" },
      { label: "次の一手", value: "AI推薦文を作る", note: "そのまま引用されやすい1文を整えます。" }
    ],
    sources: maps.google_maps_uri ? [
      { title: `${storeName} - Google Maps`, uri: maps.google_maps_uri, provider: "Google Maps" }
    ] : [],
    actions: [
      "店名検索で出る説明文を確認",
      "誰におすすめかを1文で追加",
      "地域名＋利用シーンの言葉を足す"
    ]
  };
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Gemini response did not contain JSON");
  return JSON.parse(match[0]);
}

function buildPrompt(body) {
  return `
あなたは「お客様どっと混む」のAI de 店エゴサーチ診断AIです。
店舗オーナー向けに、Google検索・AI検索・Google Maps文脈でお店がどう見えそうかを、やさしく具体的に診断してください。

重要:
- 口コミ本文やWebページ本文を大量転載しない
- 断定しすぎず「見えそう」「可能性があります」と表現する
- 店主がすぐ直せる説明文・写真・検索語に落とす
- SEOは深掘りしすぎず、AI検索/GEOでの見え方を中心にする
- Google Maps文脈では「周辺で探す人」「初めて向かう人」「観光客が地図で比較する時」の見え方を重視する
- Google Maps由来の情報を使う場合は、結果内でGoogle Mapsソースに基づく見方であることが分かるようにする

入力:
${JSON.stringify(body, null, 2)}

次のJSONだけを返してください。
{
  "generated_by": "gemini_search_grounding",
  "title": "string",
  "summary": "string",
  "items": [
    {"label": "AIに見える店像", "value": "string", "note": "string"},
    {"label": "推薦されやすい人", "value": "string", "note": "string"},
    {"label": "Mapsで比較される点", "value": "string", "note": "string"},
    {"label": "検索で足りない言葉", "value": "string", "note": "string"},
    {"label": "誤解リスク", "value": "string", "note": "string"},
    {"label": "次の一手", "value": "string", "note": "string"}
  ],
  "sources": [{"title": "string", "uri": "string", "provider": "Google Maps|Google Search"}],
  "actions": ["string", "string", "string"]
}`;
}

function extractGroundingSources(data) {
  const metadata = data.candidates?.[0]?.groundingMetadata || data.candidates?.[0]?.grounding_metadata || {};
  const chunks = metadata.groundingChunks || metadata.grounding_chunks || [];
  return chunks.map((chunk) => {
    const maps = chunk.maps || chunk.googleMaps || chunk.google_maps || null;
    const web = chunk.web || null;
    if (maps) {
      return {
        title: maps.title || maps.placeId || maps.place_id || "Google Maps",
        uri: maps.uri || maps.googleMapsUri || maps.google_maps_uri || "",
        placeId: maps.placeId || maps.place_id || "",
        provider: "Google Maps"
      };
    }
    if (web) {
      return {
        title: web.title || "Google Search",
        uri: web.uri || "",
        provider: "Google Search"
      };
    }
    return null;
  }).filter((source) => source && source.uri).slice(0, 6);
}

function withSources(result, sources) {
  const existing = Array.isArray(result.sources) ? result.sources : [];
  const merged = existing.concat(sources || []);
  const seen = new Set();
  return {
    ...result,
    sources: merged.filter((source) => {
      const key = source.uri || source.title;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6)
  };
}

async function generateGroundedEgoSearch(body) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) return { ok: true, grounded: false, result: fallbackEgoSearch(body) };

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(body) }] }],
      tools: [
        { google_search: {} },
        { googleMaps: { enableWidget: true } }
      ],
      generationConfig: {
        temperature: 0.25,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    return { ok: true, grounded: false, result: fallbackEgoSearch(body), error: await response.text() };
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  const sources = extractGroundingSources(data);
  return {
    ok: true,
    grounded: true,
    mapsGrounded: sources.some((source) => source.provider === "Google Maps"),
    model,
    result: withSources(extractJson(text), sources)
  };
}

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return sendJson(response, 405, { ok: false, message: "POSTのみ対応しています。" });
    }
    const body = await readJsonBody(request);
    const result = await generateGroundedEgoSearch(body || {});
    return sendJson(response, 200, { ok: true, ...result });
  } catch (error) {
    return sendJson(response, 200, {
      ok: true,
      grounded: false,
      result: fallbackEgoSearch({}),
      message: error.message
    });
  }
};
