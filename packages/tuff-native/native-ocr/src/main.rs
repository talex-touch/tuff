mod base64;

use std::ffi::{CStr, CString};
use std::fs::File;
use std::io::{self, BufRead, BufWriter, Read, Write};
use std::os::raw::{c_char, c_int};
use std::path::Path;
use std::ptr;

use serde::{Deserialize, Serialize};

const MAX_OCR_INPUT_BYTES: usize = 16 * 1024 * 1024;
const DEFAULT_MAX_BLOCKS: i32 = 120;

#[repr(C)]
struct TuffOcrCBlock {
    text: *mut c_char,
    has_confidence: bool,
    confidence: f64,
    has_bounding_box: bool,
    bounding_box: [f64; 4],
}

#[repr(C)]
struct TuffOcrCResult {
    ok: bool,
    text: *mut c_char,
    has_confidence: bool,
    confidence: f64,
    language: *mut c_char,
    blocks: *mut TuffOcrCBlock,
    block_count: usize,
    engine: *mut c_char,
    duration_ms: u64,
    error_code: *mut c_char,
    error_message: *mut c_char,
}

impl Default for TuffOcrCResult {
    fn default() -> Self {
        Self {
            ok: false,
            text: ptr::null_mut(),
            has_confidence: false,
            confidence: 0.0,
            language: ptr::null_mut(),
            blocks: ptr::null_mut(),
            block_count: 0,
            engine: ptr::null_mut(),
            duration_ms: 0,
            error_code: ptr::null_mut(),
            error_message: ptr::null_mut(),
        }
    }
}

unsafe extern "C" {
    fn tuff_ocr_is_supported() -> bool;
    fn tuff_ocr_perform(
        image_ptr: *const u8,
        image_len: usize,
        language_hint: *const c_char,
        include_layout: bool,
        max_blocks: c_int,
        out: *mut TuffOcrCResult,
    );
    fn tuff_ocr_free_result(result: *mut TuffOcrCResult);
}

struct OcrResultGuard {
    inner: TuffOcrCResult,
}

impl OcrResultGuard {
    fn new() -> Self {
        Self {
            inner: TuffOcrCResult::default(),
        }
    }
}

impl Drop for OcrResultGuard {
    fn drop(&mut self) {
        unsafe {
            tuff_ocr_free_result(&mut self.inner);
        }
    }
}

unsafe fn opt_c_string(ptr: *const c_char) -> Option<String> {
    if ptr.is_null() {
        return None;
    }
    Some(
        unsafe { CStr::from_ptr(ptr) }
            .to_string_lossy()
            .into_owned(),
    )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HelperRequest {
    id: String,
    operation: String,
    #[serde(default)]
    file_path: Option<String>,
    #[serde(default)]
    image_base64: Option<String>,
    #[serde(default)]
    language_hint: Option<String>,
    #[serde(default)]
    include_layout: Option<bool>,
    #[serde(default)]
    max_blocks: Option<i32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct OcrBlockPayload {
    text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    confidence: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    bounding_box: Option<[f64; 4]>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HelperResponse {
    id: String,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    supported: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    confidence: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    blocks: Option<Vec<OcrBlockPayload>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    engine: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

impl HelperResponse {
    fn error(id: String, code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            id,
            ok: false,
            supported: None,
            text: None,
            confidence: None,
            language: None,
            blocks: None,
            engine: None,
            duration_ms: None,
            code: Some(code.into()),
            message: Some(message.into()),
        }
    }
}

fn read_bounded_image_file(raw_path: &str) -> Result<Vec<u8>, (&'static str, String)> {
    let trimmed = raw_path.trim();
    if trimmed.is_empty() {
        return Err((
            "ERR_OCR_DECODE_FAILED",
            "Image filePath is empty".to_string(),
        ));
    }
    let path = Path::new(trimmed);
    if !path.is_absolute() {
        return Err((
            "ERR_OCR_INVALID_REQUEST",
            "Image filePath must be an absolute path".to_string(),
        ));
    }

    let file = File::open(path).map_err(|err| {
        (
            "ERR_OCR_FILE_READ_FAILED",
            format!("Failed to open image file: {err}"),
        )
    })?;
    let meta = file.metadata().map_err(|err| {
        (
            "ERR_OCR_FILE_READ_FAILED",
            format!("Failed to stat image file: {err}"),
        )
    })?;
    if !meta.is_file() {
        return Err((
            "ERR_OCR_FILE_READ_FAILED",
            "OCR image path is not a regular file".to_string(),
        ));
    }
    if meta.len() == 0 {
        return Err((
            "ERR_OCR_DECODE_FAILED",
            "Image payload is empty".to_string(),
        ));
    }
    if meta.len() > MAX_OCR_INPUT_BYTES as u64 {
        return Err((
            "ERR_OCR_DECODE_FAILED",
            format!(
                "Image file exceeds byte limit: {} > {MAX_OCR_INPUT_BYTES}",
                meta.len()
            ),
        ));
    }

    let mut bytes = Vec::with_capacity(meta.len() as usize);
    file.take((MAX_OCR_INPUT_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|err| {
            (
                "ERR_OCR_FILE_READ_FAILED",
                format!("Failed to read image file: {err}"),
            )
        })?;

    if bytes.is_empty() {
        return Err((
            "ERR_OCR_DECODE_FAILED",
            "Image payload is empty".to_string(),
        ));
    }
    if bytes.len() > MAX_OCR_INPUT_BYTES {
        return Err((
            "ERR_OCR_DECODE_FAILED",
            format!("Image file exceeds byte limit: {MAX_OCR_INPUT_BYTES}"),
        ));
    }

    Ok(bytes)
}

fn load_request_bytes(req: &HelperRequest) -> Result<Vec<u8>, (&'static str, String)> {
    if let Some(file_path) = req.file_path.as_deref() {
        return read_bounded_image_file(file_path);
    }
    if let Some(encoded) = req.image_base64.as_deref() {
        let bytes = base64::decode_with_limit(encoded, MAX_OCR_INPUT_BYTES)
            .map_err(|err| ("ERR_OCR_DECODE_FAILED", err.to_string()))?;
        if bytes.is_empty() {
            return Err((
                "ERR_OCR_DECODE_FAILED",
                "Image payload is empty".to_string(),
            ));
        }
        return Ok(bytes);
    }
    Err((
        "ERR_OCR_INVALID_REQUEST",
        "OCR request requires filePath or imageBase64".to_string(),
    ))
}

fn handle_ocr_request(req: HelperRequest) -> HelperResponse {
    if !unsafe { tuff_ocr_is_supported() } {
        return HelperResponse::error(
            req.id,
            "ERR_OCR_UNSUPPORTED_PLATFORM",
            "Native OCR is not supported on this platform",
        );
    }

    let image_bytes = match load_request_bytes(&req) {
        Ok(bytes) => bytes,
        Err((code, message)) => return HelperResponse::error(req.id, code, message),
    };

    let language_c = match req.language_hint.as_deref().map(str::trim) {
        Some(lang) if !lang.is_empty() => match CString::new(lang) {
            Ok(c) => Some(c),
            Err(_) => {
                return HelperResponse::error(
                    req.id,
                    "ERR_OCR_INVALID_REQUEST",
                    "languageHint contains an invalid NUL byte",
                );
            }
        },
        _ => None,
    };

    let include_layout = req.include_layout.unwrap_or(false);
    let max_blocks = req.max_blocks.unwrap_or(DEFAULT_MAX_BLOCKS).max(0);

    let mut guard = OcrResultGuard::new();
    unsafe {
        tuff_ocr_perform(
            image_bytes.as_ptr(),
            image_bytes.len(),
            language_c.as_ref().map_or(ptr::null(), |c| c.as_ptr()),
            include_layout,
            max_blocks,
            &mut guard.inner,
        );
    }

    let raw = &guard.inner;
    if !raw.ok {
        let code = unsafe { opt_c_string(raw.error_code) }
            .unwrap_or_else(|| "ERR_OCR_RECOGNIZE_FAILED".to_string());
        let message = unsafe { opt_c_string(raw.error_message) }
            .unwrap_or_else(|| "Native OCR recognition failed".to_string());
        return HelperResponse::error(req.id, code, message);
    }

    let blocks = if !raw.blocks.is_null() && raw.block_count > 0 {
        let slice = unsafe { std::slice::from_raw_parts(raw.blocks, raw.block_count) };
        let mapped = slice
            .iter()
            .filter_map(|block| {
                let text = unsafe { opt_c_string(block.text) }?;
                Some(OcrBlockPayload {
                    text,
                    confidence: block.has_confidence.then_some(block.confidence),
                    bounding_box: block.has_bounding_box.then_some(block.bounding_box),
                })
            })
            .collect::<Vec<_>>();
        Some(mapped)
    } else {
        None
    };

    HelperResponse {
        id: req.id,
        ok: true,
        supported: None,
        text: Some(unsafe { opt_c_string(raw.text) }.unwrap_or_default()),
        confidence: raw.has_confidence.then_some(raw.confidence),
        language: unsafe { opt_c_string(raw.language) },
        blocks,
        engine: Some(
            unsafe { opt_c_string(raw.engine) }.unwrap_or_else(|| "apple-vision".to_string()),
        ),
        duration_ms: Some(raw.duration_ms),
        code: None,
        message: None,
    }
}

fn dispatch_line(line: &str) -> (Option<HelperResponse>, bool) {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return (None, false);
    }

    let req: HelperRequest = match serde_json::from_str(trimmed) {
        Ok(parsed) => parsed,
        Err(err) => {
            return (
                Some(HelperResponse::error(
                    String::new(),
                    "ERR_OCR_INVALID_REQUEST",
                    format!("Malformed OCR request JSON: {err}"),
                )),
                false,
            );
        }
    };

    match req.operation.as_str() {
        "ping" => (
            Some(HelperResponse {
                id: req.id,
                ok: true,
                supported: Some(unsafe { tuff_ocr_is_supported() }),
                text: None,
                confidence: None,
                language: None,
                blocks: None,
                engine: None,
                duration_ms: None,
                code: None,
                message: None,
            }),
            false,
        ),
        "ocr" => (Some(handle_ocr_request(req)), false),
        "shutdown" => (
            Some(HelperResponse {
                id: req.id,
                ok: true,
                supported: None,
                text: None,
                confidence: None,
                language: None,
                blocks: None,
                engine: None,
                duration_ms: None,
                code: None,
                message: None,
            }),
            true,
        ),
        other => (
            Some(HelperResponse::error(
                req.id,
                "ERR_OCR_INVALID_REQUEST",
                format!("Unsupported OCR helper operation: {other}"),
            )),
            false,
        ),
    }
}

fn main() {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut reader = io::BufReader::new(stdin.lock());
    let mut writer = BufWriter::new(stdout.lock());
    let mut line = String::new();

    loop {
        line.clear();
        let read = match reader.read_line(&mut line) {
            Ok(count) => count,
            Err(_) => break,
        };
        if read == 0 {
            break;
        }

        let (response, should_exit) = dispatch_line(&line);
        if let Some(payload) = response {
            if serde_json::to_writer(&mut writer, &payload).is_err() {
                break;
            }
            if writer.write_all(b"\n").is_err() || writer.flush().is_err() {
                break;
            }
        }
        if should_exit {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn handles_ping_and_shutdown_operations() {
        let (ping_resp, exit_after_ping) = dispatch_line(r#"{"id":"1","operation":"ping"}"#);
        assert!(!exit_after_ping);
        let ping_resp = ping_resp.expect("ping response");
        assert!(ping_resp.ok);
        assert!(ping_resp.supported.is_some());

        let (shutdown_resp, exit_after_shutdown) =
            dispatch_line(r#"{"id":"2","operation":"shutdown"}"#);
        assert!(exit_after_shutdown);
        assert!(shutdown_resp.expect("shutdown response").ok);
    }

    #[test]
    fn rejects_relative_file_paths_and_empty_base64() {
        let (rel_resp, _) =
            dispatch_line(r#"{"id":"3","operation":"ocr","filePath":"relative/a.png"}"#);
        let rel_resp = rel_resp.expect("response");
        assert!(!rel_resp.ok);
        assert_eq!(rel_resp.code.as_deref(), Some("ERR_OCR_INVALID_REQUEST"));

        let (empty_resp, _) = dispatch_line(r#"{"id":"4","operation":"ocr","imageBase64":""}"#);
        let empty_resp = empty_resp.expect("response");
        assert!(!empty_resp.ok);
        assert_eq!(empty_resp.code.as_deref(), Some("ERR_OCR_DECODE_FAILED"));
    }

    #[test]
    fn rejects_invalid_image_bytes_via_c_ffi_cleanly() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let temp_path = std::env::temp_dir().join(format!("tuff-native-ocr-test-{unique}.png"));
        std::fs::write(&temp_path, b"not-a-valid-png").unwrap();

        let req = serde_json::json!({
            "id": "5",
            "operation": "ocr",
            "filePath": temp_path.to_string_lossy(),
            "includeLayout": true
        })
        .to_string();

        let (resp, _) = dispatch_line(&req);
        let _ = std::fs::remove_file(&temp_path);

        let resp = resp.expect("response");
        assert!(!resp.ok);
        assert!(resp.code.is_some());
    }
}
