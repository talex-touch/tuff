<script lang="ts" setup>
import type { PluginClipboardItem } from '@talex-touch/utils/plugin/sdk/types'
import {
  getClipboardInfoRows,
  getClipboardTitle,
  getClipboardTypeLabel,
  parseFileList,
  resolveDetailImageSrc,
} from '~/utils/clipboard-items'

defineProps<{
  item: PluginClipboardItem | null
}>()
</script>

<template>
  <section class="clipboard-detail">
    <div class="preview-surface" :class="{ empty: !item }">
      <template v-if="!item">
        <div class="list-empty">
          <div class="empty-icon">↗</div>
          <p>在左侧选择一条剪贴记录以查看详情</p>
        </div>
      </template>

      <template v-else-if="item.type === 'image' && resolveDetailImageSrc(item)">
        <div class="image-container">
          <img
            :src="resolveDetailImageSrc(item) || undefined"
            alt=""
            class="preview-img"
          >
        </div>
      </template>

      <template v-else-if="item?.type === 'image'">
        <div class="detail-empty-preview">
          当前只拿到了列表缩略图，详情原图没有可用地址。
        </div>
      </template>

      <template v-else-if="item?.type === 'text'">
        <pre class="code-preview">{{ item.content }}</pre>
      </template>

      <template v-else>
        <ul class="file-list">
          <li v-for="file in parseFileList(item?.content)" :key="file">{{ file }}</li>
        </ul>
      </template>
    </div>

    <div v-if="item" class="info-surface">
      <div class="detail-heading">
        <p class="eyebrow">{{ getClipboardTypeLabel(item) }}</p>
        <h2>{{ getClipboardTitle(item) }}</h2>
      </div>

      <div class="info-grid">
        <div v-for="row in getClipboardInfoRows(item)" :key="row.label" class="info-row">
          <span class="info-label">{{ row.label }}</span>
          <span class="info-value">{{ row.value }}</span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.clipboard-detail {
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: auto;
}

.preview-surface {
  flex: 1;
  min-height: 320px;
  padding: 18px;
  overflow: auto;
  border-bottom: 1px solid var(--clipboard-border-color);
  background: var(--clipboard-surface-strong);
}

.preview-surface.empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-container {
  width: 100%;
  height: 100%;
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-img {
  width: 100%;
  max-height: min(56vh, 640px);
  object-fit: contain;
  border-radius: 18px;
  background: color-mix(in srgb, var(--clipboard-surface-base) 92%, transparent);
}

.detail-empty-preview,
.code-preview,
.file-list {
  margin: 0;
  padding: 20px;
  border-radius: 18px;
  border: 1px solid var(--clipboard-border-color);
  background: color-mix(in srgb, var(--clipboard-surface-base) 94%, transparent);
}

.detail-empty-preview {
  color: var(--clipboard-text-secondary);
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.code-preview {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.7;
  color: var(--clipboard-text-primary);
}

.file-list {
  padding-left: 36px;
  display: grid;
  gap: 10px;
  color: var(--clipboard-text-primary);
}

.info-surface {
  padding: 18px 22px 24px;
}

.detail-heading {
  margin-bottom: 16px;
}

.detail-heading h2 {
  margin: 4px 0 0;
  font-size: 1.2rem;
  line-height: 1.35;
  color: var(--clipboard-text-primary);
}

.eyebrow {
  margin: 0;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--clipboard-text-muted);
  text-transform: uppercase;
}

.info-grid {
  border-top: 1px solid color-mix(in srgb, var(--clipboard-border-color) 60%, transparent);
}

.info-row {
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--clipboard-border-color) 45%, transparent);
}

.info-label {
  color: var(--clipboard-text-muted);
  font-size: 0.86rem;
}

.info-value {
  min-width: 0;
  color: var(--clipboard-text-primary);
  font-size: 0.88rem;
  word-break: break-word;
}

.list-empty {
  margin: 0 auto;
  text-align: center;
  color: var(--clipboard-text-muted);
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 32px 0;
}

.empty-icon {
  width: 54px;
  height: 54px;
  border-radius: 16px;
  margin: 0 auto;
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
</style>
