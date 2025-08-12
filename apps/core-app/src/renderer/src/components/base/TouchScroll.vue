<template>
  <div ref="scrollContainer" class="touch-scroll" :class="{ 'native-scroll': useNative }">
    <template v-if="useNative">
      <div ref="nativeScrollRef" class="native-scroll-wrapper" @scroll="handleScroll">
        <slot></slot>
      </div>
    </template>
    <template v-else>
      <el-scrollbar 
        ref="elScrollRef"
        v-bind="$attrs"
        class="el-scroll-wrapper"
        @scroll="handleScroll"
      >
        <slot></slot>
      </el-scrollbar>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElScrollbar } from 'element-plus'

defineOptions({
  name: 'TouchScroll',
})

const props = defineProps({
  native: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits<{
  scroll: [scrollInfo: { scrollTop: number, scrollLeft: number }]
}>()

const scrollContainer = ref<HTMLElement | null>(null)
const nativeScrollRef = ref<HTMLElement | null>(null)
const elScrollRef = ref<InstanceType<typeof ElScrollbar> | null>(null)

const platform = ref<string | null>(null);

const isDarwin = computed(() => {
  if (typeof window === 'undefined') return false
  
  if (window.$startupInfo) {
    return window.$startupInfo.platform === 'darwin';
  }
  
  if (platform.value) {
    return platform.value === 'darwin';
  }
  
  return false;
})

const useNative = computed(() => {
  return props.native || isDarwin.value
})

const handleScroll = (event: Event | { scrollTop: number, scrollLeft: number }) => {
  let scrollInfo = {
    scrollTop: 0,
    scrollLeft: 0
  }

  if (event instanceof Event) {
    const target = event.target as HTMLElement
    scrollInfo = {
      scrollTop: target.scrollTop,
      scrollLeft: target.scrollLeft
    }
  } else {
    scrollInfo = {
      scrollTop: event.scrollTop,
      scrollLeft: event.scrollLeft
    }
  }

  emit('scroll', scrollInfo)
}

defineExpose({
  nativeScrollRef,
  elScrollRef,
  scrollTo(x: number, y: number) {
    if (useNative.value) {
      if (nativeScrollRef.value) {
        nativeScrollRef.value.scrollTo(x, y)
      }
    } else {
      if (elScrollRef.value && elScrollRef.value.scrollTo) {
        elScrollRef.value.scrollTo(x, y)
      }
    }
  },
  getScrollInfo() {
    if (useNative.value) {
      if (nativeScrollRef.value) {
        return {
          scrollTop: nativeScrollRef.value.scrollTop,
          scrollLeft: nativeScrollRef.value.scrollLeft,
          scrollHeight: nativeScrollRef.value.scrollHeight,
          scrollWidth: nativeScrollRef.value.scrollWidth,
          clientHeight: nativeScrollRef.value.clientHeight,
          clientWidth: nativeScrollRef.value.clientWidth
        }
      }
    } else {
      if (elScrollRef.value && (elScrollRef.value as any).wrapRef) {
        const wrap = (elScrollRef.value as any).wrapRef
        return {
          scrollTop: wrap.scrollTop,
          scrollLeft: wrap.scrollLeft,
          scrollHeight: wrap.scrollHeight,
          scrollWidth: wrap.scrollWidth,
          clientHeight: wrap.clientHeight,
          clientWidth: wrap.clientWidth
        }
      }
    }
    return {
      scrollTop: 0,
      scrollLeft: 0,
      scrollHeight: 0,
      scrollWidth: 0,
      clientHeight: 0,
      clientWidth: 0
    }
  }
})

onMounted(() => {
  if (typeof window !== 'undefined' && window.$startupInfo) {
    platform.value = window.$startupInfo.platform;
    return;
  }
  
  let retryCount = 0;
  const maxRetries = 5;
  
  const retry = () => {
    if (typeof window !== 'undefined' && window.$startupInfo) {
      platform.value = window.$startupInfo.platform;
      return;
    }
    
    if (retryCount < maxRetries) {
      retryCount++;
      setTimeout(retry, 100);
    } else {
      console.warn('Failed to get startupInfo after', maxRetries, 'attempts');
      platform.value = 'unknown';
    }
  };
  
  retry();
});
</script>

<style scoped>
.touch-scroll {
  width: 100%;
  height: 100%;
  position: relative;
}

.native-scroll-wrapper {
  width: 100%;
  height: 100%;
  overflow: auto;
  -webkit-overflow-scrolling: touch; /* For mobile devices (smooth scroll) */
}

.el-scroll-wrapper {
  width: 100%;
  height: 100%;
}

.native-scroll-wrapper::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

.native-scroll-wrapper {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}
</style>