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
3. コピーアイコンを押してWordに貼り付けます。

## Renderで公開する

1. このフォルダをGitHubへpushします。
2. Renderで「New Web Service」を選び、GitHubリポジトリを接続します。
3. `render.yaml` を使う設定にすると、ビルドと起動コマンドが自動で入ります。

