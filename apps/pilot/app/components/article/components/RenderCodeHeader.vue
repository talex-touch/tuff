<script setup lang="ts">
const props = withDefaults(defineProps<{
  codeResolver: () => string
  language: string
  previewable?: boolean
}>(), {
  previewable: false,
})

const emits = defineEmits<{
  (event: 'preview', payload: { language: string, code: string }): void
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
      <button type="button" class="rich-article rich-copy" :class="{ did: didCopy }" @click="handleCopy">
        <span class="un">复制</span>
        <span class="did">已复制!</span>
      </button>

      <button v-if="previewable" type="button" class="rich-article rich-preview" @click="handlePreview">
        预览
      </button>
    </div>
  </div>
</template>
