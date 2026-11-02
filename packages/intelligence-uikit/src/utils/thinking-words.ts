/**
 * Wording for a thought that is still running.
 *
 * A single fixed label ("Thinking…") stops carrying information after the first
 * turn: every wait reads the same, however long. The header picks a fresh
 * verb each turn instead, so the wait has a face and the reader can tell one
 * thought from the next at a glance — the same idea as the per-mount orb, which
 * already rolls a different shape for every thought.
 *
 * The verbs describe what is being done, never what will come out: nothing here
 * promises a result.
 */
export const THINKING_VERBS: Readonly<Record<'zh' | 'en', readonly string[]>> = {
  zh: [
    '思考',
    '胶囊化',
    '解析',
    '推理',
    '综合',
    '计算',
    '构想',
    '审议',
    '分析',
    '反思',
    '沉思',
    '处理',
    '蒸馏',
    '探索',
    '头脑风暴',
    '评估',
    '架构',
    '组织',
    '联结',
    '优化',
    '校准',
    '编排',
    '协调',
    '破译',
    '结晶',
    '编织',
    '筛滤',
    '勾勒',
    '追索',
    '解结',
    '聚合',
    '权衡',
    '起草',
    '修剪',
    '穿线',
    '打磨',
    '测绘',
    '分拣',
    '取景',
    '试探',
    '纺纱',
    '编辫',
    '慢炖',
    '锻打',
    '对齐',
    '布线',
    '浸润',
    '驯服',
    '拼图',
    '制图',
    '落锚',
    '雕琢',
    '调音',
    '磨锋',
    '对账',
    '压缩',
    '搭桥',
    '拆结',
    '装配',
    '翻找',
    '收窄',
    '引火',
    '预演',
    '复核',
    '略读',
    '抛光',
    '系缆',
    '归并',
    '滗清',
    '绕线',
    '配平',
    '倒带',
    '剥层',
    '拆分',
    '散列',
    '缓存',
    '建索引',
    '剖析',
    '排程',
    '分流',
    '重放',
    '验证',
    '标注',
    '封箱'
  ],
  en: [
    'Thinking',
    'Capsuling',
    'Resolving',
    'Reasoning',
    'Synthesizing',
    'Computing',
    'Formulating',
    'Deliberating',
    'Analyzing',
    'Reflecting',
    'Pondering',
    'Processing',
    'Distilling',
    'Exploring',
    'Brainstorming',
    'Evaluating',
    'Architecting',
    'Structuring',
    'Connecting',
    'Optimizing',
    'Calibrating',
    'Orchestrating',
    'Harmonizing',
    'Deciphering',
    'Crystallizing',
    'Weaving',
    'Sifting',
    'Sketching',
    'Tracing',
    'Untangling',
    'Gathering',
    'Weighing',
    'Composing',
    'Pruning',
    'Threading',
    'Refining',
    'Mapping',
    'Sorting',
    'Framing',
    'Probing',
    'Spinning',
    'Braiding',
    'Simmering',
    'Forging',
    'Aligning',
    'Plumbing',
    'Steeping',
    'Wrangling',
    'Puzzling',
    'Charting',
    'Anchoring',
    'Sculpting',
    'Tuning',
    'Sharpening',
    'Reconciling',
    'Condensing',
    'Bridging',
    'Untwisting',
    'Assembling',
    'Rummaging',
    'Narrowing',
    'Kindling',
    'Rehearsing',
    'Cross-checking',
    'Skimming',
    'Polishing',
    'Tethering',
    'Merging',
    'Decanting',
    'Winding',
    'Balancing',
    'Rewinding',
    'Peeling',
    'Splitting',
    'Hashing',
    'Caching',
    'Indexing',
    'Profiling',
    'Scheduling',
    'Triaging',
    'Replaying',
    'Verifying',
    'Annotating',
    'Boxing'
  ]
}

/** The most recently handed-out verb per language, so two turns never read the same. */
const lastIndex: Record<'zh' | 'en', number> = { zh: -1, en: -1 }

/**
 * A verb for the next thought, never the one just used. Deterministic hosts
 * (tests, replays) can pass their own source; production leaves it random.
 */
export function rollThinkingVerb(
  locale: string = 'zh',
  random: () => number = Math.random
): string {
  const lang: 'zh' | 'en' = locale.startsWith('zh') ? 'zh' : 'en'
  const verbs = THINKING_VERBS[lang]
  if (verbs.length < 2) return verbs[0] ?? 'Thinking'

  let index = Math.floor(random() * verbs.length)
  if (index === lastIndex[lang]) index = (index + 1) % verbs.length
  lastIndex[lang] = index
  return verbs[index]!
}

/**
 * Roll the next thinking verb during a live thought or waiting phase, ensuring
 * the new verb is strictly different from the current one for dynamic morphing.
 */
export function rollNextThinkingVerb(
  currentVerb?: string,
  locale: string = 'en',
  random: () => number = Math.random
): string {
  const lang: 'zh' | 'en' = locale.startsWith('zh') ? 'zh' : 'en'
  const verbs = THINKING_VERBS[lang]
  if (verbs.length < 2) return verbs[0] ?? 'Thinking'

  let nextIndex = Math.floor(random() * verbs.length)
  if (currentVerb && verbs[nextIndex] === currentVerb) {
    nextIndex = (nextIndex + 1) % verbs.length
  }
  if (nextIndex === lastIndex[lang]) {
    nextIndex = (nextIndex + 1) % verbs.length
  }
  lastIndex[lang] = nextIndex
  return verbs[nextIndex]!
}
