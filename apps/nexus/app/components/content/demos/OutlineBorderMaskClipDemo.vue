<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxOutlineBorder
          variant="ring"
          :ring-width="2"
          ring-color="var(--tx-color-primary)"
          clip-mode="mask"
          clip-shape="hexagon"
        >
          <img
            src="https://avatars.githubusercontent.com/u/3?v=4"
            style="width:48px;height:48px;object-fit:cover;"
          >
        </TxOutlineBorder>
  </div>
  <div v-else>
        <TxOutlineBorder
          variant="ring"
          :ring-width="2"
          ring-color="var(--tx-color-primary)"
          clip-mode="mask"
          clip-shape="hexagon"
        >
          <img
            src="https://avatars.githubusercontent.com/u/3?v=4"
            style="width:48px;height:48px;object-fit:cover;"
          >
        </TxOutlineBorder>
  </div>
</template>
