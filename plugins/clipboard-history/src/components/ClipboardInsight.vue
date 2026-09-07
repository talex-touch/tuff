<script lang="ts" setup>
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import { computed, ref, watch } from 'vue'
import ClipboardGlyph from './ClipboardGlyph.vue'
import {
  getClipboardColorTokens,
  getClipboardOcrInsight,
  getClipboardTextInsight,
} from '~/utils/clipboard-items'
import { describeContrast, parseColor, toColorFormats } from '~/utils/clipboard-colors'
import {
  buildCleanLink,
  detectCommand,
  detectSecret,
  extractLinks,
  getLinkHost,
  parseLinkParams,
  readSecretPlainValue,
  selectClipboardInsight,
} from '~/utils/clipboard-shapes'

const props = defineProps<{
  item: PluginClipboardItem | null
  /** 由详情区那一个开关控制。私钥永远拿不到明文，`readSecretPlainValue` 里也拦了一道。 */
  revealSecret?: boolean
}>()

const emit = defineEmits<{
  (event: 'copyText', value: string): void
  (event: 'openLink', url: string): void
}>()

const kind = computed(() => selectClipboardInsight(props.item))
const textInsight = computed(() => getClipboardTextInsight(props.item))
const colorTokens = computed(() => getClipboardColorTokens(props.item))
const ocrInsight = computed(() => getClipboardOcrInsight(props.item))
const secret = computed(() => detectSecret(props.item?.content))
const command = computed(() => detectCommand(props.item?.content))
const links = computed(() => extractLinks(props.item?.content))

const primaryColor = computed(() => parseColor(colorTokens.value[0]?.value ?? null))
const colorContrast = computed(() => (primaryColor.value ? describeContrast(primaryColor.value) : null))
const colorFormatRows = computed<Array<[string, string]>>(() => {
  if (!primaryColor.value) {
    return []
  }
  const formats = toColorFormats(primaryColor.value)
  return [
    ['HEX', formats.hex],
    ['RGB', formats.rgb],
    ['HSL', formats.hsl],
    ['OKLCH', formats.oklch],
  ]
})

const selectedLink = ref(0)
/**
 * 链接里的敏感 query 参数是另一件事，和密钥值的可见性不共享开关——
 * 否则「想看看这个 utm token」会顺手把密钥也露出来。
 */
const revealParams = ref(false)

watch(
  () => props.item?.id,
  () => {
    selectedLink.value = 0
    revealParams.value = false
  },
)

/** 洞察区「值」那一行在 reveal 时显示的原文。明文只在这里现算，不进 ClipboardSecretInfo。 */
const secretDisplayValue = computed(() => {
  const info = secret.value
  if (!info) {
    return ''
  }
  return props.revealSecret === true ? readSecretPlainValue(info, props.item?.content) : info.masked
})

/** 单链接时不出选择器：主链接的敏感参数单独成行就够了。 */
const primaryLink = computed(() => links.value[selectedLink.value] ?? links.value[0] ?? '')
const primaryParams = computed(() => parseLinkParams(primaryLink.value))
const sensitiveParams = computed(() => primaryParams.value.filter(param => param.sensitive))

function maskParamValue(value: string): string {
  const visible = Math.min(18, Math.max(4, Math.floor(value.length / 2)))
  return `${value.slice(0, visible)}${'•'.repeat(Math.min(8, Math.max(3, value.length - visible)))}`
}
</script>

<template>
  <div v-if="kind !== 'none'" class="insight-section">
    <template v-if="kind === 'link'">
      <div class="insight-title">
        <span>链接</span>
        <span class="insight-meta">
          <template v-if="links.length > 1">发现 {{ links.length }} 个 · ↑↓ 选择 · </template>
          ⏎ 打开 · ⌥⏎ 复制去参链接
        </span>
      </div>

      <div v-if="links.length > 1" class="link-list">
        <button
          v-for="(link, index) in links"
          :key="link"
          class="link-row"
          :class="{ active: index === selectedLink }"
          type="button"
          :title="link"
          @click="selectedLink = index"
          @dblclick="emit('openLink', link)"
        >
          <span class="link-index">{{ index + 1 }}</span>
          <span class="link-text">{{ link }}</span>
          <ClipboardGlyph name="arrow-left" class="link-open" />
        </button>
      </div>

      <div v-else class="kv-row">
        <span class="kv-label">打开</span>
        <button class="kv-value primary" type="button" @click="emit('openLink', primaryLink)">
          <span class="kv-text">{{ getLinkHost(primaryLink) }}</span>
          <ClipboardGlyph name="arrow-left" class="link-open" />
        </button>
      </div>

      <div v-for="param in sensitiveParams" :key="param.key" class="kv-row">
        <span class="kv-label">参数</span>
        <button
          class="kv-value"
          type="button"
          :title="`复制 ${param.key}`"
          @click="emit('copyText', param.value)"
        >
          <span class="kv-text muted">
            {{ param.key }} = {{ revealParams ? param.value : maskParamValue(param.value) }}
          </span>
        </button>
        <button class="kv-toggle" type="button" title="显示 / 隐藏" @click="revealParams = !revealParams">
          <ClipboardGlyph name="eye" />
        </button>
        <span class="kv-tag">敏感</span>
      </div>

      <button
        v-if="sensitiveParams.length > 0"
        class="insight-action"
        type="button"
        @click="emit('copyText', buildCleanLink(primaryLink))"
      >
        复制去参链接
      </button>
    </template>

    <template v-else-if="kind === 'secret' && secret">
      <div class="insight-title">
        <span>密钥</span>
        <span class="insight-meta">
          {{ secret.service }}
          <template v-if="secret.detail"> · {{ secret.detail }}</template>
        </span>
      </div>

      <div class="kv-row">
        <span class="kv-label">值</span>
        <span class="kv-value" :class="{ danger: secret.critical }">
          <span class="kv-text muted">{{ secretDisplayValue }}</span>
        </span>
        <span v-if="secret.critical" class="kv-tag danger">高危</span>
      </div>

      <div class="kv-row">
        <span class="kv-label">长度</span>
        <span class="kv-value">
          <span class="kv-text">{{ secret.length }} 字符</span>
        </span>
      </div>

      <p class="insight-note">
        <template v-if="secret.kind === 'private-key'">
          私钥内容不在界面上呈现，也不会写入分享内容。
        </template>
        <template v-else>
          默认掩码；复制时写入的是完整值，请确认粘贴目标。
        </template>
      </p>
    </template>

    <template v-else-if="kind === 'command' && command">
      <div class="insight-title">
        <span>命令</span>
        <span class="insight-meta">⌥⏎ 复制</span>
      </div>

      <div class="kv-row">
        <span class="kv-label">程序</span>
        <span class="kv-value"><span class="kv-text">{{ command.program }}</span></span>
      </div>

      <div v-if="command.args" class="kv-row">
        <span class="kv-label">参数</span>
        <span class="kv-value"><span class="kv-text">{{ command.args }}</span></span>
      </div>

      <div v-if="command.pipe" class="kv-row">
        <span class="kv-label">管道</span>
        <span class="kv-value"><span class="kv-text">{{ command.pipe }}</span></span>
      </div>

      <div v-if="command.dangers.length > 0 || command.containsCredential" class="kv-row">
        <span class="kv-label">风险</span>
        <span class="kv-value danger">
          <span class="kv-text">
            {{ [...command.dangers, command.containsCredential ? '请求头含凭据' : ''].filter(Boolean).join(' · ') }}
          </span>
        </span>
        <span class="kv-tag danger">高危</span>
      </div>
    </template>

    <template v-else-if="kind === 'color'">
      <div class="insight-title">
        <span>颜色</span>
        <span class="insight-meta">
          点击任意格式复制
          <template v-if="colorContrast">
            · 黑字 {{ colorContrast.black.ratio }}:1 {{ colorContrast.black.level }}
          </template>
        </span>
      </div>

      <div v-for="[label, value] in colorFormatRows" :key="label" class="kv-row">
        <span class="kv-label wide">{{ label }}</span>
        <button class="kv-value" type="button" :title="`复制 ${value}`" @click="emit('copyText', value)">
          <span class="kv-text">{{ value }}</span>
        </button>
      </div>

      <div v-if="colorContrast" class="kv-row">
        <span class="kv-label wide">对比度</span>
        <span class="contrast-chip">
          黑字 {{ colorContrast.black.ratio }}:1
          <b :class="{ fail: colorContrast.black.level === '不达标' }">{{ colorContrast.black.level }}</b>
        </span>
        <span class="contrast-chip">
          白字 {{ colorContrast.white.ratio }}:1
          <b :class="{ fail: colorContrast.white.level === '不达标' }">{{ colorContrast.white.level }}</b>
        </span>
      </div>

      <div v-if="colorTokens.length > 1" class="color-grid">
        <button
          v-for="color in colorTokens"
          :key="color.value"
          class="color-chip"
          type="button"
          :title="color.label"
          @click="emit('copyText', color.label)"
        >
          <span class="color-swatch" :style="{ backgroundColor: color.value }" />
          <span class="color-label">{{ color.label }}</span>
        </button>
      </div>
    </template>

    <template v-else-if="kind === 'words' && textInsight">
      <div class="insight-title">
        <span>拆词</span>
        <span class="insight-meta">点击任意项复制</span>
      </div>
      <div v-if="textInsight.wordTokens.length > 0" class="word-row">
        <button
          v-for="word in textInsight.wordTokens"
          :key="word"
          class="word-chip"
          type="button"
          :title="`复制 ${word}`"
          @click="emit('copyText', word)"
        >
          {{ word }}
        </button>
      </div>
      <span v-else class="insight-empty">无可拆分词</span>
    </template>

    <template v-else-if="kind === 'ocr' && ocrInsight">
      <div class="insight-title">
        <span>OCR</span>
        <span class="insight-meta">
          {{ ocrInsight.statusLabel }}
          <template v-if="ocrInsight.language"> · {{ ocrInsight.language }}</template>
          <template v-if="ocrInsight.confidence"> · {{ ocrInsight.confidence }}</template>
        </span>
      </div>
      <button
        v-if="ocrInsight.displayText"
        class="ocr-text"
        type="button"
        title="复制 OCR 文本"
        @click="emit('copyText', ocrInsight.displayText)"
      >
        {{ ocrInsight.displayText }}
      </button>
      <div v-if="ocrInsight.keywords.length > 0" class="keyword-row">
        <button
          v-for="keyword in ocrInsight.keywords"
          :key="keyword"
          class="keyword-chip"
          type="button"
          :title="`复制 ${keyword}`"
          @click="emit('copyText', keyword)"
        >
          {{ keyword }}
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.insight-section {
  display: grid;
  gap: 7px;
  padding: 10px 14px 0;
  margin-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--clipboard-border-color) 45%, transparent);
}

.insight-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  color: var(--clipboard-text-primary);
  font-size: 0.78rem;
  font-weight: 700;
}

.insight-meta {
  min-width: 0;
  color: var(--clipboard-text-muted);
  font-size: 0.72rem;
  font-weight: 500;
  text-align: right;
}

.insight-note {
  margin: 0;
  color: var(--clipboard-text-muted);
  font-size: 0.7rem;
}

.insight-action {
  justify-self: start;
  height: 26px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--clipboard-surface-base) 86%, transparent);
  color: var(--clipboard-text-secondary);
  cursor: pointer;
  font-size: 0.72rem;
}

.insight-action:hover {
  border-color: color-mix(in srgb, var(--clipboard-color-accent) 55%, transparent);
  color: var(--clipboard-color-accent);
}

.kv-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.kv-label {
  width: 40px;
  flex: none;
  color: var(--clipboard-text-muted);
  font-size: 0.72rem;
}

.kv-label.wide {
  width: 52px;
  flex: none;
  color: var(--clipboard-text-muted);
  font-size: 0.72rem;
}

.kv-value {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--clipboard-surface-base) 86%, transparent);
  color: var(--clipboard-text-primary);
  font-size: 0.74rem;
  text-align: left;
}

button.kv-value {
  cursor: pointer;
}

button.kv-value:hover {
  border-color: color-mix(in srgb, var(--clipboard-color-accent) 55%, transparent);
}

.kv-value.primary {
  height: 30px;
  border-color: color-mix(in srgb, var(--clipboard-color-accent) 45%, transparent);
  background: color-mix(in srgb, var(--clipboard-color-accent) 12%, transparent);
}

.kv-value.danger {
  border-color: color-mix(in srgb, var(--clipboard-color-danger) 45%, transparent);
  background: color-mix(in srgb, var(--clipboard-color-danger) 10%, transparent);
}

.kv-text {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.kv-text.muted {
  color: var(--clipboard-text-muted);
}

.kv-toggle {
  width: 24px;
  height: 24px;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--clipboard-text-muted);
  cursor: pointer;
}

.kv-toggle .ClipboardGlyph {
  width: 14px;
  height: 14px;
}

.kv-tag {
  flex: none;
  padding: 3px 8px;
  border: 1px solid color-mix(in srgb, var(--clipboard-color-accent) 32%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--clipboard-color-accent) 10%, transparent);
  color: var(--clipboard-color-accent);
  font-size: 0.66rem;
  font-weight: 600;
}

.kv-tag.danger {
  border-color: color-mix(in srgb, var(--clipboard-color-danger) 40%, transparent);
  background: color-mix(in srgb, var(--clipboard-color-danger) 12%, transparent);
  color: var(--clipboard-color-danger);
}

.contrast-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 24px;
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
  border-radius: 6px;
  background: color-mix(in srgb, var(--clipboard-surface-base) 86%, transparent);
  color: var(--clipboard-text-secondary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.7rem;
}

.contrast-chip b {
  color: #67c23a;
  font-weight: 600;
}

.contrast-chip b.fail {
  color: var(--clipboard-color-danger);
}

.link-list {
  display: grid;
  gap: 5px;
}

.link-row {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 30px;
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--clipboard-surface-base) 86%, transparent);
  color: var(--clipboard-text-secondary);
  cursor: pointer;
  text-align: left;
}

.link-row.active {
  border-color: color-mix(in srgb, var(--clipboard-color-accent) 55%, transparent);
  background: color-mix(in srgb, var(--clipboard-color-accent) 12%, transparent);
  color: var(--clipboard-text-primary);
}

.link-index {
  flex: none;
  color: var(--clipboard-text-muted);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.7rem;
}

.link-row.active .link-index {
  color: var(--clipboard-color-accent);
}

.link-text {
  min-width: 0;
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.72rem;
}

.link-open {
  width: 13px;
  height: 13px;
  flex: none;
  color: var(--clipboard-text-muted);
  transform: rotate(135deg);
}

.link-row.active .link-open,
.kv-value.primary .link-open {
  color: var(--clipboard-color-accent);
}

.word-chip,
.keyword-chip {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 5px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
  background: color-mix(in srgb, var(--clipboard-surface-base) 86%, transparent);
  color: var(--clipboard-text-primary);
  font-size: 0.75rem;
  line-height: 20px;
  text-align: center;
}

.word-chip:hover,
.color-chip:hover,
.keyword-chip:hover,
.ocr-text:hover {
  border-color: color-mix(in srgb, var(--clipboard-color-accent) 55%, transparent);
  background: color-mix(in srgb, var(--clipboard-color-accent) 10%, transparent);
}

.word-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 78px;
  overflow: auto;
}

.word-chip {
  max-width: 120px;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.insight-empty {
  color: var(--clipboard-text-muted);
  font-size: 0.76rem;
}

.color-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(116px, 1fr));
  gap: 6px;
}

.color-chip {
  min-width: 0;
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 7px;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 70%, transparent);
  background: color-mix(in srgb, var(--clipboard-surface-base) 88%, transparent);
  color: var(--clipboard-text-primary);
  cursor: pointer;
}

.color-swatch {
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  border-radius: 4px;
  border: 1px solid var(--clipboard-border-color);
}

.color-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.72rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.ocr-text {
  width: 100%;
  max-height: 92px;
  margin: 0;
  padding: 8px;
  overflow: auto;
  border-radius: 6px;
  border: 1px solid color-mix(in srgb, var(--clipboard-border-color) 55%, transparent);
  background: color-mix(in srgb, var(--clipboard-surface-base) 88%, transparent);
  color: var(--clipboard-text-primary);
  cursor: pointer;
  font-size: 0.76rem;
  line-height: 1.45;
  text-align: left;
  white-space: pre-wrap;
  word-break: break-word;
  /* 全局基线是 user-select: none；识别出来的正文是少数该放开的地方。 */
  user-select: text;
  -webkit-user-select: text;
}

.keyword-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
