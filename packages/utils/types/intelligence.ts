export enum AiProviderType {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  DEEPSEEK = 'deepseek',
  SILICONFLOW = 'siliconflow',
  LOCAL = 'local',
  CUSTOM = 'custom',
}

export enum AiCapabilityType {
  CHAT = 'chat',
  COMPLETION = 'completion',
  EMBEDDING = 'embedding',
  SUMMARIZE = 'summarize',
  TRANSLATE = 'translate',
  TTS = 'tts',
  STT = 'stt',
  VISION = 'vision',
}

export interface AiProviderRateLimit {
  requestsPerMinute?: number
  requestsPerDay?: number
  tokensPerMinute?: number
  tokensPerDay?: number
}

export interface AiVisionImageSource {
  type: 'data-url' | 'file' | 'base64'
  dataUrl?: string
  filePath?: string
  base64?: string
}

export interface AiVisionOcrBlock {
  id?: string
  text: string
  language?: string
  confidence?: number
  boundingBox?: [number, number, number, number]
  polygon?: Array<[number, number]>
  type?: 'word' | 'line' | 'paragraph' | 'region'
  children?: AiVisionOcrBlock[]
}

export interface AiVisionOcrResult {
  text: string
  confidence?: number
  language?: string
  keywords?: string[]
  suggestions?: string[]
  blocks?: AiVisionOcrBlock[]
  raw?: any
}

export interface AiVisionOcrPayload {
  source: AiVisionImageSource
  language?: string
  prompt?: string
  metadata?: Record<string, any>
  includeLayout?: boolean
  includeKeywords?: boolean
}

export interface AiProviderConfig {
  id: string
  type: AiProviderType
  name: string
  enabled: boolean
  apiKey?: string
  baseUrl?: string
  rateLimit?: AiProviderRateLimit
  models?: string[]
  defaultModel?: string
  instructions?: string
  timeout?: number
  priority?: number
  capabilities?: string[]
  metadata?: Record<string, any>
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
  name?: string
}

export interface AiInvokeOptions {
  strategy?: string
  modelPreference?: string[]
  costCeiling?: number
  latencyTarget?: number
  timeout?: number
  stream?: boolean
  preferredProviderId?: string
  allowedProviderIds?: string[]
  metadata?: Record<string, any>
  testRun?: boolean
}

export interface AiInvokeContext {
  source?: string
  locale?: string
  userId?: string
  sessionId?: string
}

export interface AiUsageInfo {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost?: number
}

export interface AiInvokeResult<T = any> {
  result: T
  usage: AiUsageInfo
  model: string
  latency: number
  traceId: string
  provider: string
}

export interface AiStreamChunk {
  delta: string
  done: boolean
  usage?: AiUsageInfo
}

export interface AiCapabilityDescriptor {
  id: string
  type: AiCapabilityType
  name: string
  description: string
  inputSchema?: any
  outputSchema?: any
  defaultStrategy?: string
  supportedProviders: AiProviderType[]
  metadata?: Record<string, any>
}

export interface AiChatPayload {
  messages: AiMessage[]
  context?: AiInvokeContext
  temperature?: number
  maxTokens?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  stop?: string[]
}

export interface AiEmbeddingPayload {
  text: string | string[]
  model?: string
}

export interface AiTranslatePayload {
  text: string
  sourceLang?: string
  targetLang: string
}

export interface AiSummarizePayload {
  text: string
  maxLength?: number
  style?: 'concise' | 'detailed' | 'bullet-points'
}

export interface AiSDKConfig {
  providers: AiProviderConfig[]
  defaultStrategy: string
  enableAudit: boolean
  enableCache: boolean
  cacheExpiration?: number
  capabilities?: Record<string, AiCapabilityRoutingConfig>
}

export interface AiStrategyConfig {
  id: string
  name: string
  type: 'rule-based' | 'adaptive' | 'custom'
  rules?: any
  priority?: number
}

export interface AiAuditLog {
  traceId: string
  timestamp: number
  capabilityId: string
  provider: string
  model: string
  promptHash?: string
  caller?: string
  usage: AiUsageInfo
  latency: number
  success: boolean
  error?: string
}

export interface AiCapabilityProviderBinding {
  providerId: string
  models?: string[]
  priority?: number
  enabled?: boolean
  metadata?: Record<string, any>
}

export interface AiCapabilityRoutingConfig {
  label?: string
  description?: string
  providers: AiCapabilityProviderBinding[]
  promptTemplate?: string
  testResourceDir?: string
  metadata?: Record<string, any>
}

export interface AiSDKPersistedConfig {
  providers: AiProviderConfig[]
  globalConfig: {
    defaultStrategy: string
    enableAudit: boolean
    enableCache: boolean
    cacheExpiration?: number
  }
  capabilities?: Record<string, AiCapabilityRoutingConfig>
  version: number
}

export interface AiProviderAdapter {
  readonly type: AiProviderType
  getConfig: () => AiProviderConfig
  updateConfig: (config: Partial<AiProviderConfig>) => void
  isEnabled: () => boolean
  chat: (payload: AiChatPayload, options: AiInvokeOptions) => Promise<AiInvokeResult<string>>
  chatStream: (
    payload: AiChatPayload,
    options: AiInvokeOptions,
  ) => AsyncGenerator<AiStreamChunk>
  embedding: (payload: AiEmbeddingPayload, options: AiInvokeOptions) => Promise<AiInvokeResult<number[]>>
  translate: (payload: AiTranslatePayload, options: AiInvokeOptions) => Promise<AiInvokeResult<string>>
  visionOcr: (
    payload: AiVisionOcrPayload,
    options: AiInvokeOptions,
  ) => Promise<AiInvokeResult<AiVisionOcrResult>>
}

export interface ProviderManagerAdapter {
  clear: () => void
  registerFromConfig: (config: AiProviderConfig) => AiProviderAdapter
  getEnabled: () => AiProviderAdapter[]
  get: (providerId: string) => AiProviderAdapter | undefined
  createProviderInstance: (config: AiProviderConfig) => AiProviderAdapter
}

export interface AISDKGlobalConfig {
  defaultStrategy: string
  enableAudit: boolean
  enableCache: boolean
  cacheExpiration?: number
  maxRetries?: number
  defaultTimeout?: number
  enableLogging?: boolean
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
  enableCaching?: boolean
  cacheSize?: number
  fallbackStrategy?: 'next-available' | 'fail-fast' | 'round-robin'
  parallelRequests?: boolean
}

export interface TestResult {
  success: boolean
  message?: string
  latency?: number
  timestamp: number
}

export interface AISDKCapabilityConfig {
  id: string
  label: string
  description?: string
  providers: AiCapabilityProviderBinding[]
  promptTemplate?: string
  testResourceDir?: string
  metadata?: Record<string, any>
}

export interface AISDKStorageData {
  providers: AiProviderConfig[]
  globalConfig: AISDKGlobalConfig
  capabilities: Record<string, AISDKCapabilityConfig>
  version: number
}

export const DEFAULT_PROVIDERS: AiProviderConfig[] = [
  {
    id: 'openai-default',
    type: AiProviderType.OPENAI,
    name: 'OpenAI',
    enabled: false,
    priority: 1,
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
    defaultModel: 'gpt-4o-mini',
    timeout: 30000,
    rateLimit: {},
  },
  {
    id: 'anthropic-default',
    type: AiProviderType.ANTHROPIC,
    name: 'Anthropic',
    enabled: false,
    priority: 2,
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    defaultModel: 'claude-3-5-sonnet-20241022',
    timeout: 30000,
    rateLimit: {},
  },
  {
    id: 'deepseek-default',
    type: AiProviderType.DEEPSEEK,
    name: 'DeepSeek',
    enabled: false,
    priority: 2,
    models: ['deepseek-chat', 'deepseek-coder'],
    defaultModel: 'deepseek-chat',
    timeout: 30000,
    rateLimit: {},
  },
  {
    id: 'siliconflow-default',
    type: AiProviderType.SILICONFLOW,
    name: 'SiliconFlow',
    enabled: false,
    priority: 2,
    baseUrl: 'https://api.siliconflow.cn/v1',
    models: [
      'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',
      'tencent/Hunyuan-MT-7B',
      'TeleAI/TeleSpeechASR',
      'THUDM/GLM-4.1V-9B-Thinking',
      'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B',
      'BAAI/bge-reranker-v2-m3',
      'netease-youdao/bce-embedding-base_v1',
      'Kwai-Kolors/Kolors',
      'BAAI/bge-m3',
    ],
    defaultModel: 'deepseek-ai/DeepSeek-R1-0528-Qwen3-8B',
    timeout: 30000,
    rateLimit: {},
  },
  {
    id: 'local-default',
    type: AiProviderType.LOCAL,
    name: 'Local Model',
    enabled: false,
    priority: 3,
    models: [],
    baseUrl: 'http://localhost:11434',
    timeout: 60000,
    rateLimit: {},
  },
]

export const DEFAULT_GLOBAL_CONFIG: AISDKGlobalConfig = {
  defaultStrategy: 'adaptive-default',
  enableAudit: false,
  enableCache: true,
  cacheExpiration: 3600,
}

export const DEFAULT_CAPABILITIES: Record<string, AISDKCapabilityConfig> = {
  'text.chat': {
    id: 'text.chat',
    label: '对话 / Chat',
    description: '默认用于系统对话、翻译、总结等文本任务的模型集合',
    providers: [
      { providerId: 'openai-default', priority: 1, enabled: true },
      { providerId: 'anthropic-default', priority: 2, enabled: true },
      { providerId: 'deepseek-default', priority: 3, enabled: true },
      { providerId: 'siliconflow-default', priority: 4, enabled: true },
    ],
  },
  'embedding.generate': {
    id: 'embedding.generate',
    label: 'Embedding / 向量生成',
    description: '为向量检索/摘要生成 embedding',
    providers: [
      {
        providerId: 'siliconflow-default',
        models: ['netease-youdao/bce-embedding-base_v1', 'BAAI/bge-m3'],
        priority: 1,
        enabled: true,
      },
      {
        providerId: 'openai-default',
        models: ['text-embedding-3-small', 'text-embedding-3-large'],
        priority: 2,
        enabled: false,
      },
    ],
  },
  'vision.ocr': {
    id: 'vision.ocr',
    label: '图像 OCR / Image Recognition',
    description: '识别截图、图片中的文字并生成关键词',
    promptTemplate:
      '你是 OCR 助手，识别图片所有文本，生成 keywords 数组（5 个以内）辅助搜索。',
    testResourceDir: 'intelligence/test-capability/ocr',
    providers: [
      {
        providerId: 'siliconflow-default',
        models: ['deepseek-ai/DeepSeek-OCR', 'THUDM/GLM-4.1V-9B-Thinking'],
        priority: 1,
        enabled: true,
      },
      {
        providerId: 'openai-default',
        models: ['gpt-4o', 'gpt-4o-mini'],
        priority: 2,
        enabled: false,
      },
      {
        providerId: 'anthropic-default',
        models: ['claude-3-5-sonnet-20241022'],
        priority: 3,
        enabled: false,
      },
    ],
  },
  'text.translate': {
    id: 'text.translate',
    label: '翻译 / Translation',
    description: '多语言文本翻译',
    promptTemplate: '你是专业翻译助手。请将以下文本翻译成 {{targetLang}}，只返回译文，不要解释。',
    providers: [
      { providerId: 'deepseek-default', priority: 1, enabled: true },
      { providerId: 'openai-default', priority: 2, enabled: false },
      { providerId: 'anthropic-default', priority: 3, enabled: false },
    ],
  },
  'text.summarize': {
    id: 'text.summarize',
    label: '摘要 / Summarization',
    description: '生成文本内容的简洁摘要',
    promptTemplate: '请用简洁的语言总结以下内容的核心要点，不超过 {{maxLength}} 字。',
    providers: [
      { providerId: 'deepseek-default', priority: 1, enabled: true },
      { providerId: 'openai-default', priority: 2, enabled: false },
      { providerId: 'anthropic-default', priority: 3, enabled: false },
    ],
  },
  'intent.detect': {
    id: 'intent.detect',
    label: '意图识别 / Intent Detection',
    description: '识别用户查询的意图类型（搜索、打开、计算等）',
    promptTemplate: '分析用户输入的意图，返回 JSON 格式：{intent: string, confidence: number, entities: string[]}',
    providers: [
      { providerId: 'deepseek-default', priority: 1, enabled: true },
      { providerId: 'openai-default', priority: 2, enabled: false },
    ],
  },
  'code.generate': {
    id: 'code.generate',
    label: '代码生成 / Code Generation',
    description: '根据需求生成代码片段',
    promptTemplate: '你是编程助手。根据需求生成 {{language}} 代码，包含注释说明。',
    providers: [
      { providerId: 'deepseek-default', models: ['deepseek-coder'], priority: 1, enabled: true },
      { providerId: 'openai-default', models: ['gpt-4o'], priority: 2, enabled: false },
    ],
  },
  'code.explain': {
    id: 'code.explain',
    label: '代码解释 / Code Explanation',
    description: '解释代码的功能和逻辑',
    promptTemplate: '你是编程导师。用通俗易懂的语言解释这段代码的功能、逻辑和关键点。',
    providers: [
      { providerId: 'deepseek-default', models: ['deepseek-coder'], priority: 1, enabled: true },
      { providerId: 'anthropic-default', priority: 2, enabled: false },
    ],
  },
  'content.extract': {
    id: 'content.extract',
    label: '内容提取 / Content Extraction',
    description: '从文本中提取关键信息（日期、人名、地点等）',
    promptTemplate: '从文本中提取关键信息，返回 JSON 格式：{dates: [], people: [], locations: [], keywords: []}',
    providers: [
      { providerId: 'deepseek-default', priority: 1, enabled: true },
      { providerId: 'openai-default', priority: 2, enabled: false },
    ],
  },
  'sentiment.analyze': {
    id: 'sentiment.analyze',
    label: '情感分析 / Sentiment Analysis',
    description: '分析文本的情感倾向（积极/消极/中性）',
    promptTemplate: '分析文本情感倾向，返回 JSON：{sentiment: "positive"|"negative"|"neutral", score: 0-1, keywords: []}',
    providers: [
      { providerId: 'deepseek-default', priority: 1, enabled: true },
      { providerId: 'openai-default', priority: 2, enabled: false },
    ],
  },
  'code.review': {
    id: 'code.review',
    label: '代码审查 / Code Review',
    description: '审查代码，发现潜在问题、最佳实践和改进建议',
    promptTemplate: '作为资深代码审查员，审查以下代码。关注：1) 潜在bug 2) 性能问题 3) 安全隐患 4) 最佳实践 5) 可读性',
    providers: [
      { providerId: 'deepseek-default', models: ['deepseek-coder'], priority: 1, enabled: true },
      { providerId: 'anthropic-default', priority: 2, enabled: false },
      { providerId: 'openai-default', models: ['gpt-4o'], priority: 3, enabled: false },
    ],
  },
  'keywords.extract': {
    id: 'keywords.extract',
    label: '关键词提取 / Keyword Extraction',
    description: '从文本中提取关键词和短语',
    promptTemplate: '从文本中提取最重要的关键词，返回 JSON 数组：{keywords: [{term: string, relevance: number}]}',
    providers: [
      { providerId: 'deepseek-default', priority: 1, enabled: true },
      { providerId: 'openai-default', priority: 2, enabled: false },
    ],
  },
  'audio.transcribe': {
    id: 'audio.transcribe',
    label: '音频转录 / Audio Transcription',
    description: '将语音转换为文字（支持多语言）',
    providers: [
      {
        providerId: 'openai-default',
        models: ['whisper-1'],
        priority: 1,
        enabled: false,
      },
      {
        providerId: 'siliconflow-default',
        models: ['TeleAI/TeleSpeechASR'],
        priority: 2,
        enabled: true,
      },
    ],
  },
  'audio.tts': {
    id: 'audio.tts',
    label: '语音合成 / Text-to-Speech',
    description: '将文字转换为自然语音',
    providers: [
      {
        providerId: 'openai-default',
        models: ['tts-1', 'tts-1-hd'],
        priority: 1,
        enabled: false,
      },
    ],
  },
  'image.caption': {
    id: 'image.caption',
    label: '图像标题 / Image Captioning',
    description: '为图片生成描述性标题',
    promptTemplate: '生成简洁准确的图片描述（中英文），捕捉主要内容和氛围。',
    providers: [
      {
        providerId: 'siliconflow-default',
        models: ['THUDM/GLM-4.1V-9B-Thinking'],
        priority: 1,
        enabled: true,
      },
      {
        providerId: 'openai-default',
        models: ['gpt-4o', 'gpt-4o-mini'],
        priority: 2,
        enabled: false,
      },
      {
        providerId: 'anthropic-default',
        models: ['claude-3-5-sonnet-20241022'],
        priority: 3,
        enabled: false,
      },
    ],
  },
  'image.analyze': {
    id: 'image.analyze',
    label: '图像分析 / Image Analysis',
    description: '深度分析图像内容、物体、场景和上下文',
    promptTemplate: '详细分析图片，包括：物体识别、场景理解、颜色分析、构图评估。返回结构化结果。',
    providers: [
      {
        providerId: 'siliconflow-default',
        models: ['THUDM/GLM-4.1V-9B-Thinking'],
        priority: 1,
        enabled: true,
      },
      {
        providerId: 'openai-default',
        models: ['gpt-4o'],
        priority: 2,
        enabled: false,
      },
      {
        providerId: 'anthropic-default',
        models: ['claude-3-5-sonnet-20241022'],
        priority: 3,
        enabled: false,
      },
    ],
  },
}
