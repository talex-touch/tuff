<script lang="ts" name="HomePreviewSources" setup>
import type { PreviewSource, PreviewSourceKind } from '~/modules/conversation/preview-index'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * What the answers were built on.
 *
 * Every entry is derived from a tool call that really happened — files read,
 * search hits, MCP calls. `AiSourcesPart` is declared in tuffex but nothing in
 * this app emits one yet, so there is no web group to show until something
 * does; inventing citations here would be worse than showing none.
 */
const props = defineProps<{ items: PreviewSource[] }>()

const { t } = useI18n()

const KIND_ORDER: PreviewSourceKind[] = ['file', 'search', 'mcp', 'web']

const KIND_ICON: Record<PreviewSourceKind, string> = {
  file: 'i-ri-file-text-line',
  search: 'i-ri-search-line',
  mcp: 'i-ri-plug-line',
  web: 'i-ri-global-line'
}

const KIND_LABEL: Record<PreviewSourceKind, string> = {
  file: 'home.preview.sourceFile',
  search: 'home.preview.sourceSearch',
  mcp: 'home.preview.sourceMcp',
  web: 'home.preview.sourceWeb'
}

const groups = computed(() =>
  KIND_ORDER.map((kind) => ({
    kind,
    items: props.items.filter((item) => item.kind === kind)
  })).filter((group) => group.items.length > 0)
)
</script>

<template>
  <div class="HomePreviewSources">
    <p v-if="!props.items.length" class="HomePreview-Empty">
      {{ t('home.preview.sourcesEmpty') }}
    </p>

    <section v-for="group in groups" :key="group.kind" class="HomePreviewSources-Group">
      <h3 class="HomePreview-GroupLabel">{{ t(KIND_LABEL[group.kind]) }}</h3>
      <div v-for="item in group.items" :key="item.id" class="HomePreviewSources-Row">
        <span class="HomePreviewSources-Icon" :class="KIND_ICON[group.kind]" />
        <span class="HomePreviewSources-Text">
          <span class="HomePreview-Name">{{ item.label }}</span>
          <span v-if="item.detail" class="HomePreview-Detail" :title="item.detail">
            {{ item.detail }}
          </span>
        </span>
      </div>
    </section>
  </div>
</template>

<style lang="scss" scoped>
.HomePreviewSources {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.HomePreviewSources-Group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.HomePreviewSources-Row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  min-width: 0;
  padding: 4px 8px;
}

.HomePreviewSources-Icon {
  flex: none;
  margin-top: 2px;
  color: var(--shell-text-muted);
  font-size: 14px;
}

.HomePreviewSources-Text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
</style>
