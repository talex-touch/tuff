<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)
const background = ref<'refraction' | 'pure' | 'mask' | 'blur' | 'glass'>('refraction')
const trigger = ref<'click' | 'hover'>('click')
const placement = ref<'bottom-start' | 'bottom' | 'top' | 'right'>('bottom-start')
const showArrow = ref(true)
const keepAliveContent = ref(true)

const localCount = ref(0)
const localText = ref('')

function resetDemo() {
  open.value = false
  background.value = 'refraction'
  trigger.value = 'click'
  placement.value = 'bottom-start'
  showArrow.value = true
  keepAliveContent.value = true
  localCount.value = 0
  localText.value = ''
}
</script>

<template>
  <div class="tx-demo tx-demo__col" style="gap: 12px; max-width: 860px;">
    <TxCard variant="plain" background="mask" :padding="14" :radius="14">
      <div class="tx-demo__row" style="gap: 10px; flex-wrap: wrap; align-items: flex-end;">
        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">background</span>
          <TuffSelect v-model="background" style="min-width: 180px;">
            <TuffSelectItem value="refraction" label="refraction" />
            <TuffSelectItem value="pure" label="pure" />
            <TuffSelectItem value="mask" label="mask" />
            <TuffSelectItem value="blur" label="blur" />
            <TuffSelectItem value="glass" label="glass" />
          </TuffSelect>
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">trigger</span>
          <TuffSelect v-model="trigger" style="min-width: 160px;">
            <TuffSelectItem value="click" label="click" />
            <TuffSelectItem value="hover" label="hover" />
          </TuffSelect>
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">placement</span>
          <TuffSelect v-model="placement" style="min-width: 200px;">
            <TuffSelectItem value="bottom-start" label="bottom-start" />
            <TuffSelectItem value="bottom" label="bottom" />
            <TuffSelectItem value="top" label="top" />
            <TuffSelectItem value="right" label="right" />
          </TuffSelect>
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">arrow</span>
          <TxSwitch v-model="showArrow" />
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">keepAlive</span>
          <TxSwitch v-model="keepAliveContent" />
        </label>

        <TxButton size="small" @click="resetDemo">
          Reset
        </TxButton>
      </div>
    </TxCard>

    <div style="display: flex; justify-content: center; padding: 48px 0;">
      <TxPopover
        v-model="open"
        :trigger="trigger"
        :placement="placement"
        :show-arrow="showArrow"
        :keep-alive-content="keepAliveContent"
        :panel-background="background"
        panel-shadow="soft"
        :panel-padding="12"
      >
        <template #reference>
          <TxButton>{{ trigger === 'hover' ? 'Hover me' : 'Click me' }}</TxButton>
        </template>

        <div style="width: 280px; display: grid; gap: 10px;">
          <div style="font-weight: 600;">
            Popover content
          </div>
          <div style="color: var(--tx-text-color-secondary); font-size: 12px; line-height: 1.5;">
            keepAlive 开启时，内部状态会在关闭后保留；关闭 keepAlive 后，每次打开会重建状态。
          </div>

          <div class="tx-demo__row" style="gap: 8px; align-items: center;">
            <TxButton size="small" @click="localCount++">
              count +1
            </TxButton>
            <span style="font-size: 12px; color: var(--tx-text-color-secondary);">count: {{ localCount }}</span>
          </div>

          <TuffInput
            v-model="localText"
            placeholder="Type here to test keepAlive"
          />
        </div>
      </TxPopover>
    </div>
  </div>
</template>
