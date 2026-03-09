<script setup lang="ts">
import ShareToolbox from './share/ShareToolbox.vue'

const props = defineProps<{
  show: boolean
  length: number
}>()

const share: any = (inject('pageOptions')! as any).share

const check = ref(false)
function toggleAllSelect() {
  share.selected = !check.value ? [...Array(props.length).keys()] : []
}

watch(() => share.selected, (val) => {
  nextTick(() => (check.value = val.length === props.length))
}, { deep: true, immediate: true })
</script>

<template>
  <div :class="{ show, expand: share.selected.length > 0 }" class="ShareSection">
    <div class="Share-Select" flex cursor-pointer select-none items-center gap-2 @click="toggleAllSelect">
      <el-checkbox v-model="check" :indeterminate="share.selected.length > 0 && share.selected.length < props.length" :checked="(share.selected.length > 0 && share.selected.length === props.length)" @change="toggleAllSelect" />
      全选所有消息
    </div>
    <div class="Share-Funcs">
      <ShareToolbox :show="share.selected.length > 0" />
    </div>
    <div flex items-center justify-end gap-1 class="Share-Mention">
      已选择 <OtherNumberTransformer :value="share.selected.length" /> 条消息
    </div>
  </div>
</template>

<style lang="scss">
.ShareSection {
  &.expand {
    height: 80px;
  }
  &.show {
    visibility: unset;
    transform: translate(-50%, 0);
  }

  .Share-Select,
  .Share-Mention {
    // flex: 1;
    width: 140px;
  }

  z-index: 3;
  position: absolute;
  padding: 0.5rem 2rem;
  display: flex;

  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;

  left: 50%;
  bottom: 2.5%;

  width: 720px;
  max-width: 90%;
  height: 50px;

  font-size: 14px;
  color: var(--el-text-color-secondary);

  border-radius: 16px;
  box-sizing: border-box;
  box-shadow: var(--el-box-shadow);
  background-color: var(--el-bg-color);

  visibility: hidden;
  transform: translate(-50%, 200%);
  transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}
</style>
