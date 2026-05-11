function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function buildMonthlyReport(input, placesObservation, diagnosisResult) {
  const diagnosis = diagnosisResult?.diagnosis || diagnosisResult || {};
  const scores = diagnosis.scores || {};
  const mapsReport = placesObservation?.maps_report || {};
  const primary = placesObservation?.primary_place || {};
  const storeName = diagnosis.store_name || primary.name || input.store_query || "診断店舗";

  const actions = [
    diagnosis.top_fix,
    ...(mapsReport.quick_fixes || []),
    ...(diagnosis.video_ideas || []).map((idea) => `${idea.tag}: ${idea.title}`)
  ].filter(Boolean);

  return {
    month: input.month || currentMonth(),
    store_name: storeName,
    status: "月次βレポート下書き",
    observed_metrics: {
      maps_rating: primary.rating ?? null,
      maps_review_count: primary.user_rating_count ?? null,
      maps_score: mapsReport.maps_score ?? scores.maps_score ?? null,
      identity_status: placesObservation?.identity?.status || "未判定",
      identity_score: placesObservation?.identity?.score ?? null
    },
    score_snapshot: {
      total_score: diagnosis.total_score ?? null,
      maps_score: scores.maps_score ?? mapsReport.maps_score ?? null,
      seo_score: scores.seo_score ?? null,
      plan_score: scores.plan_score ?? null,
      impulse_score: scores.impulse_score ?? null,
      worldview_score: scores.worldview_score ?? null
    },
    this_month_focus: diagnosis.top_fix || mapsReport.quick_fixes?.[0] || "Google MapsとSNSの来店前情報を整える",
    action_items: actions.slice(0, 7),
    video_plan: diagnosis.video_ideas || [],
    owner_talk_script: [
      "まずGoogle MapsとSEOの観測値を確認します。",
      "次に、来店前不安とSave→Plan→Impulseのどこで止まっているかを見ます。",
      "今月は一度に全部ではなく、最も効く1点から改善します。"
    ],
    next_review_questions: [
      "改善後、Google Maps経由の問い合わせや経路検索は増えたか",
      "駐車場・入口・席・価格に関する質問は減ったか",
      "動画投稿後、保存・問い合わせ・来店会話に変化はあったか"
    ]
  };
}

module.exports = {
  buildMonthlyReport
};
