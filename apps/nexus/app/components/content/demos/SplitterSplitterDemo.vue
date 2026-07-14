<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const ratio = ref(0.42)
const verticalRatio = ref(0.58)

const copy = computed(() => (locale.value === 'zh'
  ? {
      horizontal: '横向分割',
      vertical: '纵向分割',
      left: '导航区',
      right: '内容区',
      top: '预览',
      bottom: '日志',
    }
  : {
      horizontal: 'Horizontal split',
      vertical: 'Vertical split',
      left: 'Navigation',
      right: 'Content',
      top: 'Preview',
      bottom: 'Logs',
    }))
</script>

<template>
  <div class="splitter-demo">
    <section class="splitter-demo__section">
      <p>{{ copy.horizontal }} · {{ ratio.toFixed(2) }}</p>
      <div class="splitter-demo__frame">
        <TxSplitter v-model="ratio" :min="0.25" :max="0.75" :snap="0.05">
          <template #a>
            <div class="splitter-demo__pane splitter-demo__pane--a">
              {{ copy.left }}
            </div>
          </template>
          <template #b>
            <div class="splitter-demo__pane">
              {{ copy.right }}
            </div>
          </template>
        </TxSplitter>
      </div>
    </section>

    <section class="splitter-demo__section">
      <p>{{ copy.vertical }} · {{ verticalRatio.toFixed(2) }}</p>
      <div class="splitter-demo__frame splitter-demo__frame--vertical">
        <TxSplitter v-model="verticalRatio" direction="vertical" :bar-size="12">
          <template #a>
            <div class="splitter-demo__pane splitter-demo__pane--a">
              {{ copy.top }}
            </div>
          </template>
          <template #b>
            <div class="splitter-demo__pane">
              {{ copy.bottom }}
            </div>
          </template>
        </TxSplitter>
      </div>
    </section>
  </div>
</template>

<style scoped>
.splitter-demo {
  display: grid;
  width: 100%;
  gap: 16px;
}

.splitter-demo__section {
  display: grid;
  gap: 8px;
}

.splitter-demo__section p {
  margin: 0;
  color: var(--tx-text-color-secondary);
  font-size: 13px;
}

.splitter-demo__frame {
  width: min(520px, 100%);
  height: 220px;
}

.splitter-demo__frame--vertical {
  height: 260px;
}

.splitter-demo__pane {
  height: 100%;
  padding: 12px;
  color: var(--tx-text-color-secondary);
  background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 70%, transparent);
}

.splitter-demo__pane--a {
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 8%, transparent);
}
</style>
