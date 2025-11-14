<script setup lang="ts" name="PreviewResultCard">
import { computed } from 'vue'
import type { TuffItem } from '@talex-touch/utils'
import type { PreviewCardPayload } from '@talex-touch/utils/core-box'

const props = defineProps<{
  item: TuffItem
  payload?: PreviewCardPayload
}>()

const emit = defineEmits<{
  (e: 'show-history'): void
  (e: 'copy-primary'): void
}>()

const resolvedPayload = computed<PreviewCardPayload | undefined>(() => {
  if (props.payload) return props.payload
  const custom = props.item.render?.custom
  return custom?.data as PreviewCardPayload | undefined
})

const sections = computed(() => resolvedPayload.value?.sections ?? [])
const chips = computed(() => resolvedPayload.value?.chips ?? [])
const badges = computed(() => resolvedPayload.value?.badges ?? [])

const detailRows = computed(() => {
  const rows = sections.value.flatMap((section) => section.rows)
  return rows.slice(0, 4)
})

const accentStyle = computed(() => {
  const accent = resolvedPayload.value?.accentColor
  return accent ? { color: accent } : undefined
})
</script>

<template>
  <div class="PreviewResultCard">
    <div class="card-head">
      <div class="left">
        <div v-if="resolvedPayload?.subtitle" class="badge">
          {{ resolvedPayload?.subtitle }}
        </div>
        <span class="ability-id">{{ resolvedPayload?.abilityId }}</span>
      </div>
      <div class="card-actions">
        <button class="hint" type="button" @click="emit('copy-primary')">
          <span class="hint-key">↵</span>
          复制结果
        </button>
        <button class="hint" type="button" @click="emit('show-history')">
          <span class="hint-key">⌘→</span>
          最近计算
        </button>
      </div>
    </div>
    <div class="card-body">
      <div class="primary">
        <div class="primary-label">{{ resolvedPayload?.primaryLabel || '结果' }}</div>
        <div class="primary-value" :style="accentStyle">
          {{ resolvedPayload?.primaryValue || '--' }}
          <span v-if="resolvedPayload?.primaryUnit" class="primary-unit">
            {{ resolvedPayload?.primaryUnit }}
          </span>
        </div>
        <div v-if="resolvedPayload?.secondaryValue" class="primary-sub">
          <span class="label">{{ resolvedPayload?.secondaryLabel }}</span>
          <span>{{ resolvedPayload?.secondaryValue }}</span>
        </div>
      </div>
      <div v-if="resolvedPayload?.title" class="title">
        {{ resolvedPayload?.title }}
      </div>
      <div v-if="resolvedPayload?.description" class="description">
        {{ resolvedPayload?.description }}
      </div>
      <div v-if="badges.length" class="badge-row">
        <span v-for="badge in badges" :key="badge" class="pill">{{ badge }}</span>
      </div>
      <div v-if="chips.length" class="chip-row">
        <div v-for="chip in chips" :key="chip.label" class="chip">
          <span class="chip-label">{{ chip.label }}</span>
          <span class="chip-value">{{ chip.value }}</span>
        </div>
      </div>
      <div v-if="detailRows.length" class="detail-grid">
        <div v-for="row in detailRows" :key="row.label" class="detail">
          <span class="detail-label">{{ row.label }}</span>
          <span class="detail-value" :class="{ emphasize: row.emphasize }">
            {{ row.value }}
          </span>
        </div>
      </div>
      <div v-if="resolvedPayload?.warnings?.length" class="warnings">
        <div v-for="warning in resolvedPayload.warnings" :key="warning" class="warning">
          {{ warning }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.PreviewResultCard {
  width: 100%;
  border-radius: 18px;
  padding: 0.75rem 1rem 0.5rem;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--el-text-color-secondary);

  .left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .badge {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
  }

  .ability-id {
    font-size: 12px;
    opacity: 0.35;
  }
}

.card-actions {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);

  .hint {
    display: flex;
    align-items: center;
    gap: 4px;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    padding: 0;
    cursor: pointer;
  }

  .hint-key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 2px 6px;
    border-radius: 6px;
    background: var(--el-fill-color);
    font-size: 11px;
    font-weight: 500;
    color: var(--el-text-color-primary);
  }
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.primary {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .primary-label {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }

  .primary-value {
    font-size: 32px;
    font-weight: 600;
    line-height: 1.1;

    .primary-unit {
      font-size: 16px;
      margin-left: 8px;
      color: var(--el-text-color-secondary);
    }
  }

  .primary-sub {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    display: flex;
    gap: 8px;
  }
}

.title {
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.description {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.badge-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;

  .pill {
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--el-fill-color-darker);
    font-size: 12px;
  }
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  .chip {
    border-radius: 8px;
    padding: 6px 8px;
    background: var(--el-fill-color-light);
    min-width: 120px;

    .chip-label {
      font-size: 11px;
      color: var(--el-text-color-secondary);
    }

    .chip-value {
      font-size: 13px;
      font-weight: 500;
      color: var(--el-text-color-primary);
    }
  }
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px 12px;

  .detail {
    display: flex;
    flex-direction: column;
    gap: 2px;

    .detail-label {
      font-size: 11px;
      color: var(--el-text-color-secondary);
      text-transform: uppercase;
      letter-spacing: 0.02em;
    }

    .detail-value {
      font-size: 13px;
      color: var(--el-text-color-primary);

      &.emphasize {
        font-weight: 600;
      }
    }
  }
}

.warnings {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .warning {
    padding: 6px 10px;
    border-radius: 6px;
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning-dark-2);
    font-size: 12px;
  }
}
</style>
