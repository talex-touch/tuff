use std::collections::HashMap;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use napi::bindgen_prelude::{AsyncTask, Buffer, Function};
use napi::{Env, Error, Result, Task};
use napi_derive::napi;

/// Default hard cap on a capture session before it auto-stops.
const DEFAULT_MAX_DURATION_MS: u32 = 15_000;
/// Default trailing-silence window that ends a session once speech was heard.
const DEFAULT_SILENCE_STOP_MS: u32 = 1_500;
/// How often the capture thread re-checks the conditions nothing can signal:
/// the max-duration cap and the trailing-silence window. A manual stop or cancel
/// does not wait for this — it wakes the thread directly.
const POLL_INTERVAL_MS: u64 = 50;
/// Largest encoded input `play_audio` will look at. 64 MiB comfortably holds an
/// uncompressed five-minute stereo WAV at 48 kHz (~57 MiB), which is far beyond
/// any TTS response or notification sound this plays.
const MAX_PLAYBACK_INPUT_BYTES: usize = 64 * 1024 * 1024;
/// Largest decoded interleaved sample count `play_audio` will accumulate: five
/// minutes of 48 kHz stereo, ~115 MiB as `f32`.
///
/// The byte limit above cannot stand in for this — a few megabytes of MP3 decode
/// to hundreds of megabytes, which is the shape of the failure being bounded.
const MAX_DECODED_SAMPLES: usize = 48_000 * 2 * 300;
/// How long `stop_capture` / `cancel_capture` will wait for the capture thread to
/// drop its cpal stream and return.
///
/// These run on the Electron main thread, so the wait has to be bounded: a wedged
/// CoreAudio/WASAPI teardown would otherwise freeze the whole UI with no way out.
/// Half a second is far longer than a healthy teardown (single-digit ms) and short
/// enough to read as a hitch rather than a hang.
const STOP_WAIT_BUDGET_MS: u64 = 500;

#[napi(object)]
pub struct NativeAudioSupport {
    pub supported: bool,
    pub platform: String,
    pub reason: Option<String>,
}

#[napi(object)]
pub struct AudioCaptureOptions {
    pub max_duration_ms: Option<u32>,
    pub silence_stop_ms: Option<u32>,
    pub sample_rate: Option<u32>,
    /// Run RNNoise over the capture before it is band-limited. Defaults to off.
    pub noise_suppression: Option<bool>,
}

#[napi(object)]
pub struct AudioCaptureStart {
    pub session_id: String,
    /// Name of the input device this session opened, as the OS reports it.
    ///
    /// Empty when the platform will not name it. Read once at start rather than polled: the
    /// device a session records on cannot change under it, so this is the answer for its whole
    /// lifetime, and the caller compares consecutive sessions to notice a switch.
    pub device_name: String,
}

#[napi(object)]
pub struct AudioCaptureResult {
    pub audio: Buffer,
    pub format: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub duration_ms: u32,
    pub stopped_reason: String,
}

#[napi(object)]
pub struct AudioCaptureState {
    pub active: bool,
    pub duration_ms: u32,
    pub stopped_reason: Option<String>,
}

#[napi(object)]
pub struct AudioSnapshot {
    pub audio: Buffer,
    pub duration_ms: u32,
}

#[napi(object)]
pub struct AudioPcmChunk {
    pub pcm: Buffer,
    pub sample_rate: u32,
    pub channels: u16,
}

#[napi(object)]
pub struct AudioPlaybackStart {
    pub playback_id: String,
}

#[napi(object)]
pub struct TypeTextResult {
    pub ok: bool,
    pub reason: Option<String>,
}

#[napi(object)]
pub struct FunctionKeyMonitorStart {
    pub active: bool,
    pub reason: Option<String>,
}

#[napi]
pub fn get_native_audio_support() -> NativeAudioSupport {
    build_native_audio_support(
        std::env::consts::OS.to_string(),
        platform_supported(),
        probe_default_input(),
    )
}

#[napi]
pub fn start_function_key_monitor(
    env: Env,
    callback: Function<'_, u32, ()>,
) -> Result<FunctionKeyMonitorStart> {
    function_key_monitor::start(env, callback)
}

/// Required by the JS loader so stale addons cannot retain CGEventSource held-key seeding.
#[napi]
pub fn function_key_monitor_api_v5() -> u32 {
    5
}

#[napi]
pub fn set_function_key_monitor_escape_capture(enabled: bool) -> bool {
    function_key_monitor::set_escape_capture(enabled)
}

#[napi]
pub fn stop_function_key_monitor() {
    function_key_monitor::stop();
}

#[cfg(target_os = "macos")]
mod function_key_monitor;

#[cfg(all(test, target_os = "macos"))]
mod function_key_monitor_tests;

#[cfg(not(target_os = "macos"))]
mod function_key_monitor {
    use napi::bindgen_prelude::Function;
    use napi::{Env, Result};

    use super::FunctionKeyMonitorStart;

    pub fn start(_env: Env, _callback: Function<'_, u32, ()>) -> Result<FunctionKeyMonitorStart> {
        Ok(FunctionKeyMonitorStart {
            active: false,
            reason: Some("platform-not-supported".to_string()),
        })
    }

    pub fn stop() {}

    pub fn set_escape_capture(_enabled: bool) -> bool {
        false
    }
}
fn start_capture_blocking(options: Option<AudioCaptureOptions>) -> Result<(String, String)> {
    if !platform_supported() {
        return Err(Error::from_reason("platform-not-supported"));
    }

    let options = options.unwrap_or(AudioCaptureOptions {
        max_duration_ms: None,
        silence_stop_ms: None,
        sample_rate: None,
        noise_suppression: None,
    });
    let max_duration_ms = options.max_duration_ms.unwrap_or(DEFAULT_MAX_DURATION_MS);
    let silence_stop_ms = options.silence_stop_ms.unwrap_or(DEFAULT_SILENCE_STOP_MS);
    let requested_sample_rate = options.sample_rate;
    let noise_suppression = options.noise_suppression.unwrap_or(false);

    let sync = Arc::new(StopSignal::default());
    let samples = Arc::new(Mutex::new(Vec::<f32>::new()));
    let silence = Arc::new(SilenceState::new());
    let meta = Arc::new(Mutex::new(CaptureMeta::default()));
    let drain_cursor = Arc::new(AtomicUsize::new(0));
    let started_at = Instant::now();

    let (ready_tx, ready_rx) = mpsc::channel::<std::result::Result<String, String>>();

    let thread_sync = sync.clone();
    let thread_samples = samples.clone();
    let thread_silence = silence.clone();
    let thread_meta = meta.clone();

    // cpal `Stream` is neither Send nor Sync, so it is created and owned entirely
    // on this dedicated OS thread. We communicate with it via Arc<Mutex<..>> for
    // the sample buffer, a StopSignal for stop/cancel and completion, and an mpsc
    // channel that reports whether the input stream actually started.
    let join_handle = thread::Builder::new()
        .name("tuff-audio-capture".to_string())
        .spawn(move || {
            capture_thread_main(
                thread_sync,
                thread_samples,
                thread_silence,
                thread_meta,
                started_at,
                max_duration_ms,
                silence_stop_ms,
                requested_sample_rate,
                noise_suppression,
                ready_tx,
            );
        })
        .map_err(|error| Error::from_reason(format!("failed-to-spawn-capture-thread: {error}")))?;

    // Block until the capture thread confirms the stream is live (or failed to
    // open), so start_capture surfaces device errors synchronously.
    let device_name = match ready_rx.recv() {
        Ok(Ok(name)) => name,
        Ok(Err(reason)) => {
            let _ = join_handle.join();
            return Err(Error::from_reason(reason));
        }
        Err(_) => {
            let _ = join_handle.join();
            return Err(Error::from_reason("capture-thread-exited-before-ready"));
        }
    };

    let session_id = next_session_id();
    let handle = SessionHandle {
        sync,
        samples,
        snapshot: Arc::new(Mutex::new(SnapshotCache::default())),
        meta,
        join_handle,
        drain_cursor,
        last_read: Mutex::new(Instant::now()),
    };
    {
        // Reap here rather than on a timer: the map only grows when a session is
        // started, so this is exactly where accumulation would happen, and it costs
        // one pass over a map that is normally empty.
        let mut map = lock(sessions());
        let reaped = reap_abandoned_sessions(&mut map, Instant::now(), ABANDONED_SESSION_TTL);
        if reaped > 0 {
            eprintln!("[tuff-native-audio] reaped {reaped} abandoned capture session(s)");
        }
        map.insert(session_id.clone(), handle);
    }

    Ok((session_id, device_name))
}

/// Runs the blocking half on the libuv pool instead of the JS thread.
///
/// The wait itself is deliberate -- `start_capture` reports device failures rather than handing
/// back a session that never produces audio -- but it was being served on the Electron main
/// thread. `default_input_device()`, `build_input_stream()` and `stream.play()` on CoreAudio take
/// seconds while a Bluetooth input is (re)connecting, and on first use macOS raises the microphone
/// consent sheet before the AudioUnit starts, which waits on a human. Nothing in this repo asks
/// for that permission ahead of time -- `assertSupported()` in voice-service.ts only checks
/// `getNativeAudioSupport()` -- so the very first dictation blocks for as long as the user takes
/// to click. A `recv_timeout` short enough to protect the event loop would have to be short enough
/// to fail that (#841).
pub struct StartCaptureTask {
    options: Option<AudioCaptureOptions>,
}

impl Task for StartCaptureTask {
    type Output = (String, String);
    type JsValue = AudioCaptureStart;

    fn compute(&mut self) -> Result<Self::Output> {
        start_capture_blocking(self.options.take())
    }

    fn resolve(&mut self, _env: Env, started: Self::Output) -> Result<Self::JsValue> {
        let (session_id, device_name) = started;
        Ok(AudioCaptureStart {
            session_id,
            device_name,
        })
    }
}

#[napi]
pub fn start_capture(options: Option<AudioCaptureOptions>) -> AsyncTask<StartCaptureTask> {
    AsyncTask::new(StartCaptureTask { options })
}

#[napi]
pub fn stop_capture(session_id: String) -> Result<AudioCaptureResult> {
    let handle = lock(sessions())
        .remove(&session_id)
        .ok_or_else(|| Error::from_reason(format!("session-not-found: {session_id}")))?;

    handle.sync.request(StopRequest::Stop);
    settle(handle.join_handle, &handle.sync, &session_id);

    let meta = lock(&handle.meta).clone();
    let interleaved = lock(&handle.samples).clone();
    let mono = downmix_to_mono(&interleaved, meta.channels);
    let audio = encode_wav_pcm16(&mono, meta.sample_rate).map_err(Error::from_reason)?;
    let duration_ms = mono_duration_ms(mono.len(), meta.sample_rate);

    Ok(AudioCaptureResult {
        audio: Buffer::from(audio),
        format: "wav".to_string(),
        sample_rate: meta.sample_rate,
        channels: 1,
        duration_ms,
        stopped_reason: meta
            .stopped_reason
            .unwrap_or(StopReason::Manual)
            .as_str()
            .to_string(),
    })
}

#[napi]
pub fn poll_capture(session_id: String) -> Result<AudioCaptureState> {
    // Cheap, non-blocking state read: never joins the thread, only snapshots the
    // shared meta + sample buffer so a caller can end its wait as soon as the
    // capture thread auto-stops on trailing silence or the max-duration cap.
    let (meta_arc, samples_arc) = {
        let guard = lock(sessions());
        let handle = guard
            .get(&session_id)
            .ok_or_else(|| Error::from_reason(format!("session-not-found: {session_id}")))?;
        touch_session(handle);
        (handle.meta.clone(), handle.samples.clone())
    };

    let meta = lock(&meta_arc).clone();
    let interleaved_len = lock(&samples_arc).len();
    let channel_count = meta.channels.max(1) as usize;
    let duration_ms = mono_duration_ms(interleaved_len / channel_count, meta.sample_rate);

    let (active, stopped_reason) = match meta.stopped_reason {
        None => (true, None),
        Some(reason) => (false, Some(reason.as_str().to_string())),
    };

    Ok(AudioCaptureState {
        active,
        duration_ms,
        stopped_reason,
    })
}

#[napi]
pub fn snapshot_capture(session_id: String) -> Result<AudioSnapshot> {
    // Non-destructive: encode a WAV of everything captured so far WITHOUT stopping
    // the stream or removing the session, so a caller can poll it repeatedly to
    // drive chunked-batch streaming ASR while capture continues.
    let (meta_arc, samples_arc, snapshot_arc) = {
        let guard = lock(sessions());
        let handle = guard
            .get(&session_id)
            .ok_or_else(|| Error::from_reason(format!("session-not-found: {session_id}")))?;
        touch_session(handle);
        (
            handle.meta.clone(),
            handle.samples.clone(),
            handle.snapshot.clone(),
        )
    };

    let (sample_rate, channels) = {
        let meta = lock(&meta_arc);
        (meta.sample_rate, meta.channels)
    };

    // Downmix and encode only what has arrived since the last snapshot, appending
    // to a cached PCM prefix. The caller polls this on an interval and needs the
    // whole recording back each time, so the response is unavoidably O(n) — but
    // the *work* no longer is, which is what made a 15 s session quadratic.
    //
    // The delta is taken under the same Mutex the capture thread appends through,
    // so it can't tear against an in-flight write; the encode happens off the lock.
    let mut snapshot = lock(&snapshot_arc);
    let delta = {
        let buffer = lock(&samples_arc);
        buffer[snapshot_delta_range(snapshot.consumed, buffer.len(), channels)].to_vec()
    };
    extend_snapshot(&mut snapshot, &delta, channels);

    let audio = wav_from_pcm16(&snapshot.pcm, sample_rate).map_err(Error::from_reason)?;
    let duration_ms = mono_duration_ms(snapshot.pcm.len() / 2, sample_rate);

    Ok(AudioSnapshot {
        audio: Buffer::from(audio),
        duration_ms,
    })
}

#[napi]
pub fn cancel_capture(session_id: String) -> Result<()> {
    let handle = lock(sessions())
        .remove(&session_id)
        .ok_or_else(|| Error::from_reason(format!("session-not-found: {session_id}")))?;

    handle.sync.request(StopRequest::Cancel);
    settle(handle.join_handle, &handle.sync, &session_id);

    Ok(())
}

#[napi]
pub fn drain_capture(session_id: String) -> Result<AudioPcmChunk> {
    // Return only the NEW samples since the last drain (advancing a read cursor),
    // as raw 16-bit LE mono PCM (no WAV header) for socket forwarding to a
    // streaming ASR backend. Non-destructive: the capture stream keeps running.
    let (meta_arc, samples_arc, cursor) = {
        let guard = lock(sessions());
        let handle = guard
            .get(&session_id)
            .ok_or_else(|| Error::from_reason(format!("session-not-found: {session_id}")))?;
        touch_session(handle);
        (
            handle.meta.clone(),
            handle.samples.clone(),
            handle.drain_cursor.clone(),
        )
    };

    let (sample_rate, channels) = {
        let meta = lock(&meta_arc);
        (meta.sample_rate, meta.channels)
    };
    let channel_count = channels.max(1) as usize;

    // Copy the delta out under the same Mutex the capture thread appends through,
    // and advance the cursor to the current length, all atomically.
    let delta = {
        let buffer = lock(&samples_arc);
        let len = buffer.len();
        let mut start = cursor.load(Ordering::Relaxed).min(len);
        start -= start % channel_count; // keep the cursor frame-aligned
        let delta = buffer[start..].to_vec();
        cursor.store(len, Ordering::Relaxed);
        delta
    };

    let mono = downmix_to_mono(&delta, channels);
    Ok(AudioPcmChunk {
        pcm: Buffer::from(pcm16_le_bytes(&mono)),
        sample_rate,
        channels: 1,
    })
}

fn play_audio_blocking(bytes: Vec<u8>) -> Result<String> {
    if bytes.len() > MAX_PLAYBACK_INPUT_BYTES {
        return Err(Error::from_reason(format!(
            "audio-too-large: {} bytes exceeds {MAX_PLAYBACK_INPUT_BYTES}",
            bytes.len()
        )));
    }

    let (interleaved, source_rate, source_channels) =
        decode_audio(bytes).map_err(Error::from_reason)?;
    let mono = downmix_to_mono(&interleaved, source_channels);
    if mono.is_empty() {
        return Err(Error::from_reason("no-audio-decoded"));
    }

    let stop_flag = Arc::new(AtomicBool::new(false));
    let playback_id = next_playback_id();

    // Insert BEFORE spawning so a fast-finishing thread's self-removal can't race
    // ahead of the insert and leave a stale entry.
    lock(playbacks()).insert(
        playback_id.clone(),
        PlaybackHandle {
            stop_flag: stop_flag.clone(),
        },
    );

    let thread_id = playback_id.clone();
    let spawned = thread::Builder::new()
        .name("tuff-audio-playback".to_string())
        .spawn(move || playback_thread_main(thread_id, mono, source_rate, stop_flag));

    if let Err(error) = spawned {
        playbacks_remove(&playback_id);
        return Err(Error::from_reason(format!(
            "failed-to-spawn-playback-thread: {error}"
        )));
    }

    Ok(playback_id)
}

/// Runs the decode on the libuv pool instead of the JS thread.
///
/// Decoding on the calling thread was deliberate — it makes bad audio surface as a
/// thrown error rather than a playback that silently never starts — but the calling
/// thread is the Electron main thread, and symphonia walks every packet of an input
/// nothing bounded. Returning a promise keeps the error attached to the call while
/// taking the work off the event loop (#845, same shape as #841).
pub struct PlayAudioTask {
    bytes: Vec<u8>,
}

impl Task for PlayAudioTask {
    type Output = String;
    type JsValue = AudioPlaybackStart;

    fn compute(&mut self) -> Result<Self::Output> {
        play_audio_blocking(std::mem::take(&mut self.bytes))
    }

    fn resolve(&mut self, _env: Env, playback_id: Self::Output) -> Result<Self::JsValue> {
        Ok(AudioPlaybackStart { playback_id })
    }
}

#[napi]
pub fn play_audio(bytes: Buffer) -> AsyncTask<PlayAudioTask> {
    AsyncTask::new(PlayAudioTask {
        bytes: bytes.to_vec(),
    })
}

#[napi]
pub fn stop_playback(playback_id: Option<String>) -> Result<()> {
    // Signal the playback thread(s) to stop; each self-removes from the map.
    // Unknown / absent id is a no-op (never throws).
    let map = lock(playbacks());
    match playback_id {
        Some(id) => {
            if let Some(handle) = map.get(&id) {
                handle.stop_flag.store(true, Ordering::Relaxed);
            }
        }
        None => {
            for handle in map.values() {
                handle.stop_flag.store(true, Ordering::Relaxed);
            }
        }
    }
    Ok(())
}

#[napi]
pub fn is_accessibility_trusted() -> bool {
    accessibility_trusted()
}

/// One long-lived thread owns all keystroke injection.
///
/// Three problems, one structure:
///
/// 1. **Blocking.** `enigo.text()` posts one synthetic event per character and does not
///    return until the last one is out. Called straight from `#[napi] fn`, that ran on the
///    Electron main thread and froze the whole app for the length of the transcript —
///    the longer the dictation, the longer the stall. Same shape as `play_audio` (#845).
/// 2. **Ordering.** Live dictation types deltas as they are recognized. Two of those
///    running concurrently would interleave their characters into the target application,
///    which is worse than being slow. A single consumer serializes them by construction.
/// 3. **Setup cost.** `Enigo::new` reads `NSEvent.doubleClickInterval` and builds an event
///    source. Per call that is pure waste when the caller is typing a word at a time; here
///    it happens once and the instance is reused for the life of the process.
///
/// The accessibility check rides along rather than staying at the call site, so every
/// AppKit/AX touch this feature makes happens on the same thread.
struct TypeRequest {
    text: String,
    reply: mpsc::Sender<TypeTextResult>,
}

static TYPIST: OnceLock<mpsc::Sender<TypeRequest>> = OnceLock::new();

fn typist() -> &'static mpsc::Sender<TypeRequest> {
    TYPIST.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<TypeRequest>();
        thread::spawn(move || {
            let mut enigo: Option<enigo::Enigo> = None;
            for request in rx {
                let _ = request
                    .reply
                    .send(type_on_thread(&mut enigo, &request.text));
            }
        });
        tx
    })
}

/// The whole of one typing request, from the thread that owns the keyboard.
fn type_on_thread(enigo: &mut Option<enigo::Enigo>, text: &str) -> TypeTextResult {
    use enigo::{Enigo, Keyboard, Settings};

    // On macOS, keystroke injection requires Accessibility (AX) trust. Report the
    // gate rather than prompting — the app surfaces the system prompt itself.
    if !accessibility_trusted() {
        return TypeTextResult {
            ok: false,
            reason: Some("accessibility-required".to_string()),
        };
    }

    if enigo.is_none() {
        match Enigo::new(&Settings::default()) {
            Ok(instance) => *enigo = Some(instance),
            Err(error) => {
                return TypeTextResult {
                    ok: false,
                    reason: Some(format!("enigo-init-failed: {error}")),
                };
            }
        }
    }

    // `expect` is unreachable: the branch above either filled it or returned.
    match enigo.as_mut().expect("enigo initialized above").text(text) {
        Ok(()) => TypeTextResult {
            ok: true,
            reason: None,
        },
        Err(error) => TypeTextResult {
            ok: false,
            // A failed instance may be in an unusable state; drop it so the next
            // request rebuilds rather than inheriting whatever went wrong.
            reason: {
                *enigo = None;
                Some(format!("type-failed: {error}"))
            },
        },
    }
}

pub struct TypeTextTask {
    text: String,
}

impl Task for TypeTextTask {
    type Output = TypeTextResult;
    type JsValue = TypeTextResult;

    fn compute(&mut self) -> Result<Self::Output> {
        let (reply, answer) = mpsc::channel();
        typist()
            .send(TypeRequest {
                text: std::mem::take(&mut self.text),
                reply,
            })
            .map_err(|_| Error::from_reason("type-text-worker-gone"))?;
        answer
            .recv()
            .map_err(|_| Error::from_reason("type-text-worker-gone"))
    }

    fn resolve(&mut self, _env: Env, result: Self::Output) -> Result<Self::JsValue> {
        Ok(result)
    }
}

#[napi]
pub fn type_text(text: String) -> AsyncTask<TypeTextTask> {
    AsyncTask::new(TypeTextTask { text })
}

/// State shared with the audio callback to track trailing silence.
struct SilenceState {
    /// Set once any chunk exceeds the speech threshold.
    has_speech: AtomicBool,
    /// Elapsed-since-start (ms) of the most recent above-threshold chunk.
    last_sound_ms: AtomicU64,
}

impl SilenceState {
    fn new() -> Self {
        Self {
            has_speech: AtomicBool::new(false),
            last_sound_ms: AtomicU64::new(0),
        }
    }

    fn mark_sound(&self, elapsed: Duration) {
        self.last_sound_ms.store(
            elapsed.as_millis().min(u64::MAX as u128) as u64,
            Ordering::Relaxed,
        );
        self.has_speech.store(true, Ordering::Relaxed);
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum StopReason {
    Manual,
    MaxDuration,
    Silence,
    Cancelled,
}

impl StopReason {
    fn as_str(self) -> &'static str {
        match self {
            StopReason::Manual => "manual",
            StopReason::MaxDuration => "max-duration",
            StopReason::Silence => "silence",
            StopReason::Cancelled => "cancelled",
        }
    }
}

#[derive(Clone, Default)]
struct CaptureMeta {
    sample_rate: u32,
    channels: u16,
    /// `None` while the capture thread is still running; `Some` once it stopped.
    stopped_reason: Option<StopReason>,
    /// When the capture thread finished. Set alongside `stopped_reason`, and the
    /// clock the reaper measures an abandoned session against.
    stopped_at: Option<Instant>,
}

/// What a caller has asked the capture thread to do.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum StopRequest {
    Stop,
    Cancel,
}

/// The handshake between the JS thread and the capture thread, in both directions.
///
/// Both halves live under one mutex rather than in atomics because the capture
/// thread has to *check* for a request and then *wait* for one, and an atomic set
/// between those two steps is a lost wakeup — the thread would sleep out a whole
/// poll interval with the stop already pending. Holding the guard across the wait
/// closes that window; `Condvar::wait_timeout` releases it atomically.
#[derive(Default)]
struct StopSignal {
    state: Mutex<StopState>,
    changed: Condvar,
}

#[derive(Default, Clone, Copy)]
struct StopState {
    stop: bool,
    cancel: bool,
    /// Set by the capture thread after it has dropped the cpal stream and written
    /// `meta.stopped_reason` — so observing it means the session is fully settled.
    finished: bool,
}

impl StopSignal {
    fn request(&self, request: StopRequest) {
        {
            let mut state = lock(&self.state);
            match request {
                // A cancel is also a stop: it ends the capture, it just discards it.
                StopRequest::Cancel => {
                    state.cancel = true;
                    state.stop = true;
                }
                StopRequest::Stop => state.stop = true,
            }
        }
        self.changed.notify_all();
    }

    fn mark_finished(&self) {
        lock(&self.state).finished = true;
        self.changed.notify_all();
    }
}

/// Wait out one poll interval, returning early the moment a stop or cancel lands.
///
/// `None` means the budget expired with nothing requested, which is the capture
/// thread's cue to re-check the conditions no one signals (max duration, silence).
fn wait_for_stop_request(sync: &StopSignal, budget: Duration) -> Option<StopReason> {
    let mut state = lock(&sync.state);
    loop {
        // Cancel outranks stop: a session that was cancelled is discarded even if a
        // plain stop arrived first.
        if state.cancel {
            return Some(StopReason::Cancelled);
        }
        if state.stop {
            return Some(StopReason::Manual);
        }

        let (next, timeout) = sync
            .changed
            .wait_timeout(state, budget)
            .unwrap_or_else(|poison| poison.into_inner());
        if timeout.timed_out() {
            return None;
        }
        state = next;
    }
}

/// Wait for the capture thread to report that it has finished, up to `budget`.
/// Returns whether it did.
fn wait_until_finished(sync: &StopSignal, budget: Duration) -> bool {
    let deadline = Instant::now() + budget;
    let mut state = lock(&sync.state);
    loop {
        if state.finished {
            return true;
        }
        let Some(remaining) = deadline.checked_duration_since(Instant::now()) else {
            return false;
        };
        let (next, _) = sync
            .changed
            .wait_timeout(state, remaining)
            .unwrap_or_else(|poison| poison.into_inner());
        state = next;
    }
}

/// Give the capture thread a bounded window to finish, then stop waiting on it.
///
/// Joining only once it has reported `finished` keeps the join instant — the thread
/// does nothing after that but unwind. If the window expires, the handle is dropped
/// instead: the thread is detached, still owns its `Arc`s, and frees them whenever
/// the stalled device teardown eventually returns. That costs nothing the caller can
/// observe, and it is the only option that does not hand the Electron main thread an
/// unbounded wait.
fn settle(join_handle: JoinHandle<()>, sync: &StopSignal, session_id: &str) {
    if wait_until_finished(sync, Duration::from_millis(STOP_WAIT_BUDGET_MS)) {
        let _ = join_handle.join();
        return;
    }
    eprintln!(
        "[tuff-native-audio] capture thread for {session_id} did not stop within \
         {STOP_WAIT_BUDGET_MS}ms; detaching"
    );
}

/// Everything start_capture keeps so a later stop/cancel can join the thread and
/// collect the recorded PCM. The cpal `Stream` is intentionally NOT stored here
/// (it is not Send) — it lives and dies on the capture thread.
/// The encoded prefix `snapshot_capture` keeps between polls, so each poll only
/// has to encode what arrived since the last one.
#[derive(Default)]
struct SnapshotCache {
    /// Mono 16-bit LE PCM for everything consumed so far, WITHOUT a WAV header.
    pcm: Vec<u8>,
    /// How many interleaved samples `pcm` accounts for. Always frame-aligned.
    consumed: usize,
}

/// Which interleaved samples a snapshot has not folded in yet.
///
/// Never splits a frame: the cursor only ever advances to a frame boundary, so the
/// downmix of each delta groups exactly as it would over the whole buffer. cpal
/// delivers whole frames, so in practice this defers nothing.
fn snapshot_delta_range(consumed: usize, len: usize, channels: u16) -> std::ops::Range<usize> {
    let channel_count = channels.max(1) as usize;
    let end = len - len % channel_count;
    consumed.min(end)..end
}

/// Fold an already-taken delta into the cache. Kept separate from the range so the
/// encode runs off the sample-buffer lock the capture callback appends through.
fn extend_snapshot(cache: &mut SnapshotCache, delta: &[f32], channels: u16) {
    cache.consumed += delta.len();
    cache
        .pcm
        .extend_from_slice(&pcm16_le_bytes(&downmix_to_mono(delta, channels)));
}

struct SessionHandle {
    sync: Arc<StopSignal>,
    samples: Arc<Mutex<Vec<f32>>>,
    snapshot: Arc<Mutex<SnapshotCache>>,
    meta: Arc<Mutex<CaptureMeta>>,
    join_handle: JoinHandle<()>,
    /// Interleaved-sample read cursor for `drain_capture` (delta streaming).
    drain_cursor: Arc<AtomicUsize>,
    /// Last time any caller looked at this session. A caller polling towards its
    /// own collection is not abandoning it, however long the recording runs.
    last_read: Mutex<Instant>,
}

/// A session's id is the only handle to it: `SESSIONS` is keyed by id, every
/// removal path needs one, and nothing enumerates the map. So a caller that loses
/// an id -- a renderer that goes away mid-flight, a teardown that races an
/// in-flight start (#1552) -- strands the interleaved buffer (15s x 48kHz x 2ch x
/// 4B ~= 5.8MB) plus the snapshot cache for the life of the process.
///
/// Nothing can recover the id, so this recovers the memory instead: a session that
/// has stopped and that nobody has looked at since is not coming back.
///
/// The window is deliberately generous. It only starts once the capture thread has
/// finished, and any poll, snapshot or drain resets it, so a caller working towards
/// its own collection is never reaped out from under itself.
const ABANDONED_SESSION_TTL: Duration = Duration::from_secs(60);

static SESSIONS: OnceLock<Mutex<HashMap<String, SessionHandle>>> = OnceLock::new();
static SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);

fn sessions() -> &'static Mutex<HashMap<String, SessionHandle>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Whether a session can no longer be waiting for anyone.
///
/// A session still running is never abandoned, however long it has been going --
/// the caller may simply be recording. Only one that has stopped, and that nobody
/// has read since, qualifies.
fn session_is_abandoned(
    stopped_at: Option<Instant>,
    last_read: Instant,
    now: Instant,
    ttl: Duration,
) -> bool {
    let Some(stopped_at) = stopped_at else {
        return false;
    };
    now.saturating_duration_since(stopped_at.max(last_read)) >= ttl
}

/// Drop sessions nothing can reach any more. Returns how many went.
///
/// Dropping the `JoinHandle` detaches rather than joins, which is what we want:
/// the thread has already returned (`stopped_at` is written on its way out), so
/// there is nothing to wait for, and a join here would be a blocking call inside
/// the sessions lock.
fn reap_abandoned_sessions(
    map: &mut HashMap<String, SessionHandle>,
    now: Instant,
    ttl: Duration,
) -> usize {
    let before = map.len();
    map.retain(|_, handle| {
        let stopped_at = lock(&handle.meta).stopped_at;
        let last_read = *lock(&handle.last_read);
        !session_is_abandoned(stopped_at, last_read, now, ttl)
    });
    before - map.len()
}

/// Note that a caller has looked at this session, so the reaper leaves it alone.
fn touch_session(handle: &SessionHandle) {
    *lock(&handle.last_read) = Instant::now();
}

/// Recover the guard even if a previous holder panicked; a poisoned sample
/// buffer is still perfectly usable audio data.
fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poison| poison.into_inner())
}

fn next_session_id() -> String {
    let counter = SESSION_COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    format!("audio-{nanos:x}-{counter:x}")
}

#[allow(clippy::too_many_arguments)]
fn capture_thread_main(
    sync: Arc<StopSignal>,
    samples: Arc<Mutex<Vec<f32>>>,
    silence: Arc<SilenceState>,
    meta: Arc<Mutex<CaptureMeta>>,
    started_at: Instant,
    max_duration_ms: u32,
    silence_stop_ms: u32,
    requested_sample_rate: Option<u32>,
    noise_suppression: bool,
    ready_tx: mpsc::Sender<std::result::Result<String, String>>,
) {
    let host = cpal::default_host();
    let device = match host.default_input_device() {
        Some(device) => device,
        None => {
            let _ = ready_tx.send(Err("no-input-device".to_string()));
            return;
        }
    };
    // Asked before the config: a device that cannot describe itself is still usable, and the
    // empty string is what "the platform will not say" looks like on the other side. cpal 0.18
    // reports this through `description()` rather than the older `name()`.
    let device_name = device
        .description()
        .map(|description| description.name().to_string())
        .unwrap_or_default();
    let supported = match device.default_input_config() {
        Ok(config) => config,
        Err(error) => {
            let _ = ready_tx.send(Err(format!("default-input-config-failed: {error}")));
            return;
        }
    };

    let sample_format = supported.sample_format();
    let input_channels = supported.channels();
    // The device's default rate is guaranteed by `default_input_config`; the requested
    // recognition rate is produced by the bounded resampler below instead of asking CoreAudio
    // to switch hardware to a rate it may not expose (for example, 16 kHz on a 48 kHz mic).
    let input_sample_rate = supported.sample_rate();
    let output_sample_rate = requested_sample_rate
        .filter(|rate| *rate > 0)
        .unwrap_or(input_sample_rate);
    let config = cpal::StreamConfig {
        channels: input_channels,
        sample_rate: input_sample_rate,
        buffer_size: cpal::BufferSize::Default,
    };

    let frontend = Arc::new(Mutex::new(CaptureFrontend::new(
        input_sample_rate,
        output_sample_rate,
        input_channels,
        noise_suppression,
    )));
    {
        let mut guard = lock(&meta);
        // The buffer exposed by stop/snapshot/drain is always target-rate mono PCM.
        guard.sample_rate = output_sample_rate;
        guard.channels = 1;
    }

    let stream = match build_capture_stream(
        &device,
        &config,
        sample_format,
        samples.clone(),
        silence.clone(),
        started_at,
        frontend.clone(),
    ) {
        Ok(stream) => stream,
        Err(error) => {
            let _ = ready_tx.send(Err(error));
            return;
        }
    };

    if let Err(error) = stream.play() {
        let _ = ready_tx.send(Err(format!("stream-play-failed: {error}")));
        return;
    }

    // The name travels with readiness rather than through the session map: the caller is
    // already blocked here, and a device that failed to open has no name worth reporting.
    let _ = ready_tx.send(Ok(device_name));

    // Auto-stop policy: end on manual/cancel signal, on the hard duration cap,
    // or on a trailing-silence window once speech has been detected.
    //
    // The duration and silence conditions have nothing to signal them, so they are
    // still polled. A stop or cancel does: the wait below ends the moment one lands,
    // rather than up to POLL_INTERVAL_MS later with the caller blocked on the join.
    let reason = loop {
        let elapsed_ms = started_at.elapsed().as_millis().min(u64::MAX as u128) as u64;
        if elapsed_ms >= max_duration_ms as u64 {
            break StopReason::MaxDuration;
        }
        if should_stop_for_silence(
            silence.has_speech.load(Ordering::Relaxed),
            elapsed_ms,
            silence.last_sound_ms.load(Ordering::Relaxed),
            silence_stop_ms as u64,
        ) {
            break StopReason::Silence;
        }
        if let Some(requested) =
            wait_for_stop_request(&sync, Duration::from_millis(POLL_INTERVAL_MS))
        {
            break requested;
        }
    };

    // Dropping the stream stops the OS capture; do it before recording the reason.
    drop(stream);
    // The streaming resampler keeps one look-ahead sample for interpolation. Flush it only
    // after the cpal stream is dropped, then publish the terminal state to readers.
    let tail = lock(&frontend).finish();
    if !tail.is_empty() {
        lock(&samples).extend_from_slice(&tail);
    }
    finish_capture(reason, &meta, &sync);
}

/// Record why the session ended, then announce that it has.
///
/// The order is the contract: a caller that observes `finished` has to be able to
/// rely on the reason and the sample buffer already being final, so the
/// announcement goes last.
fn finish_capture(reason: StopReason, meta: &Mutex<CaptureMeta>, sync: &StopSignal) {
    {
        let mut guard = lock(meta);
        guard.stopped_reason = Some(reason);
        guard.stopped_at = Some(Instant::now());
    }
    sync.mark_finished();
}

fn build_capture_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    sample_format: cpal::SampleFormat,
    samples: Arc<Mutex<Vec<f32>>>,
    silence: Arc<SilenceState>,
    started_at: Instant,
    frontend: Arc<Mutex<CaptureFrontend>>,
) -> std::result::Result<cpal::Stream, String> {
    match sample_format {
        cpal::SampleFormat::F32 => build_typed_stream::<f32>(
            device,
            config,
            samples,
            silence,
            started_at,
            frontend,
            |sample| sample,
        ),
        cpal::SampleFormat::I16 => build_typed_stream::<i16>(
            device,
            config,
            samples,
            silence,
            started_at,
            frontend,
            |sample| sample as f32 / 32_768.0,
        ),
        cpal::SampleFormat::U16 => build_typed_stream::<u16>(
            device,
            config,
            samples,
            silence,
            started_at,
            frontend,
            |sample| (sample as f32 - 32_768.0) / 32_768.0,
        ),
        other => Err(format!("unsupported-sample-format: {other:?}")),
    }
}

fn build_typed_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    samples: Arc<Mutex<Vec<f32>>>,
    silence: Arc<SilenceState>,
    started_at: Instant,
    frontend: Arc<Mutex<CaptureFrontend>>,
    convert: impl Fn(T) -> f32 + Send + 'static,
) -> std::result::Result<cpal::Stream, String>
where
    T: cpal::SizedSample + Send + 'static,
{
    let error_fn = |error| eprintln!("[tuff-native-audio] input stream error: {error}");
    device
        .build_input_stream(
            // cpal 0.18 takes `StreamConfig` by value; it is `Copy`.
            *config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                let mut converted = Vec::with_capacity(data.len());
                for &sample in data {
                    converted.push(convert(sample));
                }
                // Speech detection reads the frontend's output rather than the raw device
                // frames: that is the signal the recogniser is given, so it is the one the
                // trailing-silence decision has to be made against.
                let (output, heard_speech) = {
                    let mut guard = lock(&frontend);
                    let output = guard.push(&converted);
                    let heard_speech = guard.observe_speech(&output);
                    (output, heard_speech)
                };
                if heard_speech {
                    silence.mark_sound(started_at.elapsed());
                }
                if !output.is_empty() {
                    lock(&samples).extend_from_slice(&output);
                }
            },
            error_fn,
            None,
        )
        .map_err(|error| format!("build-input-stream-failed: {error}"))
}

fn platform_supported() -> bool {
    cfg!(any(
        target_os = "macos",
        target_os = "windows",
        target_os = "linux"
    ))
}

fn probe_default_input() -> std::result::Result<bool, String> {
    let host = cpal::default_host();
    match host.default_input_device() {
        Some(device) => match device.default_input_config() {
            Ok(_) => Ok(true),
            Err(error) => Err(error.to_string()),
        },
        None => Ok(false),
    }
}

fn build_native_audio_support(
    platform: String,
    platform_supported: bool,
    input_probe: std::result::Result<bool, String>,
) -> NativeAudioSupport {
    if !platform_supported {
        return NativeAudioSupport {
            supported: false,
            platform,
            reason: Some("platform-not-supported".to_string()),
        };
    }

    match input_probe {
        Ok(true) => NativeAudioSupport {
            supported: true,
            platform,
            reason: None,
        },
        Ok(false) => NativeAudioSupport {
            supported: false,
            platform,
            reason: Some("no-input-device".to_string()),
        },
        Err(reason) => NativeAudioSupport {
            supported: false,
            platform,
            reason: Some(format!("input-probe-failed: {reason}")),
        },
    }
}

/// Root-mean-square level of a PCM chunk in the -1..1 float domain.
fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    let sum_of_squares: f32 = samples.iter().map(|&sample| sample * sample).sum();
    (sum_of_squares / samples.len() as f32).sqrt()
}

/// A session should end on silence only after speech was heard AND the quiet
/// gap since the last above-threshold chunk has reached the configured window.
fn should_stop_for_silence(
    has_speech: bool,
    elapsed_ms: u64,
    last_sound_ms: u64,
    silence_stop_ms: u64,
) -> bool {
    has_speech && elapsed_ms.saturating_sub(last_sound_ms) >= silence_stop_ms
}

/// Average interleaved multi-channel frames down to a single mono channel.
fn downmix_to_mono(interleaved: &[f32], channels: u16) -> Vec<f32> {
    let mut out = Vec::new();
    downmix_to_mono_into(interleaved, channels, &mut out);
    out
}

/// `downmix_to_mono` writing into a caller-owned buffer, so the capture callback can reuse one.
fn downmix_to_mono_into(interleaved: &[f32], channels: u16, out: &mut Vec<f32>) {
    let channel_count = channels.max(1) as usize;
    if channel_count <= 1 {
        out.extend_from_slice(interleaved);
        return;
    }
    out.extend(
        interleaved
            .chunks(channel_count)
            .map(|frame| frame.iter().copied().sum::<f32>() / frame.len() as f32),
    );
}

/// Duration of a mono sample run in whole milliseconds.
fn mono_duration_ms(sample_count: usize, sample_rate: u32) -> u32 {
    if sample_rate == 0 {
        return 0;
    }
    ((sample_count as u64 * 1000) / sample_rate as u64).min(u32::MAX as u64) as u32
}

/// Encode mono float PCM to an in-memory 16-bit PCM WAV.
fn encode_wav_pcm16(mono: &[f32], sample_rate: u32) -> std::result::Result<Vec<u8>, String> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: if sample_rate == 0 {
            16_000
        } else {
            sample_rate
        },
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let mut cursor = Cursor::new(Vec::<u8>::new());
    {
        let mut writer =
            hound::WavWriter::new(&mut cursor, spec).map_err(|error| error.to_string())?;
        for &sample in mono {
            let scaled = (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round();
            writer
                .write_sample(scaled as i16)
                .map_err(|error| error.to_string())?;
        }
        writer.finalize().map_err(|error| error.to_string())?;
    }
    Ok(cursor.into_inner())
}

/// Wrap already-encoded mono 16-bit LE PCM in a WAV container.
///
/// The header comes from hound writing zero samples, with only the two length
/// fields patched. Deriving it rather than hand-writing 44 bytes keeps hound the
/// single source of the layout, so this cannot drift away from
/// `encode_wav_pcm16` without the equivalence test noticing.
fn wav_from_pcm16(pcm: &[u8], sample_rate: u32) -> std::result::Result<Vec<u8>, String> {
    let mut header = encode_wav_pcm16(&[], sample_rate)?;
    // Canonical WAV: RIFF size at 4..8 covers everything after it, data size at
    // 40..44 covers the samples.
    const RIFF_SIZE: std::ops::Range<usize> = 4..8;
    const DATA_SIZE: std::ops::Range<usize> = 40..44;
    if header.len() != DATA_SIZE.end {
        return Err(format!("unexpected-wav-header-length: {}", header.len()));
    }

    let data_len = u32::try_from(pcm.len()).map_err(|_| "wav-data-too-large".to_string())?;
    let riff_len = data_len
        .checked_add(header.len() as u32 - RIFF_SIZE.end as u32)
        .ok_or_else(|| "wav-data-too-large".to_string())?;
    header[RIFF_SIZE].copy_from_slice(&riff_len.to_le_bytes());
    header[DATA_SIZE].copy_from_slice(&data_len.to_le_bytes());

    header.extend_from_slice(pcm);
    Ok(header)
}

/// Convert mono float PCM to raw little-endian 16-bit signed PCM bytes.
fn pcm16_le_bytes(mono: &[f32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(mono.len() * 2);
    for &sample in mono {
        let scaled = (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round() as i16;
        out.extend_from_slice(&scaled.to_le_bytes());
    }
    out
}

/// Linear-interpolation resample of a mono signal. Returns a clone when the
/// rates match or an input is degenerate.
fn resample_linear(input: &[f32], rate_in: u32, rate_out: u32) -> Vec<f32> {
    if input.is_empty() || rate_in == 0 || rate_out == 0 || rate_in == rate_out {
        return input.to_vec();
    }
    let ratio = rate_in as f64 / rate_out as f64;
    let out_len = ((input.len() as f64) / ratio).round() as usize;
    let mut out = Vec::with_capacity(out_len);
    for index in 0..out_len {
        let source_pos = index as f64 * ratio;
        let base = source_pos.floor() as usize;
        let frac = (source_pos - base as f64) as f32;
        let current = input.get(base).copied().unwrap_or(0.0);
        let next = input.get(base + 1).copied().unwrap_or(current);
        out.push(current + (next - current) * frac);
    }
    out
}

/// Incremental linear resampling for live capture.
///
/// cpal must open the device's native/default rate, while ASR providers commonly require
/// 16 kHz (or another fixed rate). The resampler retains only the source samples needed for the
/// next interpolation point, so long recordings do not accumulate a second full input buffer.
struct StreamingLinearResampler {
    rate_in: u32,
    rate_out: u32,
    source: Vec<f32>,
    source_base: usize,
    next_output: usize,
}

impl StreamingLinearResampler {
    fn new(rate_in: u32, rate_out: u32) -> Self {
        Self {
            rate_in: rate_in.max(1),
            rate_out: rate_out.max(1),
            source: Vec::new(),
            source_base: 0,
            next_output: 0,
        }
    }

    fn push(&mut self, input: &[f32]) -> Vec<f32> {
        self.process(input, false)
    }

    fn finish(&mut self) -> Vec<f32> {
        self.process(&[], true)
    }

    fn process(&mut self, input: &[f32], final_chunk: bool) -> Vec<f32> {
        self.source.extend_from_slice(input);
        let source_end = self.source_base.saturating_add(self.source.len());
        let ratio = self.rate_in as f64 / self.rate_out as f64;
        let output_limit = if final_chunk {
            ((source_end as f64 / ratio).round()).min(usize::MAX as f64) as usize
        } else if source_end <= 1 {
            0
        } else {
            ((((source_end - 1) as f64) / ratio).ceil()).min(usize::MAX as f64) as usize
        };

        let mut output = Vec::new();
        while self.next_output < output_limit {
            let source_position = self.next_output as f64 * ratio;
            let source_index = source_position.floor() as usize;
            let Some(relative_index) = source_index.checked_sub(self.source_base) else {
                break;
            };
            let Some(&current) = self.source.get(relative_index) else {
                break;
            };
            let next = self
                .source
                .get(relative_index + 1)
                .copied()
                .unwrap_or(current);
            let fraction = (source_position - source_index as f64) as f32;
            output.push(current + (next - current) * fraction);
            self.next_output += 1;
        }

        // Keep the current interpolation sample and discard everything before it. The next
        // output may be fractional, so retaining one preceding sample is cheap and avoids an
        // edge-case when floating-point rounding lands exactly on a boundary.
        let next_source_index = (self.next_output as f64 * ratio).floor() as usize;
        let retain_from = next_source_index.saturating_sub(1);
        if retain_from > self.source_base {
            let drop_count = (retain_from - self.source_base).min(self.source.len());
            self.source.drain(..drop_count);
            self.source_base += drop_count;
        }

        if final_chunk {
            self.source.clear();
            self.source_base = source_end;
        }
        output
    }
}

/// One biquad section, Direct Form I.
///
/// Coefficients and state are `f64` while the signal stays `f32`. At 80 Hz against a 48 kHz
/// stream the poles sit within 0.01 rad of z=1, which single precision does not have the
/// headroom to hold: the accumulated state error there is large enough to move the corner and,
/// at higher orders, to ring. The conversion is free next to the multiplies.
#[derive(Clone, Copy, Default)]
struct Biquad {
    b0: f64,
    b1: f64,
    b2: f64,
    a1: f64,
    a2: f64,
    x1: f64,
    x2: f64,
    y1: f64,
    y2: f64,
}

impl Biquad {
    fn process(&mut self, input: f32) -> f32 {
        let x0 = input as f64;
        let y0 = self.b0 * x0 + self.b1 * self.x1 + self.b2 * self.x2
            - self.a1 * self.y1
            - self.a2 * self.y2;
        self.x2 = self.x1;
        self.x1 = x0;
        self.y2 = self.y1;
        self.y1 = y0;
        y0 as f32
    }
}

/// Section `q` values for an `order`-pole Butterworth cascade.
///
/// The whole cascade is Butterworth only if each section carries its own `q`; giving every
/// section 0.707 stacks identical two-pole responses and produces a much softer, non-flat
/// passband instead.
fn butterworth_section_qs(order: usize) -> Vec<f64> {
    (0..order / 2)
        .map(|k| {
            let theta = (2 * k + 1) as f64 * std::f64::consts::PI / (2.0 * order as f64);
            1.0 / (2.0 * theta.cos())
        })
        .collect()
}

/// RBJ cookbook coefficients, normalised by `a0`.
fn biquad_from_rbj(b: [f64; 3], a: [f64; 3]) -> Biquad {
    Biquad {
        b0: b[0] / a[0],
        b1: b[1] / a[0],
        b2: b[2] / a[0],
        a1: a[1] / a[0],
        a2: a[2] / a[0],
        ..Biquad::default()
    }
}

fn lowpass_section(sample_rate: f64, cutoff_hz: f64, q: f64) -> Biquad {
    let w0 = 2.0 * std::f64::consts::PI * cutoff_hz / sample_rate;
    let (sin_w0, cos_w0) = w0.sin_cos();
    let alpha = sin_w0 / (2.0 * q);
    biquad_from_rbj(
        [(1.0 - cos_w0) / 2.0, 1.0 - cos_w0, (1.0 - cos_w0) / 2.0],
        [1.0 + alpha, -2.0 * cos_w0, 1.0 - alpha],
    )
}

fn highpass_section(sample_rate: f64, cutoff_hz: f64, q: f64) -> Biquad {
    let w0 = 2.0 * std::f64::consts::PI * cutoff_hz / sample_rate;
    let (sin_w0, cos_w0) = w0.sin_cos();
    let alpha = sin_w0 / (2.0 * q);
    biquad_from_rbj(
        [(1.0 + cos_w0) / 2.0, -(1.0 + cos_w0), (1.0 + cos_w0) / 2.0],
        [1.0 + alpha, -2.0 * cos_w0, 1.0 - alpha],
    )
}

/// A cascade of biquad sections applied in series.
struct BiquadCascade {
    sections: Vec<Biquad>,
}

impl BiquadCascade {
    fn butterworth_lowpass(sample_rate: f64, cutoff_hz: f64, order: usize) -> Self {
        Self {
            sections: butterworth_section_qs(order)
                .into_iter()
                .map(|q| lowpass_section(sample_rate, cutoff_hz, q))
                .collect(),
        }
    }

    fn butterworth_highpass(sample_rate: f64, cutoff_hz: f64, order: usize) -> Self {
        Self {
            sections: butterworth_section_qs(order)
                .into_iter()
                .map(|q| highpass_section(sample_rate, cutoff_hz, q))
                .collect(),
        }
    }

    fn process_in_place(&mut self, samples: &mut [f32]) {
        for sample in samples.iter_mut() {
            let mut value = *sample;
            for section in self.sections.iter_mut() {
                value = section.process(value);
            }
            *sample = value;
        }
    }
}

/// Corner of the always-on capture high-pass, and its order.
///
/// Mains hum, HVAC rumble and desk knocks live below it; the lowest pitch that carries speech
/// does not. Fourth order rather than second because two poles only reach -8.8 dB at 50 Hz,
/// which leaves audible hum in the band an ASR model then has to ignore.
const CAPTURE_HIGHPASS_HZ: f64 = 80.0;
const CAPTURE_HIGHPASS_ORDER: usize = 4;
/// Anti-alias corner as a fraction of the *output* rate, and the order used to reach it.
///
/// 0.45 keeps the corner at 7.2 kHz for a 16 kHz target: far enough above the speech band to
/// cost nothing measurable, far enough below the 8 kHz fold point for eight poles to bring
/// everything that would alias into 2-6 kHz down by more than 20 dB.
const ANTIALIAS_CUTOFF_RATIO: f64 = 0.45;
const ANTIALIAS_ORDER: usize = 8;

/// Length of one speech-detection window, in milliseconds.
const DETECT_WINDOW_MS: usize = 10;
/// Sub-blocks the noise floor's sliding minimum is kept in, and windows per sub-block.
/// Four blocks of 750 ms give the floor a three-second memory.
const NOISE_FLOOR_SUBS: usize = 4;
const NOISE_FLOOR_SUB_WINDOWS: usize = 75;
/// Floor below which the estimate is not trusted, so digital silence cannot drive the
/// speech threshold to zero and make every rounding error a word.
const ABS_NOISE_FLOOR: f32 = 0.0006;
/// Level above the noise floor that starts, and then sustains, a speech run.
///
/// 2.5 is +8 dB and 1.6 is +4 dB. Measured against synthetic speech from 42 dB down to 4 dB
/// SNR these detect every utterance, and steady noise alone from -60 to -14 dBFS never trips
/// them: the RMS of a 160-sample window varies by about 5%, so +8 dB is far outside anything
/// stationary noise produces. Wider ratios (+12 dB) were tried first and lost speech in the
/// 4 dB SNR case.
const SPEECH_ENTER_RATIO: f32 = 2.5;
const SPEECH_EXIT_RATIO: f32 = 1.6;

/// RNNoise is defined at 48 kHz and nowhere else, so the stage converts to it rather than
/// asking the model to interpret a rate it was never trained on.
const RNNOISE_RATE: u32 = 48_000;
/// nnnoiseless takes and returns `f32` scaled to the i16 domain, not to -1..1.
const RNNOISE_SCALE: f32 = 32_768.0;

/// Optional RNNoise stage, off unless the user turned it on.
///
/// It is off by default on purpose: cloud recognisers are trained on noisy speech, and the
/// spectral distortion a suppressor introduces can cost more accuracy than the noise it
/// removes. That trade-off is measurable rather than arguable, so it ships as a preference
/// with a default instead of a decision baked into the chain.
///
/// The stage always emits 48 kHz, including after a failure. Everything downstream is built
/// against that rate, and a stage that changed its output rate mid-session would leave the
/// filters and resampler configured for a rate that no longer arrives.
struct DenoiseStage {
    state: Box<nnnoiseless::DenoiseState<'static>>,
    /// Present when the device does not already run at 48 kHz. Upsampling needs no
    /// band-limiting — there is nothing above the source Nyquist to fold down.
    upsampler: Option<StreamingLinearResampler>,
    /// 48 kHz samples that have not yet filled a model frame.
    pending: Vec<f32>,
    frame_in: Vec<f32>,
    frame_out: Vec<f32>,
    /// The model's first frame carries a fade-in, so its *input* is emitted in place of its
    /// output. Dropping that frame outright would shift the whole recording 10 ms earlier.
    seeded: bool,
    /// Once set, the stage is a rate converter and nothing more, and the session keeps
    /// recording. Losing suppression is a far better outcome than losing the dictation.
    failed: bool,
}

impl DenoiseStage {
    fn new(input_rate: u32) -> Self {
        let frame = nnnoiseless::DenoiseState::FRAME_SIZE;
        Self {
            state: nnnoiseless::DenoiseState::new(),
            upsampler: if input_rate == RNNOISE_RATE {
                None
            } else {
                Some(StreamingLinearResampler::new(input_rate, RNNOISE_RATE))
            },
            pending: Vec::new(),
            frame_in: vec![0.0; frame],
            frame_out: vec![0.0; frame],
            seeded: false,
            failed: false,
        }
    }

    /// Replace `buffer` with its denoised equivalent at 48 kHz.
    fn process(&mut self, buffer: &mut Vec<f32>) {
        match self.upsampler.as_mut() {
            Some(upsampler) => {
                let resampled = upsampler.push(buffer);
                self.pending.extend_from_slice(&resampled);
            }
            None => self.pending.extend_from_slice(buffer),
        }
        buffer.clear();
        self.drain_frames(buffer);
    }

    /// Flush the upsampler and whatever partial frame is held, zero-padded to a whole frame.
    fn finish(&mut self, out: &mut Vec<f32>) {
        out.clear();
        if let Some(upsampler) = self.upsampler.as_mut() {
            let tail = upsampler.finish();
            self.pending.extend_from_slice(&tail);
        }
        let frame = nnnoiseless::DenoiseState::FRAME_SIZE;
        let remainder = self.pending.len() % frame;
        if remainder != 0 {
            self.pending
                .resize(self.pending.len() + frame - remainder, 0.0);
        }
        self.drain_frames(out);
    }

    fn drain_frames(&mut self, out: &mut Vec<f32>) {
        let frame = nnnoiseless::DenoiseState::FRAME_SIZE;
        while self.pending.len() >= frame {
            for (slot, &sample) in self.frame_in.iter_mut().zip(self.pending.iter()) {
                *slot = sample * RNNOISE_SCALE;
            }
            if self.failed {
                self.frame_out.copy_from_slice(&self.frame_in);
            } else {
                self.state
                    .process_frame(&mut self.frame_out, &self.frame_in);
                if !self.frame_out.iter().all(|sample| sample.is_finite()) {
                    // A non-finite sample here would be permanent rather than local: the
                    // biquads downstream feed their own output back, so one NaN reaching
                    // their state silences the entire rest of the session.
                    self.failed = true;
                    self.frame_out.copy_from_slice(&self.frame_in);
                }
            }
            let emitted: &[f32] = if self.seeded {
                &self.frame_out
            } else {
                self.seeded = true;
                &self.frame_in
            };
            out.extend(emitted.iter().map(|sample| sample / RNNOISE_SCALE));
            self.pending.drain(..frame);
        }
    }
}

/// Trailing-silence detection against a noise floor estimated from the signal itself.
///
/// The absolute threshold this replaces assumed a quantity it had no way to know. At -40 dBFS
/// it sat below the noise floor of an ordinary room with a fan running, so every window looked
/// like speech, the trailing-silence timer never advanced, and dictation ran to the duration
/// cap; against a quiet room and a softly-spoken phrase it sat above the speech instead, so no
/// speech was ever registered and the same auto-stop never fired.
///
/// The floor is the minimum window RMS over the recent past. That has no feedback path: an
/// exponential estimate has to decide whether to keep adapting while it believes speech is
/// present, and both answers fail — adapting lets a long utterance drag the floor up to its own
/// level, and freezing deadlocks, because the state that would release the freeze is gated on
/// the estimate that is frozen. A minimum simply cannot be pushed upward by loud input.
struct SpeechDetector {
    window_samples: usize,
    /// Partial window carried across callbacks; cpal chunk sizes have nothing to do with the
    /// detection window, so a window routinely spans two of them.
    window: Vec<f32>,
    sub_minima: [f32; NOISE_FLOOR_SUBS],
    current_min: f32,
    windows_in_sub: usize,
    speech: bool,
}

impl SpeechDetector {
    fn new(sample_rate: u32) -> Self {
        let window_samples = ((sample_rate as usize * DETECT_WINDOW_MS) / 1000).max(1);
        Self {
            window_samples,
            window: Vec::with_capacity(window_samples),
            sub_minima: [f32::INFINITY; NOISE_FLOOR_SUBS],
            current_min: f32::INFINITY,
            windows_in_sub: 0,
            speech: false,
        }
    }

    /// Feed target-rate mono samples. Returns true when any completed window was speech.
    fn observe(&mut self, samples: &[f32]) -> bool {
        let mut heard = false;
        for &sample in samples {
            self.window.push(sample);
            if self.window.len() < self.window_samples {
                continue;
            }
            let level = rms(&self.window);
            self.window.clear();
            if self.classify(level) {
                heard = true;
            }
        }
        heard
    }

    fn classify(&mut self, level: f32) -> bool {
        self.current_min = self.current_min.min(level);
        self.windows_in_sub += 1;
        if self.windows_in_sub >= NOISE_FLOOR_SUB_WINDOWS {
            self.sub_minima.rotate_left(1);
            self.sub_minima[NOISE_FLOOR_SUBS - 1] = self.current_min;
            self.current_min = f32::INFINITY;
            self.windows_in_sub = 0;
        }

        let tracked = self
            .sub_minima
            .iter()
            .copied()
            .fold(self.current_min, f32::min);
        // Before the first sub-block closes there may be no history at all; the window that
        // just arrived is then the best estimate available, which makes the first window
        // non-speech rather than guessing.
        let floor = if tracked.is_finite() { tracked } else { level };
        let base = floor.max(ABS_NOISE_FLOOR);

        if self.speech {
            if level < base * SPEECH_EXIT_RATIO {
                self.speech = false;
            }
        } else if level > base * SPEECH_ENTER_RATIO {
            self.speech = true;
        }
        self.speech
    }
}

/// The whole capture-side signal chain, from interleaved device frames to target-rate mono.
///
/// This exists so the audio callback has exactly one thing to call and one lock to take. It
/// also puts the band-limiting where it has to be — *before* the resampler. Linear
/// interpolation does not attenuate what sits above the output Nyquist, so without this the
/// 8-24 kHz half of a 48 kHz capture folded straight back into the speech band: a 12 kHz
/// keyboard transient arrived as a 4 kHz artefact at -1.8 dB. Band-limiting first is what
/// makes the existing interpolator correct rather than replacing it.
struct CaptureFrontend {
    channels: u16,
    /// Runs first when enabled, so the model sees the signal it was trained on rather than
    /// one an equaliser has already reshaped.
    denoise: Option<DenoiseStage>,
    highpass: BiquadCascade,
    /// `None` when the target rate is not below the source rate: nothing can alias, so a
    /// low-pass would only shave the passband for free.
    antialias: Option<BiquadCascade>,
    resampler: StreamingLinearResampler,
    detector: SpeechDetector,
    /// Reused across callbacks so the per-callback work stays a copy plus arithmetic.
    mono: Vec<f32>,
}

impl CaptureFrontend {
    fn new(input_rate: u32, output_rate: u32, channels: u16, noise_suppression: bool) -> Self {
        let denoise = if noise_suppression {
            Some(DenoiseStage::new(input_rate.max(1)))
        } else {
            None
        };
        // With suppression on, the rest of the chain sees the model's rate, not the device's.
        let stage_rate = if denoise.is_some() {
            RNNOISE_RATE
        } else {
            input_rate.max(1)
        };
        let target_rate = if output_rate > 0 {
            output_rate
        } else {
            stage_rate
        };
        let antialias = if output_rate > 0 && output_rate < stage_rate {
            Some(BiquadCascade::butterworth_lowpass(
                stage_rate as f64,
                ANTIALIAS_CUTOFF_RATIO * output_rate as f64,
                ANTIALIAS_ORDER,
            ))
        } else {
            None
        };
        Self {
            channels,
            denoise,
            highpass: BiquadCascade::butterworth_highpass(
                stage_rate as f64,
                CAPTURE_HIGHPASS_HZ,
                CAPTURE_HIGHPASS_ORDER,
            ),
            antialias,
            resampler: StreamingLinearResampler::new(stage_rate, output_rate),
            detector: SpeechDetector::new(target_rate),
            mono: Vec::new(),
        }
    }

    /// Denoise, band-limit and resample one device callback's worth of frames.
    fn push(&mut self, interleaved: &[f32]) -> Vec<f32> {
        self.mono.clear();
        downmix_to_mono_into(interleaved, self.channels, &mut self.mono);
        // A single non-finite sample from a misbehaving driver has to be stopped here. The
        // cascades below are recursive, so a NaN that reaches their state is not one bad
        // sample — it is every sample from that point to the end of the session.
        for sample in self.mono.iter_mut() {
            if !sample.is_finite() {
                *sample = 0.0;
            }
        }
        if let Some(denoise) = self.denoise.as_mut() {
            denoise.process(&mut self.mono);
        }
        self.band_limit_and_resample()
    }

    /// Whether the target-rate samples just produced contained speech.
    fn observe_speech(&mut self, output: &[f32]) -> bool {
        self.detector.observe(output)
    }

    /// Flush the denoise stage's partial frame and the resampler's look-ahead sample.
    fn finish(&mut self) -> Vec<f32> {
        let mut out = Vec::new();
        if let Some(denoise) = self.denoise.as_mut() {
            denoise.finish(&mut self.mono);
            if !self.mono.is_empty() {
                out.extend_from_slice(&self.band_limit_and_resample());
            }
        }
        out.extend_from_slice(&self.resampler.finish());
        out
    }

    fn band_limit_and_resample(&mut self) -> Vec<f32> {
        self.highpass.process_in_place(&mut self.mono);
        if let Some(antialias) = self.antialias.as_mut() {
            antialias.process_in_place(&mut self.mono);
        }
        self.resampler.push(&self.mono)
    }
}

/// Decode WAV/MP3 (and any other enabled symphonia codec) bytes to interleaved
/// f32 PCM, returning `(samples, sample_rate, channels)`.
fn decode_audio(bytes: Vec<u8>) -> std::result::Result<(Vec<f32>, u32, u16), String> {
    decode_audio_limited(bytes, MAX_DECODED_SAMPLES)
}

/// The limit is a parameter so the guard can be exercised without synthesising a
/// five-minute file; `decode_audio` is the only caller that picks a real one.
fn decode_audio_limited(
    bytes: Vec<u8>,
    max_samples: usize,
) -> std::result::Result<(Vec<f32>, u32, u16), String> {
    use symphonia::core::audio::SampleBuffer;
    use symphonia::core::codecs::{CODEC_TYPE_NULL, DecoderOptions};
    use symphonia::core::errors::Error as SymphoniaError;
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let stream = MediaSourceStream::new(Box::new(Cursor::new(bytes)), Default::default());
    let probed = symphonia::default::get_probe()
        .format(
            &Hint::new(),
            stream,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|error| format!("probe-failed: {error}"))?;
    let mut format = probed.format;

    let track = format
        .tracks()
        .iter()
        .find(|track| track.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| "no-audio-track".to_string())?;
    let track_id = track.id;

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &DecoderOptions::default())
        .map_err(|error| format!("decoder-make-failed: {error}"))?;

    let mut samples: Vec<f32> = Vec::new();
    let mut sample_rate: u32 = 0;
    let mut channels: u16 = 0;

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(SymphoniaError::ResetRequired) => break,
            Err(error) => return Err(format!("packet-read-failed: {error}")),
        };
        if packet.track_id() != track_id {
            continue;
        }
        match decoder.decode(&packet) {
            Ok(buffer) => {
                let spec = *buffer.spec();
                sample_rate = spec.rate;
                channels = spec.channels.count() as u16;
                let mut sample_buffer = SampleBuffer::<f32>::new(buffer.capacity() as u64, spec);
                sample_buffer.copy_interleaved_ref(buffer);
                samples.extend_from_slice(sample_buffer.samples());

                // Checked here rather than up front: the input byte length bounds
                // an uncompressed file, but says almost nothing about a compressed
                // one. This bounds what actually gets allocated.
                if samples.len() > max_samples {
                    return Err(format!(
                        "audio-too-long: decoded past {max_samples} samples"
                    ));
                }
            }
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(SymphoniaError::IoError(error))
                if error.kind() == std::io::ErrorKind::UnexpectedEof =>
            {
                break;
            }
            Err(error) => return Err(format!("decode-failed: {error}")),
        }
    }

    if samples.is_empty() || sample_rate == 0 || channels == 0 {
        return Err("no-audio-decoded".to_string());
    }
    Ok((samples, sample_rate, channels))
}

/// A live playback session: just a stop flag. The cpal output `Stream` lives on
/// the playback thread (it is not Send); the thread self-removes on completion.
struct PlaybackHandle {
    stop_flag: Arc<AtomicBool>,
}

static PLAYBACKS: OnceLock<Mutex<HashMap<String, PlaybackHandle>>> = OnceLock::new();
static PLAYBACK_COUNTER: AtomicU64 = AtomicU64::new(0);

fn playbacks() -> &'static Mutex<HashMap<String, PlaybackHandle>> {
    PLAYBACKS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn playbacks_remove(playback_id: &str) {
    lock(playbacks()).remove(playback_id);
}

fn next_playback_id() -> String {
    let counter = PLAYBACK_COUNTER.fetch_add(1, Ordering::Relaxed);
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_nanos())
        .unwrap_or(0);
    format!("play-{nanos:x}-{counter:x}")
}

fn playback_thread_main(
    playback_id: String,
    mono_source: Vec<f32>,
    source_rate: u32,
    stop_flag: Arc<AtomicBool>,
) {
    let host = cpal::default_host();
    let Some(device) = host.default_output_device() else {
        eprintln!("[tuff-native-audio] no output device");
        playbacks_remove(&playback_id);
        return;
    };
    let supported = match device.default_output_config() {
        Ok(config) => config,
        Err(error) => {
            eprintln!("[tuff-native-audio] default-output-config-failed: {error}");
            playbacks_remove(&playback_id);
            return;
        }
    };

    let sample_format = supported.sample_format();
    let channels = supported.channels();
    let output_rate = supported.sample_rate();
    let config = cpal::StreamConfig {
        channels,
        sample_rate: output_rate,
        buffer_size: cpal::BufferSize::Default,
    };

    // Resample to the device rate up front so the audio callback stays a copy.
    let rendered = Arc::new(resample_linear(&mono_source, source_rate, output_rate));
    let position = Arc::new(AtomicUsize::new(0));

    let stream = match build_output_stream(
        &device,
        &config,
        sample_format,
        rendered.clone(),
        position.clone(),
        channels,
    ) {
        Ok(stream) => stream,
        Err(error) => {
            eprintln!("[tuff-native-audio] {error}");
            playbacks_remove(&playback_id);
            return;
        }
    };

    if let Err(error) = stream.play() {
        eprintln!("[tuff-native-audio] output-play-failed: {error}");
        playbacks_remove(&playback_id);
        return;
    }

    let total = rendered.len();
    loop {
        if stop_flag.load(Ordering::Relaxed) {
            break;
        }
        if position.load(Ordering::Relaxed) >= total {
            // Let the device flush its last buffered frames before dropping the stream.
            thread::sleep(Duration::from_millis(120));
            break;
        }
        thread::sleep(Duration::from_millis(20));
    }

    drop(stream);
    playbacks_remove(&playback_id);
}

fn build_output_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    sample_format: cpal::SampleFormat,
    rendered: Arc<Vec<f32>>,
    position: Arc<AtomicUsize>,
    channels: u16,
) -> std::result::Result<cpal::Stream, String> {
    match sample_format {
        cpal::SampleFormat::F32 => {
            build_output_typed::<f32>(device, config, rendered, position, channels, |sample| {
                sample
            })
        }
        cpal::SampleFormat::I16 => {
            build_output_typed::<i16>(device, config, rendered, position, channels, |sample| {
                (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16
            })
        }
        cpal::SampleFormat::U16 => {
            build_output_typed::<u16>(device, config, rendered, position, channels, |sample| {
                ((sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i32 + 32_768) as u16
            })
        }
        other => Err(format!("unsupported-output-format: {other:?}")),
    }
}

fn build_output_typed<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    rendered: Arc<Vec<f32>>,
    position: Arc<AtomicUsize>,
    channels: u16,
    convert: impl Fn(f32) -> T + Send + 'static,
) -> std::result::Result<cpal::Stream, String>
where
    T: cpal::SizedSample + Send + 'static,
{
    let channel_count = channels.max(1) as usize;
    let error_fn = |error| eprintln!("[tuff-native-audio] output stream error: {error}");
    device
        .build_output_stream(
            *config,
            move |data: &mut [T], _: &cpal::OutputCallbackInfo| {
                // `data` is interleaved frames; write each mono sample across all channels.
                for frame in data.chunks_mut(channel_count) {
                    let index = position.fetch_add(1, Ordering::Relaxed);
                    let value = convert(rendered.get(index).copied().unwrap_or(0.0));
                    for slot in frame.iter_mut() {
                        *slot = value;
                    }
                }
            },
            error_fn,
            None,
        )
        .map_err(|error| format!("build-output-stream-failed: {error}"))
}

#[cfg(target_os = "macos")]
fn accessibility_trusted() -> bool {
    // ApplicationServices' AXIsProcessTrusted() returns a C `Boolean` (u8).
    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn AXIsProcessTrusted() -> u8;
    }
    unsafe { AXIsProcessTrusted() != 0 }
}

#[cfg(not(target_os = "macos"))]
fn accessibility_trusted() -> bool {
    true
}

// napi's Rust runtime references these Node-provided symbols; under `cargo test`
// there is no Node process to resolve them, so we supply inert stubs (mirrors the
// native-screenshot crate).
#[cfg(test)]
#[unsafe(no_mangle)]
extern "C" fn napi_delete_reference(
    _env: napi::sys::napi_env,
    _ref: napi::sys::napi_ref,
) -> napi::sys::napi_status {
    napi::Status::Ok as napi::sys::napi_status
}

#[cfg(test)]
#[unsafe(no_mangle)]
extern "C" fn napi_reference_unref(
    _env: napi::sys::napi_env,
    _ref: napi::sys::napi_ref,
    result: *mut u32,
) -> napi::sys::napi_status {
    if !result.is_null() {
        unsafe {
            *result = 0;
        }
    }
    napi::Status::Ok as napi::sys::napi_status
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rms_of_silence_is_zero() {
        assert_eq!(rms(&[]), 0.0);
        assert_eq!(rms(&[0.0, 0.0, 0.0, 0.0]), 0.0);
    }

    #[test]
    fn rms_of_full_scale_square_wave_is_one() {
        assert!((rms(&[-1.0, 1.0, -1.0, 1.0]) - 1.0).abs() < 1e-6);
    }

    #[test]
    fn rms_of_constant_amplitude() {
        assert!((rms(&[0.5, -0.5, 0.5, -0.5]) - 0.5).abs() < 1e-6);
    }

    /// Long enough that a wait which actually blocks for it is unmistakable, so the
    /// assertions below discriminate on "did it wake" rather than on wall-clock noise.
    const NEVER: Duration = Duration::from_secs(30);
    /// Generous ceiling for something that is meant to return at once.
    const PROMPTLY: Duration = Duration::from_secs(5);

    #[test]
    fn a_stop_requested_before_the_wait_is_not_lost() {
        // The lost wakeup the mutex exists to prevent: with a bare atomic, a request
        // that lands before the thread waits is invisible until the next poll.
        let sync = StopSignal::default();
        sync.request(StopRequest::Stop);

        let started = Instant::now();
        assert_eq!(
            wait_for_stop_request(&sync, NEVER),
            Some(StopReason::Manual)
        );
        assert!(started.elapsed() < PROMPTLY);
    }

    #[test]
    fn a_stop_requested_during_the_wait_ends_it_at_once() {
        let sync = Arc::new(StopSignal::default());
        let requester = Arc::clone(&sync);
        let handle = thread::spawn(move || {
            thread::sleep(Duration::from_millis(20));
            requester.request(StopRequest::Cancel);
        });

        let started = Instant::now();
        assert_eq!(
            wait_for_stop_request(&sync, NEVER),
            Some(StopReason::Cancelled)
        );
        assert!(started.elapsed() < PROMPTLY);
        handle.join().unwrap();
    }

    #[test]
    fn an_expired_wait_reports_no_request() {
        // Without this, a wait that returned Some unconditionally would pass the two
        // tests above while ending every session the moment it started.
        let sync = StopSignal::default();
        assert_eq!(
            wait_for_stop_request(&sync, Duration::from_millis(10)),
            None
        );
    }

    #[test]
    fn cancel_outranks_a_stop_that_arrived_first() {
        // Order matters: a cancelled session is discarded, a stopped one is kept.
        let sync = StopSignal::default();
        sync.request(StopRequest::Stop);
        sync.request(StopRequest::Cancel);

        assert_eq!(
            wait_for_stop_request(&sync, NEVER),
            Some(StopReason::Cancelled)
        );
    }

    #[test]
    fn waiting_on_a_thread_that_never_finishes_is_bounded() {
        // The whole point: this runs on the Electron main thread, so a wedged device
        // teardown has to cost a bounded hitch rather than the process.
        let sync = StopSignal::default();

        let started = Instant::now();
        assert!(!wait_until_finished(&sync, Duration::from_millis(30)));
        assert!(started.elapsed() < PROMPTLY);
    }

    #[test]
    fn a_finish_signalled_before_the_wait_is_seen() {
        // The same lost wakeup, in the other direction.
        let sync = StopSignal::default();
        sync.mark_finished();

        let started = Instant::now();
        assert!(wait_until_finished(&sync, NEVER));
        assert!(started.elapsed() < PROMPTLY);
    }

    #[test]
    fn a_finish_signalled_during_the_wait_ends_it_at_once() {
        let sync = Arc::new(StopSignal::default());
        let finisher = Arc::clone(&sync);
        let handle = thread::spawn(move || {
            thread::sleep(Duration::from_millis(20));
            finisher.mark_finished();
        });

        let started = Instant::now();
        assert!(wait_until_finished(&sync, NEVER));
        assert!(started.elapsed() < PROMPTLY);
        handle.join().unwrap();
    }

    /// Replays what `snapshot_capture` does across a sequence of polls, without
    /// needing a capture device: feed the interleaved buffer in growing prefixes.
    ///
    /// Calls the same two functions the napi entry point does, so a mutation to
    /// either is caught here rather than hidden behind a parallel implementation.
    fn snapshot_prefixes(interleaved: &[f32], channels: u16, cuts: &[usize]) -> Vec<u8> {
        let mut cache = SnapshotCache::default();
        for &visible in cuts {
            let range = snapshot_delta_range(cache.consumed, visible, channels);
            extend_snapshot(&mut cache, &interleaved[range], channels);
        }
        cache.pcm
    }

    #[test]
    fn a_decode_stops_once_it_passes_the_sample_limit() {
        // Positive control first: the same file decodes fine under a limit it fits.
        let wav = encode_wav_pcm16(&[0.1, -0.2, 0.3, -0.4, 0.5], 16_000).unwrap();
        let (samples, rate, channels) = decode_audio_limited(wav.clone(), 1_000).unwrap();
        assert_eq!(samples.len(), 5);
        assert_eq!((rate, channels), (16_000, 1));

        // And refuses once it would exceed one.
        let error = decode_audio_limited(wav, 2).unwrap_err();
        assert!(error.starts_with("audio-too-long"), "{error}");
    }

    /// Encodes already-interleaved PCM at an arbitrary channel count.
    ///
    /// `encode_wav_pcm16` is mono-only by construction, which is why the decode coverage above
    /// cannot see channel order at all.
    fn encode_wav_pcm16_interleaved(
        interleaved: &[f32],
        channels: u16,
        sample_rate: u32,
    ) -> Vec<u8> {
        let spec = hound::WavSpec {
            channels,
            sample_rate,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        let mut cursor = Cursor::new(Vec::<u8>::new());
        {
            let mut writer = hound::WavWriter::new(&mut cursor, spec).unwrap();
            for &sample in interleaved {
                let scaled = (sample.clamp(-1.0, 1.0) * i16::MAX as f32).round();
                writer.write_sample(scaled as i16).unwrap();
            }
            writer.finalize().unwrap();
        }
        cursor.into_inner()
    }

    /// The decode path's channel order, which nothing else covers.
    ///
    /// `a_decode_stops_once_it_passes_the_sample_limit` is a real round trip, but it is mono and
    /// asserts only the sample count, so a decoder that emitted frames in the wrong channel order
    /// -- or dropped a channel and duplicated the other -- would pass it unchanged. That is the
    /// mistake a rewrite of the interleaving is most likely to make, and it corrupts audio
    /// silently rather than failing anything.
    ///
    /// Left and right carry deliberately different magnitudes *and* signs so a swap, a duplicate
    /// and a drop each produce a different wrong answer.
    #[test]
    fn a_stereo_decode_preserves_interleaved_channel_order() {
        // L = 0.5, 0.25, 0.125   R = -0.75, -0.375, -0.1875
        let interleaved = [0.5_f32, -0.75, 0.25, -0.375, 0.125, -0.1875];
        let wav = encode_wav_pcm16_interleaved(&interleaved, 2, 44_100);

        let (samples, rate, channels) = decode_audio_limited(wav, 1_000).unwrap();

        assert_eq!((rate, channels), (44_100, 2));
        assert_eq!(samples.len(), interleaved.len(), "frame count changed");

        // i16 quantisation is the only permitted difference: one LSB is 1/32767.
        let tolerance = 2.0 / i16::MAX as f32;
        for (index, (&actual, &expected)) in samples.iter().zip(interleaved.iter()).enumerate() {
            assert!(
                (actual - expected).abs() <= tolerance,
                "sample {index}: expected {expected}, got {actual}"
            );
        }
    }

    #[test]
    fn an_oversized_input_is_refused_before_it_is_decoded() {
        // Bounds the uncompressed case. The sample limit above bounds the
        // compressed one, which this cannot see.
        let error = play_audio_blocking(vec![0u8; MAX_PLAYBACK_INPUT_BYTES + 1]).unwrap_err();
        assert!(
            error.reason.starts_with("audio-too-large"),
            "{}",
            error.reason
        );
    }

    #[test]
    fn the_shipped_limits_are_the_ones_the_docs_promise() {
        // audio.d.ts tells callers 64 MiB and five minutes of 48 kHz stereo, and the
        // rejection reasons are part of the API. Drifting either silently changes
        // what the binding accepts.
        assert_eq!(MAX_PLAYBACK_INPUT_BYTES, 67_108_864);
        assert_eq!(MAX_DECODED_SAMPLES, 28_800_000);
    }

    #[test]
    fn a_wav_built_from_cached_pcm_is_the_one_hound_would_have_written() {
        // The property the whole cache rests on. If these ever diverge, snapshots
        // silently become a differently-encoded file rather than failing.
        for channels in [1u16, 2] {
            for frames in [0usize, 1, 7, 512] {
                let interleaved: Vec<f32> = (0..frames * channels as usize)
                    .map(|index| ((index as f32) * 0.017).sin())
                    .collect();
                let mono = downmix_to_mono(&interleaved, channels);

                let whole = encode_wav_pcm16(&mono, 48_000).unwrap();
                let assembled = wav_from_pcm16(&pcm16_le_bytes(&mono), 48_000).unwrap();

                assert_eq!(assembled, whole, "channels={channels} frames={frames}");
            }
        }
    }

    #[test]
    fn encoding_in_pieces_matches_encoding_all_at_once() {
        // Same recording, polled at different moments, has to reach the same bytes
        // as a single encode of the finished buffer.
        let channels = 2u16;
        let interleaved: Vec<f32> = (0..2_000).map(|i| ((i as f32) * 0.013).cos()).collect();
        let whole = pcm16_le_bytes(&downmix_to_mono(&interleaved, channels));

        for cuts in [
            vec![2_000],
            vec![10, 2_000],
            vec![10, 11, 12, 1_999, 2_000],
            vec![400, 800, 1_200, 1_600, 2_000],
        ] {
            assert_eq!(
                snapshot_prefixes(&interleaved, channels, &cuts),
                whole,
                "cuts={cuts:?}"
            );
        }
    }

    #[test]
    fn a_snapshot_never_splits_a_frame() {
        // An odd visible length on a stereo buffer must defer the half frame rather
        // than downmix it against the wrong neighbour, which would shift every
        // sample after it.
        let interleaved: Vec<f32> = (0..8).map(|index| index as f32 / 8.0).collect();

        // Poll after 3 samples (one and a half frames), then after all 8.
        let staged = snapshot_prefixes(&interleaved, 2, &[3, 8]);
        let whole = pcm16_le_bytes(&downmix_to_mono(&interleaved, 2));
        assert_eq!(staged, whole);
    }

    /// A session handle whose thread has already exited, so the reaper can be
    /// exercised without a capture device.
    fn finished_session(stopped_at: Option<Instant>, last_read: Instant) -> SessionHandle {
        SessionHandle {
            sync: Arc::new(StopSignal::default()),
            samples: Arc::new(Mutex::new(Vec::new())),
            snapshot: Arc::new(Mutex::new(SnapshotCache::default())),
            meta: Arc::new(Mutex::new(CaptureMeta {
                sample_rate: 48_000,
                channels: 1,
                stopped_reason: stopped_at.map(|_| StopReason::MaxDuration),
                stopped_at,
            })),
            join_handle: thread::spawn(|| {}),
            drain_cursor: Arc::new(AtomicUsize::new(0)),
            last_read: Mutex::new(last_read),
        }
    }

    #[test]
    fn a_running_session_is_never_abandoned() {
        // However long it has been going: the caller may simply be recording.
        let now = Instant::now();
        let ancient = now - Duration::from_secs(3_600);
        assert!(!session_is_abandoned(
            None,
            ancient,
            now,
            ABANDONED_SESSION_TTL
        ));
    }

    #[test]
    fn a_stopped_session_survives_until_the_window_passes() {
        let now = Instant::now();
        let stopped = now - ABANDONED_SESSION_TTL + Duration::from_secs(1);
        assert!(!session_is_abandoned(
            Some(stopped),
            stopped,
            now,
            ABANDONED_SESSION_TTL
        ));

        let older = now - ABANDONED_SESSION_TTL;
        assert!(session_is_abandoned(
            Some(older),
            older,
            now,
            ABANDONED_SESSION_TTL
        ));
    }

    #[test]
    fn a_session_someone_is_still_reading_is_never_reaped() {
        // The half that decides whether this is a safety net or a bug: a caller
        // polling towards its own collection must not have the session pulled out
        // from under it, however long ago the thread stopped.
        let now = Instant::now();
        let stopped_long_ago = now - Duration::from_secs(3_600);
        assert!(!session_is_abandoned(
            Some(stopped_long_ago),
            now - Duration::from_secs(1),
            now,
            ABANDONED_SESSION_TTL
        ));
    }

    #[test]
    fn reaping_removes_only_the_unreachable_sessions() {
        let now = Instant::now();
        let stale = now - Duration::from_secs(3_600);
        let mut map = HashMap::new();
        map.insert(
            "abandoned".to_string(),
            finished_session(Some(stale), stale),
        );
        map.insert("running".to_string(), finished_session(None, stale));
        map.insert(
            "just-collected".to_string(),
            finished_session(Some(stale), now),
        );

        let reaped = reap_abandoned_sessions(&mut map, now, ABANDONED_SESSION_TTL);

        assert_eq!(reaped, 1);
        let mut left: Vec<_> = map.keys().cloned().collect();
        left.sort();
        assert_eq!(
            left,
            vec!["just-collected".to_string(), "running".to_string()]
        );
    }

    #[test]
    fn a_read_moves_a_session_out_of_the_reaper_s_reach() {
        // touch_session is what the poll/snapshot/drain entry points call; without
        // it every long-running collection would be a race against the TTL.
        let now = Instant::now();
        let stale = now - Duration::from_secs(3_600);
        let handle = finished_session(Some(stale), stale);

        touch_session(&handle);

        let last_read = *lock(&handle.last_read);
        assert!(!session_is_abandoned(
            Some(stale),
            last_read,
            Instant::now(),
            ABANDONED_SESSION_TTL
        ));
    }

    #[test]
    fn a_finished_capture_records_when_it_stopped() {
        // The reaper's clock. Without it every stopped session looks equally old.
        let meta = Mutex::new(CaptureMeta::default());
        let sync = StopSignal::default();

        finish_capture(StopReason::Silence, &meta, &sync);

        assert!(lock(&meta).stopped_at.is_some());
    }

    #[test]
    fn a_finished_capture_announces_itself_as_well_as_recording_why() {
        // Recording the reason without announcing it is the quiet failure here: every
        // stop would still work, just 500ms slower, which is exactly the kind of thing
        // that survives review.
        let meta = Mutex::new(CaptureMeta::default());
        let sync = StopSignal::default();

        finish_capture(StopReason::Silence, &meta, &sync);

        assert_eq!(lock(&meta).stopped_reason, Some(StopReason::Silence));
        assert!(wait_until_finished(&sync, NEVER));
    }

    #[test]
    fn silence_requires_prior_speech() {
        // Never stop for silence before any speech, no matter how long we wait.
        assert!(!should_stop_for_silence(false, 100_000, 0, 1_500));
    }

    #[test]
    fn silence_waits_for_full_quiet_window() {
        assert!(!should_stop_for_silence(true, 2_000, 1_000, 1_500)); // 1000ms quiet
        assert!(should_stop_for_silence(true, 2_500, 1_000, 1_500)); // exactly 1500ms
        assert!(should_stop_for_silence(true, 2_600, 1_000, 1_500)); // 1600ms quiet
    }

    #[test]
    fn downmix_averages_stereo_frames() {
        // Interleaved L/R frames (1,3) and (2,4) average to (2, 3).
        assert_eq!(downmix_to_mono(&[1.0, 3.0, 2.0, 4.0], 2), vec![2.0, 3.0]);
    }

    #[test]
    fn downmix_passes_through_mono_and_treats_zero_as_mono() {
        assert_eq!(downmix_to_mono(&[0.1, 0.2, 0.3], 1), vec![0.1, 0.2, 0.3]);
        assert_eq!(downmix_to_mono(&[0.1, 0.2], 0), vec![0.1, 0.2]);
    }

    #[test]
    fn mono_duration_is_samples_over_rate() {
        assert_eq!(mono_duration_ms(16_000, 16_000), 1_000);
        assert_eq!(mono_duration_ms(8_000, 16_000), 500);
        assert_eq!(mono_duration_ms(0, 16_000), 0);
        assert_eq!(mono_duration_ms(100, 0), 0);
    }

    #[test]
    fn encode_wav_roundtrips_via_hound() {
        let samples = vec![0.0f32, 0.5, -0.5, 1.0, -1.0];
        let bytes = encode_wav_pcm16(&samples, 16_000).expect("encode should succeed");

        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WAVE");

        let mut reader = hound::WavReader::new(Cursor::new(bytes)).expect("valid wav");
        let spec = reader.spec();
        assert_eq!(spec.channels, 1);
        assert_eq!(spec.sample_rate, 16_000);
        assert_eq!(spec.bits_per_sample, 16);

        let decoded: Vec<i16> = reader
            .samples::<i16>()
            .map(|sample| sample.expect("sample"))
            .collect();
        assert_eq!(decoded.len(), samples.len());
        assert_eq!(decoded[0], 0);
        assert_eq!(decoded[3], i16::MAX); // 1.0 -> 32767
        assert_eq!(decoded[4], -i16::MAX); // -1.0 -> -32767
    }

    #[test]
    fn empty_pcm_encodes_to_bare_44_byte_wav_header() {
        // snapshot_capture over a not-yet-populated buffer returns a header-only
        // WAV; the streaming consumer gates real partials on `audio.length > 44`,
        // so this canonical 16-bit-PCM header must be exactly 44 bytes.
        let bytes = encode_wav_pcm16(&[], 16_000).expect("encode empty should succeed");
        assert_eq!(bytes.len(), 44);
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WAVE");
    }

    #[test]
    fn pcm16_le_bytes_encodes_signed_little_endian() {
        // 0.0 -> 0x0000 ; 1.0 -> 0x7FFF ; -1.0 -> 0x8001 (= -32767)
        let bytes = pcm16_le_bytes(&[0.0, 1.0, -1.0]);
        assert_eq!(bytes, vec![0x00, 0x00, 0xFF, 0x7F, 0x01, 0x80]);
    }

    #[test]
    fn resample_linear_passthrough_and_ratio() {
        // Matching rate is an identity clone.
        assert_eq!(
            resample_linear(&[0.1, 0.2, 0.3], 16_000, 16_000),
            vec![0.1, 0.2, 0.3]
        );
        // Degenerate inputs clone through.
        assert!(resample_linear(&[], 16_000, 48_000).is_empty());
        assert_eq!(resample_linear(&[0.5, 0.5], 16_000, 0), vec![0.5, 0.5]);
        // Halving the rate halves the sample count; doubling doubles it.
        assert_eq!(
            resample_linear(&[0.0, 1.0, 0.0, 1.0], 32_000, 16_000).len(),
            2
        );
        assert_eq!(
            resample_linear(&[0.0, 1.0, 0.0, 1.0], 16_000, 32_000).len(),
            8
        );
    }

    /// Drive the production streaming resampler with deterministic chunk boundaries.
    /// This helper only concatenates its outputs; interpolation remains owned by
    /// `StreamingLinearResampler`.
    fn stream_resample(
        input: &[f32],
        rate_in: u32,
        rate_out: u32,
        chunk_sizes: &[usize],
    ) -> Vec<f32> {
        let mut resampler = StreamingLinearResampler::new(rate_in, rate_out);
        let mut output = Vec::new();
        let mut offset = 0;

        for &chunk_size in chunk_sizes {
            let end = (offset + chunk_size).min(input.len());
            output.extend(resampler.push(&input[offset..end]));
            offset = end;
        }

        assert_eq!(
            offset,
            input.len(),
            "chunk sizes must cover the complete input"
        );
        output.extend(resampler.finish());
        output
    }

    #[test]
    fn streaming_resampler_keeps_samples_when_rates_match() {
        let input = [-0.75_f32, -0.25, 0.0, 0.375, 0.875];
        let output = stream_resample(&input, 16_000, 16_000, &[2, 1, 2]);

        assert_eq!(output, input);
    }

    #[test]
    fn streaming_48khz_to_16khz_matches_one_shot_and_flushes_the_tail() {
        let input: Vec<f32> = (0..480)
            .map(|index| ((index as f32) * 0.031).sin())
            .collect();
        let expected = resample_linear(&input, 48_000, 16_000);
        let output = stream_resample(&input, 48_000, 16_000, &[73, 127, 280]);

        assert_eq!(output.len(), expected.len(), "stream output count changed");
        assert_eq!(output, expected, "chunk boundaries changed interpolation");

        // `finish` may be empty when non-final `push` already had enough look-ahead;
        // the combined stream must still preserve the one-shot endpoint exactly.
        let mut resampler = StreamingLinearResampler::new(48_000, 16_000);
        let mut flushed = resampler.push(&input);
        flushed.extend(resampler.finish());
        assert_eq!(flushed, expected, "finish dropped or duplicated samples");

        // A short upsample has no look-ahead frame available to `push`; finish must
        // still materialize the endpoint(s) prescribed by the one-shot contract.
        let short = [0.25_f32];
        let expected_short = resample_linear(&short, 8_000, 16_000);
        let mut short_resampler = StreamingLinearResampler::new(8_000, 16_000);
        let mut short_output = short_resampler.push(&short);
        short_output.extend(short_resampler.finish());
        assert!(
            !short_output.is_empty(),
            "finish emitted no short-input tail"
        );
        assert_eq!(short_output, expected_short);
    }

    #[test]
    fn streaming_16khz_to_8khz_has_no_duplicate_or_missing_endpoint() {
        let input: Vec<f32> = (0..16).map(|index| index as f32).collect();
        let output = stream_resample(&input, 16_000, 8_000, &[3, 5, 8]);

        assert_eq!(output, vec![0.0, 2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0]);
        assert_eq!(output.len(), 8);
        assert_ne!(output[output.len() - 1], input[input.len() - 1]);
    }

    #[test]
    fn streaming_chunks_equal_full_resample_for_non_integer_target_rate() {
        let input: Vec<f32> = (0..441)
            .map(|index| ((index as f32) * 0.017).cos())
            .collect();
        let expected = resample_linear(&input, 44_100, 16_000);
        let output = stream_resample(&input, 44_100, 16_000, &[1, 17, 64, 3, 89, 267]);

        assert_eq!(output.len(), expected.len());
        for (index, (&actual, &wanted)) in output.iter().zip(expected.iter()).enumerate() {
            assert!(
                (actual - wanted).abs() <= 1e-6,
                "sample {index}: expected {wanted}, got {actual}"
            );
        }
    }

    #[test]
    fn support_reports_ready_when_input_probe_true() {
        let support = build_native_audio_support("macos".to_string(), true, Ok(true));
        assert!(support.supported);
        assert_eq!(support.platform, "macos");
        assert_eq!(support.reason, None);
    }

    #[test]
    fn support_reports_platform_not_supported() {
        let support = build_native_audio_support("freebsd".to_string(), false, Ok(true));
        assert!(!support.supported);
        assert_eq!(support.reason.as_deref(), Some("platform-not-supported"));
    }

    #[test]
    fn support_reports_no_input_device() {
        let support = build_native_audio_support("linux".to_string(), true, Ok(false));
        assert!(!support.supported);
        assert_eq!(support.reason.as_deref(), Some("no-input-device"));
    }

    #[test]
    fn support_reports_probe_error() {
        let support =
            build_native_audio_support("macos".to_string(), true, Err("device busy".to_string()));
        assert!(!support.supported);
        assert_eq!(
            support.reason.as_deref(),
            Some("input-probe-failed: device busy")
        );
    }

    // ---- capture frontend: band-limiting -------------------------------------------------

    fn tone(rate: u32, hz: f64, samples: usize) -> Vec<f32> {
        (0..samples)
            .map(|i| (2.0 * std::f64::consts::PI * hz * i as f64 / rate as f64).sin() as f32)
            .collect()
    }

    /// Amplitude of one frequency, measured over the second half so the filter's start-up
    /// transient is not part of the answer.
    fn amplitude_at(samples: &[f32], rate: u32, hz: f64) -> f64 {
        let tail = &samples[samples.len() / 2..];
        let (mut re, mut im) = (0.0f64, 0.0f64);
        for (index, &sample) in tail.iter().enumerate() {
            let phase = 2.0 * std::f64::consts::PI * hz * index as f64 / rate as f64;
            re += sample as f64 * phase.cos();
            im += sample as f64 * phase.sin();
        }
        2.0 * (re * re + im * im).sqrt() / tail.len() as f64
    }

    fn db(value: f64) -> f64 {
        20.0 * value.max(1e-12).log10()
    }

    /// Where a source frequency lands after decimation to `output_rate`.
    fn folded(hz: f64, output_rate: u32) -> f64 {
        let rate = output_rate as f64;
        let nearest = (hz / rate).round();
        (hz - nearest * rate).abs()
    }

    /// Push a unit-amplitude tone through the real capture chain and report its gain in dB
    /// at whatever frequency it folds to.
    fn chain_response_db(input_rate: u32, output_rate: u32, hz: f64) -> f64 {
        chain_response_db_with(input_rate, output_rate, hz, false)
    }

    fn chain_response_db_with(
        input_rate: u32,
        output_rate: u32,
        hz: f64,
        noise_suppression: bool,
    ) -> f64 {
        let mut frontend = CaptureFrontend::new(input_rate, output_rate, 1, noise_suppression);
        let input = tone(input_rate, hz, input_rate as usize * 3);
        let mut output = Vec::new();
        // Chunked the way cpal delivers, so the test exercises the cross-callback state too.
        for chunk in input.chunks(512) {
            output.extend_from_slice(&frontend.push(chunk));
        }
        output.extend_from_slice(&frontend.finish());
        let measured = folded(hz, output_rate).max(1.0);
        db(amplitude_at(&output, output_rate, measured))
    }

    #[test]
    fn the_capture_chain_keeps_the_speech_band_flat() {
        for &hz in &[200.0, 400.0, 1000.0, 2000.0, 4000.0, 6000.0] {
            let response = chain_response_db(48_000, 16_000, hz);
            assert!(
                response > -1.0,
                "{hz} Hz should pass the capture chain untouched, measured {response:.2} dB"
            );
        }
    }

    #[test]
    fn the_capture_chain_suppresses_what_would_alias_into_speech() {
        // Both of these fold into the middle of the speech band. Before the anti-alias
        // cascade existed they arrived at -1.26 dB and -1.82 dB respectively.
        for &(hz, lands_on) in &[
            (10_000.0, 6_000.0),
            (12_000.0, 4_000.0),
            (14_000.0, 2_000.0),
        ] {
            assert_eq!(folded(hz, 16_000), lands_on);
            let response = chain_response_db(48_000, 16_000, hz);
            assert!(
                response < -20.0,
                "{hz} Hz folds onto {lands_on} Hz and must be suppressed, measured {response:.2} dB"
            );
        }
    }

    /// Positive control for the measurement above: the same tones through the same
    /// measurement, with only the anti-alias cascade removed, must come back essentially
    /// unattenuated. Without this a broken generator or a broken Goertzel would report
    /// silence and the suppression assertion would pass for the wrong reason.
    #[test]
    fn removing_the_antialias_cascade_puts_the_aliases_back() {
        for &hz in &[10_000.0, 12_000.0] {
            let mut frontend = CaptureFrontend::new(48_000, 16_000, 1, false);
            frontend.antialias = None;
            let input = tone(48_000, hz, 48_000 * 3);
            let mut output = Vec::new();
            for chunk in input.chunks(512) {
                output.extend_from_slice(&frontend.push(chunk));
            }
            let response = db(amplitude_at(&output, 16_000, folded(hz, 16_000)));
            assert!(
                response > -6.0,
                "unfiltered {hz} Hz should still alias loudly, measured {response:.2} dB"
            );
        }
    }

    #[test]
    fn the_capture_chain_removes_rumble_below_the_voice_band() {
        let rumble = chain_response_db(48_000, 16_000, 50.0);
        assert!(
            rumble < -15.0,
            "50 Hz mains rumble should be attenuated, measured {rumble:.2} dB"
        );
        let voice = chain_response_db(48_000, 16_000, 300.0);
        assert!(
            voice > -1.0,
            "300 Hz carries speech and must survive, measured {voice:.2} dB"
        );
    }

    #[test]
    fn a_non_integer_device_rate_meets_the_same_bounds() {
        // 44.1 kHz hardware is why the chain band-limits rather than decimating by an
        // integer factor; the guarantees cannot be specific to 48 kHz.
        assert!(chain_response_db(44_100, 16_000, 1000.0) > -1.0);
        assert!(chain_response_db(44_100, 16_000, 6000.0) > -1.0);
        assert!(chain_response_db(44_100, 16_000, 12_000.0) < -20.0);
        assert!(chain_response_db(44_100, 16_000, 50.0) < -15.0);
    }

    #[test]
    fn a_capture_that_does_not_downsample_is_not_band_limited() {
        // Nothing can alias when the rate is unchanged, so shaving the top of the band
        // would cost signal for no reason.
        assert!(
            CaptureFrontend::new(16_000, 16_000, 1, false)
                .antialias
                .is_none()
        );
        assert!(
            CaptureFrontend::new(16_000, 48_000, 1, false)
                .antialias
                .is_none()
        );
        assert!(
            CaptureFrontend::new(48_000, 16_000, 1, false)
                .antialias
                .is_some()
        );
    }

    // ---- capture frontend: speech detection ----------------------------------------------

    /// Deterministic white noise. A seeded xorshift keeps these tests reproducible without
    /// adding a dependency for the sake of three call sites.
    struct Noise(u64);

    impl Noise {
        fn next(&mut self) -> f32 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            // Two uniforms averaged is enough shaping for a level test.
            let a = (self.0 >> 11) as f64 / (1u64 << 53) as f64;
            let b = ((self.0 >> 5) & 0xff_ffff) as f64 / (1 << 24) as f64;
            (a + b - 1.0) as f32
        }
    }

    fn dbfs(value: f64) -> f32 {
        10f64.powf(value / 20.0) as f32
    }

    /// `plan` is a run of `(is_speech, milliseconds)` at 16 kHz.
    fn synth(noise_dbfs: f64, speech_dbfs: f64, plan: &[(bool, usize)], seed: u64) -> Vec<f32> {
        let mut noise = Noise(seed);
        let (noise_amp, speech_amp) = (dbfs(noise_dbfs), dbfs(speech_dbfs));
        let mut out = Vec::new();
        let mut t = 0usize;
        for &(is_speech, ms) in plan {
            for i in 0..(16_000 * ms / 1000) {
                // The noise generator is uniform-ish; scale it to the requested RMS.
                let mut sample = noise.next() * noise_amp * 2.45;
                if is_speech {
                    // A 4 Hz syllabic envelope with real gaps, over two voice-band tones.
                    let env = (2.0 * std::f64::consts::PI * 4.0 * i as f64 / 16_000.0)
                        .sin()
                        .max(0.0)
                        .powf(1.5) as f32;
                    let voiced = ((2.0 * std::f64::consts::PI * 190.0 * t as f64 / 16_000.0).sin()
                        + 0.5 * (2.0 * std::f64::consts::PI * 820.0 * t as f64 / 16_000.0).sin())
                        as f32;
                    sample += speech_amp * 1.9 * env * voiced / 1.118;
                }
                out.push(sample);
                t += 1;
            }
        }
        out
    }

    /// Run a signal through the detector the way the callback does, and report whether speech
    /// was ever heard and at what millisecond the trailing-silence window would have expired.
    fn detect(signal: &[f32], silence_stop_ms: u64) -> (bool, Option<u64>) {
        let mut detector = SpeechDetector::new(16_000);
        let (mut has_speech, mut last_sound_ms, mut stopped_at) = (false, 0u64, None);
        for (index, chunk) in signal.chunks(160).enumerate() {
            let elapsed_ms = index as u64 * 10;
            if detector.observe(chunk) {
                has_speech = true;
                last_sound_ms = elapsed_ms;
            }
            if stopped_at.is_none()
                && should_stop_for_silence(has_speech, elapsed_ms, last_sound_ms, silence_stop_ms)
            {
                stopped_at = Some(elapsed_ms);
            }
        }
        (has_speech, stopped_at)
    }

    const BURSTS: &[(bool, usize)] = &[
        (false, 400),
        (true, 1200),
        (false, 300),
        (true, 900),
        (false, 3000),
    ];

    #[test]
    fn speech_is_detected_from_four_db_snr_upward() {
        // The fixed -40 dBFS threshold this replaces failed both ends of this range: it
        // never advanced the silence timer once the floor rose past it, and it never saw a
        // quietly spoken phrase at all.
        for &noise_dbfs in &[-60.0, -50.0, -40.0, -32.0, -26.0, -22.0] {
            for seed in [11u64, 23, 47] {
                let signal = synth(noise_dbfs, -18.0, BURSTS, seed);
                let (has_speech, stopped_at) = detect(&signal, 1_500);
                assert!(
                    has_speech,
                    "speech at -18 dBFS over {noise_dbfs} dBFS noise (seed {seed}) went unheard"
                );
                assert!(
                    stopped_at.is_some(),
                    "trailing silence never expired at {noise_dbfs} dBFS noise (seed {seed})"
                );
            }
        }
    }

    #[test]
    fn steady_noise_alone_is_never_speech() {
        for &noise_dbfs in &[-60.0, -40.0, -30.0, -22.0, -14.0] {
            for seed in [11u64, 23, 47] {
                let signal = synth(noise_dbfs, -18.0, &[(false, 6000)], seed);
                let (has_speech, _) = detect(&signal, 1_500);
                assert!(
                    !has_speech,
                    "{noise_dbfs} dBFS of steady noise (seed {seed}) was mistaken for speech"
                );
            }
        }
    }

    /// The negative control for the test above: with the entry ratio collapsed to 1.0 the
    /// same noise must be misclassified. Otherwise "never speech" could be reported by a
    /// detector that simply never fires.
    #[test]
    fn a_detector_without_margin_does_mistake_noise_for_speech() {
        let signal = synth(-30.0, -18.0, &[(false, 6000)], 11);
        let mut detector = SpeechDetector::new(16_000);
        let mut heard = false;
        for chunk in signal.chunks(160) {
            for &sample in chunk {
                detector.window.push(sample);
                if detector.window.len() < detector.window_samples {
                    continue;
                }
                let level = rms(&detector.window);
                detector.window.clear();
                // Same state machine, no margin above the floor.
                detector.current_min = detector.current_min.min(level);
                let base = detector.current_min.max(ABS_NOISE_FLOOR);
                if level > base * 1.0 {
                    heard = true;
                }
            }
        }
        assert!(
            heard,
            "the measurement cannot tell speech from noise at all"
        );
    }

    #[test]
    fn digital_silence_is_never_speech() {
        let (has_speech, stopped_at) = detect(&vec![0.0; 16_000 * 3], 1_500);
        assert!(!has_speech);
        assert!(stopped_at.is_none());
    }

    #[test]
    fn a_noise_floor_seeded_by_speech_recovers_at_the_first_pause() {
        // Somebody who is already talking when the session opens seeds every estimate at
        // speech level. The floor has to come back down on its own, or the session runs to
        // the duration cap.
        let signal = synth(
            -30.0,
            -18.0,
            &[(true, 1500), (false, 200), (true, 1000), (false, 3000)],
            11,
        );
        let (has_speech, stopped_at) = detect(&signal, 1_500);
        assert!(has_speech, "speech from the first frame went unheard");
        assert!(
            stopped_at.is_some(),
            "the floor never recovered, so trailing silence never expired"
        );
    }

    #[test]
    fn a_long_utterance_stays_detected_to_its_end() {
        // Fourteen seconds without a long pause is the case an upward-adapting floor loses:
        // it climbs to the speech level and declares the tail silent.
        let signal = synth(-30.0, -18.0, &[(true, 14_000), (false, 2_500)], 11);
        let (has_speech, stopped_at) = detect(&signal, 1_500);
        assert!(has_speech);
        let stopped_at = stopped_at.expect("a monologue that ends should still auto-stop");
        assert!(
            stopped_at >= 14_000,
            "auto-stop fired at {stopped_at} ms, inside the utterance"
        );
    }

    // ---- capture frontend: noise suppression ---------------------------------------------

    /// Run a signal through the frontend the way the callback does.
    fn run_frontend(frontend: &mut CaptureFrontend, input: &[f32]) -> Vec<f32> {
        let mut output = Vec::new();
        for chunk in input.chunks(512) {
            output.extend_from_slice(&frontend.push(chunk));
        }
        output.extend_from_slice(&frontend.finish());
        output
    }

    fn steady_noise(rate: u32, seconds: usize, level: f32, seed: u64) -> Vec<f32> {
        let mut noise = Noise(seed);
        (0..rate as usize * seconds)
            .map(|_| noise.next() * level * 2.45)
            .collect()
    }

    fn level_of(samples: &[f32]) -> f32 {
        // Skip the first second: RNNoise needs a moment to characterise the noise.
        rms(&samples[samples.len() / 3..])
    }

    #[test]
    fn suppression_lowers_a_steady_noise_floor() {
        // Low-band steady noise is the case people actually complain about — a fan, an air
        // conditioner, a laptop under load — and the case the model handles best. Measured
        // reductions across profiles: this one 58 dB, broadband hiss at -30 dBFS only 4 dB,
        // mains hum 2.6 dB. The threshold is deliberately far below the measurement so a
        // model that is merely less effective does not fail the build; a model that has
        // stopped suppressing anything still does.
        let mut noise = Noise(9);
        let mut lowband = BiquadCascade::butterworth_lowpass(48_000.0, 900.0, 4);
        let mut input: Vec<f32> = (0..48_000 * 3)
            .map(|_| noise.next() * dbfs(-24.0) * 2.45)
            .collect();
        lowband.process_in_place(&mut input);

        let plain = run_frontend(&mut CaptureFrontend::new(48_000, 16_000, 1, false), &input);
        let denoised = run_frontend(&mut CaptureFrontend::new(48_000, 16_000, 1, true), &input);
        let reduction = db(level_of(&plain) as f64) - db(level_of(&denoised) as f64);
        assert!(
            reduction > 15.0,
            "suppression should lower a steady noise floor, measured {reduction:.2} dB"
        );
    }

    /// Positive control for the test above: with suppression off, the same comparison must
    /// come out flat. Otherwise the reduction could be an artefact of the two runs rather
    /// than of the model.
    #[test]
    fn without_suppression_the_same_comparison_is_flat() {
        let input = steady_noise(48_000, 3, dbfs(-24.0), 9);
        let left = run_frontend(&mut CaptureFrontend::new(48_000, 16_000, 1, false), &input);
        let right = run_frontend(&mut CaptureFrontend::new(48_000, 16_000, 1, false), &input);
        let difference = (db(level_of(&left) as f64) - db(level_of(&right) as f64)).abs();
        assert!(
            difference < 0.01,
            "identical chains differed by {difference:.4} dB"
        );
    }

    #[test]
    fn suppression_keeps_the_chain_guarantees() {
        // Turning suppression on moves the whole chain onto the model's 48 kHz rate. The
        // band-limiting has to survive that move, or a preference silently un-fixes the
        // aliasing this task exists to remove.
        assert!(chain_response_db_with(48_000, 16_000, 1000.0, true) > -3.0);
        assert!(chain_response_db_with(48_000, 16_000, 12_000.0, true) < -20.0);
        assert!(chain_response_db_with(48_000, 16_000, 50.0, true) < -15.0);
    }

    #[test]
    fn suppression_works_at_a_non_48khz_device_rate() {
        // The model has exactly one operating point; 44.1 kHz hardware has to be converted
        // onto it rather than fed to it.
        let mut frontend = CaptureFrontend::new(44_100, 16_000, 1, true);
        let output = run_frontend(&mut frontend, &tone(44_100, 1000.0, 44_100 * 2));
        assert!(!output.is_empty());
        assert!(output.iter().all(|sample| sample.is_finite()));
        assert!(chain_response_db_with(44_100, 16_000, 1000.0, true) > -3.0);
    }

    #[test]
    fn suppression_preserves_the_recording_length() {
        // Frame blocking must not quietly shorten the recording; a lost tail is a lost word.
        let seconds = 2;
        let input = tone(48_000, 440.0, 48_000 * seconds);
        let output = run_frontend(&mut CaptureFrontend::new(48_000, 16_000, 1, true), &input);
        let expected = 16_000 * seconds;
        let frame_slack = nnnoiseless::DenoiseState::FRAME_SIZE / 3 + 2;
        assert!(
            output.len() >= expected && output.len() <= expected + frame_slack,
            "expected about {expected} samples, produced {}",
            output.len()
        );
    }

    #[test]
    fn a_failed_suppressor_keeps_recording() {
        // Losing suppression is recoverable; losing the dictation is not. A stage that has
        // given up must still deliver audio, at the rate the rest of the chain expects.
        let mut frontend = CaptureFrontend::new(48_000, 16_000, 1, true);
        frontend.denoise.as_mut().unwrap().failed = true;
        let output = run_frontend(&mut frontend, &tone(48_000, 1000.0, 48_000 * 2));
        assert!(
            output.len() > 16_000,
            "a failed stage stopped producing audio"
        );
        assert!(output.iter().all(|sample| sample.is_finite()));
        let response = db(amplitude_at(&output, 16_000, 1000.0));
        assert!(
            response > -3.0,
            "a failed stage should pass the signal through, measured {response:.2} dB"
        );
    }

    #[test]
    fn a_non_finite_sample_does_not_silence_the_rest_of_the_session() {
        // The cascades are recursive: without the guard, one NaN from a misbehaving driver
        // is not one bad sample, it is every sample until the session ends.
        let mut frontend = CaptureFrontend::new(48_000, 16_000, 1, false);
        let mut input = tone(48_000, 1000.0, 48_000 * 2);
        input[1000] = f32::NAN;
        input[1001] = f32::INFINITY;
        let output = run_frontend(&mut frontend, &input);
        assert!(
            output.iter().all(|sample| sample.is_finite()),
            "a non-finite input escaped into the capture buffer"
        );
        let response = db(amplitude_at(&output, 16_000, 1000.0));
        assert!(
            response > -1.0,
            "the tone did not survive a non-finite sample, measured {response:.2} dB"
        );
    }
}
