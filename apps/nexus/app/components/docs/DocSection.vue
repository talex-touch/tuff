<script lang="ts" setup>
interface Props {
  active: boolean
  link?: string
  list?: number
}

const props = withDefaults(defineProps<Props>(), {
  link: undefined,
  list: 0,
})

const emit = defineEmits<{
  (e: 'click'): void
}>()

const linkable = computed(() => props.list <= 0)
</script>

<template>
  <div class="DocSection flex flex-col">
    <button
      type="button"
      class="DocSection-Header group w-full flex cursor-pointer items-center justify-between py-2.5 text-sm font-medium transition-colors"
      :class="active ? 'text-black dark:text-white' : 'text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white'"
      @click="emit('click')"
    >
      <span class="truncate pl-1">
        <slot v-if="!linkable" name="header" />
        <NuxtLink v-else class="text-inherit no-underline" :to="link">
          <slot name="header" />
        </NuxtLink>
      </span>

      <span
        v-if="!linkable"
        class="i-carbon-chevron-right text-[10px] transition-transform duration-200"
        :class="active ? 'rotate-90 opacity-100' : 'opacity-40 group-hover:opacity-100'"
      />
    </button>
    
    <div
      class="grid transition-[grid-template-rows] duration-300 ease-out"
      :style="{ gridTemplateRows: active && list > 0 ? '1fr' : '0fr' }"
    >
      <div class="overflow-hidden">
        <ul class="m-0 flex flex-col list-none gap-0.5 pb-2 pl-3">
          <slot />
        </ul>
      </div>
    </div>
  </div>
</template>

