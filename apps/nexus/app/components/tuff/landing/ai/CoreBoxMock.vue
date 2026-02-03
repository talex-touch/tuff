<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Logo from '../../../icon/Logo.vue'

export interface CoreBoxCommand {
  id: string
  label: string
  icon?: string
  iconColor?: string
  description?: string
}

const props = withDefaults(defineProps<{
  commands?: CoreBoxCommand[]
  inputText?: string
  placeholder?: string
  selectedId?: string | null
  showResults?: boolean
  showInput?: boolean
  resultsTitle?: string
  showLogo?: boolean
  footer?: string
}>(), {
  commands: () => [],
  inputText: '',
  placeholder: '',
  selectedId: null,
  showResults: true,
  showInput: true,
  resultsTitle: '',
  showLogo: true,
  footer: '',
})

const emit = defineEmits<{
  (e: 'select', command: CoreBoxCommand): void
}>()

const selectedIndex = ref(0)

const selectedCommand = computed(() => {
  if (props.selectedId) {
    const idx = props.commands.findIndex(c => c.id === props.selectedId)
    if (idx >= 0)
      return props.commands[idx]
  }
  return props.commands[selectedIndex.value]
})

watch(() => props.selectedId, (newId) => {
  if (newId) {
    const idx = props.commands.findIndex(c => c.id === newId)
    if (idx >= 0)
      selectedIndex.value = idx
  }
})

function handleSelect(command: CoreBoxCommand, index: number) {
  selectedIndex.value = index
  emit('select', command)
}
</script>

<template>
  <div class="corebox-mock">
    <!-- 输入栏 -->
    <div v-if="showInput" class="corebox-mock__input">
      <!-- Logo -->
      <div v-if="showLogo" class="corebox-mock__logo">
        <Logo />
        <!-- <svg viewBox="0 0 24 24" fill="none" class="corebox-mock__logo-icon">
          <defs>
            <linearGradient id="tuff-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#0894ff" />
              <stop offset="34%" stop-color="#c959dd" />
              <stop offset="68%" stop-color="#ff2e54" />
              <stop offset="100%" stop-color="#ff9004" />
            </linearGradient>
          </defs>
          <path
            d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
            stroke="url(#tuff-gradient)"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg> -->
      </div>
      <!-- 输入文本 -->
      <div class="corebox-mock__input-text">
        <span v-if="inputText" class="corebox-mock__input-value">{{ inputText }}</span>
        <span v-else class="corebox-mock__input-placeholder">{{ placeholder }}</span>
      </div>
      <!-- 后缀插槽 -->
      <div v-if="$slots['input-suffix']" class="corebox-mock__input-suffix">
        <slot name="input-suffix" />
      </div>
    </div>

    <!-- 结果列表 -->
    <Transition name="results-fade">
      <div v-if="showResults && commands.length > 0" class="corebox-mock__results">
        <div v-if="resultsTitle" class="corebox-mock__results-title">
          {{ resultsTitle }}
        </div>
        <div class="corebox-mock__list">
          <button
            v-for="(command, index) in commands"
            :key="command.id"
            type="button"
            class="corebox-mock__item"
            :class="{ 'is-selected': selectedCommand?.id === command.id }"
            @click="handleSelect(command, index)"
          >
            <span
              v-if="command.icon"
              :class="command.icon"
              class="corebox-mock__item-icon"
              :style="command.iconColor ? { color: command.iconColor } : {}"
            />
            <div class="corebox-mock__item-content">
              <span class="corebox-mock__item-label">{{ command.label }}</span>
              <span v-if="command.description" class="corebox-mock__item-desc">{{ command.description }}</span>
            </div>
          </button>
        </div>
      </div>
    </Transition>

    <!-- 内容插槽 -->
    <div class="corebox-mock__content">
      <slot />
    </div>

    <!-- 底部信息 -->
    <Transition name="footer-fade">
      <div v-if="footer" class="corebox-mock__footer">
        {{ footer }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.corebox-mock {
  background: rgba(20, 20, 25, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  backdrop-filter: blur(24px);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.03),
    0 20px 50px -10px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  min-width: 320px;
}

.corebox-mock__input {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.corebox-mock__logo {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
}

.corebox-mock__logo-icon {
  width: 100%;
  height: 100%;
}

.corebox-mock__input-text {
  flex: 1;
  min-width: 0;
  font-size: 0.9375rem;
  line-height: 1.4;
}

.corebox-mock__input-value {
  color: rgba(255, 255, 255, 0.9);
}

.corebox-mock__input-placeholder {
  color: rgba(255, 255, 255, 0.35);
}

.corebox-mock__input-suffix {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}

.corebox-mock__results {
  padding: 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.corebox-mock__results-title {
  font-size: 0.6875rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.35);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.5rem 0.625rem 0.375rem;
}

.corebox-mock__list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.corebox-mock__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.75rem;
  border-radius: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
  width: 100%;
}

.corebox-mock__item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.corebox-mock__item.is-selected {
  background: rgba(139, 92, 246, 0.15);
}

.corebox-mock__item-icon {
  font-size: 1.125rem;
  color: rgba(255, 255, 255, 0.6);
  flex-shrink: 0;
}

.corebox-mock__item.is-selected .corebox-mock__item-icon {
  color: rgba(139, 92, 246, 0.9);
}

.corebox-mock__item-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.corebox-mock__item-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.corebox-mock__item.is-selected .corebox-mock__item-label {
  color: #fff;
}

.corebox-mock__item-desc {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.corebox-mock__content {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.corebox-mock__content:empty {
  display: none;
}

.corebox-mock__footer {
  padding: 0.625rem 1rem;
  font-size: 0.6875rem;
  color: rgba(255, 255, 255, 0.3);
  text-align: center;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(255, 255, 255, 0.02);
}

/* 过渡动画 */
.results-fade-enter-active,
.results-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.results-fade-enter-from,
.results-fade-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.results-fade-enter-to,
.results-fade-leave-from {
  max-height: 500px;
}

.footer-fade-enter-active,
.footer-fade-leave-active {
  transition: all 0.3s ease;
}

.footer-fade-enter-from,
.footer-fade-leave-to {
  opacity: 0;
}
</style>
