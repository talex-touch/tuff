# issue 收尾循环台账

> cron `ab805973`（每 10 分钟，7 天自动过期）· 2026-08-06 起 · 规程见 memory `tuffex-issue-closeout-loop`

| 轮次 | 时间 | 动作 | 剩余 open（#363–#474） |
|---|---|---|--:|
| 1 | 2026-08-06 | 关 5 纯误报（#394 #414 #431 #435 #438，not planned，附 refutedReason）+ 关 45 已修复档（completed，闸门：tuffex vitest 146 文件/1088 用例全绿） | 62 |
| 2 | 2026-08-06 | 关 16 个「仅剩 m4c a11y 尾项」档（#363 #383 #387 #397 #398 #404 #420 #426 #428 #429 #441 #452 #461 #468 #469 #470）——逐条在现行源码 grep/读文验证修复落点后关闭；nav-bar 走契约路线（测试改 span+文档明确交互归包装按钮）、markdown-editor 换合法 group+aria-pressed 模式。闸门复跑绿 | 46 |
| 3 | 2026-08-06 | 关 11 个 L3/m4c 尾项档（#366 #370 #372 #384 #385 #402 #407 #411 #415 #419 #449，行数/结构/属性逐一实测）；**抓出 7 个真未修**进修复队列（见下）。闸门复跑绿 | 35 |
| 4 | 2026-08-06 | **修复队列全清**：worktree `audit-fix/docs-audit-tail-batch` → PR #998 squash 合入 app-shell-v2（b24effb33），关 #371 #413 #416 #455 #460 #464 #473。闸门：vue-tsc 0 错 + vitest 1056 绿 + fences 0 + eslint 干净；audit:exports/types 读 dist 环境性跳过（PR 声明）。教训：①`git add -A` 会把 node_modules **软链**提进来（`.gitignore` 的 `node_modules/` 斜线不匹配 symlink），已 amend 摘除；②合入 app-shell-v2 时 PR 的 `Fixes #n` **不会**自动关 issue（只认默认分支 master），要手动关；③rg `-rn` 替换陷阱又立功一次（refraction-mask-color 差点被误判不存在写成幻影） | 28 |

| 5 | 2026-08-06 | 关 6 个（#365 #368 #375 #417 #442 #465：P0/L3/m4c 落点实测 + orphan demo 归 #362 统一决策）；L5/未分批 40+ 小项全量验证完毕，**22 个 issue 进修复队列 #2**（见下）。发现：chat-composer 已迁入 chat/src（死码仍在）、switch tabindex 幻影三处全在（测试反向断言 undefined）、rg -rn 陷阱再现两次 | 22 |

| 6 | 2026-08-06 | **修复队列 #2 全清 + 收官**：PR #1003（49 文件 / 79 处编辑，21 issue）+ PR #1005（fusion 死变量，#406），均 squash 合入 app-shell-v2（18b45d2f5 / e07e42f25）。**112 个逐组件 issue 全部关闭**，仅剩伞形 #362（等维护者裁定 144 个死重 demo）。闸门：vue-tsc 0 错 · vitest 143 文件/1056 绿（fusion 后 1061）· fences 0 · eslint 干净 | **0**（+1 伞形） |

## ✅ 收官（2026-08-06）

112 个逐组件 issue（#363–#474）**全部关闭**：误报 5 · 已修复直接关 45 · 实测验证后关 33 · 本轮修复后关 29（PR #998 / #1003 / #1005）。

**唯一 open：#362 伞形 issue** —— 承载 137+7 个死重 demo 的删除决策（不可逆，全程无 agent 触碰），外加三类系统性缺陷的记录。等维护者拍板。

**六轮下来最值钱的一条经验**：审计对账表的「批次已完成 → 该 issue 已修」是**推导不是事实**。第 3 轮起改为逐条 grep 现行源码，立刻抓出 7 个「号称完成实则没动」的（m6b 整批的类型项一个没落地）；第 5 轮再验，又抓出 22 个。**批次状态只能用来排优先级，不能用来关 issue。**

## 修复队列 #2（第 5 轮实测确认，待 worktree PR）

**docs-only**：#374 button（variant 默认值改「未设时回退 'secondary'」+ zh 描述充实）· #392 drawer（zIndex 默认改「z-index 管理器分配 seed 10000」+ zh 描述充实）· #403 floating（交互契约补 reduced-motion/IO 停摆/capture scroll+resize 三条）· #437 popover（description 幻影「基于 Tooltip 与 Anchor 链路」→ 基于 TxBaseAnchor；orphan → #362）· #439 progress-bar（snippet 补 mask-background="glass"）· #445 search-select / #471 typing-indicator / #408 glow-text（zh 表描述充实；glow-text orphan×2 → #362）· #453 stack（align/justify 行充实 + 类型注明；orphan → #362）· #458 switch（tabindex 幻影三处改真 native button 语义 + 实测覆盖行改真 + 补 intro 定位句）· #467 transfer（TuffDocSourceLink label 对齐）· #474 virtual-list（交互契约补「容器语义中立，role/aria 由消费者补」）

**source（小改）**：#377 cascader + #447 select（placeholder '请选择' → 'Please select'，no-i18n 英文默认约定）· #379 chat-composer（chat/src/TxChatComposer.vue 的 void textareaRef 死码摘除）· #403 floating（TxFloatingElement.vue:22 `?? 0.01` 死回退）· #406 fusion（--tx-fusion-blur 死变量写入，按源码事实处置）· #423 layout-skeleton（pulse 动画补 prefers-reduced-motion）· #448 skeleton（死三元收敛）· #451 spinner（死 aria-live 摘除 + currentColor 文档改真 + defineProps<SpinnerProps> 接线；demo 副本 → #362）· #459 tab-bar（`'' as any` 去 any）

**demo**：#367 avatar（补 alt + snippet 同步）· #409 gradient-border / #448 skeleton（locale 死分支收敛）

**issue-less 幻影遗留**（handoff 待办 A，随批顺修，credit 到 #362）：breadcrumb 默认图标 'chevron-right'→'i-carbon-chevron-right'、flat-input CapsLock 描述（keyCode→getModifierState）、stagger「mount 后才应用」、container demo var(--tx-color-surface)、toast「不取消旧定时器」否认句、dialog TxBlowDialog useId 归类——逐条先验存在再修。

## 修复队列（第 3 轮实测确认未修，下轮走 worktree PR）

1. **#464 timeline** — docs zh+en：TxTimelineItem `title`/`time` 默认值 `"''"` → `-`（源码 withDefaults 只设 color/active，实际 undefined）
2. **#473 version-capsule** — docs zh+en Exposed 表：`Ref<HTMLButtonElement>` → `Ref<HTMLButtonElement | null>`（源码 TxVersionCapsule.vue:25-26）
3. **#416 icon-button** — docs zh+en `size` 行补 `'xs'`（types.ts:4 与 `--xs` 规则 :133 实存）
4. **#455 stat-card** — docs zh+en 补一句：progress/`variant="progress"` 激活时 `insight` 不渲染（hasInsight 短路）
5. **#413 group-block** — (a) 删文档顶部死 `<script setup>` 块（zh:15-20，demo 全走 `code:` 字符串，10 个 ref 无消费者）；(b) BlockSlot `active` 行（zh:464）措辞改实际行为（仅影响 currentIcon 与插槽作用域参数，无激活视觉样式）。L3「613 行膨胀」按审计自身回溯（H1 分母论）裁定多组件文档形态合理，不动
6. **#371 base-surface** — docs zh+en：refraction Strength/Angle/Profile 三行默认值改实际 fallback（62 / -24 / 'filmic'）；CSS 变量表按 finding 点名范围补 ~10 个（src 共 68 个，全列是噪声）
7. **#460 tabs** — **涉源码**：TxTabs.vue:80 `PropType<any>` → `PropType<TabsAnimation>`（顺带核对 placement/indicatorVariant/indicatorMotion 的 String→union 收紧）；TxTabItem `active` prop 补进 TabItemProps + zh/en 文档表。需 vue-tsc + declaration emission 双闸

> 校验教训：nexus 文档的 API 表是 **TuffPropsTable YAML 块**（`name:`/`default:` 行），markdown 管道表的 grep 模式会漏——查默认值用 YAML 语法匹配。
