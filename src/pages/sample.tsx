import React, { useState, useEffect, useCallback } from 'react';
import {
    CssBaseline,
    Container,
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
    Grid,
    Menu,
    MenuItem,
    InputAdornment,
    IconButton,
    Link,
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

// --- Types ---
interface ToolStatus {
    version: string;
    fullOutput: string;
    error: string | null;
    loading: boolean;
}

// --- API Mock ---
const mockInvoke = async <T,>(command: string, args?: any): Promise<T> => {
    console.log(`[Mock Invoke] command: ${command}, args:`, args);
    await new Promise(res => setTimeout(res, 500 + Math.random() * 500));
    if (command === 'get_ytdlp_version') return '2025.06.12.233004' as T;
    if (command === 'get_ffmpeg_version') return `ffmpeg version N-117705-g7b20985d8d-20241105...` as T;
    if (command === 'select_output_directory') return 'C:\\Users\\YourUser\\Downloads\\MockFolder' as T;
    if (command === 'select_ffmpeg_path') return 'C:\\ffmpeg\\bin\\ffmpeg.exe' as T;
    return undefined as T;
};
const invoke = window.__TAURI__?.tauri?.invoke || mockInvoke;

// --- Command Presets ---
const YTDLP_COMMANDS: string[] = [
    // Format Selection
    "-f 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'",
    "-f 'bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]/best'",
    "-f 'bestvideo+bestaudio'",
    "-f best",
    "-f 'bv*+ba/b' --remux-video mp4/mkv --convert-thumbnails png --embed-thumbnail --embed-metadata --paths temp:tmp -o '%(title).200B [%(id)s].%(ext)s'",
    // Audio Extraction
    "--extract-audio",
    "--audio-format mp3",
    "--audio-format m4a",
    "--audio-format flac",
    "--audio-format wav",
    "--audio-quality 0", // 0 (best) to 9 (worst)
    // Remuxing
    "--remux-video mkv",
    "--remux-video mp4",
    // Output & Metadata
    "-o '%(title)s.%(ext)s'",
    "-o '%(playlist_index)s - %(title)s.%(ext)s'",
    "-o '%(uploader)s/%(title)s.%(ext)s'",
    "--embed-metadata",
    "--embed-thumbnail",
    "--write-thumbnail",
    // Subtitles
    "--embed-subs",
    "--write-subs",
    "--all-subs",
    "--sub-lang en,ja",
    // Playlist
    "--yes-playlist",
    "--no-playlist",
    "--playlist-items 1-5",
    // Download Control
    "--limit-rate 5M",
    "--retries 10",
    "--fragment-retries 10",
    "--no-overwrites",
    "--continue",
    "--ignore-errors",
];

const FFMPEG_COMMANDS: string[] = [
    // Codec & Quality
    "-c:v copy",
    "-c:a copy",
    "-c:v libx264",
    "-c:v libx265",
    "-crf 18",
    "-crf 23",
    "-crf 28",
    "-preset medium",
    "-preset slow",
    "-preset veryfast",
    "-c:a aac",
    "-b:a 192k",
    "-b:a 128k",
    // Filters
    "-vf scale=1920:-1",
    "-vf scale=1280:-1",
    "-vf fps=30",
    "-vf crop=W:H:X:Y",
    // Stream Control
    "-an", // No Audio
    "-vn", // No Video
    "-ss 00:00:10", // Seek to 10s
    "-t 00:00:30", // Duration of 30s
    // Other
    "-movflags +faststart",
    "-y", // Overwrite output files without asking
];

// =================================================================
// Main App Component
// =================================================================
const App: React.FC = () => {
    // --- ステート管理 ---
    const [activeStep, setActiveStep] = useState(0);
    const [view, setView] = useState<'stepper' | 'log'>('stepper');

    // States
    const [urls, setUrls] = useState('');
    const [ytdlpOption, setYtdlpOption] = useState<'auto' | 'custom'>('auto');
    const [ytdlpCustom, setYtdlpCustom] = useState("");
    const [ffmpegOption, setFfmpegOption] = useState<'none' | 'custom'>('none');
    const [ffmpegCustom, setFfmpegCustom] = useState("");
    const [outputPath, setOutputPath] = useState<string>('');
    const [ytdlpStatus, setYtdlpStatus] = useState<ToolStatus>({ version: '', fullOutput: '', error: null, loading: true });
    const [ffmpegStatus, setFfmpegStatus] = useState<ToolStatus>({ version: '', fullOutput: '', error: null, loading: true });
    const [log, setLog] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Menu Anchors
    const [ytdlpMenuAnchor, setYtdlpMenuAnchor] = useState<null | HTMLElement>(null);
    const [ffmpegMenuAnchor, setFfmpegMenuAnchor] = useState<null | HTMLElement>(null);

    const steps = ['Enter URLs', 'yt-dlp Settings', 'FFmpeg Settings', 'Start'];

    const handleNext = () => setActiveStep((prev) => prev + 1);
    const handleBack = () => setActiveStep((prev) => prev - 1);
    const handleReset = () => {
        setActiveStep(0);
        setView('stepper');
        setLog([]);
    };

    const checkTools = useCallback(async () => {
        setYtdlpStatus(s => ({ ...s, loading: true }));
        setFfmpegStatus(s => ({ ...s, loading: true }));
        try {
            const version = await invoke<string>('get_ytdlp_version');
            setYtdlpStatus({ version: version.trim(), fullOutput: version, error: null, loading: false });
        } catch (err) {
            setYtdlpStatus({ version: '', fullOutput: '', error: String(err), loading: false });
        }
        try {
            const versionInfo = await invoke<string>('get_ffmpeg_version');
            const firstLine = versionInfo.split('\n')[0];
            const simpleVersion = firstLine.split(' ')[2] || 'unknown';
            setFfmpegStatus({ version: simpleVersion, fullOutput: versionInfo, error: null, loading: false });
        } catch (err) {
            setFfmpegStatus({ version: '', fullOutput: '', error: String(err), loading: false });
        }
    }, []);

    const handleSelectOutputDir = async () => {
        try {
            const selectedPath = await invoke<string>('select_output_directory');
            if (selectedPath) setOutputPath(selectedPath);
        } catch (error) {
            console.error("Failed to select output directory:", error);
        }
    };

    const handleSelectFfmpegPath = async () => {
        try {
            const selectedPath = await invoke<string>('select_ffmpeg_path');
            if (selectedPath) {
                alert(`FFmpeg path set to ${selectedPath}. Re-checking tools.`);
                checkTools();
            }
        } catch (error) {
            console.error("Failed to set FFmpeg path:", error);
        }
    };

    const startDownloadProcess = async () => {
        setIsModalOpen(false);
        setView('log');
        setIsProcessing(true);
        setLog(prev => [...prev, '[INFO] Starting download process...']);
        const addLog = (message: string) => setLog(prev => [...prev, message]);

        addLog(`[yt-dlp] URL: ${urls.split('\n')[0]}`);
        await new Promise(r => setTimeout(r, 1000));
        addLog('[yt-dlp] [download] destination: video.mp4');
        await new Promise(r => setTimeout(r, 1500));
        addLog('[yt-dlp] [download] 100% of 123.45MiB in 00:55');

        if (ffmpegOption === 'custom') {
            addLog('[FFmpeg] Starting re-encoding...');
            await new Promise(r => setTimeout(r, 2000));
            addLog('[FFmpeg] Re-encoding complete.');
        }
        addLog('\n[SUCCESS] All processes have been completed.');
        setIsProcessing(false);
    };

    useEffect(() => {
        if (activeStep === 3) checkTools();
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
                            placeholder="https://www.youtube.com/watch?v=..."
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
                                    <Link href="https://github.com/yt-dlp/yt-dlp" target="_blank" rel="noopener noreferrer" underline="hover" display="flex" alignItems="center">
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
                return (
                    <Box p={2}>
                        <Typography variant="h4" gutterBottom align="center" fontWeight="bold" color="primary">FFmpeg Re-encoding Settings</Typography>
                        <Typography variant="body2" color="text.secondary" paragraph align="center">Choose whether to re-encode the video after downloading.</Typography>
                        <Box display="flex" justifyContent="center">
                            <FormControl component="fieldset">
                                <RadioGroup row value={ffmpegOption} onChange={(e) => setFfmpegOption(e.target.value as 'none' | 'custom')}>
                                    <FormControlLabel value="none" control={<Radio />} label="Do not re-encode" />
                                    <FormControlLabel value="custom" control={<Radio />} label="Re-encode" />
                                </RadioGroup>
                            </FormControl>
                        </Box>
                        {ffmpegOption === 'custom' && (
                            <>
                                <Box display="flex" justifyContent="center" mb={1}>
                                    <Link href="https://ffmpeg.org/ffmpeg.html" target="_blank" rel="noopener noreferrer" underline="hover" display="flex" alignItems="center">
                                        <OpenInNewIcon fontSize="small" sx={{ mr: 0.5 }} />
                                        Official Documentation
                                    </Link>
                                </Box>
                                <TextField
                                    label="FFmpeg Custom Options"
                                    multiline
                                    rows={4}
                                    fullWidth
                                    margin="normal"
                                    value={ffmpegCustom}
                                    onChange={(e) => setFfmpegCustom(e.target.value)}
                                    sx={{ fontFamily: 'monospace' }}
                                    InputProps={{
                                        endAdornment: (
                                            <InputAdornment position="end" sx={{ alignSelf: 'flex-start' }}>
                                                <Tooltip title="Add Command">
                                                    <IconButton onClick={(e) => setFfmpegMenuAnchor(e.currentTarget)} aria-label="add command" color="primary">
                                                        <AddCircleOutlineIcon />
                                                    </IconButton>
                                                </Tooltip>
                                            </InputAdornment>
                                        )
                                    }}
                                />
                                <Menu anchorEl={ffmpegMenuAnchor} open={Boolean(ffmpegMenuAnchor)} onClose={() => setFfmpegMenuAnchor(null)}>
                                    {FFMPEG_COMMANDS.map((command) => (
                                        <MenuItem key={command} onClick={() => {
                                            setFfmpegCustom((prev) => (prev ? `${prev.trim()} ${command}` : command));
                                            setFfmpegMenuAnchor(null);
                                        }}>
                                            <Typography sx={{ fontFamily: 'monospace' }}>{command}</Typography>
                                        </MenuItem>
                                    ))}
                                </Menu>
                            </>
                        )}
                    </Box>
                );
            case 3:
                const renderAlertForStatus = (label: string, status: ToolStatus) => {
                    let severity: "info" | "error" | "success" = "info";
                    let title = `${label}: Checking...`;
                    let description: React.ReactNode = "Checking tool status.";

                    if (!status.loading) {
                        if (status.error) {
                            severity = "error";
                            title = `${label}: Not available`;
                            description = <Tooltip title={status.error}><span>An error occurred.</span></Tooltip>;
                        } else {
                            severity = "success";
                            title = `${label}: Available`;
                            description = <Tooltip title={status.fullOutput}><span>Version: {status.version}</span></Tooltip>;
                        }
                    }
                    return <Alert severity={severity} variant="filled" sx={{ width: '100%' }}><AlertTitle>{title}</AlertTitle>{description}</Alert>;
                };

                return (
                    <Box p={2}>
                        <Typography variant="h4" gutterBottom align="center" fontWeight="bold" color="primary">Pre-run Check</Typography>
                        <Typography variant="body2" color="text.secondary" paragraph align="center">Confirm the settings and start the download.</Typography>
                        <Paper variant="outlined" sx={{ p: 2, my: 1 }}>
                            <Typography variant="h6" gutterBottom>Tool Status</Typography>
                            <Box display="flex" alignItems="stretch" gap={2}>
                                <Box sx={{ flexGrow: 1 }}>
                                    <Stack spacing={2}>
                                        {renderAlertForStatus("yt-dlp", ytdlpStatus)}
                                        {renderAlertForStatus("FFmpeg & ffprobe", ffmpegStatus)}
                                    </Stack>
                                </Box>
                                <Box>
                                    <Stack spacing={2} sx={{ height: '100%', justifyContent: 'space-around' }}>
                                        <Button variant="contained" size="small" onClick={checkTools} startIcon={ytdlpStatus.loading || ffmpegStatus.loading ? <CircularProgress size={20} color="inherit" /> : <ReplayIcon />} disabled={ytdlpStatus.loading || ffmpegStatus.loading}>Check Again</Button>
                                        <Button variant="contained" size="small" onClick={handleSelectFfmpegPath} startIcon={<FolderOpenIcon />} disabled={ytdlpStatus.loading || ffmpegStatus.loading}>Set Path</Button>
                                    </Stack>
                                </Box>
                            </Box>
                        </Paper>
                        <Paper variant="outlined" sx={{ p: 2, my: 1 }}>
                            <Typography variant="h6" gutterBottom>Output Folder</Typography>
                            <Box display="flex" justifyContent="space-between" alignItems="center">
                                <Typography variant="body2" noWrap title={outputPath}>{outputPath || 'Not specified'}</Typography>
                                <Button variant="contained" onClick={handleSelectOutputDir} startIcon={<FolderOpenIcon />}>Select</Button>
                            </Box>
                        </Paper>
                    </Box>
                );
            default: return 'Unknown step';
        }
    };

    return (
        <>
            <CssBaseline />
            <Container>
                <Paper sx={{ height: '85vh', display: 'flex', flexDirection: 'column' }}>
                    {view === 'stepper' ? (
                        <>
                            <Box sx={{ borderBottom: 1, borderColor: 'divider', p: 2 }}>
                                <Stepper activeStep={activeStep}>
                                    {steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
                                </Stepper>
                            </Box>
                            <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
                                {getStepContent(activeStep)}
                            </Box>
                            <Box sx={{ borderTop: 1, borderColor: 'divider', p: 2, display: 'flex', justifyContent: 'space-between' }}>
                                <Button disabled={activeStep === 0} onClick={handleBack} startIcon={<NavigateBeforeIcon />}>Back</Button>
                                {activeStep === steps.length - 1 ? (
                                    <Button variant="contained" color="success" onClick={() => setIsModalOpen(true)} startIcon={<DownloadIcon />}>Start Download</Button>
                                ) : (
                                    <Button variant="contained" onClick={handleNext} endIcon={<NavigateNextIcon />}>Next</Button>
                                )}
                            </Box>
                        </>
                    ) : (
                        <LogView log={log} isProcessing={isProcessing} onReset={handleReset} />
                    )}
                </Paper>
            </Container>
            <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)}>
                <Box sx={(theme) => ({ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 400, bgcolor: 'background.paper', border: `2px solid ${theme.palette.divider}`, boxShadow: 24, p: 4, })}>
                    <Typography variant="h6" component="h2">Confirmation</Typography>
                    <Typography sx={{ mt: 2 }}>Start the download?<br />Are you sure?</Typography>
                    <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                        <Button onClick={() => setIsModalOpen(false)} startIcon={<CancelIcon />}>Cancel</Button>
                        <Button variant="contained" color="error" onClick={startDownloadProcess} startIcon={<PlayArrowIcon />}>Start</Button>
                    </Box>
                </Box>
            </Modal>
        </>
    );
};

export default App;
