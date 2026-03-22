<script setup lang="ts">
import { TxIcon, TxRadio, TxRadioGroup } from '@talex-touch/tuffex'

const props = withDefaults(defineProps<{
  codeResolver: () => string
  language: string
  previewable?: boolean
  toggleable?: boolean
  expandable?: boolean
  mode?: 'preview' | 'code'
}>(), {
  previewable: false,
  toggleable: false,
  expandable: false,
  mode: 'code',
})

const emits = defineEmits<{
  (event: 'preview', payload: { language: string, code: string }): void
  (event: 'modeChange', mode: 'preview' | 'code'): void
  (event: 'expand', payload: { language: string, code: string }): void
}>()

const didCopy = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null

function clearCopyTimer() {
  if (!copyTimer) {
    return
  }

  clearTimeout(copyTimer)
  copyTimer = null
}

async function handleCopy() {
  const code = props.codeResolver?.() || ''

  try {
    await navigator.clipboard.writeText(code)
  }
  catch (error) {
    console.warn('[RenderCodeHeader] Copy failed:', error)
    return
  }

  didCopy.value = true
  clearCopyTimer()
  copyTimer = setTimeout(() => {
    didCopy.value = false
    copyTimer = null
  }, 1000)
}

function handlePreview() {
  emits('preview', {
    language: props.language,
    code: props.codeResolver?.() || '',
  })
}

const modeModel = computed<'preview' | 'code'>({
  get() {
    return props.mode || 'code'
  },
  set(value) {
    emits('modeChange', value)
  },
})

function handleExpand() {
  emits('expand', {
    language: props.language,
    code: props.codeResolver?.() || '',
  })
}

onBeforeUnmount(() => {
  clearCopyTimer()
})
</script>

<template>
  <div class="EditorCode-Header">
    <div class="rich-article rich-lang">
      {{ language || 'text' }}
    </div>

    <div class="EditorCode-HeaderActions">
      <TxRadioGroup
        v-if="toggleable"
        v-model="modeModel"
        type="button"
        direction="row"
        class="rich-mode-radio"
      >
        <TxRadio value="preview" label="预览" />
        <TxRadio value="code" label="代码" />
      </TxRadioGroup>

      <button
        type="button"
        class="rich-article rich-copy"
        :class="{ did: didCopy }"
        :title="didCopy ? '已复制' : '复制代码'"
        @click="handleCopy"
      >
        <TxIcon v-if="didCopy" class="rich-copy-icon" name="i-ri-check-line" :size="14" />
        <TxIcon v-else class="rich-copy-icon" name="i-ri-file-copy-line" :size="14" />
        <span class="rich-copy-text">
          {{ didCopy ? '已复制' : '复制' }}
        </span>
      </button>

      <button
        v-if="expandable"
        type="button"
        class="rich-article rich-expand"
        title="展开预览"
        @click="handleExpand"
      >
        <TxIcon name="i-ri-fullscreen-line" :size="14" />
      </button>

      <button v-if="previewable" type="button" class="rich-article rich-preview" @click="handlePreview">
        预览
      </button>
    </div>
  </div>
</template>
