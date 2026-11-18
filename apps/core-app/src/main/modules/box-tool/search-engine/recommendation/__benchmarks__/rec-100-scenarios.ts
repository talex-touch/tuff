import { createHash } from 'node:crypto'

/**
 * 100 Concrete Tuff Smart Recommendation & Dual-Layer Gemma Vector Scenarios (`#001`–`#100`).
 *
 * Architectural rationale:
 * - Layer 1 (`NativeFileArena` in `@talex-touch/tuff-native/file-index`):
 *   Compact contiguous UTF-8 slab + `HotRecord` array + `TUFFIDX3` binary snapshot.
 *   Delivers <2ms fuzzy/subsequence/CJK-heteronym search, O(1) `hasPath`, <1ms recency scan,
 *   and FSEvents `applyDelta` sync across 100K+ cold paths in ~13.5 MiB Arena RAM (~6 MiB snapshot).
 * - Layer 2 (Hot-Doc `EmbeddingGemma` 768-dim Vector Layer + `FileRecommendationBridge`):
 *   Indexes ONLY active user documents & visual media (`Documents/`, `Desktop/`, `Downloads/`,
 *   notes, PDFs, screenshots) into 768-dim `Float32` BLOB vectors (`3,072` bytes/vector, <80 MiB total),
 *   powering both query-time `semanticRecall` and zero-input CoreBox contextual file recommendations
 *   (`foregroundApp.windowTitle` / `clipboard` / `selection` -> Gemma semantic recall).
 */

export const GEMMA_EMBEDDING_DIM = 768
export const GEMMA_VECTOR_BLOB_BYTES = GEMMA_EMBEDDING_DIM * Float32Array.BYTES_PER_ELEMENT // 3,072 bytes

export type Rec100CategoryId =
  | 'cat-01'
  | 'cat-02'
  | 'cat-03'
  | 'cat-04'
  | 'cat-05'
  | 'cat-06'
  | 'cat-07'
  | 'cat-08'
  | 'cat-09'
  | 'cat-10'

export interface Rec100CategoryMeta {
  readonly id: Rec100CategoryId
  readonly index: number
  readonly titleZh: string
  readonly titleEn: string
  readonly summary: string
}

export const REC_100_CATEGORIES: readonly Rec100CategoryMeta[] = [
  {
    id: 'cat-01',
    index: 1,
    titleZh: '零输入开框主动推荐 — 前台应用上下文感知',
    titleEn: 'Zero-Input CoreBox Proactive Recommendation (Foreground App Context)',
    summary:
      '捕获开框前的前台应用身份与窗口标题，联动推荐关联生产力工具并经 Gemma 向量召回当前任务热文档；覆盖自身降权与冷启动默认入口保底。'
  },
  {
    id: 'cat-02',
    index: 2,
    titleZh: '剪贴板与划词语义触发推荐',
    titleEn: 'Clipboard & Selection Semantic Trigger Recommendations',
    summary:
      '基于 30s 新鲜度窗口与 SHA-256 隐私摘要校验，处理 URL 置顶卡片、代码语言 IDE 匹配，并将报错堆栈/合同号/接口路径/选中文本转化为热文档语义推荐。'
  },
  {
    id: 'cat-03',
    index: 3,
    titleZh: '概念与跨语种语义召回',
    titleEn: 'Conceptual & Cross-Lingual Gemma 768d Semantic Recall',
    summary:
      '用户完全不记得文件名、且查询词与文件名零字面重合时，通过同义概念、中英跨语种混搜命中正文深层段落。'
  },
  {
    id: 'cat-04',
    index: 4,
    titleZh: '口语化与模糊记忆找文件',
    titleEn: 'Colloquial & Fuzzy Memory File Retrieval',
    summary:
      '面向日常自然语言描述（如“上周改的年度预算表”、“写着 Redis 超时配置的文档”、“出差高铁报销单”）凭表头与正文 Gemma 向量精准召回。'
  },
  {
    id: 'cat-05',
    index: 5,
    titleZh: '工作流共现、习惯与时间节律推荐',
    titleEn: 'Workflow Co-occurrence, Habits & Temporal Rhythm',
    summary:
      '验证 30 天时段峰值门禁、昨日同刻日历召回、跨应用转移偏好、NativeFileArena 习惯文件重建、置顶优先及诚实 5/3 常用徽章契约。'
  },
  {
    id: 'cat-06',
    index: 6,
    titleZh: '多模态文档与视觉语义召回',
    titleEn: 'Multimodal Document Chunking & Visual Semantic Recall',
    summary:
      '多页 PDF 页码级 chunk 定位、长文档行号片段定位、Emoji UTF-16 安全裁剪，以及无文字原图/白板/二维码/HEIC 视觉 768d 同空间检索。'
  },
  {
    id: 'cat-07',
    index: 7,
    titleZh: '极速文件名、多音字拼音与乱序缩写直达',
    titleEn: 'Ultra-Fast Filename, CJK Heteronym & Subsequence Search (NativeFileArena)',
    summary:
      '由 Rust NativeFileArena 实测 <5ms 完成多音字双读音（重庆 cq/zq、银行 yh/tx）、Smith-Waterman 首字母缩写（fpnis）、后缀过滤、O(1) hasPath 与 TUFFIDX3 快照。'
  },
  {
    id: 'cat-08',
    index: 8,
    titleZh: '实时文件系统增量及时性与幽灵清理',
    titleEn: 'Real-Time Filesystem Freshness, Delta Sync & Zero Ghost Cleanup',
    summary:
      '验证刚下载 3 秒的新文件直达推荐、未完成下载拦截、FSEvents applyDelta 秒级增删改、物理删除零幽灵卡片、符号链接拦截与项目目录噪音隔离。'
  },
  {
    id: 'cat-09',
    index: 9,
    titleZh: '混合检索融合排序与探索多样性控制',
    titleEn: 'Hybrid Retrieval Sorter Ladder, Novelty Handoff & Diversity Control',
    summary:
      '验证主文件名精确匹配 > Gemma 语义高分 > 弱后缀匹配的同量纲排序阶梯、双门禁新装应用交棒、EXPLORATION_LIMIT=1 防刷屏与 40% 同类多样性配额回填。'
  },
  {
    id: 'cat-10',
    index: 10,
    titleZh: '资源受限、冷热分层预算与隐私安全边界',
    titleEn: 'Resource Constraints, Cold/Hot Footprint Budget & Privacy/Security Guardrails',
    summary:
      '覆盖低电量/离线/勿扰系统状态调权、10 万文件冷热双层 <80 MiB 存储实证、Float32 向量编解码校验、sk-xxx/.env/id_rsa 敏感密钥零外泄与 AI 限额/超时熔断降级。'
  }
]

// ---------------------------------------------------------------------------
// Deterministic 768-dim Unit-Norm Gemma Semantic Concept Space
// ---------------------------------------------------------------------------

export type GemmaConceptId =
  | 'finance-q3-forecast'
  | 'gateway-rate-limit-backoff'
  | 'vector-indexing-arch'
  | 'corebox-dark-tokens'
  | 'k8s-oom-runbook'
  | 'sqlite-wal-busy'
  | 'cloud-billing-invoice'
  | 'sprint-retro'
  | 'lease-general'
  | 'lease-pet-policy'
  | 'webhook-signature'
  | 'travel-reimbursement'
  | 'v8-memory-leak'
  | 'stream-backpressure'
  | 'oauth-token-rotation'
  | 'health-lipid-diet'
  | 'force-majeure-msa'
  | 'corebox-overlay-flicker'
  | 'ebitda-margin-q3'
  | 'smith-waterman-fzf'
  | 'acme-cert-renewal'
  | 'dept-budget-capex'
  | 'redis-timeout-pool'
  | 'q4-promo-ppt'
  | 'home-router-vlan'
  | 'csv-export-freeze'
  | 'onboarding-mac-setup'
  | 'napi-vs-cpp-addon'
  | 'macos-notarization-1008'
  | 'double11-telemetry-schema'
  | 'visual-pet-cat'
  | 'visual-whiteboard-arch'
  | 'visual-wechat-pay-qr'
  | 'visual-notarize-error-modal'
  | 'visual-sunset-beach-heic'
  | 'visual-pnpm-peer-dep'
  | 'emoji-surrogate-note'

interface ConceptAxisRule {
  readonly id: GemmaConceptId
  readonly slot: number
  readonly patterns: readonly RegExp[]
}

const CONCEPT_AXIS_RULES: readonly ConceptAxisRule[] = [
  {
    id: 'finance-q3-forecast',
    slot: 0,
    patterns: [/财务预测|营收测算|financial[- ]forecast|revenue projection|毛利测算/i]
  },
  {
    id: 'gateway-rate-limit-backoff',
    slot: 1,
    patterns: [/网关限流|熔断技术评审|rate[- ]limit|exponential backoff|jitter retry|令牌桶/i]
  },
  {
    id: 'vector-indexing-arch',
    slot: 2,
    patterns: [/embedding-service|向量索引架构|vector[- ]indexing|768维向量落库|gemma dual-layer/i]
  },
  {
    id: 'corebox-dark-tokens',
    slot: 3,
    patterns: [/corebox redesign|dark tokens|暗色设计变量|毛玻璃圆角色板|design[- ]tokens/i]
  },
  {
    id: 'k8s-oom-runbook',
    slot: 4,
    patterns: [/payment-oom-crash|kubectl logs|oomkilled|容器内存溢出排障|pod oom/i]
  },
  {
    id: 'sqlite-wal-busy',
    slot: 5,
    patterns: [
      /sqlite_busy|database is locked|wal mode concurrency|walcheckpoint|reconnect transaction/i
    ]
  },
  {
    id: 'cloud-billing-invoice',
    slot: 6,
    patterns: [/aws cloud billing|invoice october|云服务账单核对|ec2 s3 月度费用明细/i]
  },
  {
    id: 'sprint-retro',
    slot: 7,
    patterns: [/sprint 24 retro|action items|迭代复盘纪要|双周敏捷回顾/i]
  },
  {
    id: 'lease-general',
    slot: 8,
    patterns: [/房屋租赁押金|物业交割|ht-2026-0892|承租方水电燃气结算/i]
  },
  {
    id: 'lease-pet-policy',
    slot: 9,
    patterns: [/pet policy|宠物饲养|宠物猫|宠物专项押金|pet deposit clause/i]
  },
  {
    id: 'webhook-signature',
    slot: 10,
    patterns: [/stripe-signature-verify|webhooks|hmac-sha256 验签|回调签名契约/i]
  },
  {
    id: 'travel-reimbursement',
    slot: 11,
    patterns: [/g1024|电子客票|高铁.*报销|差旅住宿补贴|hangzhou.*expense|出差.*酒店报销/i]
  },
  {
    id: 'v8-memory-leak',
    slot: 12,
    patterns: [/内存泄漏排查|heap[- ]snapshot|retainer tree|闭包引用驻留/i]
  },
  {
    id: 'stream-backpressure',
    slot: 13,
    patterns: [/防抖节流|背压机制|aimd batch|backpressure|在途批次流控/i]
  },
  {
    id: 'oauth-token-rotation',
    slot: 14,
    patterns: [/oauth2|refresh token|轮换失效|令牌重放检测|session rotation/i]
  },
  {
    id: 'health-lipid-diet',
    slot: 15,
    patterns: [/血脂偏高|饮食建议|甘油三酯|低密度脂蛋白|triglyceride cholesterol/i]
  },
  {
    id: 'force-majeure-msa',
    slot: 16,
    patterns: [/不可抗力|免责与解约赔偿|force majeure|违约金上限条款/i]
  },
  {
    id: 'corebox-overlay-flicker',
    slot: 17,
    patterns: [/白屏闪烁|窗口高度抖动|panelstate|overlay resize|grow-to-fit/i]
  },
  {
    id: 'ebitda-margin-q3',
    slot: 18,
    patterns: [/ebitda margin|q3 yoy|经营性现金流同比|三季度经营利润率/i]
  },
  {
    id: 'smith-waterman-fzf',
    slot: 19,
    patterns: [/无需全文分词|模糊子序列打分|smith-waterman|fzf 边界奖励矩阵/i]
  },
  {
    id: 'acme-cert-renewal',
    slot: 20,
    patterns: [/证书快过期|自动续签|letsencrypt|acme dns-01|tls 证书轮转/i]
  },
  {
    id: 'dept-budget-capex',
    slot: 21,
    patterns: [/年度部门预算表|hc 编制与服务器采购预算|capex opex 明细/i]
  },
  {
    id: 'redis-timeout-pool',
    slot: 22,
    patterns: [/redis.*超时配置|连接池超时|maxretriesperrequest|connecttimeout 3000ms/i]
  },
  {
    id: 'q4-promo-ppt',
    slot: 23,
    patterns: [/晋升答辩|架构演进 ppt|staff promotion deck|技术影响力述职/i]
  },
  {
    id: 'home-router-vlan',
    slot: 24,
    patterns: [/光猫桥接|vlan 设置|pppoe 拨号|软路由组网备忘/i]
  },
  {
    id: 'csv-export-freeze',
    slot: 25,
    patterns: [/导出大表格卡死|csv 导出阻塞主线程|流式分块下载复盘/i]
  },
  {
    id: 'onboarding-mac-setup',
    slot: 26,
    patterns: [/新员工入职|开发环境搭建清单|homebrew pnpm git ssh 配置指南/i]
  },
  {
    id: 'napi-vs-cpp-addon',
    slot: 27,
    patterns: [/rust n-api|c\+\+ node addon|napi-rs 与 node-gyp 对比选型/i]
  },
  {
    id: 'macos-notarization-1008',
    slot: 28,
    patterns: [/公证签名报错 1008|notarytool|hardened runtime timestamp/i]
  },
  {
    id: 'double11-telemetry-schema',
    slot: 29,
    patterns: [/双十一大促埋点|曝光点击转化字段表|promo campaign telemetry/i]
  },
  {
    id: 'visual-pet-cat',
    slot: 30,
    patterns: [/一只猫|a pet cat|orange tabby cat|橘猫趴在沙发/i]
  },
  {
    id: 'visual-whiteboard-arch',
    slot: 31,
    patterns: [/白板微服务架构草图|whiteboard microservice sketch|手绘网关消息队列拓扑/i]
  },
  {
    id: 'visual-wechat-pay-qr',
    slot: 32,
    patterns: [/微信商户付款二维码|wechat pay merchant qr|绿底收款码图片/i]
  },
  {
    id: 'visual-notarize-error-modal',
    slot: 33,
    patterns: [/公证失败红色报错弹窗|apple could not verify alert dialog|损坏无法打开提示截图/i]
  },
  {
    id: 'visual-sunset-beach-heic',
    slot: 34,
    patterns: [/海边落日风景照|golden sunset over ocean beach|晚霞海浪礁石摄影/i]
  },
  {
    id: 'visual-pnpm-peer-dep',
    slot: 35,
    patterns: [/err_pnpm_peer_dep_issues|unmet peer dependency terminal screenshot/i]
  },
  {
    id: 'emoji-surrogate-note',
    slot: 36,
    patterns: [/发布庆功表情包段落|surrogate emoji safety check|火箭笑脸混合里程碑/i]
  }
]

const CONCEPT_SLOT_BY_ID = new Map<GemmaConceptId, number>(
  CONCEPT_AXIS_RULES.map((rule) => [rule.id, rule.slot])
)

/**
 * Generates a deterministic unit-norm 768-dimensional `Float32Array` vector in the simulated
 * `EmbeddingGemma` space.
 *
 * - Orthogonal 16-dim concept subspaces (`slots 0..39` -> dims `0..639`) give realistic high cosine
 *   similarity (`0.82–0.95`) across bilingual/conceptual paraphrases and multimodal image-text pairs.
 * - Hashed character trigram residual (`dims 640..767`) ensures distinct texts produce unique
 *   vectors while keeping unrelated pairs well below the `0.42` recall threshold (`< 0.16`).
 */
export function embedDeterministicGemma768(
  text: string,
  explicitConcepts: ReadonlyArray<{ id: GemmaConceptId; weight?: number }> = []
): Float32Array {
  const vec = new Float32Array(GEMMA_EMBEDDING_DIM)
  const normalized = text.trim().toLowerCase()

  const activeSlots = new Map<number, number>()
  for (const explicit of explicitConcepts) {
    const slot = CONCEPT_SLOT_BY_ID.get(explicit.id)
    if (slot !== undefined) {
      activeSlots.set(slot, Math.max(activeSlots.get(slot) ?? 0, explicit.weight ?? 1.0))
    }
  }

  for (const rule of CONCEPT_AXIS_RULES) {
    if (rule.patterns.some((re) => re.test(normalized))) {
      activeSlots.set(rule.slot, Math.max(activeSlots.get(rule.slot) ?? 0, 1.0))
    }
  }

  const conceptVec = new Float32Array(GEMMA_EMBEDDING_DIM)
  let conceptNormSq = 0
  for (const [slot, weight] of activeSlots.entries()) {
    const base = slot * 16
    for (let offset = 0; offset < 16; offset += 1) {
      const harmonic = Math.cos((slot + 1) * 0.73 + (offset + 1) * 0.41)
      const sign = offset % 2 === 0 ? 1 : -1
      const v = weight * (0.65 + 0.35 * Math.abs(harmonic)) * sign
      conceptVec[base + offset] += v
    }
  }
  for (let i = 0; i < GEMMA_EMBEDDING_DIM; i += 1) {
    conceptNormSq += conceptVec[i]! * conceptVec[i]!
  }

  // Dense length-invariant residual across all 768 dims (realistic dense float32 components)
  const residualVec = new Float32Array(GEMMA_EMBEDDING_DIM)
  const fullHash = createHash('sha256')
    .update(normalized || 'empty')
    .digest()
  const phaseSeed = (fullHash[0]! * 256 + fullHash[1]!) * 0.013 + 0.17
  for (let i = 0; i < GEMMA_EMBEDDING_DIM; i += 1) {
    const byteVal = fullHash[i % fullHash.length]!
    residualVec[i] = Math.sin((i + 1) * phaseSeed + byteVal * 0.09) * 0.5
  }
  const digestSource = (normalized || 'empty').slice(0, 128)
  for (let i = 0; i < digestSource.length; i += 1) {
    const gram = digestSource.slice(i, Math.min(digestSource.length, i + 3))
    const hash = createHash('sha256').update(gram).digest()
    const dimA = 640 + (hash[0]! % 128)
    const dimB = 640 + (hash[1]! % 128)
    residualVec[dimA] += hash[2]! / 127.5 - 1
    residualVec[dimB] += hash[3]! / 127.5 - 1
  }
  let resNormSq = 0
  for (let i = 0; i < GEMMA_EMBEDDING_DIM; i += 1) {
    resNormSq += residualVec[i]! * residualVec[i]!
  }
  const resInv = resNormSq > 0 ? 1 / Math.sqrt(resNormSq) : 1

  if (conceptNormSq > 0) {
    const conceptInv = 1 / Math.sqrt(conceptNormSq)
    for (let i = 0; i < GEMMA_EMBEDDING_DIM; i += 1) {
      vec[i] = 0.94 * conceptVec[i]! * conceptInv + 0.34 * residualVec[i]! * resInv
    }
  } else {
    for (let i = 0; i < GEMMA_EMBEDDING_DIM; i += 1) {
      vec[i] = residualVec[i]! * resInv
    }
  }

  let normSq = 0
  for (let i = 0; i < GEMMA_EMBEDDING_DIM; i += 1) {
    normSq += vec[i]! * vec[i]!
  }
  const invNorm = normSq > 0 ? 1 / Math.sqrt(normSq) : 1
  for (let i = 0; i < GEMMA_EMBEDDING_DIM; i += 1) {
    vec[i] = vec[i]! * invNorm
  }
  return vec
}

export function cosineSimilarity768(left: ArrayLike<number>, right: ArrayLike<number>): number {
  const len = Math.min(left.length, right.length)
  if (len === 0) return 0
  let dot = 0
  let leftNorm = 0
  let rightNorm = 0
  for (let i = 0; i < len; i += 1) {
    const l = left[i]!
    const r = right[i]!
    dot += l * r
    leftNorm += l * l
    rightNorm += r * r
  }
  if (leftNorm <= 0 || rightNorm <= 0) return 0
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
}

// ---------------------------------------------------------------------------
// Corpus Fixtures (Apps + Hot Docs + Multimodal + Cold Arena Files)
// ---------------------------------------------------------------------------

export interface Rec100AppFixture {
  readonly id: number
  readonly name: string
  readonly bundleId: string
  readonly path: string
  readonly indexedAgoMs: number
  readonly installedAgoMs: number
}

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export const REC_100_APPS: readonly Rec100AppFixture[] = [
  {
    id: 101,
    name: 'Visual Studio Code',
    bundleId: 'com.microsoft.VSCode',
    path: '/Applications/Visual Studio Code.app',
    indexedAgoMs: 90 * DAY_MS,
    installedAgoMs: 180 * DAY_MS
  },
  {
    id: 102,
    name: 'WebStorm',
    bundleId: 'com.jetbrains.WebStorm',
    path: '/Applications/WebStorm.app',
    indexedAgoMs: 90 * DAY_MS,
    installedAgoMs: 160 * DAY_MS
  },
  {
    id: 103,
    name: 'PyCharm',
    bundleId: 'com.jetbrains.pycharm',
    path: '/Applications/PyCharm.app',
    indexedAgoMs: 90 * DAY_MS,
    installedAgoMs: 150 * DAY_MS
  },
  {
    id: 104,
    name: 'iTerm2',
    bundleId: 'com.googlecode.iterm2',
    path: '/Applications/iTerm.app',
    indexedAgoMs: 90 * DAY_MS,
    installedAgoMs: 200 * DAY_MS
  },
  {
    id: 105,
    name: 'Google Chrome',
    bundleId: 'com.google.Chrome',
    path: '/Applications/Google Chrome.app',
    indexedAgoMs: 120 * DAY_MS,
    installedAgoMs: 240 * DAY_MS
  },
  {
    id: 106,
    name: 'Figma',
    bundleId: 'com.figma.Desktop',
    path: '/Applications/Figma.app',
    indexedAgoMs: 80 * DAY_MS,
    installedAgoMs: 140 * DAY_MS
  },
  {
    id: 107,
    name: 'Preview',
    bundleId: 'com.apple.Preview',
    path: '/System/Applications/Preview.app',
    indexedAgoMs: 120 * DAY_MS,
    installedAgoMs: 365 * DAY_MS
  },
  {
    id: 108,
    name: 'WeChat',
    bundleId: 'com.tencent.xinWeChat',
    path: '/Applications/WeChat.app',
    indexedAgoMs: 100 * DAY_MS,
    installedAgoMs: 300 * DAY_MS
  },
  {
    id: 109,
    name: 'Feishu',
    bundleId: 'com.electron.lark',
    path: '/Applications/Lark.app',
    indexedAgoMs: 100 * DAY_MS,
    installedAgoMs: 220 * DAY_MS
  },
  {
    id: 110,
    name: 'Sublime Text',
    bundleId: 'com.sublimetext.4',
    path: '/Applications/Sublime Text.app',
    indexedAgoMs: 100 * DAY_MS,
    installedAgoMs: 210 * DAY_MS
  },
  {
    id: 111,
    name: 'Apifox',
    bundleId: 'cn.apifox.app',
    path: '/Applications/Apifox.app',
    indexedAgoMs: 60 * DAY_MS,
    installedAgoMs: 120 * DAY_MS
  },
  {
    id: 112,
    name: 'Spotify',
    bundleId: 'com.spotify.client',
    path: '/Applications/Spotify.app',
    indexedAgoMs: 90 * DAY_MS,
    installedAgoMs: 260 * DAY_MS
  },
  {
    id: 113,
    name: 'Finder',
    bundleId: 'com.apple.finder',
    path: '/System/Library/CoreServices/Finder.app',
    indexedAgoMs: 120 * DAY_MS,
    installedAgoMs: 365 * DAY_MS
  },
  {
    id: 114,
    name: 'Zoom',
    bundleId: 'us.zoom.xos',
    path: '/Applications/zoom.us.app',
    indexedAgoMs: 85 * DAY_MS,
    installedAgoMs: 190 * DAY_MS
  },
  {
    id: 115,
    name: 'Mail',
    bundleId: 'com.apple.mail',
    path: '/System/Applications/Mail.app',
    indexedAgoMs: 120 * DAY_MS,
    installedAgoMs: 365 * DAY_MS
  }
]

export interface Rec100ChunkFixture {
  readonly text: string
  readonly pageNumber?: number
  readonly startLine?: number
  readonly endLine?: number
  readonly concepts: ReadonlyArray<{ id: GemmaConceptId; weight?: number }>
}

export interface Rec100DocFixture {
  readonly id: number
  /** Relative POSIX path inside the isolated workspace root */
  readonly relPath: string
  readonly modality: 'document' | 'image' | 'cold-arena-only'
  /** Whether the file has a row in SQLite `files` (false = lives ONLY in NativeFileArena) */
  readonly inSqlite: boolean
  readonly sizeBytes: number
  readonly createdAgoMs: number
  readonly modifiedAgoMs: number
  readonly chunks?: readonly Rec100ChunkFixture[]
  readonly concepts?: ReadonlyArray<{ id: GemmaConceptId; weight?: number }>
  readonly diskText?: string
}

export const REC_100_CORPUS_FILES: readonly Rec100DocFixture[] = [
  {
    id: 201,
    relPath: 'Documents/finance/2026-Q3-financial-forecast.xlsx',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 48_200,
    createdAgoMs: 14 * DAY_MS,
    modifiedAgoMs: 2 * DAY_MS,
    concepts: [{ id: 'finance-q3-forecast', weight: 1.0 }],
    diskText: '2026 Q3 季度财务预测模型：营收测算、毛利测算与现金流滚动预测'
  },
  {
    id: 202,
    relPath: 'Documents/architecture/api-gateway-rate-limit-rfc.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 12_400,
    createdAgoMs: 20 * DAY_MS,
    modifiedAgoMs: 3 * DAY_MS,
    concepts: [{ id: 'gateway-rate-limit-backoff', weight: 1.0 }],
    diskText:
      '# API 网关限流与熔断技术评审\n采用令牌桶限流与 exponential backoff with jitter retry 重试退避策略。'
  },
  {
    id: 203,
    relPath: 'Documents/specs/vector-indexing-architecture.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 18_900,
    createdAgoMs: 10 * DAY_MS,
    modifiedAgoMs: 1 * DAY_MS,
    concepts: [{ id: 'vector-indexing-arch', weight: 1.0 }],
    diskText: '# EmbeddingService 768维向量落库与冷热双层检索架构规范'
  },
  {
    id: 204,
    relPath: 'Desktop/design/corebox-dark-theme-tokens.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 9_600,
    createdAgoMs: 8 * DAY_MS,
    modifiedAgoMs: 12 * HOUR_MS,
    concepts: [{ id: 'corebox-dark-tokens', weight: 1.0 }],
    diskText: '# CoreBox Redesign v3 Dark Tokens\n暗色设计变量、毛玻璃圆角色板与切图间距定义。'
  },
  {
    id: 205,
    relPath: 'Documents/runbooks/k8s-pod-oom-troubleshooting.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 15_200,
    createdAgoMs: 30 * DAY_MS,
    modifiedAgoMs: 4 * DAY_MS,
    concepts: [{ id: 'k8s-oom-runbook', weight: 1.0 }],
    diskText:
      '# Kubernetes Pod OOMKilled 容器内存溢出排障手册\nkubectl logs 分析 payment-oom-crash 堆栈。'
  },
  {
    id: 206,
    relPath: 'Documents/notes/sqlite-wal-busy-tuning.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 14_300,
    createdAgoMs: 16 * DAY_MS,
    modifiedAgoMs: 1 * DAY_MS,
    chunks: [
      {
        text: '# SQLite 连接池初始化说明\n默认启用 WAL 日志模式与 foreign_keys 约束。',
        startLine: 1,
        endLine: 18,
        concepts: []
      },
      {
        text: '## SQLITE_BUSY 忙锁恢复契约\n当捕获到 SqliteError: SQLITE_BUSY: database is locked 时，必须在重试事务前执行 reconnect transaction 释放未 finalize 的原生句柄。',
        startLine: 42,
        endLine: 68,
        concepts: [{ id: 'sqlite-wal-busy', weight: 1.0 }]
      }
    ],
    diskText:
      '# SQLite 连接池初始化说明\n\n## SQLITE_BUSY 忙锁恢复契约\n当捕获到 SqliteError: SQLITE_BUSY: database is locked 时执行 reconnect transaction。'
  },
  {
    id: 207,
    relPath: 'Downloads/cloud-hosting-october-statement.pdf',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 128_000,
    createdAgoMs: 5 * DAY_MS,
    modifiedAgoMs: 5 * DAY_MS,
    concepts: [{ id: 'cloud-billing-invoice', weight: 1.0 }],
    diskText: 'AWS Cloud Billing October Invoice Statement: EC2 S3 月度费用明细核对单'
  },
  {
    id: 208,
    relPath: 'Documents/meetings/sprint-retro-notes.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 7_800,
    createdAgoMs: 12 * DAY_MS,
    modifiedAgoMs: 2 * DAY_MS,
    concepts: [{ id: 'sprint-retro', weight: 1.0 }],
    diskText: '# Sprint 24 Retro & Action Items\n双周敏捷回顾与迭代复盘纪要。'
  },
  {
    id: 209,
    relPath: 'Documents/contracts/2026-房屋租赁合同.pdf',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 512_000,
    createdAgoMs: 45 * DAY_MS,
    modifiedAgoMs: 45 * DAY_MS,
    chunks: [
      {
        pageNumber: 1,
        text: '合同编号 HT-2026-0892 第一条 房屋坐落、租赁期限与房屋租赁押金及物业交割清单。',
        concepts: [{ id: 'lease-general', weight: 1.0 }]
      },
      {
        pageNumber: 2,
        text: '第五条 租金支付方式与承租方水电燃气结算标准。',
        concepts: []
      },
      {
        pageNumber: 3,
        text: '第九条 房屋日常维修责任划分与消防安全义务。',
        concepts: []
      },
      {
        pageNumber: 4,
        text: '第十四条 宠物饲养补充约定：甲方同意乙方在承租期内饲养室内小型宠物猫壹只，乙方须另行缴纳宠物专项押金贰仟元整（¥2,000），退租无损坏全额退还。',
        concepts: [{ id: 'lease-pet-policy', weight: 1.0 }]
      }
    ],
    diskText: '合同编号 HT-2026-0892 房屋租赁合同（共4页，含第4页宠物饲养押金条款）'
  },
  {
    id: 210,
    relPath: 'Documents/specs/webhook-signature-openapi.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 11_100,
    createdAgoMs: 18 * DAY_MS,
    modifiedAgoMs: 6 * DAY_MS,
    concepts: [{ id: 'webhook-signature', weight: 1.0 }],
    diskText:
      '# POST /api/v2/webhooks/stripe-signature-verify\nHMAC-SHA256 回调签名契约与重放时间戳校验。'
  },
  {
    id: 211,
    relPath: 'Downloads/2026-travel-reimbursement-sheet.xlsx',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 64_500,
    createdAgoMs: 9 * DAY_MS,
    modifiedAgoMs: 1 * DAY_MS,
    concepts: [{ id: 'travel-reimbursement', weight: 1.0 }],
    diskText: '2026 差旅报销汇总单：高铁二等座电子客票、杭州出差酒店住宿发票明细'
  },
  {
    id: 212,
    relPath: 'Documents/notes/v8-heap-snapshot-retention-guide.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 16_400,
    createdAgoMs: 25 * DAY_MS,
    modifiedAgoMs: 7 * DAY_MS,
    concepts: [{ id: 'v8-memory-leak', weight: 1.0 }],
    diskText:
      '# V8 Heap Snapshot Retainer Tree 分析指南\n定位闭包引用驻留与事件监听器未卸载导致的内存泄漏。'
  },
  {
    id: 213,
    relPath: 'Documents/specs/indexing-stream-backpressure.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 13_700,
    createdAgoMs: 22 * DAY_MS,
    modifiedAgoMs: 5 * DAY_MS,
    concepts: [{ id: 'stream-backpressure', weight: 1.0 }],
    diskText:
      '# AIMD Batch Flow-Control\n通过 batchAckWaiters 实现在途批次流控、防抖节流与背压机制。'
  },
  {
    id: 214,
    relPath: 'Documents/security/session-rotation-playbook.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 10_800,
    createdAgoMs: 28 * DAY_MS,
    modifiedAgoMs: 8 * DAY_MS,
    concepts: [{ id: 'oauth-token-rotation', weight: 1.0 }],
    diskText: '# Session Rotation Playbook\nOAuth2 Refresh Token 轮换失效与令牌重放检测应急预案。'
  },
  {
    id: 215,
    relPath: 'Documents/personal/annual-health-checkup-2026.pdf',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 340_000,
    createdAgoMs: 40 * DAY_MS,
    modifiedAgoMs: 40 * DAY_MS,
    concepts: [{ id: 'health-lipid-diet', weight: 1.0 }],
    diskText: '年度体检报告医嘱：甘油三酯及低密度脂蛋白轻度升高，建议低脂高纤维饮食与有氧运动。'
  },
  {
    id: 216,
    relPath: 'Documents/contracts/vendor-msa-master-agreement.pdf',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 420_000,
    createdAgoMs: 50 * DAY_MS,
    modifiedAgoMs: 50 * DAY_MS,
    concepts: [{ id: 'force-majeure-msa', weight: 1.0 }],
    diskText: '主服务协议第十二章：Force Majeure 不可抗力免责范围、通知义务与解约赔偿上限条款。'
  },
  {
    id: 217,
    relPath: 'Documents/specs/corebox-overlay-resize-notes.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 9_900,
    createdAgoMs: 15 * DAY_MS,
    modifiedAgoMs: 3 * DAY_MS,
    concepts: [{ id: 'corebox-overlay-flicker', weight: 1.0 }],
    diskText:
      '# CoreBox MetaOverlay 窗口高度收缩协议\n使用 panelState 消除关闭瞬间白屏闪烁与窗口高度抖动。'
  },
  {
    id: 218,
    relPath: 'Documents/finance/三季度经营分析纪要.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 14_100,
    createdAgoMs: 11 * DAY_MS,
    modifiedAgoMs: 2 * DAY_MS,
    concepts: [{ id: 'ebitda-margin-q3', weight: 1.0 }],
    diskText:
      '# 三季度经营分析纪要\n核心业务三季度经营利润率（EBITDA Margin Q3 YoY）同比提升 4.2 个百分点。'
  },
  {
    id: 219,
    relPath: 'Documents/specs/smith-waterman-fuzzy-scorer.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 12_900,
    createdAgoMs: 7 * DAY_MS,
    modifiedAgoMs: 1 * DAY_MS,
    concepts: [{ id: 'smith-waterman-fzf', weight: 1.0 }],
    diskText:
      '# 零分配字节切片 Smith-Waterman 打分器\n无需全文分词的模糊子序列打分与驼峰分隔符边界奖励矩阵。'
  },
  {
    id: 220,
    relPath: 'Documents/runbooks/acme-letsencrypt-renewal.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 8_400,
    createdAgoMs: 35 * DAY_MS,
    modifiedAgoMs: 10 * DAY_MS,
    concepts: [{ id: 'acme-cert-renewal', weight: 1.0 }],
    diskText:
      '# ACME DNS-01 TLS 证书轮转手册\n解决生产域名 HTTPS 证书快过期自动续签与 Nginx 热重载。'
  },
  {
    id: 221,
    relPath: 'Documents/finance/dept-hc-capex-plan-2026.xlsx',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 76_000,
    createdAgoMs: 13 * DAY_MS,
    modifiedAgoMs: 6 * DAY_MS,
    concepts: [{ id: 'dept-budget-capex', weight: 1.0 }],
    diskText: '2026 年度部门预算表：研发 HC 编制与服务器采购预算（CAPEX / OPEX 明细）'
  },
  {
    id: 222,
    relPath: 'Documents/runbooks/cache-cluster-tuning.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 11_600,
    createdAgoMs: 19 * DAY_MS,
    modifiedAgoMs: 4 * DAY_MS,
    concepts: [{ id: 'redis-timeout-pool', weight: 1.0 }],
    diskText:
      '# Redis 集群客户端调优\nioredis 连接池超时参数 connectTimeout 3000ms 与 maxRetriesPerRequest 配置。'
  },
  {
    id: 223,
    relPath: 'Desktop/q4-staff-promo-deck-draft.pptx',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 2_450_000,
    createdAgoMs: 6 * DAY_MS,
    modifiedAgoMs: 1 * DAY_MS,
    concepts: [{ id: 'q4-promo-ppt', weight: 1.0 }],
    diskText: 'Staff Engineer 晋升答辩初稿：端侧检索与智能推荐架构演进 PPT 技术影响力述职'
  },
  {
    id: 224,
    relPath: 'Downloads/hangzhou-summit-expense-claim.pdf',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 195_000,
    createdAgoMs: 8 * DAY_MS,
    modifiedAgoMs: 8 * DAY_MS,
    concepts: [{ id: 'travel-reimbursement', weight: 0.95 }],
    diskText: '杭州云栖技术峰会出差高铁票与西湖区酒店住宿报销单（Hangzhou Expense Claim）'
  },
  {
    id: 225,
    relPath: 'Documents/personal/home-router-pppoe-setup.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 6_200,
    createdAgoMs: 60 * DAY_MS,
    modifiedAgoMs: 30 * DAY_MS,
    concepts: [{ id: 'home-router-vlan', weight: 1.0 }],
    diskText: '# 家庭弱电箱软路由组网备忘\n电信光猫桥接改 PPPoE 拨号及 IPTV 单线复用 VLAN 设置。'
  },
  {
    id: 226,
    relPath: 'Documents/meetings/postmortem-csv-export-freeze.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 10_500,
    createdAgoMs: 17 * DAY_MS,
    modifiedAgoMs: 9 * DAY_MS,
    concepts: [{ id: 'csv-export-freeze', weight: 1.0 }],
    diskText:
      '# 线上事故复盘：十万行 CSV 导出阻塞主线程\n改用 Web Worker 流式分块下载消除页面卡死。'
  },
  {
    id: 227,
    relPath: 'Documents/team/onboarding-macbook-setup.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 9_100,
    createdAgoMs: 42 * DAY_MS,
    modifiedAgoMs: 15 * DAY_MS,
    concepts: [{ id: 'onboarding-mac-setup', weight: 1.0 }],
    diskText:
      '# 新员工入职第一周开发环境搭建清单\nHomebrew、Node、pnpm、Rust 工具链与 Git SSH 配置指南。'
  },
  {
    id: 228,
    relPath: 'Documents/architecture/native-binding-tradeoffs.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 14_800,
    createdAgoMs: 27 * DAY_MS,
    modifiedAgoMs: 11 * DAY_MS,
    concepts: [{ id: 'napi-vs-cpp-addon', weight: 1.0 }],
    diskText:
      '# 原生扩展架构评估：napi-rs 与 node-gyp 对比选型\n对比 Rust N-API 内存安全、跨平台预编译与 C++ Node Addon 维护成本。'
  },
  {
    id: 229,
    relPath: 'Documents/runbooks/macos-notarization-troubleshooting.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 11_900,
    createdAgoMs: 21 * DAY_MS,
    modifiedAgoMs: 5 * DAY_MS,
    concepts: [{ id: 'macos-notarization-1008', weight: 1.0 }],
    diskText:
      '# macOS 公证签名报错 1008 排查\nxcrun notarytool 提交失败：补齐 Hardened Runtime 与安全时间戳参数。'
  },
  {
    id: 230,
    relPath: 'Downloads/promo-campaign-telemetry-schema.xlsx',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 53_000,
    createdAgoMs: 4 * DAY_MS,
    modifiedAgoMs: 2 * DAY_MS,
    concepts: [{ id: 'double11-telemetry-schema', weight: 1.0 }],
    diskText: '双十一大促埋点方案：会场曝光点击转化字段表（Promo Campaign Telemetry Schema）'
  },
  // Multimodal pure visual images (`content: null` in SQLite, 768d visual Gemma embedding)
  {
    id: 231,
    relPath: 'Pictures/IMG_4821.PNG',
    modality: 'image',
    inSqlite: true,
    sizeBytes: 1_840_000,
    createdAgoMs: 12 * DAY_MS,
    modifiedAgoMs: 12 * DAY_MS,
    concepts: [{ id: 'visual-pet-cat', weight: 1.0 }]
  },
  {
    id: 232,
    relPath: 'Pictures/DSC_0912.JPG',
    modality: 'image',
    inSqlite: true,
    sizeBytes: 2_310_000,
    createdAgoMs: 9 * DAY_MS,
    modifiedAgoMs: 9 * DAY_MS,
    concepts: [{ id: 'visual-whiteboard-arch', weight: 1.0 }]
  },
  {
    id: 233,
    relPath: 'Pictures/Screenshots/CleanShot_2026_10_18.png',
    modality: 'image',
    inSqlite: true,
    sizeBytes: 420_000,
    createdAgoMs: 6 * DAY_MS,
    modifiedAgoMs: 6 * DAY_MS,
    concepts: [{ id: 'visual-wechat-pay-qr', weight: 1.0 }]
  },
  {
    id: 234,
    relPath: 'Pictures/Screenshots/Screen_Capture_992.webp',
    modality: 'image',
    inSqlite: true,
    sizeBytes: 310_000,
    createdAgoMs: 5 * DAY_MS,
    modifiedAgoMs: 5 * DAY_MS,
    concepts: [{ id: 'visual-notarize-error-modal', weight: 1.0 }]
  },
  {
    id: 235,
    relPath: 'Pictures/IMG_HEIC_7731.JPG',
    modality: 'image',
    inSqlite: true,
    sizeBytes: 3_120_000,
    createdAgoMs: 15 * DAY_MS,
    modifiedAgoMs: 15 * DAY_MS,
    concepts: [{ id: 'visual-sunset-beach-heic', weight: 1.0 }]
  },
  {
    id: 236,
    relPath: 'Pictures/Screenshots/pnpm-peer-dep-screen.png',
    modality: 'image',
    inSqlite: true,
    sizeBytes: 580_000,
    createdAgoMs: 1 * DAY_MS,
    modifiedAgoMs: 1 * DAY_MS,
    concepts: [{ id: 'visual-pnpm-peer-dep', weight: 1.0 }]
  },
  {
    id: 237,
    relPath: 'Documents/notes/release-milestone-emoji.md',
    modality: 'document',
    inSqlite: true,
    sizeBytes: 4_800,
    createdAgoMs: 3 * DAY_MS,
    modifiedAgoMs: 1 * DAY_MS,
    chunks: [
      {
        startLine: 1,
        endLine: 12,
        text: `${'😀🚀'.repeat(42)} 发布庆功表情包段落：核心里程碑达成 surrogate emoji safety check ${'🎉✨'.repeat(30)}`,
        concepts: [{ id: 'emoji-surrogate-note', weight: 1.0 }]
      }
    ],
    diskText: '😀🚀 发布庆功表情包段落 surrogate emoji safety check 🎉✨'
  },
  // Cold / NativeFileArena-only files (NOT in SQLite `files` table — proves Bridge & Arena Layer 1!)
  {
    id: 301,
    relPath: 'Documents/weekly/engineering-weekly-report.md',
    modality: 'cold-arena-only',
    inSqlite: false,
    sizeBytes: 8_200,
    createdAgoMs: 60 * DAY_MS,
    modifiedAgoMs: 2 * DAY_MS,
    diskText: '# 研发团队周五例行周报'
  },
  {
    id: 302,
    relPath: 'Desktop/design/component-spacing-cheatsheet.pdf',
    modality: 'cold-arena-only',
    inSqlite: false,
    sizeBytes: 94_000,
    createdAgoMs: 30 * DAY_MS,
    modifiedAgoMs: 4 * DAY_MS,
    diskText: 'TuffEx 组件间距速查卡'
  },
  {
    id: 303,
    relPath: 'Documents/finance/重庆分支机构预算.xlsx',
    modality: 'cold-arena-only',
    inSqlite: false,
    sizeBytes: 41_000,
    createdAgoMs: 10 * DAY_MS,
    modifiedAgoMs: 2 * DAY_MS,
    diskText: '重庆分支机构预算明细'
  },
  {
    id: 304,
    relPath: 'Documents/finance/招商银行对公账户回单.pdf',
    modality: 'cold-arena-only',
    inSqlite: false,
    sizeBytes: 88_000,
    createdAgoMs: 8 * DAY_MS,
    modifiedAgoMs: 3 * DAY_MS,
    diskText: '招商银行对公账户回单'
  },
  {
    id: 305,
    relPath: 'Documents/research/同行竞品评测报告.md',
    modality: 'cold-arena-only',
    inSqlite: false,
    sizeBytes: 19_200,
    createdAgoMs: 7 * DAY_MS,
    modifiedAgoMs: 1 * DAY_MS,
    diskText: '# 同行竞品评测报告'
  },
  {
    id: 306,
    relPath: 'Projects/tuff-core/src/file-provider-native-index-service.ts',
    modality: 'cold-arena-only',
    inSqlite: false,
    sizeBytes: 14_500,
    createdAgoMs: 20 * DAY_MS,
    modifiedAgoMs: 1 * DAY_MS,
    diskText: 'export class FileProviderNativeIndexService {}'
  },
  {
    id: 307,
    relPath: 'Projects/tuff-core/docs/corebox-meta-overlay-contracts.md',
    modality: 'cold-arena-only',
    inSqlite: false,
    sizeBytes: 11_300,
    createdAgoMs: 15 * DAY_MS,
    modifiedAgoMs: 2 * DAY_MS,
    diskText: '# CoreBox Meta Overlay Contracts'
  },
  {
    id: 308,
    relPath: 'Projects/tuff-core/docs/december_lemon_notes.txt',
    modality: 'cold-arena-only',
    inSqlite: false,
    sizeBytes: 1_200,
    createdAgoMs: 120 * DAY_MS,
    modifiedAgoMs: 120 * DAY_MS,
    diskText: 'december lemon archive'
  },
  {
    id: 309,
    relPath: 'Downloads/2026-Q4-OKR-final.pdf',
    modality: 'cold-arena-only',
    inSqlite: false,
    sizeBytes: 156_000,
    createdAgoMs: 3_000, // Downloaded 3 seconds ago!
    modifiedAgoMs: 3_000,
    diskText: '2026 Q4 OKR Final Goals'
  },
  {
    id: 310,
    relPath: 'Documents/sales-target/2026-plan.xlsx',
    modality: 'cold-arena-only',
    inSqlite: false,
    sizeBytes: 39_000,
    createdAgoMs: 2 * DAY_MS,
    modifiedAgoMs: 2 * DAY_MS,
    diskText: '2026 Sales Target Plan'
  }
]

// ---------------------------------------------------------------------------
// Scenario Definition Schema (`#001`–`#100`)
// ---------------------------------------------------------------------------

export type Rec100ScenarioKind =
  | 'zero-input'
  | 'semantic-query'
  | 'multimodal-query'
  | 'arena-fastpath'
  | 'fs-realtime'
  | 'hybrid-ranking'
  | 'resource-security'

export interface Rec100ScenarioDefinition {
  readonly id: string
  readonly index: number
  readonly categoryId: Rec100CategoryId
  readonly title: string
  readonly signalSummary: string
  readonly expectedBehavior: string
  readonly layers: readonly string[]
  readonly codeRefs: readonly string[]
  /** Honest architectural expectation in (A) Legacy Single-Layer Baseline */
  readonly expectedLegacyPass: boolean
  /** Honest architectural expectation in (B) Dual-Layer Refactored Architecture */
  readonly expectedDualLayerPass: boolean
  readonly kind: Rec100ScenarioKind
  readonly params: Record<string, unknown>
}

export const REC_100_SCENARIOS: readonly Rec100ScenarioDefinition[] = [
  // =========================================================================
  // Category 1 (#001–#010): 零输入开框主动推荐 — 前台应用上下文感知
  // =========================================================================
  {
    id: '#001',
    index: 1,
    categoryId: 'cat-01',
    title: '微信群聊讨论财务预测时零输入开框，主动推荐本地 Q3 财务预测表格',
    signalSummary: 'foregroundApp=WeChat, windowTitle="项目交付群 - 季度财务预测讨论"',
    expectedBehavior:
      '经 FileRecommendationBridge.recallSemanticFiles 召回 2026-Q3-financial-forecast.xlsx 进入 context 推荐',
    layers: ['RecommendationEngine', 'FileRecommendationBridge', 'Gemma768d'],
    codeRefs: [
      'recommendation/recommendation-semantic-scorer.ts',
      'addon/files/file-recommendation-bridge.ts'
    ],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'fg-window-recall',
      foregroundApp: {
        bundleId: 'com.tencent.xinWeChat',
        name: 'WeChat',
        windowTitle: '项目交付群 - 季度财务预测讨论'
      },
      expectFileRelPath: 'Documents/finance/2026-Q3-financial-forecast.xlsx'
    }
  },
  {
    id: '#002',
    index: 2,
    categoryId: 'cat-01',
    title: '飞书技术评审窗口零输入开框，主动关联本地 API 网关限流设计稿',
    signalSummary: 'foregroundApp=Feishu, windowTitle="网关限流与熔断技术评审"',
    expectedBehavior: '窗口标题语义命中 api-gateway-rate-limit-rfc.md 并重建为可点击文件卡片',
    layers: ['RecommendationEngine', 'FileRecommendationBridge', 'Gemma768d'],
    codeRefs: [
      'recommendation/recommendation-semantic-scorer.ts',
      'recommendation/file-recommendation-source.ts'
    ],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'fg-window-recall',
      foregroundApp: {
        bundleId: 'com.electron.lark',
        name: 'Feishu',
        windowTitle: '网关限流与熔断技术评审'
      },
      expectFileRelPath: 'Documents/architecture/api-gateway-rate-limit-rfc.md'
    }
  },
  {
    id: '#003',
    index: 3,
    categoryId: 'cat-01',
    title: 'VS Code 编辑 embedding-service.ts 时开框，联动推荐终端与向量架构规格文档',
    signalSummary: 'foregroundApp=VSCode, windowTitle="embedding-service.ts — tuff-workspace"',
    expectedBehavior: '同时提权 iTerm2 (+60) 并召回 vector-indexing-architecture.md',
    layers: ['RecommendationEngine', 'VolatileMatcher', 'Gemma768d'],
    codeRefs: [
      'recommendation/volatile-context-matcher.ts',
      'recommendation/recommendation-semantic-scorer.ts'
    ],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'fg-ide-plus-doc',
      foregroundApp: {
        bundleId: 'com.microsoft.VSCode',
        name: 'Visual Studio Code',
        windowTitle: 'embedding-service.ts — tuff-workspace'
      },
      expectAppPath: '/Applications/iTerm.app',
      expectFileRelPath: 'Documents/specs/vector-indexing-architecture.md'
    }
  },
  {
    id: '#004',
    index: 4,
    categoryId: 'cat-01',
    title: 'Figma 审阅暗色主题画板时开框，主动召回本地设计 Token 规范文档',
    signalSummary: 'foregroundApp=Figma, windowTitle="CoreBox Redesign v3 — Dark Tokens"',
    expectedBehavior: '语义召回 Desktop/design/corebox-dark-theme-tokens.md',
    layers: ['RecommendationEngine', 'FileRecommendationBridge', 'Gemma768d'],
    codeRefs: ['recommendation/recommendation-semantic-scorer.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'fg-window-recall',
      foregroundApp: {
        bundleId: 'com.figma.Desktop',
        name: 'Figma',
        windowTitle: 'CoreBox Redesign v3 — Dark Tokens'
      },
      expectFileRelPath: 'Desktop/design/corebox-dark-theme-tokens.md'
    }
  },
  {
    id: '#005',
    index: 5,
    categoryId: 'cat-01',
    title: 'iTerm2 查看 Pod OOM 崩溃日志时开框，秒级推荐 K8s 内存溢出排障手册',
    signalSummary: 'foregroundApp=iTerm2, windowTitle="kubectl logs pod/payment-oom-crash"',
    expectedBehavior: '语义召回 Documents/runbooks/k8s-pod-oom-troubleshooting.md',
    layers: ['RecommendationEngine', 'FileRecommendationBridge', 'Gemma768d'],
    codeRefs: ['recommendation/recommendation-semantic-scorer.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'fg-window-recall',
      foregroundApp: {
        bundleId: 'com.googlecode.iterm2',
        name: 'iTerm2',
        windowTitle: 'kubectl logs pod/payment-oom-crash'
      },
      expectFileRelPath: 'Documents/runbooks/k8s-pod-oom-troubleshooting.md'
    }
  },
  {
    id: '#006',
    index: 6,
    categoryId: 'cat-01',
    title: 'Chrome 阅读 SQLite WAL 并发指南时开框，联动推荐开发工具与本地调优笔记',
    signalSummary: 'foregroundApp=Chrome, windowTitle="SQLite WAL Mode Concurrency Lock Guide"',
    expectedBehavior:
      '浏览器->开发工具规则提权 VS Code/iTerm2 (+50)，同时召回 sqlite-wal-busy-tuning.md',
    layers: ['RecommendationEngine', 'VolatileMatcher', 'Gemma768d'],
    codeRefs: [
      'recommendation/volatile-context-matcher.ts',
      'recommendation/recommendation-semantic-scorer.ts'
    ],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'fg-browser-plus-doc',
      foregroundApp: {
        bundleId: 'com.google.Chrome',
        name: 'Google Chrome',
        windowTitle: 'SQLite WAL Mode Concurrency Lock Guide'
      },
      expectAppPath: '/Applications/Visual Studio Code.app',
      expectFileRelPath: 'Documents/notes/sqlite-wal-busy-tuning.md'
    }
  },
  {
    id: '#007',
    index: 7,
    categoryId: 'cat-01',
    title: 'Mail 查收 AWS 账单邮件时开框，主动推荐本地归档的十月云账单 PDF',
    signalSummary: 'foregroundApp=Mail, windowTitle="AWS Cloud Billing Invoice October"',
    expectedBehavior: '语义召回 Downloads/cloud-hosting-october-statement.pdf',
    layers: ['RecommendationEngine', 'FileRecommendationBridge', 'Gemma768d'],
    codeRefs: ['recommendation/recommendation-semantic-scorer.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'fg-window-recall',
      foregroundApp: {
        bundleId: 'com.apple.mail',
        name: 'Mail',
        windowTitle: 'AWS Cloud Billing Invoice October'
      },
      expectFileRelPath: 'Downloads/cloud-hosting-october-statement.pdf'
    }
  },
  {
    id: '#008',
    index: 8,
    categoryId: 'cat-01',
    title: 'Zoom 参加迭代复盘会议时开框，主动浮现本地敏捷复盘纪要文档',
    signalSummary: 'foregroundApp=Zoom, windowTitle="Sprint 24 Retro & Action Items"',
    expectedBehavior: '语义召回 Documents/meetings/sprint-retro-notes.md',
    layers: ['RecommendationEngine', 'FileRecommendationBridge', 'Gemma768d'],
    codeRefs: ['recommendation/recommendation-semantic-scorer.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'fg-window-recall',
      foregroundApp: {
        bundleId: 'us.zoom.xos',
        name: 'Zoom',
        windowTitle: 'Sprint 24 Retro & Action Items'
      },
      expectFileRelPath: 'Documents/meetings/sprint-retro-notes.md'
    }
  },
  {
    id: '#009',
    index: 9,
    categoryId: 'cat-01',
    title: '当前前台应用自身降权防冗余：前台已在 VS Code 时自动压低 VS Code 并前置 iTerm2',
    signalSummary: 'foregroundApp=com.microsoft.VSCode (同基础历史分 VS Code vs iTerm2)',
    expectedBehavior:
      'isSameAppIdentity 命中 -50 惩罚，IDE->Terminal 命中 +60 提权，iTerm2 排在 VS Code 之前',
    layers: ['RecommendationEngine', 'VolatileMatcher'],
    codeRefs: [
      'recommendation/volatile-context-matcher.ts',
      'recommendation/app-identity-match.ts'
    ],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'fg-self-demote'
    }
  },
  {
    id: '#010',
    index: 10,
    categoryId: 'cat-01',
    title: '零历史新设备冷启动开框保底：展示宿主默认设置入口与新装应用，严禁伪造常用徽章',
    signalSummary: 'usageBehavior=empty, coldStart=true',
    expectedBehavior:
      '返回 settings-general 等宿主入口 (5e3) 与应用目录 (1e3)，所有卡片 source 均为 cold-start 而非 frequent',
    layers: ['RecommendationEngine', 'CatalogCandidates'],
    codeRefs: ['recommendation/recommendation-catalog-candidates.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'cold-start-defaults'
    }
  },

  // =========================================================================
  // Category 2 (#011–#020): 剪贴板与划词语义触发推荐
  // =========================================================================
  {
    id: '#011',
    index: 11,
    categoryId: 'cat-02',
    title: '复制 GitHub PR 链接后开框，置顶生成“打开链接”宿主卡片并提权浏览器',
    signalSummary: 'clipboard="https://github.com/talex-touch/tuff/pull/1120" (isUrl=true)',
    expectedBehavior:
      '经 hashContextContent 二次核验生成 __builtin_clipboard_url__ 卡片居首，且 Chrome 高于非浏览器应用',
    layers: ['RecommendationEngine', 'ClipboardSnapshot'],
    codeRefs: [
      'recommendation/recommendation-engine.ts',
      'recommendation/plugin-recommendation-source.ts'
    ],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'clipboard-url-card',
      url: 'https://github.com/talex-touch/tuff/pull/1120'
    }
  },
  {
    id: '#012',
    index: 12,
    categoryId: 'cat-02',
    title: '复制 SQLITE_BUSY 报错堆栈后开框，Gemma 语义召回本地数据库忙锁调优笔记',
    signalSummary: 'clipboard="SqliteError: SQLITE_BUSY: database is locked at WalCheckpoint"',
    expectedBehavior: '瞬态剪贴板文本经 Gemma 768d 向量匹配召回 sqlite-wal-busy-tuning.md',
    layers: ['RecommendationEngine', 'FileRecommendationBridge', 'Gemma768d'],
    codeRefs: ['recommendation/recommendation-semantic-scorer.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'clipboard-semantic-recall',
      clipboardText: 'SqliteError: SQLITE_BUSY: database is locked at WalCheckpoint',
      expectFileRelPath: 'Documents/notes/sqlite-wal-busy-tuning.md'
    }
  },
  {
    id: '#013',
    index: 13,
    categoryId: 'cat-02',
    title: '复制合同编号与押金摘要后开框，主动召回对应归档 PDF 合同',
    signalSummary: 'clipboard="合同编号 HT-2026-0892 房屋租赁押金及物业交割"',
    expectedBehavior: '语义命中第 1 页 chunk，推荐 Documents/contracts/2026-房屋租赁合同.pdf',
    layers: ['RecommendationEngine', 'FileRecommendationBridge', 'Gemma768d'],
    codeRefs: ['recommendation/recommendation-semantic-scorer.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'clipboard-semantic-recall',
      clipboardText: '合同编号 HT-2026-0892 房屋租赁押金及物业交割',
      expectFileRelPath: 'Documents/contracts/2026-房屋租赁合同.pdf'
    }
  },
  {
    id: '#014',
    index: 14,
    categoryId: 'cat-02',
    title: '复制 TypeScript 源码文件后开框，精准优先推荐 VS Code 与 WebStorm',
    signalSummary: 'clipboard.type=files, fileType=code, language=typescript',
    expectedBehavior: 'VS Code (+100) 与 WebStorm (+95) 排序高于普通编辑器与应用',
    layers: ['RecommendationEngine', 'VolatileMatcher'],
    codeRefs: ['recommendation/volatile-context-matcher.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'clipboard-code-lang',
      language: 'typescript',
      expectTopApps: ['/Applications/Visual Studio Code.app', '/Applications/WebStorm.app']
    }
  },
  {
    id: '#015',
    index: 15,
    categoryId: 'cat-02',
    title: '复制 Python 训练脚本后开框，精准推荐 PyCharm 与 VS Code',
    signalSummary: 'clipboard.type=files, fileType=code, language=python',
    expectedBehavior: 'PyCharm (+100) 与 VS Code (+90) 排在无关候选之前',
    layers: ['RecommendationEngine', 'VolatileMatcher'],
    codeRefs: ['recommendation/volatile-context-matcher.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'clipboard-code-lang',
      language: 'python',
      expectTopApps: ['/Applications/PyCharm.app', '/Applications/Visual Studio Code.app']
    }
  },
  {
    id: '#016',
    index: 16,
    categoryId: 'cat-02',
    title: '复制 Webhook 路由路径后开框，Gemma 关联召回本地接口验签规范',
    signalSummary: 'clipboard="POST /api/v2/webhooks/stripe-signature-verify"',
    expectedBehavior: '语义召回 Documents/specs/webhook-signature-openapi.md',
    layers: ['RecommendationEngine', 'FileRecommendationBridge', 'Gemma768d'],
    codeRefs: ['recommendation/recommendation-semantic-scorer.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'clipboard-semantic-recall',
      clipboardText: 'POST /api/v2/webhooks/stripe-signature-verify',
      expectFileRelPath: 'Documents/specs/webhook-signature-openapi.md'
    }
  },
  {
    id: '#017',
    index: 17,
    categoryId: 'cat-02',
    title: '复制 12306 高铁电子客票短信后开框，主动推荐差旅报销汇总表',
    signalSummary: 'clipboard="G1024 二等座 上海虹桥-北京南 553.00元 电子客票号"',
    expectedBehavior: '语义召回 Downloads/2026-travel-reimbursement-sheet.xlsx',
    layers: ['RecommendationEngine', 'FileRecommendationBridge', 'Gemma768d'],
    codeRefs: ['recommendation/recommendation-semantic-scorer.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'clipboard-semantic-recall',
      clipboardText: 'G1024 二等座 上海虹桥-北京南 553.00元 电子客票号',
      expectFileRelPath: 'Downloads/2026-travel-reimbursement-sheet.xlsx'
    }
  },
  {
    id: '#018',
    index: 18,
    categoryId: 'cat-02',
    title: '划词选中英文退避重试术语后开框，跨语种召回本地网关限流 RFC 文档',
    signalSummary: 'selection="exponential backoff with jitter retry" (selectionSnapshotStore)',
    expectedBehavior:
      '经 selectionSnapshotStore 摘要核验后跨语种召回 api-gateway-rate-limit-rfc.md',
    layers: ['RecommendationEngine', 'SelectionSnapshotStore', 'Gemma768d'],
    codeRefs: [
      'modules/system/selection-snapshot-store.ts',
      'recommendation/recommendation-semantic-scorer.ts'
    ],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'selection-semantic-recall',
      selectionText: 'exponential backoff with jitter retry',
      expectFileRelPath: 'Documents/architecture/api-gateway-rate-limit-rfc.md'
    }
  },
  {
    id: '#019',
    index: 19,
    categoryId: 'cat-02',
    title: '剪贴板中途变更导致隐私摘要失配时，拒绝生成陈旧 URL 卡片防误触 (#648)',
    signalSummary: 'context.clipboard.content=hash(urlA), liveClipboard=urlB',
    expectedBehavior: 'hashContextContent 校验不一致，返回零张 __builtin_clipboard_url__ 卡片',
    layers: ['RecommendationEngine', 'ContextProvider'],
    codeRefs: ['recommendation/context-provider.ts', 'recommendation/recommendation-engine.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'clipboard-digest-mismatch'
    }
  },
  {
    id: '#020',
    index: 20,
    categoryId: 'cat-02',
    title: '复制位图截图到剪贴板后开框，优先推荐 Figma 与系统预览工具',
    signalSummary: 'clipboard.type=image',
    expectedBehavior: '图像类应用 Figma / Preview 获得 +100 易变加成排在前列',
    layers: ['RecommendationEngine', 'VolatileMatcher'],
    codeRefs: ['recommendation/volatile-context-matcher.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'clipboard-image-apps'
    }
  },

  // =========================================================================
  // Category 3 (#021–#030): 概念与跨语种语义召回
  // =========================================================================
  {
    id: '#021',
    index: 21,
    categoryId: 'cat-03',
    title: '纯英文搜 "pet policy"，跨语种命中全中文命名《2026-房屋租赁合同.pdf》宠物条款',
    signalSummary: 'query="pet policy" (零文件名重合)',
    expectedBehavior: 'Gemma 768d 跨语种余弦高分命中 2026-房屋租赁合同.pdf',
    layers: ['Gemma768d', 'SemanticRecall', 'TuffSorter'],
    codeRefs: [
      'addon/files/embedding-service.ts',
      'addon/files/services/file-provider-search-result-service.ts'
    ],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: 'pet policy',
      expectFileRelPath: 'Documents/contracts/2026-房屋租赁合同.pdf'
    }
  },
  {
    id: '#022',
    index: 22,
    categoryId: 'cat-03',
    title: '全中文搜 "内存泄漏排查"，跨语种命中英文笔记 v8-heap-snapshot-retention-guide.md',
    signalSummary: 'query="内存泄漏排查"',
    expectedBehavior: 'Gemma 768d 召回 Documents/notes/v8-heap-snapshot-retention-guide.md 居首',
    layers: ['Gemma768d', 'SemanticRecall', 'TuffSorter'],
    codeRefs: ['addon/files/services/file-provider-search-result-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: '内存泄漏排查',
      expectFileRelPath: 'Documents/notes/v8-heap-snapshot-retention-guide.md'
    }
  },
  {
    id: '#023',
    index: 23,
    categoryId: 'cat-03',
    title: '概念同义词搜 "防抖节流与背压机制"，命中 AIMD 批流控架构规范',
    signalSummary: 'query="防抖节流与背压机制"',
    expectedBehavior: 'Gemma 768d 召回 Documents/specs/indexing-stream-backpressure.md',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/embedding-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: '防抖节流与背压机制',
      expectFileRelPath: 'Documents/specs/indexing-stream-backpressure.md'
    }
  },
  {
    id: '#024',
    index: 24,
    categoryId: 'cat-03',
    title:
      '中英混搜 "OAuth2 refresh token 轮换失效"，命中安全应急手册 session-rotation-playbook.md',
    signalSummary: 'query="OAuth2 refresh token 轮换失效"',
    expectedBehavior: 'Gemma 768d 召回 Documents/security/session-rotation-playbook.md',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/embedding-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: 'OAuth2 refresh token 轮换失效',
      expectFileRelPath: 'Documents/security/session-rotation-playbook.md'
    }
  },
  {
    id: '#025',
    index: 25,
    categoryId: 'cat-03',
    title: '生活概念搜 "体检血脂偏高饮食建议"，命中含甘油三酯医嘱的英文命名体检 PDF',
    signalSummary: 'query="体检血脂偏高饮食建议"',
    expectedBehavior: 'Gemma 768d 召回 Documents/personal/annual-health-checkup-2026.pdf',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/embedding-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: '体检血脂偏高饮食建议',
      expectFileRelPath: 'Documents/personal/annual-health-checkup-2026.pdf'
    }
  },
  {
    id: '#026',
    index: 26,
    categoryId: 'cat-03',
    title: '法务术语搜 "不可抗力免责与解约赔偿"，命中供应商主协议 vendor-msa-master-agreement.pdf',
    signalSummary: 'query="不可抗力免责与解约赔偿"',
    expectedBehavior: 'Gemma 768d 召回 Documents/contracts/vendor-msa-master-agreement.pdf',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/embedding-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: '不可抗力免责与解约赔偿',
      expectFileRelPath: 'Documents/contracts/vendor-msa-master-agreement.pdf'
    }
  },
  {
    id: '#027',
    index: 27,
    categoryId: 'cat-03',
    title: '按故障表象搜 "白屏闪烁与窗口高度抖动"，命中 corebox-overlay-resize-notes.md',
    signalSummary: 'query="白屏闪烁与窗口高度抖动"',
    expectedBehavior: 'Gemma 768d 召回 Documents/specs/corebox-overlay-resize-notes.md',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/embedding-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: '白屏闪烁与窗口高度抖动',
      expectFileRelPath: 'Documents/specs/corebox-overlay-resize-notes.md'
    }
  },
  {
    id: '#028',
    index: 28,
    categoryId: 'cat-03',
    title: '英文缩写搜 "EBITDA margin Q3 YoY"，跨语种命中《三季度经营分析纪要.md》',
    signalSummary: 'query="EBITDA margin Q3 YoY"',
    expectedBehavior: 'Gemma 768d 召回 Documents/finance/三季度经营分析纪要.md',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/embedding-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: 'EBITDA margin Q3 YoY',
      expectFileRelPath: 'Documents/finance/三季度经营分析纪要.md'
    }
  },
  {
    id: '#029',
    index: 29,
    categoryId: 'cat-03',
    title: '算法原理描述搜 "无需全文分词的模糊子序列打分"，命中 smith-waterman-fuzzy-scorer.md',
    signalSummary: 'query="无需全文分词的模糊子序列打分"',
    expectedBehavior: 'Gemma 768d 召回 Documents/specs/smith-waterman-fuzzy-scorer.md',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/embedding-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: '无需全文分词的模糊子序列打分',
      expectFileRelPath: 'Documents/specs/smith-waterman-fuzzy-scorer.md'
    }
  },
  {
    id: '#030',
    index: 30,
    categoryId: 'cat-03',
    title: '运维场景搜 "证书快过期怎么自动续签"，命中 acme-letsencrypt-renewal.md',
    signalSummary: 'query="证书快过期怎么自动续签"',
    expectedBehavior: 'Gemma 768d 召回 Documents/runbooks/acme-letsencrypt-renewal.md',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/embedding-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: '证书快过期怎么自动续签',
      expectFileRelPath: 'Documents/runbooks/acme-letsencrypt-renewal.md'
    }
  },

  // =========================================================================
  // Category 4 (#031–#040): 口语化与模糊记忆找文件
  // =========================================================================
  {
    id: '#031',
    index: 31,
    categoryId: 'cat-04',
    title:
      '口语搜 "上周改的年度部门预算表"，凭表头编制与采购科目向量命中 dept-hc-capex-plan-2026.xlsx',
    signalSummary: 'query="上周改的年度部门预算表"',
    expectedBehavior: 'Gemma 768d 召回 Documents/finance/dept-hc-capex-plan-2026.xlsx',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/services/file-provider-search-result-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: '上周改的年度部门预算表',
      expectFileRelPath: 'Documents/finance/dept-hc-capex-plan-2026.xlsx'
    }
  },
  {
    id: '#032',
    index: 32,
    categoryId: 'cat-04',
    title: '口语搜 "写着 Redis 连接池超时配置的那篇文档"，命中 cache-cluster-tuning.md',
    signalSummary: 'query="写着 Redis 连接池超时配置的那篇文档"',
    expectedBehavior: 'Gemma 768d 召回 Documents/runbooks/cache-cluster-tuning.md',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/services/file-provider-search-result-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: '写着 Redis 连接池超时配置的那篇文档',
      expectFileRelPath: 'Documents/runbooks/cache-cluster-tuning.md'
    }
  },
  {
    id: '#033',
    index: 33,
    categoryId: 'cat-04',
    title: '口语搜 "年底晋升答辩用的架构演进 PPT 初稿"，命中 q4-staff-promo-deck-draft.pptx',
    signalSummary: 'query="年底晋升答辩用的架构演进 PPT 初稿"',
    expectedBehavior: 'Gemma 768d 召回 Desktop/q4-staff-promo-deck-draft.pptx',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/services/file-provider-search-result-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: '年底晋升答辩用的架构演进 PPT 初稿',
      expectFileRelPath: 'Desktop/q4-staff-promo-deck-draft.pptx'
    }
  },
  {
    id: '#034',
    index: 34,
    categoryId: 'cat-04',
    title: '口语搜 "出差高铁和酒店报销单"，命中差旅报销文档',
    signalSummary: 'query="去杭州出差的高铁和酒店报销单"',
    expectedBehavior:
      'Gemma 768d 召回差旅报销单 (hangzhou-summit-expense-claim.pdf / 2026-travel-reimbursement-sheet.xlsx)',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/services/file-provider-search-result-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: '去杭州出差的高铁和酒店报销单',
      expectAnyRelPaths: [
        'Downloads/hangzhou-summit-expense-claim.pdf',
        'Downloads/2026-travel-reimbursement-sheet.xlsx'
      ]
    }
  },
  {
    id: '#035',
    index: 35,
    categoryId: 'cat-04',
    title: '口语搜 "记录家里光猫桥接和 VLAN 设置的备忘"，命中 home-router-pppoe-setup.md',
    signalSummary: 'query="记录家里光猫桥接和 VLAN 设置的备忘"',
    expectedBehavior: 'Gemma 768d 召回 Documents/personal/home-router-pppoe-setup.md',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/services/file-provider-search-result-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: '记录家里光猫桥接和 VLAN 设置的备忘',
      expectFileRelPath: 'Documents/personal/home-router-pppoe-setup.md'
    }
  },
  {
    id: '#036',
    index: 36,
    categoryId: 'cat-04',
    title: '口语搜 "客户投诉导出大表格卡死的复盘报告"，命中 postmortem-csv-export-freeze.md',
    signalSummary: 'query="客户投诉导出大表格卡死的复盘报告"',
    expectedBehavior: 'Gemma 768d 召回 Documents/meetings/postmortem-csv-export-freeze.md',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/services/file-provider-search-result-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: '客户投诉导出大表格卡死的复盘报告',
      expectFileRelPath: 'Documents/meetings/postmortem-csv-export-freeze.md'
    }
  },
  {
    id: '#037',
    index: 37,
    categoryId: 'cat-04',
    title: '口语搜 "新员工入职第一周开发环境搭建清单"，命中 onboarding-macbook-setup.md',
    signalSummary: 'query="新员工入职第一周开发环境搭建清单"',
    expectedBehavior: 'Gemma 768d 召回 Documents/team/onboarding-macbook-setup.md',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/services/file-provider-search-result-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: '新员工入职第一周开发环境搭建清单',
      expectFileRelPath: 'Documents/team/onboarding-macbook-setup.md'
    }
  },
  {
    id: '#038',
    index: 38,
    categoryId: 'cat-04',
    title:
      '口语搜 "对比 Rust N-API 和 C++ Node Addon 选型的笔记"，命中 native-binding-tradeoffs.md',
    signalSummary: 'query="对比 Rust N-API 和 C++ Node Addon 选型的笔记"',
    expectedBehavior: 'Gemma 768d 召回 Documents/architecture/native-binding-tradeoffs.md',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/services/file-provider-search-result-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: '对比 Rust N-API 和 C++ Node Addon 选型的笔记',
      expectFileRelPath: 'Documents/architecture/native-binding-tradeoffs.md'
    }
  },
  {
    id: '#039',
    index: 39,
    categoryId: 'cat-04',
    title: '口语搜 "公证签名报错 1008 的解决办法"，命中 macos-notarization-troubleshooting.md',
    signalSummary: 'query="App Store 公证签名报错 1008 的解决办法"',
    expectedBehavior: 'Gemma 768d 召回 Documents/runbooks/macos-notarization-troubleshooting.md',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/services/file-provider-search-result-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: 'App Store 公证签名报错 1008 的解决办法',
      expectFileRelPath: 'Documents/runbooks/macos-notarization-troubleshooting.md'
    }
  },
  {
    id: '#040',
    index: 40,
    categoryId: 'cat-04',
    title: '口语搜 "产品经理列的双十一大促埋点字段表"，命中 promo-campaign-telemetry-schema.xlsx',
    signalSummary: 'query="产品经理列的双十一大促埋点字段表"',
    expectedBehavior: 'Gemma 768d 召回 Downloads/promo-campaign-telemetry-schema.xlsx',
    layers: ['Gemma768d', 'SemanticRecall'],
    codeRefs: ['addon/files/services/file-provider-search-result-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'semantic-query',
    params: {
      query: '产品经理列的双十一大促埋点字段表',
      expectFileRelPath: 'Downloads/promo-campaign-telemetry-schema.xlsx'
    }
  },

  // =========================================================================
  // Category 5 (#041–#050): 工作流共现、习惯与时间节律推荐
  // =========================================================================
  {
    id: '#041',
    index: 41,
    categoryId: 'cat-05',
    title: '工作日晨会 09:30 时段节律召回：满足 >=10 次且 >=3 活跃天门禁推荐飞书并附带峰值时段证据',
    signalSummary: 'hour=9, executeCount30=14, activeDays30=6, hourDist[9]=11',
    expectedBehavior: 'Feishu 获得 time-based 理由与真实 peakHourRange 证据排在首位',
    layers: ['RecommendationEngine', 'TimeStats'],
    codeRefs: ['recommendation/recommendation-utils.ts', 'recommendation/recommendation-engine.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'habit-morning-feishu'
    }
  },
  {
    id: '#042',
    index: 42,
    categoryId: 'cat-05',
    title: '周五 17:00 周报固定习惯：仅存于 NativeFileArena 的本地周报经 Bridge 成功重建进入首排',
    signalSummary:
      'hour=17, dayOfWeek=5, item=Documents/weekly/engineering-weekly-report.md (Arena-only)',
    expectedBehavior:
      'createFileRecommendationSource 通过 lookupFilesByPaths 补齐非 SQLite 文件并渲染推荐卡片',
    layers: ['RecommendationEngine', 'FileRecommendationBridge', 'NativeFileArena'],
    codeRefs: [
      'recommendation/file-recommendation-source.ts',
      'addon/files/file-recommendation-bridge.ts'
    ],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'habit-arena-weekly-doc',
      expectFileRelPath: 'Documents/weekly/engineering-weekly-report.md'
    }
  },
  {
    id: '#043',
    index: 43,
    categoryId: 'cat-05',
    title: '昨日同一时段召回契约：昨天 ±1h 内打开的应用被召回并标记真实 yesterday 证据',
    signalSummary: 'historyEvent at setDate(-1) same hour',
    expectedBehavior:
      'buildRecommendationContextCandidates 产出 yesterday=true 证据并成功前置该应用',
    layers: ['RecommendationEngine', 'ContextHistory'],
    codeRefs: ['recommendation/recommendation-context-history.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'habit-yesterday-recall'
    }
  },
  {
    id: '#044',
    index: 44,
    categoryId: 'cat-05',
    title: '隐私关闭时间信号 (timeAvailable=false) 时禁用时段与昨日召回，但保留来源应用转移偏好',
    signalSummary: 'timeAvailable=false, foregroundApp=VSCode -> Apifox history',
    expectedBehavior: 'yesterday 证据不触发，sourceApp=VSCode 条件偏好仍正常召回 Apifox',
    layers: ['RecommendationEngine', 'ContextHistory'],
    codeRefs: ['recommendation/recommendation-context-history.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'habit-time-disabled-source-kept'
    }
  },
  {
    id: '#045',
    index: 45,
    categoryId: 'cat-05',
    title: 'IDE -> 接口调试工具工作流共现：从 VS Code 切出高频启动 Apifox 触发习得场景召回',
    signalSummary: 'foregroundApp=VSCode, 6 transitions across 4 days (>5% conditional gain)',
    expectedBehavior: 'Apifox 以 context 理由及 sourceApp 证据超越全局低关联候选',
    layers: ['RecommendationEngine', 'ContextHistory'],
    codeRefs: ['recommendation/recommendation-context-history.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'habit-vscode-to-apifox'
    }
  },
  {
    id: '#046',
    index: 46,
    categoryId: 'cat-05',
    title: '从 Figma 切出高频查阅组件间距速查 PDF（NativeFileArena 文件经 Bridge 重建）',
    signalSummary:
      'foregroundApp=Figma -> Desktop/design/component-spacing-cheatsheet.pdf (Arena-only)',
    expectedBehavior: '习得场景召回 + Bridge lookupFilesByPaths 重建 PDF 推荐卡片',
    layers: [
      'RecommendationEngine',
      'ContextHistory',
      'FileRecommendationBridge',
      'NativeFileArena'
    ],
    codeRefs: [
      'recommendation/recommendation-context-history.ts',
      'recommendation/file-recommendation-source.ts'
    ],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'habit-figma-to-arena-pdf',
      expectFileRelPath: 'Desktop/design/component-spacing-cheatsheet.pdf'
    }
  },
  {
    id: '#047',
    index: 47,
    categoryId: 'cat-05',
    title: '应用+时段联合证据防拼凑契约：跨 >=3 天且同窗口共现 >=5 次才授予联合时段证据',
    signalSummary: 'joint sourceApp+hour >=5 over 3d vs disjoint sourceApp & hour',
    expectedBehavior: '真联合历史产出 joint 证据并高于离散拼凑历史',
    layers: ['RecommendationEngine', 'ContextHistory'],
    codeRefs: ['recommendation/recommendation-context-history.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'habit-joint-evidence-gate'
    }
  },
  {
    id: '#048',
    index: 48,
    categoryId: 'cat-05',
    title: '手动置顶项绝对优先与零重复契约：Pinned 应用占据 Grid 第 1 槽位且不在推荐流重复出现',
    signalSummary: 'pinned=[Sublime Text], frequent=[VS Code, Sublime Text]',
    expectedBehavior: 'Sublime Text 位于索引 0 (isPinned=true)，列表内总出现次数严格为 1',
    layers: ['RecommendationEngine'],
    codeRefs: ['recommendation/recommendation-engine.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'habit-pinned-first-dedup'
    }
  },
  {
    id: '#049',
    index: 49,
    categoryId: 'cat-05',
    title: '诚实常用徽章门禁：单日下午连开 8 次但活跃天数仅 1 天 (<3 天)，降级为 recent 拒贴常用标',
    signalSummary: 'executeCount30=8, activeDays30=1 (<3 days required for frequent)',
    expectedBehavior: 'resolveEvidenceBackedReason 将标签诚实收敛为 recent，绝不虚标 frequent',
    layers: ['RecommendationEngine', 'RecommendationUtils'],
    codeRefs: ['recommendation/recommendation-utils.ts', 'recommendation/item-rebuilder.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'habit-honest-5-3-badge'
    }
  },
  {
    id: '#050',
    index: 50,
    categoryId: 'cat-05',
    title:
      'macOS ⌘Tab 前台停留活跃感知：未从 Tuff 启动但刚切换使用过的应用进入 recent 且不伪造启动次数',
    signalSummary: 'ForegroundAppActivityTracker lastActiveAt=5min ago, executeCount=0',
    expectedBehavior:
      '应用通过 foreground recent 召回，evidence 仅含 lastActiveAt 而无虚假 executeCount',
    layers: ['RecommendationEngine', 'ForegroundActivity'],
    codeRefs: ['recommendation/recommendation-engine.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'habit-foreground-stay-recent'
    }
  },

  // =========================================================================
  // Category 6 (#051–#060): 多模态文档与视觉语义召回
  // =========================================================================
  {
    id: '#051',
    index: 51,
    categoryId: 'cat-06',
    title: '多页 PDF 分页 chunk 精确定位：搜 "宠物饲养押金" 命中合同第 4 页并返回原页摘要',
    signalSummary: 'query="宠物饲养押金" -> 4-page PDF chunk hash match',
    expectedBehavior: 'deepMatch.pageNumber === 4 且 snippet 包含“宠物专项押金贰仟元整”',
    layers: ['Gemma768d', 'FileContentMatch'],
    codeRefs: [
      'addon/files/services/file-content-match.ts',
      'addon/files/services/file-provider-search-result-service.ts'
    ],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'multimodal-query',
    params: {
      caseKey: 'pdf-page-chunk',
      query: '宠物饲养押金',
      expectFileRelPath: 'Documents/contracts/2026-房屋租赁合同.pdf',
      expectPageNumber: 4,
      expectSnippetContains: '宠物专项押金贰仟元整'
    }
  },
  {
    id: '#052',
    index: 52,
    categoryId: 'cat-06',
    title: '长篇技术笔记行号级定位：搜 "SQLITE_BUSY reconnect transaction" 定位第 42 行后段落',
    signalSummary: 'query="SQLITE_BUSY reconnect transaction" -> Markdown line chunk match',
    expectedBehavior: '命中 sqlite-wal-busy-tuning.md 且 deepMatch.lineNumber >= 42',
    layers: ['Gemma768d', 'FileContentMatch'],
    codeRefs: ['addon/files/services/file-content-match.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'multimodal-query',
    params: {
      caseKey: 'md-line-chunk',
      query: 'SQLITE_BUSY reconnect transaction',
      expectFileRelPath: 'Documents/notes/sqlite-wal-busy-tuning.md',
      expectMinLine: 42
    }
  },
  {
    id: '#053',
    index: 53,
    categoryId: 'cat-06',
    title: '纯视觉原图无文字检索：搜中文 "一只猫" 命中 IMG_4821.PNG (正文 content 为 NULL)',
    signalSummary: 'query="一只猫", IMG_4821.PNG (content=null, 768d visual vector)',
    expectedBehavior: 'IMG_4821.PNG 凭图文共享 768d 向量空间排在第 1 位',
    layers: ['Gemma768d', 'MultimodalImage'],
    codeRefs: ['addon/files/embedding-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'multimodal-query',
    params: {
      caseKey: 'visual-image-search',
      query: '一只猫',
      expectFileRelPath: 'Pictures/IMG_4821.PNG'
    }
  },
  {
    id: '#054',
    index: 54,
    categoryId: 'cat-06',
    title: '跨语种视觉原图检索：搜英文 "a pet cat on sofa" 同样首位命中 IMG_4821.PNG',
    signalSummary: 'query="a pet cat on sofa" -> IMG_4821.PNG',
    expectedBehavior: '跨语种文本查询与图片视觉向量余弦高分对齐，首位返回 IMG_4821.PNG',
    layers: ['Gemma768d', 'MultimodalImage'],
    codeRefs: ['addon/files/embedding-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'multimodal-query',
    params: {
      caseKey: 'visual-image-search',
      query: 'a pet cat on sofa',
      expectFileRelPath: 'Pictures/IMG_4821.PNG'
    }
  },
  {
    id: '#055',
    index: 55,
    categoryId: 'cat-06',
    title: '会议室白板实拍照片检索：搜 "白板微服务架构草图" 命中相机编号照片 DSC_0912.JPG',
    signalSummary: 'query="白板微服务架构草图" -> DSC_0912.JPG',
    expectedBehavior: 'Gemma 视觉向量召回 Pictures/DSC_0912.JPG',
    layers: ['Gemma768d', 'MultimodalImage'],
    codeRefs: ['addon/files/embedding-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'multimodal-query',
    params: {
      caseKey: 'visual-image-search',
      query: '白板微服务架构草图',
      expectFileRelPath: 'Pictures/DSC_0912.JPG'
    }
  },
  {
    id: '#056',
    index: 56,
    categoryId: 'cat-06',
    title: '截图收款码检索：搜 "微信商户付款二维码" 命中无语义文件名的 CleanShot_2026_10_18.png',
    signalSummary: 'query="微信商户付款二维码" -> CleanShot_2026_10_18.png',
    expectedBehavior: 'Gemma 视觉向量召回 Pictures/Screenshots/CleanShot_2026_10_18.png',
    layers: ['Gemma768d', 'MultimodalImage'],
    codeRefs: ['addon/files/embedding-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'multimodal-query',
    params: {
      caseKey: 'visual-image-search',
      query: '微信商户付款二维码',
      expectFileRelPath: 'Pictures/Screenshots/CleanShot_2026_10_18.png'
    }
  },
  {
    id: '#057',
    index: 57,
    categoryId: 'cat-06',
    title: 'UI 异常弹窗截图检索：搜 "公证失败红色报错弹窗" 命中 WebP 截图 Screen_Capture_992.webp',
    signalSummary: 'query="公证失败红色报错弹窗" -> Screen_Capture_992.webp',
    expectedBehavior: 'Gemma 视觉/OCR 融合向量召回 Pictures/Screenshots/Screen_Capture_992.webp',
    layers: ['Gemma768d', 'MultimodalImage'],
    codeRefs: ['addon/files/embedding-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'multimodal-query',
    params: {
      caseKey: 'visual-image-search',
      query: '公证失败红色报错弹窗',
      expectFileRelPath: 'Pictures/Screenshots/Screen_Capture_992.webp'
    }
  },
  {
    id: '#058',
    index: 58,
    categoryId: 'cat-06',
    title: 'Emoji UTF-16 代理对安全边界：长文本摘要裁剪绝不把 😀🚀 切成孤立半代理字符',
    signalSummary: 'query="surrogate emoji safety check" on emoji-dense chunk',
    expectedBehavior:
      'buildFileContentMatch 返回完整可读 snippet，不含任何孤立 UTF-16 surrogate ([\\uD800-\\uDFFF])',
    layers: ['Gemma768d', 'FileContentMatch'],
    codeRefs: ['addon/files/services/file-content-match.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'multimodal-query',
    params: {
      caseKey: 'emoji-surrogate-safety',
      query: 'surrogate emoji safety check',
      expectFileRelPath: 'Documents/notes/release-milestone-emoji.md'
    }
  },
  {
    id: '#059',
    index: 59,
    categoryId: 'cat-06',
    title: 'HEIC-in-JPG 归一化图片向量二进制持久闭环：搜 "海边落日风景照" 经 Float32 BLOB 解码命中',
    signalSummary:
      'query="海边落日风景照" -> encodeVectorBlob/readStoredVector -> IMG_HEIC_7731.JPG',
    expectedBehavior: '3,072B Float32 BLOB 无损解码命中 Pictures/IMG_HEIC_7731.JPG',
    layers: ['Gemma768d', 'VectorBlobCodec', 'MultimodalImage'],
    codeRefs: ['db/embedding-vector-codec.ts', 'addon/files/embedding-service.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'multimodal-query',
    params: {
      caseKey: 'visual-image-search',
      query: '海边落日风景照',
      expectFileRelPath: 'Pictures/IMG_HEIC_7731.JPG'
    }
  },
  {
    id: '#060',
    index: 60,
    categoryId: 'cat-06',
    title: '零输入剪贴板复制 pnpm 依赖报错码开框，跨模态主动推荐刚截屏保存的终端报错图',
    signalSummary:
      'clipboard="ERR_PNPM_PEER_DEP_ISSUES" -> Pictures/Screenshots/pnpm-peer-dep-screen.png',
    expectedBehavior: '剪贴板错误码经 Gemma 同空间匹配召回截图 pnpm-peer-dep-screen.png',
    layers: ['RecommendationEngine', 'FileRecommendationBridge', 'Gemma768d'],
    codeRefs: ['recommendation/recommendation-semantic-scorer.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'zero-input',
    params: {
      caseKey: 'clipboard-semantic-recall',
      clipboardText: 'ERR_PNPM_PEER_DEP_ISSUES',
      expectFileRelPath: 'Pictures/Screenshots/pnpm-peer-dep-screen.png'
    }
  },

  // =========================================================================
  // Category 7 (#061–#070): 极速文件名、多音字拼音与乱序缩写直达 (NativeFileArena)
  // =========================================================================
  {
    id: '#061',
    index: 61,
    categoryId: 'cat-07',
    title: '多音字首字母 "cq" 极速直达《重庆分支机构预算.xlsx》并返回精确 UTF-16 高亮 (<5ms)',
    signalSummary: 'NativeFileArena.search("cq")',
    expectedBehavior: '耗时 <5ms 命中 重庆分支机构预算.xlsx，matchedRanges 包含 [0, 2]',
    layers: ['NativeFileArena'],
    codeRefs: ['packages/tuff-native/native-file-index/src/scorer.rs'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'arena-fastpath',
    params: {
      caseKey: 'arena-query',
      query: 'cq',
      expectName: '重庆分支机构预算.xlsx',
      expectFirstRange: [0, 2],
      maxDurationMs: 15
    }
  },
  {
    id: '#062',
    index: 62,
    categoryId: 'cat-07',
    title: '同一多音字异读 "zq" (重=zhòng) 同样直达《重庆分支机构预算.xlsx》',
    signalSummary: 'NativeFileArena.search("zq")',
    expectedBehavior: 'Rust 多音字表兼容双读音，命中 重庆分支机构预算.xlsx',
    layers: ['NativeFileArena'],
    codeRefs: ['packages/tuff-native/native-file-index/src/pinyin.rs'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'arena-fastpath',
    params: {
      caseKey: 'arena-query',
      query: 'zq',
      expectName: '重庆分支机构预算.xlsx',
      maxDurationMs: 15
    }
  },
  {
    id: '#063',
    index: 63,
    categoryId: 'cat-07',
    title: '金融多音字 "yh" (银行 yín háng) 极速命中《招商银行对公账户回单.pdf》',
    signalSummary: 'NativeFileArena.search("yh")',
    expectedBehavior: '命中 招商银行对公账户回单.pdf (<5ms)',
    layers: ['NativeFileArena'],
    codeRefs: ['packages/tuff-native/native-file-index/src/pinyin.rs'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'arena-fastpath',
    params: {
      caseKey: 'arena-query',
      query: 'yh',
      expectName: '招商银行对公账户回单.pdf',
      maxDurationMs: 15
    }
  },
  {
    id: '#064',
    index: 64,
    categoryId: 'cat-07',
    title: '行业多音字 "tx" (同行 tóng xíng) 极速命中《同行竞品评测报告.md》',
    signalSummary: 'NativeFileArena.search("tx")',
    expectedBehavior: '命中 同行竞品评测报告.md (<5ms)',
    layers: ['NativeFileArena'],
    codeRefs: ['packages/tuff-native/native-file-index/src/pinyin.rs'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'arena-fastpath',
    params: {
      caseKey: 'arena-query',
      query: 'tx',
      expectName: '同行竞品评测报告.md',
      maxDurationMs: 15
    }
  },
  {
    id: '#065',
    index: 65,
    categoryId: 'cat-07',
    title:
      '连字符首字母缩写 "fpnis" 经 Smith-Waterman 边界加分直达 file-provider-native-index-service.ts',
    signalSummary: 'NativeFileArena.search("fpnis")',
    expectedBehavior: '零分配 ASCII 快速路径 <5ms 首位命中 file-provider-native-index-service.ts',
    layers: ['NativeFileArena'],
    codeRefs: ['packages/tuff-native/native-file-index/src/fzf.rs'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'arena-fastpath',
    params: {
      caseKey: 'arena-query',
      query: 'fpnis',
      expectName: 'file-provider-native-index-service.ts',
      maxDurationMs: 15
    }
  },
  {
    id: '#066',
    index: 66,
    categoryId: 'cat-07',
    title: '文档首字母缩写 "cbmo" 命中 corebox-meta-overlay-contracts.md 且分值高于散乱子序列',
    signalSummary: 'NativeFileArena.search("cbmo")',
    expectedBehavior:
      'corebox-meta-overlay-contracts.md 排在第 1 位，高于 december_lemon_notes.txt',
    layers: ['NativeFileArena'],
    codeRefs: ['packages/tuff-native/native-file-index/src/fzf.rs'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'arena-fastpath',
    params: {
      caseKey: 'arena-rank-order',
      query: 'cbmo',
      expectHigherName: 'corebox-meta-overlay-contracts.md',
      expectLowerName: 'december_lemon_notes.txt'
    }
  },
  {
    id: '#067',
    index: 67,
    categoryId: 'cat-07',
    title: '空查询 + 后缀过滤 extensions=[".pdf"] 毫秒级按修改时间倒序返回最近 PDF',
    signalSummary: 'NativeFileArena.search("", { extensions: [".pdf"], typeFilter: "file" })',
    expectedBehavior: '返回结果全部为 .pdf 且刚下载的 2026-Q4-OKR-final.pdf 位列第 1',
    layers: ['NativeFileArena'],
    codeRefs: ['packages/tuff-native/native-file-index/src/scorer.rs'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'arena-fastpath',
    params: {
      caseKey: 'arena-ext-recency',
      extension: '.pdf',
      expectTopName: '2026-Q4-OKR-final.pdf'
    }
  },
  {
    id: '#068',
    index: 68,
    categoryId: 'cat-07',
    title: '空查询 + typeFilter="folder" 精确返回工作区文件夹并排除普通文件',
    signalSummary: 'NativeFileArena.search("", { typeFilter: "folder" })',
    expectedBehavior: '返回条目全部满足 isDir === true 且包含 Documents / Downloads 目录',
    layers: ['NativeFileArena'],
    codeRefs: ['packages/tuff-native/native-file-index/src/scorer.rs'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'arena-fastpath',
    params: {
      caseKey: 'arena-folder-filter'
    }
  },
  {
    id: '#069',
    index: 69,
    categoryId: 'cat-07',
    title: 'O(1) 路径存在性探针 hasPath：微秒级区分已索引路径与不存在路径',
    signalSummary: 'arena.hasPath(existing) === true && arena.hasPath(missing) === false',
    expectedBehavior: '零磁盘系统调用完成精确路径哈希核验，单次耗时远低于 1ms',
    layers: ['NativeFileArena'],
    codeRefs: ['packages/tuff-native/native-file-index/src/arena.rs'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'arena-fastpath',
    params: {
      caseKey: 'arena-has-path'
    }
  },
  {
    id: '#070',
    index: 70,
    categoryId: 'cat-07',
    title: '二进制快照 TUFFIDX3 持久化重装与旧版魔数安全拒绝契约',
    signalSummary: 'saveSnapshot -> loadSnapshot parity + reject TUFFIDX2',
    expectedBehavior:
      '重载后文件总数、hasPath 与多音字检索 100% 一致，旧魔数快照抛出版本错误触发重建',
    layers: ['NativeFileArena', 'TUFFIDX3'],
    codeRefs: ['packages/tuff-native/native-file-index/src/snapshot.rs'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'arena-fastpath',
    params: {
      caseKey: 'arena-snapshot-roundtrip'
    }
  },

  // =========================================================================
  // Category 8 (#071–#080): 实时文件系统增量及时性与幽灵清理
  // =========================================================================
  {
    id: '#071',
    index: 71,
    categoryId: 'cat-08',
    title: '刚下载到 Downloads 仅 3 秒的 PDF (未入 SQLite) 开框即时进入 newly-added 推荐',
    signalSummary: 'Downloads/2026-Q4-OKR-final.pdf (ctime=now-3s, Arena-only)',
    expectedBehavior:
      'collectNewlyAddedFileItems 联合 Bridge.listRecentFiles 召回并赋予 newly-added 新鲜度加成',
    layers: ['RecommendationEngine', 'FileRecommendationBridge', 'NativeFileArena'],
    codeRefs: [
      'recommendation/recommendation-catalog-candidates.ts',
      'addon/files/services/file-provider-recommendation-bridge-impl.ts'
    ],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'fs-realtime',
    params: {
      caseKey: 'fresh-download-3s',
      expectFileRelPath: 'Downloads/2026-Q4-OKR-final.pdf'
    }
  },
  {
    id: '#072',
    index: 72,
    categoryId: 'cat-08',
    title: '未下载完的 .crdownload 临时文件与 0 字节空文件被准入器严格拦截',
    signalSummary: 'Downloads/large-model.gguf.crdownload & empty-placeholder.md (size=0)',
    expectedBehavior: 'isRecommendableNewFile 返回 false，零半成品或空占位文件混入推荐位',
    layers: ['FileRecommendationAdmission'],
    codeRefs: ['recommendation/file-recommendation-admission.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'fs-realtime',
    params: {
      caseKey: 'reject-crdownload-and-empty'
    }
  },
  {
    id: '#073',
    index: 73,
    categoryId: 'cat-08',
    title: 'FSEvents 新建文件 applyDelta 增量同步后，毫秒级可搜且 Bridge 立即可查',
    signalSummary: 'write disk + arena.applyDelta([upsert]) -> search & lookupFilesByPaths',
    expectedBehavior:
      '无需全盘重扫，新建的 live-hotfix-note.md 即刻被 hasPath、search 与 Bridge 命中',
    layers: ['NativeFileArena', 'FileRecommendationBridge'],
    codeRefs: ['packages/tuff-native/native-file-index/src/arena.rs'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'fs-realtime',
    params: {
      caseKey: 'delta-live-create'
    }
  },
  {
    id: '#074',
    index: 74,
    categoryId: 'cat-08',
    title: '文件重命名增量同步：旧路径立即下线零残留，新文件名毫秒级可检索可重建',
    signalSummary: 'rename draft-v1.md -> architecture-final-v2.md + applyDelta',
    expectedBehavior: '旧路径 hasPath=false 且推荐重建自动剔除，新路径可搜且可重建为有效 TuffItem',
    layers: ['NativeFileArena', 'FileRecommendationBridge', 'FileRecommendationSource'],
    codeRefs: ['recommendation/file-recommendation-source.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'fs-realtime',
    params: {
      caseKey: 'delta-live-rename'
    }
  },
  {
    id: '#075',
    index: 75,
    categoryId: 'cat-08',
    title: 'SQLite 已入库高频文件从磁盘物理删除后，推荐重建自动静默剔除零幽灵卡片',
    signalSummary: 'unlink SQLite-indexed file -> createFileRecommendationSource.rebuild',
    expectedBehavior:
      'normalizeTuffItemLocalAssets({ dropMissingFile: true }) 过滤已删文件，返回空列表而非坏图标',
    layers: ['FileRecommendationSource', 'LocalRenderableAssets'],
    codeRefs: ['recommendation/file-recommendation-source.ts', 'utils/local-renderable-assets.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'fs-realtime',
    params: {
      caseKey: 'drop-deleted-sqlite-file'
    }
  },
  {
    id: '#076',
    index: 76,
    categoryId: 'cat-08',
    title: '仅存于 NativeFileArena 的冷文件物理删除前后闭环：存在时可重建，删除后零幽灵残留',
    signalSummary: 'Arena-only file rebuild before unlink vs after unlink',
    expectedBehavior: '删除前经 Bridge 重建返回 1 张卡片，删除后 fs.lstat 复核失败返回 0 张卡片',
    layers: ['FileRecommendationSource', 'FileRecommendationBridge', 'NativeFileArena'],
    codeRefs: [
      'recommendation/file-recommendation-source.ts',
      'addon/files/services/file-provider-recommendation-bridge-impl.ts'
    ],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'fs-realtime',
    params: {
      caseKey: 'drop-deleted-arena-file'
    }
  },
  {
    id: '#077',
    index: 77,
    categoryId: 'cat-08',
    title: '整棵子目录删除 applyDelta(removedPrefixes) 批量清空目录下所有已索引文件',
    signalSummary: 'arena.applyDelta([], [], [removedSubtreePrefix])',
    expectedBehavior: '子目录内多层级文件一次性设置墓碑，hasPath 与 search 均返回零残留',
    layers: ['NativeFileArena'],
    codeRefs: ['packages/tuff-native/native-file-index/src/arena.rs'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'fs-realtime',
    params: {
      caseKey: 'delta-remove-prefix-subtree'
    }
  },
  {
    id: '#078',
    index: 78,
    categoryId: 'cat-08',
    title: '外部符号链接越权与死循环防护：软链指向敏感文件或自环目录时被扫描器与 Bridge 双重拒绝',
    signalSummary: 'symlink -> /etc/hosts & directory loop under workspace',
    expectedBehavior: 'FSOPT_NOFOLLOW 与 Bridge lstat !isSymbolicLink() 均拒绝返回符号链接条目',
    layers: ['NativeFileArena', 'FileRecommendationBridge'],
    codeRefs: [
      'packages/tuff-native/native-file-index/src/scanner_io.rs',
      'addon/files/services/file-provider-recommendation-bridge-impl.ts'
    ],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'fs-realtime',
    params: {
      caseKey: 'reject-symlinks'
    }
  },
  {
    id: '#079',
    index: 79,
    categoryId: 'cat-08',
    title:
      '上下文相关目录精准隔离：过滤含 Cargo.toml 项目的 target/ 产物但保留用户 sales-target/ 文档',
    signalSummary:
      'rust-proj/target/out.bin excluded vs Documents/sales-target/2026-plan.xlsx kept',
    expectedBehavior:
      'NativeFileArena 屏蔽项目构建目录 target，同时完整保留非代码目录 sales-target 下的预算表',
    layers: ['NativeFileArena', 'NativeScanPolicy'],
    codeRefs: [
      'packages/tuff-native/native-file-index/src/scanner.rs',
      'addon/files/services/native-index/native-scan-policy.ts'
    ],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'fs-realtime',
    params: {
      caseKey: 'context-dependent-target-dir'
    }
  },
  {
    id: '#080',
    index: 80,
    categoryId: 'cat-08',
    title: '全链路工程噪音屏蔽：node_modules / .git / .DS_Store 在扫描、过滤与新文件准入全被拦截',
    signalSummary: 'node_modules/pkg/index.js, .git/config, .DS_Store',
    expectedBehavior: 'FileFilterService 与 isRecommendableNewFile 100% 拒绝全部三类系统/依赖噪音',
    layers: ['FileFilterService', 'FileRecommendationAdmission'],
    codeRefs: [
      'packages/utils/common/file-filter-service.ts',
      'recommendation/file-recommendation-admission.ts'
    ],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'fs-realtime',
    params: {
      caseKey: 'noise-filter-consistency'
    }
  },

  // =========================================================================
  // Category 9 (#081–#090): 混合检索融合排序与探索多样性控制
  // =========================================================================
  {
    id: '#081',
    index: 81,
    categoryId: 'cat-09',
    title:
      '同量纲混合排序阶梯：主文件名精确匹配 (420) > Gemma 高置信语义召回 (368) > 纯后缀匹配 (40)',
    signalSummary: 'tuffSorter on exact-stem vs semantic(0.92) vs extension-only',
    expectedBehavior: '精确文件名排第 1，Gemma 语义命中排第 2，纯后缀弱匹配排第 3',
    layers: ['TuffSorter', 'Gemma768d'],
    codeRefs: ['search-engine/sort/tuff-sorter.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'hybrid-ranking',
    params: {
      caseKey: 'sorter-stem-semantic-ext-ladder'
    }
  },
  {
    id: '#082',
    index: 82,
    categoryId: 'cat-09',
    title: '高相关语义文档超越弱子串噪音：Gemma 0.88 命中 (match=352) 排在偶然子串匹配 (150) 之前',
    signalSummary: 'semantic confidence=0.88 vs substring match=150',
    expectedBehavior: 'Gemma 语义候选在未选中结果时插入弱子串噪音之前 (#B1 默认排序补正)',
    layers: ['TuffSorter', 'Gemma768d'],
    codeRefs: ['search-engine/sort/tuff-sorter.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'hybrid-ranking',
    params: {
      caseKey: 'sorter-semantic-beats-weak-substring'
    }
  },
  {
    id: '#083',
    index: 83,
    categoryId: 'cat-09',
    title: '同分候选行为学习与前缀补全提权：真实使用频次 + meta.completion (<=1.5x) 助推常用项居首',
    signalSummary:
      'equal prefix matchScore=250, itemA has completion(count=5)+usage vs itemB unused',
    expectedBehavior: 'tuffSorter 消费 meta.completion 与 usageStats，itemA 稳居 itemB 之前 (#B2)',
    layers: ['TuffSorter'],
    codeRefs: ['search-engine/sort/tuff-sorter.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'hybrid-ranking',
    params: {
      caseKey: 'sorter-completion-and-usage-boost'
    }
  },
  {
    id: '#084',
    index: 84,
    categoryId: 'cat-09',
    title: '剪贴板文件扩展名与目录亲和度提权：复制 .xlsx 路径时候选池内同类表格文件获得易变层加分',
    signalSummary: 'clipboard="/workspace/Documents/finance/raw.xlsx" (fileExtension=xlsx)',
    expectedBehavior:
      'matchClipboardContent 为同目录/同扩展名的 .xlsx 文件候选赋予正向亲和加分超越无关文件',
    layers: ['RecommendationEngine', 'VolatileMatcher'],
    codeRefs: ['recommendation/volatile-context-matcher.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'hybrid-ranking',
    params: {
      caseKey: 'volatile-file-extension-affinity'
    }
  },
  {
    id: '#085',
    index: 85,
    categoryId: 'cat-09',
    title:
      '新装应用四象限双门禁：仅 installedAt<=7d 且 ctime<=7d 赋予新装探索分，拦截自更新与旧机首扫',
    signalSummary: '4 apps across (installedAt recent/old) x (ctime recent/old)',
    expectedBehavior: '唯有双门禁皆在 7 天内的真新装应用进入 newly-installed，其余三象限零误报',
    layers: ['RecommendationEngine', 'CatalogCandidates'],
    codeRefs: ['recommendation/recommendation-catalog-candidates.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'hybrid-ranking',
    params: {
      caseKey: 'four-quadrant-newly-installed-gate'
    }
  },
  {
    id: '#086',
    index: 86,
    categoryId: 'cat-09',
    title:
      '新装探索向习惯平滑交棒：首次真实执行 (executeCount=1) 后卸下 9e5 新鲜度分交由 frecency 排序',
    signalSummary: 'fresh install executeCount=0 (9e5) vs executeCount=1 (handoff to behavior)',
    expectedBehavior:
      '未打开的新装应用获 ~9e5 探索分；一旦打开过 1 次即退出未用新装通道，不压制高频习惯应用',
    layers: ['RecommendationEngine'],
    codeRefs: ['recommendation/recommendation-engine.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'hybrid-ranking',
    params: {
      caseKey: 'novelty-to-frecency-handoff'
    }
  },
  {
    id: '#087',
    index: 87,
    categoryId: 'cat-09',
    title: '非冷启动探索预算门禁 (EXPLORATION_LIMIT=1)：有历史习惯时最多放行 1 个未使用新项防刷屏',
    signalSummary: 'user has established habits + 3 fresh unused apps + 2 new files',
    expectedBehavior: 'admitExplorationWithinBudget 严格裁剪未使用探索项 <= 1 个',
    layers: ['RecommendationEngine', 'CatalogCandidates'],
    codeRefs: ['recommendation/recommendation-catalog-candidates.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'hybrid-ranking',
    params: {
      caseKey: 'exploration-limit-one'
    }
  },
  {
    id: '#088',
    index: 88,
    categoryId: 'cat-09',
    title: '宿主内置目标指令搜索意图置顶：搜 "打开主窗口" 触发 6.5e6 意图加分排在普通应用之前',
    signalSummary: 'query="打开主窗口" -> app-destination-provider:main-window',
    expectedBehavior:
      'resolveAppDestinationQuery 命中别名，main-window 获得 6_500_000 意图奖励居第 1',
    layers: ['TuffSorter', 'AppDestinations'],
    codeRefs: ['search-engine/sort/tuff-sorter.ts', 'shared/app-destinations.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'hybrid-ranking',
    params: {
      caseKey: 'destination-query-intent-bonus'
    }
  },
  {
    id: '#089',
    index: 89,
    categoryId: 'cat-09',
    title: '同类型 40% 多样性配额与防半空回填 (#672)：异构充足时让渡槽位，纯应用池时回填满额 10 项',
    signalSummary: 'limit=10, maxPerType=4 when mixed vs backfill to 10 when homogeneous',
    expectedBehavior: '混合池前排包含应用+文件多元结果，纯应用池不丢弃后半截仍完整返回 10 项',
    layers: ['RecommendationEngine'],
    codeRefs: ['recommendation/recommendation-engine.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'hybrid-ranking',
    params: {
      caseKey: 'diversity-quota-and-backfill'
    }
  },
  {
    id: '#090',
    index: 90,
    categoryId: 'cat-09',
    title:
      '缓存快照与易变层幂等重排：命中内存缓存时切换剪贴板，不累加旧分且即时更新 Gemma 语义文件',
    signalSummary: 'pass 1: code clipboard -> pass 2 (memory cache hit): SQLITE_BUSY clipboard',
    expectedBehavior:
      '第 2 次命中缓存但重新计算 volatileScore 不膨胀，且即时浮现 sqlite-wal-busy-tuning.md',
    layers: ['RecommendationEngine', 'FileRecommendationBridge', 'Gemma768d'],
    codeRefs: [
      'recommendation/recommendation-engine.ts',
      'recommendation/recommendation-semantic-scorer.ts'
    ],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'hybrid-ranking',
    params: {
      caseKey: 'cached-volatile-idempotent-semantic-switch'
    }
  },

  // =========================================================================
  // Category 10 (#091–#100): 资源受限、冷热分层预算与隐私安全边界
  // =========================================================================
  {
    id: '#091',
    index: 91,
    categoryId: 'cat-10',
    title:
      '低电量移动办公模式 (battery<=25%)：压制重型 IDE/修图软件 (-16) 并提权轻量编辑器/终端 (+8)',
    signalSummary: 'powerMode="battery", batteryLevel=18, equal base score VS Code vs Sublime Text',
    expectedBehavior: 'Sublime Text / iTerm2 排在 VS Code / Figma 之前',
    layers: ['RecommendationEngine', 'VolatileMatcher'],
    codeRefs: ['recommendation/volatile-context-matcher.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'resource-security',
    params: {
      caseKey: 'low-battery-lightweight-boost'
    }
  },
  {
    id: '#092',
    index: 92,
    categoryId: 'cat-10',
    title:
      '断网离线环境感知 (isOnline=false)：自动降权纯浏览器与下载工具 (-25)，优先本地生产力应用',
    signalSummary: 'systemState.isOnline=false, Chrome vs Sublime Text equal base score',
    expectedBehavior: 'Chrome 承受 -25 离线降权排在本地编辑器之后',
    layers: ['RecommendationEngine', 'VolatileMatcher'],
    codeRefs: ['recommendation/volatile-context-matcher.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'resource-security',
    params: {
      caseKey: 'offline-browser-demote'
    }
  },
  {
    id: '#093',
    index: 93,
    categoryId: 'cat-10',
    title:
      '专注与勿扰模式开启 (focusMode="active")：压制社交娱乐应用 (-20) 并提权开发写作工具 (+12)',
    signalSummary: 'focusMode="active", isDNDEnabled=true, WeChat/Spotify vs VS Code/iTerm2',
    expectedBehavior: 'VS Code / iTerm2 获得专注提权，WeChat / Spotify 被压制在后',
    layers: ['RecommendationEngine', 'VolatileMatcher'],
    codeRefs: ['recommendation/volatile-context-matcher.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'resource-security',
    params: {
      caseKey: 'focus-dnd-entertainment-suppress'
    }
  },
  {
    id: '#094',
    index: 94,
    categoryId: 'cat-10',
    title:
      '10 万文件冷热双层存储预算实证：100K Arena 路径 + 3,000 热文档 Gemma 向量总计远低于 80 MiB',
    signalSummary: '100K NativeFileArena + 3,000 x 2 chunks x 768d Float32 BLOB vs Legacy 3.17 GiB',
    expectedBehavior:
      '双层总占用 < 45 MiB (严守 < 80 MiB 红线)，较单层全量 SQLite + n-gram 节省 >98% 磁盘体积',
    layers: ['NativeFileArena', 'VectorBlobCodec'],
    codeRefs: [
      'packages/tuff-native/native-file-index/src/arena.rs',
      'db/embedding-vector-codec.ts'
    ],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'resource-security',
    params: {
      caseKey: 'dual-layer-80mib-budget-proof'
    }
  },
  {
    id: '#095',
    index: 95,
    categoryId: 'cat-10',
    title: '768 维向量 Float32 BLOB 紧凑编解码与损坏防御：固定 3,072B 且拒绝错维/NaN/Infinity 数据',
    signalSummary: 'encodeVectorBlob(768d) === 3072B, readStoredVector rejects 512d & NaN',
    expectedBehavior: '二进制体积较 JSON 压缩 >80%，往返误差 <1e-6，异常字节返回 null 零崩溃',
    layers: ['VectorBlobCodec'],
    codeRefs: ['db/embedding-vector-codec.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'resource-security',
    params: {
      caseKey: 'vector-blob-codec-integrity'
    }
  },
  {
    id: '#096',
    index: 96,
    categoryId: 'cat-10',
    title: '剪贴板 API 密钥与私钥主动熔断：复制 sk-proj-... / PEM 私钥时严禁触发 Gemma 向量检索',
    signalSummary:
      'safe query triggers recall (1 call) vs clipboard="OPENAI_API_KEY=sk-proj-..." hard-cuts recall (0 calls)',
    expectedBehavior:
      'containsSensitiveSecret 硬阻断密钥剪贴板使向量调用降为 0 次，同时保留安全应用推荐零泄露',
    layers: ['RecommendationEngine', 'SecretScrubber', 'Gemma768d'],
    codeRefs: ['recommendation/recommendation-semantic-scorer.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'resource-security',
    params: {
      caseKey: 'scrub-clipboard-secret-token'
    }
  },
  {
    id: '#097',
    index: 97,
    categoryId: 'cat-10',
    title: '敏感凭据文件全链路禁入推荐池：.env / ~/.ssh/id_rsa / server.key / cert.pem 100% 剥离',
    signalSummary:
      'bridge returns mixed [.env.production, ~/.ssh/id_rsa, server.key, sqlite-wal-busy-tuning.md]',
    expectedBehavior:
      '敏感凭据文件被准入与易变层彻底过滤，仅安全业务文档 sqlite-wal-busy-tuning.md 进入结果',
    layers: ['RecommendationEngine', 'FileRecommendationAdmission', 'SecretScrubber'],
    codeRefs: [
      'recommendation/file-recommendation-admission.ts',
      'recommendation/recommendation-semantic-scorer.ts'
    ],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'resource-security',
    params: {
      caseKey: 'reject-sensitive-credential-files'
    }
  },
  {
    id: '#098',
    index: 98,
    categoryId: 'cat-10',
    title:
      'ContextSignal 哈希脱敏与持久化缓存隔离：recommendation_cache 绝不落盘剪贴板原文或瞬态语义文件',
    signalSummary:
      'clipboard secret/query -> inspect ContextSignal & persisted recommendation_cache JSON',
    expectedBehavior:
      'ContextSignal 仅含 16 位哈希，瞬态 Gemma 文件仅在最终返回出现而绝不写入持久化缓存',
    layers: ['ContextProvider', 'RecommendationEngine', 'Gemma768d'],
    codeRefs: ['recommendation/context-provider.ts', 'recommendation/recommendation-engine.ts'],
    expectedLegacyPass: false,
    expectedDualLayerPass: true,
    kind: 'resource-security',
    params: {
      caseKey: 'cache-isolation-no-raw-or-volatile-leak'
    }
  },
  {
    id: '#099',
    index: 99,
    categoryId: 'cat-10',
    title:
      '全局 AI 额度触顶暂停与上调即时唤醒：超额时零重试回退本地排序，调整限额后立即恢复语义评分',
    signalSummary:
      'createUsageLimitError(requestsPerDay) -> pause -> notifyUsageLimitsChanged -> resume',
    expectedBehavior:
      '暂停期内跳过远程 embedding 调用零报错返回基础推荐，额度变更通知后立即解除冷却',
    layers: ['RecommendationEngine', 'UsageLimits'],
    codeRefs: [
      'recommendation/recommendation-semantic-scorer.ts',
      'modules/ai/usage-ledger/usage-limits.ts'
    ],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'resource-security',
    params: {
      caseKey: 'ai-usage-limit-pause-and-resume'
    }
  },
  {
    id: '#100',
    index: 100,
    categoryId: 'cat-10',
    title:
      '语义服务慢响应限时与连续 3 次故障熔断：严格在预算内降级返回常用推荐，绝不拖慢或白屏 CoreBox',
    signalSummary: '3 consecutive semantic timeouts/errors -> circuit breaker cooldown',
    expectedBehavior: '慢响应被超时截断，3 次失败后进入 5 分钟冷却零等待直返本地推荐列表',
    layers: ['RecommendationEngine', 'CircuitBreaker'],
    codeRefs: ['recommendation/recommendation-semantic-scorer.ts'],
    expectedLegacyPass: true,
    expectedDualLayerPass: true,
    kind: 'resource-security',
    params: {
      caseKey: 'semantic-timeout-and-circuit-breaker'
    }
  }
]
