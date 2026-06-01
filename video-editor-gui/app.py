#!/usr/bin/env python3
"""V&V Video Editor — Flask Backend  →  http://localhost:5555"""
import os, re, json, time, shutil, threading, subprocess, uuid, hmac, hashlib, secrets
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory, make_response, redirect
import requests as _req

# Optional background-removal engines (checked at runtime)
try:
    import cv2 as _cv2
    import numpy as _np
    _HAS_CV2 = True
except ImportError:
    _HAS_CV2 = False

try:
    import mediapipe as _mp
    _HAS_MP = True
except ImportError:
    _HAS_MP = False

# Optional: Pillow for branded intro/outro frames
try:
    from PIL import Image, ImageDraw, ImageFont
    _HAS_PIL = True
except ImportError:
    _HAS_PIL = False

# ─── Paths ────────────────────────────────────────────────────────────────────
BASE   = Path(__file__).parent
STATIC = BASE / 'static'
UPLOAD = BASE / 'uploads';  UPLOAD.mkdir(exist_ok=True)
BROLL  = BASE / 'broll';    BROLL.mkdir(exist_ok=True)
EXPORT = BASE / 'exports';  EXPORT.mkdir(exist_ok=True)
THUMBS = BASE / 'thumbs';   THUMBS.mkdir(exist_ok=True)
IO_ASSETS = BASE / 'Intro & Outro'; IO_ASSETS.mkdir(exist_ok=True)
VV_BRAND_PNG    = IO_ASSETS / 'vv_brand_frame.png'      # default branded frame
VV_DEFAULT_AUDIO= IO_ASSETS / 'vv_visibility_audio.m4a' # default audio (Visibility demo)

# FFmpeg discovery — env override → Windows winget path → bare `ffmpeg` on PATH
_WIN_FFMPEG = (r'C:\Users\RaphaelHaim\AppData\Local\Microsoft\WinGet\Packages'
               r'\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe'
               r'\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe')
def _resolve_ffmpeg():
    env = os.environ.get('FFMPEG_PATH')
    if env and Path(env).exists(): return env
    if Path(_WIN_FFMPEG).exists(): return _WIN_FFMPEG
    found = shutil.which('ffmpeg')
    return found or 'ffmpeg'   # falls back to PATH lookup at exec time
FFMPEG  = _resolve_ffmpeg()
FFPROBE = (FFMPEG[:-len('ffmpeg.exe')] + 'ffprobe.exe') if FFMPEG.endswith('ffmpeg.exe') \
          else (FFMPEG[:-len('ffmpeg')] + 'ffprobe' if FFMPEG.endswith('ffmpeg') else 'ffprobe')
if Path(FFMPEG).parent.exists():
    os.environ['PATH'] = str(Path(FFMPEG).parent) + os.pathsep + os.environ.get('PATH','')

app = Flask(__name__, static_folder=str(STATIC), static_url_path='')

# ─── Auth ─────────────────────────────────────────────────────────────────────
# In production, set VV_ACCESS_CODE and SECRET_KEY env vars on the host.
# Locally the gate is bypassed unless VV_ACCESS_CODE is set so dev stays painless.
ACCESS_CODE = os.environ.get('VV_ACCESS_CODE')
SECRET_KEY  = os.environ.get('SECRET_KEY') or secrets.token_hex(32)
AUTH_COOKIE = 'vv_podcast_session'
AUTH_TTL    = 60 * 60 * 24 * 7   # 7 days

def _make_token():
    """Signed timestamp; lasts AUTH_TTL seconds."""
    now = str(int(time.time()))
    sig = hmac.new(SECRET_KEY.encode(), now.encode(), hashlib.sha256).hexdigest()
    return f'{now}.{sig}'

def _verify_token(tok):
    try:
        ts_str, sig = tok.split('.', 1)
        expected = hmac.new(SECRET_KEY.encode(), ts_str.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected): return False
        return (int(time.time()) - int(ts_str)) < AUTH_TTL
    except Exception:
        return False

# Endpoints that don't need auth (login itself + a couple of static helpers)
_PUBLIC_PREFIXES = ('/__health',)

@app.before_request
def _require_auth():
    if not ACCESS_CODE:                       # dev mode (local) — no gate
        return None
    path = request.path or '/'
    if any(path.startswith(p) for p in _PUBLIC_PREFIXES):
        return None
    # One-shot PIN swap on the root → set cookie then strip it from the URL.
    if path == '/' and request.args.get('pin'):
        if hmac.compare_digest(request.args.get('pin',''), ACCESS_CODE):
            resp = make_response(redirect('/'))
            resp.set_cookie(AUTH_COOKIE, _make_token(), max_age=AUTH_TTL,
                            httponly=True, samesite='Lax',
                            secure=request.is_secure)
            return resp
        return ('Forbidden', 403)
    tok = request.cookies.get(AUTH_COOKIE, '')
    if tok and _verify_token(tok):
        return None
    # No valid session — only the login page is reachable.
    if path == '/':
        return ('<!doctype html><meta charset=utf-8><title>V&V Podcast — Access</title>'
                '<style>body{font:14px/1.4 system-ui;background:#0a1533;color:#e7ecf5;'
                'display:grid;place-items:center;min-height:100vh;margin:0}'
                'form{background:#0f1d40;padding:28px 32px;border-radius:12px;'
                'box-shadow:0 8px 30px rgba(0,0,0,.4);width:280px}'
                'input{width:100%;padding:10px;border-radius:6px;border:1px solid #2a3a64;'
                'background:#0a1533;color:#e7ecf5;font-size:14px;margin:8px 0 14px}'
                'button{width:100%;padding:10px;border:0;border-radius:6px;'
                'background:#6c63ff;color:#fff;font-weight:600;cursor:pointer}'
                '</style><form method=get action=/>'
                '<div style="font-weight:700;font-size:16px;margin-bottom:6px">'
                'V&amp;V Podcast — Authorized Personnel</div>'
                '<input name=pin type=password placeholder="Access code" autofocus required>'
                '<button>Enter</button></form>', 401)
    return ('Unauthorized', 401)

@app.route('/__health')
def __health(): return jsonify({'ok': True, 'service': 'vv-podcast', 'ffmpeg': FFMPEG})

# ─── State ────────────────────────────────────────────────────────────────────
state = {
    'video_path': None, 'video_name': None, 'duration': 0.0,
    'main_clips': [],        # [{id, path, name, thumb, src_dur, in, out, timeline_start}, …]
    'segments': [],          # [{id, start, end, text}]
    'word_timings': [],      # [{word, start, end}]  ← word-level from Whisper
    'broll_tracks': [[]],    # [[{id,path,thumb,start,end}, …], …]  ← free-form tracks
    'text_overlays': [],     # [{id, text, x, y, fontSize, color, bold, italic, bgColor, outline, shadow}]
    'sub_position': {'x': 50, 'y': 88},  # % within upper panel
    'srt_path': None,
    'intro_path': None,  # pre-generated V&V intro clip
    'outro_path': None,  # pre-generated V&V outro clip
    # Configurable intro/outro settings (length, fades, custom media, audio)
    'intro_cfg': {'duration': 5.0, 'fade_in': 0.6, 'fade_out': 0.6,
                  'custom_media': None,  # absolute path to uploaded image/video
                  'use_default_brand': True,
                  'audio_path': None,    # absolute path to uploaded audio
                  'use_default_audio': True,
                  'audio_volume': 0.8},
    'outro_cfg': {'duration': 5.0, 'fade_in': 0.6, 'fade_out': 0.6,
                  'custom_media': None, 'use_default_brand': True,
                  'audio_path': None, 'use_default_audio': True, 'audio_volume': 0.8},
    'transcribe_status': 'idle', 'transcribe_msg': '',
    'export_status': 'idle',     'export_msg': '',   'export_path': None,
    'background_cfg': {'enabled': False, 'bg_path': None, 'softness': 0.3},
}
cfg = {'pexels_key': 'HfJdYTEiWBp5FX6k20dtcgRG540EFPWFVyDlakiH8nROAPK7UIkrmKvU',
       'whisper_model': 'small'}

# Windows font map for FFmpeg drawtext
FONT_MAP = {
    'Arial':          r'C:\Windows\Fonts\arial.ttf',
    'Arial Black':    r'C:\Windows\Fonts\ariblk.ttf',
    'Impact':         r'C:\Windows\Fonts\impact.ttf',
    'Times New Roman':r'C:\Windows\Fonts\times.ttf',
    'Georgia':        r'C:\Windows\Fonts\georgia.ttf',
    'Verdana':        r'C:\Windows\Fonts\verdana.ttf',
    'Trebuchet MS':   r'C:\Windows\Fonts\trebuc.ttf',
    'Comic Sans MS':  r'C:\Windows\Fonts\comic.ttf',
    'Calibri':        r'C:\Windows\Fonts\calibri.ttf',
    'Segoe UI':       r'C:\Windows\Fonts\segoeui.ttf',
}
VV_BG_MUSIC = r'C:\Claude Projects\Vision & Virtue\remotion-videos\public\audio\bg-music.mp3'

CATEGORIES = [
    ('Finance',     'finance money investment stock market'),
    ('Business',    'business corporate entrepreneur office'),
    ('Corporate',   'corporate executive boardroom skyscraper'),
    ('Companies',   'company workspace startup tech office'),
    ('Logos',       'logo brand identity motion graphics animation'),
    ('Real Estate', 'real estate property building'),
    ('Technology',  'technology computer digital innovation'),
    ('Economy',     'economy market growth GDP'),
    ('People',      'team meeting leadership collaboration'),
    ('Marketing',   'marketing advertising social media'),
    ('Lifestyle',   'lifestyle success motivation'),
]
STOPWORDS = set("""a an the and or but in on at to for of with by from is it this that
we you he she they are was were be been being have has had do does did will would could
should may might shall can i my me our us your his her their its what which who when
where why how all each about as if so than then now just also more very really not no""".split())

# ─── Config ───────────────────────────────────────────────────────────────────
@app.route('/')
def index(): return send_from_directory(str(STATIC), 'index.html')

@app.route('/api/config', methods=['GET'])
def get_cfg(): return jsonify({'pexels_key_set': bool(cfg['pexels_key']), 'whisper_model': cfg['whisper_model']})

@app.route('/api/config', methods=['POST'])
def set_cfg():
    d = request.json or {}
    if 'pexels_key'    in d: cfg['pexels_key']    = d['pexels_key'].strip()
    if 'whisper_model' in d: cfg['whisper_model'] = d['whisper_model']
    return jsonify({'ok': True, 'pexels_key_set': bool(cfg['pexels_key'])})

@app.route('/api/categories')
def categories(): return jsonify({'categories': [{'name':c[0],'query':c[1]} for c in CATEGORIES]})

# ─── Upload ───────────────────────────────────────────────────────────────────
def _recompute_main_duration():
    """state.duration = max timeline_end across all main clips."""
    if not state['main_clips']:
        state['duration'] = 0.0
        return
    state['duration'] = max(c['timeline_start'] + (c['out'] - c['in']) for c in state['main_clips'])

@app.route('/api/upload', methods=['POST'])
def upload():
    if 'video' not in request.files: return jsonify({'error': 'No file'}), 400
    f = request.files['video']
    append = (request.form.get('append','0') == '1')
    dest = UPLOAD / f.filename
    f.save(str(dest))
    src_dur = get_dur(str(dest))
    thumb_name = Path(f.filename).stem + '.jpg'
    thumb_abs  = str(THUMBS / thumb_name)
    _ff([FFMPEG,'-y','-i',str(dest),'-ss','1','-vframes','1','-vf','scale=320:-1',thumb_abs], timeout=20)

    clip = {
        'id':             f'mc_{uuid.uuid4().hex[:8]}',
        'path':           f'/uploads/{f.filename}',
        'abs_path':       str(dest),
        'name':           f.filename,
        'thumb':          f'/thumbs/{thumb_name}',
        'src_dur':        src_dur,
        'in':             0.0,
        'out':            src_dur,
        'timeline_start': 0.0,
    }

    if append and state['main_clips']:
        # Append at the end of the timeline
        last_end = max(c['timeline_start'] + (c['out'] - c['in']) for c in state['main_clips'])
        clip['timeline_start'] = last_end
        state['main_clips'].append(clip)
    else:
        # First upload (or replacing): reset transcripts + broll
        state.update({
            'main_clips':   [clip],
            'video_path':   str(dest),
            'video_name':   f.filename,
            'segments':     [],
            'word_timings': [],
            'broll_tracks': [[]],
            'text_overlays':[],
            'srt_path':     None,
            'transcribe_status': 'idle', 'transcribe_msg': '',
            'sub_position': {'x': 50, 'y': 88},
        })

    _recompute_main_duration()
    return jsonify({'ok': True, 'filename': f.filename, 'duration': state['duration'],
                    'thumb': f'/thumbs/{thumb_name}',
                    'clip': clip, 'main_clips': state['main_clips']})

# ─── Main Clips management ────────────────────────────────────────────────────
@app.route('/api/main-clips', methods=['POST'])
def update_main_clips():
    """Replace the full main_clips list with the posted data."""
    d = request.json or {}
    clips_in = d.get('clips', [])
    # Preserve abs_path / src_dur from existing clips by id
    by_id = {c['id']: c for c in state['main_clips']}
    new_clips = []
    for c in clips_in:
        existing = by_id.get(c.get('id'))
        if existing:
            existing.update({
                'in':             float(c.get('in',  existing['in'])),
                'out':            float(c.get('out', existing['out'])),
                'timeline_start': float(c.get('timeline_start', existing['timeline_start'])),
            })
            new_clips.append(existing)
        else:
            new_clips.append(c)
    state['main_clips'] = new_clips
    _recompute_main_duration()
    return jsonify({'ok': True, 'main_clips': state['main_clips'], 'duration': state['duration']})

@app.route('/api/main-clips/<clip_id>', methods=['DELETE'])
def delete_main_clip(clip_id):
    state['main_clips'] = [c for c in state['main_clips'] if c['id'] != clip_id]
    _recompute_main_duration()
    return jsonify({'ok': True, 'main_clips': state['main_clips'], 'duration': state['duration']})

@app.route('/api/main-clips/cut', methods=['POST'])
def cut_main_clip():
    """Split the clip containing timeline_t into two clips at that point."""
    d = request.json or {}
    t = float(d.get('timeline_t', 0))
    new_id = None
    for clip in list(state['main_clips']):
        cs = clip['timeline_start']
        cdur = clip['out'] - clip['in']
        ce = cs + cdur
        if cs + 0.02 < t < ce - 0.02:
            cut_offset = (t - cs)
            right = dict(clip)
            right['id']             = f'mc_{uuid.uuid4().hex[:8]}'
            right['in']             = clip['in'] + cut_offset
            right['timeline_start'] = t
            clip['out'] = clip['in'] + cut_offset
            state['main_clips'].append(right)
            new_id = right['id']
            break
    state['main_clips'].sort(key=lambda c: c['timeline_start'])
    _recompute_main_duration()
    return jsonify({'ok': True, 'main_clips': state['main_clips'],
                    'new_clip_id': new_id, 'duration': state['duration']})

@app.route('/api/main-clips/cut-section', methods=['POST'])
def cut_section_main_clip():
    """Split the clip containing both [t1, t2] into THREE pieces: left, middle, right.
    Returns the middle clip's id so the frontend can highlight it as the 'free' piece."""
    d = request.json or {}
    t1 = float(d.get('t1', 0))
    t2 = float(d.get('t2', 0))
    if t2 < t1: t1, t2 = t2, t1
    if t2 - t1 < 0.05:
        return jsonify({'error': 'Cut points are too close together.'}), 400

    middle_id = None
    for clip in list(state['main_clips']):
        cs = clip['timeline_start']
        cdur = clip['out'] - clip['in']
        ce = cs + cdur
        # Both points must lie strictly inside the SAME clip
        if not (cs + 0.02 < t1 < ce - 0.02 and cs + 0.02 < t2 < ce - 0.02):
            continue

        off1 = t1 - cs          # offset into source for cut 1
        off2 = t2 - cs          # offset into source for cut 2

        # middle clip
        middle = dict(clip)
        middle['id']             = f'mc_{uuid.uuid4().hex[:8]}'
        middle['in']             = clip['in'] + off1
        middle['out']            = clip['in'] + off2
        middle['timeline_start'] = t1

        # right clip
        right = dict(clip)
        right['id']             = f'mc_{uuid.uuid4().hex[:8]}'
        right['in']             = clip['in'] + off2
        right['timeline_start'] = t2

        # left = original truncated to t1
        clip['out'] = clip['in'] + off1

        state['main_clips'].append(middle)
        state['main_clips'].append(right)
        middle_id = middle['id']
        break

    if not middle_id:
        return jsonify({'error': 'Both cut points must be inside the same clip.'}), 400

    state['main_clips'].sort(key=lambda c: c['timeline_start'])
    _recompute_main_duration()
    return jsonify({'ok': True, 'main_clips': state['main_clips'],
                    'middle_clip_id': middle_id, 'duration': state['duration']})

# ─── Background Replacement ───────────────────────────────────────────────────
BG_DIR = BASE / 'backgrounds'; BG_DIR.mkdir(exist_ok=True)

@app.route('/api/background/check')
def bg_check():
    if _HAS_MP and _HAS_CV2:
        return jsonify({'ok': True,  'engine': 'mediapipe + opencv'})
    missing = []
    if not _HAS_MP:  missing.append('mediapipe')
    if not _HAS_CV2: missing.append('opencv-python')
    return jsonify({'ok': False, 'install': 'pip install ' + ' '.join(missing)})

@app.route('/api/background/upload', methods=['POST'])
def bg_upload():
    if 'image' not in request.files: return jsonify({'error': 'No file'}), 400
    f    = request.files['image']
    dest = BG_DIR / f.filename
    f.save(str(dest))
    url  = f'/backgrounds/{f.filename}'
    state['background_cfg']['bg_path'] = url
    return jsonify({'ok': True, 'bg_path': url})

@app.route('/api/background/config', methods=['POST'])
def bg_config():
    d = request.json or {}
    cfg_obj = state['background_cfg']
    if 'enabled'  in d: cfg_obj['enabled']  = bool(d['enabled'])
    if 'softness' in d: cfg_obj['softness'] = max(0.0, min(1.0, float(d['softness'])))
    if 'bg_path'  in d: cfg_obj['bg_path']  = d['bg_path'] or None
    return jsonify({'ok': True, 'background_cfg': cfg_obj})

@app.route('/backgrounds/<path:fn>')
def srv_bg(fn): return send_from_directory(str(BG_DIR), fn)

# ─── Transcription ────────────────────────────────────────────────────────────
@app.route('/api/transcribe', methods=['POST'])
def start_transcribe():
    if not state['video_path']: return jsonify({'error': 'No video'}), 400
    if state['transcribe_status'] == 'running': return jsonify({'error': 'Running'}), 400
    state['transcribe_status'] = 'running'
    state['transcribe_msg']    = 'Starting…'
    threading.Thread(target=_transcribe_worker, daemon=True).start()
    return jsonify({'ok': True})

def _transcribe_worker():
    """Transcribe every main clip, offsetting each clip's timestamps by its
    timeline_start so all segments share one timeline coordinate system."""
    try:
        import whisper, wave
        import numpy as np

        clips = list(state.get('main_clips') or [])
        # Backward compat: if no main_clips but a single video was uploaded, transcribe that
        if not clips and state.get('video_path'):
            clips = [{
                'id': 'mc_legacy',
                'abs_path': state['video_path'],
                'in': 0.0,
                'out': state['duration'],
                'timeline_start': 0.0,
            }]
        if not clips:
            raise RuntimeError('No main clips to transcribe.')

        state['transcribe_msg'] = f'Loading {cfg["whisper_model"]} model…'
        model = whisper.load_model(cfg['whisper_model'])

        all_segments = []
        all_word_timings = []
        seg_id = 0

        for ci, clip in enumerate(clips, start=1):
            src = clip.get('abs_path') or clip.get('path')
            if not src or not Path(src).exists():
                continue
            clip_in  = float(clip.get('in', 0.0))
            clip_out = float(clip.get('out', clip_in))
            clip_dur = max(0.05, clip_out - clip_in)
            tl_off   = float(clip.get('timeline_start', 0.0))

            state['transcribe_msg'] = f'Clip {ci}/{len(clips)} — extracting audio…'
            audio_path = str(UPLOAD / f'_trans_{ci}_{Path(src).stem}.wav')
            r = _ff([FFMPEG,'-y','-ss', f'{clip_in:.3f}', '-i', src,
                     '-t', f'{clip_dur:.3f}',
                     '-ar','16000','-ac','1','-c:a','pcm_s16le', audio_path],
                    timeout=90)
            if r.returncode != 0:
                # skip this clip but continue with others
                continue

            with wave.open(audio_path,'rb') as wf:
                frames = wf.readframes(wf.getnframes())
            audio_np = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0

            state['transcribe_msg'] = f'Clip {ci}/{len(clips)} — transcribing…'
            result = model.transcribe(audio_np, language='he', task='transcribe',
                                      word_timestamps=True)

            for s in result['segments']:
                all_segments.append({
                    'id':       seg_id,
                    'start':    s['start'] + tl_off,
                    'end':      s['end']   + tl_off,
                    'text':     s['text'].strip(),
                    'clip_id':  clip.get('id'),
                })
                seg_id += 1
                for w in s.get('words', []):
                    word = w.get('word','').strip()
                    if word:
                        all_word_timings.append({
                            'word':  word,
                            'start': w['start'] + tl_off,
                            'end':   w['end']   + tl_off,
                        })

            try: Path(audio_path).unlink()
            except: pass

        # Sort by timeline start so segments display in order
        all_segments.sort(key=lambda s: s['start'])
        all_word_timings.sort(key=lambda w: w['start'])

        state['segments']     = all_segments
        state['word_timings'] = all_word_timings

        # Write combined SRT
        srt_path = (Path(state['video_path']).with_suffix('.srt')
                    if state.get('video_path')
                    else (BASE / 'transcript.srt'))
        _write_srt(all_segments, str(srt_path))
        state['srt_path'] = str(srt_path)

        # Only seed broll_tracks placeholders if user hasn't added any clips yet
        existing_with_path = any(c.get('path') for tr in state['broll_tracks'] for c in tr)
        if not existing_with_path:
            chunks = _build_chunks(all_segments, state['duration'])
            track0 = [{'id':'','path':'','thumb':'','start':c['start'],'end':c['end'],
                       'keywords':c['keywords'],'text':c['text']} for c in chunks]
            state['broll_tracks'] = [track0]

        state['transcribe_status'] = 'done'
        state['transcribe_msg']    = f'{len(all_segments)} subtitles · {len(all_word_timings)} words · {len(clips)} clip(s)'
    except Exception:
        import traceback as tb
        state['transcribe_status'] = 'error'
        state['transcribe_msg']    = tb.format_exc()

@app.route('/api/transcribe/status')
def transcribe_status():
    return jsonify({'status': state['transcribe_status'], 'msg': state['transcribe_msg'],
                    'segments': state['segments'], 'word_timings': state['word_timings'],
                    'broll_tracks': state['broll_tracks']})

@app.route('/api/state')
def get_state():
    return jsonify({k: state[k] for k in
        ('video_name','duration','main_clips','segments','word_timings','broll_tracks',
         'text_overlays','sub_position','srt_path','transcribe_status',
         'intro_path','outro_path','intro_cfg','outro_cfg','background_cfg')})

# ─── Intro / Outro config + media upload ──────────────────────────────────────
@app.route('/api/intro-outro/config', methods=['POST'])
def update_io_config():
    d = request.json or {}
    kind = d.get('type', 'intro')
    key  = 'intro_cfg' if kind == 'intro' else 'outro_cfg'
    cfg_obj = state[key]
    if 'duration'          in d: cfg_obj['duration']         = max(1.0, min(30.0, float(d['duration'])))
    if 'fade_in'           in d: cfg_obj['fade_in']          = max(0.0, min(5.0,  float(d['fade_in'])))
    if 'fade_out'          in d: cfg_obj['fade_out']         = max(0.0, min(5.0,  float(d['fade_out'])))
    if 'use_default_brand' in d: cfg_obj['use_default_brand']= bool(d['use_default_brand'])
    if 'use_default_audio' in d: cfg_obj['use_default_audio']= bool(d['use_default_audio'])
    if 'audio_volume'      in d: cfg_obj['audio_volume']     = max(0.0, min(2.0, float(d['audio_volume'])))
    if 'custom_media'      in d:
        cv = d['custom_media']
        cfg_obj['custom_media'] = cv if cv else None
    if 'audio_path'        in d:
        ap = d['audio_path']
        cfg_obj['audio_path'] = ap if ap else None
    return jsonify({'ok': True, key: cfg_obj})

@app.route('/api/intro-outro/upload', methods=['POST'])
def upload_io_media():
    """Upload a custom image or video for intro/outro. Returns absolute path stored on server."""
    kind = request.form.get('type', 'intro')
    if 'media' not in request.files:
        return jsonify({'error': 'No file'}), 400
    f = request.files['media']
    safe_name = f'io_{kind}_{int(time.time())}_{Path(f.filename).name}'
    dest = IO_ASSETS / safe_name
    f.save(str(dest))
    key = 'intro_cfg' if kind == 'intro' else 'outro_cfg'
    state[key]['custom_media']      = str(dest)
    state[key]['use_default_brand'] = False
    return jsonify({'ok': True, 'path': f'/io-assets/{safe_name}',
                    'filename': safe_name, kind+'_cfg': state[key]})

@app.route('/api/intro-outro/upload-audio', methods=['POST'])
def upload_io_audio():
    kind = request.form.get('type', 'intro')
    if 'audio' not in request.files:
        return jsonify({'error': 'No file'}), 400
    f = request.files['audio']
    safe_name = f'audio_{kind}_{int(time.time())}_{Path(f.filename).name}'
    dest = IO_ASSETS / safe_name
    f.save(str(dest))
    key = 'intro_cfg' if kind == 'intro' else 'outro_cfg'
    state[key]['audio_path']        = str(dest)
    state[key]['use_default_audio'] = False
    return jsonify({'ok': True, 'path': f'/io-assets/{safe_name}',
                    'filename': safe_name, kind+'_cfg': state[key]})

@app.route('/io-assets/<path:fn>')
def srv_io_asset(fn): return send_from_directory(str(IO_ASSETS), fn)

# ─── Clip Library ─────────────────────────────────────────────────────────────
@app.route('/api/search', methods=['POST'])
def search():
    d = request.json or {}
    q = d.get('query','').strip()
    if not q: return jsonify({'clips':[]})
    if not cfg['pexels_key']: return jsonify({'error':'No Pexels key'}), 400
    try:
        r = _req.get('https://api.pexels.com/videos/search',
                     headers={'Authorization': cfg['pexels_key']},
                     params={'query':q,'per_page':int(d.get('per_page',15)),'orientation':'landscape'},
                     timeout=10)
        r.raise_for_status()
        clips = []
        for v in r.json().get('videos',[]):
            files = sorted(v.get('video_files',[]), key=lambda f:(f.get('width',0),f.get('height',0)))
            hd = [f for f in files if f.get('quality') in ('hd','sd') and f.get('width',0)>=640]
            if not hd: continue
            best = hd[-1]
            clips.append({'id':v['id'],'duration':v.get('duration',0),
                          'thumbnail':v.get('image',''),'url':best['link'],
                          'width':best.get('width',0),'user':v.get('user',{}).get('name','Pexels')})
        return jsonify({'clips':clips})
    except Exception as e: return jsonify({'error':str(e)}), 500

@app.route('/api/broll/upload', methods=['POST'])
def upload_broll():
    """Accept a user-uploaded video or image; image becomes a short still-clip video."""
    if 'media' not in request.files: return jsonify({'error': 'No file'}), 400
    f = request.files['media']
    fname = Path(f.filename).name
    ext   = Path(fname).suffix.lower()
    is_video = ext in ('.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v')
    is_image = ext in ('.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif')
    if not (is_video or is_image):
        return jsonify({'error': 'Unsupported file type'}), 400

    cid  = f'user_{uuid.uuid4().hex[:8]}'
    dest = BROLL / f'{cid}.mp4'

    if is_video:
        # Save uploaded video as-is (transcode to mp4 if needed to standardize)
        tmp = BROLL / f'{cid}_src{ext}'
        f.save(str(tmp))
        # Transcode to a standard H.264/AAC mp4 to keep playback consistent
        r = _ff([FFMPEG, '-y', '-i', str(tmp),
                 '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
                 '-c:a', 'aac', '-b:a', '128k',
                 '-pix_fmt', 'yuv420p', str(dest)], timeout=180)
        try: tmp.unlink()
        except: pass
        if r.returncode != 0:
            return jsonify({'error': r.stderr.decode('utf-8','replace')[-400:]}), 500
    else:
        # Image → 5-second silent video, scaled to 1920x1080 with letterbox
        dur = float(request.form.get('duration', 5.0))
        dur = max(1.0, min(60.0, dur))
        img_path = BROLL / f'{cid}_src{ext}'
        f.save(str(img_path))
        r = _ff([FFMPEG, '-y',
                 '-loop', '1', '-i', str(img_path),
                 '-f', 'lavfi', '-i', f'anullsrc=r=44100:cl=stereo',
                 '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,'
                        'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1',
                 '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
                 '-c:a', 'aac', '-b:a', '64k',
                 '-t', str(dur), '-pix_fmt', 'yuv420p', '-shortest', str(dest)],
                timeout=60)
        try: img_path.unlink()
        except: pass
        if r.returncode != 0:
            return jsonify({'error': r.stderr.decode('utf-8','replace')[-400:]}), 500

    src_dur = get_dur(str(dest))
    thumb   = _broll_thumb(cid, str(dest))
    return jsonify({'ok': True, 'id': cid, 'path': f'/broll/{cid}.mp4',
                    'thumb': thumb, 'duration': src_dur, 'name': fname})

@app.route('/api/download-clip', methods=['POST'])
def download_clip():
    d = request.json or {}
    cid, url = str(d.get('id','')), d.get('url','')
    if not url or not cid: return jsonify({'error':'Missing id/url'}), 400
    dest = BROLL / f'{cid}.mp4'
    if not dest.exists():
        r = _req.get(url, headers={'Authorization':cfg['pexels_key']}, stream=True, timeout=60)
        r.raise_for_status()
        with open(str(dest),'wb') as fh:
            for chunk in r.iter_content(65536): fh.write(chunk)
    return jsonify({'ok':True,'path':f'/broll/{cid}.mp4','thumb':_broll_thumb(cid,str(dest))})

def _broll_thumb(cid, path):
    t = THUMBS / f'broll_{cid}.jpg'
    if not t.exists():
        _ff([FFMPEG,'-y','-i',path,'-ss','0.5','-vframes','1','-vf','scale=320:-1',str(t)], timeout=15)
    return f'/thumbs/broll_{cid}.jpg'

@app.route('/api/clips')
def list_clips():
    clips = []
    for mp4 in BROLL.glob('*.mp4'):
        cid = mp4.stem
        clips.append({'id':cid,'path':f'/broll/{cid}.mp4','thumb':_broll_thumb(cid,str(mp4)),
                      'size_mb':round(mp4.stat().st_size/1e6,1)})
    return jsonify({'clips':clips})

# ─── B-Roll Tracks ────────────────────────────────────────────────────────────
@app.route('/api/broll-tracks', methods=['POST'])
def update_broll_tracks():
    """Replace all B-roll tracks with the posted data."""
    d = request.json or {}
    state['broll_tracks'] = d.get('tracks', [[]])
    return jsonify({'ok':True,'broll_tracks':state['broll_tracks']})

@app.route('/api/broll-tracks/add-track', methods=['POST'])
def add_broll_track():
    state['broll_tracks'].append([])
    return jsonify({'ok':True,'broll_tracks':state['broll_tracks']})

# ─── Subtitle Position ────────────────────────────────────────────────────────
@app.route('/api/sub-position', methods=['POST'])
def update_sub_position():
    d = request.json or {}
    state['sub_position'] = {'x': float(d.get('x',50)), 'y': float(d.get('y',88))}
    return jsonify({'ok':True})

# ─── Text Overlays ────────────────────────────────────────────────────────────
@app.route('/api/text-overlay', methods=['POST'])
def upsert_text_overlay():
    d = request.json or {}
    oid = d.get('id') or str(uuid.uuid4())[:8]
    existing = next((o for o in state['text_overlays'] if o['id'] == oid), None)
    overlay = {
        'id':         oid,
        'text':       d.get('text','Text'),
        'x':          float(d.get('x',50)),
        'y':          float(d.get('y',15)),
        'fontSize':   int(d.get('fontSize',36)),
        'color':      d.get('color','#ffffff'),
        'bold':       bool(d.get('bold',True)),
        'italic':     bool(d.get('italic',False)),
        'bgColor':    d.get('bgColor',''),
        'outline':    int(d.get('outline',2)),
        'shadow':     bool(d.get('shadow',True)),
        'fontFamily': d.get('fontFamily','Arial'),
        'url':        d.get('url',''),
        'animation':  d.get('animation','none'),   # none|fade|slideLeft|slideRight|slideUp|zoom|flash|periodic
        'animPeriod': float(d.get('animPeriod',3.0)),
    }
    if existing:
        idx = state['text_overlays'].index(existing)
        state['text_overlays'][idx] = overlay
    else:
        state['text_overlays'].append(overlay)
    return jsonify({'ok':True,'overlay':overlay})

# ─── Segment text edit ────────────────────────────────────────────────────────
@app.route('/api/segment/<int:sid>', methods=['PATCH'])
def update_segment(sid):
    d = request.json or {}
    for seg in state['segments']:
        if seg['id'] == sid:
            seg['text'] = d.get('text', seg['text'])
            if state['srt_path']:
                _write_srt(state['segments'], state['srt_path'])
            return jsonify({'ok': True, 'segment': seg})
    return jsonify({'error': 'Not found'}), 404

@app.route('/api/text-overlay/<oid>', methods=['DELETE'])
def delete_text_overlay(oid):
    state['text_overlays'] = [o for o in state['text_overlays'] if o['id'] != oid]
    return jsonify({'ok':True})

# ─── Branded frame helper ────────────────────────────────────────────────────
def _make_branded_image(kind, w, h):
    """V&V branded frame — exact hero layout: text LEFT, porthole RIGHT.
    Portrait video (w=1080, h=1920); all content in the centre square band
    (rows cy0 … cy0+w ≈ 420 … 1500) which is what object-fit:cover shows in
    the square 1:1 preview.  Circle slightly overflows right edge (as on site)."""

    # ── Background: dark-navy horizontal gradient ──────────────────────────
    img  = Image.new('RGB', (w, h), (10, 21, 51))
    draw = ImageDraw.Draw(img)
    for x in range(w):
        t = x / max(w - 1, 1)
        draw.line([(x, 0), (x, h)],
                  fill=(int(10 + t * 16), int(21 + t * 26), int(51 + t * 43)))

    # ── Font helpers ────────────────────────────────────────────────────────
    def load(sz, bold=False):
        p = (r'C:\Windows\Fonts\arialbd.ttf' if bold
             else r'C:\Windows\Fonts\arial.ttf')
        try:    return ImageFont.truetype(p, sz)
        except: return ImageFont.load_default()

    def measure(txt, fnt):
        try:
            bb = draw.textbbox((0, 0), txt, font=fnt)
            return bb[2] - bb[0], bb[3] - bb[1]
        except:
            return len(txt) * 10, 16

    # ── Layout: visible square band ────────────────────────────────────────
    # When 1080×1920 is shown with object-fit:cover in a 1:1 preview,
    # scale = w/w = 1 on x; scale = preview_h/(h*(preview_w/w)) in y.
    # Effective: visible rows = (h - w) // 2  to  (h + w) // 2
    cy0   = (h - w) // 2           # ≈ 420  (top of visible square)
    cymid = cy0 + w // 2           # ≈ 960  (vertical centre)

    margin  = w // 14              # ≈ 77px  left margin
    max_tcol = int(w * 0.47)       # ≈ 508px left column max text width

    # Right column — circle
    circ_r  = int(w * 0.265)       # ≈ 286px radius
    circ_cx = int(w * 0.785)       # ≈ 847px  (partially off right edge = intentional)
    circ_cy = cymid                # vertically centred in visible band

    # ── Ocean porthole — drawn first (behind text) ─────────────────────────
    csz = circ_r * 2
    oc  = Image.new('RGB', (csz, csz), (20, 130, 155))
    od  = ImageDraw.Draw(oc)
    sky = int(csz * 0.40)
    for row in range(sky):                              # sky
        t = row / max(sky, 1)
        od.line([(0, row), (csz, row)],
                fill=(int(130 + t*70), int(185 + t*35), int(215 + t*25)))
    for row in range(sky, csz):                         # sea
        t = (row - sky) / max(csz - sky, 1)
        od.line([(0, row), (csz, row)],
                fill=(int(18 - t*6), int(135 - t*75), int(160 - t*70)))
    for row in range(sky + max(1, csz // 18), csz,     # horizontal reflections
                     max(1, csz // 10)):
        a  = 0.15 + 0.65 * ((row - sky) / max(csz - sky, 1))
        lc = int(85 * a)
        od.line([(0, row), (csz, row)],
                fill=(lc, lc + 58, lc + 80), width=max(1, csz // 85))

    # Dark border ring (glassy edge)
    bx   = max(6, csz // 22)
    bsz  = csz + bx * 2
    bimg = Image.new('RGB', (bsz, bsz), (7, 16, 38))
    bmsk = Image.new('L',   (bsz, bsz), 0)
    ImageDraw.Draw(bmsk).ellipse([0, 0, bsz-1, bsz-1], fill=255)
    # Clip paste so it stays inside image bounds
    bx0 = circ_cx - circ_r - bx;  by0 = circ_cy - circ_r - bx
    bx1 = bx0 + bsz;              by1 = by0 + bsz
    src_x0 = max(0, -bx0);  src_y0 = max(0, -by0)
    dst_x0 = max(0,  bx0);  dst_y0 = max(0,  by0)
    dst_x1 = min(w,  bx1);  dst_y1 = min(h,  by1)
    if dst_x1 > dst_x0 and dst_y1 > dst_y0:
        crop_w = dst_x1 - dst_x0;  crop_h = dst_y1 - dst_y0
        img.paste(bimg.crop((src_x0, src_y0, src_x0+crop_w, src_y0+crop_h)),
                  (dst_x0, dst_y0),
                  bmsk.crop((src_x0, src_y0, src_x0+crop_w, src_y0+crop_h)))

    cm = Image.new('L', (csz, csz), 0)
    ImageDraw.Draw(cm).ellipse([0, 0, csz-1, csz-1], fill=255)
    px0 = circ_cx - circ_r;  py0 = circ_cy - circ_r
    sx0 = max(0, -px0);      sy0 = max(0, -py0)
    dx0 = max(0,  px0);      dy0 = max(0,  py0)
    dx1 = min(w,  px0+csz);  dy1 = min(h,  py0+csz)
    if dx1 > dx0 and dy1 > dy0:
        cw_ = dx1 - dx0;  ch_ = dy1 - dy0
        img.paste(oc.crop((sx0, sy0, sx0+cw_, sy0+ch_)),
                  (dx0, dy0),
                  cm.crop((sx0, sy0, sx0+cw_, sy0+ch_)))

    # ── Semi-transparent "V" watermark (bottom-right of circle) ─────────────
    fwm = load(int(w * 0.27), bold=True)
    vbb = draw.textbbox((0, 0), 'V', font=fwm)
    vw_ = vbb[2] - vbb[0];  vh_ = vbb[3] - vbb[1]
    wm_x = w - vw_ - w // 22
    wm_y = circ_cy + circ_r // 3
    ov   = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ImageDraw.Draw(ov).text((wm_x, wm_y), 'V', fill=(255, 255, 255, 20), font=fwm)
    img_rgba = img.convert('RGBA')
    img_rgba.alpha_composite(ov)
    img  = img_rgba.convert('RGB')
    draw = ImageDraw.Draw(img)          # fresh draw after RGBA composite

    # ── LEFT column text ────────────────────────────────────────────────────
    y = cy0 + w // 18              # ≈ 480px — start of text block

    # "FINANCIAL STRATEGY PARTNERS" teal header
    fsp    = load(w // 27)
    sp_txt = 'FINANCIAL STRATEGY PARTNERS'
    _, sph = measure(sp_txt, fsp)
    draw.text((margin, y), sp_txt, fill=(64, 196, 196), font=fsp)
    y += sph + w // 28

    # Main title — two large bold lines, left-aligned
    fb  = load(w // 12, bold=True)  # ≈ 90px — fits 'From Vision' in ~508px
    lns = (['From Vision', 'To Virtue'] if kind == 'intro' else ['Thank', 'You'])
    for ln in lns:
        draw.text((margin, y), ln, fill=(255, 255, 255), font=fb)
        _, lh = measure(ln, fb)
        y += lh + w // 65
    y += w // 30

    # Tagline / URL — word-wrapped to left column width
    ft  = load(w // 31)
    tgl = ('In a journey as vast as the ocean, your company needs\n'
           "clear vision to reach land. Let's dive in."
           if kind == 'intro' else 'visionvirtuepartnership.com')
    for raw in tgl.split('\n'):
        words_q, cur = raw.split(), ''
        for wd in words_q:
            test = (cur + ' ' + wd).strip()
            if measure(test, ft)[0] <= max_tcol:
                cur = test
            else:
                if cur:
                    draw.text((margin, y), cur, fill=(200, 215, 235), font=ft)
                    _, ch = measure(cur, ft)
                    y += ch + w // 65
                cur = wd
        if cur:
            draw.text((margin, y), cur, fill=(200, 215, 235), font=ft)
            _, ch = measure(cur, ft)
            y += ch + w // 65

    return img

# ─── Intro / Outro Generation ─────────────────────────────────────────────────
def _is_video_file(p):
    if not p: return False
    return Path(p).suffix.lower() in ('.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v')

@app.route('/api/intro-outro', methods=['POST'])
def make_intro_outro():
    d    = request.json or {}
    kind = d.get('type', 'intro')   # 'intro' | 'outro'
    cfg_key = 'intro_cfg' if kind == 'intro' else 'outro_cfg'
    cfg_obj = state[cfg_key]

    # Allow inline config override in the POST body
    if 'duration'          in d: cfg_obj['duration']         = max(1.0, min(30.0, float(d['duration'])))
    if 'fade_in'           in d: cfg_obj['fade_in']          = max(0.0, min(5.0,  float(d['fade_in'])))
    if 'fade_out'          in d: cfg_obj['fade_out']         = max(0.0, min(5.0,  float(d['fade_out'])))
    if 'use_default_brand' in d: cfg_obj['use_default_brand']= bool(d['use_default_brand'])
    if 'use_default_audio' in d: cfg_obj['use_default_audio']= bool(d['use_default_audio'])
    if 'audio_volume'      in d: cfg_obj['audio_volume']     = max(0.0, min(2.0, float(d['audio_volume'])))

    dur  = float(cfg_obj['duration'])
    fin  = float(cfg_obj['fade_in'])
    fout = float(cfg_obj['fade_out'])
    vol  = float(cfg_obj.get('audio_volume', 0.8))
    w, h = 1080, 1920

    # Pick audio source
    audio_src = None
    if cfg_obj.get('audio_path') and Path(cfg_obj['audio_path']).exists():
        audio_src = cfg_obj['audio_path']
    elif cfg_obj.get('use_default_audio') and VV_DEFAULT_AUDIO.exists():
        audio_src = str(VV_DEFAULT_AUDIO)

    fname = 'vv_intro.mp4' if kind == 'intro' else 'vv_outro.mp4'
    out   = str(EXPORT / fname)
    thumb = str(THUMBS / f'vv_{kind}.jpg')

    # Always delete old files so regeneration uses the current design
    for old in [out, thumb, str(THUMBS / f'vv_{kind}_frame.png')]:
        try: Path(old).unlink()
        except: pass

    def _finish():
        key = 'intro_path' if kind == 'intro' else 'outro_path'
        state[key] = out
        _ff([FFMPEG,'-y','-i',out,'-ss','0.5','-vframes','1','-vf','scale=320:-1',thumb], timeout=15)
        return jsonify({'ok':True,'path':f'/exports/{fname}',
                        'thumb':f'/thumbs/vv_{kind}.jpg','duration':dur,
                        cfg_key: cfg_obj})

    # Decide source media:
    #   1. custom_media if set and exists
    #   2. default V&V brand PNG if use_default_brand and PNG exists
    #   3. Pillow generator (fallback for old behavior)
    custom = cfg_obj.get('custom_media')
    src_image = None
    src_video = None
    if custom and Path(custom).exists():
        if _is_video_file(custom): src_video = custom
        else:                      src_image = custom
    elif cfg_obj.get('use_default_brand') and VV_BRAND_PNG.exists():
        src_image = str(VV_BRAND_PNG)

    fade_filter = (f'fade=in:st=0:d={fin:.2f},'
                   f'fade=out:st={max(0, dur-fout):.2f}:d={fout:.2f}'
                   if (fin > 0 or fout > 0) else 'null')

    # Audio filter chain: trim to duration, apply fades, set volume
    afade_filter = (f'atrim=0:{dur},asetpts=PTS-STARTPTS,'
                    f'volume={vol:.2f},'
                    f'afade=t=in:st=0:d={max(0.1,fin):.2f},'
                    f'afade=t=out:st={max(0,dur-fout):.2f}:d={max(0.1,fout):.2f}')

    def _render_with_audio(video_filter_complex_v_label, extra_inputs):
        """Build & run FFmpeg, optionally muxing audio_src. Returns subprocess result.
        extra_inputs must declare exactly ONE video input — audio will be input index 1."""
        if audio_src and Path(audio_src).exists():
            args = [FFMPEG, '-y'] + extra_inputs + [
                    '-stream_loop','-1','-i', audio_src,
                    '-filter_complex',
                    video_filter_complex_v_label + f';[1:a]{afade_filter}[a]',
                    '-map','[v]','-map','[a]',
                    '-t', str(dur),
                    '-c:v','libx264','-preset','fast','-crf','23',
                    '-c:a','aac','-b:a','192k',
                    '-pix_fmt','yuv420p', out]
            return _ff(args, timeout=120)
        else:
            args = [FFMPEG, '-y'] + extra_inputs + [
                    '-filter_complex', video_filter_complex_v_label,
                    '-map','[v]','-an',
                    '-t', str(dur),
                    '-c:v','libx264','-preset','fast','-crf','23',
                    '-pix_fmt','yuv420p', out]
            return _ff(args, timeout=120)

    # ── Path A: Source video → trim/loop + fade ───────────────────────────
    if src_video:
        vfc = (f'[0:v]scale={w}:{h}:force_original_aspect_ratio=decrease,'
               f'pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,'
               f'{fade_filter}[v]')
        r = _render_with_audio(vfc, ['-stream_loop','-1','-i', src_video])
        if r.returncode == 0: return _finish()
        return jsonify({'error': r.stderr.decode('utf-8','replace')[-600:]}), 500

    # ── Path B: Source image (custom upload OR default brand PNG) ─────────
    if src_image:
        vfc = (f'[0:v]scale={w}:{h}:force_original_aspect_ratio=decrease,'
               f'pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=0x0a1533,setsar=1,'
               f'{fade_filter}[v]')
        r = _render_with_audio(vfc, ['-loop','1','-i', src_image])
        if r.returncode == 0: return _finish()
        # fall through

    # ── Path C: Pillow branded frame (legacy fallback) ────────────────────
    if _HAS_PIL:
        try:
            img = _make_branded_image(kind, w, h)
            frame_path = str(THUMBS / f'vv_{kind}_frame.png')
            img.save(frame_path)
            vfc = f'[0:v]{fade_filter}[v]'
            r = _render_with_audio(vfc, ['-loop','1','-i', frame_path])
            if r.returncode == 0:
                return _finish()
        except Exception:
            pass

    # ── Path D: Plain colored screen (always works) ───────────────────────
    color = '0x6c63ff' if kind == 'intro' else '0xff6b6b'
    vfc = f'[0:v]{fade_filter}[v]'
    r3 = _render_with_audio(vfc, ['-f','lavfi','-i', f'color=c={color}:size={w}x{h}:r=30:d={dur}'])
    if r3.returncode != 0:
        err = r3.stderr.decode('utf-8', 'replace')
        return jsonify({'error': err[-800:] if len(err) > 800 else err}), 500
    return _finish()

# ─── Export ───────────────────────────────────────────────────────────────────
@app.route('/api/export', methods=['POST'])
def start_export():
    if not state['video_path']: return jsonify({'error':'No video'}), 400
    if state['export_status'] == 'running': return jsonify({'error':'Export running'}), 400
    state.update({'export_status':'running','export_msg':'Starting…','export_path':None})
    opts = request.json or {}
    threading.Thread(target=_export_worker, args=(opts,), daemon=True).start()
    return jsonify({'ok':True})

def _ensure_selfie_model():
    """Download the selfie_segmenter.tflite model on first use, cache locally."""
    model_dir = BASE / 'models'
    model_dir.mkdir(exist_ok=True)
    model_path = model_dir / 'selfie_segmenter.tflite'
    if not model_path.exists():
        import urllib.request
        url = ('https://storage.googleapis.com/mediapipe-models/image_segmenter/'
               'selfie_segmenter/float16/latest/selfie_segmenter.tflite')
        state['export_msg'] = 'Downloading selfie segmenter model (one-time)…'
        urllib.request.urlretrieve(url, str(model_path))
    return str(model_path)


def _apply_background(video_in, bg_abs_path, video_out, softness=0.3):
    """Replace background using MediaPipe Tasks ImageSegmenter (Selfie model)."""
    if not (_HAS_MP and _HAS_CV2):
        missing = []
        if not _HAS_MP:  missing.append('mediapipe')
        if not _HAS_CV2: missing.append('opencv-python')
        raise RuntimeError('pip install ' + ' '.join(missing))

    import cv2, numpy as np
    import mediapipe as mp
    from mediapipe.tasks import python as mp_python
    from mediapipe.tasks.python import vision as mp_vision

    model_path = _ensure_selfie_model()

    cap = cv2.VideoCapture(video_in)
    fps  = cap.get(cv2.CAP_PROP_FPS) or 30
    fw   = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh   = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total= int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 1

    bg = cv2.imread(bg_abs_path)
    if bg is None: raise RuntimeError(f'Cannot read background image: {bg_abs_path}')
    bg = cv2.resize(bg, (fw, fh))

    tmp = video_out + '_noaudio.mp4'

    ff_proc = subprocess.Popen(
        [FFMPEG, '-y',
         '-f', 'rawvideo', '-vcodec', 'rawvideo',
         '-s', f'{fw}x{fh}', '-pix_fmt', 'bgr24', '-r', str(fps),
         '-i', 'pipe:0',
         '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
         '-pix_fmt', 'yuv420p', tmp],
        stdin=subprocess.PIPE
    )

    options = mp_vision.ImageSegmenterOptions(
        base_options=mp_python.BaseOptions(model_asset_path=model_path),
        output_confidence_masks=True,
        output_category_mask=False,
        running_mode=mp_vision.RunningMode.VIDEO,
    )

    # ── Mask post-processing knobs ─────────────────────────────────────────────
    # Goal: stable, clean person silhouette — no flicker, no random blobs,
    # no soft halo around the figure.
    THRESHOLD       = 0.55     # confidence cutoff (raise to drop noisy bg artifacts)
    OPEN_KERNEL     = 5        # morphological open — removes specks/noise
    CLOSE_KERNEL    = 9        # morphological close — fills holes inside silhouette
    EDGE_FEATHER    = max(1, int(softness * 6) | 1)  # 1..7 px feather, NOT a heavy blur
    EMA_ALPHA       = 0.65     # temporal smoothing: 0.65 prev + 0.35 new ⇒ no flicker
    KEEP_LARGEST    = True     # discard everything except the biggest connected blob

    open_k  = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (OPEN_KERNEL,  OPEN_KERNEL))
    close_k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (CLOSE_KERNEL, CLOSE_KERNEL))
    prev_mask_f = None  # float mask from previous frame, used for EMA

    with mp_vision.ImageSegmenter.create_from_options(options) as seg:
        n = 0
        while True:
            ok, frame = cap.read()
            if not ok: break
            rgb       = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image  = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            ts_ms     = int(n * 1000 / fps)
            result    = seg.segment_for_video(mp_image, ts_ms)
            # 1) Raw confidence (foreground probability 0..1)
            mask = np.array(result.confidence_masks[0].numpy_view(), dtype=np.float32)
            if mask.shape[:2] != (fh, fw):
                mask = cv2.resize(mask, (fw, fh), interpolation=cv2.INTER_LINEAR)

            # 2) Threshold to binary — sharp decisive edge
            binm = (mask >= THRESHOLD).astype(np.uint8) * 255

            # 3) Morphology: kill specks (open), fill holes (close)
            binm = cv2.morphologyEx(binm, cv2.MORPH_OPEN,  open_k)
            binm = cv2.morphologyEx(binm, cv2.MORPH_CLOSE, close_k)

            # 4) Keep only the largest connected component (the person) —
            #    eliminates floating debris like chairs/plants flickering in/out.
            if KEEP_LARGEST:
                num, labels, stats, _ = cv2.connectedComponentsWithStats(binm, connectivity=8)
                if num > 1:
                    areas = stats[1:, cv2.CC_STAT_AREA]
                    if areas.size:
                        biggest = 1 + int(np.argmax(areas))
                        binm = np.where(labels == biggest, 255, 0).astype(np.uint8)

            # 5) Light edge feather only (no big Gaussian halo)
            if EDGE_FEATHER > 1:
                binm = cv2.GaussianBlur(binm, (EDGE_FEATHER, EDGE_FEATHER), 0)
            mask_f = binm.astype(np.float32) * (1.0 / 255.0)

            # 6) Temporal EMA — prevents frame-to-frame flicker
            if prev_mask_f is None:
                smoothed = mask_f
            else:
                smoothed = EMA_ALPHA * prev_mask_f + (1.0 - EMA_ALPHA) * mask_f
            prev_mask_f = smoothed

            # 7) Composite person × frame + (1-person) × background
            mask3 = np.stack([smoothed]*3, axis=-1)
            comp  = (mask3 * frame + (1.0 - mask3) * bg).astype(np.uint8)
            ff_proc.stdin.write(comp.tobytes())
            n += 1
            if n % 30 == 0:
                state['export_msg'] = f'Background replacement… {int(n/total*100)}%'

    cap.release()
    ff_proc.stdin.close()
    ff_proc.wait()

    # Mux original audio back
    _ff([FFMPEG, '-y',
         '-i', tmp, '-i', video_in,
         '-c:v', 'copy', '-map', '0:v', '-map', '1:a?',
         '-c:a', 'aac', '-b:a', '128k', '-shortest',
         video_out], timeout=300)
    try: Path(tmp).unlink()
    except: pass


def _export_worker(opts):
    try:
        name    = f'export_{int(time.time())}.mp4'
        out     = str(EXPORT / name)
        orient  = opts.get('orientation','vertical')
        w, h    = (1080,1920) if orient=='vertical' else (1920,1080)
        pw, ph  = w, h//2
        sub_sz  = int(opts.get('subtitle_size',18))
        sub_ol  = int(opts.get('subtitle_outline',4))
        sub_pos = state.get('sub_position',{'x':50,'y':88})

        state['export_msg'] = 'Assembling main video…'
        main_assembled = out + '_main_clips.mp4'
        _assemble_main_clips(state['main_clips'], state['duration'], main_assembled, pw, ph)

        # Background replacement (before B-roll composite)
        bg_opts = opts.get('background') or state.get('background_cfg', {})
        if bg_opts.get('enabled') and bg_opts.get('bg_path'):
            bg_rel = bg_opts['bg_path']  # e.g. /backgrounds/foo.jpg
            bg_abs = str(BASE / bg_rel.lstrip('/'))
            if Path(bg_abs).exists():
                state['export_msg'] = 'Applying background replacement…'
                bg_out = out + '_bg.mp4'
                _apply_background(main_assembled, bg_abs, bg_out, float(bg_opts.get('softness', 0.3)))
                try: Path(main_assembled).unlink()
                except: pass
                main_assembled = bg_out

        state['export_msg'] = 'Assembling B-roll…'
        broll_tmp = out + '_broll.mp4'
        _assemble_broll(state['broll_tracks'], state['duration'], broll_tmp, pw, ph)

        state['export_msg'] = 'Compositing…'
        main_out = out + '_main.mp4'
        _compose(main_assembled, broll_tmp, state['srt_path'],
                 state['text_overlays'], main_out, pw, ph, sub_sz, sub_ol, sub_pos, w, h)
        try: Path(main_assembled).unlink()
        except: pass
        try: Path(broll_tmp).unlink()
        except: pass

        # Prepend/append intro/outro if requested
        add_intro = opts.get('add_intro', False)
        add_outro = opts.get('add_outro', False)
        parts = []
        if add_intro and state.get('intro_path') and Path(state['intro_path']).exists():
            parts.append(state['intro_path'])
        parts.append(main_out)
        if add_outro and state.get('outro_path') and Path(state['outro_path']).exists():
            parts.append(state['outro_path'])

        if len(parts) > 1:
            state['export_msg'] = 'Adding intro/outro…'
            _concat_videos(parts, out)
            try: Path(main_out).unlink()
            except: pass
        else:
            try: Path(main_out).rename(out)
            except: shutil.copy2(main_out, out); Path(main_out).unlink(missing_ok=True)

        state.update({'export_status':'done','export_msg':'Done!','export_path':f'/exports/{name}'})
    except Exception:
        import traceback as tb
        state.update({'export_status':'error','export_msg':tb.format_exc()[-3000:]})

@app.route('/api/export/status')
def export_status():
    return jsonify({'status':state['export_status'],'msg':state['export_msg'],'path':state['export_path']})

# ─── Static ───────────────────────────────────────────────────────────────────
@app.route('/uploads/<path:fn>')
def srv_upload(fn): return send_from_directory(str(UPLOAD), fn)
@app.route('/broll/<path:fn>')
def srv_broll(fn):  return send_from_directory(str(BROLL),  fn)
@app.route('/exports/<path:fn>')
def srv_export(fn): return send_from_directory(str(EXPORT), fn)
@app.route('/thumbs/<path:fn>')
def srv_thumb(fn):  return send_from_directory(str(THUMBS), fn)

# ─── FFmpeg Assembly ──────────────────────────────────────────────────────────
def _assemble_main_clips(main_clips, total_dur, out, pw, ph):
    """Concatenate main_clips in timeline order, filling gaps with black,
    trimming each clip to its [in,out] source range."""
    if not main_clips or total_dur <= 0:
        # No main clips → black video
        _ff([FFMPEG,'-y','-f','lavfi',
             '-i', f'color=black:size={pw}x{ph}:rate=30:duration={max(1.0,total_dur):.3f}',
             '-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p',
             '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
             '-shortest', '-c:a', 'aac', '-b:a','128k', out], timeout=120)
        return

    clips = sorted(main_clips, key=lambda c: c['timeline_start'])
    segments = []  # [(start, end, source_in, source_out, abs_path) or (start, end, None, None, None) for black]
    t = 0.0
    for c in clips:
        cs = c['timeline_start']
        cdur = max(0.0, c['out'] - c['in'])
        ce = cs + cdur
        if cs > t + 0.01:
            segments.append((t, cs, None, None, None))
        segments.append((cs, ce, c['in'], c['out'], c.get('abs_path') or c['path']))
        t = ce
    if t < total_dur - 0.01:
        segments.append((t, total_dur, None, None, None))

    ff_args = [FFMPEG, '-y']
    filter_parts = []
    concat_parts = []
    idx = 0        # filter-label counter (one per merged segment)
    input_idx = 0  # FFmpeg input-stream counter (only real-clip segments add an -i input)
    for (sstart, send, sin, sout, path) in segments:
        seg_dur = max(0.05, send - sstart)
        if path:
            ff_args += ['-ss', f'{sin:.3f}', '-t', f'{seg_dur:.3f}', '-i', path]
            filter_parts.append(
                f'[{input_idx}:v]scale={pw}:{ph}:force_original_aspect_ratio=decrease,'
                f'pad={pw}:{ph}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[mv{idx}]'
            )
            # Audio: try to take from input, fallback to silence
            if _has_audio(path):
                filter_parts.append(
                    f'[{input_idx}:a]atrim=duration={seg_dur:.3f},asetpts=PTS-STARTPTS,'
                    f'aresample=44100[ma{idx}]')
            else:
                filter_parts.append(
                    f'aevalsrc=0:duration={seg_dur:.3f}:sample_rate=44100,'
                    f'aformat=channel_layouts=stereo[ma{idx}]')
            concat_parts.append(f'[mv{idx}][ma{idx}]')
            input_idx += 1
            idx += 1
        else:
            # Black + silence segment — pure lavfi, no -i input added
            filter_parts.append(
                f'color=c=black:size={pw}x{ph}:duration={seg_dur:.3f}:rate=30,setsar=1[mv{idx}]')
            filter_parts.append(
                f'aevalsrc=0:duration={seg_dur:.3f}:sample_rate=44100,'
                f'aformat=channel_layouts=stereo[ma{idx}]')
            concat_parts.append(f'[mv{idx}][ma{idx}]')
            idx += 1

    fg = ';'.join(filter_parts) + ';' + ''.join(concat_parts) + f'concat=n={idx}:v=1:a=1[mvout][maout]'
    ff_args += ['-filter_complex', fg,
                '-map', '[mvout]', '-map', '[maout]',
                '-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p',
                '-c:a','aac','-b:a','128k', out]
    r = _ff(ff_args, timeout=600)
    if r.returncode != 0:
        raise RuntimeError('Main assembly failed:\n' + r.stderr.decode('utf-8','replace')[-600:])

def _assemble_broll(broll_tracks, total_dur, out, pw, ph):
    """Merge all tracks into one B-roll video. Higher-indexed tracks override lower ones."""
    # Guard against zero/negative timeline duration — produces an invalid lavfi input.
    if not total_dur or total_dur <= 0.05:
        total_dur = 1.0
    # Flatten tracks into a timeline: for each moment, find the highest-priority clip
    # Build list of (start, end, path) sorted by time
    all_clips = []
    skipped = []
    for track_idx, track in enumerate(broll_tracks):
        for clip in track:
            bp = clip.get('path','') or ''
            # Rewrite URL-style paths to absolute filesystem paths
            if bp.startswith('/broll/'):
                bp = str(BROLL / bp[len('/broll/'):])
            elif bp.startswith('/uploads/'):
                bp = str(UPLOAD / bp[len('/uploads/'):])
            if bp and Path(bp).exists():
                all_clips.append((clip['start'], clip['end'], bp, track_idx))
            elif clip.get('path'):
                skipped.append(clip.get('path'))
    if skipped:
        print(f'[broll] Skipped (path not found): {skipped}', flush=True)

    # Build timeline segments by priority
    resolution = 0.05  # 50ms resolution
    t = 0.0
    segments = []  # [(start, end, path)]
    while t < total_dur - 0.01:
        t_end = min(t + resolution, total_dur)
        # Find highest-priority clip covering time t
        best_path = None; best_idx = -1
        for (cs, ce, cp, ci) in all_clips:
            if cs <= t < ce and ci > best_idx:
                best_path = cp; best_idx = ci
        segments.append((t, t_end, best_path))
        t = t_end

    # Merge consecutive segments with same path
    merged = []
    for seg in segments:
        if merged and merged[-1][2] == seg[2]:
            merged[-1] = (merged[-1][0], seg[1], seg[2])
        else:
            merged.append(list(seg))

    if not merged or all(m[2] is None for m in merged):
        # No B-roll at all → black video matching the timeline duration
        args = [FFMPEG,'-y','-f','lavfi',
                '-i', f'color=black:size={pw}x{ph}:rate=30:duration={total_dur:.3f}',
                '-c:v','libx264','-preset','fast','-crf','23',
                '-pix_fmt','yuv420p', out]
        r = _ff(args, timeout=120)
        if r.returncode != 0 or not Path(out).exists():
            raise RuntimeError('B-roll black-fallback failed:\n' + r.stderr.decode('utf-8','replace')[-800:])
        return

    ff_args = [FFMPEG,'-y']
    filter_parts = []; concat_parts = []
    idx = 0        # filter-label counter (one per merged segment)
    input_idx = 0  # FFmpeg input-stream counter (only video clips add an -i input)

    for (cs, ce, cp) in merged:
        dur = max(0.05, ce - cs)
        if cp and Path(cp).exists():
            clip_dur = get_dur(cp) or 5.0
            loops = max(1, int(dur/clip_dur)+2)
            ff_args += ['-stream_loop', str(loops), '-i', cp]
            filter_parts.append(
                f'[{input_idx}:v]trim=duration={dur:.3f},setpts=PTS-STARTPTS,'
                f'scale={pw}:{ph}:force_original_aspect_ratio=increase,'
                f'crop={pw}:{ph},setsar=1[bv{idx}]')
            input_idx += 1
        else:
            # Pure lavfi source — no -i input added, so input_idx stays put.
            filter_parts.append(
                f'color=c=black:size={pw}x{ph}:duration={dur:.3f},setsar=1[bv{idx}]')
        concat_parts.append(f'[bv{idx}]')
        idx += 1

    fg = ';'.join(filter_parts) + ';' + ''.join(concat_parts) + f'concat=n={idx}:v=1:a=0[bvout]'
    ff_args += ['-filter_complex', fg, '-map','[bvout]','-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p', out]
    r = _ff(ff_args, timeout=300)
    if r.returncode != 0 or not Path(out).exists():
        err = r.stderr.decode('utf-8','replace')
        raise RuntimeError('B-roll assembly failed:\n' + err[-1500:])

def _compose(main, broll, srt, text_overlays, out, pw, ph, sub_sz, sub_ol, sub_pos, fw, fh):
    fg = (f'[0:v]scale={pw}:{ph}:force_original_aspect_ratio=increase,'
          f'crop={pw}:{ph},setsar=1[top];'
          f'[1:v]scale={pw}:{ph}:force_original_aspect_ratio=increase,'
          f'crop={pw}:{ph},setsar=1[bot];'
          f'[top][bot]vstack=inputs=2[v]')
    cur = '[v]'; out_lbl = '[v]'

    # Subtitles
    if srt and Path(srt).exists():
        tmp = str(EXPORT / 'sub.srt')
        shutil.copy2(srt, tmp)
        esc  = tmp.replace('\\','/').replace(':','\\:')
        # MarginV measured from bottom of FULL frame; subtitle lives in upper half
        margin_v = int((1 - sub_pos['y']/100) * ph)
        style = (f"Fontname=Arial Black,Fontsize={sub_sz},Bold=1,"
                 f"PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
                 f"Outline={sub_ol},Shadow=1,BorderStyle=1,"
                 f"Alignment=2,MarginV={fh - ph + margin_v}")
        nxt = '[vsub]'
        fg += f';{cur}subtitles=\'{esc}\':force_style=\'{style}\'{nxt}'
        cur = nxt; out_lbl = nxt

    # Text overlays via drawtext
    for i, ov in enumerate(text_overlays):
        def ff_esc(s): return s.replace('\\','\\\\').replace("'","\\'").replace(':','\\:')
        txt  = ff_esc(ov.get('text','Text'))
        x    = int(ov['x']/100 * fw)
        y    = int(ov['y']/100 * fh)
        sz   = ov.get('fontSize',36)
        col  = ov.get('color','#ffffff').lstrip('#')
        bold = '1' if ov.get('bold') else '0'
        nxt  = f'[vtxt{i}]'
        # Font file
        ff   = FONT_MAP.get(ov.get('fontFamily','Arial'), FONT_MAP['Arial'])
        ffp  = ff.replace('\\','/').replace(':','\\:') if Path(ff).exists() else ''
        ff_opt = f":fontfile='{ffp}'" if ffp else ''
        dt = (f"drawtext=text='{txt}'{ff_opt}:x={x}:y={y}"
              f":fontsize={sz}:fontcolor=0x{col}:bold={bold}")
        if ov.get('shadow'):
            dt += ':shadowcolor=0x000000@0.8:shadowx=2:shadowy=2'
        if ov.get('bgColor'):
            bg = ov['bgColor'].lstrip('#')
            dt += f':box=1:boxcolor=0x{bg}@0.85:boxborderw=10'
        elif ov.get('outline',0):
            dt += f':bordercolor=0x000000:borderw={ov["outline"]}'
        # Animation enable expression
        anim   = ov.get('animation','none')
        period = max(0.5, float(ov.get('animPeriod',3.0)))
        if anim == 'flash':
            dt += f":enable='mod(t,{period:.2f})<{period/2:.2f}'"
        elif anim == 'periodic':
            dt += f":enable='mod(t,{period:.2f})<1'"
        fg += f';{cur}{dt}{nxt}'
        cur = nxt; out_lbl = nxt

    args = [FFMPEG,'-y','-i',main,'-i',broll,
            '-filter_complex', fg, '-map', out_lbl, '-map','0:a?',
            '-c:v','libx264','-preset','fast','-crf','23','-pix_fmt','yuv420p',
            '-c:a','aac','-b:a','128k', out]
    r = _ff(args, timeout=600)
    if r.returncode != 0:
        # FFmpeg writes its banner first; the real error is at the END of stderr.
        # Show the tail so users see the actual failure cause, not the version header.
        err = r.stderr.decode('utf-8','replace')
        tail = err[-2000:] if len(err) > 2000 else err
        # Save full stderr to a log file for deeper investigation
        log_path = BASE / 'compose_error.log'
        try:
            log_path.write_text(err + '\n\n--- filter_complex ---\n' + fg, encoding='utf-8')
        except Exception: pass
        raise RuntimeError(f'Compose failed (see {log_path.name}):\n{tail}')

def _has_audio(path):
    """Return True if the video file has at least one audio stream."""
    r = subprocess.run(
        [FFPROBE, '-v', 'quiet', '-select_streams', 'a', '-show_entries',
         'stream=codec_type', '-of', 'csv=p=0', path],
        capture_output=True, timeout=10)
    return bool(r.stdout.strip())

def _concat_videos(parts, out):
    """Concatenate video files. Silently adds a null audio track to video-only parts."""
    # Check which parts have audio so we can add silent tracks where needed
    has_audio = [_has_audio(p) for p in parts]
    n = len(parts)
    ff_args = [FFMPEG, '-y']
    for p in parts:
        ff_args += ['-i', p]

    fc_in  = ''   # streams fed into concat
    extra  = []   # extra lavfi inputs for silence (appended after video inputs)
    si = n        # index of first silent-audio input
    for i, aud in enumerate(has_audio):
        if aud:
            fc_in += f'[{i}:v][{i}:a]'
        else:
            # Add a silent audio stream from lavfi
            ff_args += ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo']
            fc_in += f'[{i}:v][{si}:a]'
            si += 1

    fc = fc_in + f'concat=n={n}:v=1:a=1[v][a]'
    ff_args += ['-filter_complex', fc, '-map', '[v]', '-map', '[a]',
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', '128k', out]
    r = _ff(ff_args, timeout=300)
    if r.returncode != 0:
        raise RuntimeError('Concat failed:\n' + r.stderr.decode('utf-8', 'replace')[-600:])

# ─── Utilities ────────────────────────────────────────────────────────────────
def _ff(args, timeout=300): return subprocess.run(args, capture_output=True, timeout=timeout)

def get_dur(path):
    try:
        r = subprocess.run([FFPROBE,'-v','quiet','-print_format','json','-show_format',path],
                           capture_output=True, timeout=15)
        return float(json.loads(r.stdout)['format']['duration'])
    except: return 0.0

def _write_srt(segs, path):
    lines = []
    for i,s in enumerate(segs,1):
        def f(t): h=int(t//3600);m=int((t%3600)//60);sec=int(t%60);ms=int(round((t%1)*1000)); return f'{h:02d}:{m:02d}:{sec:02d},{ms:03d}'
        lines += [str(i), f'{f(s["start"])} --> {f(s["end"])}', s['text'], '']
    Path(path).write_text('\n'.join(lines), encoding='utf-8')

def _build_chunks(segs, total_dur, chunk_sec=10.0):
    if not segs:
        n = max(1, int(total_dur/chunk_sec))
        return [{'start':i*chunk_sec,'end':min((i+1)*chunk_sec,total_dur),'text':'','keywords':[]} for i in range(n)]
    chunks, cur_start, cur_texts, cur_end = [], segs[0]['start'], [], segs[0]['start']
    for s in segs:
        if s['end']-cur_start > chunk_sec and cur_texts:
            txt = ' '.join(cur_texts)
            chunks.append({'start':cur_start,'end':cur_end,'text':txt,'keywords':_kw(txt)})
            cur_start,cur_texts = s['start'],[]
        cur_texts.append(s['text']); cur_end = s['end']
    if cur_texts:
        txt = ' '.join(cur_texts)
        chunks.append({'start':cur_start,'end':total_dur,'text':txt,'keywords':_kw(txt)})
    return chunks

def _kw(text):
    words = re.findall(r'[a-zA-Z֐-׿]+', text.lower())
    freq = {}
    for w in words:
        if w not in STOPWORDS and len(w)>3: freq[w]=freq.get(w,0)+1
    return [w for w,_ in sorted(freq.items(),key=lambda x:-x[1])[:3]]

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5555))
    # Bind to 0.0.0.0 when running under a hosted env (Render, Docker, etc.);
    # keep 127.0.0.1 for local dev where binding the LAN is undesirable.
    host = '0.0.0.0' if os.environ.get('PORT') else '127.0.0.1'
    print(f'\n  V&V Video Editor  -->  http://{host}:{port}\n')
    app.run(debug=False, port=port, host=host, use_reloader=False, threaded=True)
