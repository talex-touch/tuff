export const PROVIDER_PROTOCOLS = [
  { key: 'tencent-translation', label: 'Tencent Cloud Translation', vendor: 'tencent-cloud', authType: 'secret_pair', capabilities: ['text.translate', 'image.translate', 'image.translate.e2e'], supportsStreaming: false },
  { key: 'openai-compatible', label: 'OpenAI-compatible Chat Completions', vendor: 'custom', authType: 'api_key', capabilities: ['text.chat', 'chat.completion', 'text.translate', 'text.summarize', 'text.rewrite', 'content.extract', 'keywords.extract', 'intent.detect', 'code.explain', 'code.review', 'vision.ocr'], supportsStreaming: true },
  { key: 'openai-responses', label: 'OpenAI Responses', vendor: 'custom', authType: 'api_key', capabilities: ['text.chat', 'chat.completion', 'text.translate', 'text.summarize', 'text.rewrite', 'content.extract', 'keywords.extract', 'intent.detect', 'code.explain', 'code.review'], supportsStreaming: true },
  { key: 'dashscope-filetrans-asr', label: 'DashScope Filetrans ASR', vendor: 'dashscope', authType: 'api_key', capabilities: ['audio.transcribe'], supportsStreaming: false },
  { key: 'dashscope-qwen-audio-asr', label: 'DashScope Qwen Audio ASR', vendor: 'dashscope', authType: 'api_key', capabilities: ['audio.stt', 'audio.transcribe'], supportsStreaming: false },
  { key: 'local-overlay', label: 'Local Screenshot Overlay', vendor: 'custom', authType: 'none', capabilities: ['overlay.render'], supportsStreaming: false },
] as const

export function resolveProviderProtocol(key: string) {
  return PROVIDER_PROTOCOLS.find(protocol => protocol.key === key)
}

export interface ProductSceneTemplate {
  id: string
  displayName: string
  owner: 'nexus' | 'core-app' | 'app' | 'plugin'
  requiredCapabilities: string[]
  description: string
  meteringPolicy?: Record<string, unknown>
}

export const PRODUCT_SCENE_TEMPLATES: ProductSceneTemplate[] = [
  {
    id: 'corebox.selection.translate',
    displayName: 'CoreBox 划词翻译',
    owner: 'core-app',
    requiredCapabilities: ['text.translate'],
    description: '桌面端选中文本划词翻译',
    meteringPolicy: { units: ['character'] },
  },
  {
    id: 'corebox.screenshot.translate',
    displayName: 'CoreBox 截图翻译',
    owner: 'core-app',
    requiredCapabilities: ['vision.ocr', 'text.translate', 'overlay.render'],
    description: '桌面端截图 OCR 与覆盖翻译渲染',
    meteringPolicy: { units: ['image', 'character'] },
  },
  {
    id: 'nexus.intelligence.chat.completion',
    displayName: 'AI 对话补全 (text.chat)',
    owner: 'nexus',
    requiredCapabilities: ['chat.completion'],
    description: '桌面与网页通用对话问答',
  },
  {
    id: 'nexus.intelligence.text.translate',
    displayName: 'AI 文本翻译',
    owner: 'nexus',
    requiredCapabilities: ['text.translate'],
    description: '通用文本多语言互译',
  },
  {
    id: 'nexus.intelligence.vision.ocr',
    displayName: 'AI 视觉文字识别 (OCR)',
    owner: 'nexus',
    requiredCapabilities: ['vision.ocr'],
    description: '图片文本提取与排版识别',
  },
  {
    id: 'nexus.intelligence.audio.transcribe',
    displayName: '语音听写与转写 (ASR)',
    owner: 'nexus',
    requiredCapabilities: ['audio.transcribe'],
    description: '音频文件与实时语音转写',
  },
  {
    id: 'nexus.intelligence.text.summarize',
    displayName: '文本摘要总结',
    owner: 'nexus',
    requiredCapabilities: ['text.summarize'],
    description: '长文本提炼核心摘要',
  },
  {
    id: 'nexus.intelligence.text.rewrite',
    displayName: '文本润色与改写',
    owner: 'nexus',
    requiredCapabilities: ['text.rewrite'],
    description: '语法纠错、语气优化与专业改写',
  },
  {
    id: 'nexus.intelligence.content.extract',
    displayName: '结构化内容抽取',
    owner: 'nexus',
    requiredCapabilities: ['content.extract'],
    description: '实体、动作与标签结构化抽取',
  },
  {
    id: 'nexus.intelligence.code.explain',
    displayName: '代码解释与分析',
    owner: 'nexus',
    requiredCapabilities: ['code.explain'],
    description: '代码逻辑与结构讲解',
  },
  {
    id: 'nexus.intelligence.code.review',
    displayName: '代码审查与建议',
    owner: 'nexus',
    requiredCapabilities: ['code.review'],
    description: '代码缺陷、安全与规范评审',
  },
  {
    id: 'nexus.intelligence.audio.stt',
    displayName: 'Speech to text',
    owner: 'nexus',
    requiredCapabilities: ['audio.stt'],
    description: 'Synchronous speech recognition',
  },
  {
    id: 'nexus.intelligence.keywords.extract',
    displayName: 'Keyword extraction',
    owner: 'nexus',
    requiredCapabilities: ['keywords.extract'],
    description: 'Extract keywords from text',
  },
  {
    id: 'nexus.intelligence.intent.detect',
    displayName: 'Intent detection',
    owner: 'nexus',
    requiredCapabilities: ['intent.detect'],
    description: 'Classify the intent of text',
  },
  {
    id: 'nexus.intelligence.image.translate.e2e',
    displayName: 'Image translation',
    owner: 'nexus',
    requiredCapabilities: ['image.translate.e2e'],
    description: 'Translate images while preserving their layout',
  },
]
