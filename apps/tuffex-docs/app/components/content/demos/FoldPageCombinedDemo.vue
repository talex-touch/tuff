<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

const open = ref(true)
const peeled = ref(false)

const copy = computed(() => (locale.value === 'zh'
  ? {
      toggleFold: open.value ? '收起折页' : '展开折页',
      panels: [
        { id: 'overview', badge: '01 · 封面', title: '发布摘要', content: 'v2.4 运行时已接入琉光折射折页展示卡片。' },
        { id: 'specs', badge: '02 · 规格', title: '立体折痕', content: '支持双面三折页，展开后可在任意面板内嵌套纸角掀开层。' },
        { id: 'inspect', badge: '03 · 验签', title: '底层签名' },
      ],
      frontTitle: '校验摘要',
      frontBody: '点击右上角掀开纸角，查看完整 SHA-256 指纹。',
      underLabel: 'SHA-256',
      underHash: '9f86d081 · verified',
    }
  : {
      toggleFold: open.value ? 'Fold brochure' : 'Open brochure',
      panels: [
        { id: 'overview', badge: '01 · Cover', title: 'Release Note', content: 'Runtime v2.4 ships with 3D refraction brochure layouts.' },
        { id: 'specs', badge: '02 · Geometry', title: 'Tri-Fold Spread', content: 'Unfold the panels, then peel the corner on panel 3 to inspect metadata.' },
        { id: 'inspect', badge: '03 · Verify', title: 'Signature' },
      ],
      frontTitle: 'Checksum Digest',
      frontBody: 'Peel the top-right corner to inspect the SHA-256 signature.',
      underLabel: 'SHA-256',
      underHash: '9f86d081 · verified',
    }))
</script>

<template>
  <div class="not-prose fold-combined-demo">
    <div class="fold-combined-demo__bar">
      <TxButton size="sm" @click="open = !open">
        {{ copy.toggleFold }}
      </TxButton>
    </div>

    <TxFoldPage v-model="open" :panels="copy.panels" fold-style="accordion" size="md">
      <template #panel-inspect>
        <div class="fold-combined-demo__slot">
          <TxFoldCorner
            v-model="peeled"
            corner="top-right"
            size="sm"
            :radius="12"
            :open-peel="0.88"
            @pointerdown.stop
            @click.stop
          >
            <template #default>
              <div class="fold-combined-demo__card">
                <span class="fold-combined-demo__title">{{ copy.frontTitle }}</span>
                <p class="fold-combined-demo__body">
                  {{ copy.frontBody }}
                </p>
              </div>
            </template>
            <template #under>
              <div class="fold-combined-demo__under">
                <span class="fold-combined-demo__kicker">{{ copy.underLabel }}</span>
                <code class="fold-combined-demo__hash">{{ copy.underHash }}</code>
              </div>
            </template>
          </TxFoldCorner>
        </div>
      </template>
    </TxFoldPage>
  </div>
</template>

<style scoped>
.fold-combined-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fold-combined-demo__bar {
  display: flex;
  justify-content: flex-end;
}

.fold-combined-demo__slot {
  height: 100%;
  display: flex;
  align-items: stretch;
}

.fold-combined-demo__slot :deep(.tx-fold-corner) {
  min-height: 100%;
}

.fold-combined-demo__card,
.fold-combined-demo__under {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fold-combined-demo__under {
  height: 100%;
  align-items: flex-end;
  text-align: right;
  justify-content: flex-start;
  padding-left: 26%;
  box-sizing: border-box;
}

.fold-combined-demo__title {
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.fold-combined-demo__body {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--tx-text-color-secondary);
}

.fold-combined-demo__kicker {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--tx-color-primary);
}

.fold-combined-demo__hash {
  font-size: 12px;
  color: var(--tx-text-color-primary);
}
</style>
