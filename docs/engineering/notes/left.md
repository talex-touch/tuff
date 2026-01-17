# Left（任务梳理）

## 已完成
- SQLite BUSY 重试封装与接入（OCR / Analytics 写入）。
- 搜索链路性能埋点（usageStats/completion/sort 耗时上报）。
- open-url 对本地前端地址直接 skip（避免自动打开系统浏览器）。
- TxScroll 默认滚动条可见与回弹调整（样式 + overshoot）。
- CoreBox 内容区 padding / footer 预留优化。

## 未完成 / 待验证
- Settings 页面滚动仍存在“闪一下就回弹”，诊断日志未输出（见 `report.md`）。
- 需要进一步确认滚动事件是否进入 TouchScroll，或 dev 是否使用修改后的源码。
- 可能需添加全局 wheel 捕获诊断，定位事件流向与高度链路断点。

