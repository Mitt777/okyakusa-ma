const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places:searchText";

const FIELD_MASK = [
  "places.id",
  "places.name",
  "places.displayName",
  "places.formattedAddress",
  "places.shortFormattedAddress",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.types",
  "places.businessStatus",
  "places.rating",
  "places.userRatingCount",
  "places.regularOpeningHours",
  "places.websiteUri",
  "places.nationalPhoneNumber",
  "places.googleMapsUri",
  "places.photos"
].join(",");

function compact(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return compact(value).toLowerCase().replace(/\s+/g, "");
}

function toText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.text || "";
}

function normalizePlace(place) {
  return {
    place_id: place.id || "",
    resource_name: place.name || "",
    name: toText(place.displayName),
    address: place.formattedAddress || place.shortFormattedAddress || "",
    primary_type: place.primaryType || "",
    primary_type_label: toText(place.primaryTypeDisplayName),
    types: Array.isArray(place.types) ? place.types : [],
    business_status: place.businessStatus || "",
    rating: typeof place.rating === "number" ? place.rating : null,
    user_rating_count: typeof place.userRatingCount === "number" ? place.userRatingCount : null,
    website_uri: place.websiteUri || "",
    phone: place.nationalPhoneNumber || "",
    google_maps_uri: place.googleMapsUri || "",
    photos_count: Array.isArray(place.photos) ? place.photos.length : 0,
    weekday_descriptions: place.regularOpeningHours?.weekdayDescriptions || []
  };
}

function scoreIdentity(candidate, input) {
  const nameNeedle = normalizeText(input.store_query);
  const areaNeedle = normalizeText(input.area);
  const categoryNeedle = normalizeText(input.category);
  const candidateName = normalizeText(candidate.name);
  const candidateAddress = normalizeText(candidate.address);
  const candidateType = normalizeText(`${candidate.primary_type} ${candidate.primary_type_label} ${candidate.types.join(" ")}`);

  let score = 0;
  const reasons = [];

  if (nameNeedle && candidateName.includes(nameNeedle)) {
    score += 50;
    reasons.push("店舗名が候補名に一致");
  } else if (nameNeedle && candidateName && (nameNeedle.includes(candidateName) || candidateName.includes(nameNeedle.slice(0, 4)))) {
    score += 34;
    reasons.push("店舗名が部分一致");
  }

  if (areaNeedle && candidateAddress.includes(areaNeedle)) {
    score += 28;
    reasons.push("住所/エリアが一致");
  }

  if (categoryNeedle && candidateType.includes(categoryNeedle)) {
    score += 12;
    reasons.push("業種がカテゴリと近い");
  }

  if (candidate.business_status === "OPERATIONAL") {
    score += 10;
    reasons.push("営業中候補");
  }

  const status = score >= 75 ? "一致" : score >= 45 ? "要確認" : "要確認";
  return { score: Math.min(score, 100), status, reasons };
}

function evaluateMapsReadiness(primary, competitors) {
  if (!primary) {
    return {
      maps_score: 0,
      strengths: [],
      weaknesses: ["Google Maps候補が取得できませんでした。店舗名・エリアを確認してください。"],
      quick_fixes: ["店舗名、住所、Google Maps URLを追加して再診断する"]
    };
  }

  const checks = [
    { key: "category", ok: Boolean(primary.primary_type || primary.primary_type_label), label: "カテゴリ" },
    { key: "hours", ok: primary.weekday_descriptions.length > 0, label: "営業時間" },
    { key: "reviews", ok: Number(primary.user_rating_count || 0) >= 10, label: "口コミ件数" },
    { key: "rating", ok: Number(primary.rating || 0) >= 4, label: "評価平均" },
    { key: "website", ok: Boolean(primary.website_uri), label: "Webサイト導線" },
    { key: "phone", ok: Boolean(primary.phone), label: "電話導線" },
    { key: "photos", ok: Number(primary.photos_count || 0) >= 3, label: "写真" }
  ];

  const okCount = checks.filter((check) => check.ok).length;
  const mapsScore = Math.round((okCount / checks.length) * 100);
  const weaknesses = checks
    .filter((check) => !check.ok)
    .map((check) => `${check.label}が弱い、または取得できません`);

  const strengths = checks
    .filter((check) => check.ok)
    .slice(0, 4)
    .map((check) => `${check.label}は確認できます`);

  const competitorReviewMedian = median(competitors.map((item) => item.user_rating_count).filter((value) => typeof value === "number"));
  const competitorRatingMedian = median(competitors.map((item) => item.rating).filter((value) => typeof value === "number"));
  const comparison = {
    competitor_count: competitors.length,
    competitor_review_median: competitorReviewMedian,
    competitor_rating_median: competitorRatingMedian,
    review_position_hint: compareNumber(primary.user_rating_count, competitorReviewMedian),
    rating_position_hint: compareNumber(primary.rating, competitorRatingMedian)
  };

  return {
    maps_score: mapsScore,
    strengths,
    weaknesses,
    quick_fixes: buildQuickFixes(primary, weaknesses),
    comparison
  };
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function compareNumber(value, baseline) {
  if (typeof value !== "number" || typeof baseline !== "number") return "未判定";
  if (value > baseline) return "競合中央値より上";
  if (value < baseline) return "競合中央値より下";
  return "競合中央値と同程度";
}

function buildQuickFixes(primary, weaknesses) {
  const fixes = [];
  if (!primary.website_uri) fixes.push("Google Mapsに公式サイトURLを設定する");
  if (!primary.phone) fixes.push("Google Mapsの電話導線を確認する");
  if (primary.weekday_descriptions.length === 0) fixes.push("営業時間と定休日をGoogle Maps上で明確にする");
  if (primary.photos_count < 3) fixes.push("入口、駐車場、席、名物商品の写真を追加する");
  if ((primary.user_rating_count || 0) < 10) fixes.push("来店後に口コミを書きやすい声かけと導線を作る");
  if (fixes.length === 0 && weaknesses.length === 0) fixes.push("駐車場、入口、席、価格などPlan情報の見え方を強化する");
  return fixes.slice(0, 5);
}

async function fetchPlacesObservation(input) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
  const query = [input.store_query, input.area, input.category].map(compact).filter(Boolean).join(" ");

  if (!apiKey) {
    return {
      ok: false,
      configured: false,
      message: "GOOGLE_PLACES_API_KEYが未設定です。",
      query,
      candidates: [],
      primary_place: null,
      identity: { status: "未判定", score: 0, reasons: ["APIキー未設定"] },
      maps_report: evaluateMapsReadiness(null, [])
    };
  }

  const response = await fetch(PLACES_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
      "x-goog-fieldmask": FIELD_MASK
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "ja",
      regionCode: "JP",
      maxResultCount: 8
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Places API error ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const candidates = (data.places || []).map(normalizePlace);
  const primaryPlace = candidates[0] || null;
  const competitors = candidates.slice(1, 6);
  const identity = primaryPlace
    ? scoreIdentity(primaryPlace, input)
    : { status: "未判定", score: 0, reasons: ["候補が見つかりません"] };

  return {
    ok: true,
    configured: true,
    query,
    candidates,
    primary_place: primaryPlace,
    competitors,
    identity,
    maps_report: evaluateMapsReadiness(primaryPlace, competitors)
  };
}

module.exports = {
  fetchPlacesObservation
};
