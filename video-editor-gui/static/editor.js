/* V&V Video Editor — Frontend JS v2 */
'use strict';

// ── Shortcuts ──────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ── DOM refs ──────────────────────────────────────────────────────────────
const mainVideo      = $('mainVideo');
const brollVideo     = $('brollVideo');
const panelUpper     = $('panelUpper');
const brollHint      = $('brollHint');
const playOverlay    = $('playOverlay');
const playCircle     = $('playCircle');
const subOverlay     = $('subOverlay');
const subDragHandle  = $('subDragHandle');
const subText        = $('subText');
const tovLayer       = $('tovLayer');
const previewScreen  = $('previewScreen');
const playPauseBtn   = $('playPauseBtn');
const ppTriangle     = $('ppTriangle');
const timeDisplay    = $('timeDisplay');
const scrubberTrack  = $('scrubberTrack');
const scrubberFill   = $('scrubberFill');
const scrubberHead   = $('scrubberHead');
const tlRuler        = $('tlRuler');
const mainTrack      = $('mainTrack');
const preloadVideo   = $('preloadVideo');
let preloadedPath    = null;   // tracks which path is currently warm in the preloader
const brollContainer = $('brollContainer');
const clipGrid       = $('clipGrid');
const categoryPills  = $('categoryPills');
const transcribeStatus = $('transcribeStatus');
const segmentList    = $('segmentList');
const textOverlayList= $('textOverlayList');
const exportStatus   = $('exportStatus');
const exportLink     = $('exportLink');

// ── App state ──────────────────────────────────────────────────────────────
let videoName    = null;
let videoDur     = 0;       // total Main timeline duration (sum across clips + gaps)
let mainClips    = [];      // [{id, path, abs_path, name, thumb, src_dur, in, out, timeline_start}]
let currentClipId= null;    // id of clip whose path is currently set as mainVideo.src
let segments     = [];
let wordTimings  = [];
let brollTracks  = [[]];
let textOverlays = [];
let subPos       = { x: 50, y: 88 };

// Karaoke settings
let karaokeWords = 4;
let subColor     = '#ffffff';
let subHlColor   = '#ffe050';
let subFontSize  = 20;

// ── Timeline zoom & scroll ──────────────────────────────────────────────────
let tlPps      = 4;      // px/s — default shows ~30s intervals on an 800px track
let tlZoom     = 1.0;
let tlFitMode  = false;  // true → auto-refit on resize
let timelineLength = 600; // canvas length in seconds (default: 10 min); ruler always spans this
let _syncingScroll = false;

// Effective canvas = whichever is larger: user-set canvas or actual video content
function effectiveTimelineDur() {
  return Math.max(timelineLength, videoDur || 0);
}

function timelineTrackInnerWidth() {
  return Math.max(50, Math.round(effectiveTimelineDur() * tlPps));
}

function recomputeFitPps() {
  const w = (mainTrack && mainTrack.offsetWidth) || 600;
  tlPps = (w / effectiveTimelineDur()) * tlZoom;
}

// Internal
let curBrollSrc    = '';
let transcribePoll = null;
let exportPoll     = null;
let currentDnD     = null;
let playheadEl     = null;
let selectedAnimOpt= 'none';

// Intro / Outro — intent flags (set immediately on drop/click) + paths (set after generation)
let introEnabled = false;  // user dropped/enabled intro on main track
let outroEnabled = false;  // user dropped/enabled outro on main track
let introPath    = null;   // URL path — set after successful FFmpeg generation
let outroPath    = null;

// Configurable intro/outro settings (mirrors backend)
let introCfg = { duration: 5.0, fade_in: 0.6, fade_out: 0.6, custom_media: null, use_default_brand: true,
                 audio_path: null, use_default_audio: true, audio_volume: 0.8 };
let outroCfg = { duration: 5.0, fade_in: 0.6, fade_out: 0.6, custom_media: null, use_default_brand: true,
                 audio_path: null, use_default_audio: true, audio_volume: 0.8 };

// Background replacement config
let backgroundCfg = { enabled: false, bg_path: null, softness: 0.3 };

// Sequential preview playback state
let playState = 'main';    // 'intro' | 'main' | 'outro'

// Live preview for text overlay modal
let livePreviewEl     = null;   // the .tov DOM element being previewed
let livePreviewOrigOv = null;   // deep-copy of the overlay before editing (for cancel restore)

// Animation intervals for "periodic" overlays in preview
const animIntervals = {};

// ══════════════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  enforcePanelSplit();
  loadConfig();
  loadCategories();
  loadClips();
  wireUI();
  applySubPos();
  renderTimeline();   // show empty 10-min ruler before any video loads
  loadServerState();
});

async function loadServerState() {
  const s = await api('/api/state');
  if (s.intro_cfg) Object.assign(introCfg, s.intro_cfg);
  if (s.outro_cfg) Object.assign(outroCfg, s.outro_cfg);
  if (s.background_cfg) Object.assign(backgroundCfg, s.background_cfg);
  applyIOCfgToUI('intro');
  applyIOCfgToUI('outro');
  applyBgCfgToUI();

  if (Array.isArray(s.main_clips) && s.main_clips.length) {
    mainClips = s.main_clips;
    videoDur  = s.duration || 0;
    videoName = s.video_name;
    segments  = s.segments     || [];
    wordTimings= s.word_timings|| [];
    brollTracks= s.broll_tracks|| [[]];
    textOverlays = s.text_overlays || [];
    if (s.sub_position) subPos = s.sub_position;
    loadMainClipSrc(mainClips[0]);
    $('uploadHint').innerHTML = `${mainClips.length} clip${mainClips.length>1?'s':''} on Main · ${fmtTime(videoDur)} <button class="btn-clear-video" id="clearVideoBtn" title="Remove video">✕</button>`;
    document.getElementById('clearVideoBtn').addEventListener('click', clearVideo);
    $('transcribeBtn').disabled = false;
    $('doExportBtn').disabled   = false;
    $('addClipBtn').hidden      = false;
    $('cutMainBtn').hidden      = false;
    renderTimeline();
    renderBrollTracks();
    renderTextOverlays();
    applySubPos();
    if (segments.length) renderSegments();
  }
}

// Panel sizing is handled by the inline <style> block in index.html
function enforcePanelSplit() { /* no-op — inline HTML <style> handles this */ }

// ══════════════════════════════════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════════════════════════════════
async function loadConfig() {
  const cfg = await api('/api/config');
  if (cfg.pexels_key_set) $('cfgPexels').placeholder = '••••• (key is set)';
  if (cfg.whisper_model)  $('cfgModel').value = cfg.whisper_model;
}

async function saveConfig() {
  await api('/api/config', 'POST', {
    pexels_key:    $('cfgPexels').value,
    whisper_model: $('cfgModel').value,
  });
  $('settingsModal').hidden = true;
}

// ══════════════════════════════════════════════════════════════════════════
//  WIRE UI
// ══════════════════════════════════════════════════════════════════════════
function wireUI() {
  // Upload (replaces) + Add Clip (appends)
  $('uploadBtn').onclick    = () => $('fileInput').click();
  $('fileInput').onchange   = e => handleUpload(e, false);
  $('addClipBtn').onclick   = () => $('addClipInput').click();
  $('addClipInput').onchange= e => handleUpload(e, true);
  $('cutMainBtn').onclick   = () => { if (cutMode) exitCutMode(); else enterCutMode(); };

  // Capture clicks on the Main track when in cut mode (priority over clip click handlers)
  mainTrack.addEventListener('click', e => {
    if (!cutMode) return;
    e.preventDefault(); e.stopPropagation();
    handleMainClickForCut(e);
  }, true);
  // Esc cancels cut mode
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && cutMode) { e.preventDefault(); exitCutMode(); setStatus('Cut mode cancelled.', 'info'); }
  });

  // Play / Pause
  playPauseBtn.onclick = togglePlay;
  playOverlay.onclick  = togglePlay;
  document.addEventListener('keydown', e => {
    if (['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)) return;
    if (e.target.isContentEditable) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); toggleFullscreen(); }
  });

  // Fullscreen
  $('fullscreenBtn').onclick = toggleFullscreen;

  // Video events
  mainVideo.addEventListener('timeupdate',     onTimeUpdate);
  mainVideo.addEventListener('play',           onVideoPlay);
  mainVideo.addEventListener('pause',          onVideoPause);
  mainVideo.addEventListener('ended',          onVideoEnded); // sequential: intro→main→outro
  mainVideo.addEventListener('loadedmetadata', () => {
    // Legacy single-clip fallback: only set videoDur from media duration if
    // no main_clips state exists. With multi-clip, videoDur = sum of all
    // clip durations (computed in recomputeDurationLocal / backend), and
    // mainVideo.duration is just the current source file's length — using
    // it here would clobber the correct timeline duration whenever the
    // source swaps between clips.
    if (!mainClips.length) {
      videoDur = mainVideo.duration;
      updateTimeDisplay(0);
      renderTimeline();
    }
  });

  wireScrubber();
  wireSubtitleDrag();
  wireTimelineDrag();

  // Tabs
  const TAB_TITLES = { transcript:'Transcript', text:'Text Overlays', style:'Style / Karaoke', 'intro-outro':'Intro & Outro', export:'Export' };
  document.querySelectorAll('.ptab').forEach(btn => {
    btn.onclick = () => {
      switchTab(btn.dataset.tab);
      $('ptabTitle').textContent = TAB_TITLES[btn.dataset.tab] || '';
    };
  });

  // Settings
  $('settingsBtn').onclick   = () => { $('settingsModal').hidden = false; };
  $('saveCfgBtn').onclick    = saveConfig;
  $('closeCfgBtn').onclick   = () => { $('settingsModal').hidden = true; };
  $('settingsModal').onclick = e => { if (e.target === $('settingsModal')) $('settingsModal').hidden = true; };

  // Text overlay modal
  $('addTextOverlayBtn').onclick = () => openTextModal(null);
  $('saveTeBtn').onclick   = saveTextOverlay;
  $('closeTeBtn').onclick  = () => {
    // Restore original styles on cancel
    if (livePreviewEl && livePreviewOrigOv) applyOverlayStyle(livePreviewEl, livePreviewOrigOv);
    livePreviewEl = null; livePreviewOrigOv = null;
    $('textEditModal').hidden = true;
  };
  $('deleteTeBtn').onclick = deleteTextOverlay;
  $('textEditModal').onclick = e => {
    if (e.target !== $('textEditModal')) return;
    if (livePreviewEl && livePreviewOrigOv) applyOverlayStyle(livePreviewEl, livePreviewOrigOv);
    livePreviewEl = null; livePreviewOrigOv = null;
    $('textEditModal').hidden = true;
  };

  // Live preview: wire all text-modal inputs so overlay updates in real-time
  ['teText','teFontFamily','teFontSize','teColor','teBold','teItalic',
   'teShadow','teBgColor','teBgOn','teOutline'].forEach(id => {
    const inp = $(id);
    if (!inp) return;
    inp.addEventListener('input',  doLivePreview);
    inp.addEventListener('change', doLivePreview);
  });

  // Animation grid
  document.querySelectorAll('.anim-opt').forEach(opt => {
    opt.onclick = () => {
      document.querySelectorAll('.anim-opt').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedAnimOpt = opt.dataset.anim;
      $('animPeriodRow').style.display = ['flash','periodic'].includes(selectedAnimOpt) ? 'flex' : 'none';
    };
  });

  // Transcribe / Export / Add Track
  $('transcribeBtn').onclick = () => { switchTab('transcript'); startTranscribe(); };
  $('doExportBtn').onclick   = () => { switchTab('export'); startExport(); };
  $('addTrackBtn').onclick   = addBrollTrack;

  // Main track — accept Intro / Outro drops (wired once here, not on every render)
  mainTrack.addEventListener('dragover', e => {
    if (currentDnD && (currentDnD.id === 'vv_intro' || currentDnD.id === 'vv_outro')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      mainTrack.classList.add('drag-over');
    }
  });
  mainTrack.addEventListener('dragleave', () => mainTrack.classList.remove('drag-over'));
  mainTrack.addEventListener('drop', e => {
    e.preventDefault();
    mainTrack.classList.remove('drag-over');
    if (!currentDnD) return;
    const ioType = currentDnD.id === 'vv_intro' ? 'intro'
                 : currentDnD.id === 'vv_outro' ? 'outro' : null;
    currentDnD = null;
    if (ioType) {
      // Show chip IMMEDIATELY (intent flag), then generate the file in the background
      if (ioType === 'intro') { introEnabled = true; $('expAddIntro').disabled = false; $('expAddIntro').checked = true; }
      else                    { outroEnabled = true; $('expAddOutro').disabled = false; $('expAddOutro').checked = true; }
      renderMainTrack();
      if (videoDur) renderIOTrack(); // instant visual feedback on I/O bar
      generateIntroOutro(ioType); // background generation — updates path + thumb when done
    }
  });

  // Intro/Outro — cards are draggable from the start (draggable="true" in HTML)
  // dragstart uses the already-generated path if available; otherwise path is null
  // and drop handlers will trigger generation automatically.
  $('introCard').addEventListener('dragstart', e => {
    currentDnD = { id: 'vv_intro', path: introPath, thumb: '', duration: 2 };
    e.dataTransfer.setData('text/plain', 'vv_intro');
  });
  $('outroCard').addEventListener('dragstart', e => {
    currentDnD = { id: 'vv_outro', path: outroPath, thumb: '', duration: 2 };
    e.dataTransfer.setData('text/plain', 'vv_outro');
  });

  // Click still generates as before
  $('introCard').onclick = () => generateIntroOutro('intro');
  $('outroCard').onclick = () => generateIntroOutro('outro');

  // ── Intro & Outro tab ──
  wireIOTab();

  // ── Timeframe tab ──
  wireTimeframeTab();

  // ── Background tab ──
  wireBackgroundTab();

  // Karaoke
  $('karaokeWords').addEventListener('input',   () => { karaokeWords = +$('karaokeWords').value; $('karaokeWordsVal').textContent = karaokeWords; });
  $('subColor').addEventListener('input',       () => { subColor   = $('subColor').value; });
  $('subHlColor').addEventListener('input',     () => { subHlColor = $('subHlColor').value; });
  $('subFontSize').addEventListener('input',    () => { subFontSize= +$('subFontSize').value; });

  // Search
  $('searchBtn').onclick = doSearch;
  $('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  // Custom B-Roll upload
  $('brollUploadBtn').onclick     = () => $('brollUploadInput').click();
  $('brollUploadInput').onchange  = uploadCustomBroll;

  window.addEventListener('resize', () => {
    if (tlFitMode) recomputeFitPps();
    renderTimeline();
  });

  // Timeline zoom + scroll buttons
  $('tlZoomInBtn').onclick     = () => zoomTimeline(1.5);
  $('tlZoomOutBtn').onclick    = () => zoomTimeline(1/1.5);
  $('tlZoomFitBtn').onclick    = () => { tlFitMode = true; tlZoom = 1.0; recomputeFitPps(); renderTimeline(); };
  $('tlScrollLeftBtn').onclick = () => scrollTimelineBy(-200);
  $('tlScrollRightBtn').onclick= () => scrollTimelineBy( 200);

  // Sync horizontal scroll across all timeline tracks
  document.addEventListener('scroll', e => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (!t.classList.contains('tl-track') && !t.classList.contains('tl-ruler')) return;
    syncScrollFrom(t);
  }, true);

  // Ctrl+wheel zoom
  $('tlRows').addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    zoomTimeline(e.deltaY < 0 ? 1.2 : 1/1.2);
  }, { passive: false });
}

function syncScrollFrom(src) {
  if (_syncingScroll) return;
  _syncingScroll = true;
  const sl = src.scrollLeft;
  document.querySelectorAll('.tl-track, .tl-ruler').forEach(t => {
    if (t !== src) t.scrollLeft = sl;
  });
  _syncingScroll = false;
}

function zoomTimeline(factor) {
  tlFitMode = false;
  tlZoom *= factor;
  tlPps *= factor;
  tlPps = Math.max(0.5, Math.min(400, tlPps));
  renderTimeline();
  if (videoDur) {
    const t = getTimelineTime();
    const targetLeft = Math.max(0, t * tlPps - mainTrack.offsetWidth / 2);
    document.querySelectorAll('.tl-track, .tl-ruler').forEach(el => el.scrollLeft = targetLeft);
  }
}

function scrollTimelineBy(dx) {
  document.querySelectorAll('.tl-track, .tl-ruler').forEach(el => {
    el.scrollLeft = Math.max(0, el.scrollLeft + dx);
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  UPLOAD
// ══════════════════════════════════════════════════════════════════════════
async function handleUpload(e, append) {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('video', file);
  fd.append('append', append ? '1' : '0');
  setStatus(append ? 'Appending clip…' : 'Uploading…', 'info');
  $('uploadHint').textContent = append ? 'Appending clip…' : 'Uploading…';

  try {
    const res  = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    mainClips = data.main_clips || [];
    videoDur  = data.duration;

    if (!append) {
      // First/replacing upload — set source video and reset state
      videoName = data.filename;
      segments = []; wordTimings = []; brollTracks = [[]]; textOverlays = [];
      subPos = { x:50, y:88 }; curBrollSrc = '';
      introPath = null; outroPath = null;
      introEnabled = false; outroEnabled = false;
      playState = 'main';
      segmentList.innerHTML = '';
      const c0 = mainClips[0];
      loadMainClipSrc(c0);
      $('uploadHint').innerHTML = `${data.filename} <button class="btn-clear-video" id="clearVideoBtn" title="Remove video">✕</button>`;
      document.getElementById('clearVideoBtn').addEventListener('click', clearVideo);
    } else {
      $('uploadHint').textContent = `${mainClips.length} clip${mainClips.length>1?'s':''} on Main · ${fmtTime(videoDur)}`;
    }

    // Scroll to beginning; keep current scale
    document.querySelectorAll('.tl-track, .tl-ruler').forEach(el => el.scrollLeft = 0);

    setStatus(`Loaded · ${mainClips.length} clip${mainClips.length>1?'s':''} · ${fmtTime(videoDur)}`, 'success');
    $('transcribeBtn').disabled = false;
    $('doExportBtn').disabled   = false;
    $('addClipBtn').hidden      = false;
    $('cutMainBtn').hidden      = false;

    renderBrollTracks(); renderTimeline(); renderTextOverlays(); applySubPos();
    if (!append) subText.innerHTML = '';
  } catch(err) {
    setStatus('Upload error: ' + err.message, 'error');
    $('uploadHint').textContent = 'Upload failed — try again';
    if (videoName) {
      $('transcribeBtn').disabled = false;
      $('doExportBtn').disabled   = false;
    }
  }
  e.target.value = '';
}

// Set mainVideo source to a specific clip's media file
function loadMainClipSrc(clip) {
  if (!clip) return;
  const samePath = mainVideo.src && mainVideo.src.endsWith(clip.path);
  currentClipId = clip.id;
  if (samePath) return; // already loaded — no reload needed, callers will just set currentTime
  mainVideo.src = clip.path;
  mainVideo.load();
  const mainBg = document.getElementById('mainVideoBg');
  if (mainBg) { mainBg.src = clip.path; mainBg.load(); }
}

// ── Multi-clip timeline helpers ────────────────────────────────────────────
function clipById(id) { return mainClips.find(c => c.id === id) || null; }
function activeClip() { return clipById(currentClipId); }

// Find which main clip contains timeline time t (or null if t is in a gap)
function findClipAt(t) {
  for (const c of mainClips) {
    const ce = c.timeline_start + (c.out - c.in);
    if (c.timeline_start <= t && t < ce - 0.001) return c;
  }
  return null;
}

// Next clip whose timeline_start >= t (used to skip gaps)
function nextClipAfter(t) {
  let best = null;
  for (const c of mainClips) {
    if (c.timeline_start >= t - 0.001 && (!best || c.timeline_start < best.timeline_start))
      best = c;
  }
  return best;
}

// Convert media time (mainVideo.currentTime) within the active clip → timeline time
function getTimelineTime() {
  const c = activeClip();
  if (!c) return 0;
  const within = Math.max(0, mainVideo.currentTime - c.in);
  return c.timeline_start + within;
}

// Seek the main video to a given timeline time (handles clip switching + gaps).
// If autoPlay=true, plays after the new clip's metadata loads.
function seekTimeline(t, autoPlay) {
  t = Math.max(0, Math.min(videoDur, t));
  let c = findClipAt(t);
  if (!c) {
    c = nextClipAfter(t);
    if (!c) {
      mainVideo.pause();
      updateScrubber(videoDur);
      updateTimeDisplay(videoDur);
      return;
    }
    t = c.timeline_start;
  }
  const mediaTime = c.in + (t - c.timeline_start);
  const sameSource = mainVideo.src && mainVideo.src.endsWith(c.path);
  const needsLoad  = currentClipId !== c.id && !sameSource;
  // Update id so subsequent activeClip() resolves to the new clip
  currentClipId = c.id;
  if (needsLoad) {
    loadMainClipSrc(c);
    mainVideo.addEventListener('loadedmetadata', function onLM() {
      mainVideo.removeEventListener('loadedmetadata', onLM);
      mainVideo.currentTime = mediaTime;
      if (autoPlay) mainVideo.play().catch(()=>{});
    }, { once: true });
  } else {
    // Same source file (or just same clip) — instant seek, no buffering pause
    if (Math.abs(mainVideo.currentTime - mediaTime) > 0.01) mainVideo.currentTime = mediaTime;
    if (autoPlay && mainVideo.paused) mainVideo.play().catch(()=>{});
  }
}

function clearVideo() {
  videoName = null; videoDur = 0; playState = 'main';
  mainClips = []; currentClipId = null;
  $('addClipBtn').hidden = true;
  $('cutMainBtn').hidden = true;
  mainVideo.src = ''; mainVideo.load();
  brollVideo.src = ''; brollVideo.loop = true; curBrollSrc = '';
  const mainBg  = document.getElementById('mainVideoBg');
  const brollBg = document.getElementById('brollVideoBg');
  if (mainBg)  { mainBg.src  = ''; mainBg.load();  }
  if (brollBg) { brollBg.src = ''; brollBg.load(); }
  brollHint.style.display = ''; brollVideo.style.display = 'none';
  segments = []; wordTimings = []; brollTracks = [[]]; textOverlays = [];
  subPos = { x:50, y:88 };
  introEnabled = false; outroEnabled = false; introPath = null; outroPath = null;
  $('transcribeBtn').disabled = true;
  $('doExportBtn').disabled   = true;
  $('uploadHint').textContent = 'Drop a video file or click Upload';
  $('ioStatus').textContent   = '';
  // Reset intro/outro thumbnails back to placeholder
  const it = $('introThumb');
  if (it) it.outerHTML = `<div class="io-card-placeholder" id="introThumb">🎬</div>`;
  const ot = $('outroThumb');
  if (ot) ot.outerHTML = `<div class="io-card-placeholder" id="outroThumb">🎬</div>`;
  segmentList.innerHTML = '';
  renderBrollTracks(); renderTimeline(); renderTextOverlays(); applySubPos();
  subText.innerHTML = '';
}

// ══════════════════════════════════════════════════════════════════════════
//  PLAY / PAUSE
// ══════════════════════════════════════════════════════════════════════════
function toggleFullscreen() {
  const el = previewScreen;
  const isFs = document.fullscreenElement || document.webkitFullscreenElement;
  if (isFs) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else {
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  }
}

function togglePlay() {
  if (!videoName && !mainClips.length) return;
  if (mainVideo.paused) {
    // If at the very start of the timeline AND intro is ready, prepend intro
    const tt = getTimelineTime();
    if (playState === 'main' && tt < 0.05 && introEnabled && introPath) {
      switchClipAndPlay('intro', 0);
    } else {
      mainVideo.play().catch(() => {});
    }
  } else {
    mainVideo.pause();
    brollVideo.pause();
  }
}

function onVideoPlay() {
  ppTriangle.setAttribute('points','5,4 9,4 9,20 15,4 19,4 19,20');
  playPauseBtn.classList.add('playing');
  playCircle.classList.add('hidden');
  // Restart animations
  textOverlays.forEach(ov => {
    const el = $('tov_' + ov.id);
    if (el) triggerAnimation(el, ov);
  });
  startBoundaryWatcher();
}

function onVideoPause() {
  ppTriangle.setAttribute('points','6,4 20,12 6,20');
  playPauseBtn.classList.remove('playing');
  playCircle.classList.remove('hidden');
  brollVideo.pause();
  stopBoundaryWatcher();
}

// rAF-driven clip-boundary watcher — runs only while playing main clips.
// `timeupdate` fires every ~250ms which can leave a visible pause at clip ends;
// rAF fires every frame (~16ms) so we detect c.out crossing within a frame.
let _boundaryRaf = 0;
function startBoundaryWatcher() {
  if (_boundaryRaf) return;
  const tick = () => {
    _boundaryRaf = 0;
    if (mainVideo.paused || playState !== 'main') return;
    const c = activeClip();
    if (c && mainVideo.currentTime >= c.out - 0.04) {
      onTimeUpdate();  // reuses the same boundary-handling logic
    }
    _boundaryRaf = requestAnimationFrame(tick);
  };
  _boundaryRaf = requestAnimationFrame(tick);
}
function stopBoundaryWatcher() {
  if (_boundaryRaf) { cancelAnimationFrame(_boundaryRaf); _boundaryRaf = 0; }
}

// ── Sequential clip switching (intro → main → outro) ──────────────────────
function switchClipAndPlay(type, at) {
  at = at || 0;
  playState = type;

  if (type !== 'main') {
    // ── Intro / Outro: expand upper panel to cover BOTH panels (full height) ──
    panelUpper.classList.add('io-expand');
    brollVideo.pause();
    subText.innerHTML = '';  // clear karaoke — subtitles belong to main clips only
    const src = type === 'intro' ? introPath : outroPath;
    const bg  = document.getElementById('mainVideoBg');
    mainVideo.src = src;
    if (bg) { bg.src = src; bg.load(); }
    mainVideo.load();
    mainVideo.addEventListener('loadedmetadata', function onLM() {
      mainVideo.removeEventListener('loadedmetadata', onLM);
      mainVideo.currentTime = at;
      mainVideo.play().catch(() => {});
    }, { once: true });
    return;
  }

  // ── Back to main: restore split layout and use multi-clip seek ──
  panelUpper.classList.remove('io-expand');
  brollVideo.loop = true;
  brollVideo.src  = ''; curBrollSrc = '';
  brollHint.style.display = ''; brollVideo.style.display = 'none';
  currentClipId = null; // force reload of correct clip
  seekTimeline(at);
  // Play after the seek's loadedmetadata handler kicks in
  mainVideo.addEventListener('loadedmetadata', function onLM() {
    mainVideo.removeEventListener('loadedmetadata', onLM);
    mainVideo.play().catch(()=>{});
  }, { once: true });
}

function onVideoEnded() {
  if (playState === 'intro') {
    switchClipAndPlay('main', 0);
  } else if (playState === 'main') {
    // Reached end of current clip's source media — try next clip
    const c = activeClip();
    if (c) {
      const next = nextClipAfter(c.timeline_start + (c.out - c.in));
      if (next) {
        seekTimeline(next.timeline_start, /*autoPlay=*/true);
        return;
      }
    }
    // No next clip → outro if enabled, else stop
    if (outroEnabled && outroPath) {
      switchClipAndPlay('outro', 0);
    } else {
      onVideoPause();
    }
  } else {
    // Outro done → collapse back to split-screen, reload first main clip
    panelUpper.classList.remove('io-expand');
    playState = 'main';
    if (mainClips[0]) loadMainClipSrc(mainClips[0]);
    brollVideo.loop = true; brollVideo.src = ''; curBrollSrc = '';
    brollHint.style.display = ''; brollVideo.style.display = 'none';
    onVideoPause();
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  TIME UPDATE
// ══════════════════════════════════════════════════════════════════════════
function onTimeUpdate() {
  if (playState !== 'main') {
    // During intro / outro: upper panel is full-screen; freeze scrubber at edges
    const t = mainVideo.currentTime;
    updateScrubber(playState === 'intro' ? 0 : videoDur);
    updateTimeDisplay(t);
    updatePlayhead(playState === 'intro' ? 0 : videoDur);
    subText.innerHTML = '';  // keep subtitle cleared during intro/outro
    return;
  }

  // Main playback — translate media time → timeline time via active clip
  const c = activeClip();
  if (!c) return;
  const cdur    = c.out - c.in;
  const clipEnd = c.timeline_start + cdur;

  // Within 2s of clip end → warm up the next clip's source in the hidden preloader.
  // This primes the HTTP cache + decoder so the upcoming seek is near-instant.
  if (!mainVideo.paused && mainVideo.currentTime >= c.out - 2.0) {
    const upcoming = nextClipAfter(clipEnd);
    if (upcoming && upcoming.path && upcoming.path !== c.path && preloadedPath !== upcoming.path) {
      preloadedPath = upcoming.path;
      preloadVideo.src = upcoming.path;
      preloadVideo.load();
    }
  }

  // Reached end of active clip's trimmed range → advance to next clip (or stop)
  if (mainVideo.currentTime >= c.out - 0.04) {
    const wasPlaying = !mainVideo.paused;
    const next = nextClipAfter(clipEnd);
    if (next) {
      seekTimeline(next.timeline_start, wasPlaying);
    } else if (outroEnabled && outroPath && wasPlaying) {
      switchClipAndPlay('outro', 0);
    } else {
      mainVideo.pause();
    }
    return;
  }

  const t = getTimelineTime();
  updateScrubber(t);
  updateTimeDisplay(t);
  updateKaraoke(t);
  syncBroll(t);
  updatePlayhead(t);
}

function updateTimeDisplay(t) {
  if (playState === 'intro') {
    timeDisplay.textContent = `◀ ${fmtTime(t)} / ${fmtTime(introCfg.duration)}`;
  } else if (playState === 'outro') {
    timeDisplay.textContent = `▶ ${fmtTime(t)} / ${fmtTime(outroCfg.duration)}`;
  } else {
    timeDisplay.textContent = `${fmtTime(t)} / ${fmtTime(videoDur)}`;
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  SCRUBBER
// ══════════════════════════════════════════════════════════════════════════
function wireScrubber() {
  let dragging = false;
  const seek = e => {
    if (!videoDur) return;
    const rect = scrubberTrack.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTimeline(pct * videoDur);
  };
  scrubberTrack.addEventListener('mousedown', e => { dragging = true; seek(e); });
  document.addEventListener('mousemove', e => { if (dragging) seek(e); });
  document.addEventListener('mouseup',   ()  => { dragging = false; });
}

function updateScrubber(t) {
  if (!videoDur) return;
  const pct = (t / videoDur) * 100;
  scrubberFill.style.width = pct + '%';
  scrubberHead.style.left  = pct + '%';
}

// ══════════════════════════════════════════════════════════════════════════
//  DRAGGABLE TIMELINE PLAYHEAD  (feature: drag red cursor)
// ══════════════════════════════════════════════════════════════════════════
function rulerXToTime(ev) {
  const rect = tlRuler.getBoundingClientRect();
  const xInRuler = (ev.clientX - rect.left) + tlRuler.scrollLeft;
  return Math.max(0, Math.min(videoDur, xInRuler / tlPps));
}

function wireTimelineDrag() {
  // Drag the playhead / click to seek (single handler — no double-handler)
  tlRuler.addEventListener('mousedown', e => {
    if (!videoDur) return;
    let dragging = true;
    const doSeek = ev => seekTimeline(rulerXToTime(ev));
    doSeek(e);
    const mm = ev => { if (dragging) doSeek(ev); };
    const mu = ()  => { dragging = false; document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
    document.addEventListener('mousemove', mm);
    document.addEventListener('mouseup',   mu);
  });
}

function updatePlayhead(t) {
  if (!playheadEl || !videoDur) return;
  playheadEl.style.left = (t * tlPps) + 'px';
  document.querySelectorAll('.ph-ext').forEach(el => {
    el.style.left = (t * tlPps) + 'px';
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  KARAOKE
// ══════════════════════════════════════════════════════════════════════════
function updateKaraoke(t) {
  if (!wordTimings.length) { subText.innerHTML = ''; return; }
  let curIdx = -1;
  for (let i = 0; i < wordTimings.length; i++) {
    if (t >= wordTimings[i].start && t < wordTimings[i].end) { curIdx = i; break; }
  }
  if (curIdx < 0) {
    for (let i = 0; i < wordTimings.length; i++) {
      if (t < wordTimings[i].start) { curIdx = i; break; }
    }
    if (curIdx < 0) { subText.innerHTML = ''; return; }
  }
  const half     = Math.floor(karaokeWords / 2);
  let   winStart = Math.max(0, curIdx - half);
  let   winEnd   = Math.min(wordTimings.length - 1, winStart + karaokeWords - 1);
  winStart       = Math.max(0, winEnd - karaokeWords + 1);
  subText.style.fontSize = subFontSize + 'px';
  subText.innerHTML = '';
  for (let i = winStart; i <= winEnd; i++) {
    const span = document.createElement('span');
    span.className   = 'kw-word' + (i === curIdx ? ' kw-active' : '');
    span.textContent = wordTimings[i].word + ' ';
    span.style.color = (i === curIdx) ? subHlColor : subColor;
    if (i === curIdx) span.style.textShadow = `0 0 14px ${subHlColor}99`;
    subText.appendChild(span);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  B-ROLL SYNC
// ══════════════════════════════════════════════════════════════════════════
function syncBroll(t) {
  let activeClip = null, highestTrack = -1;
  for (let ti = 0; ti < brollTracks.length; ti++) {
    for (const clip of brollTracks[ti]) {
      if (clip.path && clip.start <= t && t < clip.end && ti > highestTrack) {
        activeClip = clip; highestTrack = ti;
      }
    }
  }
  if (!activeClip) {
    brollHint.style.display = ''; brollVideo.style.display = 'none'; brollVideo.pause(); return;
  }
  brollHint.style.display = 'none'; brollVideo.style.display = '';
  const wantSrc = activeClip.path;
  if (curBrollSrc !== wantSrc) {
    curBrollSrc = wantSrc; brollVideo.src = wantSrc; brollVideo.load();
    // sync blurred background
    const brollBg = document.getElementById('brollVideoBg');
    if (brollBg) { brollBg.src = wantSrc; brollBg.load(); }
    brollVideo.onloadedmetadata = () => seekBroll(activeClip, t);
  } else {
    seekBroll(activeClip, t);
  }
}
function seekBroll(clip, t) {
  const bd = brollVideo.duration;
  if (!bd || !isFinite(bd)) return;
  const ct = (t - clip.start) % bd;
  if (Math.abs(brollVideo.currentTime - ct) > 0.4) brollVideo.currentTime = ct;
  if (!mainVideo.paused && brollVideo.paused) brollVideo.play().catch(() => {});
}

// ══════════════════════════════════════════════════════════════════════════
//  SUBTITLE DRAG
// ══════════════════════════════════════════════════════════════════════════
function wireSubtitleDrag() {
  let dragging = false, startMX, startMY, startPX, startPY;

  // Drag on the ENTIRE subtitle overlay (not just the tiny handle)
  subOverlay.addEventListener('mousedown', e => {
    dragging = true;
    startMX = e.clientX; startMY = e.clientY;
    startPX = subPos.x;  startPY = subPos.y;
    subOverlay.style.cursor = 'grabbing';
    e.preventDefault(); e.stopPropagation();
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const r = previewScreen.getBoundingClientRect();
    subPos.x = Math.max(2, Math.min(98, startPX + (e.clientX - startMX) / r.width  * 100));
    subPos.y = Math.max(2, Math.min(98, startPY + (e.clientY - startMY) / r.height * 100));
    applySubPos();
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    subOverlay.style.cursor = 'grab';
    api('/api/sub-position', 'POST', subPos);
  });
}
function applySubPos() {
  subOverlay.style.left = subPos.x + '%';
  subOverlay.style.top  = subPos.y + '%';
}

// ══════════════════════════════════════════════════════════════════════════
//  TEXT OVERLAYS
// ══════════════════════════════════════════════════════════════════════════
function renderTextOverlays() {
  // Clear animation intervals
  Object.values(animIntervals).forEach(id => clearInterval(id));
  Object.keys(animIntervals).forEach(k => delete animIntervals[k]);

  tovLayer.innerHTML       = '';
  textOverlayList.innerHTML = '';

  if (!textOverlays.length) {
    textOverlayList.innerHTML = '<div class="ov-empty">No overlays yet</div>';
    return;
  }

  textOverlays.forEach(ov => {
    const el = document.createElement(ov.url ? 'a' : 'div');
    el.className  = 'tov' + (ov.url ? ' has-link' : '');
    el.id         = 'tov_' + ov.id;
    el.style.left = ov.x + '%';
    el.style.top  = ov.y + '%';
    if (ov.url) {
      el.href   = ov.url;
      el.target = '_blank';
      el.rel    = 'noopener';
    }
    applyOverlayStyle(el, ov);
    wireOverlayDrag(el, ov);
    el.addEventListener('dblclick', e => { e.stopPropagation(); e.preventDefault(); openTextModal(ov); });
    tovLayer.appendChild(el);

    // List item
    const li = document.createElement('div');
    li.className = 'ov-item';
    li.innerHTML =
      `<span class="ov-label">${escHtml(ov.text.slice(0,22))}${ov.text.length>22?'…':''}</span>
       <button class="btn btn-sm btn-ghost" data-edit="${ov.id}">Edit</button>
       <button class="btn btn-sm btn-danger" data-del="${ov.id}">✕</button>`;
    li.querySelector('[data-edit]').onclick = () => openTextModal(ov);
    li.querySelector('[data-del]').onclick  = async () => {
      await api('/api/text-overlay/' + ov.id, 'DELETE');
      textOverlays = textOverlays.filter(o => o.id !== ov.id);
      renderTextOverlays();
    };
    textOverlayList.appendChild(li);
  });
}

function hexToRgba(hex, alpha = 1) {
  const h = hex.replace('#','');
  if (h.length < 6) return `rgba(0,0,0,${alpha})`;
  const r = parseInt(h.slice(0,2),16);
  const g = parseInt(h.slice(2,4),16);
  const b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function applyOverlayStyle(el, ov) {
  el.textContent       = ov.text;
  el.style.fontSize    = ov.fontSize + 'px';
  el.style.color       = ov.color;
  el.style.fontFamily  = ov.fontFamily || 'Arial';
  el.style.fontWeight  = ov.bold   ? 'bold'   : 'normal';
  el.style.fontStyle   = ov.italic ? 'italic' : 'normal';
  el.style.textShadow  = ov.shadow ? '1px 1px 5px #000, -1px -1px 5px #000' : 'none';
  el.style.webkitTextStroke = ov.outline ? `${ov.outline}px #000` : '';
  // Background — use rgba for reliable cross-browser support
  if (ov.bgColor) {
    el.style.background = hexToRgba(ov.bgColor, 0.85);
    el.style.padding    = '3px 9px';
  } else {
    el.style.background = 'transparent';
    el.style.padding    = '2px 7px';
  }
}

// Live-preview: updates both the in-modal preview box and the canvas overlay
function doLivePreview() {
  const data = {
    text:       $('teText').value || 'Preview Text',
    fontSize:   +$('teFontSize').value,
    fontFamily: $('teFontFamily').value,
    color:      $('teColor').value,
    bold:       $('teBold').checked,
    italic:     $('teItalic').checked,
    shadow:     $('teShadow').checked,
    bgColor:    $('teBgOn').checked ? $('teBgColor').value : '',
    outline:    +$('teOutline').value,
  };
  // Always update the in-modal preview box (always visible regardless of modal position)
  const previewInner = $('tePreviewInner');
  if (previewInner) applyOverlayStyle(previewInner, data);
  // Also update the canvas overlay (if it exists)
  if (livePreviewEl) applyOverlayStyle(livePreviewEl, data);
}

function triggerAnimation(el, ov) {
  // Remove previous animation class
  el.classList.remove(
    'tov-anim-fade','tov-anim-slideLeft','tov-anim-slideRight',
    'tov-anim-slideUp','tov-anim-zoom','tov-anim-bounce','tov-anim-flash','tov-anim-periodic'
  );
  const anim   = ov.animation || 'none';
  const period = Math.max(0.5, ov.animPeriod || 3);

  if (anim === 'none') return;

  if (anim === 'flash' || anim === 'periodic') {
    el.style.setProperty('--anim-period', period + 's');
    el.classList.add('tov-anim-' + anim);
  } else {
    // One-shot animations — re-trigger by removing/adding class
    void el.offsetWidth; // reflow
    el.classList.add('tov-anim-' + anim);
  }
}

function wireOverlayDrag(el, ov) {
  let didDrag = false;

  el.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    let dragging = true; didDrag = false;
    const startMX = e.clientX, startMY = e.clientY;
    const startOX = ov.x,      startOY = ov.y;
    el.classList.add('dragging');
    e.preventDefault(); e.stopPropagation();

    // Use panelUpper bounds — overlays live inside tov-layer which fills panelUpper
    const mm = e2 => {
      if (!dragging) return;
      const r  = panelUpper.getBoundingClientRect();
      const nx = Math.max(0, Math.min(95, startOX + (e2.clientX - startMX) / r.width  * 100));
      const ny = Math.max(0, Math.min(95, startOY + (e2.clientY - startMY) / r.height * 100));
      if (Math.abs(nx - startOX) > 0.3 || Math.abs(ny - startOY) > 0.3) didDrag = true;
      ov.x = nx; ov.y = ny;
      el.style.left = nx + '%';
      el.style.top  = ny + '%';
    };

    const mu = async () => {
      dragging = false;
      el.classList.remove('dragging');
      document.removeEventListener('mousemove', mm);
      document.removeEventListener('mouseup',   mu);
      if (didDrag) await api('/api/text-overlay', 'POST', ov);
    };

    document.addEventListener('mousemove', mm);
    document.addEventListener('mouseup',   mu);
  });

  // For link overlays: cancel navigation when the user dragged (didn't click)
  if (el.tagName === 'A') {
    el.addEventListener('click', e => { if (didDrag) { e.preventDefault(); didDrag = false; } });
  }
}

function openTextModal(ov) {
  $('teId').value        = ov ? ov.id          : '';
  $('teText').value      = ov ? ov.text         : 'Vision & Virtue';
  $('teFontFamily').value= ov ? (ov.fontFamily||'Arial') : 'Arial';
  $('teFontSize').value  = ov ? ov.fontSize     : 36;
  $('teColor').value     = ov ? ov.color        : '#ffffff';
  $('teBold').checked    = ov ? ov.bold         : true;
  $('teItalic').checked  = ov ? ov.italic       : false;
  $('teShadow').checked  = ov ? ov.shadow       : true;
  $('teBgColor').value   = ov ? (ov.bgColor||'#000000') : '#000000';
  $('teBgOn').checked    = ov ? !!ov.bgColor    : false;
  $('teOutline').value   = ov ? ov.outline      : 2;
  $('teUrl').value       = ov ? (ov.url||'')    : '';
  $('teAnimPeriod').value= ov ? (ov.animPeriod||3) : 3;

  // Animation selection
  const animVal = ov ? (ov.animation || 'none') : 'none';
  selectedAnimOpt = animVal;
  document.querySelectorAll('.anim-opt').forEach(o => {
    o.classList.toggle('selected', o.dataset.anim === animVal);
  });
  $('animPeriodRow').style.display = ['flash','periodic'].includes(animVal) ? 'flex' : 'none';

  $('deleteTeBtn').hidden   = !ov;
  $('textEditModal').hidden = false;

  // Set up live preview reference
  livePreviewEl     = ov ? $('tov_' + ov.id) : null;
  livePreviewOrigOv = ov ? JSON.parse(JSON.stringify(ov)) : null;

  // Populate in-modal preview box immediately
  doLivePreview();
}

async function saveTextOverlay() {
  const id       = $('teId').value || null;
  const existing = id ? textOverlays.find(o => o.id === id) : null;
  const data = {
    id,
    text:       $('teText').value || 'Text',
    x:          existing ? existing.x : 50,
    y:          existing ? existing.y : 15,
    fontSize:   +$('teFontSize').value,
    fontFamily: $('teFontFamily').value,
    color:      $('teColor').value,
    bold:       $('teBold').checked,
    italic:     $('teItalic').checked,
    shadow:     $('teShadow').checked,
    bgColor:    $('teBgOn').checked ? $('teBgColor').value : '',
    outline:    +$('teOutline').value,
    url:        $('teUrl').value.trim(),
    animation:  selectedAnimOpt,
    animPeriod: +$('teAnimPeriod').value,
  };
  const result = await api('/api/text-overlay', 'POST', data);
  if (result.overlay) {
    const idx = textOverlays.findIndex(o => o.id === result.overlay.id);
    if (idx >= 0) textOverlays[idx] = result.overlay;
    else          textOverlays.push(result.overlay);
  }
  livePreviewEl = null; livePreviewOrigOv = null;
  $('textEditModal').hidden = true;
  renderTextOverlays();
}

async function deleteTextOverlay() {
  const id = $('teId').value;
  if (!id) return;
  await api('/api/text-overlay/' + id, 'DELETE');
  textOverlays = textOverlays.filter(o => o.id !== id);
  livePreviewEl = null; livePreviewOrigOv = null;
  $('textEditModal').hidden = true;
  renderTextOverlays();
}

// ══════════════════════════════════════════════════════════════════════════
//  TIMELINE
// ══════════════════════════════════════════════════════════════════════════
function renderTimeline() {
  if (tlFitMode) recomputeFitPps();
  renderRuler();
  renderMainTrack();
  renderBrollTracks();
  if (videoDur) renderIOTrack();
  syncAllTrackWidths();
  updateTimelineHeight();
}

// Grow the timeline area to fit all visible rows so every B-roll track
// is reachable for drop / interaction. Capped to avoid eating the preview.
function updateTimelineHeight() {
  const rowH      = 38;
  const rulerH    = 28;
  const footerH   = 38;
  const ioVisible = !!(introEnabled || outroEnabled || introPath || outroPath);
  const rows      = (ioVisible ? 1 : 0) + 1 /* main */ + Math.max(1, brollTracks.length);
  const wanted    = rulerH + (rows * rowH) + footerH;
  const tl        = document.querySelector('.timeline-area');
  if (!tl) return;
  // Hard cap so we don't squeeze the preview entirely
  const capped    = Math.min(wanted, Math.round(window.innerHeight * 0.55));
  tl.style.height = capped + 'px';
}

function syncAllTrackWidths() {
  // Apply inner-width to ruler + each track via a spacer
  document.querySelectorAll('.tl-spacer').forEach(sp => {
    sp.style.width = timelineTrackInnerWidth() + 'px';
  });
}

function renderRuler() {
  tlRuler.innerHTML = '';
  const eff    = effectiveTimelineDur();
  const innerW = timelineTrackInnerWidth();
  // spacer to drive scroll width
  const spacer = document.createElement('div');
  spacer.className = 'tl-spacer';
  spacer.style.width = innerW + 'px';
  tlRuler.appendChild(spacer);
  // ticks span the full canvas length (not just video duration)
  const step = niceStep(eff, Math.max(2, Math.floor(innerW / 65)));
  for (let t = 0; t <= eff + 0.01; t += step) {
    const tick = document.createElement('div');
    tick.className  = 'ruler-tick';
    tick.style.left = (t * tlPps) + 'px';
    tick.innerHTML  = `<span>${fmtTime(t)}</span>`;
    tlRuler.appendChild(tick);
  }
  // Playhead
  if (!playheadEl) {
    playheadEl = document.createElement('div');
    playheadEl.className = 'tl-playhead';
  }
  tlRuler.appendChild(playheadEl);
}

function niceStep(dur, maxTicks) {
  for (const s of [0.5,1,2,5,10,15,30,60,120,300,600]) if (dur/s <= maxTicks) return s;
  return Math.ceil(dur / maxTicks);
}

function renderMainTrack() {
  mainTrack.innerHTML = '';
  // Spacer always present so Main track scrolls in sync with the ruler
  const sp = document.createElement('div');
  sp.className = 'tl-spacer';
  sp.style.width = timelineTrackInnerWidth() + 'px';
  mainTrack.appendChild(sp);
  if (!videoDur) return;
  mainClips.forEach((clip, ci) => {
    mainTrack.appendChild(makeMainClipEl(clip, ci));
  });
}

function makeMainClipEl(clip, ci) {
  const el = document.createElement('div');
  el.className = 'main-clip';
  el.dataset.clipId = clip.id;

  const reposition = () => {
    const clipDur = Math.max(0.05, clip.out - clip.in);
    el.style.left  = (clip.timeline_start * tlPps) + 'px';
    el.style.width = Math.max(24, clipDur * tlPps) + 'px';
  };
  reposition();

  const shortName = (clip.name || clip.path || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  el.innerHTML = `
    <div class="rh rh-l"></div>
    <div class="clip-inner">
      ${clip.thumb ? `<img src="${clip.thumb}" class="clip-th">` : ''}
      <span class="clip-nm">${escHtml(shortName)}</span>
    </div>
    <div class="rh rh-r"></div>
    <button class="clip-remove" title="Remove clip">✕</button>`;

  // Remove
  el.querySelector('.clip-remove').addEventListener('click', async e => {
    e.stopPropagation();
    await api('/api/main-clips/' + clip.id, 'DELETE');
    mainClips = mainClips.filter(c => c.id !== clip.id);
    recomputeDurationLocal();
    renderTimeline();
  });

  // Left resize: trim source-in (keeps timeline_start fixed)
  el.querySelector('.rh-l').addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX;
    const origIn  = clip.in;
    const origOut = clip.out;
    const mm = e2 => {
      const dxSec = (e2.clientX - sx) / tlPps;
      clip.in = Math.max(0, Math.min(origOut - 0.1, origIn + dxSec));
      reposition();
      recomputeDurationLocal();
      if (videoDur) renderIOTrack();
    };
    const mu = () => {
      document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu);
      recomputeDurationLocal();
      if (videoDur) renderIOTrack();
      saveMainClipsNoRerender();
    };
    document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
  });

  // Right resize: trim source-out
  el.querySelector('.rh-r').addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX;
    const origOut = clip.out;
    const mm = e2 => {
      const dxSec = (e2.clientX - sx) / tlPps;
      clip.out = Math.max(clip.in + 0.1, Math.min(clip.src_dur, origOut + dxSec));
      reposition();
      recomputeDurationLocal();
      if (videoDur) renderIOTrack();
    };
    const mu = () => {
      document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu);
      recomputeDurationLocal();
      if (videoDur) renderIOTrack();
      saveMainClipsNoRerender();
    };
    document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
  });

  // Drag clip horizontally (to close gaps / reorder)
  el.addEventListener('mousedown', e => {
    if (cutMode) return;  // cut mode owns clicks on Main track
    if (e.target.classList.contains('rh') || e.target.classList.contains('clip-remove')) return;
    e.preventDefault();
    const sx = e.clientX;
    const origStart = clip.timeline_start;
    el.style.cursor = 'grabbing';
    const mm = e2 => {
      const dx = (e2.clientX - sx) / tlPps;
      clip.timeline_start = Math.max(0, origStart + dx);
      reposition();
      recomputeDurationLocal();
      if (videoDur) renderIOTrack();
    };
    const mu = () => {
      el.style.cursor = '';
      document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu);
      recomputeDurationLocal();
      if (videoDur) renderIOTrack();
      saveMainClipsNoRerender();
    };
    document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu);
  });

  // Click to seek (no-op during cut mode)
  el.addEventListener('click', e => {
    if (cutMode) return;
    if (e.target.classList.contains('rh') || e.target.classList.contains('clip-remove')) return;
    seekTimeline(clip.timeline_start);
  });

  return el;
}

function recomputeDurationLocal() {
  if (!mainClips.length) { videoDur = 0; return; }
  videoDur = Math.max(...mainClips.map(c => c.timeline_start + (c.out - c.in)));
}

async function saveMainClips() {
  const data = await api('/api/main-clips', 'POST', { clips: mainClips });
  if (data.main_clips) mainClips = data.main_clips;
  if (typeof data.duration === 'number') videoDur = data.duration;
  renderTimeline();
}

// Save changes to server without re-rendering — used after smooth drag/resize
async function saveMainClipsNoRerender() {
  const data = await api('/api/main-clips', 'POST', { clips: mainClips });
  if (data.main_clips) mainClips = data.main_clips;
  if (typeof data.duration === 'number') videoDur = data.duration;
  // Sync inner widths only (do not re-create clip DOM that's already in correct visual state)
  syncAllTrackWidths();
}

// ── Two-click cut mode ────────────────────────────────────────────────────
let cutMode      = null;   // null | 'awaiting-first' | 'awaiting-second'
let cutFirstT    = null;   // first cut time captured (timeline seconds)
let cutFirstClipId = null; // first cut clip (so second click must be in same clip)

function enterCutMode() {
  if (!mainClips.length) { setStatus('Upload a main clip first.', 'error'); return; }
  cutMode      = 'awaiting-first';
  cutFirstT    = null;
  cutFirstClipId = null;
  document.body.classList.add('cut-mode');
  $('cutMainBtn').classList.add('btn-cut-active');
  $('cutMainBtn').textContent = '✂ Click 1st point  (Esc to cancel)';
  setStatus('Cut mode ON — click the FIRST point on the Main bar (Esc to cancel).', 'info');
  renderTimeline(); // ensure markers render
}

function exitCutMode() {
  cutMode = null; cutFirstT = null; cutFirstClipId = null;
  document.body.classList.remove('cut-mode');
  $('cutMainBtn').classList.remove('btn-cut-active');
  $('cutMainBtn').textContent = '✂ Cut';
  removeCutMarkers();
}

function removeCutMarkers() {
  document.querySelectorAll('.cut-marker').forEach(el => el.remove());
}

function addCutMarker(t) {
  if (!playheadEl) return;
  const m = document.createElement('div');
  m.className = 'cut-marker';
  m.style.left = (t * tlPps) + 'px';
  // place inside the ruler so it appears at the top with the playhead
  tlRuler.appendChild(m);
  // and also one inside the main track so the cut line shows over the clip body
  const m2 = document.createElement('div');
  m2.className = 'cut-marker cut-marker-track';
  m2.style.left = (t * tlPps) + 'px';
  mainTrack.appendChild(m2);
}

// Convert a mouse-event X to timeline seconds, scoped to a track element
function trackEventToTime(ev, trackEl) {
  const rect = trackEl.getBoundingClientRect();
  const xInTrack = (ev.clientX - rect.left) + trackEl.scrollLeft;
  return Math.max(0, Math.min(videoDur, xInTrack / tlPps));
}

async function handleMainClickForCut(ev) {
  if (!cutMode) return;
  const t = trackEventToTime(ev, mainTrack);
  const c = findClipAt(t);
  if (!c) {
    setStatus('Click on a main clip (current position is in a gap).', 'error');
    return;
  }
  const tlEnd = c.timeline_start + (c.out - c.in);
  if (t - c.timeline_start < 0.05 || tlEnd - t < 0.05) {
    setStatus('Click further from the clip edge.', 'error');
    return;
  }

  if (cutMode === 'awaiting-first') {
    cutFirstT      = t;
    cutFirstClipId = c.id;
    addCutMarker(t);
    cutMode = 'awaiting-second';
    $('cutMainBtn').textContent = '✂ Click 2nd point  (Esc to cancel)';
    setStatus(`First cut at ${fmtTime(t)} — now click the SECOND point on the same clip.`, 'info');
    return;
  }

  if (cutMode === 'awaiting-second') {
    if (c.id !== cutFirstClipId) {
      setStatus('Second point must be on the same clip as the first. Click again, or Esc to cancel.', 'error');
      return;
    }
    if (Math.abs(t - cutFirstT) < 0.1) {
      setStatus('Second point is too close to the first. Click further away.', 'error');
      return;
    }
    addCutMarker(t);
    const t1 = Math.min(cutFirstT, t);
    const t2 = Math.max(cutFirstT, t);
    setStatus(`Cutting section [${fmtTime(t1)} → ${fmtTime(t2)}]…`, 'info');
    const data = await api('/api/main-clips/cut-section', 'POST', { t1, t2 });
    if (data.error) { setStatus('Cut error: ' + data.error, 'error'); exitCutMode(); return; }
    if (data.main_clips) mainClips = data.main_clips;
    if (typeof data.duration === 'number') videoDur = data.duration;
    exitCutMode();
    setStatus(`Section cut out — middle clip is now free to drag or delete.`, 'success');
    renderTimeline();
    // Briefly highlight the new middle clip
    if (data.middle_clip_id) {
      const el = mainTrack.querySelector(`[data-clip-id="${data.middle_clip_id}"]`);
      if (el) { el.classList.add('clip-flash'); setTimeout(() => el.classList.remove('clip-flash'), 1400); }
    }
  }
}

// renderMainBookends removed — replaced by the dedicated I/O row above the Main row.
function renderMainBookends() { /* deprecated — no-op kept for any stale callers */ }

function renderBrollTracks() {
  brollContainer.innerHTML = '';
  brollTracks.forEach((track, ti) => {
    const rowWrap = document.createElement('div');
    rowWrap.className = 'tl-row-wrap';
    rowWrap.innerHTML =
      `<div class="tl-lbl">B-Roll ${ti + 1}</div>
       <div class="tl-track tl-broll-track" id="btk${ti}" data-ti="${ti}"></div>`;
    brollContainer.appendChild(rowWrap);

    const trackEl = rowWrap.querySelector('.tl-broll-track');
    // spacer drives scroll width
    const sp = document.createElement('div');
    sp.className = 'tl-spacer';
    sp.style.width = timelineTrackInnerWidth() + 'px';
    trackEl.appendChild(sp);

    trackEl.addEventListener('dragover',  e => {
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
      trackEl.classList.add('drag-over');
      showDropMarker(trackEl, e.clientX);
    });
    trackEl.addEventListener('dragleave', () => { trackEl.classList.remove('drag-over'); hideDropMarker(trackEl); });
    trackEl.addEventListener('drop',      e  => { hideDropMarker(trackEl); handleTrackDrop(e, ti); });

    track.forEach((clip, ci) => {
      if (!clip.path) return;
      trackEl.appendChild(makeBrollClipEl(clip, ti, ci, trackEl));
    });
  });
}

function makeBrollClipEl(clip, ti, ci, trackEl) {
  const el = document.createElement('div');
  el.className = 'broll-clip';

  const reposition = () => {
    el.style.left  = (clip.start * tlPps) + 'px';
    el.style.width = Math.max(20, (clip.end - clip.start) * tlPps) + 'px';
  };
  reposition();

  const name = (clip.path || '').split('/').pop().replace('.mp4','');
  el.innerHTML = `
    <div class="rh rh-l"></div>
    <div class="clip-inner">
      ${clip.thumb ? `<img src="${clip.thumb}" class="clip-th">` : ''}
      <span class="clip-nm">${name}</span>
    </div>
    <div class="rh rh-r"></div>
    <button class="clip-remove" title="Remove clip">✕</button>`;

  // Remove button
  el.querySelector('.clip-remove').addEventListener('click', e => {
    e.stopPropagation();
    brollTracks[ti].splice(ci, 1);
    saveBrollTracks();
  });

  // Left resize handle
  el.querySelector('.rh-l').addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, os = clip.start;
    const mm = e2 => { clip.start = Math.max(0, Math.min(clip.end-0.1, os+(e2.clientX-sx)/tlPps)); reposition(); };
    const mu = () => { document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); saveBrollNoRerender(); };
    document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu);
  });

  // Right resize handle
  el.querySelector('.rh-r').addEventListener('mousedown', e => {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, oe = clip.end;
    const mm = e2 => { clip.end = Math.max(clip.start+0.1, Math.min(videoDur, oe+(e2.clientX-sx)/tlPps)); reposition(); };
    const mu = () => { document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); saveBrollNoRerender(); };
    document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu);
  });

  // Clip move drag
  el.addEventListener('mousedown', e => {
    if (e.target.classList.contains('rh') || e.target.classList.contains('clip-remove')) return;
    e.preventDefault();
    const sx = e.clientX, os = clip.start, oe = clip.end, dur = oe - os;
    el.style.cursor = 'grabbing';
    const mm = e2 => { const ns = Math.max(0, Math.min(videoDur-dur, os+(e2.clientX-sx)/tlPps)); clip.start=ns; clip.end=ns+dur; reposition(); };
    const mu = () => { el.style.cursor=''; document.removeEventListener('mousemove',mm); document.removeEventListener('mouseup',mu); saveBrollNoRerender(); };
    document.addEventListener('mousemove',mm); document.addEventListener('mouseup',mu);
  });

  return el;
}

async function saveBrollTracks() {
  const result = await api('/api/broll-tracks','POST',{tracks: brollTracks});
  if (result.broll_tracks) brollTracks = result.broll_tracks;
  renderBrollTracks();
  updateTimelineHeight();
}

async function saveBrollNoRerender() {
  const result = await api('/api/broll-tracks','POST',{tracks: brollTracks});
  if (result.broll_tracks) brollTracks = result.broll_tracks;
}

async function addBrollTrack() {
  const result = await api('/api/broll-tracks/add-track','POST',{});
  if (result.broll_tracks) brollTracks = result.broll_tracks;
  renderBrollTracks();
  updateTimelineHeight();
  // scroll the new row into view so user sees it accept drops
  const tlRows = $('tlRows');
  if (tlRows) tlRows.scrollTop = tlRows.scrollHeight;
}

// ── Intro / Outro track row in timeline ──────────────────────────────────────
function renderIOTrack() {
  if (!videoDur) return;

  // Create or find the I/O row — it sits above the Main row
  let ioRow = $('ioTrackRow');
  if (!ioRow) {
    ioRow = document.createElement('div');
    ioRow.id        = 'ioTrackRow';
    ioRow.className = 'tl-row-wrap';
    ioRow.innerHTML =
      '<div class="tl-lbl" style="font-size:9px;color:var(--accent2);letter-spacing:.4px">I / O</div>'
      + '<div class="tl-track" id="ioTrack"></div>';
    const tlRows = $('tlRows');
    tlRows.insertBefore(ioRow, tlRows.firstChild);

    // Wire drag-and-drop ONCE — accept intro/outro cards dropped here
    const ioTrack = ioRow.querySelector('#ioTrack');
    ioTrack.addEventListener('dragover', e => {
      if (currentDnD && (currentDnD.id === 'vv_intro' || currentDnD.id === 'vv_outro')) {
        e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
        ioTrack.style.background = 'rgba(108,99,255,.12)';
      }
    });
    ioTrack.addEventListener('dragleave', () => { ioTrack.style.background = ''; });
    ioTrack.addEventListener('drop', e => {
      e.preventDefault();
      ioTrack.style.background = '';
      if (!currentDnD) return;
      const ioType = currentDnD.id === 'vv_intro' ? 'intro'
                   : currentDnD.id === 'vv_outro' ? 'outro' : null;
      currentDnD = null;
      if (ioType) {
        if (ioType === 'intro') { introEnabled = true; $('expAddIntro').disabled = false; $('expAddIntro').checked = true; }
        else                    { outroEnabled = true; $('expAddOutro').disabled = false; $('expAddOutro').checked = true; }
        renderMainTrack();
        renderIOTrack();   // instant placement at videoDur*tlPps
        generateIntroOutro(ioType);
      }
    });
  }

  const ioTrack = $('ioTrack');
  ioTrack.innerHTML = '';
  // spacer
  const sp = document.createElement('div');
  sp.className = 'tl-spacer';
  sp.style.width = timelineTrackInnerWidth() + 'px';
  ioTrack.appendChild(sp);

  // Anchor chips to the actual video content — NOT the full canvas length.
  // With a 10-min canvas and a 30s clip, innerW = 2400px but content ends at 120px.
  const contentPx = Math.max(60, Math.round(videoDur * tlPps));
  const maxChipW  = Math.max(48, contentPx * 0.4);
  const introW = Math.min(maxChipW, Math.max(48, introCfg.duration * tlPps));
  const outroW = Math.min(maxChipW, Math.max(48, outroCfg.duration * tlPps));

  if (introEnabled || introPath) {
    const ready = !!introPath;
    const on    = $('expAddIntro').checked;
    const el    = document.createElement('div');
    el.className = 'io-track-clip io-intro' + (on ? '' : ' io-off');
    el.style.left  = '0px';
    el.style.right = 'auto';
    el.style.width = introW + 'px';
    el.innerHTML = `<span class="io-tc-label">${ready ? '◀ INTRO' : '◀ …'}</span>`
                 + `<span class="io-tc-x" title="Remove intro">✕</span>`;
    el.title = ready
      ? (on ? 'Intro included in export — click body to disable' : 'Click body to enable intro')
      : 'Generating intro…';
    el.addEventListener('click', e => {
      if (e.target.classList.contains('io-tc-x')) {
        introEnabled = false; introPath = null;
        const th = $('introThumb');
        if (th) th.outerHTML = `<div class="io-card-placeholder" id="introThumb">🎬</div>`;
        $('expAddIntro').checked = false;
        renderIOTrack();
        return;
      }
      const nowOn = !$('expAddIntro').checked;
      $('expAddIntro').checked = nowOn;
      el.classList.toggle('io-off', !nowOn);
    });
    ioTrack.appendChild(el);
  }

  if (outroEnabled || outroPath) {
    const ready = !!outroPath;
    const on    = $('expAddOutro').checked;
    const el    = document.createElement('div');
    el.className = 'io-track-clip io-outro' + (on ? '' : ' io-off');
    // Outro starts right after the last main clip
    el.style.left  = Math.round(videoDur * tlPps) + 'px';
    el.style.right = 'auto';
    el.style.width = outroW + 'px';
    el.innerHTML = `<span class="io-tc-label">${ready ? 'OUTRO ▶' : '… ▶'}</span>`
                 + `<span class="io-tc-x" title="Remove outro">✕</span>`;
    el.title = ready
      ? (on ? 'Outro included in export — click body to disable' : 'Click body to enable outro')
      : 'Generating outro…';
    el.addEventListener('click', e => {
      if (e.target.classList.contains('io-tc-x')) {
        outroEnabled = false; outroPath = null;
        const th = $('outroThumb');
        if (th) th.outerHTML = `<div class="io-card-placeholder" id="outroThumb">🎬</div>`;
        $('expAddOutro').checked = false;
        renderIOTrack();
        return;
      }
      const nowOn = !$('expAddOutro').checked;
      $('expAddOutro').checked = nowOn;
      el.classList.toggle('io-off', !nowOn);
    });
    ioTrack.appendChild(el);
  }

  // Hide row entirely if neither intro nor outro exists
  ioRow.style.display = (introEnabled || outroEnabled || introPath || outroPath) ? '' : 'none';
}

// Yellow marker on the track that shows where the drop will land (in timeline-time space).
function showDropMarker(trackEl, clientX) {
  let m = trackEl.querySelector('.broll-drop-marker');
  if (!m) {
    m = document.createElement('div');
    m.className = 'broll-drop-marker';
    trackEl.appendChild(m);
  }
  const ref = mainTrack.getBoundingClientRect();
  const xTime = (clientX - ref.left) + (mainTrack.scrollLeft || 0);
  const t     = Math.max(0, Math.min(videoDur || 0, xTime / tlPps));
  m.style.left = (t * tlPps) + 'px';
  m.style.display = 'block';
}
function hideDropMarker(trackEl) {
  const m = trackEl.querySelector('.broll-drop-marker');
  if (m) m.style.display = 'none';
}

function handleTrackDrop(e, ti) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (!currentDnD || !videoDur) return;
  // Use mainTrack (or ruler) as the canonical time reference. broll-tracks
  // declare overflow:visible so their scrollLeft is always 0 — using them
  // directly causes drops on a scrolled timeline to land at the wrong time.
  // mainTrack's left edge + scrollLeft is the source of truth for x→time.
  const refEl  = mainTrack;
  const ref    = refEl.getBoundingClientRect();
  const xTime  = (e.clientX - ref.left) + (refEl.scrollLeft || 0);
  const dropTime = Math.max(0, Math.min(videoDur, xTime / tlPps));
  const clipDur  = currentDnD.duration || 5;
  console.log('[broll-drop]', { ti, clientX: e.clientX, refLeft: ref.left, scrollLeft: refEl.scrollLeft, xTime, tlPps, dropTime, videoDur, clipDur });
  brollTracks[ti].push({
    id:    currentDnD.id,
    path:  currentDnD.path,
    thumb: currentDnD.thumb,
    start: dropTime,
    end:   Math.min(videoDur, dropTime + clipDur),
  });
  currentDnD = null;
  saveBrollTracks();
}

// ══════════════════════════════════════════════════════════════════════════
//  B-ROLL LIBRARY
// ══════════════════════════════════════════════════════════════════════════
async function loadCategories() {
  const data = await api('/api/categories');
  categoryPills.innerHTML = '';
  (data.categories||[]).forEach(cat => {
    const btn = document.createElement('button');
    btn.className   = 'cat-pill';
    btn.textContent = cat.name;
    btn.onclick = () => { $('searchInput').value = cat.query; doSearch(); };
    categoryPills.appendChild(btn);
  });
}

async function uploadCustomBroll(e) {
  const file = e.target.files[0];
  if (!file) return;
  const st = $('brollUploadStatus');
  st.textContent = 'Uploading ' + file.name + '…';
  st.className = 'broll-upload-status';
  const fd = new FormData();
  fd.append('media', file);
  try {
    const res = await fetch('/api/broll/upload', { method: 'POST', body: fd });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    st.textContent = '✓ ' + (data.name || file.name) + ' added';
    st.className   = 'broll-upload-status success';
    // Prepend the new clip to the library grid
    addLibraryClipEl(clipGrid, {
      id:       data.id,
      path:     data.path,
      thumb:    data.thumb,
      duration: data.duration,
    }, /*prepend=*/true);
  } catch(err) {
    st.textContent = 'Error: ' + err.message;
    st.className   = 'broll-upload-status error';
  }
  e.target.value = '';
}

async function loadClips() {
  const data = await api('/api/clips');
  const clips = data.clips || [];
  if (clips.length) {
    clipGrid.innerHTML = '';
    clips.forEach(clip => addLibraryClipEl(clipGrid, clip));
  }
}

function addLibraryClipEl(container, clip, prepend) {
  const el = document.createElement('div');
  el.className   = 'lib-clip';
  el.draggable   = true;
  el.dataset.id  = clip.id;
  el.innerHTML   = clip.thumb
    ? `<img src="${clip.thumb}" loading="lazy"><span>${clip.id}</span>`
    : `<div class="clip-no-thumb"></div><span>${clip.id}</span>`;
  el.addEventListener('dragstart', e => {
    currentDnD = { id: clip.id, path: clip.path, thumb: clip.thumb||'', duration: +(clip.duration||clip.dur||5) };
    e.dataTransfer.setData('text/plain', String(clip.id));
  });
  if (prepend && container.firstChild) container.insertBefore(el, container.firstChild);
  else                                  container.appendChild(el);
}

async function doSearch() {
  const q = $('searchInput').value.trim();
  if (!q) return;
  clipGrid.innerHTML = '<div class="loading">Searching…</div>';
  const data = await api('/api/search','POST',{query:q,per_page:15});
  if (data.error) { clipGrid.innerHTML = `<div class="error">${escHtml(data.error)}</div>`; return; }
  clipGrid.innerHTML = '';
  const clips = data.clips || [];
  if (!clips.length) { clipGrid.innerHTML = '<div class="lib-hint">No results</div>'; return; }
  clips.forEach(clip => {
    const el = document.createElement('div');
    el.className = 'lib-clip downloading';
    el.innerHTML = `<img src="${clip.thumbnail}" loading="lazy"><span>${clip.user}·${clip.duration}s</span><div class="dl-overlay">Click to download</div>`;
    el.onclick = async () => {
      if (el.draggable) return;
      el.classList.add('loading');
      const res = await api('/api/download-clip','POST',{id:clip.id,url:clip.url});
      el.classList.remove('loading','downloading');
      if (res.ok) {
        const lc = {id:clip.id,path:res.path,thumb:res.thumb,duration:clip.duration};
        el.draggable = true;
        el.addEventListener('dragstart', e2 => {
          currentDnD = lc;
          e2.dataTransfer.setData('text/plain',String(clip.id));
        });
        el.querySelector('.dl-overlay').textContent = '✓ Ready';
      } else {
        el.querySelector('.dl-overlay').textContent = 'Error';
      }
    };
    clipGrid.appendChild(el);
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  INTRO / OUTRO
// ══════════════════════════════════════════════════════════════════════════
// ── Wire the Intro & Outro properties tab ──────────────────────────────────
function wireIOTab() {
  const linkSlider = (id, valId, target, key) => {
    const inp = $(id), v = $(valId);
    if (!inp || !v) return;
    inp.addEventListener('input', () => {
      target[key] = +inp.value;
      v.textContent = inp.value;
      saveIOCfg(target === introCfg ? 'intro' : 'outro');
    });
  };
  linkSlider('introDur',      'introDurVal',      introCfg, 'duration');
  linkSlider('introFadeIn',   'introFadeInVal',   introCfg, 'fade_in');
  linkSlider('introFadeOut',  'introFadeOutVal',  introCfg, 'fade_out');
  linkSlider('introAudioVol', 'introAudioVolVal', introCfg, 'audio_volume');
  linkSlider('outroDur',      'outroDurVal',      outroCfg, 'duration');
  linkSlider('outroFadeIn',   'outroFadeInVal',   outroCfg, 'fade_in');
  linkSlider('outroFadeOut',  'outroFadeOutVal',  outroCfg, 'fade_out');
  linkSlider('outroAudioVol', 'outroAudioVolVal', outroCfg, 'audio_volume');

  $('introUploadBtn').onclick = () => $('introFileInput').click();
  $('outroUploadBtn').onclick = () => $('outroFileInput').click();
  $('introFileInput').onchange = e => uploadIOMedia(e, 'intro');
  $('outroFileInput').onchange = e => uploadIOMedia(e, 'outro');

  $('introAudioUploadBtn').onclick = () => $('introAudioFileInput').click();
  $('outroAudioUploadBtn').onclick = () => $('outroAudioFileInput').click();
  $('introAudioFileInput').onchange = e => uploadIOAudio(e, 'intro');
  $('outroAudioFileInput').onchange = e => uploadIOAudio(e, 'outro');

  $('introResetBtn').onclick = () => resetIOMedia('intro');
  $('outroResetBtn').onclick = () => resetIOMedia('outro');
  $('introAudioResetBtn').onclick = () => resetIOAudio('intro');
  $('outroAudioResetBtn').onclick = () => resetIOAudio('outro');

  $('introRegenBtn').onclick = () => generateIntroOutro('intro');
  $('outroRegenBtn').onclick = () => generateIntroOutro('outro');
}

function applyIOCfgToUI(kind) {
  const cfg = kind === 'intro' ? introCfg : outroCfg;
  const p = kind;
  $(p+'Dur').value      = cfg.duration;     $(p+'DurVal').textContent      = cfg.duration;
  $(p+'FadeIn').value   = cfg.fade_in;      $(p+'FadeInVal').textContent   = cfg.fade_in;
  $(p+'FadeOut').value  = cfg.fade_out;     $(p+'FadeOutVal').textContent  = cfg.fade_out;
  $(p+'AudioVol').value = cfg.audio_volume; $(p+'AudioVolVal').textContent = cfg.audio_volume;
  const mediaName = cfg.custom_media
    ? cfg.custom_media.split(/[\\/]/).pop()
    : 'V&V default brand';
  $(p+'MediaName').textContent = mediaName;
  const audioName = cfg.audio_path
    ? cfg.audio_path.split(/[\\/]/).pop()
    : 'Visibility default';
  $(p+'AudioName').textContent = audioName;
}

async function saveIOCfg(kind) {
  const cfg = kind === 'intro' ? introCfg : outroCfg;
  await api('/api/intro-outro/config', 'POST', {
    type: kind, duration: cfg.duration,
    fade_in: cfg.fade_in, fade_out: cfg.fade_out,
    use_default_brand: cfg.use_default_brand,
    custom_media: cfg.custom_media,
    use_default_audio: cfg.use_default_audio,
    audio_path: cfg.audio_path,
    audio_volume: cfg.audio_volume,
  });
}

async function uploadIOAudio(e, kind) {
  const file = e.target.files[0];
  if (!file) return;
  $('ioPropStatus').textContent = `Uploading ${kind} audio…`;
  const fd = new FormData();
  fd.append('type', kind);
  fd.append('audio', file);
  const res = await (await fetch('/api/intro-outro/upload-audio', { method: 'POST', body: fd })).json();
  if (res.error) { $('ioPropStatus').textContent = 'Audio upload error: ' + res.error; return; }
  const cfg = kind === 'intro' ? introCfg : outroCfg;
  Object.assign(cfg, res[kind+'_cfg']);
  applyIOCfgToUI(kind);
  $('ioPropStatus').textContent = `${kind} audio uploaded — click Regenerate to apply.`;
  e.target.value = '';
}

async function resetIOAudio(kind) {
  const cfg = kind === 'intro' ? introCfg : outroCfg;
  cfg.audio_path        = null;
  cfg.use_default_audio = true;
  await saveIOCfg(kind);
  applyIOCfgToUI(kind);
  $('ioPropStatus').textContent = `${kind} audio reset to Visibility default — click Regenerate.`;
}

async function uploadIOMedia(e, kind) {
  const file = e.target.files[0];
  if (!file) return;
  $('ioPropStatus').textContent = `Uploading ${kind} media…`;
  const fd = new FormData();
  fd.append('type', kind);
  fd.append('media', file);
  const res = await (await fetch('/api/intro-outro/upload', { method: 'POST', body: fd })).json();
  if (res.error) { $('ioPropStatus').textContent = 'Upload error: ' + res.error; return; }
  const cfg = kind === 'intro' ? introCfg : outroCfg;
  Object.assign(cfg, res[kind+'_cfg']);
  applyIOCfgToUI(kind);
  $('ioPropStatus').textContent = `${kind} media uploaded — click Regenerate to apply.`;
  e.target.value = '';
}

async function resetIOMedia(kind) {
  const cfg = kind === 'intro' ? introCfg : outroCfg;
  cfg.custom_media      = null;
  cfg.use_default_brand = true;
  await saveIOCfg(kind);
  applyIOCfgToUI(kind);
  $('ioPropStatus').textContent = `${kind} reset to default — click Regenerate to apply.`;
}

async function generateIntroOutro(type) {
  // Mark intent immediately so the bookend chip appears before generation completes
  if (type === 'intro') { introEnabled = true; $('expAddIntro').disabled = false; $('expAddIntro').checked = true; }
  else                  { outroEnabled = true; $('expAddOutro').disabled = false; $('expAddOutro').checked = true; }
  if (videoDur) renderMainTrack();  // chip shows "◀ …" while generating

  $('ioStatus').textContent = `Generating ${type}…`;
  $('ioPropStatus').textContent = `Generating ${type}…`;
  const cfg = type === 'intro' ? introCfg : outroCfg;
  const res = await api('/api/intro-outro', 'POST', {
    type,
    duration: cfg.duration,
    fade_in:  cfg.fade_in,
    fade_out: cfg.fade_out,
    use_default_brand: cfg.use_default_brand,
    use_default_audio: cfg.use_default_audio,
    audio_volume:      cfg.audio_volume,
  });
  if (res.error) {
    $('ioStatus').textContent = 'Error: ' + res.error;
    $('ioPropStatus').textContent = 'Error: ' + res.error;
    return; // chip stays visible; user can click card to retry
  }
  $('ioStatus').textContent = `${type === 'intro' ? 'Intro' : 'Outro'} ready ✓`;
  $('ioPropStatus').textContent = `${type === 'intro' ? 'Intro' : 'Outro'} ready (${res.duration}s) ✓`;
  // Backend may have updated cfg — sync it back
  if (res[type+'_cfg']) {
    Object.assign(cfg, res[type+'_cfg']);
    applyIOCfgToUI(type);
  }

  // Update thumbnail
  const thumbEl = $(type === 'intro' ? 'introThumb' : 'outroThumb');
  if (res.thumb && thumbEl) {
    thumbEl.outerHTML = `<img src="${res.thumb}?t=${Date.now()}" id="${type}Thumb" style="width:100%;height:54px;object-fit:cover;display:block">`;
  }

  // Store path so chip updates to "ready" state and dragstart gets the correct path
  if (type === 'intro') { introPath = res.path; }
  else                  { outroPath = res.path; }

  // Re-render with final ready state
  renderIOTrack();
  if (videoDur) { renderMainTrack(); }  // also calls renderMainBookends inside
}

// ══════════════════════════════════════════════════════════════════════════
//  TRANSCRIPTION  +  EDITABLE SEGMENTS
// ══════════════════════════════════════════════════════════════════════════
async function startTranscribe() {
  const res = await api('/api/transcribe','POST',{});
  if (res.error) { setStatus('Error: '+res.error,'error'); return; }
  setStatus('Transcribing…','info');
  $('transcribeBtn').disabled = true;
  transcribePoll = setInterval(pollTranscribe, 1500);
}

async function pollTranscribe() {
  const data = await api('/api/transcribe/status');
  setStatus(data.msg || data.status, data.status==='error'?'error':'info');
  if (data.status==='done' || data.status==='error') {
    clearInterval(transcribePoll);
    $('transcribeBtn').disabled = false;
    if (data.status==='done') {
      segments    = data.segments     || [];
      wordTimings = data.word_timings || [];
      brollTracks = data.broll_tracks || [[]];
      renderTimeline();
      renderSegments();
    }
  }
}

function renderSegments() {
  segmentList.innerHTML = '';
  segments.forEach(seg => {
    const div = document.createElement('div');
    div.className = 'seg-item';
    div.innerHTML =
      `<span class="seg-time">${fmtTime(seg.start)}</span>
       <span class="seg-txt" id="segt_${seg.id}">${escHtml(seg.text)}</span>
       <button class="seg-edit-btn" title="Edit text">✏</button>`;

    div.querySelector('.seg-time').onclick = () => { mainVideo.currentTime = seg.start; };

    // Activate editing via edit button OR double-click on text
    const startEdit = () => openSegmentEdit(div, seg);
    div.querySelector('.seg-edit-btn').onclick = startEdit;
    div.querySelector('.seg-txt').addEventListener('dblclick', startEdit);

    segmentList.appendChild(div);
  });
}

function openSegmentEdit(div, seg) {
  const span = div.querySelector('.seg-txt');
  const btn  = div.querySelector('.seg-edit-btn');
  if (!span || span.contentEditable === 'true') return; // already editing

  const original = seg.text;

  // ── Use contenteditable directly on the span — no DOM element swapping ──
  span.contentEditable = 'true';
  span.classList.add('seg-editing');
  if (btn) btn.style.display = 'none';

  // Place cursor / select all
  span.focus();
  const range = document.createRange();
  range.selectNodeContents(span);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);

  let committed = false;

  const commit = async (text) => {
    if (committed) return;
    committed = true;
    span.contentEditable = 'false';
    span.classList.remove('seg-editing');
    span.textContent = text;           // normalize (strip any pasted HTML)
    if (btn) btn.style.display = '';
    seg.text = text;

    // ── Rebuild wordTimings for this segment so karaoke reflects edits ──
    const newWords = text.split(/\s+/).filter(Boolean);
    if (newWords.length > 0) {
      const segDur  = (seg.end - seg.start) || 0.001;
      const wDur    = segDur / newWords.length;
      // remove old timings that belong to this segment
      wordTimings = wordTimings.filter(
        w => !(w.start >= seg.start - 0.001 && w.end <= seg.end + 0.001)
      );
      // insert new evenly-distributed timings
      newWords.forEach((word, i) => {
        wordTimings.push({
          word,
          start: seg.start + i * wDur,
          end:   seg.start + (i + 1) * wDur,
        });
      });
      wordTimings.sort((a, b) => a.start - b.start);
    }

    await api('/api/segment/' + seg.id, 'PATCH', { text });
    renderMainTrack();
  };

  const cancel = () => {
    if (committed) return;
    committed = true;
    span.contentEditable = 'false';
    span.classList.remove('seg-editing');
    span.textContent = original;
    if (btn) btn.style.display = '';
  };

  span.addEventListener('blur', () => {
    const text = (span.textContent || '').trim() || original;
    commit(text);
  }, { once: true });

  span.addEventListener('keydown', e2 => {
    if (e2.key === 'Enter' && !e2.shiftKey) { e2.preventDefault(); span.blur(); }
    if (e2.key === 'Escape') { e2.preventDefault(); cancel(); }
  });
}

// ══════════════════════════════════════════════════════════════════════════
//  EXPORT
// ══════════════════════════════════════════════════════════════════════════
async function startExport() {
  $('doExportBtn').disabled  = true;
  exportStatus.textContent   = 'Starting…';
  exportStatus.className     = 'status-msg info mt8';
  exportLink.hidden          = true;

  const opts = {
    orientation:       $('expOrientation').value,
    subtitle_size:     +$('expSubSize').value,
    subtitle_outline:  +$('expSubOutline').value,
    add_intro:         $('expAddIntro').checked,
    add_outro:         $('expAddOutro').checked,
    background:        { ...backgroundCfg },
  };
  const res = await api('/api/export','POST',opts);
  if (res.error) {
    exportStatus.textContent = 'Error: ' + res.error;
    exportStatus.className   = 'status-msg error mt8';
    $('doExportBtn').disabled = false;
    return;
  }
  exportPoll = setInterval(pollExport, 2000);
}

async function pollExport() {
  const data = await api('/api/export/status');
  exportStatus.textContent = data.msg || data.status;
  if (data.status==='done' || data.status==='error') {
    clearInterval(exportPoll);
    $('doExportBtn').disabled = false;
    if (data.status==='done') {
      exportStatus.className = 'status-msg success mt8';
      if (data.path) {
        exportLink.href     = data.path;
        exportLink.download = data.path.split('/').pop();
        exportLink.hidden   = false;
      }
    } else {
      exportStatus.className = 'status-msg error mt8';
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
//  TIMEFRAME
// ══════════════════════════════════════════════════════════════════════════
function wireTimeframeTab() {
  const preset = $('tlDurPreset');
  if (!preset) return;
  preset.addEventListener('change', () => {
    const customRow = $('tlDurCustomRow');
    if (preset.value === 'custom') {
      if (customRow) customRow.style.display = '';
      return;
    }
    if (customRow) customRow.style.display = 'none';
    setTimelineLength(+preset.value);
  });
  const customInp = $('tlDurCustom');
  if (customInp) {
    customInp.addEventListener('change', () => {
      const mins = Math.max(1, Math.min(120, +customInp.value || 10));
      setTimelineLength(mins * 60);
    });
  }
}

function setTimelineLength(secs) {
  timelineLength = Math.max(secs, videoDur || 0);
  renderTimeline();
}

// ══════════════════════════════════════════════════════════════════════════
//  BACKGROUND
// ══════════════════════════════════════════════════════════════════════════
function wireBackgroundTab() {
  const enableChk  = $('bgEnabled');
  const softSlider = $('bgSoftness');
  const uploadBtn  = $('bgUploadBtn');
  const fileInput  = $('bgFileInput');
  if (!enableChk) return;

  enableChk.checked = backgroundCfg.enabled;
  enableChk.addEventListener('change', () => {
    backgroundCfg.enabled = enableChk.checked;
    saveBgCfg();
  });

  softSlider.value = backgroundCfg.softness;
  softSlider.addEventListener('input', () => {
    backgroundCfg.softness = +softSlider.value;
    $('bgSoftnessVal').textContent = softSlider.value;
    saveBgCfg();
  });

  uploadBtn.onclick = () => fileInput.click();
  fileInput.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    const st = $('bgUploadStatus');
    st.textContent = 'Uploading…';
    st.className   = 'status-msg info';
    const fd = new FormData();
    fd.append('image', file);
    const res = await (await fetch('/api/background/upload', { method:'POST', body:fd })).json();
    if (res.error) { st.textContent = 'Error: ' + res.error; st.className='status-msg error'; return; }
    backgroundCfg.bg_path = res.bg_path;
    backgroundCfg.enabled = true;
    enableChk.checked = true;
    st.textContent = '✓ Background uploaded';
    st.className   = 'status-msg success';
    applyBgCfgToUI();
    e.target.value = '';
  };

  // Check if backend packages are available
  api('/api/background/check').then(r => {
    const el = $('bgCheckStatus');
    if (!el) return;
    if (r.ok) {
      el.textContent = `✓ ${r.engine} ready`;
      el.className   = 'status-msg success';
    } else {
      el.innerHTML   = `⚠ Not installed — run in terminal:<br><code style="font-size:10px">${r.install}</code>`;
      el.className   = 'status-msg error';
    }
  });
}

function applyBgCfgToUI() {
  const enableChk  = $('bgEnabled');
  const softSlider = $('bgSoftness');
  if (!enableChk) return;
  enableChk.checked = backgroundCfg.enabled;
  if (softSlider) { softSlider.value = backgroundCfg.softness; $('bgSoftnessVal').textContent = backgroundCfg.softness; }
  const img  = $('bgPreviewImg');
  const hint = $('bgPreviewHint');
  if (backgroundCfg.bg_path && img) {
    img.src          = backgroundCfg.bg_path + '?t=' + Date.now();
    img.style.display= '';
    if (hint) hint.style.display = 'none';
  }
}

async function saveBgCfg() {
  await api('/api/background/config', 'POST', backgroundCfg);
}

// ══════════════════════════════════════════════════════════════════════════
//  TABS
// ══════════════════════════════════════════════════════════════════════════
const TAB_TITLES = { transcript:'Transcript', text:'Text Overlays', style:'Style / Karaoke', 'intro-outro':'Intro & Outro', export:'Export', timeframe:'Timeframe', background:'Background' };
function switchTab(tab) {
  document.querySelectorAll('.ptab').forEach(b     => b.classList.toggle('active',  b.dataset.tab===tab));
  document.querySelectorAll('.ptab-body').forEach(c => c.classList.toggle('active', c.id==='ptab-'+tab));
  if ($('ptabTitle')) $('ptabTitle').textContent = TAB_TITLES[tab] || tab;
}

// ══════════════════════════════════════════════════════════════════════════
//  UTILITIES
// ══════════════════════════════════════════════════════════════════════════
function fmtTime(t) {
  if (!isFinite(t)) return '0:00';
  return Math.floor(t/60) + ':' + String(Math.floor(t%60)).padStart(2,'0');
}
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function setStatus(msg, type='info') {
  transcribeStatus.textContent = msg;
  transcribeStatus.className   = 'status-msg ' + type;
}
async function api(url, method='GET', body=null) {
  try {
    const opts = { method, headers:{'Content-Type':'application/json'} };
    if (body!==null) opts.body = JSON.stringify(body);
    return await (await fetch(url,opts)).json();
  } catch(e) { return {error: e.message}; }
}
