# 原生库集成策略（N-API/FFI/Sidecar）

## Scope
- 选择主路径并定义 ABI 兼容与加载隔离策略。
- 明确崩溃隔离、超时与错误处理方案。

## Summary
- 默认主路径：Sidecar 进程（隔离崩溃与权限）。
- 辅助路径：N-API（性能敏感场景），谨慎控制 ABI。
- FFI 仅用于原型或局部能力，避免扩散。

## References
- docs/script-native-build-distribution.md
- docs/script-native-capability-matrix.md
- apps/core-app/electron-builder.yml

---

## 1) 选型结论

优先级：
1. **Sidecar**（独立进程）
2. **N-API**（嵌入式）
3. **FFI**（仅原型/小范围）

理由：
- Sidecar 可隔离崩溃、易于超时/取消、权限更可控。
- N-API 性能更好但 ABI 兼容成本高，且与 Electron/Node 版本耦合。
- FFI 维护成本高、可移植性差，不作为主路径。

---

## 2) ABI 与架构支持

| 平台 | 架构 | Sidecar | N-API | 备注 |
| --- | --- | --- | --- | --- |
| Windows | x64 | ✅ | ✅ | DLL/EXE |
| macOS | arm64 | ✅ | ✅ | dylib |
| Linux | x64 | ✅ | ✅ | so |

注意：
- Electron/Node 升级会影响 N-API 兼容性。
- 需要为每个平台/架构提供独立构建产物。

---

## 3) 加载/隔离规则

Sidecar：
- 主进程 spawn 独立进程，IPC 走标准通道。
- 进程崩溃不影响主进程，记录错误并降级。
- 超时后强制 kill 并返回错误。

N-API：
- 仅在主进程加载，避免渲染进程直接访问。
- 动态库必须在 `asarUnpack` 范围内。
- 失败时降级到 Sidecar 或禁用能力。

FFI：
- 仅在研发/实验场景启用。
- 必须显式开关控制，默认关闭。

---

## 4) 错误处理与超时

- 对外统一错误格式：`{ code, message, stage }`
- 超时：默认 10s，可按能力配置。
- 崩溃：标记 provider 不可用并提示用户重试/更新。

---

## 5) 构建与发布注意

- sidecar 可执行文件与动态库需 `asarUnpack` 或 `extraFiles`。
- macOS 发布需签名/公证，否则可能被系统阻止。
- Windows 建议 Authenticode 签名以降低 SmartScreen 风险。

---

## 6) 回退策略

| 场景 | 回退策略 |
| --- | --- |
| N-API 加载失败 | 使用 Sidecar |
| Sidecar 启动失败 | 禁用能力并提示 |
| ABI 不匹配 | 禁用能力并提示 |
