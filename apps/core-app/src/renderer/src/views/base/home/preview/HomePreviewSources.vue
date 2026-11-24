<script lang="ts" name="HomePreviewSources" setup>
import type { PreviewSource, PreviewSourceKind } from '~/modules/conversation/preview-index'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import HomePreviewEmpty from './HomePreviewEmpty.vue'

/**
 * What the answers were built on.
 *
 * Every entry is derived from a tool call that really happened — files read,
 * search hits, MCP calls. `AiSourcesPart` is declared in tuffex but nothing in
 * this app emits one yet, so there is no web group to show until something
 * does; inventing citations here would be worse than showing none.
 */
const props = defineProps<{ items: PreviewSource[] }>()

const emit = defineEmits<{
  (event: 'open-file', payload: { path: string; displayPath: string }): void
  (event: 'open-web', url: string): void
}>()

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

function isClickableSource(item: PreviewSource): boolean {
  if (!item.detail) return false
  if (item.kind === 'file' || item.kind === 'search') return true
  if (item.kind === 'web' && /^https?:\/\//i.test(item.detail)) return true
  return false
}

function openSource(item: PreviewSource): void {
  if (!item.detail) return
  if (item.kind === 'web' && /^https?:\/\//i.test(item.detail)) {
    emit('open-web', item.detail)
    return
  }
  if (item.kind === 'file' || item.kind === 'search') {
    emit('open-file', { path: item.detail, displayPath: item.detail })
  }
}
</script>

<template>
  <div class="HomePreviewSources">
    <HomePreviewEmpty
      v-if="!props.items.length"
      icon="i-ri-book-open-line"
      :text="t('home.preview.sourcesEmpty')"
    />

    <section v-for="group in groups" :key="group.kind" class="HomePreviewSources-Group">
      <h3 class="HomePreview-GroupLabel">{{ t(KIND_LABEL[group.kind]) }}</h3>
      <template v-for="item in group.items" :key="item.id">
        <button
          v-if="isClickableSource(item)"
          type="button"
          class="HomePreviewSources-Row is-clickable"
          :title="item.detail"
          @click="openSource(item)"
        >
          <span class="HomePreviewSources-Icon" :class="KIND_ICON[group.kind]" />
          <span class="HomePreviewSources-Text">
            <span class="HomePreview-Name">{{ item.label }}</span>
            <span v-if="item.detail" class="HomePreview-Detail">
              {{ item.detail }}
            </span>
          </span>
        </button>
        <div v-else class="HomePreviewSources-Row">
          <span class="HomePreviewSources-Icon" :class="KIND_ICON[group.kind]" />
          <span class="HomePreviewSources-Text">
            <span class="HomePreview-Name">{{ item.label }}</span>
            <span v-if="item.detail" class="HomePreview-Detail" :title="item.detail">
              {{ item.detail }}
            </span>
          </span>
        </div>
      </template>
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
  width: 100%;
  min-width: 0;
  padding: 6px 8px;
  border: none;
  border-radius: var(--shell-radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;

  &.is-clickable {
    cursor: pointer;

    &:hover {
      background: var(--shell-surface-2);
    }
  }
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
