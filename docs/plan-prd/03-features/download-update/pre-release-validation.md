# 预发布验证与上线检查

## Scope
- 以 pre-release tag 验证更新全链路（检查 → 下载 → 安装/应用）。
- 明确 renderer/extension 的回滚策略与上线检查项。
- 覆盖 Win/macOS/Linux 的最小可行验证路径。

## Summary
- 发布前先完成 manifest 校验与离线验证。
- 通过 pre-release 验证核心更新与 override/extension 链路。
- 上线检查清单可逐条确认并留存记录。

## References
- docs/plan-prd/03-features/download-update/github-release-asset-spec.md
- docs/plan-prd/03-features/download-update/update-regression-checklist.md
- scripts/update-validate-release-manifest.mjs
- apps/core-app/src/main/modules/update/update-system.ts
- apps/core-app/src/main/core/touch-app.ts

---

## 1) Pre-release 验证流程

### 1.1 资产准备（离线校验）
1. 生成 pre-release tag（如 `v2.4.7-beta.11`）并上传 Release 资产。
2. 使用脚本校验 manifest：
   ```bash
   node scripts/update-validate-release-manifest.mjs \
     --manifest /path/to/tuff-release-manifest.json
   ```
3. 确认 `tuff-release-manifest.json` 中包含 core/renderer/extensions，并补齐 sha256/coreRange。

### 1.2 应用内验证（分平台）
- Windows：
  - 设置页触发检查 → 命中新版本。
  - core 下载 → 安装包可打开。
  - renderer override 下载 → 重启后加载 override。
  - extensions 下载 → 插件目录更新并可 reload。
- macOS：
  - 同上流程，验证签名缺失时的警告路径。
  - renderer override 失败时自动回退。
- Linux：
  - 同上流程，关注校验失败提示与不影响启动。

### 1.3 观察窗口
建议观察窗口 ≥ 1 小时：
- 更新检查/下载失败率
- 更新提示与错误日志可追踪
- renderer override 生效/回退日志
- extensions 安装/回滚日志

---

## 2) 回滚策略

### 2.1 Core-only 回滚
- 立即停止发布：撤回/下架 pre-release tag。
- 通知用户切换回稳定渠道（Release）。
- 必要时发布修复版本覆盖异常版本。

### 2.2 Renderer Override 回滚
- 禁用 override（推荐最小操作）：
  - 修改 `config/renderer-override.json` → `enabled=false`。
  - 或删除对应 override 目录（如 `modules/renderer-override/<version>`）。
- 重启后加载内置 renderer。

### 2.3 Extensions 回滚
- 使用 `modules/extensions-backup/<timestamp>/` 中的备份恢复插件目录。
- 若新插件为首次安装，可直接移除该插件目录。
- 重启或触发插件 reload 确认恢复成功。

---

## 3) 上线检查清单（逐条确认）

- [ ] Manifest 校验脚本通过（core/renderer/extensions 全量覆盖）。
- [ ] pre-release 在 Win/macOS/Linux 完成检查 → 下载 → 安装/应用。
- [ ] renderer override 兼容性（coreRange）验证通过。
- [ ] extensions 更新成功且支持回滚。
- [ ] 更新渠道映射、频率设置与 UI 展示一致。
- [ ] 关键日志与错误提示可追踪（无崩溃）。
