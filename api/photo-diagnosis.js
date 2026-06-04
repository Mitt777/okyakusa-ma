const { readJsonBody, sendJson } = require("./_lib/response");

function fallbackPhotoDiagnosis(body) {
  const count = Array.isArray(body.images) ? body.images.length : 0;
  const storeName = body.storeName || "診断店舗";
  const score = Math.max(45, Math.min(82, 55 + count * 6));
  const precision = count >= 3 ? "3枚ライト診断" : "仮診断";
  return {
    generated_by: "fallback",
    title: `写真${count}枚から見る「入りやすさ」${precision}`,
    summary: `${storeName}の写真を、初めてのお客様が来店前に見る情報として整理します。まずは外観・入口・店内または駐車場の3枚で、「入って大丈夫そうか」を見ます。`,
    items: [
      { label: "入りやすさ", value: `${score}点`, note: "写真枚数と来店前情報の揃い方から見た目安です。" },
      { label: "診断段階", value: precision, note: count >= 3 ? "3枚あるため、外観・入口・店内または駐車場の基本的な入りやすさを見ます。" : "3枚まで選ぶと、初来店前の不安をより見やすくなります。" },
      { label: "優先写真", value: "外観・入口", note: "初めてのお客様の最初の迷いを消す写真です。" },
      { label: "3枚目候補", value: "駐車場・店内・メニュー", note: "お店の弱点に合わせて、初来店の不安を下げる1枚を選びます。" },
      { label: "価格感", value: "深掘り候補", note: "代表メニューと価格が読める写真は、次の深掘り診断で扱う候補です。" },
      { label: "Maps掲載順", value: "外観→入口→席", note: "初来店客が順番に想像できる並びにします。" }
    ],
    missing_photos: [
      "外観と看板が同時に分かる写真",
      "入口から席までの導線写真",
      "代表メニューと価格感が分かる写真"
    ],
    maps_order: ["外観", "入口", "店内/席", "代表メニュー", "駐車場"],
    photo_requirements: {
      light_3: ["外観", "入口", "店内/席または駐車場"],
      deep_candidate: ["駐車場", "店内全体", "席", "代表メニュー", "価格表", "注文導線", "店主/スタッフの気配", "混雑しにくい時間の雰囲気"]
    },
    actions: [
      "Google Mapsの先頭写真を入口/外観に寄せる",
      "駐車場から入口までの写真を追加する",
      "価格が読めるメニュー写真を追加する"
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
あなたは「THE お店入りやすさ診断」のAI Vision診断AIです。
店舗写真を見て、初めてのお客様・一人客・子連れ・観光客・インバウンド客が「入って大丈夫そう」と感じられるかを診断してください。

見る観点:
- 外観、入口、駐車場、店内、席、メニュー、価格感、導線
- 初見で迷わないか
- Can I enter? と感じる人に安心材料があるか
- Google Mapsに載せるならどの写真を優先すべきか
- 今回のMVPは最大3枚のライト診断です。外観、入口、店内/席、駐車場/アクセスのうち、選ばれた写真から見える範囲だけを見る
- メニュー、価格表、注文導線、店主/スタッフの気配、混雑しにくい時間の雰囲気は、見えている場合だけ触れ、見えない場合は深掘り候補にする

重要:
- 人物の属性や個人情報を推測しない
- 断定せず、写真から見える範囲の仮説として書く
- 店主がすぐ直せる写真・説明文・掲載順に落とす
- 「映えているか」ではなく「初めて入る不安が減るか」を優先する
- 足りない写真を具体名で出す

店舗情報:
${JSON.stringify({
  storeName: body.storeName,
  area: body.area,
  category: body.category,
  worldviewType: body.worldviewType,
  imageCount: Array.isArray(body.images) ? body.images.length : 0
}, null, 2)}

次のJSONだけを返してください。
{
  "generated_by": "gemini_vision",
  "title": "string",
  "summary": "string",
  "items": [
    {"label": "入りやすさ", "value": "0点", "note": "string"},
    {"label": "入口安心度", "value": "string", "note": "string"},
    {"label": "駐車場/導線", "value": "string", "note": "string"},
    {"label": "店内の空気", "value": "string", "note": "string"},
    {"label": "メニューの頼みやすさ", "value": "string", "note": "string"},
    {"label": "Maps掲載順", "value": "string", "note": "string"}
  ],
  "missing_photos": ["string", "string", "string"],
  "maps_order": ["string", "string", "string", "string", "string"],
  "photo_requirements": {
    "light_3": ["string", "string", "string"],
    "deep_candidate": ["string", "string", "string", "string", "string"]
  },
  "actions": ["string", "string", "string"]
}`;
}

async function generatePhotoDiagnosis(body) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const images = Array.isArray(body.images) ? body.images.slice(0, 3) : [];
  if (!apiKey || images.length === 0) {
    return { ok: true, vision: false, result: fallbackPhotoDiagnosis(body) };
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const parts = [
    { text: buildPrompt(body) },
    ...images.map((image) => ({
      inline_data: {
        mime_type: image.mimeType || "image/jpeg",
        data: image.data || ""
      }
    }))
  ];

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.25,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    return { ok: true, vision: false, result: fallbackPhotoDiagnosis(body), error: await response.text() };
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
  return {
    ok: true,
    vision: true,
    model,
    result: extractJson(text)
  };
}

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return sendJson(response, 405, { ok: false, message: "POSTのみ対応しています。" });
    }
    const body = await readJsonBody(request);
    const result = await generatePhotoDiagnosis(body || {});
    return sendJson(response, 200, { ok: true, ...result });
  } catch (error) {
    return sendJson(response, 200, {
      ok: true,
      vision: false,
      result: fallbackPhotoDiagnosis({}),
      message: error.message
    });
  }
};
