<script name="BrickTemplate" setup lang="ts">
const _disabled: any = inject('disabled')

const disabled = computed(() => _disabled.value)
console.log("a", disabled)
</script>

<template>
  <div :class="{ disabled }" mr-6 border-solid border rounded-lg relative inline-block px-4 w-60 h-32 class="BrickTemplate color-template fake-background">
    <slot>
      <p>
        <div inline-block mr-2 class="i-simple-icons-remix" />Template
      </p>
      <span text-sm>
        This is a template brick template.
      </span>
      <button cursor-pointer bg-transparent class="color-template fake-background" border-solid border rounded px-2
        py-1 my-2>Open in window</button>
    </slot>
  </div>
</template>

<style lang="scss">
.BrickTemplate.disabled button {
  &:hover {
    cursor: not-allowed;
    background-color: var(--el-color-danger)
  }
}
</style>