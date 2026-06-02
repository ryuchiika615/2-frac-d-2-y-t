const sourceText = document.querySelector("#sourceText");
const preview = document.querySelector("#preview");
const statusText = document.querySelector("#statusText");
const warningsBox = document.querySelector("#warnings");
const graphPanel = document.querySelector("#graphPanel");
const graphStatus = document.querySelector("#graphStatus");
const graphCanvas = document.querySelector("#graphCanvas");
const formulaInput = document.querySelector("#formulaInput");
const tMinInput = document.querySelector("#tMinInput");
const tMaxInput = document.querySelector("#tMaxInput");
const convertButton = document.querySelector("#convertButton");
const clearButton = document.querySelector("#clearButton");
const copyHtmlButton = document.querySelector("#copyHtmlButton");
const copyTextButton = document.querySelector("#copyTextButton");
const copyGraphButton = document.querySelector("#copyGraphButton");
const downloadGraphButton = document.querySelector("#downloadGraphButton");
const plotFormulaButton = document.querySelector("#plotFormulaButton");
const clearFormulaButton = document.querySelector("#clearFormulaButton");
const sampleButton = document.querySelector("#sampleButton");

let latest = {
  wordHtml: "",
  plainText: "",
};

let latestGraph = null;
let convertTimer = null;
let graphTimer = null;

const sample = `x(t)=u(t)のときのy(t)の導出およびグラフの概形

【解法プロセス】
入力x(t)=u(t)をラプラス変換すると X(s)=1/s となる。
Y(s)=2/(s+2)・1/s=2/(s(s+2))

部分分数分解すると、
Y(s)=1/s-1/(s+2)

両辺を逆ラプラス変換する。
y(t)=(1-e^(-2t))u(t)

【解答】
y(t)=1-e^(-2t)`;

async function convertNow() {
  const text = sourceText.value.trim();
  if (!text) {
    latest = { wordHtml: "", plainText: "" };
    preview.className = "preview empty";
    preview.textContent = "変換後の文章がここに表示されます。";
    warningsBox.hidden = true;
    statusText.textContent = "入力すると自動でプレビューします。";
    if (!formulaInput.value.trim()) {
      latestGraph = null;
      graphPanel.hidden = true;
    }
    return;
  }

  statusText.textContent = "変換中...";
  const response = await fetch("/api/convert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "変換に失敗しました");
  }

  latest = data;
  preview.className = "preview";
  preview.innerHTML = data.previewHtml;
  statusText.textContent = "Wordにコピーして貼り付けできます。";

  if (!formulaInput.value.trim()) {
    updateGraphFromText(text);
  }

  if (data.warnings && data.warnings.length) {
    warningsBox.hidden = false;
    warningsBox.textContent = data.warnings.join("\n");
  } else {
    warningsBox.hidden = true;
    warningsBox.textContent = "";
  }
}

function queueConvert() {
  window.clearTimeout(convertTimer);
  convertTimer = window.setTimeout(() => {
    convertNow().catch((error) => {
      statusText.textContent = error.message;
    });
  }, 250);
}

function queueFormulaGraph() {
  window.clearTimeout(graphTimer);
  graphTimer = window.setTimeout(() => {
    updateGraphFromFormula();
  }, 180);
}

async function copyWordHtml() {
  if (!latest.wordHtml && sourceText.value.trim()) {
    await convertNow();
  }

  const baseHtml = latest.wordHtml || emptyWordDocument();
  let html = baseHtml;
  if (latestGraph) {
    const graphImage = graphCanvas.toDataURL("image/png");
    html = html.replace(
      "</body>",
      `<h2>グラフ</h2><p>y(t) = ${escapeHtml(latestGraph.expression)}</p><img class="wave-image" src="${graphImage}" alt="グラフ"></body>`
    );
  }

  const htmlBlob = new Blob([html], { type: "text/html" });
  const textBlob = new Blob([latest.plainText || sourceText.value || latestGraph?.expression || ""], { type: "text/plain" });

  if (navigator.clipboard && window.ClipboardItem) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      }),
    ]);
  } else {
    await navigator.clipboard.writeText(latest.plainText || sourceText.value || latestGraph?.expression || "");
  }

  statusText.textContent = "コピーしました。Wordに貼り付けてください。";
}

async function copyPlainText() {
  if (!latest.plainText && sourceText.value.trim()) {
    await convertNow();
  }
  await navigator.clipboard.writeText(latest.plainText || sourceText.value || formulaInput.value);
  statusText.textContent = "文字だけコピーしました。";
}

async function copyGraphImage() {
  if (!latestGraph) {
    graphStatus.textContent = "先に式を入力してグラフを作成してください。";
    return;
  }

  graphCanvas.toBlob(async (blob) => {
    if (!blob) {
      graphStatus.textContent = "画像を作れませんでした。";
      return;
    }
    if (navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      graphStatus.textContent = "グラフ画像をコピーしました。";
    } else {
      downloadGraph();
    }
  }, "image/png");
}

function downloadGraph() {
  if (!latestGraph) {
    graphStatus.textContent = "保存できるグラフがまだありません。";
    return;
  }
  const link = document.createElement("a");
  link.download = "graph.png";
  link.href = graphCanvas.toDataURL("image/png");
  link.click();
}

function updateGraphFromText(text) {
  const expression = extractYExpression(text);
  if (!expression) {
    latestGraph = null;
    graphPanel.hidden = true;
    return;
  }
  plotExpression(expression, "本文から検出");
}

function updateGraphFromFormula() {
  const expression = normalizeFormulaInput(formulaInput.value);
  if (!expression) {
    if (!sourceText.value.trim()) {
      latestGraph = null;
      graphPanel.hidden = true;
    } else {
      updateGraphFromText(sourceText.value);
    }
    return;
  }
  plotExpression(expression, "手入力");
}

function plotExpression(expression, sourceLabel) {
  const compiled = compileExpression(expression);
  graphPanel.hidden = false;

  if (!compiled.ok) {
    latestGraph = null;
    clearGraphCanvas();
    graphStatus.textContent = `グラフ化できませんでした: ${expression}`;
    return;
  }

  const range = readGraphRange();
  if (!range.ok) {
    latestGraph = null;
    clearGraphCanvas();
    graphStatus.textContent = "横軸の最小値と最大値を正しく入力してください。";
    return;
  }

  latestGraph = {
    expression,
    fn: compiled.fn,
    sourceLabel,
  };
  graphStatus.textContent = `${sourceLabel}: y(t) = ${expression}`;
  drawGraph(compiled.fn, expression, range);
}

function readGraphRange() {
  const min = Number(tMinInput.value);
  const max = Number(tMaxInput.value);
  if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
    return { ok: false };
  }
  return { ok: true, min, max };
}

function extractYExpression(text) {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/Ｙ/g, "Y")
    .replace(/ｙ/g, "y")
    .replace(/Ｘ/g, "X")
    .replace(/ｘ/g, "x")
    .replace(/Ｔ/g, "T")
    .replace(/ｔ/g, "t")
    .replace(/＝/g, "=");

  const matches = [...normalized.matchAll(/y\s*\(\s*[tx]\s*\)\s*=\s*([^\n。]+)/gi)];
  if (!matches.length) {
    return "";
  }

  return normalizeFormulaInput(matches[matches.length - 1][1]
    .replace(/これが計算結果.*$/u, "")
    .replace(/【.*$/u, "")
    .trim());
}

function normalizeFormulaInput(value) {
  return value
    .trim()
    .replace(/^y\s*\(\s*[tx]\s*\)\s*=\s*/i, "")
    .replace(/^y\s*=\s*/i, "")
    .trim();
}

function compileExpression(expression) {
  try {
    const jsExpression = toJsExpression(expression);
    if (!/^[0-9tx+\-*/().,\sA-Za-z]+$/.test(jsExpression)) {
      return { ok: false };
    }

    const fn = new Function(
      "t",
      `"use strict"; const x=t, sin=Math.sin, cos=Math.cos, tan=Math.tan, exp=Math.exp, sqrt=Math.sqrt, log=Math.log, ln=Math.log, abs=Math.abs, pi=Math.PI; return ${jsExpression};`
    );

    const test = fn(0.5);
    if (!Number.isFinite(test)) {
      return { ok: false };
    }

    return { ok: true, fn };
  } catch {
    return { ok: false };
  }
}

function toJsExpression(expression) {
  let out = expression
    .replace(/\s+/g, "")
    .replace(/[　]/g, "")
    .replace(/・|·|×/g, "*")
    .replace(/−/g, "-")
    .replace(/π/g, "pi")
    .replace(/\\left|\\right/g, "")
    .replace(/\\,/g, "")
    .replace(/\\cdot/g, "*")
    .replace(/\\sin/g, "sin")
    .replace(/\\cos/g, "cos")
    .replace(/\\tan/g, "tan")
    .replace(/\\exp/g, "exp")
    .replace(/\\sqrt/g, "sqrt")
    .replace(/\\ln/g, "ln")
    .replace(/\\log/g, "log")
    .replace(/\\pi/g, "pi")
    .replace(/u\(\s*t\s*\)/gi, "")
    .replace(/\{([^{}]+)\}/g, "($1)");

  out = replaceSimpleFractions(out);
  out = out.replace(/e\^\(([^()]+)\)/g, "exp($1)");
  out = out.replace(/e\^(-?\d+(?:\.\d+)?\*?[tx])/g, "exp($1)");
  out = out.replace(/\^/g, "**");
  out = out.replace(/(\d(?:\.\d+)?)([tx]|pi|sin|cos|tan|exp|sqrt|log|ln|abs)/g, "$1*$2");
  out = out.replace(/([tx]|\))(\d)/g, "$1*$2");
  out = out.replace(/\)([tx]|pi|sin|cos|tan|exp|sqrt|log|ln|abs|\()/g, ")*$1");
  out = out.replace(/(sin|cos|tan|exp|sqrt|log|ln|abs)([txpi\d.-])/g, "$1($2)");

  return out;
}

function replaceSimpleFractions(expression) {
  let out = expression;
  let previous = "";
  while (out !== previous) {
    previous = out;
    out = out.replace(/\\frac\(([^()]+)\)\(([^()]+)\)/g, "(($1)/($2))");
    out = out.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "(($1)/($2))");
  }
  return out;
}

function drawGraph(fn, expression, range) {
  const ctx = graphCanvas.getContext("2d");
  const width = graphCanvas.width;
  const height = graphCanvas.height;
  const pad = { left: 70, right: 28, top: 38, bottom: 58 };
  const tMin = range.min;
  const tMax = range.max;
  const samples = [];

  for (let i = 0; i <= 600; i += 1) {
    const t = tMin + (tMax - tMin) * (i / 600);
    const yValue = fn(t);
    if (Number.isFinite(yValue)) {
      samples.push({ t, y: yValue });
    }
  }

  if (samples.length < 2) {
    clearGraphCanvas();
    graphStatus.textContent = "グラフにできる点が足りません。横軸範囲を変えてください。";
    return;
  }

  const yValues = samples.map((point) => point.y);
  const yFinal = samples[samples.length - 1].y;
  const rate = extractDecayRate(expression);
  const tau = rate ? 1 / rate : null;
  const tauPoint = tau && tau >= tMin && tau <= tMax ? { t: Number(tau.toFixed(3)), y: fn(tau) } : null;

  let yMin = Math.min(0, ...yValues, tauPoint?.y ?? 0);
  let yMax = Math.max(0, ...yValues, tauPoint?.y ?? 0);
  const span = yMax - yMin || 1;
  const margin = Math.max(span * 0.12, 0.15);
  yMin -= margin;
  yMax += margin;

  const x = (t) => pad.left + ((t - tMin) / (tMax - tMin)) * (width - pad.left - pad.right);
  const y = (value) => pad.top + ((yMax - value) / (yMax - yMin)) * (height - pad.top - pad.bottom);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, width, height, pad, tMin, tMax, yMin, yMax, x, y, tauPoint);
  drawAsymptote(ctx, x, y, tMin, tMax, yFinal);
  drawCurve(ctx, samples, x, y);

  if (tauPoint && Number.isFinite(tauPoint.y)) {
    drawTauGuide(ctx, x(tauPoint.t), y(tauPoint.y), y(0));
    drawPoint(ctx, x(tauPoint.t), y(tauPoint.y), `t=${tauPoint.t}s, y=${tauPoint.y.toFixed(3)}`);
  }

  ctx.fillStyle = "#17201b";
  ctx.font = "700 24px Yu Gothic, Meiryo, sans-serif";
  ctx.fillText(`y(t) = ${expression}`, pad.left, 28);

  ctx.font = "18px Yu Gothic, Meiryo, sans-serif";
  ctx.fillText("t", width - 24, y(0) - 10);
  ctx.fillText("y(t)", pad.left - 54, pad.top + 8);
}

function drawCurve(ctx, samples, x, y) {
  ctx.beginPath();
  samples.forEach((point, index) => {
    const px = x(point.t);
    const py = y(point.y);
    if (index === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  });
  ctx.strokeStyle = "#126d5b";
  ctx.lineWidth = 4;
  ctx.stroke();
}

function extractDecayRate(expression) {
  const compact = expression.replace(/\s+/g, "");
  const match =
    compact.match(/e\^\{?-?(\d+(?:\.\d+)?)\*?[tx]\}?/i) ||
    compact.match(/e\^\(-?(\d+(?:\.\d+)?)\*?[tx]\)/i) ||
    compact.match(/exp\(-?(\d+(?:\.\d+)?)\*?[tx]\)/i);
  if (!match) {
    return null;
  }
  const rate = Number(match[1]);
  if (!Number.isFinite(rate) || rate <= 0) {
    return null;
  }
  return rate;
}

function drawGrid(ctx, width, height, pad, tMin, tMax, yMin, yMax, x, y, tauPoint) {
  ctx.strokeStyle = "#dce2dc";
  ctx.lineWidth = 1;
  ctx.font = "15px Yu Gothic, Meiryo, sans-serif";
  ctx.fillStyle = "#667069";

  const xTicks = buildTicks(tMin, tMax, tauPoint ? tauPoint.t : null);
  xTicks.forEach((t) => {
    const px = x(t);
    ctx.beginPath();
    ctx.moveTo(px, pad.top);
    ctx.lineTo(px, height - pad.bottom);
    ctx.stroke();
    ctx.fillText(formatTick(t), px - 12, height - pad.bottom + 28);
  });

  const yTicks = buildTicks(yMin, yMax, tauPoint ? tauPoint.y : null);
  yTicks.forEach((value) => {
    const py = y(value);
    ctx.beginPath();
    ctx.moveTo(pad.left, py);
    ctx.lineTo(width - pad.right, py);
    ctx.stroke();
    ctx.fillText(formatTick(value), 14, py + 5);
  });

  ctx.strokeStyle = "#17201b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad.left, y(0));
  ctx.lineTo(width - pad.right, y(0));
  ctx.moveTo(x(tMin), pad.top);
  ctx.lineTo(x(tMin), height - pad.bottom);
  ctx.stroke();
}

function buildTicks(min, max, important = null) {
  const ticks = new Set();
  for (let i = 0; i <= 6; i += 1) {
    ticks.add(Number((min + (max - min) * (i / 6)).toFixed(3)));
  }
  if (important !== null && Number.isFinite(important) && important >= min && important <= max) {
    ticks.add(Number(important.toFixed(3)));
  }
  return [...ticks].sort((a, b) => a - b);
}

function drawAsymptote(ctx, x, y, tMin, tMax, value) {
  ctx.save();
  ctx.setLineDash([10, 8]);
  ctx.strokeStyle = "#d78321";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x(tMin), y(value));
  ctx.lineTo(x(tMax), y(value));
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#8a4d0b";
  ctx.font = "15px Yu Gothic, Meiryo, sans-serif";
  ctx.fillText(`y ≈ ${formatTick(value)}`, x(tMax) - 82, y(value) - 10);
}

function drawPoint(ctx, px, py, label) {
  ctx.fillStyle = "#d78321";
  ctx.beginPath();
  ctx.arc(px, py, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#8a4d0b";
  ctx.font = "15px Yu Gothic, Meiryo, sans-serif";
  ctx.fillText(label, px + 12, py - 12);
}

function drawTauGuide(ctx, px, py, zeroY) {
  ctx.save();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = "#8a4d0b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, zeroY);
  ctx.lineTo(px, py);
  ctx.moveTo(70, py);
  ctx.lineTo(px, py);
  ctx.stroke();
  ctx.restore();
}

function clearGraphCanvas() {
  const ctx = graphCanvas.getContext("2d");
  ctx.clearRect(0, 0, graphCanvas.width, graphCanvas.height);
}

function formatTick(value) {
  if (Math.abs(value) >= 10) {
    return value.toFixed(0);
  }
  if (Math.abs(value) >= 1) {
    return value.toFixed(1).replace(/\.0$/, "");
  }
  return value.toFixed(2).replace(/0$/, "").replace(/\.0$/, "");
}

function emptyWordDocument() {
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:'Yu Gothic','Meiryo',sans-serif;font-size:11pt;line-height:1.55;color:#111}.wave-image{display:block;width:520px;max-width:100%;margin:14pt auto}</style></head><body></body></html>`;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

sourceText.addEventListener("input", queueConvert);
formulaInput.addEventListener("input", queueFormulaGraph);
tMinInput.addEventListener("input", queueFormulaGraph);
tMaxInput.addEventListener("input", queueFormulaGraph);
convertButton.addEventListener("click", () => convertNow().catch((error) => {
  statusText.textContent = error.message;
}));
plotFormulaButton.addEventListener("click", updateGraphFromFormula);
clearButton.addEventListener("click", () => {
  sourceText.value = "";
  preview.className = "preview empty";
  preview.textContent = "変換後の文章がここに表示されます。";
  latest = { wordHtml: "", plainText: "" };
  warningsBox.hidden = true;
  statusText.textContent = "入力すると自動でプレビューします。";
  if (!formulaInput.value.trim()) {
    latestGraph = null;
    graphPanel.hidden = true;
  }
  sourceText.focus();
});
clearFormulaButton.addEventListener("click", () => {
  formulaInput.value = "";
  if (sourceText.value.trim()) {
    updateGraphFromText(sourceText.value);
  } else {
    latestGraph = null;
    graphPanel.hidden = true;
  }
  formulaInput.focus();
});
copyHtmlButton.addEventListener("click", () => copyWordHtml().catch((error) => {
  statusText.textContent = error.message;
}));
copyTextButton.addEventListener("click", () => copyPlainText().catch((error) => {
  statusText.textContent = error.message;
}));
copyGraphButton.addEventListener("click", () => copyGraphImage().catch((error) => {
  graphStatus.textContent = error.message;
}));
downloadGraphButton.addEventListener("click", downloadGraph);
sampleButton.addEventListener("click", () => {
  sourceText.value = sample;
  formulaInput.value = "y(t)=1-e^(-2t)";
  queueConvert();
  updateGraphFromFormula();
});
