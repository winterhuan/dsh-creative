"""Shared configuration and media-provider runtime; distributed by sync-video-runtime.py."""
import json
import hashlib
import os
import re
import subprocess
import time
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import socket

def normalize_api_url(raw_url):
    """Normalize a MiMo (OpenAI-compatible) base URL or chat/completions endpoint."""
    url = (raw_url or DEFAULT_MIMO_API_URL).rstrip("/")
    if url.endswith("/chat/completions"):
        return url
    return f"{url}/chat/completions"

def is_mimo_token_plan_key(api_key):
    """Return True for Xiaomi MiMo Token Plan keys, which use token-plan base URLs."""
    return str(api_key or "").strip().startswith("tp-")

def default_mimo_api_url(api_key="", cluster=None):
    """Pick the correct MiMo base URL for pay-as-you-go vs Token Plan keys.

    MiMo uses independent credentials for pay-as-you-go (`sk-*`) and Token Plan
    (`tp-*`). Token Plan keys must be sent to the Token Plan cluster base URL,
    not the pay-as-you-go `api.xiaomimimo.com` endpoint.
    """
    if is_mimo_token_plan_key(api_key):
        cluster_name = (cluster or os.environ.get("MIMO_TOKEN_PLAN_CLUSTER") or DEFAULT_MIMO_TOKEN_PLAN_CLUSTER)
        cluster_name = str(cluster_name).strip().lower()
        return MIMO_TOKEN_PLAN_API_URLS.get(cluster_name, MIMO_TOKEN_PLAN_API_URLS[DEFAULT_MIMO_TOKEN_PLAN_CLUSTER])
    return DEFAULT_MIMO_API_URL

def env_int(name, default, *, minimum=None):
    """Read an integer env var; ignore malformed values instead of crashing import."""
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return default
    if minimum is not None:
        value = max(minimum, value)
    return value

def env_bool(name, default=False):
    """Read common boolean env var forms."""
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "y", "on"}

def env_float(name, default, *, minimum=None):
    """Read a float env var; ignore malformed values instead of crashing import."""
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return default
    if minimum is not None:
        value = max(minimum, value)
    return value

DEFAULT_MIMO_API_URL = "https://api.xiaomimimo.com/v1"
DEFAULT_MIMO_TOKEN_PLAN_CLUSTER = "cn"
MIMO_TOKEN_PLAN_API_URLS = {
    "cn": "https://token-plan-cn.xiaomimimo.com/v1",
    "sgp": "https://token-plan-sgp.xiaomimimo.com/v1",
    "ams": "https://token-plan-ams.xiaomimimo.com/v1",
}
DEFAULT_MIMO_MODEL = "mimo-v2.5"
DEFAULT_MIMO_ASR_MODEL = "mimo-v2.5-asr"
DEFAULT_MIMO_TTS_MODEL = "mimo-v2.5-tts"
_mimo_api_key = os.environ.get("MIMO_API_KEY", "")
_mimo_video_api_key = os.environ.get("MIMO_VIDEO_API_KEY", "") or _mimo_api_key
_mimo_asr_api_key = os.environ.get("MIMO_ASR_API_KEY", "") or _mimo_api_key
_raw_api_url = os.environ.get("MIMO_API_URL") or default_mimo_api_url(_mimo_api_key)
_raw_mimo_video_api_url = (
    os.environ.get("MIMO_VIDEO_API_URL")
    or os.environ.get("MIMO_API_URL")
    or default_mimo_api_url(_mimo_video_api_key)
)
_raw_mimo_asr_api_url = (
    os.environ.get("MIMO_ASR_API_URL")
    or os.environ.get("MIMO_API_URL")
    or default_mimo_api_url(_mimo_asr_api_key)
)
_FILE_FINGERPRINT_MEMO = {}
_ERROR_DATA_URL_RE = re.compile(
    r"data:(?:audio|video|image)/[^;,\s\"'<>]+;base64,[A-Za-z0-9+/=]+",
    re.IGNORECASE,
)
_ERROR_KEY_RE = re.compile(r"\b(?:tp|sk)-[A-Za-z0-9_-]{8,}\b")
DEFAULT_FISH_TTS_API_URL = "https://api.fish.audio/v1/tts"
DEFAULT_FISH_TTS_MODEL = "s2.1-pro-free"
DEFAULT_FISH_TTS_REFERENCE_ID = "5653cea4ac83480aaf2bf45406556185"
_mimo_tts_api_key = os.environ.get("MIMO_TTS_API_KEY", "") or _mimo_api_key
_raw_mimo_tts_api_url = (
    os.environ.get("MIMO_TTS_API_URL")
    or os.environ.get("MIMO_API_URL")
    or default_mimo_api_url(_mimo_tts_api_key)
)
_foreign_source_audio = env_bool("FOREIGN_SOURCE_AUDIO", False)
_foreign_under_narration_volume = 0.05

CONFIG = {
    'api_url': normalize_api_url(_raw_api_url),
    'api_key': _mimo_api_key,
    'api_key_source': "MIMO_API_KEY",
    'mimo_api_url': normalize_api_url(_raw_api_url),
    'mimo_api_key': _mimo_api_key,
    'mimo_video_api_url': normalize_api_url(_raw_mimo_video_api_url),
    'mimo_video_api_key': _mimo_video_api_key,
    'mimo_asr_api_url': normalize_api_url(_raw_mimo_asr_api_url),
    'mimo_asr_api_key': _mimo_asr_api_key,
    'mimo_asr_api_key_source': "MIMO_ASR_API_KEY" if os.environ.get("MIMO_ASR_API_KEY") else "MIMO_API_KEY",
    'mimo_model': os.environ.get("MIMO_MODEL", DEFAULT_MIMO_MODEL),
    'mimo_video_model': os.environ.get("MIMO_VIDEO_MODEL") or os.environ.get("MIMO_MODEL", DEFAULT_MIMO_MODEL),
    'vlm_model': os.environ.get("MIMO_MODEL", DEFAULT_MIMO_MODEL),
    'mimo_asr_model': os.environ.get("MIMO_ASR_MODEL", DEFAULT_MIMO_ASR_MODEL),
    'mimo_asr_language': os.environ.get("MIMO_ASR_LANGUAGE", "auto"),
    'mimo_asr_base64_max_mb': env_float("MIMO_ASR_BASE64_MAX_MB", 10.0, minimum=1.0),
    'asr_segment_seconds': env_float("ASR_SEGMENT_SECONDS", 15.0, minimum=5.0),
    'scene_threshold': 0.1,
    'mimo_media_resolution': os.environ.get("MIMO_MEDIA_RESOLUTION", "default"),
    'mimo_video_overview': env_bool("MIMO_VIDEO_OVERVIEW", False),
    'mimo_video_fps': env_float("MIMO_VIDEO_FPS", 3.0, minimum=0.1),
    'mimo_video_chunk_max_seconds': env_float("MIMO_VIDEO_CHUNK_MAX_SECONDS", 20.0, minimum=1.0),
    'mimo_video_chunk_min_seconds': env_float("MIMO_VIDEO_CHUNK_MIN_SECONDS", 1.0, minimum=0.2),
    'mimo_video_chunk_timeout': env_int("MIMO_VIDEO_CHUNK_TIMEOUT", 180, minimum=1),
    'mimo_video_base64_max_mb': env_float("MIMO_VIDEO_BASE64_MAX_MB", 45.0, minimum=1.0),
    'vlm_seconds_per_frame': env_float("VLM_SECONDS_PER_FRAME", 4.0, minimum=0.5),
    'vlm_max_frames': env_int("VLM_MAX_FRAMES", 16, minimum=3),
    'vlm_max_tokens': env_int("VLM_MAX_TOKENS", 1500, minimum=200),
    'mimo_video_prompt': os.environ.get(
        "MIMO_VIDEO_PROMPT",
        "请用中文分析这个视频分片的主要人物、场景变化、关键动作、情绪走向和剧情冲突，"
        "重点提取适合写短视频解说的故事线索。不要泛泛复述画面，要标出对后续写稿有用的信息。",
    ),
    'mimo_disable_thinking': env_bool("MIMO_DISABLE_THINKING", True),
    'fps': 0,
    'storyboard': env_bool("STORYBOARD", True),
    'storyboard_max_tiles': env_int("STORYBOARD_MAX_TILES", 30, minimum=1),
    'storyboard_columns': env_int("STORYBOARD_COLUMNS", 6, minimum=1),
    'storyboard_rows_per_page': env_int("STORYBOARD_ROWS_PER_PAGE", 5, minimum=1),
    'storyboard_long_scene_seconds': env_float("STORYBOARD_LONG_SCENE_SECONDS", 6.0, minimum=0.1),
    'speech_rate': env_float("SPEECH_RATE", 3.9, minimum=0.5),
    'speech_safety_margin': env_float("SPEECH_SAFETY_MARGIN", 0.85, minimum=0.1),
    'narration_coverage_target': 0.7,
    'narration_coverage_max': 0.85,
    'narration_coverage_min': 0.5,
    'narration_block_seconds': 9.0,
    'original_block_min_seconds': 2.5,
    'narration_block_min_chars': 16,
    'breath_ms': 250,
    'narration_speed': env_float("NARRATION_SPEED", 1.15, minimum=0.5),
    'narration_tail_pad_seconds': 0.1,
    'quiet_overlap_min_ratio': 0.8,
    'visual_beat_max_seconds': 18.0,
    'visual_beat_max_facts': 3,
    'asr_chunk_min_chars': env_int("ASR_CHUNK_MIN_CHARS", 500, minimum=1),
    'asr_chunk_max_chars': env_int("ASR_CHUNK_MAX_CHARS", 800, minimum=1),
    'silence_noise_threshold': "-25dB",
    'source_boundary_noise_threshold': os.environ.get("SOURCE_BOUNDARY_NOISE_THRESHOLD", "-18dB"),
    'source_boundary_min_pause': env_float("SOURCE_BOUNDARY_MIN_PAUSE", 0.12, minimum=0.05),
    'source_boundary_max_alignment_error': env_float(
        "SOURCE_BOUNDARY_MAX_ALIGNMENT_ERROR", 2.1, minimum=0.2
    ),
    'silence_min_duration': 0.3,
    'quiet_window_min': 1.0,
    'silence_merge_gap': 0.5,
    'scene_merge_min': 4.0,
    'scene_junk_filter': env_bool("SCENE_JUNK_FILTER", True),
    'scene_junk_workers': env_int("SCENE_JUNK_WORKERS", 8, minimum=1),
    'scene_junk_dark_luma': env_float("SCENE_JUNK_DARK_LUMA", 8.0, minimum=0.0),
    'scene_junk_bright_luma': env_float("SCENE_JUNK_BRIGHT_LUMA", 245.0, minimum=0.0),
    'scene_junk_pixel_ratio': env_float("SCENE_JUNK_PIXEL_RATIO", 0.995, minimum=0.0),
    'context_info': "",
    'vlm_workers': env_int("VLM_WORKERS", 8, minimum=1),
    'edit_mode': os.environ.get("EDIT_MODE", "full"),
    'target_duration': os.environ.get("TARGET_DURATION", ""),
    'mimo_tts_api_url': normalize_api_url(_raw_mimo_tts_api_url),
    'mimo_tts_api_key': _mimo_tts_api_key,
    'mimo_tts_api_key_source': "MIMO_TTS_API_KEY" if os.environ.get("MIMO_TTS_API_KEY") else "MIMO_API_KEY",
    'mimo_tts_model': os.environ.get("MIMO_TTS_MODEL", DEFAULT_MIMO_TTS_MODEL),
    'mimo_tts_voice': os.environ.get("MIMO_TTS_VOICE", "冰糖"),
    'voice_ref': os.environ.get("VOICE_REF", "").strip(),
    'mimo_tts_style': os.environ.get(
        "MIMO_TTS_STYLE",
        "自然、清晰、有感染力，像在给观众讲故事；随剧情起伏，该紧张时紧张、该动情时动情，不平铺直叙。",
    ),
    'tts_provider': os.environ.get("TTS_PROVIDER", "auto").strip().lower(),
    'tts_timeout': env_int("TTS_TIMEOUT", 300, minimum=1),
    'fish_api_key': os.environ.get("FISH_API_KEY", ""),
    'fish_tts_api_url': os.environ.get("FISH_TTS_API_URL", DEFAULT_FISH_TTS_API_URL),
    'fish_tts_model': os.environ.get("FISH_TTS_MODEL", DEFAULT_FISH_TTS_MODEL),
    'fish_tts_reference_id': os.environ.get(
        "FISH_TTS_REFERENCE_ID", DEFAULT_FISH_TTS_REFERENCE_ID
    ).strip(),
    'narration_cumulative_tempo_max': env_float("NARRATION_CUMULATIVE_TEMPO_MAX", 1.35, minimum=1.0),
    'narration_cumulative_tempo_hard_max': env_float("NARRATION_CUMULATIVE_TEMPO_HARD_MAX", 1.40, minimum=1.0),
    'tts_dynamic_params': True,
    'tts_workers': env_int("TTS_WORKERS", 4, minimum=1),
    'tts_retries': env_int("TTS_RETRIES", 3, minimum=1),
    'allow_partial_tts': env_bool("ALLOW_PARTIAL_TTS", False),
    'tts_segment_normalize': env_bool("TTS_SEGMENT_NORMALIZE", True),
    'tts_segment_target_rms_dbfs': env_float("TTS_SEGMENT_TARGET_RMS_DBFS", -20.0),
    'tts_segment_peak_limit': env_float("TTS_SEGMENT_PEAK_LIMIT", 0.98, minimum=0.1),
    'fade_ms': env_int("FADE_MS", 120, minimum=0),
    'ducking_mode': "fixed",
    'ducking_threshold': 0.15,
    'ducking_ratio': 3,
    'ducking_attack': 10,
    'ducking_release': 300,
    'ducking_level_sc': 2.0,
    'ducking_makeup': 1.2,
    'ducking_narr_weight': 1.5,
    'ducking_orig_volume': env_float("DUCKING_ORIG_VOLUME", 0.3, minimum=0.0),
    'foreign_source_audio': _foreign_source_audio,
    'zone_ducking_volume': env_float("ZONE_DUCKING_VOLUME",
        _foreign_under_narration_volume if _foreign_source_audio else 0.12, minimum=0.0),
    'idle_orig_volume': env_float("IDLE_ORIG_VOLUME", 1.0, minimum=0.0),
    'duck_fade_seconds': env_float("DUCK_FADE_SECONDS", 0.3, minimum=0.0),
    'duck_bridge_seconds': env_float("DUCK_BRIDGE_SECONDS", 1.5, minimum=0.0),
    'bgm_path': os.environ.get("BGM_PATH", "").strip(),
    'source_video': os.environ.get("SOURCE_VIDEO", "").strip(),
    'export_jianying': env_bool("EXPORT_JIANYING", False),
    'jianying_draft_dir': os.environ.get("JIANYING_DRAFT_DIR", "").strip(),
    'jianying_bundle_media': env_bool("JIANYING_BUNDLE_MEDIA", True),
    'bgm_volume': env_float("BGM_VOLUME", 0.18, minimum=0.0),
    'bgm_ducking_volume': env_float("BGM_DUCKING_VOLUME", 0.10, minimum=0.0),
    'source_subtitle_mask_policy': os.environ.get("SOURCE_SUBTITLE_MASK_POLICY", "").strip().lower()
        or "off",
    'source_subtitle_mask_ratio': env_float("SOURCE_SUBTITLE_MASK_RATIO", 0.14, minimum=0.0),
    'source_subtitle_mask_timing': os.environ.get("SOURCE_SUBTITLE_MASK_TIMING", "narration").strip().lower(),
    'subtitle_mask_opacity': min(1.0, env_float("SUBTITLE_MASK_OPACITY", 0.6, minimum=0.0)),
    'subtitle_mask_padding': env_int("SUBTITLE_MASK_PADDING", 4, minimum=0),
    'subtitle_y_top': env_int("SUBTITLE_Y_TOP", -1, minimum=-1),
    'subtitle_y_bot': env_int("SUBTITLE_Y_BOT", -1, minimum=-1),
    'narration_tighten': env_bool("NARRATION_TIGHTEN", True),
    'narration_run_gap_seconds': env_float("NARRATION_RUN_GAP_SECONDS", 1.6, minimum=0.0),
    'narration_tight_pause_seconds': env_float("NARRATION_TIGHT_PAUSE_SECONDS", 0.35, minimum=0.0),
    'narration_max_pull_seconds': env_float("NARRATION_MAX_PULL_SECONDS", 1.2, minimum=0.0),
    'speech_ducking_volume': env_float("SPEECH_DUCKING_VOLUME",
        _foreign_under_narration_volume if _foreign_source_audio else 0.2, minimum=0.0),
    'burn_subtitles': env_bool("BURN_SUBTITLES", True),
    'subtitle_original_in_gaps': env_bool("SUBTITLE_ORIGINAL_IN_GAPS", True),
    'force_video_reencode': env_bool("FORCE_VIDEO_REENCODE", False),
    'output_crf': env_int("OUTPUT_CRF", 18, minimum=0),
    'output_preset': os.environ.get("OUTPUT_PRESET", "veryfast"),
    'output_max_height': env_int("OUTPUT_MAX_HEIGHT", 0, minimum=0),
    'final_loudnorm': env_bool("FINAL_LOUDNORM", True),
    'target_lufs': env_float("TARGET_LUFS", -14.0),
    'target_true_peak': env_float("TARGET_TRUE_PEAK", -1.0),
    'target_lra': env_float("TARGET_LRA", 11.0),
    'final_limiter_peak': env_float("FINAL_LIMITER_PEAK", 0.98, minimum=0.1),
    'subtitle_font_name': os.environ.get("SUBTITLE_FONT_NAME", "Arial"),
    'subtitle_font_size': env_int("SUBTITLE_FONT_SIZE", 42, minimum=8),
    'subtitle_primary_color': os.environ.get("SUBTITLE_PRIMARY_COLOR", "&H00FFFFFF"),
    'subtitle_outline_color': os.environ.get("SUBTITLE_OUTLINE_COLOR", "&H00000000"),
    'subtitle_outline': env_float("SUBTITLE_OUTLINE", 2.0, minimum=0.0),
    'subtitle_shadow': env_float("SUBTITLE_SHADOW", 1.0, minimum=0.0),
    'subtitle_margin_v': env_int("SUBTITLE_MARGIN_V", 48, minimum=0),
    'subtitle_margin_l': env_int("SUBTITLE_MARGIN_L", 40, minimum=0),
    'subtitle_margin_r': env_int("SUBTITLE_MARGIN_R", 40, minimum=0),
    'subtitle_alignment': env_int("SUBTITLE_ALIGNMENT", 2, minimum=1),
    'subtitle_max_chars': env_int("SUBTITLE_MAX_CHARS", 20, minimum=6),
    'subtitle_max_lines': env_int("SUBTITLE_MAX_LINES", 2, minimum=1),
    'subtitle_play_res_x': env_int("SUBTITLE_PLAY_RES_X", 1280, minimum=1),
    'subtitle_play_res_y': env_int("SUBTITLE_PLAY_RES_Y", 720, minimum=1),
    'snap_clip_line_end': env_bool("SNAP_CLIP_LINE_END", True),
    'clip_snap_max_extend': env_float("CLIP_SNAP_MAX_EXTEND", 2.0, minimum=0.0),
    'clip_start_snap_max_prepend': env_float("CLIP_START_SNAP_MAX_PREPEND", 1.8, minimum=0.0),
    'clip_start_snap_max_trim': env_float("CLIP_START_SNAP_MAX_TRIM", 0.35, minimum=0.0),
    'clip_join_audio_fade_ms': env_float("CLIP_JOIN_AUDIO_FADE_MS", 30.0, minimum=0.0),
    'clip_padding': env_float("CLIP_PADDING", 0.0, minimum=0.0),
    'scene_cut_snap': env_bool("SCENE_CUT_SNAP", True),
    'scene_cut_snap_margin': env_float("SCENE_CUT_SNAP_MARGIN", 0.5, minimum=0.0),
    'scene_cut_detect_threshold': env_float("SCENE_CUT_DETECT_THRESHOLD", 0.4, minimum=0.0),
    'api_provider': "mimo",
    'api_url_source': "env" if os.environ.get("MIMO_API_URL") else "default",
    'mimo_qc_model': os.environ.get("MIMO_QC_MODEL") or os.environ.get("MIMO_VIDEO_MODEL")
    or os.environ.get("MIMO_MODEL", DEFAULT_MIMO_MODEL),
    'mimo_qc_model_source': "env" if os.environ.get("MIMO_QC_MODEL") else "fallback",
    'mimo_model_source': "env" if os.environ.get("MIMO_MODEL") else "default",
    'mimo_api_url_source': "env" if os.environ.get("MIMO_API_URL") else "default",
    'mimo_video_api_url_source': "env" if (
        os.environ.get("MIMO_VIDEO_API_URL") or os.environ.get("MIMO_API_URL")
    ) else "default",
    'mimo_disable_thinking_source': "env" if os.environ.get("MIMO_DISABLE_THINKING") else "default",
    'mimo_media_resolution_source': "env" if os.environ.get("MIMO_MEDIA_RESOLUTION") else "default",
    'mimo_tts_api_url_source': "env" if (
        os.environ.get("MIMO_TTS_API_URL") or os.environ.get("MIMO_API_URL")
    ) else "default",
    'mimo_asr_api_url_source': "env" if (
        os.environ.get("MIMO_ASR_API_URL") or os.environ.get("MIMO_API_URL")
    ) else "default",
    'mimo_video_model_source': "env" if (
        os.environ.get("MIMO_VIDEO_MODEL") or os.environ.get("MIMO_MODEL")
    ) else "default",
    'vlm_model_source': "env" if os.environ.get("MIMO_MODEL") else "default",
    'mimo_tts_model_source': "env" if os.environ.get("MIMO_TTS_MODEL") else "default",
    'mimo_tts_voice_source': "env" if os.environ.get("MIMO_TTS_VOICE") else "default",
    'fish_tts_reference_id_source': "env" if os.environ.get("FISH_TTS_REFERENCE_ID") else "default",
}

SCRIPT_DIR = Path(__file__).parent
PROMPTS_DIR = SCRIPT_DIR.parent / "references"

def narration_tempo_budget(tts_rate_offset=0.0, *, config=None):
    """Return the canonical tempo budget shared by voiceover and assemble."""
    cfg = config or CONFIG
    global_speed = max(0.01, float(cfg.get("narration_speed", 1.0) or 1.0))
    rate_factor = max(0.01, 1.0 + float(tts_rate_offset or 0.0))
    cumulative_max = max(1.0, float(cfg.get("narration_cumulative_tempo_max", 1.35) or 1.35))
    hard_max = max(cumulative_max, float(cfg.get("narration_cumulative_tempo_hard_max", 1.40) or 1.40))
    segment_tempo_max = max(1.0, cumulative_max / (global_speed * rate_factor))
    return {
        "global_narration_speed": global_speed,
        "tts_rate_factor": rate_factor,
        "cumulative_tempo_max": cumulative_max,
        "cumulative_tempo_hard_max": hard_max,
        "segment_tempo_max": segment_tempo_max,
        "max_raw_duration_factor": global_speed * segment_tempo_max,
    }

def log(msg):
    print(f"[video-recap] {msg}", flush=True)

def run_cmd(cmd, **kwargs):
    """运行命令，返回 CompletedProcess"""
    if isinstance(cmd, list):
        display_parts = []
        for part in cmd:
            text = str(part)
            display_parts.append(text if len(text) <= 240 else text[:237] + "...")
        display = " ".join(display_parts)
    else:
        display = str(cmd)
        if len(display) > 2000:
            display = display[:1997] + "..."
    log(f"运行: {display}")
    return subprocess.run(cmd, capture_output=True, text=True, **kwargs)

def get_video_duration(video_path):
    """获取视频时长（秒）"""
    cmd = ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
           "-of", "csv=p=0", str(video_path)]
    result = run_cmd(cmd)
    if result.returncode != 0:
        return 0.0
    try:
        return float(result.stdout.strip())
    except (TypeError, ValueError):
        return 0.0

def stable_json_dumps(value):
    """Serialize values deterministically for non-secret cache fingerprints."""
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)

def stable_hash(value):
    """Return an md5 digest for deterministic JSON-serializable values."""
    return hashlib.md5(stable_json_dumps(value).encode("utf-8")).hexdigest()

def _file_identity(path):
    """(device, inode, size, mtime_ns) — changes whenever the bytes could have changed."""
    st = os.stat(os.fspath(path))
    return (st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns)

def file_fingerprint(path, chunk_size=1024 * 1024):
    """Return a full-content fingerprint for cache-correct identity checks.

    The digest covers CONTENT only — never the path or mtime — so a copied video or
    artifact is still recognised as the same asset, while any byte change invalidates
    the cache even if timestamps, size, head, or tail bytes are misleading.

    Identity metadata is used ONLY to memoize within a single process. One understanding
    run fingerprints the same source video 8-10 times and the whole extracted frame set
    2-3 times; on a 40-minute video at fps=1 that is gigabytes of redundant reads before
    any real work starts. A file rewritten in place gets a new (size, mtime_ns) and is
    re-hashed, so the memo can never serve a stale digest.
    """
    key = _file_identity(path)
    memoized = _FILE_FINGERPRINT_MEMO.get(key)
    if memoized is not None:
        return memoized
    h = hashlib.sha256()
    with open(os.fspath(path), "rb") as f:
        for chunk in iter(lambda: f.read(chunk_size), b""):
            h.update(chunk)
    digest = h.hexdigest()
    _FILE_FINGERPRINT_MEMO[key] = digest
    return digest

def video_fingerprint(video_path):
    """Full video content fingerprint used as the root pipeline asset print."""
    return file_fingerprint(video_path)

def step_cache_key(video_path, step_name, params_fingerprint=""):
    """Build a cache key from video content, step name and step parameters."""
    params_digest = params_fingerprint
    if not isinstance(params_digest, str):
        params_digest = stable_hash(params_digest)
    payload = f"{video_fingerprint(video_path)}_{step_name}_{params_digest}"
    return hashlib.md5(payload.encode("utf-8")).hexdigest()

def _retry_after_seconds(value, fallback):
    """Parse Retry-After seconds or HTTP-date; return fallback on malformed input."""
    if not value:
        return fallback
    try:
        return max(fallback, max(0, int(value)))
    except (TypeError, ValueError):
        pass
    try:
        retry_at = parsedate_to_datetime(value)
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)
        return max(fallback, max(0, int((retry_at - datetime.now(timezone.utc)).total_seconds())))
    except (TypeError, ValueError, IndexError, OverflowError):
        return fallback

def _sanitize_api_error(value, limit=500, *, extra_secrets=()):
    """Bound transport diagnostics without echoing request media or credentials."""
    text = _ERROR_DATA_URL_RE.sub("<redacted-data-url>", str(value or ""))
    text = _ERROR_KEY_RE.sub("<redacted-key>", text)
    for secret in extra_secrets:
        if secret:
            text = text.replace(str(secret), "<redacted-key>")
    return text[:limit]

def _api_headers(api_provider=None, api_url=None, api_key=None):
    """Build MiMo auth headers (OpenAI-compatible chat/completions with an api-key header)."""
    del api_provider, api_url  # MiMo is the only provider; signature kept for call sites
    key = CONFIG.get("api_key", "") if api_key is None else api_key
    return {
        "Content-Type": "application/json",
        "User-Agent": "video-recap/1.0",
        "api-key": key,
    }

def _prepare_api_payload(payload, api_provider=None, api_url=None):
    """Normalize payload fields for MiMo's OpenAI-compatible chat/completions API."""
    del api_provider, api_url
    normalized = dict(payload)
    if "max_tokens" in normalized and "max_completion_tokens" not in normalized:
        normalized["max_completion_tokens"] = normalized.pop("max_tokens")
    model = str(normalized.get("model") or "")
    if (
        CONFIG.get("mimo_disable_thinking", True)
        and not model.endswith(("-tts", "-asr"))
        and "thinking" not in normalized
    ):
        # MiMo V2.5 may spend small max_completion_tokens budgets on reasoning_content.
        # The recap pipeline needs visible text, so disable thinking unless set explicitly.
        normalized["thinking"] = {"type": "disabled"}
    return normalized

def _mimo_endpoint(kind):
    """Return per-capability MiMo endpoint settings (video understanding / TTS / ASR)."""
    by_kind = {
        "video": ("mimo_video_api_url", "mimo_video_api_key", "mimo_video_api_key_source"),
        "tts": ("mimo_tts_api_url", "mimo_tts_api_key", "mimo_tts_api_key_source"),
        "asr": ("mimo_asr_api_url", "mimo_asr_api_key", "mimo_asr_api_key_source"),
    }
    if kind not in by_kind:
        raise ValueError(f"Unsupported MiMo endpoint kind: {kind}")
    url_key, key_key, src_key = by_kind[kind]
    return {
        "api_url": CONFIG.get(url_key) or CONFIG.get("mimo_api_url"),
        "api_key": CONFIG.get(key_key) or CONFIG.get("mimo_api_key"),
        "api_key_source": CONFIG.get(src_key, "MIMO_API_KEY"),
    }

def _call_mimo_endpoint(kind, payload, max_retries=10):
    settings = _mimo_endpoint(kind)
    return api_call(
        payload,
        max_retries=max_retries,
        api_provider="mimo",
        api_url=settings["api_url"],
        api_key=settings["api_key"],
        api_key_source=settings["api_key_source"],
    )

def mimo_video_api_call(payload, max_retries=10):
    """Call the MiMo video-understanding endpoint."""
    return _call_mimo_endpoint("video", payload, max_retries=max_retries)

def mimo_asr_api_call(payload, max_retries=10):
    """Call the MiMo speech-recognition (ASR) endpoint."""
    return _call_mimo_endpoint("asr", payload, max_retries=max_retries)

def api_call(payload, max_retries=8, *, api_provider=None, api_url=None, api_key=None, api_key_source=None):
    """调用 OpenAI-compatible API，带重试。

    集群的 429 限流是常态而非错误，所以重试更耐心（更多次数 + 退避封顶 60s + 遵从 Retry-After），
    避免一次瞬时限流就中止整个阶段。配额窗口常以分钟计，所以 429 在没有 Retry-After 时也至少等 10s。
    """
    if not (api_key if api_key is not None else CONFIG.get("api_key")):
        raise RuntimeError("Missing MiMo credential; no request was sent")
    endpoint = normalize_api_url(api_url if api_url is not None else CONFIG["api_url"])
    headers = _api_headers(api_provider=api_provider, api_url=endpoint, api_key=api_key)
    data = json.dumps(_prepare_api_payload(payload, api_provider=api_provider, api_url=endpoint)).encode("utf-8")

    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(endpoint, data=data, headers=headers)
            with urllib.request.urlopen(req, timeout=300) as resp:
                result = json.loads(resp.read().decode("utf-8"))
                return result
        except urllib.error.HTTPError as e:
            body = _sanitize_api_error(e.read().decode("utf-8", errors="replace"))
            wait = min(2 ** attempt, 60)
            if e.code == 429:
                retry_after = e.headers.get("Retry-After")
                wait = _retry_after_seconds(retry_after, max(wait, 10))
                log(f"API 速率限制 (尝试 {attempt+1}/{max_retries}), 等待 {wait}s")
            elif e.code == 401:
                key_name = api_key_source or CONFIG.get("api_key_source", "MIMO_API_KEY")
                raise RuntimeError(f"API 认证失败 (401)。请检查 {key_name} 和 API URL 是否匹配。")
            elif e.code == 403:
                hint = "API 访问被拒绝 (403)。"
                if "1010" in body or "cloudflare" in body.lower():
                    hint += "IP 被 Cloudflare 限流，请等待几分钟后重试。"
                    raise RuntimeError(hint)
                hint += "请检查 API key 权限和 API URL 设置。"
                raise RuntimeError(hint)
            elif e.code == 405:
                raise RuntimeError("API 端点不可用 (405)，可能被 WAF 拦截。请检查 MIMO_API_URL 或稍后重试。")
            elif e.code == 503:
                log(f"API 服务暂不可用 (503)，等待 {wait}s (尝试 {attempt+1}/{max_retries})")
            elif e.code == 524:
                # Cloudflare 超时：服务端处理超时，需要更长退避
                wait = max(wait, 4 * (attempt + 1))
                log(f"API 超时 (524)，等待 {wait}s (尝试 {attempt+1}/{max_retries})")
            else:
                log(f"API 调用失败 (尝试 {attempt+1}/{max_retries}): HTTP {e.code} — {body}")
            if attempt < max_retries - 1:
                time.sleep(wait)
            else:
                raise RuntimeError(f"API 调用失败 {max_retries} 次: HTTP {e.code} — {body}")
        except Exception as e:  # noqa: BLE001 - transport/decode faults are all retryable here
            # (Deliberately broad, but no longer written as `(URLError, Exception)`, which
            # read as a tuple while `Exception` already subsumed the first member.)
            wait = min(2 ** attempt, 60)
            safe_error = _sanitize_api_error(e)
            log(f"API 调用失败 (尝试 {attempt+1}/{max_retries}): {safe_error}")
            if attempt < max_retries - 1:
                log(f"等待 {wait}s 后重试...")
                time.sleep(wait)
            else:
                raise RuntimeError(f"API 调用失败 {max_retries} 次: {safe_error}")
    # Unreachable for max_retries >= 1; guards against a silent `None` return (and the
    # TypeError it would cause at the caller's resp["choices"]) if a caller passes 0.
    raise ValueError(f"max_retries must be >= 1, got {max_retries}")

def load_prompt(name):
    """加载 prompt 模板"""
    path = PROMPTS_DIR / "prompt-templates.md"
    if not path.exists():
        return None
    content = path.read_text(encoding="utf-8")
    # 用 ### NAME 和 ### 分隔提取对应 prompt
    pattern = rf"### {name}\s*\n(.*?)(?=\n### |\Z)"
    m = re.search(pattern, content, re.DOTALL)
    return m.group(1).strip() if m else None

def mimo_tts_api_call(payload, max_retries=10):
    """Call the MiMo TTS endpoint."""
    return _call_mimo_endpoint("tts", payload, max_retries=max_retries)

def _text_char_count(text):
    """计算文本的有效字数（去除标点和空白，这些不占 TTS 朗读时间）。"""
    return len(re.sub(r'[，。！？、；：…“”‘’《》〈〉\s"\'「」『』（）()【】\[\]—～·,.!?;:\\-]', '', text or ""))

def _truncate_at_sentence(text, max_chars):
    """在句子边界截断，不产生残句。max_chars 按有效字符计（不含标点空白）。"""
    if _text_char_count(text) <= max_chars:
        return text
    eff = 0
    cutoff = len(text)
    for i, ch in enumerate(text):
        eff += 1 if _text_char_count(ch) else 0
        if eff > max_chars:
            cutoff = i + 1
            break
    idx = max(text[:cutoff].rfind(sep) for sep in ['。', '！', '？', '!', '?'])
    if idx > 0:
        return text[:idx + 1]
    idx = max(text[:cutoff].rfind(sep) for sep in ['，', '、', '；', ','])
    if idx > 3:
        return text[:idx] + '。'
    return ""

class MiMoQCRequestError(RuntimeError):
    """Sanitized, fail-open transport error for the advisory QC request."""

def mimo_qc_api_call(payload, *, config=None, timeout=60):
    """Send exactly one OpenAI-compatible MiMo request for one QC stage.

    Deliberately no retries: the QC feature is advisory, and the orchestrator's
    one-request-per-stage contract is more important than hiding 429/timeout
    behavior. Callers turn every failure into a non-blocking status report.
    """
    cfg = dict(CONFIG)
    if config:
        cfg.update(config)
    api_key = cfg.get("mimo_video_api_key") or cfg.get("mimo_api_key") or cfg.get("api_key")
    if not api_key:
        raise MiMoQCRequestError("missing_key")
    endpoint = normalize_api_url(
        cfg.get("mimo_video_api_url") or cfg.get("mimo_api_url") or cfg.get("api_url")
    )
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        endpoint,
        data=body,
        headers={
            "Content-Type": "application/json",
            "User-Agent": "video-recap/mimo-qc",
            "api-key": str(api_key),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=float(timeout)) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        raise MiMoQCRequestError(f"http_{exc.code}") from None
    except (TimeoutError, socket.timeout):
        raise MiMoQCRequestError("timeout") from None
    except (urllib.error.URLError, OSError):
        raise MiMoQCRequestError("network_error") from None
    try:
        result = json.loads(raw)
    except (TypeError, ValueError):
        raise MiMoQCRequestError("invalid_json") from None
    if not isinstance(result, dict):
        raise MiMoQCRequestError("invalid_response")
    return result
