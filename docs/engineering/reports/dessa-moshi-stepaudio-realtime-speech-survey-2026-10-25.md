# 端到端全双工实时语音方案调研与实测报告：Dessa、Kyutai Moshi、Step-Audio 与 Tuff Assistant 融合路径

> **报告日期**：2026-10-25  
> **实测机型**：Apple M4 Pro / 48 GB Unified Memory / macOS 27.0 (mac-work)  
> **测试对象**：Block Dessa、Kyutai Moshi (MLX 4-bit)、Step-Audio / StepAudio2、Tuff Native Miko (Sherpa + CampPlus + Qwen3 + Matcha)  
> **关联任务**：`TalexDreamSoul/assistant` · Tuff 桌面助手全双工实时流式 ASR/TTS 与智能体动作融合  
> **状态**：Moshi MLX 4-bit 在 M4 Pro 实测跑通（RTF 0.864，帧延迟 69.08ms / 80ms 预算，TTFA 213.3ms）；形成双脑分层架构决策。

---

## 1. 调研背景与核心问题

在 2026 年 10 月 23~24 日，Jack Dorsey 旗下 Block AI 团队公布了纯语音全双工模型 **Dessa**，宣称其在无文本预训练的前提下，实现了极致拟人、情绪丰富且带停顿/笑声的实时语音交互，并支持在 MacBook Pro（M4 Max 及以上）本地运行。

与此同时，我们在 `mac-work` 上的 `TalexDreamSoul/assistant` 分支前期已跑通以 **Miko**（CoreAudio 原生 48kHz Tap + Sherpa-Zipformer 160ms 流式 ASR + CampPlus 声纹防自激门禁 + Ollama Qwen 本地大模型 + Matcha/Vocos 流式 TTS）为代表的级联全双工管线，并完成了 8 小时稳定性驻留测试。

本次调研核心任务：
1. **摸清现状**：梳理 workmac 历史 `assistant` 研究产物与 Miko 运行态。
2. **多方案实机压测**：在 `mac-work`（M4 Pro 48GB）真实硬件上部署并实测 **Kyutai Moshi (MLX)** 与 **Step-Audio** 系列，量化端侧吞吐、显存、帧时延与双工响应。
3. **架构解耦与结合评估**：评估 Dessa 与开源端到端模型能否以及如何与 Tuff 桌面助理（Tool Calling、剪贴板、文件检索、系统操作）有效结合。

---

## 2. 方案全景横向评测与实测数据

在 `mac-work` 物理机上，我们搭建了独立的基准环境，使用真实的 8.0 秒 48kHz/24kHz 主人语音音频（`/Users/tagzixian/Library/Application Support/miko/owner.wav`）进行流式压测，数据对比如下：

| 评测维度 | 方案 A：Kyutai Moshi (MLX 4-bit) | 方案 B：Tuff Miko (原生级联架构) | 方案 C：Step-Audio 系列 (StepFun) | 方案 D：Block Dessa (未开源) |
|---|---|---|---|---|
| **模型形态** | **端到端纯音频模型** (Audio-to-Audio) | **模块化级联管线** (ASR ➔ LLM ➔ TTS) | 130B 级联多模态 / Step-Audio2-mini | **端到端纯语音模型** (Speech-Only) |
| **主干参数量** | 7.61B (Helium LM + Mimi Codec) | 4B (Qwen3-4B) + 130M (ASR/TTS/SPK) | 130B (Chat) / 3B (TTS-3B / EditX) | 未公开（参数量较小，聚焦轻量化） |
| **实测硬件/环境** | M4 Pro 48GB (Apple MLX Metal) | M4 Pro 48GB (Swift + CoreAudio + Ollama) | 3090 远端 (20.4GB VRAM) / Mac 仅 EditX | 官方宣称 MacBook Pro M4 Max+ |
| **端侧加载时间** | **0.08 s** (safetensors 映射) | **0.05 s** (Swift 原生共享库) | 130B 无法本地加载；EditX ~2.1s | 未知 |
| **内存/显存占用** | **5,056.1 MB (约 5.0 GB)** | **2,850 MB (约 2.8 GB)** | 130B 需 >160GB；3090 显存 20.4 GB | 官方宣称轻量级 |
| **音频帧时间预算** | 80.0 ms (1920 samples @ 24kHz) | 160.0 ms (2560 samples @ 16kHz) | 200.0 ms 块流式 | 毫秒级端到端 |
| **单帧处理耗时** | **69.08 ms** (P95: 73.71 ms)<br>• Mimi 编: 18.9ms<br>• LM 单步: 31.8ms<br>• Mimi 解: 18.4ms | **~20 ms** (ASR Chunk) + 后台 LLM 流 | 依赖 3090 / CUDA 算力 (~45ms) | 宣称快于实时 |
| **实时率 (RTF)** | **0.864** (< 1.0，快于实时) | **~0.15** (ASR 极速，不含 LLM 首字) | 远端网络开销 + RTF ~0.7 | 宣称快于实时 |
| **首字/首音延迟** | **TTFA: 213.3 ms** / TTFT: 530.8 ms | TTFT: 274~300 ms / 首音频: ~550 ms | TTFT: 350~450 ms (经 CF Tunnel) | 宣称几乎无感 |
| **中文与方言支持** | 较弱（主要针对英文、法语训练） | **极强**（中英混说、标点自适应、错别字校正） | **极强**（支持粤语、四川话、情感克隆） | 宣称多语言探索中，目前英语为主 |
| **Tool Calling 能力** | ❌ **无原生工具调用支持** | ✅ **完整支持** (`run_command`、系统操作) | ✅ Step-Audio 2 mini 支持多模态 Tool | ❌ **无**（未接触文本，无 JSON 概念） |
| **全双工打断能力** | 原生声学打断（模型层自发停止生成） | 依靠 CampPlus 声纹提取过滤扬声器回音 | 依赖 VAD + 状态机 | 原生声学打断与 Backchanneling |
| **源码/权重可用性** | ✅ **完全开源** (CC-BY 4.0，MLX 权重就绪) | ✅ **自有工程** (`TestRuntimes/miko`) | ✅ 开源 (需 CUDA 集群或走 3090 隧道) | ❌ **Waitlist 排队中** (无公网代码/权重) |

---

## 3. 重点方案深入分析

### 3.1 Kyutai Moshi (MLX 4-bit) 实测剖析

在 `mac-work` 上通过 `moshi-mlx` 与 `rustymimi` 直接调用 Metal 后端进行压测：
1. **性能与延迟表现出众**：
   - 在 14 核 M4 Pro 上，4-bit 量化权重在 Metal 上实现了 **31.75 ms/step** 的生成速度；加上 Mimi 神经编解码（编 18.9ms + 解 18.4ms），单帧 80ms 音频的总吞吐时间为 **69.08 ms**，P95 为 **73.71 ms**。
   - **RTF 为 0.864**，意味着在端侧纯依靠统一内存与 GPU，完全跑赢了实时音频流（每输入 1 秒音频，处理时间约 0.86 秒）。
   - **首音反馈时间（TTFA）仅 213.3 ms**，展现了端到端纯音频模型在拟人对话中极具爆发力的反应速度。
2. **桌面助手的致命缺陷**：
   - **中文声学理解与发音严重欠缺**：Moshi 的语料以欧美多语种对话为主，输入中文语音时，模型倾向于用带有浓重口音的近音或直接切回英文答复（实测输入主人中文语音，模型输出英文回复："Hi, what's going on? As a young girl, I am passionate about helping others..."）。
   - **无法执行结构化动作**：Moshi 预测的是 8 轨声学离散 Token + 文本 Token，没有经过严格的 Tool Calling 对齐训练，无法稳定输出精准的 JSON 命令行或解析本地文件。

### 3.2 Step-Audio / StepAudio2 剖析

1. **大模型端侧算力门槛过高**：
   - `Step-Audio-Chat` 达到 130B 参数，哪怕 4-bit 量化也需至少 70GB+ 显存，且官方深度绑定了定制 CUDA ALiBi 算子和 vLLM 分布式张量并行，无法在单台消费级 Mac 上直接离线运行。
   - `Step-Audio2-mini` 采用 Thinker + Generator 的双阶段音频架构，同样深度依赖 Linux vLLM-Omni。
2. **端侧轻量模块 (Step-Audio-EditX / TTS-3B)**：
   - 支持在 Apple Silicon（MPS / MLX）上运行 8-bit 量化版本，但在功能上仅为**语音克隆与表现力 TTS**，不具备双工实时对话的“大脑”属性。
3. **已验证路径（3090 远端混合架构）**：
   - 团队此前在 RTX 3090 上验证了 `Realtime-Venus-Audio`（9B BF16 + StepAudio2/TTS 声码器），通过 Cloudflare Tunnel 输出标准全双工 WebSocket 服务。这证明 Step 系列目前最合理的定位是**高品质云端/私有 GPU 服务端**，而非 Mac 本地端侧常驻进程。

### 3.3 Block Dessa 剖析与定性

1. **颠覆性技术亮点**：
   - **纯音频预训练（Speech-Only）**：跳过了文本 Tokenizer 和海量网页文字预训练，直接让模型从人与人真实交流的原始音频中学习语气、换气、停顿、笑声与拟人反馈。
   - **极低感知时延**：消除了“转写-文本生成-朗读”的三级串联状态机，实现了人脑交流级别的毫秒反馈。
2. **桌面助手的现实矛盾**：
   - **无法理解系统事实与复杂上下文**：桌面助理面对的是代码、长篇文档、系统日志和精细 UI，纯音频模型缺乏符号逻辑与严谨事实检索能力。
   - **无工具调用接口**：无法发起系统快捷键、截图 OCR、写剪贴板或跑本地 Shell。
   - **不可获取**：截至 2026 年 10 月下旬，Dessa 处于闭门测试状态，暂无可用包。

---

## 4. 落地结论：双脑分层融合架构 (Dual-Brain Architecture)

结合 Dessa 的前瞻理念与 Moshi / Miko 的实机数据，Tuff Assistant 不应简单地在“传统级联”或“端到端音频模型”之间做非此即彼的选择，而应采用**“声学外脑 + 认知内脑”双脑分工架构**：

```
                           ┌──────────────────────────────┐
                           │      Mac 硬件麦克风采集       │
                           │   (CoreAudio 48kHz 低延迟)   │
                           └──────────────┬───────────────┘
                                          │
                   ┌──────────────────────┴──────────────────────┐
                   │                                             │
                   ▼ (实时 80ms 帧流)                            ▼ (旁路缓冲 160ms)
       ┌────────────────────────┐                    ┌────────────────────────┐
       │   声学外脑 (Acoustic)   │                    │   认知内脑 (Semantic)   │
       │  [Moshi-MLX / Dessa]   │                    │  [Sherpa-ASR + Qwen3]  │
       │                        │                    │                        │
       │ • 原生全双工倾听与反馈   │                    │ • 160ms 流式转写精准文字│
       │ • 200ms 首音情绪接话   │                    │ • 结构化 Tool Calling  │
       │ • 笑声/停顿/自然打断   │                    │ • 剪贴板 / 文件 / 终端 │
       └───────────┬────────────┘                    └───────────┬────────────┘
                   │                                             │
                   │ (低延迟拟人语音输出)                           │ (执行回执/语义矫正)
                   │                                             │
                   ▼                                             ▼
        [CoreAudio 扬声器播放] ◄────────────────────── [事件注入 / 事实对齐通道]
```

### 职责边界：
1. **声学外脑（Moshi / Dessa 级流式模型）**：
   - 维持 **200ms 级的极速对话体验**，负责听觉感知、语气识别、哼鸣回应（Backchanneling）与即时声学打断。
   - 在用户口语倾诉、闲聊或简短对话时，直接由声学外脑端到端输出最自然的拟人语音。
2. **认知内脑（Miko 现有经过 8 小时稳定性验证的引擎）**：
   - 并行在后台监听高精度转写流（Sherpa-Zipformer 中文 Transducer），一旦命中指令词（如“查下剪贴板”、“帮我打开项目”、“跑下测试”），内脑立即通过 Ollama Qwen3 / Pi 启动 Tool Calling。
   - 动作执行完毕后，将结果状态编码为简短事实，经由轻量注入通道引导声学外脑进行口述汇报。

---

## 5. 后续行动建议

1. **资产保全**：
   - 将 `mac-work` 上 `/Users/tagzixian/Workspace/TestRuntimes/miko`（含 `src/barge_asr.swift`、声纹保护与 CoreAudio 调度代码）整体归档至仓库或独立组件包，保全完整的编译脚本与资产清单。
2. **Moshi 适配器原型试验**：
   - 基于本次验证成功的 `/tmp/realtime-benchmark/moshi_benchmark.py`，将 Moshi MLX 封装为一个轻量 Unix Domain Socket / WebSocket 本地服务，验证与 Tuff `VoiceDock` 渲染界面的波形对接。
3. **保持 Dessa 动态监测**：
   - 持续跟进 `block.xyz/dessa` 的开源计划与内测权限，一旦权重或 API 就绪，直接代入本架构的“声学外脑”槽位进行实测。
