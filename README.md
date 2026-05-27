# Word数式ペースト変換

Geminiなどの回答に含まれる `$...$` / `$$...$$` のLaTeX数式を、Wordへ貼り付けやすいHTML + MathMLに変換するWebアプリです。

## ローカルで動かす

```powershell
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

ブラウザで `http://localhost:5000` を開きます。

## 使い方

1. Geminiの回答を左側に貼り付けます。
2. 変換結果を確認します。
3. `y(t)=1-e^(-2t)` のような式が含まれていれば、波形グラフも自動で表示されます。
4. コピーアイコンを押してWordに貼り付けます。グラフが表示されている場合は、グラフ画像も一緒に入ります。

## グラフ化できる式の例

- `y(t)=1-e^(-2t)`
- `y(t)=e^{-2t}\cos t`
- `y(t)=2e^{-2t}u(t)`

指数関数、三角関数、四則演算、簡単な分数に対応しています。

## Renderで公開する

1. このフォルダをGitHubへpushします。
2. Renderで「New Web Service」を選び、GitHubリポジトリを接続します。
3. `render.yaml` を使う設定にすると、ビルドと起動コマンドが自動で入ります。
