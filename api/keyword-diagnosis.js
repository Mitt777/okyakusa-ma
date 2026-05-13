const { readJsonBody, sendJson } = require("./_lib/response");

function normalizeKeywords(body) {
  const raw = body.targetKeywords || body.target_keywords || "";
  const base = String(raw)
    .split(/[\n,、]/)
    .map((item) => item.trim())
    .filter(Boolean);
  const area = String(body.area || "").trim();
  const category = String(body.category || "").trim();
  const seeds = [
    ...base,
    area && category ? `${area} ${category}` : "",
    area ? `${area} ランチ` : "",
    area ? `${area} カフェ` : "",
    area ? `${area} グルメ` : ""
  ].filter(Boolean);
  return [...new Set(seeds)].slice(0, 8);
}

function hostOf(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function fallbackKeywordDiagnosis(body) {
  const keywords = normalizeKeywords(body);
  const storeName = body.storeName || "診断店舗";
  const area = body.area || "地域";
  const category = body.category || "業種";
  const websiteHost = hostOf(body.websiteUrl || "");
  const hasWebsite = Boolean(websiteHost);
  const hasKeywords = keywords.length > 0;
  const rows = (hasKeywords ? keywords : [`${area} ${category}`]).slice(0, 6).map((keyword, index) => ({
    keyword,
    demand: index < 2 ? "確認優先" : "候補",
    visibility: hasWebsite ? "順位未取得" : "公式サイト未確認",
    ownResult: hasWebsite ? websiteHost : "Maps/SNSで補強",
    competitors: [],
    action: `${keyword}で探す人向けに、駐車場・価格帯・席・予約・初来店案内を1か所にまとめる`
  }));

  return {
    generated_by: "fallback",
    title: `${storeName}の検索ことば診断 β`,
    summary: "現時点では検索API未接続のため、入力キーワードと店舗情報から、検索される準備度を整理しています。Custom Search接続後は簡易順位と競合の出方、Keyword Planner接続後は検索需要の目安を追加できます。",
    items: [
      { label: "入力キーワード", value: hasKeywords ? `${keywords.length}語` : "未入力", note: hasKeywords ? keywords.slice(0, 3).join(" / ") : "地域名＋業種から候補を作ります。" },
      { label: "公式サイト", value: hasWebsite ? "確認あり" : "未確認", note: hasWebsite ? "検索結果での表示候補を確認できます。" : "MapsやSNSで補助する設計です。" },
      { label: "需要目安", value: "Keyword Planner待ち", note: "検索ボリュームはGoogle Ads API接続後に表示します。" },
      { label: "簡易順位", value: "Custom Search待ち", note: "検索結果上の表示候補はAPI接続後に確認します。" },
      { label: "おすすめ方針", value: "Plan情報を足す", note: "地域名＋利用シーン＋不安解消語を優先します。" },
      { label: "次の課金価値", value: "キーワード別改善表", note: "需要、順位、競合、改善ページを1枚にまとめます。" }
    ],
    rows,
    actions: [
      "まず入力キーワード5語で検索される準備度を見る",
      "ワンコインでは検索需要目安と簡易順位を追加する",
      "月額版ではSearch Consoleで実クリックと平均掲載順位を追う"
    ],
    configured: {
      customSearch: false,
      keywordPlanner: false
    }
  };
}

function isOwnResult(item, targets) {
  const link = item.link || "";
  const display = item.displayLink || "";
  const haystack = `${link} ${display}`.toLowerCase();
  return targets.some((target) => target && haystack.includes(target.toLowerCase()));
}

async function runCustomSearch(keyword, targets) {
  const key = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY || process.env.GOOGLE_API_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;
  if (!key || !cx) return null;

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", key);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", keyword);
  url.searchParams.set("num", "10");
  url.searchParams.set("hl", "ja");
  url.searchParams.set("gl", "jp");

  const response = await fetch(url.toString(), { headers: { accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Custom Search API error ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  const items = data.items || [];
  const ownIndex = items.findIndex((item) => isOwnResult(item, targets));
  const competitors = items
    .filter((item, index) => index !== ownIndex)
    .slice(0, 3)
    .map((item) => ({
      title: item.title || "",
      link: item.link || "",
      displayLink: item.displayLink || ""
    }));

  return {
    keyword,
    demand: "需要未接続",
    visibility: ownIndex >= 0 ? `${ownIndex + 1}位付近` : "上位10件未確認",
    ownResult: ownIndex >= 0 ? items[ownIndex].link : "未確認",
    competitors,
    action: ownIndex >= 0
      ? "表示候補はあります。タイトル・説明文・来店前情報を整えてクリック理由を強化します。"
      : "上位に見えていない可能性があります。地域名＋利用シーン＋不安解消情報をページやMapsに追加します。"
  };
}

async function keywordPlannerPlaceholder(keywords) {
  const configured = Boolean(
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID &&
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN
  );
  return {
    configured,
    volumes: keywords.map((keyword) => ({
      keyword,
      monthlySearches: null,
      competition: configured ? "未実装" : "未接続"
    }))
  };
}

async function buildKeywordDiagnosis(body) {
  const fallback = fallbackKeywordDiagnosis(body);
  const keywords = normalizeKeywords(body);
  const targets = [
    hostOf(body.websiteUrl || ""),
    hostOf(body.googleMapsUrl || ""),
    hostOf(body.instagramUrl || ""),
    hostOf(body.snsUrl || "")
  ].filter(Boolean);

  const planner = await keywordPlannerPlaceholder(keywords);
  const customSearchConfigured = Boolean((process.env.GOOGLE_CUSTOM_SEARCH_API_KEY || process.env.GOOGLE_API_KEY) && process.env.GOOGLE_CUSTOM_SEARCH_CX);
  if (!customSearchConfigured) {
    return {
      ...fallback,
      configured: {
        customSearch: false,
        keywordPlanner: planner.configured
      }
    };
  }

  const rows = [];
  for (const keyword of keywords.slice(0, 5)) {
    rows.push(await runCustomSearch(keyword, targets));
  }
  const visibleCount = rows.filter((row) => row.visibility && !row.visibility.includes("未確認")).length;
  return {
    generated_by: "custom_search",
    title: `${body.storeName || "診断店舗"}の検索ことば診断 β`,
    summary: `入力キーワード${keywords.length}語のうち、${visibleCount}語で自社サイト/SNS候補が上位10件内に見える可能性があります。検索需要はKeyword Planner接続後に追加できます。`,
    items: [
      { label: "調査語数", value: `${rows.length}語`, note: "ワンコインではまず5語程度が現実的です。" },
      { label: "表示候補", value: `${visibleCount}語`, note: "Google Custom Search上の簡易確認です。" },
      { label: "需要目安", value: planner.configured ? "接続準備あり" : "未接続", note: "Keyword Planner接続後に検索ボリュームを表示します。" },
      { label: "競合確認", value: "上位3件", note: "各キーワードの上位候補を確認します。" },
      { label: "改善方向", value: "ページ/Maps補強", note: "見えていない語は来店前情報を増やします。" },
      { label: "月額展開", value: "Search Console", note: "実表示・クリック・平均掲載順位で追跡します。" }
    ],
    rows,
    actions: [
      "表示されていない語は専用見出しやFAQを追加する",
      "競合が強い語はMaps/SNS/口コミで補完する",
      "月額版ではSearch Consoleで実績キーワードを追う"
    ],
    configured: {
      customSearch: true,
      keywordPlanner: planner.configured
    }
  };
}

module.exports = async function handler(request, response) {
  try {
    if (request.method !== "POST") {
      return sendJson(response, 405, { ok: false, message: "POSTのみ対応しています。" });
    }
    const body = await readJsonBody(request);
    const result = await buildKeywordDiagnosis(body || {});
    return sendJson(response, 200, { ok: true, result });
  } catch (error) {
    return sendJson(response, 200, {
      ok: true,
      result: fallbackKeywordDiagnosis({}),
      message: error.message
    });
  }
};
