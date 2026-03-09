<script setup lang="ts">
import type { IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'

const props = defineProps<{
  block: IInnerItemMeta
}>()

const data = computed(() => JSON.parse(props.block.data || '{}'))
</script>

<template>
  <div class="MultiAgentJumpCard">
    <div class="CardLine" />
    <el-tooltip :content="data.condition">
      <div class="Agent-Name">
        已由
        <div i-carbon:navaid-military />
        {{ data.agent_name }}
        接管任务
      </div>
    </el-tooltip>
    <div class="CardLine reverse" />
  </div>
</template>

<style lang="scss" scoped>
.MultiAgentJumpCard {
  .Agent-Name {
    display: flex;

    gap: 0.25rem;
    opacity: 0.75;
    cursor: pointer;
    font-size: 14px;
    align-items: center;
    color: var(--el-text-color-secondary);
  }
  .CardLine {
    &.reverse {
      background-image: linear-gradient(
        to right,
        var(--el-text-color-secondary) 10%,
        transparent
      );
    }
    position: relative;

    flex: 1;

    min-width: 5px;
    height: 1px;

    opacity: 0.75;
    background-image: linear-gradient(
      to left,
      var(--el-text-color-secondary) 10%,
      transparent
    );
  }
  position: relative;
  margin: 12px 0;
  display: flex;

  gap: 0.5rem;
  align-items: center;

  width: 100%;
  max-width: 70%;

  text-align: center;

  animation: cubic-bezier(0.25, 0.46, 0.45, 0.94) enter 0.25s;
}

@keyframes enter {
  from {
    opacity: 0;
    filter: blur(5px);
    transform: translateX(-1%);
  }

  to {
    opacity: 1;
    filter: blur(0);
    transform: translateX(0);
  }
}
</style>
