# CLI 协议样本（2026-09-06，本机实测，密钥已去除）

所有命令在空目录 `/tmp/tuff-cli-empty` 下、stdin 关闭（`</dev/null`）执行。

## omp 18.0.11 — `omp -p --mode json … --model codex/gpt-5.6-terra "Reply with the single word pong"`（8 s）

```
{"type":"session","version":3,"id":"…","timestamp":"…","cwd":"/tmp"}
{"type":"agent_start"}
{"type":"turn_start"}
{"type":"message_start","message":{"role":"user","content":[{"type":"text","text":"Reply with the single word pong"}],…}}
{"type":"message_end","message":{"role":"user",…}}
{"type":"message_start","message":{"role":"assistant","stopReason":"stop","usage":{"input":0,"output":0,…}}}
{"type":"message_update","assistantMessageEvent":{"type":"text_start","contentIndex":0}}
{"type":"message_update","assistantMessageEvent":{"type":"text_delta","contentIndex":0,"delta":"pong"}}
{"type":"message_update","assistantMessageEvent":{"type":"text_end",…}}
{"type":"message_end","message":{"role":"assistant","stopReason":"stop","usage":{"input":21304,"output":5,"cacheRead":0,"cacheWrite":0,"totalTokens":21309,"cost":{…}}}}
{"type":"turn_end",…}
{"type":"agent_end"}
```

与 pi 的 `parsePiCliLine` 逐字段兼容（`message_update.assistantMessageEvent.text_delta`、`message_end.stopReason/usage`）。
`@/path/note.txt` 会以 `<file name="…">…</file>` 前缀进入 user 消息；`@dot.png` 图片可被读取（返回「Solid bright red color」）。
`--system-prompt "Answer with one word only."` 生效。

`omp models --json --no-extensions`（6 s，5 KB）：
```
{"models":[{"provider":"codex","id":"gpt-5.6-luna","selector":"codex/gpt-5.6-luna","name":"GPT-5.6 Luna","contextWindow":1050000,"maxTokens":128000,"reasoning":true,"thinking":["low","medium","high","xhigh","max"],"input":["text","image"],"cost":{…}}, …18 条]}
```

## codex 0.145.0 — `codex exec --json --ephemeral --skip-git-repo-check --ignore-rules -s read-only -C /tmp/tuff-cli-empty --color never -c 'mcp_servers={}' "Reply with the single word pong"`（17 s；不带 `-c mcp_servers={}` 时 75 s，因为启动了用户全部 MCP server）

```
{"type":"thread.started","thread_id":"…"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"agent_message","text":"pong"}}
{"type":"turn.completed","usage":{"input_tokens":12935,"cached_input_tokens":2432,"cache_write_input_tokens":0,"output_tokens":41,"reasoning_output_tokens":39}}
```
stderr 首行固定 `Reading additional input from stdin...`（stdin 已关闭时无害）。无 delta 事件。

未知模型 `-m no-such-model-xyz`：
```
{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Model metadata for `no-such-model-xyz` not found. Defaulting to fallback metadata; …"}}
{"type":"turn.started"}
{"type":"error","message":"Reconnecting... 1/5 (unexpected status 404 Not Found: …)"}   ×5
{"type":"error","message":"unexpected status 404 Not Found: …"}
{"type":"turn.failed","error":{"message":"unexpected status 404 Not Found: …"}}
```

## claude 2.1.259 — `claude -p --output-format stream-json --verbose --include-partial-messages --no-session-persistence --strict-mcp-config --setting-sources "" --tools "" --disable-slash-commands --no-chrome --model sonnet "Reply with the single word pong"`（2 s）

```
{"type":"system","subtype":"init","cwd":"…","session_id":"…","tools":[],"mcp_servers":[],"model":"claude-sonnet-5","permissionMode":"default",…}
{"type":"system","subtype":"status","status":"requesting",…}
{"type":"stream_event","event":{"type":"message_start","message":{"model":"claude-sonnet-5",…}}}
{"type":"stream_event","event":{"type":"content_block_start",…}}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"p"}}}
{"type":"stream_event","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"ong"}}}
{"type":"assistant","message":{…}}
{"type":"stream_event","event":{"type":"content_block_stop"}}
{"type":"stream_event","event":{"type":"message_delta",…}}
{"type":"stream_event","event":{"type":"message_stop"}}
{"type":"result","subtype":"success","is_error":false,"result":"pong","duration_api_ms":2307,"stop_reason":"end_turn","session_id":"…","total_cost_usd":0.03422,"usage":{"input_tokens":2,"cache_creation_input_tokens":8544,"cache_read_input_tokens":0,"output_tokens":4,…}}
```
未知模型：`result` 为 `{"subtype":"success","is_error":true,"result":"API Error: 400 unknown provider for model no-such-model-xyz"}`，
`assistant.message.model` 为 `<synthetic>`，exit 1，stderr `[claude-code:unrecognized_model] {…}`。**`subtype` 不可信，判 `is_error`。**

## pie 0.1.45 — `~/.local/bin/pie`

`bin/pie.mjs`：`which pi` 找到 pi 后 `run(piBin, process.argv.slice(2))` 透传；只拦截 `update` / `version|--version|-v` / `about`。
`pie --version` → `Touch Pie v0.1.45`（不是 pi 版本）。
