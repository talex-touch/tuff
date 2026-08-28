# 实施计划

## 1. TPEX 直接测试先行

- 建立 `tpex-provider.test.ts`，覆盖官方同源、外域直链、自定义 API Source、相对/绝对 package URL 和显式 Authorization。
- 为下载 utility 增加逐跳 redirect 测试，先证明跨域下一跳会收到 Token，再使修复后的测试转绿。

## 2. 最小安全实现

- 将 TPEX request headers 改为实际 URL 感知的大小写不敏感合并。
- 为 NetworkService stream 增加 manual/no-auto-redirect 能力，在下载 utility 内受控跟随并逐跳重新解析 headers。
- Registry detail 与 package download 分开解析 headers，保持进度、超时和临时文件清理语义。

## 3. 修复 Clipboard 假绿

- 复现 5/5 绿色同时出现 unhandled rejection 的基线。
- 收窄测试导入、补 Electron session 等必要 mock，并安装测试进程异常哨兵。
- 运行单文件和插件宿主聚焦集，确认 stderr 无未处理异常。

## 4. 质量门禁

- 运行 TPEX/download/Clipboard focused tests。
- 运行 CoreApp node typecheck、修改路径 lint、插件宿主相关聚焦集和 `git diff --check`。
- 对鉴权 helper 做一次失败变异，确认关键安全测试确实变红后恢复。

## 5. 执行结果（2026-08-23）

- TPEX：按实际 URL 严格同源注入自动 Token；detail 拒绝跳转；package 下载逐跳 manual redirect，跨 origin 剥离 Authorization。
- Header：大小写不敏感合并，请求专属显式值优先；registry provider Authorization 不继承到跨域 package。
- URL/资源：统一 WHATWG URL 解析，限制 HTTP(S)、Location 和 5 次跳转；旧响应流关闭后才发下一跳。
- 文件：使用 `pipeline()` 收束 source/writer，异常后无部分文件残留。
- Clipboard：隔离 Image Persistence/Precore 导入链，Electron mock 收窄到真实 owner，process 异常哨兵带正控制。
- 门禁：关键 38/38、扩大 858/858、ESLint、Node typecheck、Trellis validation、diff-check 全部通过。
