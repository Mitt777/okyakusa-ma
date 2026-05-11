const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node scripts/generate-report.js data/reports/test-store.json");
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(path.resolve(root, inputPath), "utf8"));
const samplePath = path.join(root, "r", "sample", "index.html");
const outputDir = path.join(root, "r", data.short_id);
const outputPath = path.join(outputDir, "index.html");

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function block(items, className, strength = false) {
  return items.map((item, index) => `
            <div class="${className}${strength ? " strength" : ""}">
              <div class="rank-num">${index + 1}</div>
              <div class="rank-copy">
                <strong>${esc(item.title)}</strong>
                <span>${esc(item.body)}</span>
              </div>
            </div>`).join("");
}

function audience(items) {
  return items.map((item) => `<div class="audience"><strong>${esc(item.title)}</strong><span>${esc(item.body)}</span></div>`).join("\n            ");
}

function videos(items) {
  return items.map((item, index) => `
              <div class="video-item">
                <div class="video-icon">${index + 1}</div>
                <div class="video-copy"><strong>${esc(item.title)}</strong><span>${esc(item.body)}</span></div>
                <div class="tag">${esc(item.tag)}</div>
              </div>`).join("");
}

let html = fs.readFileSync(samplePath, "utf8");

html = html
  .replace(/<title>.*?<\/title>/, `<title>${esc(data.store_name)} 無料診断レポート | お客様どっと混む</title>`)
  .replace(/<span class="pill">那須・カフェ想定<\/span>/, `<span class="pill">${esc(data.report_area)}</span>`)
  .replace(/<div class="store-kicker"><span class="dot"><\/span> 診断対象サンプル<\/div>/, `<div class="store-kicker"><span class="dot"></span> ${esc(data.store_kicker)}</div>`)
  .replace(/<h1>森の入口カフェ<\/h1>/, `<h1>${esc(data.store_name)}</h1>`)
  .replace(/<p class="diagnosis-line">[\s\S]*?<\/p>/, `<p class="diagnosis-line">${esc(data.diagnosis_line)}</p>`)
  .replace(/--value: 62;/, `--value: ${Number(data.total_score) || 0};`)
  .replace(/aria-label="総合えらばれ度 62点"/, `aria-label="総合えらばれ度 ${Number(data.total_score) || 0}点"`)
  .replace(/<div class="score-num"><strong>62<\/strong><span>\/ 100<\/span><\/div>/, `<div class="score-num"><strong>${Number(data.total_score) || 0}</strong><span>/ 100</span></div>`)
  .replace(/<div class="caption-main">.*?<\/div>/, `<div class="caption-main">${esc(data.caption_main)}</div>`)
  .replace(/<div class="caption-text">[\s\S]*?<\/div>/, `<div class="caption-text">${esc(data.caption_text)}</div>`)
  .replace(/<div class="metric"><span>最も強い導線<\/span><strong>.*?<\/strong><\/div>/, `<div class="metric"><span>最も強い導線</span><strong>${esc(data.strongest_axis)}</strong></div>`)
  .replace(/<div class="metric"><span>最も弱い導線<\/span><strong>.*?<\/strong><\/div>/, `<div class="metric"><span>最も弱い導線</span><strong>${esc(data.weakest_axis)}</strong></div>`)
  .replace(/<div class="metric"><span>最優先改善<\/span><strong>.*?<\/strong><\/div>/, `<div class="metric"><span>最優先改善</span><strong>${esc(data.priority_fix)}</strong></div>`)
  .replace(/<div class="legend-row"><span>Maps整備<\/span><div class="bar"><span style="width:\d+%"><\/span><\/div><b>\d+<\/b><\/div>/, `<div class="legend-row"><span>Maps整備</span><div class="bar"><span style="width:${Number(data.maps_score) || 0}%"></span></div><b>${Number(data.maps_score) || 0}</b></div>`)
  .replace(/<div class="legend-row"><span>Plan情報<\/span><div class="bar"><span style="width:\d+%"><\/span><\/div><b>\d+<\/b><\/div>/, `<div class="legend-row"><span>Plan情報</span><div class="bar"><span style="width:${Number(data.plan_score) || 0}%"></span></div><b>${Number(data.plan_score) || 0}</b></div>`)
  .replace(/<div class="legend-row"><span>世界観<\/span><div class="bar"><span style="width:\d+%"><\/span><\/div><b>\d+<\/b><\/div>/, `<div class="legend-row"><span>世界観</span><div class="bar"><span style="width:${Number(data.worldview_score) || 0}%"></span></div><b>${Number(data.worldview_score) || 0}</b></div>`)
  .replace(/<div class="rank-list">\s*<div class="rank-item">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<div class="panel">\s*<div class="section-title">\s*<h2>強みトップ3<\/h2>/, `<div class="rank-list">${block(data.weaknesses, "rank-item")}\n          </div>\n        </div>\n\n        <div class="panel">\n          <div class="section-title">\n            <h2>強みトップ3</h2>`)
  .replace(/<div class="rank-list">\s*<div class="rank-item strength">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<div class="panel full">\s*<div class="section-title">\s*<h2>逃している可能性のあるお客様<\/h2>/, `<div class="rank-list">${block(data.strengths, "rank-item", true)}\n          </div>\n        </div>\n\n        <div class="panel full">\n          <div class="section-title">\n            <h2>逃している可能性のあるお客様</h2>`)
  .replace(/<div class="audience-grid">[\s\S]*?<\/div>\s*<\/div>\s*<div class="panel full">\s*<div class="section-title">\s*<h2>今日から動くなら<\/h2>/, `<div class="audience-grid">\n            ${audience(data.audiences)}\n          </div>\n        </div>\n\n        <div class="panel full">\n          <div class="section-title">\n            <h2>今日から動くなら</h2>`)
  .replace(/<strong>Google MapsとInstagramハイライトに、駐車場・入口・席・価格を追加する。<\/strong>/, `<strong>${esc(data.top_fix)}</strong>`)
  .replace(/<div class="video-list" aria-label="今撮るべき動画3本">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/section>/, `<div class="video-list" aria-label="今撮るべき動画3本">${videos(data.videos)}\n            </div>\n          </div>\n        </div>\n      </section>`)
  .replace(/森の入口カフェ/g, esc(data.store_name));

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, html);
console.log(`Generated ${path.relative(root, outputPath)}`);
