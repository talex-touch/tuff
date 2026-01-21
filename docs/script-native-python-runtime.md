# Python 运行时策略（跨平台）

## Scope
- 确定 Python 运行时来源与依赖管理方案。
- 规划跨平台打包与路径解析策略。

## Summary
- 优先系统 Python（体积小、更新快），可选嵌入式 Python（离线可用）。
- 依赖以 venv/requirements 方式管理，避免污染全局环境。
- 运行时路径解析按平台与架构分层，失败时明确降级提示。

## References
- docs/script-native-constraints.md
- docs/script-native-capability-matrix.md
- docs/script-native-build-distribution.md
- apps/core-app/electron-builder.yml

---

## 1) 系统 Python vs 嵌入式 Python

| 维度 | 系统 Python | 嵌入式 Python |
| --- | --- | --- |
| 体积 | 小（不随应用打包） | 大（随应用发布） |
| 离线可用 | 依赖用户环境 | ✅ 可用 |
| 更新成本 | 低（用户或系统更新） | 高（随版本发布） |
| 兼容性 | 需处理版本差异 | 可控 |
| 权限 | 与系统一致 | 需写入 `resources/` 或用户目录 |

结论：
- 默认优先系统 Python。
- 离线/企业场景可选择嵌入式 Python（构建时提供）。

---

## 2) 运行时发现与路径解析

优先级（高 → 低）：
1. `config/script-bridge.json` 显式路径（用户/管理员配置）
2. 嵌入式 Python：`resources/runtime/python/<platform>/<arch>/python`
3. 系统 Python：`python3` → `python`

平台路径示例：
- Windows: `resources/runtime/python/win32/x64/python.exe`
- macOS: `resources/runtime/python/darwin/arm64/bin/python3`
- Linux: `resources/runtime/python/linux/x64/bin/python3`

失败提示：
- 未找到 Python → 提示“未检测到 Python，功能已禁用”
- 版本不兼容 → 提示最低支持版本并降级

---

## 3) 依赖管理与虚拟环境

推荐：
- 每个脚本能力维护独立 venv，避免冲突。
- venv 目录建议存放于用户数据目录：
  - `~/.talex-touch/runtime/python/<env-id>/`

依赖安装：
- `pip install -r requirements.txt`
- 离线场景提供 `requirements.lock` + wheel 包缓存

避免事项：
- 不写入系统 Python site-packages。
- 不覆盖用户已有虚拟环境。

---

## 4) 跨平台打包策略

嵌入式 Python 打包步骤：
1. 构建时下载对应平台/架构 Python 运行时。
2. 拷贝至 `resources/runtime/python/<platform>/<arch>/`。
3. `electron-builder.yml` 确保 `resources/**` 被打包。
4. 可执行文件需 `asarUnpack` 或 `extraFiles`。

系统 Python 路径：
- 在启动时检测 `python3/python` 版本与可执行性。
- 低于最低版本时拒绝执行并提示。

---

## 5) 权限与目录写入策略

- venv 与缓存写入用户目录，避免写入系统目录。
- 运行时二进制位于 `resources/`，只读。
- Windows 上避免写入 Program Files 子目录。

---

## 6) 回退策略

| 场景 | 回退策略 |
| --- | --- |
| 系统 Python 缺失 | 使用嵌入式 Python（如存在） |
| 嵌入式 Python 缺失 | 回退系统 Python；否则禁用 |
| 依赖安装失败 | 标记 provider 不可用并提示 |
| 版本不兼容 | 拒绝执行并提示最低版本 |

---

## 7) 打包校验要点

- `resources/runtime/python/...` 在构建产物中存在。
- macOS/Windows 安装后运行时可执行且不被签名拦截。
- 关闭开关后主流程正常运行。
