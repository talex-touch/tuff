# 更新链路跨平台回归清单

## Scope
- 覆盖 core / renderer / extensions 更新链路的关键回归场景。
- 覆盖渠道切换、断网/限频、校验失败、override/回退等边界。
- 不依赖真实 Release 服务器，优先使用本地/离线验证。

## Summary
- 清单按 Win/macOS/Linux 分平台执行，至少覆盖 4 类核心场景。
- 提供可重复执行的 manifest 校验脚本，作为最小自动化回归入口。

## References
- docs/plan-prd/03-features/download-update/github-release-asset-spec.md
- scripts/update-validate-release-manifest.mjs
- apps/core-app/src/main/modules/update/update-system.ts
- apps/core-app/src/main/core/touch-app.ts
- apps/core-app/src/renderer/src/modules/update/GithubUpdateProvider.ts

---

## 1) 回归清单（win/mac/linux）

### 1.1 渠道切换 & 缓存
- Windows：
  - Release ↔ Beta ↔ Snapshot 切换后，设置页显示渠道一致。
  - 切换后更新检查结果与缓存记录一致（无旧缓存污染）。
- macOS：
  - 切换渠道后 `checkForUpdates` 返回版本/渠道匹配。
  - 关闭自动检查后不触发轮询。
- Linux：
  - 渠道切换后更新提示与下载按钮状态一致。
  - 缓存清理后再次检查可拉取新记录。

### 1.2 断网 / 限频 / 重试
- Windows：
  - 断网 → 更新检查提示可追踪，日志含失败原因。
  - 恢复网络后可手动重试成功。
- macOS：
  - GitHub API 限频模拟（或本地 mock）→ 进入冷却窗口并提示。
  - 重试策略按设置生效（无死循环）。
- Linux：
  - 超时/失败不影响主进程启动与基础功能。

### 1.3 校验失败 / 签名缺失
- Windows：
  - sha256 不匹配 → 下载任务失败并提示校验失败。
- macOS：
  - 签名缺失/无效 → 记录警告并保持回退路径可用。
- Linux：
  - 校验失败不触发安装、无崩溃。

### 1.4 Renderer Override & Extensions
- Windows：
  - renderer override 成功加载；coreRange 不兼容时自动回退。
  - extensions bundle 安装后插件目录更新，可 reload。
- macOS：
  - override 加载失败时自动回退到内置 renderer。
  - extensions 更新失败时可恢复旧插件目录。
- Linux：
  - override/extension 更新不影响主进程启动。

---

## 2) 自动化 / 脚本测试（不依赖真实 Release）

### 2.1 Release Manifest 校验脚本
用于离线验证 manifest 结构与命名规范：

```bash
node scripts/update-validate-release-manifest.mjs \
  --manifest docs/plan-prd/03-features/download-update/fixtures/tuff-release-manifest.sample.json
```

期望结果：
- 输出 `Validation passed`；
- 退出码为 0。

备注：
- 发布前可将真实 `tuff-release-manifest.json` 下载到本地并复用该脚本验证。

---

## 3) 结果记录建议
- 记录时间、平台、渠道、关键日志与异常截图路径。
- 对失败项保留最短可复现步骤，方便回归修复。
