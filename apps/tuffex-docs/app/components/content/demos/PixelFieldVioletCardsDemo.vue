<script setup lang="ts">
import type { PixelFieldInteraction, PixelFieldPaletteName, PixelFieldPreset, PixelFieldStage } from '@talex-touch/tuffex/pixel-field'
import { computed, ref } from 'vue'
import { TxButton, TxPixelField } from '#components'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const copy = computed(() => zh.value
  ? {
      palette: '色板',
      stage: '舞台',
      interaction: '交互物理',
      palettes: { emerald: '翠绿', violet: '紫罗兰', cyan: '青蓝', amber: '琥珀', mono: '单色' },
      stages: { obsidian: '黑曜石', adaptive: '自适应主题' },
      interactions: { coalesce: '聚拢微澜', repel: '斥力散开', attract: '引力聚点', ripple: '波纹涟漪' },
      cards: [
        { id: '001', preset: 'branch' as PixelFieldPreset, title: '共享组件库', subtitle: '一套原语，覆盖每一块屏幕', brand: 'Violet' },
        { id: '002', preset: 'leaf' as PixelFieldPreset, title: '视觉连续性', subtitle: '从灵感到真实交互体验', brand: 'Violet' },
        { id: '003', preset: 'sprout' as PixelFieldPreset, title: '实时信号流', subtitle: '每个原型都接入真实数据', brand: 'Violet' },
        { id: '004', preset: 'blade' as PixelFieldPreset, title: '设计直出代码', subtitle: '交付你所设计的真实细节', brand: 'Violet' },
      ],
    }
  : {
      palette: 'Palette',
      stage: 'Stage',
      interaction: 'Interaction',
      palettes: { emerald: 'Emerald', violet: 'Violet', cyan: 'Cyan', amber: 'Amber', mono: 'Mono' },
      stages: { obsidian: 'Obsidian', adaptive: 'Adaptive' },
      interactions: { coalesce: 'Coalesce', repel: 'Repel', attract: 'Attract', ripple: 'Ripple' },
      cards: [
        { id: '001', preset: 'branch' as PixelFieldPreset, title: 'Shared Components', subtitle: 'One library, every screen', brand: 'Violet' },
        { id: '002', preset: 'leaf' as PixelFieldPreset, title: 'Visual Continuity', subtitle: 'From ideas to experiences', brand: 'Violet' },
        { id: '003', preset: 'sprout' as PixelFieldPreset, title: 'Live Signals', subtitle: 'Real data in every prototype', brand: 'Violet' },
        { id: '004', preset: 'blade' as PixelFieldPreset, title: 'Code Handoff', subtitle: 'Ship what you designed', brand: 'Violet' },
      ],
    })

const palette = ref<PixelFieldPaletteName>('emerald')
const stage = ref<PixelFieldStage>('obsidian')
const interaction = ref<PixelFieldInteraction>('coalesce')

const paletteList: PixelFieldPaletteName[] = ['emerald', 'violet', 'cyan', 'amber', 'mono']
const stageList: PixelFieldStage[] = ['obsidian', 'adaptive']
const interactionList: PixelFieldInteraction[] = ['coalesce', 'repel', 'attract', 'ripple']
</script>

<template>
  <div class="pf-violet not-prose">
    <div class="pf-violet__toolbar">
      <div class="pf-violet__group">
        <span class="pf-violet__label">{{ copy.palette }}</span>
        <div class="pf-violet__pills">
          <TxButton
            v-for="item in paletteList"
            :key="item"
            size="sm"
            :variant="palette === item ? 'primary' : 'secondary'"
            @click="palette = item"
          >
            {{ copy.palettes[item] }}
          </TxButton>
        </div>
      </div>

      <div class="pf-violet__group">
        <span class="pf-violet__label">{{ copy.stage }}</span>
        <div class="pf-violet__pills">
          <TxButton
            v-for="item in stageList"
            :key="item"
            size="sm"
            :variant="stage === item ? 'primary' : 'secondary'"
            @click="stage = item"
          >
            {{ copy.stages[item] }}
          </TxButton>
        </div>
      </div>

      <div class="pf-violet__group">
        <span class="pf-violet__label">{{ copy.interaction }}</span>
        <div class="pf-violet__pills">
          <TxButton
            v-for="item in interactionList"
            :key="item"
            size="sm"
            :variant="interaction === item ? 'primary' : 'secondary'"
            @click="interaction = item"
          >
            {{ copy.interactions[item] }}
          </TxButton>
        </div>
      </div>
    </div>

    <div class="pf-violet__frame" :class="{ 'is-adaptive': stage === 'adaptive' }">
      <div class="pf-violet__grid">
        <TxPixelField
          v-for="card in copy.cards"
          :key="card.id"
          class="pf-violet__card"
          :preset="card.preset"
          :palette="palette"
          :stage="stage"
          :interaction="interaction"
          :pixel-size="2.8"
          :gap="1.6"
          :radius="20"
          :aria-label="card.title"
        >
          <div class="pf-violet__chrome" :class="{ 'is-adaptive': stage === 'adaptive' }">
            <header class="pf-violet__head">
              <div class="pf-violet__titles">
                <h4>{{ card.title }}</h4>
                <p>{{ card.subtitle }}</p>
              </div>
              <span class="pf-violet__index">{{ card.id }}</span>
            </header>
            <footer class="pf-violet__foot">
              <svg class="pf-violet__mark" viewBox="0 0 18 18" width="15" height="15" aria-hidden="true">
                <circle cx="9" cy="2.6" r="1.4" fill="currentColor" />
                <circle cx="13.5" cy="4.5" r="1.4" fill="currentColor" opacity="0.88" />
                <circle cx="15.4" cy="9" r="1.4" fill="currentColor" opacity="0.76" />
                <circle cx="13.5" cy="13.5" r="1.4" fill="currentColor" opacity="0.64" />
                <circle cx="9" cy="15.4" r="1.4" fill="currentColor" opacity="0.52" />
                <circle cx="4.5" cy="13.5" r="1.4" fill="currentColor" opacity="0.64" />
                <circle cx="2.6" cy="9" r="1.4" fill="currentColor" opacity="0.76" />
                <circle cx="4.5" cy="4.5" r="1.4" fill="currentColor" opacity="0.88" />
              </svg>
              <span>{{ card.brand }}</span>
            </footer>
          </div>
        </TxPixelField>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pf-violet {
  display: grid;
  gap: 16px;
  font-size: 13px;
  color: var(--tx-text-color-primary);
}

.pf-violet__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 22px;
  align-items: center;
}

.pf-violet__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.pf-violet__label {
  font-size: 12px;
  color: var(--tx-text-color-regular);
}

.pf-violet__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pf-violet__frame {
  padding: 18px;
  border-radius: 26px;
  background: #141416;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.07);
}

.pf-violet__frame.is-adaptive {
  background: var(--tx-fill-color-lighter);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}

.pf-violet__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 640px) {
  .pf-violet__grid {
    grid-template-columns: 1fr;
  }
}

.pf-violet__card {
  min-height: 316px;
  cursor: pointer;
}

.pf-violet__chrome {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
  padding: 20px;
  color: #f4f6f8;
  pointer-events: none;
}

.pf-violet__chrome.is-adaptive {
  color: var(--tx-text-color-primary);
}

.pf-violet__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.pf-violet__titles h4 {
  margin: 0 0 4px;
  max-width: 14ch;
  font-size: 17px;
  font-weight: 500;
  line-height: 1.22;
  text-wrap: balance;
}

.pf-violet__titles p {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.56);
}

.pf-violet__chrome.is-adaptive .pf-violet__titles p {
  color: var(--tx-text-color-regular);
}

.pf-violet__index {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  color: rgba(255, 255, 255, 0.48);
}

.pf-violet__chrome.is-adaptive .pf-violet__index {
  color: var(--tx-text-color-secondary);
}

.pf-violet__foot {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.84);
}

.pf-violet__chrome.is-adaptive .pf-violet__foot {
  color: var(--tx-text-color-primary);
}

.pf-violet__mark {
  flex: none;
}
</style>
