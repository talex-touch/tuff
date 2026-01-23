<script setup lang="ts">
interface GlassIconsItem {
  icon: string
  color: string
  label: string
  customClass?: string
}

interface Props {
  items?: GlassIconsItem[]
  className?: string
}

withDefaults(defineProps<Props>(), {
  items: () => [],
  className: '',
})

const gradientMapping: Record<string, string> = {
  blue: 'linear-gradient(hsl(223, 90%, 50%), hsl(208, 90%, 50%))',
  purple: 'linear-gradient(hsl(283, 90%, 50%), hsl(268, 90%, 50%))',
  red: 'linear-gradient(hsl(3, 90%, 50%), hsl(348, 90%, 50%))',
  indigo: 'linear-gradient(hsl(253, 90%, 50%), hsl(238, 90%, 50%))',
  orange: 'linear-gradient(hsl(43, 90%, 50%), hsl(28, 90%, 50%))',
  green: 'linear-gradient(hsl(123, 90%, 40%), hsl(108, 90%, 40%))',
}

function getBackgroundStyle(color: string): Record<string, string> {
  if (gradientMapping[color]) {
    return { background: gradientMapping[color] }
  }
  return { background: color }
}
</script>

<template>
  <div class="grid grid-cols-2 mx-auto gap-[5em] overflow-visible py-[3em] md:grid-cols-3" :class="[className]">
    <button
      v-for="(item, index) in items"
      :key="index"
      type="button"
      :aria-label="item.label"
      class="group [-webkit-tap-highlight-color:transparent] [perspective:24em] [transform-style:preserve-3d] relative h-[4.5em] w-[4.5em] bg-transparent outline-none" :class="[
        item.customClass,
      ]"
    >
      <span
        class="absolute left-0 top-0 block h-full w-full origin-[100%_100%] rotate-[15deg] rounded-[1.25em] transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.83,0,0.17,1)] group-hover:[transform:rotate(25deg)_translate3d(-0.5em,-0.5em,0.5em)]"
        :style="{
          ...getBackgroundStyle(item.color),
          boxShadow: '0.5em -0.5em 0.75em hsla(223, 10%, 10%, 0.15)',
        }"
      />

      <span
        class="[-webkit-backdrop-filter:blur(0.75em)] absolute left-0 top-0 h-full w-full flex origin-[80%_50%] transform rounded-[1.25em] bg-[hsla(0,0%,100%,0.15)] backdrop-blur-[0.75em] transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.83,0,0.17,1)] group-hover:[transform:translateZ(2em)]"
        :style="{
          boxShadow: '0 0 0 0.1em hsla(0, 0%, 100%, 0.3) inset',
        }"
      >
        <span class="m-auto h-[1.5em] w-[1.5em] flex items-center justify-center" aria-hidden="true">
          <i :class="item.icon" class="text-xl" />
        </span>
      </span>

      <span
        class="absolute left-0 right-0 top-full translate-y-0 whitespace-nowrap text-center text-base leading-[2] opacity-0 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.83,0,0.17,1)] group-hover:[transform:translateY(20%)] group-hover:opacity-100"
      >
        {{ item.label }}
      </span>
    </button>
  </div>
</template>
