# Tuff v2.4.14-beta.33 更新说明

## 摘要

- 剪贴板图片 OCR 在原生识别成功后，不再因 worker 退出竞态导致应用终止。
- 一次性 OCR worker 交付结果后，会等待原生完成回调退栈并自然退出。
- 无响应的 OCR worker 仍受现有超时约束，并会在尚未交付终态时被强制终止。

## 变更内容

- 修复打包 macOS 进程在父进程于 `Napi::AsyncWorker::OnWorkComplete` 期间终止 worker 时，崩溃栈落入 `tuff_native_ocr.node` 的问题。
- OCR worker 的终态消息现在只负责结算父请求，不再调用 `worker.terminate()`；强制终止仅保留在终态消息到达前的超时路径。
