# PRD: Tuff 2.5.8 ASR Provider Runtime

> 更新时间：2026-05-16
> 状态：Planned / Direction Locked
> 目标版本：2.5.8

## 1. 最终目标

2.5.8 将语音转文字作为独立 ASR Provider Runtime：用户可以在隐私、成本、准确率和设备性能之间选择本地或云端转写策略，并把转写结果交给 CoreBox、OmniPanel、Workflow 和 Intelligence 能力继续处理。

工程目标是复用现有 `stt` / `audio.transcribe` capability，新增本地 `whisper.cpp` provider 与云端 provider 抽象；不把 ASR 绑定到 2.5.5 本地 LLM runtime，也不把 TTS 纳入本版本 Stable。

## 2. 产品方向

- Provider 抽象先行：本地、云端、自定义 ASR 共享统一接口、健康状态、错误语义与审计字段。
- 本地默认技术路线为 `whisper.cpp`：优先离线、跨平台、可打包，不引入 Python / CUDA 作为桌面默认依赖。
- 云端作为显式策略：支持 `cloud-only` 和 `auto`，但隐私内容必须允许用户强制 `local-only`。
- 音频文件转写先于 streaming：第一版先稳定短音频 / 文件转写，再进入实时转写和 VAD。
- 转写结果结构化：返回 transcript、segments、timestamps、language、confidence、provider/model 与 artifact metadata。

## 3. 范围与非目标

### Stable 范围

- 音频 artifact：录音或导入音频保存为可审计的本地 artifact，记录格式、时长、来源与临时文件生命周期。
- `ASRProvider` 抽象：`transcribeFile`、`getHealth`、provider strategy、错误码与降级原因。
- 本地 `whisper.cpp` provider：支持 short voice / 快捷输入 / 隐私内容离线转写。
- 云端 ASR provider：支持 OpenAI / 国内云 / 自定义 OpenAI-compatible 的文件转写能力配置。
- 用户策略：`local-only`、`cloud-only`、`auto`；`auto` 根据音频长度、设备能力、网络状态和隐私标记选择 provider。

### Beta / Experimental

- `transcribeStream`：实时转写、partial transcript、delta 输出。
- 本地 VAD 断句：减少短句延迟，支持会议场景分段。
- 长音频 / 会议模式：分片、重试、进度、说话人标签和摘要入口。
- faster-whisper：仅作为高级/服务端环境评估，不作为桌面默认依赖。

### 非目标

- 不做 TTS。
- 不默认把隐私音频上传云端。
- 不把 faster-whisper、Python、CUDA toolkit 作为默认桌面依赖。
- 不实现语音唤醒或 Assistant 悬浮球默认开启。
- 不把音频原文或完整转写文本写入普通日志或同步 JSON。

## 4. 接口方向

文档层面锁定后续实现接口，不在本 PR 直接改代码：

```ts
interface ASRProvider {
  transcribeFile(input: TranscribeFileInput): Promise<TranscribeResult>
  transcribeStream?(input: TranscribeStreamInput): AsyncIterable<TranscribeStreamChunk>
  getHealth(): Promise<ASRProviderHealth>
}
```

2.5.8 实现时需要把 `LOCAL` provider 纳入 `stt` / `audio.transcribe` 支持范围；云端 provider 继续复用 Provider registry / Capability / Scene 约束。

## 5. 质量与安全约束

- Permission：录音入口必须经过麦克风权限检查；导入文件无需麦克风权限但需文件访问审计。
- Privacy：`local-only` 策略不得触发云端请求；`auto` 遇到隐私标记必须退回本地或明确失败。
- Storage：音频 artifact 有生命周期管理，默认不进入同步载荷；转写结果进入业务存储前需要用户动作或明确场景。
- Runtime：ASR 不可用必须返回明确 `unavailable/degraded + reason`，不得返回伪成功。
- Performance：本地转写必须支持取消、超时、进度；长音频必须分片处理。
- Transport：新增接口必须使用 typed transport / domain SDK，不新增 raw channel。

## 6. 验收清单

- [ ] `local-only` 可在无网络环境完成短音频转写。
- [ ] `cloud-only` 可调用至少一个云端 ASR provider，并返回统一 transcript result。
- [ ] `auto` 在本地不可用、云端不可用、隐私标记存在时都有明确选择或失败原因。
- [ ] 转写结果包含 transcript、segments/timestamps、provider/model、latency 与 trace metadata。
- [ ] 音频 artifact 清理、权限提示、失败重试和取消路径可见。
- [ ] README/TODO/CHANGES/INDEX/Roadmap/Quality Baseline 按影响同步。

## 7. 关联入口

- AI 2.5.0 主线：`./ai-2.5.0-plan-prd.md`
- 本地知识检索：`./ai-2.5.3-local-knowledge-retrieval-prd.md`
- 本地模型运行时：`./ai-2.5.5-local-model-runtime-prd.md`
- 当前执行清单：`../TODO.md`
- 产品路线图：`../01-project/PRODUCT-OVERVIEW-ROADMAP-2026Q1.md`
- 质量基线：`../docs/PRD-QUALITY-BASELINE.md`
