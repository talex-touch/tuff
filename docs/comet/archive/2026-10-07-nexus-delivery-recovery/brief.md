# 目标
减少 Nexus 文档首屏和切页的无关资源及串行等待。文档正文继续预渲染为 HTML，交互组件按需加载。Nexus 地理位置展示复用现有 TuffEx 地图，移除 Leaflet。

# 范围
按以下顺序在一个独立 Native change 内实施：

1. 将 Dashboard 概览和设备页的 Leaflet 地图迁移到现有 `TxBubbleMap`。复用本站 GeoJSON，保留坐标、标签、数值、颜色和点选事件。
2. 核对目录页、侧栏和正文链接的中英文导航。修正静态 HTML、JSON 和 Markdown 的目录别名缺失或不一致。
3. 修正文档多语言一致性。显式 `/zh/docs/...` 和 `/en/docs/...` 路由决定文档正文及周边 UI 的语言，切换后保留当前文档位置。
4. 修复动态 TuffEx 导入提前加载 CSS 的问题。统一 Nexus 自动注册、显式子路径导入和工具模块的 source/dist 来源。
5. 文档站内导航直接读取完整正文响应，取消先元数据、再等待正文的串行过程。复用已有缓存、请求合并和过期结果隔离。
6. 按文档使用情况收紧组件和 Demo 的依赖。保留静态正文、代码和 SEO 信息，交互 Demo 继续在激活时加载。

## Source coverage

覆盖边界为原会话最终确认的 brief、完整 nexus-web-delivery Spec，以及最终候选的成功源码修改。早期失败尝试仅用于恢复溯源，不作为当前实现或通过证据。原始主会话与四个 Tester 记录已完整解析；源码以原基线 7897a1d7b 和原始成功 write/edit 重放，另保留当前 stage 的无关变更。

| 来源条目与位置 | 读取状态 | 需要保留的内容 | Spec 位置 | 验收 ID | 覆盖状态 | 理由或替代关系 |
| --- | --- | --- | --- | --- | --- | --- |
| 原 brief 验收第 1 项及对应原 Spec | complete | 地图复用及真实空态 | specs/nexus-web-delivery/spec.md / 地图复用现有组件 | A1 | covered | 保留原确认行为，重新实际验收 |
| 原 brief 验收第 2 项及对应原 Spec | complete | 目录和静态入口 | specs/nexus-web-delivery/spec.md / 文档目录与静态文件使用同一身份 | A2 | covered | 保留原确认行为，重新实际验收 |
| 原 brief 验收第 3 项及对应原 Spec | complete | 文档语言一致 | specs/nexus-web-delivery/spec.md / 文档显式语言与周边 UI 一致 | A3 | covered | 保留原确认行为，重新实际验收 |
| 原 brief 验收第 4 项及对应原 Spec | complete | 动态样式边界 | specs/nexus-web-delivery/spec.md / 动态导入的样式保持动态 | A4 | covered | 保留原确认行为，重新实际验收 |
| 原 brief 验收第 5 项及对应原 Spec | complete | source/dist 单实例 | specs/nexus-web-delivery/spec.md / TuffEx 有状态模块保持单一实例 | A5 | covered | 保留原确认行为，重新实际验收 |
| 原 brief 验收第 6 项及对应原 Spec | complete | 单次完整正文导航 | specs/nexus-web-delivery/spec.md / 站内切页读取完整正文响应 | A6 | covered | 保留原确认行为，重新实际验收 |
| 原 brief 验收第 7 项及对应原 Spec | complete | 本页 Demo 实现隔离 | specs/nexus-web-delivery/spec.md / 页面只携带实际使用的组件和 Demo | A7 | covered | 保留原确认行为，重新实际验收 |
| 原 brief 验收第 8 项及对应原 Spec | complete | SSG 与接管 | specs/nexus-web-delivery/spec.md / 预渲染正文独立可读且可正确接管 | A8 | covered | 保留原确认行为，重新实际验收 |
| 原 brief 验收第 9 项及对应原 Spec | complete | 生产运行及同条件证据 | specs/nexus-web-delivery/spec.md / 优化结果有同条件运行证据 | A9 | covered | 保留原确认行为，重新实际验收 |

# 非目标
- 不重建更新、登录、Provider、支付或权限系统，不修改地理数据的后端来源。
- 不将文档改成纯 SPA，不用空壳、延迟正文或删除 Demo 换取更小的资源数字。
- 不新增地图供应商、地理编码服务或通用图表库，不承诺 SVG 世界地图具备街道瓦片的细节。
- 不做无关视觉重设计、全站翻译重写或泛化缓存重构。
- 不自动部署、修改 Cloudflare 线上规则、提交、合并、推送、建 PR 或归档其他任务。

# 验收示例

- 概览和设备页使用现有 TuffEx 地图展示有效坐标、标签和数值，无坐标时显示本地化空态。点选事件仍能返回对应记录，页面不再请求 Leaflet/unpkg 或 OpenStreetMap 瓦片。
- 中英文 Developer、Concepts 和组件目录页均可直接访问、站内导航及前进后退。有效目录及其 index 拼写具有对应静态 HTML、JSON 和 Markdown，不再误报 Document not found；不存在的文档仍返回真实未找到结果。
- 文档 URL、正文、侧栏、目录、周边 UI 和 Demo 文案使用一致语言。中英往返、刷新及快速切换后以最后路由为准，链接保留语言，不展示未翻译键，不被浏览器或账户偏好切回另一种语言。
- 仅包含动态组件导入的模块不会提前加载这些组件的 CSS。激活组件时加载其样式及完整依赖，静态导入仍有正确样式，既有显式 CSS 导入不重复下载。
- Nexus 同一运行模式下的 TuffEx 自动注册、显式组件和工具模块来自同一套实现。生产预览的 Toast Demo 能展示提示，Overlay 共用层级管理，不出现 source/dist 分裂导致的交互失效。
- 未缓存的站内文档切换通过一个完整正文响应取得元数据和正文，不先等待 meta 请求再等待 body。已缓存页面复用结果，快速导航或切语言时旧响应不会覆盖新页面，失败保留明确错误和现有重试入口。
- 文档首屏只加载公共页面壳、本页组件和实际依赖，不加载其他文档的 Demo 或其重型依赖。滚动激活及重置本页 Demo 后交互、样式和语言仍正确，页面之间不会携带整份 Demo 注册表作为首屏依赖。
- 生产预渲染的中英文文档在禁用 JavaScript 时已有标题、正文和代码。恢复 JavaScript 后正文保留，首屏不重新请求正文；canonical、alternate、静态缓存规则和既有 URL 形态保持正确。
- 在真实浏览器回归地图、目录、语言、普通组件页及 Toast Demo。用同一构建模式和缓存条件比较优化前后请求数、CSS/JS 资源和串行等待，分别报告本地与线上边界，不把开发模块数量或历史部署问题当成当前生产收益。

# 约束与不变量

- 工作区为已授权的独立 worktree，分支 `comet/nexus-delivery-recovery`，目标分支 `stage`。源码位于持久目录 `/Users/talexdreamsoul/orca/workspaces/talex-touch/nexus-delivery-recovery`，大体积构建和运行产物单独放 `/tmp`；原始证据和恢复快照保存在持久目录。
- 保留其他会话和旧任务的源码、进度、验收状态及配置。旧工作区归属恢复已通过原提交及 Runtime 重建完成，不纳入 Nexus 产品改动。
- 沿用现有 Nuxt、内容解析、静态路由、请求缓存、TuffEx 子路径和动效约定，不增加另一套渲染器、语言状态或请求机制。
- SSR 与 hydration 的正文请求模式和数据键保持一致。不能因优化元数据请求而丢弃已渲染正文。
- 公开文档的静态缓存不扩大到评论、反馈、参与记录、助手或账户数据。

# 关键决定

- 地图改用 SVG 世界地图及气泡点位，不再依赖街道瓦片。复用已有 `TxBubbleMap` 和本地世界 GeoJSON。
- 文档显式 URL 的语言优先；文档之外的既有语言偏好行为不变，直接访问文档不主动改写账户偏好。
- source/dist 的具体统一方式属于实现选择，但同一页面不能混用两套有状态工具模块。
- 一个 change 顺序推进。文档语言、加载、组件解析和静态交付共用核心文件，不拆成多个并行子 change。
- 已有 SSG HTML 正文继续保留。本次产物需要部署后才会影响线上旧资源，不把未部署的优化描述成线上已生效。

# 验证要求

复用受影响模块的现有检查。验证必须包含生产构建或等价生产预览的真实浏览器观察，不能仅凭源码字符串断言、开发模式截图或编译成功判定资源边界正确。

分别观察直接加载、hydration 和站内切换。保存真实网络资源、目录静态文件和交互证据；尚未执行或需要部署才能观察的边界明确标注。

# 恢复方式与收尾授权

- 用户已明确选择“本地合并”，并在原工作区缺失后明确选择“从会话重建”及继续执行。恢复沿用原始完整 A1–A9 目标、关键决定和非目标，不引入新的产品设计。
- 本次新建恢复需求，不手工复制旧 comet-state.yaml、Runtime 或已通过 verification.md。原 9/9 仅是历史证据，当前生产构建、浏览器操作和独立 Verifier 必须重新执行。
- 先保存完整源码提交，再按已授权方式归档并本地合入 stage；不推送、不部署、不创建 PR、不清理他人工作区。保留 stage 已有 Terminal Demo、导航及其他会话增量。
- 原全站绝对体积门禁失败及请求/JS 增加的限制不得隐藏或改阈值；新测量使用当前实际产物，并如实报告。
