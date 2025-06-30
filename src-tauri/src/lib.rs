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

