<script setup lang="ts">
withDefaults(defineProps<{
  text: string
  active?: boolean
}>(), {
  active: true,
})
</script>

<template>
  <span class="ShimmerText" :class="{ active }">{{ text }}</span>
</template>

<style scoped>
.ShimmerText {
  display: inline;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  color: var(--el-text-color-primary);
  font: inherit;
  line-height: inherit;
  vertical-align: baseline;
}

.ShimmerText.active {
  color: transparent;
  -webkit-text-fill-color: transparent;
  background-image: linear-gradient(
    110deg,
    var(--el-text-color-primary) 12%,
    color-mix(in srgb, var(--el-color-primary) 64%, white) 46%,
    var(--el-text-color-primary) 82%
  );
  background-size: 200% 100%;
  background-repeat: no-repeat;
  background-clip: text;
  -webkit-background-clip: text;
  animation: ShimmerTextFlow 1.4s linear infinite;
}

@keyframes ShimmerTextFlow {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}
</style>
