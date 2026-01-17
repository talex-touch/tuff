<script setup lang="ts">
import { computed, ref } from 'vue'

type Preset = 'fade' | 'slide-fade' | 'rebound'

const preset = ref<Preset>('slide-fade')

const seq = ref(3)
const items = ref([
  { id: 'a', text: 'Alpha' },
  { id: 'b', text: 'Beta' },
  { id: 'c', text: 'Gamma' },
])

const list = computed(() => items.value)

function add() {
  seq.value += 1
  items.value.unshift({ id: `${Date.now()}`, text: `New ${seq.value}` })
}

function remove() {
  items.value.shift()
}
</script>

<template>
  <div class="tx-demo tx-demo__col" style="gap: 12px; width: 520px;">
    <TxCard variant="plain" background="mask" :padding="14" :radius="14">
      <div class="tx-demo__row" style="gap: 10px; flex-wrap: wrap; align-items: center;">
        <label class="tx-demo__row" style="gap: 8px;">
          <span class="tx-demo__label">preset</span>
          <TuffSelect v-model="preset" style="min-width: 180px;">
            <TuffSelectItem value="fade" label="fade" />
            <TuffSelectItem value="slide-fade" label="slide-fade" />
            <TuffSelectItem value="rebound" label="rebound" />
          </TuffSelect>
        </label>

        <TxButton size="small" @click="add">
          Add
        </TxButton>
        <TxButton size="small" @click="remove">
          Remove
        </TxButton>
      </div>
    </TxCard>

    <TxCard variant="plain" background="mask" :padding="14" :radius="14" style="width: 100%;">
      <TxTransition :preset="preset" group tag="div" :duration="180" style="display: grid; gap: 10px;">
        <div
          v-for="item in list"
          :key="item.id"
          style="padding: 10px 12px; border-radius: 12px; border: 1px solid var(--tx-border-color-lighter); background: var(--tx-fill-color-blank);"
        >
          {{ item.text }}
        </div>
      </TxTransition>
    </TxCard>
  </div>
</template>
