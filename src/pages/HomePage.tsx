import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { listen } from '@tauri-apps/api/event';
import {
    Box,
    Paper,
    Stepper,
    Step,
    StepLabel,
    Button,
    Typography,
    TextField,
    FormControl,
    RadioGroup,
    FormControlLabel,
    Radio,
    Modal,
    CircularProgress,
    Tooltip,
    Alert,
    AlertTitle,
    Stack,
    Menu,
    MenuItem,
    InputAdornment,
    IconButton,
    Link,
    Checkbox,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
} from '@mui/material';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import DownloadIcon from '@mui/icons-material/Download';
import ReplayIcon from '@mui/icons-material/Replay';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CancelIcon from '@mui/icons-material/Cancel';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningIcon from '@mui/icons-material/Warning';
import ErrorIcon from '@mui/icons-material/Error';
import { useTheme } from '@mui/material/styles';

// --- Types ---
interface ToolStatus {
    version: string;
    fullOutput: string;
    error: string | null;
    loading: boolean;
}

interface LogViewProps {
    log: string[];
    isProcessing: boolean;
    onReset: () => void;
}

// --- Command Presets ---
const YTDLP_COMMANDS: string[] = [
    // Format Selection
    `-f "bv*+ba/b" -o "%(title).200B [%(id)s].%(ext)s" --no-continue --sleep-requests 2 --sleep-interval 3 --max-sleep-interval 8 --remux-video mp4/mkv --embed-metadata --embed-thumbnail --convert-thumbnails png`,
    `-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"`,
    `-f "bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]/best"`,
    `-f "bestvideo+bestaudio"`,
    `-f "best"`,
    // Audio Extraction
    `--extract-audio`,
    `--audio-format mp3`,
    `--audio-format m4a`,
    `--audio-format flac`,
    `--audio-quality 0`,
    // Remuxing & Post-processing (FFmpeg)
    `--remux-video mkv`,
    `--remux-video mp4`,
    `-P "ffmpeg:-c:v libx264 -crf 23"`,
    `-P "ffmpeg:-c:v copy -c:a aac -b:a 192k"`,
    `-P "ffmpeg:-vf scale=1280:-1"`,
    // Output & Metadata
    `-o "%(title)s.%(ext)s"`,
    `-o "%(playlist_index)s - %(title)s.%(ext)s"`,
    `--embed-metadata`,
    `--embed-thumbnail`,
    // Subtitles
    `--embed-subs`,
    `--write-subs`,
    `--all-subs`,
    // Download Control
    `--limit-rate 5M`,
    `--no-overwrites`,
    `--continue`,
];

// =================================================================
// Main App Component
// =================================================================
const HomePage: React.FC = () => {
    // --- ステート管理 ---
    const [activeStep, setActiveStep] = useState(0);
    const [view, setView] = useState<'stepper' | 'log'>('stepper');

    // States
    const [urls, setUrls] = useState('');
    const [ytdlpOption, setYtdlpOption] = useState<'auto' | 'custom'>('auto');
    const [ytdlpCustom, setYtdlpCustom] = useState("");
    const [ffmpegPath, setFfmpegPath] = useState<string>('');
    const [outputPath, setOutputPath] = useState<string>('');
    const [ytdlpStatus, setYtdlpStatus] = useState<ToolStatus>({ version: '', fullOutput: '', error: null, loading: true });
    const [ffmpegStatus, setFfmpegStatus] = useState<ToolStatus>({ version: '', fullOutput: '', error: null, loading: true });
    const [log, setLog] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [confirmationChecked, setConfirmationChecked] = useState(false);

    // Menu Anchors
    const [ytdlpMenuAnchor, setYtdlpMenuAnchor] = useState<null | HTMLElement>(null);

    const steps = ["Enter URLs", "yt-dlp Settings", "Start"];

    const handleNext = () => {
        setActiveStep((prev) => prev + 1);
    };

    const handleBack = () => {
        setActiveStep((prev) => prev - 1);
    };

    const handleReset = () => {
        setActiveStep(0);
        setView("stepper");
        setLog([]);
    };

    const checkTools = useCallback(async (customFfmpegPath?: string) => {
        const pathToUse = customFfmpegPath || ffmpegPath;

        setYtdlpStatus(s => ({ ...s, loading: true }));
        setFfmpegStatus(s => ({ ...s, loading: true }));

        // yt-dlpのダウンロード/バージョン確認
        try {
            const result = await invoke<string>('download_latest_yt_dlp');
            setYtdlpStatus({
                version: result,
                fullOutput: result,
                error: null,
                loading: false
            });
        } catch (err) {
            setYtdlpStatus({
                version: '',
                fullOutput: '',
                error: String(err),
                loading: false
            });
        }

        // FFmpegのバージョン確認
        try {
            const versionInfo = await invoke<string>('check_ffmpeg_ffprobe_version', {
                dir: pathToUse // 引数優先、なければ状態変数を使用
            });
            const simpleVersion = versionInfo.split('\n')[1];
            setFfmpegStatus({
                version: simpleVersion,
                fullOutput: versionInfo,
                error: null,
                loading: false
            });
        } catch (err) {
            setFfmpegStatus({
                version: '',
                fullOutput: '',
                error: String(err),
                loading: false
            });
        }
    }, [ffmpegPath]);

    const handleSelectOutputDir = async () => {
        try {
            const selectedPath = await open({
                directory: true,
                multiple: false,
                title: 'Select Output Directory'
            });

            if (selectedPath && typeof selectedPath === 'string') {
                setOutputPath(selectedPath);
            }
        } catch (error) {
            console.error("Failed to select output directory:", error);
        }
    };

    const handleSelectFfmpegPath = async () => {
        try {
            const selectedPath = await open({
                directory: true,
                multiple: false,
                title: 'Select FFmpeg Directory'
            });

            if (selectedPath && typeof selectedPath === 'string') {
                setFfmpegPath(selectedPath);
                // 選択されたパスを直接checkToolsに渡す（状態更新を待たない）
                checkTools(selectedPath);
            }
        } catch (error) {
            console.error("Failed to select FFmpeg path:", error);
        }
    };

    // ログの最大行数を制限
    const MAX_LOG_LINES = 1000; // 最大1000行に制限

    // ログを制限付きで追加するヘルパー関数
    const addLogWithLimit = useCallback((newLog: string) => {
        setLog(prev => {
            const updated = [...prev, newLog];
            // 制限を超えた場合、古い行を削除
            if (updated.length > MAX_LOG_LINES) {
                return updated.slice(updated.length - MAX_LOG_LINES);
            }
            return updated;
        });
    }, []);

    // 上書き対応のログ更新関数
    const updateLogWithLimit = useCallback((newLog: string, overwrite: boolean) => {
        setLog(prev => {
            let updated;
            if (overwrite && prev.length > 0) {
                // 上書きの場合は最後の行を置き換え
                updated = [...prev.slice(0, -1), newLog];
            } else {
                // 新しい行として追加
                updated = [...prev, newLog];
            }

            // 制限を超えた場合、古い行を削除
            if (updated.length > MAX_LOG_LINES) {
                return updated.slice(updated.length - MAX_LOG_LINES);
            }
            return updated;
        });
    }, []);

    // イベントリスナーの設定
    useEffect(() => {
        const unlistenPromises = [
            listen('yt-dlp-stdout', (event) => {
                const data = event.payload as { content: string; overwrite: boolean };
                updateLogWithLimit(data.content, data.overwrite);
            }),

            listen('yt-dlp-stderr', (event) => {
                const data = event.payload as { content: string; overwrite: boolean };
                const errorLine = `[ERROR] ${data.content}`;
                updateLogWithLimit(errorLine, data.overwrite);
            }),

            listen('yt-dlp-started', () => {
                addLogWithLimit('[INFO] yt-dlp process started...');
            }),

            listen('yt-dlp-completed', (event) => {
                const status = event.payload as string;
                if (status === 'success') {
                    addLogWithLimit('[SUCCESS] yt-dlp process completed successfully.');
                } else {
                    addLogWithLimit('[ERROR] yt-dlp process failed.');
                }
            }),

            listen('yt-dlp-error', (event) => {
                const error = event.payload as string;
                addLogWithLimit(`[ERROR] ${error}`);
            })
        ];

        return () => {
            Promise.all(unlistenPromises).then(unlistenFunctions => {
                unlistenFunctions.forEach(unlisten => unlisten());
            });
        };
    }, [updateLogWithLimit, addLogWithLimit]);

    const startDownloadProcess = async () => {
        setIsModalOpen(false);
        setView('log');
        setIsProcessing(true);
        setLog([]); // ログをクリア

        try {
            addLogWithLimit('[INFO] Starting download process...');

            // 1. URLsをファイルに書き込み
            addLogWithLimit('[INFO] Writing URLs to file...');
            const urlsFilePath = await invoke<string>('write_urls_to_file', { urls });
            addLogWithLimit(`[INFO] URLs file created: ${urlsFilePath}`);

            // 2. コマンドライン構築（文字列として）
            let commandParts = [];

            // URLsファイルを指定
            commandParts.push('--batch-file');
            commandParts.push(`"${urlsFilePath}"`);

            // 一時ディレクトリを指定（中間ファイル用）
            commandParts.push('--paths');
            commandParts.push('"temp:./tmp"');

            // 出力ディレクトリを指定
            if (outputPath) {
                commandParts.push('--paths');
                commandParts.push(`"home:${outputPath}"`);
                addLogWithLimit(`[INFO] Output directory: ${outputPath}`);
            }

            // FFmpegディレクトリを指定
            if (ffmpegPath) {
                commandParts.push('--ffmpeg-location');
                commandParts.push(`"${ffmpegPath}"`);
                addLogWithLimit(`[INFO] FFmpeg directory: ${ffmpegPath}`);
            }

            // カスタムオプションを追加
            if (ytdlpOption === 'custom' && ytdlpCustom.trim()) {
                commandParts.push(ytdlpCustom.trim());
                addLogWithLimit(`[INFO] Custom options: ${ytdlpCustom}`);
            }

            const fullCommand = commandParts.join(' ');
            addLogWithLimit(`[INFO] Executing command: yt-dlp ${fullCommand}`);

            // 3. yt-dlpを実行（リアルタイム出力はイベントリスナーで処理）
            await invoke<string>('run_yt_dlp', {
                commandLine: fullCommand
            });

            addLogWithLimit('[SUCCESS] All processes have been completed.');

        } catch (error) {
            console.error("Error during download process:", error);
            addLogWithLimit(`[ERROR] Process failed: ${error}`);
        } finally {
            setIsProcessing(false);
        }
    };

    useEffect(() => {
        if (activeStep === 2) checkTools();
    }, [activeStep, checkTools]);

    const getStepContent = (step: number) => {
        switch (step) {
            case 0:
                return (
                    <Box p={2}>
                        <Typography variant="h4" gutterBottom align="center" fontWeight="bold" color="primary">Enter URLs</Typography>
                        <Typography variant="body2" color="text.secondary" paragraph align="center">Enter the URLs of the videos you want to download, one per line.</Typography>
                        <TextField
                            multiline
                            rows={10}
                            fullWidth
                            value={urls}
                            onChange={(e) => setUrls(e.target.value)}
                            placeholder={"https://example.com/example1\nhttps://example.com/example2\nhttps://example.com/example3"}
                        />
                    </Box>
                );
            case 1:
                return (
                    <Box p={2}>
                        <Typography variant="h4" gutterBottom align="center" fontWeight="bold" color="primary">yt-dlp Download Settings</Typography>
                        <Typography variant="body2" color="text.secondary" paragraph align="center">Set the download format, quality, and other options.</Typography>
                        <Box display="flex" justifyContent="center">
                            <FormControl component="fieldset">
                                <RadioGroup row value={ytdlpOption} onChange={(e) => setYtdlpOption(e.target.value as 'auto' | 'custom')}>
                                    <FormControlLabel value="auto" control={<Radio />} label="Automatic" />
                                    <FormControlLabel value="custom" control={<Radio />} label="Custom" />
                                </RadioGroup>
                            </FormControl>
                        </Box>
                        {ytdlpOption === 'custom' && (
                            <>
                                <Box display="flex" justifyContent="center" mb={1}>
                                    <Link href="https://github.com/yt-dlp/yt-dlp#usage-and-options" target="_blank" rel="noopener noreferrer" underline="hover" display="flex" alignItems="center">
                                        <OpenInNewIcon fontSize="small" sx={{ mr: 0.5 }} />
                                        Official Documentation
                                    </Link>
                                </Box>
                                <TextField
                                    label="yt-dlp Custom Options"
                                    multiline
                                    rows={4}
                                    fullWidth
                                    margin="normal"
                                    value={ytdlpCustom}
                                    onChange={(e) => setYtdlpCustom(e.target.value)}
                                    sx={{ fontFamily: 'monospace' }}
                                    InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end" sx={{ alignSelf: 'flex-start' }}>
                                                <Tooltip title="Add Command">
                                                    <IconButton onClick={(e) => setYtdlpMenuAnchor(e.currentTarget)} aria-label="add command" color="primary">
                                                        <AddCircleOutlineIcon />
                                                    </IconButton>
                                                </Tooltip>
                                            </InputAdornment>
                                        )
                                    }}
                                />
                                <Menu anchorEl={ytdlpMenuAnchor} open={Boolean(ytdlpMenuAnchor)} onClose={() => setYtdlpMenuAnchor(null)}>
                                    {YTDLP_COMMANDS.map((command) => (
                                        <MenuItem key={command} onClick={() => {
                                            setYtdlpCustom((prev) => (prev ? `${prev.trim()} ${command}` : command));
                                            setYtdlpMenuAnchor(null);
                                        }}>
                                            <Typography sx={{ fontFamily: 'monospace' }}>{command}</Typography>
                                        </MenuItem>
                                    ))}
                                </Menu>
                            </>
                        )}
                    </Box>
                );
            case 2:
                const renderAlertForStatus = (label: string, status: ToolStatus) => {
                    let severity: "info" | "error" | "success" = "info";
                    let title = `${label}: Checking...`;
                    let description: React.ReactNode = "Checking tool status.";

                    if (!status.loading) {
                        if (status.error) {
                            severity = "error";
                            title = `${label}: Not available`;
                            description = <span>An error occurred.</span>;
                        } else {
                            severity = "success";
                            title = `${label}: Available`;
                            description = <span>{status.version}</span>;
                        }
                    }
                    return <Alert severity={severity} variant="filled" ><AlertTitle>{title}</AlertTitle>{description}</Alert>;
                };

                return (
                    <Box p={2}>
                        <Typography variant="h4" gutterBottom align="center" fontWeight="bold" color="primary">Final Setup & Check</Typography>
                        <Typography variant="body2" color="text.secondary" paragraph align="center">Check tool status, set the output folder.</Typography>
                        <Paper variant="outlined" sx={{ p: 2, my: 1 }}>
                            <Typography variant="h6" gutterBottom>Tool Status</Typography>
                            <Box display="flex" alignItems="stretch" gap={2}>
                                <Box sx={{ flexGrow: 1 }}>
                                    <Stack spacing={2}>
                                        {renderAlertForStatus("yt-dlp ", ytdlpStatus)}
                                        {renderAlertForStatus("FFmpeg FFprobe ", ffmpegStatus)}
                                    </Stack>
                                </Box>
                                <Box>
                                    <Stack spacing={2} sx={{ height: '100%', justifyContent: 'space-around' }}>
                                        <Tooltip title="Check the status of yt-dlp again">
                                            <span>
                                                <Button
                                                    variant="contained"
                                                    size="small"
                                                    onClick={() => checkTools()}
                                                    startIcon={ytdlpStatus.loading || ffmpegStatus.loading ? <CircularProgress size={20} color="inherit" /> : <ReplayIcon />}
                                                    disabled={ytdlpStatus.loading || ffmpegStatus.loading}
                                                    sx={{ width: '100%' }}
                                                >
                                                    Check yt-dlp
                                                </Button>
                                            </span>
                                        </Tooltip>
                                        <Tooltip title="Set the directory for FFmpeg/FFprobe">
                                            <span>
                                                <Button
                                                    variant="contained"
                                                    size="small"
                                                    onClick={handleSelectFfmpegPath}
                                                    startIcon={<FolderOpenIcon />}
                                                    disabled={ytdlpStatus.loading || ffmpegStatus.loading}
                                                    sx={{ width: '100%' }}
                                                >
                                                    Set FFmpeg
                                                </Button>
                                            </span>
                                        </Tooltip>
                                    </Stack>
                                </Box>
                            </Box>
                        </Paper>
                        <Paper variant="outlined" sx={{ p: 2, my: 1 }}>
                            <Typography variant="h6" gutterBottom>Output Folder</Typography>
                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2" noWrap title={outputPath}>{outputPath || 'Not specified'}</Typography>
                                <Tooltip title="Select the output folder for downloaded files">
                                    <span>
                                        <Button
                                            variant="contained"
                                            onClick={handleSelectOutputDir}
                                            startIcon={<FolderOpenIcon />}
                                        >
                                            Select
                                        </Button>
                                    </span>
                                </Tooltip>
                            </Box>
                        </Paper>
                    </Box>
                );
            default: return "Unknown step";
        }
    };

    // 危険な状態をチェックする関数
    const checkRiskyConditions = useCallback(() => {
        const risks: string[] = [];

        if (ytdlpStatus.error) {
            risks.push('yt-dlp tool is not available or has errors');
        }

        if (ffmpegStatus.error) {
            risks.push('FFmpeg/FFprobe tools are not available or have errors');
        }

        if (!outputPath.trim()) {
            risks.push('Output directory is not specified');
        }

        if (!urls.trim()) {
            risks.push('No download URLs provided');
        }

        return risks;
    }, [ytdlpStatus.error, ffmpegStatus.error, outputPath, urls]);

    const handleStartDownloadClick = () => {
        setConfirmationChecked(false); // リセット
        setIsModalOpen(true);
    };

    return (
        <Box>
            <Paper sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
                {view === "stepper" ? (
                    <>
                        <Box sx={{ borderBottom: 1, borderColor: "divider", p: 2 }}>
                            <Stepper activeStep={activeStep}>
                                {steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
                            </Stepper>
                        </Box>
                        <Box sx={{ flexGrow: 1, overflowY: "auto" }}>
                            {getStepContent(activeStep)}
                        </Box>
                        <Box sx={{ borderTop: 1, borderColor: "divider", p: 2, display: "flex", justifyContent: "space-between" }}>
                            <Button disabled={activeStep === 0} onClick={handleBack} startIcon={<NavigateBeforeIcon />}>Back</Button>
                            {activeStep === steps.length - 1 ? (
                                <Button variant="contained" color="success" onClick={handleStartDownloadClick} startIcon={<DownloadIcon />}>Start Download</Button>
                            ) : (
                                <Button variant="contained" onClick={handleNext} endIcon={<NavigateNextIcon />}>Next</Button>
                            )}
                        </Box>
                    </>
                ) : (
                    <LogView log={log} isProcessing={isProcessing} onReset={handleReset} />
                )}
            </Paper>

            <ConfirmationModal
                open={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onConfirm={startDownloadProcess}
                risks={checkRiskyConditions()}
                checked={confirmationChecked}
                onCheckedChange={setConfirmationChecked}
            />
        </Box>
    );
};

// 新しい確認モーダルコンポーネント
interface ConfirmationModalProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    risks: string[];
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    open,
    onClose,
    onConfirm,
    risks,
    checked,
    onCheckedChange
}) => {
    const hasRisks = risks.length > 0;

    return (
        <Modal open={open} onClose={onClose}>
            <Box sx={(theme) => ({
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: hasRisks ? 500 : 400,
                bgcolor: 'background.paper',
                border: `2px solid ${hasRisks ? theme.palette.warning.main : theme.palette.divider}`,
                boxShadow: 24,
                p: 4,
                maxHeight: '80vh',
                overflowY: 'auto'
            })}>
                {hasRisks ? (
                    <>
                        {/* 警告ヘッダー */}
                        <Box display="flex" alignItems="center" mb={2}>
                            <WarningIcon color="warning" sx={{ mr: 1, fontSize: 28 }} />
                            <Typography variant="h6" component="h2" color="warning.main">
                                Warning: Potential Issues Detected
                            </Typography>
                        </Box>

                        {/* 問題リスト */}
                        <Alert severity="warning" sx={{ mb: 3 }}>
                            <AlertTitle>The following issues may cause download failures:</AlertTitle>
                            <List dense sx={{ mt: 1 }}>
                                {risks.map((risk, index) => (
                                    <ListItem key={index} sx={{ py: 0.5 }}>
                                        <ListItemIcon sx={{ minWidth: 32 }}>
                                            <ErrorIcon color="error" fontSize="small" />
                                        </ListItemIcon>
                                        <ListItemText primary={risk} />
                                    </ListItem>
                                ))}
                            </List>
                        </Alert>

                        {/* 推奨アクション */}
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                            <strong>Recommendation:</strong> Please resolve these issues before proceeding.
                            If you continue anyway, the download process may fail or produce unexpected results.
                        </Typography>

                        {/* 確認チェックボックス */}
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={checked}
                                    onChange={(e) => onCheckedChange(e.target.checked)}
                                    color="warning"
                                />
                            }
                            label={
                                <Typography variant="body2">
                                    I understand the risks and want to proceed anyway
                                </Typography>
                            }
                            sx={{ mb: 3 }}
                        />

                        {/* アクションボタン */}
                        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                            <Button onClick={onClose} startIcon={<CancelIcon />}>
                                Cancel & Fix Issues
                            </Button>
                            <Button
                                variant="contained"
                                color="warning"
                                onClick={onConfirm}
                                startIcon={<PlayArrowIcon />}
                                disabled={!checked}
                                sx={{
                                    '&:disabled': {
                                        backgroundColor: 'action.disabled',
                                        color: 'action.disabled'
                                    }
                                }}
                            >
                                Force Start
                            </Button>
                        </Box>
                    </>
                ) : (
                    <>
                        {/* 通常の確認 */}
                        <Typography variant="h6" component="h2">Confirmation</Typography>
                        <Typography sx={{ mt: 2 }}>
                            All checks passed. Start the download?<br />
                            Are you sure?
                        </Typography>
                        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                            <Button onClick={onClose} startIcon={<CancelIcon />}>Cancel</Button>
                            <Button
                                variant="contained"
                                color="success"
                                onClick={onConfirm}
                                startIcon={<PlayArrowIcon />}
                            >
                                Start Download
                            </Button>
                        </Box>
                    </>
                )}
            </Box>
        </Modal>
    );
};

const LogView: React.FC<LogViewProps> = ({ log, isProcessing, onReset }) => {
    const theme = useTheme();
    const getColor = (line: string) => {
        if (line.startsWith('[SUCCESS]')) return theme.palette.success.main;
        if (line.startsWith('[ERROR]')) return theme.palette.error.main;
        if (line.startsWith('[INFO]')) return theme.palette.info.main;
        return theme.palette.common.white;
    };

    return (
        <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            p: 0
        }}>
            {/* ヘッダー部分 */}
            <Box sx={{ flex: 0.1, display: 'flex', alignItems: 'center', px: 2 }}>
                <Typography variant="h5" gutterBottom>
                    Execution Log
                    <Typography component="span" variant="body2" color="text.secondary">
                        ({log.length} lines)
                    </Typography>
                </Typography>
            </Box>
            {/* ログ表示部分 */}
            <Box sx={{ flex: 0.85, overflowY: 'auto', px: 2, pb: 2 }}>
                <Paper variant="outlined" sx={{
                    height: '100%',
                    overflowY: 'auto',
                    p: 2,
                    color: 'common.white',
                    backgroundColor: 'common.black',
                    fontFamily: 'monospace',
                    boxSizing: 'border-box'
                }}>
                    {log.map((line, index) => (
                        <Typography key={index} sx={{ color: getColor(line), fontFamily: 'monospace' }}>
                            {line}
                        </Typography>
                    ))}
                    {isProcessing && <CircularProgress size={24} sx={{ mt: 1 }} />}
                </Paper>
            </Box>
            {/* ボタン部分 */}
            <Box sx={{ flex: 0.05, display: 'flex', alignItems: 'center', justifyContent: 'center', px: 2, pb: 2 }}>
                <Button
                    variant="contained"
                    color="success"
                    onClick={onReset}
                    disabled={isProcessing}
                    startIcon={<RestartAltIcon />}
                    sx={{ width: '100%', height: '100%' }}
                >
                    Return to Start
                </Button>
            </Box>
        </Box>
    );
};

export default HomePage;
