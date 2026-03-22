# Nexus 设备授权风控实施方案（2.4.9）

> 更新时间：2026-03-22  
> 来源提炼：`plan/2026-02-22_23-30-00-nexus-device-auth-risk-control.md`  
> 适用范围：`apps/nexus` 设备码授权链路、登录历史、设备管理、CLI 登录配套

## 1. 目标

- 强化设备码授权安全性，降低跨网络/异常设备长期授权滥用风险。
- 让授权来源可追踪（App / CLI / External），支持快速撤销与审计。
- 在不引入复杂外部风控的前提下，保持授权流程可解释、可回滚、可验收。

## 2. 范围与非目标

### 2.1 本期范围

- 设备码授权链路：`/api/app-auth/device/*`
- 登录历史：`/api/login-history`
- 设备管理：`/api/devices`
- Dashboard 设备授权页交互与提示文案

### 2.2 非目标

- 不引入外部风控引擎或第三方风险评分服务。
- 不引入额外人机验证流程（如二次 Turnstile 挑战）。
- 不改变现有 CLI 登录主流程与公开 API 语义。

## 3. 风控策略分期

### 3.1 Phase 0（已落地，2026-03-22 完成统一验收）

- 记录设备码请求 `request_ip`、`client_type`。
- 授权确认时校验 CLI 发起 IP 与浏览器当前 IP 一致性。
- 长期授权仅在“常用设备 + 常用登录地”组合下可选。
- 设备授权页禁用长期授权时给出可理解原因。
- 登录历史/设备管理展示授权来源（App / CLI / External）。
- 授权完成后执行多策略关闭标签页（`window.open + window.close`）。

### 3.2 Phase 1（2.4.9 主线收口）

- 速率限制：按 `user_id / device_id / IP` 约束设备码申请频率。
- 异常冷却：连续失败/取消超过阈值后进入冷却期（默认 10 分钟）。
- 授权审计：记录批准/拒绝/撤销日志（时间、原因、来源、操作者）。
- 可信设备管理：补齐常用设备/常用登录地标记与白名单策略。
- 长期授权时间窗：仅允许在登录后 N 分钟内发起长期授权确认。

### 3.3 Phase 2（可选增强）

- 本地规则 IP/ASN 风险分级（不接外部评分服务）。
- 异地授权提醒（站内/邮件）与一键撤销入口。
- 增强设备指纹校验（`device_id + fingerprint` 组合）。

## 4. 验收标准

- CLI 设备码登录成功后，登录历史与设备管理展示来源为 `CLI`。
- 发起端 IP 与确认端 IP 不一致时，授权被拒绝且原因可见。
- 非常用设备/地点场景下，长期授权入口不可选且带解释提示。
- 撤销设备授权后该设备 token 立即失效（`token_version` 生效）。
- 审计日志可追踪授权批准/拒绝/撤销行为并具备时间线。

## 5. 回滚策略

- 出现误判或误封时，优先回退到“仅短期授权可用”模式。
- 通过配置开关关闭严格风控分支，保留基础设备码登录。
- 回滚过程中保留审计日志，不清理历史判定与授权记录。

## 6. 风险与豁免边界

- 风险：IP 漂移（移动网络/企业代理）导致误拒绝。
  - 缓解：引入短期授权兜底 + 明确错误提示 + 冷却期复试入口。
- 风险：过严频控影响真实用户登录体验。
  - 缓解：按用户等级与来源分层阈值，审计后再逐步收紧。
- 豁免边界：
  - 仅允许临时豁免单个账号/设备，不允许全局关闭所有风控。
  - 豁免必须记录责任人、原因、时间窗与复盘结论。

## 7. 执行与同步要求

- 本文档为 `2.4.9` 阶段 `Nexus 设备授权风控` 的实施入口。
- 状态变化必须同步：`TODO / README / INDEX / Roadmap / Quality Baseline / CHANGES`。
- 验收证据需写入 `CHANGES`（命令、结果、CI run 或日志链接）。

## 8. Phase 0 验收证据（2026-03-22）

| 验收点 | 证据位置 | 结果 |
| --- | --- | --- |
| 设备码请求记录 `request_ip/client_type` | `apps/nexus/server/utils/authStore.ts`（`ensureAuthSchema` 增列 + `createDeviceAuthRequest` 写入） | ✅ |
| 授权确认校验发起 IP 与当前 IP 一致 | `apps/nexus/server/api/app-auth/device/approve.post.ts`（`ip_mismatch` 拒绝分支） | ✅ |
| 长期授权仅常用设备 + 常用登录地可选 | `apps/nexus/server/utils/authStore.ts`（`evaluateDeviceAuthLongTermPolicy`）+ `apps/nexus/server/api/app-auth/device/info.get.ts` | ✅ |
| 设备授权页长期授权禁用原因可见 | `apps/nexus/app/pages/device-auth.vue`（`longTermAllowed/longTermReason`） | ✅ |
| 登录历史/设备管理展示来源（App/CLI/External） | `apps/nexus/server/api/login-history.get.ts` + `apps/nexus/server/utils/authStore.ts`（`mapDevice.clientType`） | ✅ |
| 授权完成多策略关闭标签页 | `apps/nexus/app/pages/device-auth.vue`（`window.open + window.close + sendBeacon`） | ✅ |

## 9. Phase 1 执行状态（主线收口）

| 项目 | 当前状态 | 备注 |
| --- | --- | --- |
| 速率限制（`user_id/device_id/IP`） | ⏳ 待落地 | 进入本轮 P0-2 执行清单 |
| 异常冷却（连续失败/取消） | ⏳ 待落地 | 默认冷却 10 分钟 |
| 授权审计日志（批准/拒绝/撤销） | ⏳ 待落地 | 需补结构化存储与查询 |
| 可信设备白名单策略 | ⏳ 待落地 | 现阶段为“设备 + 历史登录地”判定 |
| 长期授权时间窗（登录后 N 分钟） | ⏳ 待落地 | 待与 reauth 策略合并上线 |

## 10. 回滚演练记录（2026-03-22）

### 10.1 演练目标

- 验证误判场景下可快速回退到“仅短期授权”并保留审计信息。
- 验证回滚后设备码基本链路可继续使用（不阻断登录）。

### 10.2 演练步骤（桌面推演 + 接口级模拟）

1. 构造 `ip_mismatch` 场景，确认 `approve` 返回 `403` 且 `info` 可读到拒绝原因。
2. 将长期授权入口强制降级为短期授权（仅保留 `grantType=short` 路径）并复测授权成功链路。
3. 复核登录历史与设备列表仍可返回来源信息与最近状态。

### 10.3 演练结论

- 回滚策略可执行，且不会清空历史授权判定字段。
- 回滚后主链路可用，风险分支可控。

## 11. 风控告警与值守（2026-03-22）

### 11.1 告警策略

- P0 告警：`device_auth.ip_mismatch` 在 10 分钟窗口内异常突增（>= 10）触发人工复核。
- P1 告警：`device_auth.approve_failed` 连续失败率超过阈值（>= 20%）触发值守确认。
- P1 告警：`device_auth.long_term_blocked` 异常升高（>= 30%）触发策略阈值复盘。

### 11.2 值守责任

- Owner：`Nexus Backend`
- Backup：`Nexus Frontend`
- 响应时效：工作时段 30 分钟内确认，非工作时段次日首班确认。

## 12. 最小可复现门禁与发布前检查单

### 12.1 最小门禁命令

```bash
pnpm docs:guard
pnpm docs:guard:strict
pnpm compat:registry:guard
pnpm size:guard
pnpm legacy:guard
```

### 12.2 发布前检查单

- [ ] 设备码发起/轮询/批准/取消链路冒烟通过（App + CLI）。
- [ ] `ip_mismatch` 拒绝路径可复现且文案可读。
- [ ] 长期授权禁用提示与原因一致（前后端同口径）。
- [ ] 登录历史与设备列表来源字段（`clientType`）正确。
- [ ] 回滚方案演练记录已更新（含时间、操作者、结果）。
