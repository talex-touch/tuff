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

## M2 保留策略落地 — 已完成

- [x] 采集时按 `retentionClass` 写 `retention_protected`（`afc5c36f4`）
- [x] `1-hour` 预设（`7888a1644`）
- [x] `retention_expires_at` 列 + 幂等迁移 + 部分索引
- [x] 验证码写 per-item 过期时间
- [x] `clipboard-retention-owner` 的到期扫描（预览 / 受保护计数 / 分页 / DELETE 共用一个 `DUE_CLAUSE`）
- [x] stage-B 在 `sourceApp` 解析出来后重跑分类（`9334104cc`）

**过程中修掉的三个问题：**

1. `PRIVACY_RETENTION_PRESETS` 在 `privacy-lifecycle-service.ts` 里有第二张手抄表。加一档要改两处、忘了没有任何检查会说话——已改成引用共享常量。
2. 到期判定第一版读 `Date.now()`。这套 owner 整个设计成从请求取 `nowMs` 才可确定性测试，测试立刻抓到：请求时钟固定在五周前，墙上时钟让一条未到期的记录变成已到期。`nowMs` 现在随 scope 传递。
3. 到期条件曾要在四处各写一遍（预览、受保护计数、分页扫描、DELETE）。抽成 `DUE_CLAUSE` 常量——四处不一致的话，预览说要删 N 条、实际删掉另一批。

**负控制都跑过**：去掉 `retention_protected` 写入、把 `DUE_CLAUSE` 改成恒假、去掉 stage-B 的过期写入，对应测试分别变红。

**已知缺口**：历史数据不回填。库里已有的密钥仍会在 90 天后被删。

---

## M3 详情显示预计删除时间 — 未开始

- [ ] `getHistory` 每条记录带回 `expiresAt` / `retentionReason`，计算顺序：收藏 → protected → per-item → category
- [ ] 计算逻辑与清理侧共用同一个函数，否则界面会承诺一个不会发生的删除
- [ ] 插件「更多信息」加一行：`N 天后（YYYY-MM-DD HH:mm:ss）`；永不删除的显示原因

## M4 设置可配置 — 未开始

- [ ] 隐私设置页把 clipboard-history 拆成三档（密钥 / 验证码 / 普通）
- [ ] 自定义密钥前缀输入（`customKeyPrefixes`）
- [ ] 验证码时长目前是采集侧和 stage-B 两处的常量，M4 要把它们一起接到策略上

---

## 完成前

- [ ] 三侧 test + typecheck 全绿（AC10）
- [ ] 真实窗口人工过一遍：复制一个 key、一条验证码短信、一段普通文本，看标签、掩码、预计删除时间三者是否自洽
- [ ] AC1–AC10 逐条对照勾选，没做到的写原因
- [ ] 历史数据不回填这一缺口，在收尾报告里明确说出来（库里已有的密钥仍会在 90 天后被删）
