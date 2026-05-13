# 検索ことば診断 ワンコイン / 月額Search Console設計 v0.1

## 1. 目的

「お客様どっと混む」の検索診断は、店舗オーナーに専門的なSEOレポートを見せることではなく、
「自分のお店は、どんな言葉で探される準備ができているか」をわかりやすく示すことを目的とする。

無料診断では気づきを出し、追加診断では具体的な検索語・競合・改善ページまで示す。
月額版ではSearch Consoleの実データを使い、継続的に改善する。

## 2. 無料診断で出す範囲

- 店舗が入力した重要キーワードの整理
- 地域名、業種、利用シーンから見た検索語候補
- 公式サイト、Google Maps、Instagram/SNSの有無
- SEO/GEOの簡易スコア
- 「検索で見つかる準備」として足りないPlan情報

無料診断では、正確な順位や検索ボリュームを断定しない。

## 3. ワンコイン検索ことば診断で出す範囲

初期想定は500円から980円。
βでは価格よりも「どこまで見せると払いたくなるか」を検証する。

出力候補:

- 入力キーワード5語前後の簡易表示確認
- 自社サイト、Google Maps、Instagram/SNSが検索結果候補に出るか
- 上位候補の競合3件
- 関連キーワード候補
- 検索需要の目安
- キーワード別の今すぐ直すべき改善文
- 公式サイト、Google Maps、SNSのどこを直すべきか

## 4. 使うAPI

### Google Custom Search JSON API

用途:

- 指定キーワードで検索結果候補を取得する
- 自社サイトやSNSが上位候補に見えるか確認する
- 競合候補を数件見る

環境変数:

```text
GOOGLE_CUSTOM_SEARCH_API_KEY
GOOGLE_CUSTOM_SEARCH_CX
```

注意:

- 通常のGoogle検索順位そのものではなく、Custom Search上の簡易確認として扱う
- レポートでは「上位10件内に見える可能性」「簡易表示確認」と表現する
- スクレイピングは行わない

### Google Ads Keyword Planner / Google Ads API

用途:

- 関連キーワード候補
- 月間検索数レンジ
- 競合性
- 地域キーワードの需要感

環境変数候補:

```text
GOOGLE_ADS_DEVELOPER_TOKEN
GOOGLE_ADS_CUSTOMER_ID
GOOGLE_ADS_CLIENT_ID
GOOGLE_ADS_CLIENT_SECRET
GOOGLE_ADS_REFRESH_TOKEN
```

注意:

- Google Adsアカウント、Developer Token、OAuth、顧客IDが必要
- 本格導入はワンコイン診断の反応確認後
- 初期はAPI接続口だけ用意し、未接続時は「需要目安は接続準備中」と表示する

## 5. 月額Search Console伴走

Search Consoleは、店舗または支援者が管理権限を持つサイトだけが対象。
同意と権限付与が必要。

月額版で見るもの:

- 実際に表示された検索クエリ
- クリック数
- 表示回数
- CTR
- 平均掲載順位
- ページ別の流入
- 地域名、業種、利用シーン語の変化
- 改善後のBefore / After

想定レポート:

- 今月増えた検索語
- 逃している検索語
- クリック率が低いページ
- 平均順位はあるがクリックされていない語
- Google Maps、SNS、公式サイトで補うべきPlan情報

## 6. 月額プラン仮説

- ライト: 2,980円/月
  - 月1回のSearch Console要約
  - 重要検索語10個
  - 改善提案3つ

- 標準: 9,800円/月
  - 月次レポート
  - Maps/SNS/公式サイトの改善提案
  - 30分相談またはコメント返し

- マーケター向け: 19,800円/月以上
  - 複数サイト管理
  - 店舗数またはサイト数で従量
  - CSV/Sheets出力
  - クライアント提出用レポート

## 7. 今回実装するもの

- 診断結果ページに「お店の検索ことば診断」を追加
- 入力済みキーワード、地域、業種から検索語候補を作る
- Custom Search APIがあれば簡易表示確認を行う
- Keyword Plannerは接続準備状態を表示する
- API未接続でもβ診断として破綻しないフォールバックを出す

## 8. 今回実装しないもの

- Google Search Console OAuth
- Google Ads APIの本接続
- 正確なGoogle検索順位の断定
- Google検索結果のスクレイピング
- 自動課金
- 会員管理
- 複数店舗管理画面

## 9. 表現ルール

NG:

- 「Google順位を正確に測定しました」
- 「このキーワードで必ず上位化します」
- 「検索ボリュームを完全取得しました」

OK:

- 「簡易表示確認」
- 「上位候補に見える可能性」
- 「検索需要の目安」
- 「Search Console連携後は実データで確認できます」

## 10. 次の実装候補

1. Google Custom Search APIキーをVercelに追加
2. Custom Search Engine IDを追加
3. ワンコイン診断結果を共有URLに保存
4. Keyword Planner連携の試験
5. Search Console月額版のOAuth設計
