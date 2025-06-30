use chardetng::EncodingDetector;
use reqwest;
use serde_json;
use shlex;
use std::fs;
use std::io::Read;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::Emitter;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

// Tauriのエントリポイント
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // env_logger::init();
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("debug")).init();
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            check_ffmpeg_ffprobe_version,
            download_latest_yt_dlp,
        ])
        .run(tauri::generate_context!())
        .expect("Failed to run Tauri application");
}

// ffmpegとffprobeのバージョンを確認するコマンド
#[tauri::command]
async fn check_ffmpeg_ffprobe_version(dir: PathBuf) -> Result<String, String> {
    log::info!("Invoked check_ffmpeg_ffprobe_version with dir: {:?}", dir);

    let (ffmpeg_path, ffprobe_path) = if dir.as_os_str().is_empty() {
        // パス未指定の場合は環境変数PATHから検索
        (String::from("ffmpeg"), String::from("ffprobe"))
    } else {
        // 指定ディレクトリにffmpeg/ffprobeがあると仮定
        let ffmpeg_name = match std::env::consts::OS {
            "windows" => "ffmpeg.exe",
            "macos" | "linux" => "ffmpeg",
            other => {
                log::error!("Unsupported OS: {}", other);
                return Err(format!("Unsupported OS: {}", other));
            }
        };
        let ffprobe_name = match std::env::consts::OS {
            "windows" => "ffprobe.exe",
            "macos" | "linux" => "ffprobe",
            other => {
                log::error!("Unsupported OS: {}", other);
                return Err(format!("Unsupported OS: {}", other));
            }
        };
        (
            dir.join(ffmpeg_name).to_string_lossy().to_string(),
            dir.join(ffprobe_name).to_string_lossy().to_string(),
        )
    };

    // ffmpegのバージョン取得
    let ffmpeg_output = {
        let mut cmd = Command::new(&ffmpeg_path);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        cmd.arg("-version").output()
    };

    // ffprobeのバージョン取得
    let ffprobe_output = {
        let mut cmd = Command::new(&ffprobe_path);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        cmd.arg("-version").output()
    };

    let ffmpeg_result = match ffmpeg_output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            format!("ffmpeg version:\n{}", stdout)
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            format!("ffmpeg error:\n{}", stderr)
        }
        Err(e) => format!("Failed to launch ffmpeg: {}", e),
    };

    let ffprobe_result = match ffprobe_output {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            format!("ffprobe version:\n{}", stdout)
        }
        Ok(output) => {
            let stderr = String::from_utf8_lossy(&output.stderr);
            format!("ffprobe error:\n{}", stderr)
        }
        Err(e) => format!("Failed to launch ffprobe: {}", e),
    };

    // 両方の結果をまとめて返す
    Ok(format!("{}\n{}", ffmpeg_result, ffprobe_result))
}

// 最新のyt-dlpをダウンロードするコマンド
#[tauri::command]
async fn download_latest_yt_dlp() -> Result<String, String> {
    log::info!("Starting download_latest_yt_dlp");

    // HTTPクライアントの初期化
    let client = reqwest::Client::new();

    // カレントディレクトリを取得
    let current_dir = std::env::current_dir().map_err(|e| {
        log::error!("Could not get current directory: {}", e);
        format!("Could not get current directory: {}", e)
    })?;

    // パス作成＋ディレクトリ作成
    let save_dir = current_dir.join("yt-dlp");
    fs::create_dir_all(&save_dir).map_err(|e| {
        log::error!("Could not create save directory: {}", e);
        format!("Could not create save directory: {}", e)
    })?;
    let asset_name = match std::env::consts::OS {
        "windows" => "yt-dlp.exe",
        "macos" => "yt-dlp_macos",
        "linux" => "yt-dlp_linux",
        other => {
            log::error!("Unsupported OS: {}", other);
            return Err(format!("Unsupported OS: {}", other));
        }
    };
    let yt_dlp_file = save_dir.join(asset_name);
    let release_time_file = save_dir.join("release-time.txt");

    // 既存のyt-dlpのバージョンを確認
    let yt_dlp_version_output = {
        let mut cmd = Command::new(&yt_dlp_file);
        #[cfg(windows)] // window hideのための設定
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        match cmd.arg("--version").output() {
            Ok(output) => {
                log::info!(
                    "Successfully retrieved existing yt-dlp version: {:?}",
                    output
                );
                Some(output)
            }
            Err(e) => {
                log::warn!("Could not get existing yt-dlp version: {}", e);
                None
            }
        }
    };

    // release-time.txtから既存バイナリのリリース時間を取得
    let local_binary_release_time = match fs::read_to_string(&release_time_file) {
        Ok(content) => {
            log::info!("Successfully read release-time.txt: {}", content);
            Some(content.trim().to_string())
        }
        Err(e) => {
            log::warn!("Could not read release-time.txt: {}", e);
            None
        }
    };

    // GitHub APIから最新のリリース時間を取得
    let api_url = "https://api.github.com/repos/yt-dlp/yt-dlp-nightly-builds/releases/latest";
    let response = client
        .get(api_url)
        .header("User-Agent", "TakumiVidDl")
        .send()
        .await
        .map_err(|e| {
            log::error!("Failed to fetch release info from GitHub: {}", e);
            format!("Failed to fetch release info from GitHub: {}", e)
        })?;
    response.error_for_status_ref().map_err(|e| {
        log::error!("GitHub API returned error status: {}", e);
        e.to_string()
    })?;
    let release_info: serde_json::Value = response.json().await.map_err(|e| {
        log::error!("Failed to parse GitHub API JSON: {}", e);
        e.to_string()
    })?;
    let github_latest_release_time = match release_info.get("published_at") {
        Some(val) => val,
        None => {
            log::error!("Could not find published_at in release info");
            return Err("Could not find published_at in release info".to_string());
        }
    };

    // local_binary_release_timeとgithub_latest_release_timeを比較して更新が必要か確認
    let local = local_binary_release_time
        .as_deref()
        .and_then(|s| OffsetDateTime::parse(s, &Rfc3339).ok());
    let github = github_latest_release_time
        .as_str()
        .and_then(|s| OffsetDateTime::parse(s, &Rfc3339).ok());
    if let (Some(local), Some(github)) = (local, github) {
        if local >= github && yt_dlp_version_output.is_some() {
            log::info!("yt-dlp is already up to date");
            return Ok("yt-dlp is already up to date.".to_string());
        }
    }

    // 最新のyt-dlpダウンロードURLを取得
    let assets = release_info
        .get("assets")
        .and_then(|a| a.as_array())
        .ok_or_else(|| {
            log::error!("No assets found in release info");
            "No assets found in release info".to_string()
        })?;
    let mut download_url: Option<String> = None;
    for asset in assets {
        if asset.get("name").and_then(|n| n.as_str()) == Some(asset_name) {
            download_url = asset
                .get("browser_download_url")
                .and_then(|u| u.as_str())
                .map(|s| s.to_string());
            break;
        }
    }
    let download_url = download_url.ok_or_else(|| {
        log::error!("Asset not found: {}", asset_name);
        format!("Asset not found: {}", asset_name)
    })?;
    log::info!("yt-dlp download URL: {}", download_url);

    // yt-dlpのダウンロード
    let mut resp = client
        .get(&download_url)
        .header("User-Agent", "TakumiVidDl")
        .send()
        .await
        .map_err(|e| {
            log::error!("Failed to download yt-dlp: {}", e);
            format!("Failed to download yt-dlp: {}", e)
        })?;
    let mut out = fs::File::create(&yt_dlp_file).map_err(|e| {
        log::error!("Could not create yt-dlp file: {}", e);
        format!("Could not create yt-dlp file: {}", e)
    })?;
    while let Some(chunk) = resp.chunk().await.map_err(|e| {
        log::error!("Failed to read download chunk: {}", e);
        format!("Failed to read download chunk: {}", e)
    })? {
        out.write_all(&chunk).map_err(|e| {
            log::error!("Failed to write yt-dlp file: {}", e);
            format!("Failed to write yt-dlp file: {}", e)
        })?;
    }

    // ダウンロードが完了したら、実行権限を付与（Linux/Macのみ）
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = fs::Permissions::from_mode(0o755);
        fs::set_permissions(&yt_dlp_file, perms).map_err(|e| {
            log::error!("Failed to set execute permission: {}", e);
            format!("Failed to set execute permission: {}", e)
        })?;
    }

    // release-time.txtにpublished_atを書き込む
    let time = github_latest_release_time.as_str().ok_or_else(|| {
        log::error!("published_at is not a string");
        "published_at is not a string".to_string()
    })?;
    let mut file = fs::File::create(&release_time_file).map_err(|e| {
        log::error!("Could not create release-time.txt: {}", e);
        format!("Could not create release-time.txt: {}", e)
    })?;
    file.write_all(time.as_bytes()).map_err(|e| {
        log::error!("Failed to write release-time.txt: {}", e);
        format!("Failed to write release-time.txt: {}", e)
    })?;
    log::info!("yt-dlp download completed: {:?}", yt_dlp_file);
    Ok(format!("yt-dlp downloaded successfully: {:?}", yt_dlp_file))
}
