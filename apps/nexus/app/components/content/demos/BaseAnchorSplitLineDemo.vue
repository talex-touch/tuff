<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const open = ref(false)

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      trigger: '箭头定位',
      content: '通过 content 插槽的 arrowRef / arrowStyle 渲染指示箭头。',
    }
  }

  return {
    trigger: 'Arrow',
    content: 'Render the directional arrow with slot props from the anchor core.',
  }
})
</script>

<template>
  <TxBaseAnchor
    v-model="open"
    placement="bottom-start"
    :offset="12"
    :show-arrow="true"
    :arrow-size="10"
  >
    <template #reference>
      <TxButton @click="open = !open">
        {{ labels.trigger }}
      </TxButton>
    </template>

    <template #content="{ arrowRef, arrowStyle, arrowSide }">
      <div
        :ref="arrowRef"
        class="anchor-arrow"
        :data-side="arrowSide"
        :style="arrowStyle"
      />
      <TxCard shadow="soft" :radius="14" :padding="12" style="width: 260px;">
        {{ labels.content }}
      </TxCard>
    </template>
  </TxBaseAnchor>
</template>

<style lang="scss" scoped>
.anchor-arrow {
  width: 10px;
  height: 10px;
  background: var(--tx-bg-color-overlay, #fff);
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
  border-radius: 2px;
  transform: rotate(45deg);
}
</style>
