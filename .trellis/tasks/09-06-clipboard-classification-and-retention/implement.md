# Implement — 剪贴板内容分类统一与按类保留策略

四个里程碑，每个单独可验证、单独提交。M1 是其余三个的地基。

## 验证命令

```bash
# 共享包
./node_modules/.bin/vitest run --root packages/utils __tests__/clipboard

# 插件
cd plugins/clipboard-history && ./node_modules/.bin/vitest run && ./node_modules/.bin/vue-tsc --noEmit

# 主进程
cd apps/core-app && ../../node_modules/.bin/vitest run src/main/modules/clipboard src/main/modules/privacy
```

> commitlint 的 type 白名单里没有 `refactor`，用 `ref`。lint 走各包自己的配置（`pnpm -C <pkg> exec eslint`），根配置的报错是既有噪音。

---

## M1 共享分类器（地基）— 已完成 `185be8727`

- [x] 新建 `packages/utils/clipboard/content-classifier.ts`
- [x] 迁入两侧规则并集，每条命中带 span，掩码改由 span 驱动
- [x] 未识别 API 密钥规则（含熵检查与词典式否决）
- [x] 验证码三条判据，裸数字不判
- [x] 主进程 `clipboard-tagging.ts` 与插件 `clipboard-shapes.ts` 改成薄封装
- [x] `CLIPBOARD_TAG_LABELS` 补齐新 tag 中文标签
- [x] 新旧 tag 产出逐条比对，9 处差异全部有解释，钉成表驱动回归测试

**合并过程中被实证抓到的三个缺陷**（都不是靠读代码发现的）：

1. 扫描顺序错了：通用字段规则先占住区间，`api_key: sk-xxx` 里更具体的 OpenAI 判定被当成重叠丢弃，服务名标签一起没了。改成已知服务优先。
2. `token is important for this project` 被判成凭据。旧实现只是多挂个标签，新实现会把它标成永不删除并打码。加了散文守卫。
3. 守卫第一版是「纯小写即散文」，把 `Bearer abcdefghijklmnop` 这种真 token 误杀了。改成「短的纯小写」。同时发现合并时**弄丢了 `BEARER_PATTERN`** 整条规则（`Bearer <token>` 没有分隔符，字段式那条匹配不到），补回。

JWT 过期判定留在插件侧：共享分类器只回答「是不是密钥、在哪一段」，主进程不需要解 base64。

---

## M2 保留策略落地 — 部分完成

- [x] 采集时按 `retentionClass` 写 `retention_protected`（`afc5c36f4`）。清理侧无需改动，所以配了负控制测试证明它真的生效。
- [ ] `PRIVACY_RETENTION_PRESETS` 与 `PERIOD_MS` 加 `1-hour`
- [ ] schema 加 `retention_expires_at` + 幂等迁移
- [ ] 验证码写 per-item 过期时间
- [ ] `clipboard-retention-owner` 增加过期扫描
- [ ] stage-B 在 `sourceApp` 解析出来后重跑分类

**发现的时序约束**：`sourceApp` 要到 stage-B 才解析，采集时拿不到。所以验证码的第三条判据（来自短信/邮件应用的裸数字）在采集阶段不可能命中，必须在 stage-B 补一次分类。这一条设计时没预见到。

---

## M3 详情显示预计删除时间 — 未开始
## M4 设置可配置 — 未开始

---

## 完成前

- [ ] 三侧 test + typecheck 全绿（AC10）
- [ ] 真实窗口人工过一遍：复制一个 key、一条验证码短信、一段普通文本，看标签、掩码、预计删除时间三者是否自洽
- [ ] AC1–AC10 逐条对照勾选，没做到的写原因
- [ ] 历史数据不回填这一缺口，在收尾报告里明确说出来（库里已有的密钥仍会在 90 天后被删）
