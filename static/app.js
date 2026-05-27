const sourceText = document.querySelector("#sourceText");
const preview = document.querySelector("#preview");
const statusText = document.querySelector("#statusText");
const warningsBox = document.querySelector("#warnings");
const graphPanel = document.querySelector("#graphPanel");
const graphStatus = document.querySelector("#graphStatus");
const graphCanvas = document.querySelector("#graphCanvas");
const convertButton = document.querySelector("#convertButton");
const clearButton = document.querySelector("#clearButton");
const copyHtmlButton = document.querySelector("#copyHtmlButton");
const copyTextButton = document.querySelector("#copyTextButton");
const copyGraphButton = document.querySelector("#copyGraphButton");
const downloadGraphButton = document.querySelector("#downloadGraphButton");
const sampleButton = document.querySelector("#sampleButton");

let latest = {
  wordHtml: "",
  plainText: "",
};

let latestGraph = null;
let convertTimer = null;

const sample = `x(t)=u(t)のときのy(t)の導出およびグラフの概形

【解法プロセス】
入力x(t)=u(t)をラプラス変換すると X(s)=1/s となる。これを(1)の結果に代入する。

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
    latestGraph = null;
    preview.className = "preview empty";
    preview.textContent = "変換後の文章がここに表示されます。";
    graphPanel.hidden = true;
    warningsBox.hidden = true;
    statusText.textContent = "入力すると自動でプレビューします。";
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
  updateGraph(text);

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

async function copyWordHtml() {
  if (!latest.wordHtml) {
    await convertNow();
  }

  let html = latest.wordHtml;
  if (latestGraph) {
    const graphImage = graphCanvas.toDataURL("image/png");
    html = html.replace(
      "</body>",
      `<h2>グラフの概形</h2><img class="wave-image" src="${graphImage}" alt="波形グラフ"></body>`
    );
  }

  const htmlBlob = new Blob([html], { type: "text/html" });
  const textBlob = new Blob([latest.plainText || sourceText.value], { type: "text/plain" });

  if (navigator.clipboard && window.ClipboardItem) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlob,
        "text/plain": textBlob,
      }),
    ]);
  } else {
    await navigator.clipboard.writeText(latest.plainText || sourceText.value);
  }

  statusText.textContent = "コピーしました。Wordに貼り付けてください。";
}

async function copyPlainText() {
  if (!latest.plainText) {
    await convertNow();
  }
  await navigator.clipboard.writeText(latest.plainText || sourceText.value);
  statusText.textContent = "文字だけコピーしました。";
}

async function copyGraphImage() {
  if (!latestGraph) {
    graphStatus.textContent = "先に式を含む文章を入力してください。";
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
  link.download = "waveform.png";
  link.href = graphCanvas.toDataURL("image/png");
  link.click();
}

function updateGraph(text) {
  const expression = extractYExpression(text);
  if (!expression) {
    latestGraph = null;
    graphPanel.hidden = true;
    return;
  }

  const compiled = compileExpression(expression);
  if (!compiled.ok) {
    latestGraph = null;
    graphPanel.hidden = false;
    clearGraphCanvas();
    graphStatus.textContent = `式は見つかりましたが、まだグラフ化できません: ${expression}`;
    return;
  }

  latestGraph = {
    expression,
    fn: compiled.fn,
  };
  graphPanel.hidden = false;
  graphStatus.textContent = `検出した式: y(t) = ${expression}`;
  drawGraph(compiled.fn, expression);
}

function extractYExpression(text) {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/Ｙ/g, "Y")
    .replace(/ｙ/g, "y")
    .replace(/Ｔ/g, "T")
    .replace(/ｔ/g, "t")
    .replace(/＝/g, "=");

  const matches = [...normalized.matchAll(/y\s*\(\s*t\s*\)\s*=\s*([^\n。]+)/gi)];
  if (!matches.length) {
    return "";
  }

  return matches[matches.length - 1][1]
    .replace(/これが計算結果.*$/u, "")
    .replace(/【.*$/u, "")
    .trim();
}

function compileExpression(expression) {
  try {
    const jsExpression = toJsExpression(expression);
    if (!/^[0-9t+\-*/().,\sA-Za-z]+$/.test(jsExpression)) {
      return { ok: false };
    }

    const fn = new Function(
      "t",
      `"use strict"; const sin=Math.sin, cos=Math.cos, tan=Math.tan, exp=Math.exp, sqrt=Math.sqrt, log=Math.log, pi=Math.PI; return ${jsExpression};`
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
    .replace(/\\pi/g, "pi")
    .replace(/u\(\s*t\s*\)/gi, "")
    .replace(/\{([^{}]+)\}/g, "($1)");

  out = replaceSimpleFractions(out);
  out = out.replace(/e\^\(([^()]+)\)/g, "exp($1)");
  out = out.replace(/e\^(-?\d+(?:\.\d+)?\*?t)/g, "exp($1)");
  out = out.replace(/\^/g, "**");
  out = out.replace(/(\d(?:\.\d+)?)(t|pi|sin|cos|tan|exp|sqrt|log)/g, "$1*$2");
  out = out.replace(/(t|\))(\d)/g, "$1*$2");
  out = out.replace(/\)(t|pi|sin|cos|tan|exp|sqrt|log|\()/g, ")*$1");
  out = out.replace(/(sin|cos|tan|exp|sqrt|log)([tpi\d.-])/g, "$1($2)");

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

function drawGraph(fn, expression) {
  const ctx = graphCanvas.getContext("2d");
  const width = graphCanvas.width;
  const height = graphCanvas.height;
  const pad = { left: 70, right: 26, top: 36, bottom: 58 };
  const tMin = 0;
  const tMax = chooseTimeMax(expression);
  const samples = [];

  for (let i = 0; i <= 360; i += 1) {
    const t = tMin + (tMax - tMin) * (i / 360);
    const y = fn(t);
    if (Number.isFinite(y)) {
      samples.push({ t, y });
    }
  }

  if (samples.length < 2) {
    clearGraphCanvas();
    graphStatus.textContent = "グラフにできる点が足りません。";
    return;
  }

  const yValues = samples.map((point) => point.y);
  const yFinal = samples[samples.length - 1].y;
  let yMin = Math.min(0, ...yValues, yFinal);
  let yMax = Math.max(1, ...yValues, yFinal);
  const margin = Math.max((yMax - yMin) * 0.12, 0.15);
  yMin -= margin;
  yMax += margin;

  const x = (t) => pad.left + ((t - tMin) / (tMax - tMin)) * (width - pad.left - pad.right);
  const y = (value) => pad.top + ((yMax - value) / (yMax - yMin)) * (height - pad.top - pad.bottom);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  drawGrid(ctx, width, height, pad, tMin, tMax, yMin, yMax, x, y);
  drawAsymptote(ctx, x, y, tMin, tMax, yFinal);

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

  const tauPoint = findTauPoint(fn, expression);
  if (tauPoint) {
    drawPoint(ctx, x(tauPoint.t), y(tauPoint.y), `(${tauPoint.t}, ${tauPoint.y.toFixed(3)})`);
  }

  ctx.fillStyle = "#17201b";
  ctx.font = "700 24px Yu Gothic, Meiryo, sans-serif";
  ctx.fillText(`y(t) = ${expression}`, pad.left, 28);

  ctx.font = "18px Yu Gothic, Meiryo, sans-serif";
  ctx.fillText("t", width - 26, y(0) - 10);
  ctx.fillText("y(t)", pad.left - 54, pad.top + 8);
}

function chooseTimeMax(expression) {
  const match = expression.match(/e\^\(?-?(\d+(?:\.\d+)?)t/i) || expression.match(/exp\(-?(\d+(?:\.\d+)?)t/i);
  if (!match) {
    return 8;
  }
  const rate = Number(match[1]);
  if (!Number.isFinite(rate) || rate <= 0) {
    return 8;
  }
  return Math.min(Math.max(6 / rate, 3), 12);
}

function findTauPoint(fn, expression) {
  const match = expression.match(/e\^\(?-?(\d+(?:\.\d+)?)t/i) || expression.match(/exp\(-?(\d+(?:\.\d+)?)t/i);
  if (!match) {
    return null;
  }
  const rate = Number(match[1]);
  if (!Number.isFinite(rate) || rate <= 0) {
    return null;
  }
  const t = 1 / rate;
  const y = fn(t);
  if (!Number.isFinite(y)) {
    return null;
  }
  return { t: Number(t.toFixed(3)), y };
}

function drawGrid(ctx, width, height, pad, tMin, tMax, yMin, yMax, x, y) {
  ctx.strokeStyle = "#dce2dc";
  ctx.lineWidth = 1;
  ctx.font = "15px Yu Gothic, Meiryo, sans-serif";
  ctx.fillStyle = "#667069";

  for (let i = 0; i <= 6; i += 1) {
    const t = tMin + (tMax - tMin) * (i / 6);
    const px = x(t);
    ctx.beginPath();
    ctx.moveTo(px, pad.top);
    ctx.lineTo(px, height - pad.bottom);
    ctx.stroke();
    ctx.fillText(formatTick(t), px - 12, height - pad.bottom + 28);
  }

  for (let i = 0; i <= 5; i += 1) {
    const value = yMin + (yMax - yMin) * (i / 5);
    const py = y(value);
    ctx.beginPath();
    ctx.moveTo(pad.left, py);
    ctx.lineTo(width - pad.right, py);
    ctx.stroke();
    ctx.fillText(formatTick(value), 14, py + 5);
  }

  ctx.strokeStyle = "#17201b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad.left, y(0));
  ctx.lineTo(width - pad.right, y(0));
  ctx.moveTo(x(0), pad.top);
  ctx.lineTo(x(0), height - pad.bottom);
  ctx.stroke();
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

sourceText.addEventListener("input", queueConvert);
convertButton.addEventListener("click", () => convertNow().catch((error) => {
  statusText.textContent = error.message;
}));
clearButton.addEventListener("click", () => {
  sourceText.value = "";
  queueConvert();
  sourceText.focus();
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
  queueConvert();
});
