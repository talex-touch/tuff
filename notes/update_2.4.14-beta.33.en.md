# Tuff v2.4.14-beta.33 Release Notes

## Summary Notes

- Clipboard image OCR no longer risks terminating the application after native recognition succeeds.
- One-shot OCR workers now finish their native completion callbacks and exit naturally after delivering a result.
- Hung OCR workers remain bounded by the existing timeout and are still force-terminated before terminal delivery.

## What's Changed

- Fixed a packaged macOS crash whose minidump ended in `tuff_native_ocr.node` while the parent terminated a worker during `Napi::AsyncWorker::OnWorkComplete`.
- Terminal OCR worker messages now settle the parent request without calling `worker.terminate()`; only the pre-message timeout retains forced termination.
