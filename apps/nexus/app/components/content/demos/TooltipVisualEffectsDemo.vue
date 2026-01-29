<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)
const background = ref<'blur' | 'glass' | 'mask'>('blur')
const fusion = ref(false)
const motion = ref<'fade' | 'split'>('split')
const placement = ref<'top' | 'bottom' | 'left' | 'right'>('top')
const showArrow = ref(true)
</script>

<template>
  <div class="tx-demo tx-demo__col" style="gap: 12px; max-width: 860px;">
    <TxCard variant="plain" background="mask" :padding="14" :radius="14">
      <div class="tx-demo__row" style="gap: 10px; flex-wrap: wrap;">
        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">background</span>
          <TuffSelect v-model="background" style="min-width: 160px;">
            <TuffSelectItem value="blur" label="blur" />
            <TuffSelectItem value="glass" label="glass" />
            <TuffSelectItem value="mask" label="mask" />
          </TuffSelect>
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">motion</span>
          <TuffSelect v-model="motion" style="min-width: 160px;">
            <TuffSelectItem value="split" label="split" />
            <TuffSelectItem value="fade" label="fade" />
          </TuffSelect>
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">placement</span>
          <TuffSelect v-model="placement" style="min-width: 160px;">
            <TuffSelectItem value="top" label="top" />
            <TuffSelectItem value="bottom" label="bottom" />
            <TuffSelectItem value="left" label="left" />
            <TuffSelectItem value="right" label="right" />
          </TuffSelect>
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">arrow</span>
          <TxSwitch v-model="showArrow" />
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">fusion</span>
          <TxSwitch v-model="fusion" />
        </label>

        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">trigger</span>
          <TxButton size="small" @click="open = !open">Toggle</TxButton>
        </label>
      </div>
    </TxCard>

    <div style="display: flex; justify-content: center; padding: 48px 0;">
      <TxTooltip
        v-model="open"
        trigger="click"
        :placement="placement"
        content="Split out tooltip with blur/glass/mask & fusion"
        :show-arrow="showArrow"
        :motion="motion"
        :fusion="fusion"
        :panel-background="background"
        panel-shadow="soft"
      >
        <TxButton>Click me</TxButton>
      </TxTooltip>
    </div>
  </div>
</template>
