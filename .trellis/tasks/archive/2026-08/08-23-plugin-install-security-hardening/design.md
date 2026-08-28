# 技术设计

## TPEX 鉴权边界

```text
initial URL
  -> merge provider headers + request-specific explicit headers
  -> preserve explicit Authorization for the initial origin
  -> otherwise add app Token only when actual URL.origin == runtime Nexus.origin
  -> request without automatic redirect
  -> redirect: resolve next URL, strip cross-origin Authorization, recompute auto auth
  -> final stream -> temp file
```

- 把 header 解析改为以实际 URL 为输入；runtime Nexus URL 解析失败时返回无自动鉴权 headers。
- Header 合并大小写不敏感，请求专属显式 headers 优先；自动 Token 永不覆盖显式 Authorization。
- Registry detail 和 package download 是两个独立请求。相对 `packageUrl` 基于 `apiBase` 解析，绝对地址保留其 origin，再分别判定自动鉴权。
- 敏感 stream 下载使用 NetworkService 的 manual redirect 路径。每个 hop 只接受 HTTP(S)，限制最大次数，并在跨 origin 时清除 Authorization 后重新计算。
- 无敏感逐跳 resolver 的既有下载调用保持当前行为，减少 GitHub/NPM/File provider 回归面。

## 测试可信度

- TPEX provider 测试 mock auth、runtime Nexus、Store source、NetworkService 和下载层，直接检查 detail 与每个 download hop 的请求 headers。
- Redirect 测试对 manual stream path 给出同源与跨域 Location，证明下一跳 header，而不是只检查 helper 返回值。
- Clipboard 测试只导入被测 owner，完整 mock Electron 必需导出；测试生命周期安装 rejection/exception 哨兵并在 teardown 恢复。

## 错误与清理

- redirect loop、非法 Location/协议、空响应和 stream error 返回稳定错误，不在日志包含 URL 查询凭据或 headers。
- 最终文件前的失败不创建或清理临时文件；写入后的 stream/writer 失败继续删除部分文件。
