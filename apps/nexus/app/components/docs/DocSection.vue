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
    <NuxtLink
      v-if="linkable"
      :to="link"
      class="DocSection-Header group w-full flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-sm font-medium transition-colors text-inherit no-underline"
      :class="active 
        ? 'bg-primary/10 text-primary dark:bg-primary/20' 
        : 'text-black/70 hover:bg-black/5 hover:text-black dark:text-white/70 dark:hover:bg-white/5 dark:hover:text-white'"
      @click="emit('click')"
    >
      <span class="truncate">
        <slot name="header" />
      </span>
    </NuxtLink>
    <button
      v-else
      type="button"
      class="DocSection-Header group w-full flex cursor-pointer items-center justify-between rounded-md px-2.5 py-2 text-xs font-semibold tracking-wider text-black/40 uppercase transition-colors dark:text-white/40"
      :aria-expanded="active"
      @click="emit('click')"
    >
      <span class="truncate">
        <slot name="header" />
      </span>
      <span
        class="i-carbon-chevron-right text-[10px] transition-transform duration-200"
        :class="active ? 'rotate-90 opacity-60' : 'opacity-30 group-hover:opacity-60'"
      />
    </button>
    
    <div
      class="grid transition-[grid-template-rows] duration-300 ease-out"
      :style="{ gridTemplateRows: active && list > 0 ? '1fr' : '0fr' }"
    >
      <div class="overflow-hidden">
        <ul class="m-0 flex flex-col list-none gap-0.5 py-1 pl-1">
          <slot />
        </ul>
      </div>
    </div>
  </div>
</template>

