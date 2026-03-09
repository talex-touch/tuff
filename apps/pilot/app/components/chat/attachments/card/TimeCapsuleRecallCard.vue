<script setup lang="ts">
import type { IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'

const props = defineProps<{
  block: IInnerItemMeta
}>()

const data = computed(() => JSON.parse(props.block.data || '{}'))
</script>

<template>
  <div v-if="data.wraped_text" class="MultiAgentJumpCard">
    <div class="CardLine" />
    <el-tooltip :content="data.condition">
      <div class="Agent-Name">
        {{ data.wraped_text }}
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
    color: var(--el-text-color-secondary);
    cursor: pointer;
    align-items: center;
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
}
</style>
