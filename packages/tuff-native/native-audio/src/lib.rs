use std::collections::HashMap;
use std::io::Cursor;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use napi::bindgen_prelude::{AsyncTask, Buffer};
use napi::{Env, Error, Result, Task};
use napi_derive::napi;

/// Default hard cap on a capture session before it auto-stops.
const DEFAULT_MAX_DURATION_MS: u32 = 15_000;
/// Default trailing-silence window that ends a session once speech was heard.
const DEFAULT_SILENCE_STOP_MS: u32 = 1_500;
/// RMS level (0..1) above which an incoming chunk counts as speech, not silence.
const SILENCE_RMS_THRESHOLD: f32 = 0.01;
/// How often the capture thread re-checks the conditions nothing can signal:
/// the max-duration cap and the trailing-silence window. A manual stop or cancel
/// does not wait for this — it wakes the thread directly.
const POLL_INTERVAL_MS: u64 = 50;
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
}

#[napi(object)]
pub struct AudioCaptureStart {
    pub session_id: String,
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

#[napi]
pub fn get_native_audio_support() -> NativeAudioSupport {
    build_native_audio_support(
        std::env::consts::OS.to_string(),
        platform_supported(),
        probe_default_input(),
    )
}

fn start_capture_blocking(options: Option<AudioCaptureOptions>) -> Result<String> {
    if !platform_supported() {
        return Err(Error::from_reason("platform-not-supported"));
    }

    let options = options.unwrap_or(AudioCaptureOptions {
        max_duration_ms: None,
        silence_stop_ms: None,
        sample_rate: None,
    });
    let max_duration_ms = options.max_duration_ms.unwrap_or(DEFAULT_MAX_DURATION_MS);
    let silence_stop_ms = options.silence_stop_ms.unwrap_or(DEFAULT_SILENCE_STOP_MS);
    let requested_sample_rate = options.sample_rate;

    let sync = Arc::new(StopSignal::default());
    let samples = Arc::new(Mutex::new(Vec::<f32>::new()));
    let silence = Arc::new(SilenceState::new());
    let meta = Arc::new(Mutex::new(CaptureMeta::default()));
    let drain_cursor = Arc::new(AtomicUsize::new(0));
    let started_at = Instant::now();

    let (ready_tx, ready_rx) = mpsc::channel::<std::result::Result<(), String>>();

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
                ready_tx,
            );
        })
        .map_err(|error| Error::from_reason(format!("failed-to-spawn-capture-thread: {error}")))?;

    // Block until the capture thread confirms the stream is live (or failed to
    // open), so start_capture surfaces device errors synchronously.
    match ready_rx.recv() {
        Ok(Ok(())) => {}
        Ok(Err(reason)) => {
            let _ = join_handle.join();
            return Err(Error::from_reason(reason));
        }
        Err(_) => {
            let _ = join_handle.join();
            return Err(Error::from_reason("capture-thread-exited-before-ready"));
        }
    }

    let session_id = next_session_id();
    let handle = SessionHandle {
        sync,
        samples,
        meta,
        join_handle,
        drain_cursor,
    };
    lock(sessions()).insert(session_id.clone(), handle);

    Ok(session_id)
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
    type Output = String;
    type JsValue = AudioCaptureStart;

    fn compute(&mut self) -> Result<Self::Output> {
        start_capture_blocking(self.options.take())
    }

    fn resolve(&mut self, _env: Env, session_id: Self::Output) -> Result<Self::JsValue> {
        Ok(AudioCaptureStart { session_id })
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
    let (meta_arc, samples_arc) = {
        let guard = lock(sessions());
        let handle = guard
            .get(&session_id)
            .ok_or_else(|| Error::from_reason(format!("session-not-found: {session_id}")))?;
        (handle.meta.clone(), handle.samples.clone())
    };

    let (sample_rate, channels) = {
        let meta = lock(&meta_arc);
        (meta.sample_rate, meta.channels)
    };

    // Copy the accumulated PCM out under the same Mutex the capture thread appends
    // through, so the snapshot can't tear against an in-flight write; encode the
    // owned copy afterwards, off the lock.
    let interleaved = lock(&samples_arc).clone();
    let mono = downmix_to_mono(&interleaved, channels);
    let audio = encode_wav_pcm16(&mono, sample_rate).map_err(Error::from_reason)?;
    let duration_ms = mono_duration_ms(mono.len(), sample_rate);

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

#[napi]
pub fn play_audio(bytes: Buffer) -> Result<AudioPlaybackStart> {
    // Decode on the calling thread so bad audio surfaces synchronously; playback
    // itself runs on a dedicated thread (cpal `Stream` is not Send) and continues
    // after this returns.
    let (interleaved, source_rate, source_channels) =
        decode_audio(bytes.to_vec()).map_err(Error::from_reason)?;
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

    Ok(AudioPlaybackStart { playback_id })
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

#[napi]
pub fn type_text(text: String) -> Result<TypeTextResult> {
    // On macOS, keystroke injection requires Accessibility (AX) trust. Report the
    // gate rather than prompting — the app surfaces the system prompt itself.
    #[cfg(target_os = "macos")]
    {
        if !accessibility_trusted() {
            return Ok(TypeTextResult {
                ok: false,
                reason: Some("accessibility-required".to_string()),
            });
        }
    }

    match type_text_impl(&text) {
        Ok(()) => Ok(TypeTextResult {
            ok: true,
            reason: None,
        }),
        Err(reason) => Ok(TypeTextResult {
            ok: false,
            reason: Some(reason),
        }),
    }
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
struct SessionHandle {
    sync: Arc<StopSignal>,
    samples: Arc<Mutex<Vec<f32>>>,
    meta: Arc<Mutex<CaptureMeta>>,
    join_handle: JoinHandle<()>,
    /// Interleaved-sample read cursor for `drain_capture` (delta streaming).
    drain_cursor: Arc<AtomicUsize>,
}

static SESSIONS: OnceLock<Mutex<HashMap<String, SessionHandle>>> = OnceLock::new();
static SESSION_COUNTER: AtomicU64 = AtomicU64::new(0);

fn sessions() -> &'static Mutex<HashMap<String, SessionHandle>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
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
    ready_tx: mpsc::Sender<std::result::Result<(), String>>,
) {
    let host = cpal::default_host();
    let device = match host.default_input_device() {
        Some(device) => device,
        None => {
            let _ = ready_tx.send(Err("no-input-device".to_string()));
            return;
        }
    };
    let supported = match device.default_input_config() {
        Ok(config) => config,
        Err(error) => {
            let _ = ready_tx.send(Err(format!("default-input-config-failed: {error}")));
            return;
        }
    };

    let sample_format = supported.sample_format();
    let channels = supported.channels();
    // cpal 0.18 aliases `SampleRate` to a plain `u32`.
    let sample_rate: u32 = requested_sample_rate.unwrap_or_else(|| supported.sample_rate());
    let config = cpal::StreamConfig {
        channels,
        sample_rate,
        buffer_size: cpal::BufferSize::Default,
    };

    {
        let mut guard = lock(&meta);
        guard.sample_rate = sample_rate;
        guard.channels = channels;
    }

    let stream = match build_capture_stream(
        &device,
        &config,
        sample_format,
        samples,
        silence.clone(),
        started_at,
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

    let _ = ready_tx.send(Ok(()));

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
    finish_capture(reason, &meta, &sync);
}

/// Record why the session ended, then announce that it has.
///
/// The order is the contract: a caller that observes `finished` has to be able to
/// rely on the reason and the sample buffer already being final, so the
/// announcement goes last.
fn finish_capture(reason: StopReason, meta: &Mutex<CaptureMeta>, sync: &StopSignal) {
    lock(meta).stopped_reason = Some(reason);
    sync.mark_finished();
}

fn build_capture_stream(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    sample_format: cpal::SampleFormat,
    samples: Arc<Mutex<Vec<f32>>>,
    silence: Arc<SilenceState>,
    started_at: Instant,
) -> std::result::Result<cpal::Stream, String> {
    match sample_format {
        cpal::SampleFormat::F32 => {
            build_typed_stream::<f32>(device, config, samples, silence, started_at, |sample| {
                sample
            })
        }
        cpal::SampleFormat::I16 => {
            build_typed_stream::<i16>(device, config, samples, silence, started_at, |sample| {
                sample as f32 / 32_768.0
            })
        }
        cpal::SampleFormat::U16 => {
            build_typed_stream::<u16>(device, config, samples, silence, started_at, |sample| {
                (sample as f32 - 32_768.0) / 32_768.0
            })
        }
        other => Err(format!("unsupported-sample-format: {other:?}")),
    }
}

fn build_typed_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    samples: Arc<Mutex<Vec<f32>>>,
    silence: Arc<SilenceState>,
    started_at: Instant,
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
                if rms(&converted) > SILENCE_RMS_THRESHOLD {
                    silence.mark_sound(started_at.elapsed());
                }
                lock(&samples).extend_from_slice(&converted);
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
    let channel_count = channels.max(1) as usize;
    if channel_count <= 1 {
        return interleaved.to_vec();
    }
    interleaved
        .chunks(channel_count)
        .map(|frame| frame.iter().copied().sum::<f32>() / frame.len() as f32)
        .collect()
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

/// Decode WAV/MP3 (and any other enabled symphonia codec) bytes to interleaved
/// f32 PCM, returning `(samples, sample_rate, channels)`.
fn decode_audio(bytes: Vec<u8>) -> std::result::Result<(Vec<f32>, u32, u16), String> {
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

fn type_text_impl(text: &str) -> std::result::Result<(), String> {
    use enigo::{Enigo, Keyboard, Settings};
    let mut enigo =
        Enigo::new(&Settings::default()).map_err(|error| format!("enigo-init-failed: {error}"))?;
    enigo
        .text(text)
        .map_err(|error| format!("type-failed: {error}"))?;
    Ok(())
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
}
