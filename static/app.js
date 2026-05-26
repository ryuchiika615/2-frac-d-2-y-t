const sourceText = document.querySelector("#sourceText");
const preview = document.querySelector("#preview");
const statusText = document.querySelector("#statusText");
const warningsBox = document.querySelector("#warnings");
const convertButton = document.querySelector("#convertButton");
const clearButton = document.querySelector("#clearButton");
const copyHtmlButton = document.querySelector("#copyHtmlButton");
const copyTextButton = document.querySelector("#copyTextButton");
const sampleButton = document.querySelector("#sampleButton");

let latest = {
  wordHtml: "",
  plainText: "",
};

let convertTimer = null;

const sample = `【解法プロセス】
両辺をラプラス変換すると、2階微分の定理より次式を得る。
$$\\left[s^2Y(s) - sy(0) - y^{\\prime}(0)\\right] + 4\\left[sY(s) - y(0)\\right] + 5Y(s) = 0$$
初期条件 $y(0)=1, \\ y^{\\prime}(0)=-2$ を代入する。
$$Y(s) = \\frac{s + 2}{(s + 2)^2 + 1}$$
【解答】
$$y(t) = e^{-2t}\\cos t$$`;

async function convertNow() {
  const text = sourceText.value.trim();
  if (!text) {
    latest = { wordHtml: "", plainText: "" };
    preview.className = "preview empty";
    preview.textContent = "変換後の文章がここに表示されます。";
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

  const htmlBlob = new Blob([latest.wordHtml], { type: "text/html" });
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
sampleButton.addEventListener("click", () => {
  sourceText.value = sample;
  queueConvert();
});
