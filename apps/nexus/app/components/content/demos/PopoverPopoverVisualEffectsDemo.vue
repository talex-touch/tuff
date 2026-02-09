<script setup lang="ts">
import { computed, ref } from 'vue'

type PanelBackground = 'blur' | 'glass' | 'mask'
type PopoverMotion = 'fade' | 'split'
type PopoverPlacement = 'bottom-start' | 'bottom' | 'top' | 'right'

const { locale } = useI18n()

const open = ref(false)
const background = ref<PanelBackground>('blur')
const fusion = ref(false)
const motion = ref<PopoverMotion>('split')
const placement = ref<PopoverPlacement>('bottom-start')
const showArrow = ref(true)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      background: '背景',
      motion: '动效',
      placement: '位置',
      arrow: '箭头',
      fusion: '融合',
      trigger: '触发',
      toggle: '切换',
      reference: '点我',
      panelTitle: 'Popover 面板',
      panelDescription: 'Blur/Glass/Mask + Fusion + Arrow',
      action: '操作',
    }
  }

  return {
    background: 'background',
    motion: 'motion',
    placement: 'placement',
    arrow: 'arrow',
    fusion: 'fusion',
    trigger: 'trigger',
    toggle: 'Toggle',
    reference: 'Click me',
    panelTitle: 'Split out popover',
    panelDescription: 'Blur/Glass/Mask + Fusion + Arrow',
    action: 'Action',
  }
})
</script>

<template>
  <div class="tx-demo tx-demo__col" style="gap: 12px; max-width: 860px;">
    <TxCard variant="plain" background="mask" :padding="14" :radius="14">
      <div class="tx-demo__row" style="gap: 10px; flex-wrap: wrap;">
        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">{{ labels.background }}</span>
          <TuffSelect v-model="background" style="min-width: 160px;">
            <TuffSelectItem value="blur" label="blur" />
            <TuffSelectItem value="glass" label="glass" />
            <TuffSelectItem value="mask" label="mask" />
          </TuffSelect>
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">{{ labels.motion }}</span>
          <TuffSelect v-model="motion" style="min-width: 160px;">
            <TuffSelectItem value="split" label="split" />
            <TuffSelectItem value="fade" label="fade" />
          </TuffSelect>
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">{{ labels.placement }}</span>
          <TuffSelect v-model="placement" style="min-width: 200px;">
            <TuffSelectItem value="bottom-start" label="bottom-start" />
            <TuffSelectItem value="bottom" label="bottom" />
            <TuffSelectItem value="top" label="top" />
            <TuffSelectItem value="right" label="right" />
          </TuffSelect>
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">{{ labels.arrow }}</span>
          <TxSwitch v-model="showArrow" />
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">{{ labels.fusion }}</span>
          <TxSwitch v-model="fusion" />
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">{{ labels.trigger }}</span>
          <TxButton size="small" @click="open = !open">
            {{ labels.toggle }}
          </TxButton>
        </label>
      </div>
    </TxCard>

    <div style="display: flex; justify-content: center; padding: 48px 0;">
      <TxPopover
        v-model="open"
        :placement="placement"
        :show-arrow="showArrow"
        :motion="motion"
        :fusion="fusion"
        :panel-background="background"
        panel-shadow="soft"
        :panel-padding="12"
      >
        <template #reference>
          <TxButton>{{ labels.reference }}</TxButton>
        </template>

        <div style="width: 260px; display: grid; gap: 8px;">
          <div style="font-weight: 600;">
            {{ labels.panelTitle }}
          </div>
          <div style="color: var(--tx-text-color-secondary); font-size: 12px;">
            {{ labels.panelDescription }}
          </div>
          <TxButton size="small">
            {{ labels.action }}
          </TxButton>
        </div>
      </TxPopover>
    </div>
  </div>
</template>
