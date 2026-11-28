<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const CODE = `<!doctype html>
<title>Pelican</title>
<style>
  body { margin: 0; display: grid; place-items: center; height: 100vh; font: 600 20px system-ui; background: #eef6ff; }
  span { padding: 10px 16px; border-radius: 999px; background: #fff; box-shadow: 0 1px 6px #0002; }
</style>
<span>A pelican, riding a bicycle</span>`

const copy = computed(() => (locale.value === 'zh'
  ? { copyLabel: '复制', copiedLabel: '已复制', previewLabel: '预览', codeLabel: '代码' }
  : { copyLabel: 'Copy', copiedLabel: 'Copied', previewLabel: 'Preview', codeLabel: 'Code' }))
</script>

<template>
  <div class="max-w-[420px]">
    <!-- `auto-preview` opens on the rendering once the code stops arriving; the toggle brings the source back. -->
    <TxCodeStream
      :code="CODE"
      lang="html"
      filename="pelican.html"
      lang-label="HTML"
      auto-preview
      :copy-label="copy.copyLabel"
      :copied-label="copy.copiedLabel"
      :preview-label="copy.previewLabel"
      :code-label="copy.codeLabel"
    />
  </div>
</template>
