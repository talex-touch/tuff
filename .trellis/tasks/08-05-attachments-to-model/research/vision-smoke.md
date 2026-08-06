# 附件进模型 · vision 冒烟证据

日期：2026-08-05 · 机器：darwin 25.5.0 · `pi` 0.83.0（`~/.local/share/mise/installs/node/24.18.0/bin/pi`）

测试图 `vision-smoke-input.png`（本目录，900×500）：白底 + 左侧红色实心圆 + 蓝色文字 `TUFF-4271`。用
`magick -size 900x500 xc:white -fill '#c01c28' -draw "circle 180,250 180,150" -fill '#1a5fb4' -pointsize 90 -gravity east -annotate +60+0 'TUFF-4271'` 生成。

## 1. 手动 argv（与 buildPiArgs 输出同形）· text 模式

```
pi --print --mode text --no-tools --no-session --no-extensions --no-skills --no-context-files \
   --system-prompt "You are a helpful assistant embedded in the Talex Touch desktop app. Answer concisely and directly. You have no tools available in this conversation." \
   @/tmp/attach-smoke.png "Describe exactly what you see in this image in one sentence."
```

输出原文：

```
A solid red circle appears on the left of blue text reading “TUF-4271” on a white background.
```

## 2. 同上，`--mode json`（provider 实际解析的 NDJSON 通道）

问题换成 `What exact text is written in this image? Reply with the text only.`，退出码 0，17 行 NDJSON。
用 `parsePiCliLine` 归并后：

```
provider=codex
model=gpt-5.6-terra
text="TUF-4271"
```

## 3. 负对照：同一条命令去掉 `@file`

```
pi --print --mode text ... "What exact text is written in this image? Reply with the text only."
```

```
No image provided.
```

→ 描述确实来自图片本身，不是从提示词里编出来的。

## 4. 端到端：跑本任务的真实代码（spillAttachments + buildPiArgs + parsePiCliLine + 真 pi）

脚本把 PNG 读成 data URL、组成 `IntelligenceMessage.attachments`，然后原样调用主进程模块：

```
spilled: [ '/var/folders/08/.../T/tuff-attach-b6a8919d-b6d8-4c5d-bb86-fa5ef11676ff.png' ]
mode: 600
argv tail: ["You are a helpful assistant embedded in the Talex Touch desktop app. Answer concisely and directly. You have no tools available in this conversation.",
            "@/var/folders/08/.../T/tuff-attach-b6a8919d-b6d8-4c5d-bb86-fa5ef11676ff.png",
            "What exact text is written in this image? Reply with the text only."]
model: gpt-5.6-terra
answer: "TUF-4271"
```

`cleanup()` 后 temp 目录 `tuff-attach-*` 计数为 0。

## 结论

通道打通：data URL → 0600 临时文件（扩展名由 MIME 决定）→ `@path` 位置参数 → 模型看到图。
模型把 `TUFF` 读成 `TUF`（字体连排双 F 的 OCR 抖动），不影响「模型确实看到了图」这一判据——负对照下它明确回答
`No image provided.`。

未覆盖：真实 UI 里点击回形针 → 发送这一段（需要 GUI）。渲染层由 `attachment-payload.test.ts` /
`useHomeConversation.test.ts` 覆盖到 payload 边界为止。
