<script setup lang="ts">
import { computed, ref } from 'vue'

type PanelBackground = 'refraction' | 'pure' | 'mask' | 'blur' | 'glass'
type PopoverPlacement = 'bottom-start' | 'bottom' | 'top' | 'right'
type PopoverTrigger = 'click' | 'hover'

const { locale } = useI18n()

const open = ref(false)
const background = ref<PanelBackground>('refraction')
const placement = ref<PopoverPlacement>('bottom-start')
const trigger = ref<PopoverTrigger>('click')
const showArrow = ref(true)
const keepAliveContent = ref(true)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      background: '背景',
      placement: '位置',
      trigger: '触发',
      arrow: '箭头',
      keepAlive: '状态保留',
      referenceClick: '点我',
      referenceHover: '悬停我',
      panelTitle: 'Popover 面板',
      panelDescription: '触发、背景、箭头和内容保留行为可联动调整',
      action: '操作',
    }
  }

  return {
    background: 'background',
    placement: 'placement',
    trigger: 'trigger',
    arrow: 'arrow',
    keepAlive: 'keepAlive',
    referenceClick: 'Click me',
    referenceHover: 'Hover me',
    panelTitle: 'Popover panel',
    panelDescription: 'Tune trigger, surface, arrow, and keepAlive behavior.',
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
            <TuffSelectItem value="refraction" label="refraction" />
            <TuffSelectItem value="pure" label="pure" />
            <TuffSelectItem value="mask" label="mask" />
            <TuffSelectItem value="blur" label="blur" />
            <TuffSelectItem value="glass" label="glass" />
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
          <span class="tx-demo__label">{{ labels.trigger }}</span>
          <TuffSelect v-model="trigger" style="min-width: 140px;">
            <TuffSelectItem value="click" label="click" />
            <TuffSelectItem value="hover" label="hover" />
          </TuffSelect>
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">{{ labels.keepAlive }}</span>
          <TxSwitch v-model="keepAliveContent" />
        </label>
      </div>
    </TxCard>

    <div style="display: flex; justify-content: center; padding: 48px 0;">
      <TxPopover
        v-model="open"
        :placement="placement"
        :trigger="trigger"
        :show-arrow="showArrow"
        :keep-alive-content="keepAliveContent"
        :panel-background="background"
        panel-shadow="soft"
        :panel-padding="12"
      >
        <template #reference>
          <TxButton>{{ trigger === 'hover' ? labels.referenceHover : labels.referenceClick }}</TxButton>
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
