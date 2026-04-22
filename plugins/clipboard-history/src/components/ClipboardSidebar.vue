<script lang="ts" setup>
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import type { ClipboardSection } from '~/utils/clipboard-items'
import { getClipboardSubtitle, getClipboardTitle, resolveListImageSrc } from '~/utils/clipboard-items'

defineProps<{
  sections: ClipboardSection[]
  selectedId: number | null
  loading: boolean
  loadingMore: boolean
  hasMore: boolean
}>()

const emit = defineEmits<{
  (event: 'select', item: PluginClipboardItem): void
  (event: 'load-more'): void
}>()

function onScroll(event: Event): void {
  const target = event.target as HTMLElement | null
  if (!target) {
    return
  }

  if (target.scrollTop + target.clientHeight >= target.scrollHeight - 48) {
    emit('load-more')
  }
}
</script>

<template>
  <aside class="clipboard-sidebar" @scroll.passive="onScroll">
    <template v-if="loading && sections.length === 0">
      <div class="list-empty">
        <div class="empty-icon">⌛</div>
        <p>正在读取剪贴历史</p>
        <p class="empty-hint">稍等一下，最近的记录会很快出现在这里。</p>
      </div>
    </template>

    <template v-else-if="sections.length === 0">
      <div class="list-empty">
        <div class="empty-icon">📋</div>
        <p>暂无剪贴内容</p>
        <p class="empty-hint">复制一些文本或图片后会出现在这里。</p>
      </div>
    </template>

    <template v-else>
      <section v-for="section in sections" :key="section.key" class="section">
        <header class="section-header">
          <h3>{{ section.label }} ({{ section.count }}条)</h3>
        </header>

        <ol class="section-list">
          <li v-for="item in section.items" :key="item.id">
            <button
              class="ClipboardItem"
              :class="{ active: item.id === selectedId }"
              type="button"
              @click="emit('select', item)"
            >
              <div class="item-icon" :class="{ 'has-image': item.type === 'image' && resolveListImageSrc(item) }">
                <img
                  v-if="item.type === 'image' && resolveListImageSrc(item)"
                  :src="resolveListImageSrc(item) || undefined"
                  alt=""
                >
                <span v-else class="icon">{{ item.type === 'files' ? '⌘' : 'T' }}</span>
              </div>

              <div class="item-copy">
                <p class="item-preview" :title="getClipboardTitle(item)">
                  {{ getClipboardTitle(item) }}
                </p>
                <p class="item-meta">
                  {{ getClipboardSubtitle(item) }}
                </p>
              </div>
            </button>
          </li>
        </ol>
      </section>

      <div v-if="loadingMore" class="list-footnote">正在加载更多记录…</div>
      <div v-else-if="!hasMore" class="list-footnote">已经到底了</div>
    </template>
  </aside>
</template>

<style scoped>
.clipboard-sidebar {
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  padding: 12px 10px 20px;
  background: transparent;
}

.section + .section {
  margin-top: 14px;
}

.section-list {
  display: grid;
  gap: 6px;
  margin: 0;
  padding: 0;
}

.list-empty {
  margin: 0 auto;
  padding: 32px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: center;
  color: var(--clipboard-text-muted);
}

.empty-icon {
  width: 54px;
  height: 54px;
  margin: 0 auto;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--clipboard-text-muted);
  font-size: 1.3rem;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--clipboard-surface-ghost, rgba(148, 163, 184, 0.12)) 60%, transparent),
    color-mix(in srgb, var(--clipboard-surface-ghost, rgba(148, 163, 184, 0.12)) 90%, transparent)
  );
}

.section-header {
  position: sticky;
  top: 0;
  z-index: 5;
  margin-bottom: 6px;
  padding: 6px 8px;
  backdrop-filter: blur(18px) saturate(180%);
  background: color-mix(in srgb, var(--clipboard-surface-base) 72%, transparent);
}

.section-header h3 {
  margin: 0;
  font-size: 0.74rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--clipboard-text-secondary);
}

.ClipboardItem {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 16px;
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;
}

.ClipboardItem:hover {
  background: var(--clipboard-surface-strong);
}

.ClipboardItem.active,
.ClipboardItem.active:hover {
  border-color: var(--clipboard-border-strong);
  background: color-mix(in srgb, var(--clipboard-color-accent, #6366f1) 14%, transparent);
}

.ClipboardItem:focus-visible {
  outline: 2px solid var(--clipboard-color-accent, #6366f1);
  outline-offset: 2px;
}

.item-icon {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: var(--clipboard-text-muted);
  background: color-mix(in srgb, var(--clipboard-surface-ghost) 90%, transparent);
  overflow: hidden;
}

.item-icon.has-image {
  padding: 0;
  background: var(--clipboard-surface-strong);
}

.item-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.item-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.item-preview {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--clipboard-text-primary);
}

.item-meta {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.78rem;
  color: var(--clipboard-text-muted);
}

.list-footnote {
  padding: 16px 10px 6px;
  text-align: center;
  color: var(--clipboard-text-secondary);
  font-size: 0.8rem;
}

.empty-hint {
  font-size: 0.78rem;
  color: var(--clipboard-text-disabled);
  margin: 0;
}
</style>
