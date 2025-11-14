<script setup lang="ts" name="PreviewResultCard">
import { computed } from 'vue'
import type { TuffItem } from '@talex-touch/utils'
import type { PreviewCardPayload } from '@talex-touch/utils/core-box'

const props = defineProps<{
  item: TuffItem
  payload?: PreviewCardPayload
}>()

const resolvedPayload = computed<PreviewCardPayload | undefined>(() => {
  if (props.payload) return props.payload
  const custom = props.item.render?.custom
  return custom?.data as PreviewCardPayload | undefined
})

const sections = computed(() => resolvedPayload.value?.sections ?? [])
const chips = computed(() => resolvedPayload.value?.chips ?? [])
const badges = computed(() => resolvedPayload.value?.badges ?? [])

const accentStyle = computed(() => {
  const accent = resolvedPayload.value?.accentColor
  return accent ? { color: accent } : undefined
})
</script>

<template>
  <div class="PreviewResultCard">
    <div class="card-head">
      <div v-if="resolvedPayload?.subtitle" class="badge">
        {{ resolvedPayload?.subtitle }}
      </div>
      <span class="ability-id op-25">{{ resolvedPayload?.abilityId }}</span>
    </div>
    <div class="card-body">
      <div class="primary">
        <div class="primary-label">
          {{ resolvedPayload?.primaryLabel || '结果' }}
        </div>
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
      <div v-if="sections.length" class="section-list">
        <div
          v-for="section in sections"
          :key="section.title ?? section.rows[0]?.label"
          class="section"
        >
          <div v-if="section.title" class="section-title">
            {{ section.title }}
          </div>
          <dl>
            <div
              v-for="row in section.rows"
              :key="row.label"
              class="row"
              :class="{ emphasize: row.emphasize }"
            >
              <dt>{{ row.label }}</dt>
              <dd>
                <div class="value">{{ row.value }}</div>
                <div v-if="row.description" class="hint">{{ row.description }}</div>
              </dd>
            </div>
          </dl>
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
  border-radius: 12px;
  padding: 16px 18px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--el-text-color-secondary);

  .badge {
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
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
  gap: 8px;

  .chip {
    border-radius: 8px;
    padding: 8px 10px;
    background: var(--el-fill-color-light);
    min-width: 140px;

    .chip-label {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    .chip-value {
      font-size: 14px;
      font-weight: 500;
      color: var(--el-text-color-primary);
    }
  }
}

.section-list {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .section {
    padding-top: 6px;

    .section-title {
      font-size: 12px;
      color: var(--el-text-color-secondary);
      margin-bottom: 6px;
    }

    dl {
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .row {
      display: flex;
      gap: 12px;

      &.emphasize {
        dt {
          color: var(--el-color-primary);
        }

        .value {
          font-weight: 600;
        }
      }

      dt {
        width: 80px;
        text-align: right;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      dd {
        margin: 0;
        flex: 1;
      }

      .value {
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      .hint {
        font-size: 12px;
        color: var(--el-text-color-secondary);
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
