# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)



## 最終的な推奨コマンド

### 標準構成（バランス重視）
```bash
yt-dlp \
    -f 'bv*+ba/b' \                       # 最高品質の動画+音声を選択
    --remux-video mp4/mkv \               # 動画をmp4/mkvに再エンコードなしで変換
    --convert-thumbnails png \            # サムネイルをPNG形式に変換
    --embed-thumbnail \                   # サムネイルを動画ファイルに埋め込み
    --embed-metadata \                    # メタデータを動画ファイルに埋め込み
    --paths temp:tmp \                    # 一時ファイルをtmpディレクトリに保存
    -o '%(title).200B [%(id)s].%(ext)s' \ # ファイル名形式（タイトル200バイト制限）
    --retries 10 \                        # ダウンロード失敗時の再試行回数（デフォルト: 10）
    --fragment-retries 20 \               # フラグメント失敗時の再試行回数（デフォルト: 10）
    --file-access-retries 5 \             # ファイルアクセス失敗時の再試行回数（デフォルト: 3）
    --socket-timeout 30 \                 # ソケットタイムアウト（秒）
    --sleep-requests 2 \                  # リクエスト間の待機時間（秒）（デフォルト: なし）
    --sleep-interval 3 \                  # 最小スリープ間隔（秒）（デフォルト: なし）
    --max-sleep-interval 8 \              # 最大スリープ間隔（秒）（デフォルト: なし）
    --no-abort-on-error \                 # エラー時でも処理を継続（デフォルト: false）
    --skip-unavailable-fragments          # 利用できないフラグメントをスキップ（デフォルト: false）
```

### 高堅牢性構成（安定性最優先）
```bash
yt-dlp \
    -f 'bv*+ba/b' \                       # 最高品質の動画+音声を選択
    --remux-video mp4/mkv \               # 動画をmp4/mkvに再エンコードなしで変換
    --convert-thumbnails png \            # サムネイルをPNG形式に変換
    --embed-thumbnail \                   # サムネイルを動画ファイルに埋め込み
    --embed-metadata \                    # メタデータを動画ファイルに埋め込み
    --paths temp:tmp \                    # 一時ファイルをtmpディレクトリに保存
    -o '%(title).200B [%(id)s].%(ext)s' \ # ファイル名形式（タイトル200バイト制限）
    --retries infinite \                  # ダウンロード失敗時の再試行回数（無限）（デフォルト: 10）
    --fragment-retries infinite \         # フラグメント失敗時の再試行回数（無限）（デフォルト: 10）
    --file-access-retries 10 \            # ファイルアクセス失敗時の再試行回数（デフォルト: 3）
    --socket-timeout 60 \                 # ソケットタイムアウト（秒）
    --sleep-requests 3 \                  # リクエスト間の待機時間（秒）（デフォルト: なし）
    --sleep-interval 5 \                  # 最小スリープ間隔（秒）（デフォルト: なし）
    --max-sleep-interval 15 \             # 最大スリープ間隔（秒）（デフォルト: なし）
    --limit-rate 3M \                     # 帯域制限（3MB/s）（デフォルト: なし）
    --no-abort-on-error \                 # エラー時でも処理を継続（デフォルト: false）
    --skip-unavailable-fragments \        # 利用できないフラグメントをスキップ（デフォルト: false）
    --force-ipv4 \                        # IPv4強制使用（デフォルト: false）
    --geo-bypass                          # 地域制限回避を試行（デフォルト: false）
```

### myダウンロード設定
```bash
yt-dlp \
    -f 'bv*+ba/b' \                       # 最高品質の動画+音声を選択
    --remux-video mp4/mkv \               # 動画をmp4/mkvに再エンコードなしで変換
    --convert-thumbnails png \            # サムネイルをPNG形式に変換
    --embed-thumbnail \                   # サムネイルを動画ファイルに埋め込み
    --embed-metadata \                    # メタデータを動画ファイルに埋め込み
    --paths temp:tmp \                    # 一時ファイルをtmpディレクトリに保存
    -o '%(title).200B [%(id)s].%(ext)s' \ # ファイル名形式（タイトル200バイト制限）
    --sleep-requests 2 \                  # リクエスト間の待機時間（秒）（デフォルト: なし）
    --sleep-interval 3 \                  # 最小スリープ間隔（秒）（デフォルト: なし）
    --max-sleep-interval 8 \              # 最大スリープ間隔（秒）（デフォルト: なし）
    --no-continue                         # 中断ファイルの使用なし
    --socket-timeout 60 \                 # ソケットタイムアウト（秒）
```