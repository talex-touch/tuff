<script setup lang="ts">
import { computed, ref, nextTick, useSlots } from "vue";
import { useVibrate } from "../../../../utils/vibrate";
import type { ButtonProps, ButtonEmits } from "./types";

defineOptions({
  name: "TxButton",
});

const props = withDefaults(defineProps<ButtonProps>(), {
  type: undefined,
  size: undefined,
  plain: false,
  round: false,
  circle: false,
  loading: false,
  disabled: false,
  icon: undefined,
  autofocus: false,
  nativeType: "button",
  vibrate: true,
  vibrateType: "light",
});

const emit = defineEmits<ButtonEmits>();

const buttonRef = ref<HTMLButtonElement>();
const slots = useSlots();

const classList = computed(() => {
  const { type, size, plain, round, circle, loading, disabled } = props;
  return [
    "tx-button",
    {
      [`tx-button--${type}`]: type,
      [`tx-button--${size}`]: size,
      "tx-button--plain": plain,
      "tx-button--round": round,
      "tx-button--circle": circle,
      "tx-button--loading": loading,
      "tx-button--disabled": disabled,
      "tx-button--icon-only": circle && props.icon && !slots.default,
    },
  ];
});

const handleClick = (event: MouseEvent) => {
  if (props.disabled || props.loading) {
    event.preventDefault();
    return;
  }

  // 触发震动反馈
  if (props.vibrate) {
    // 根据按钮类型选择合适的震动类型
    let vibrateType = props.vibrateType;
    if (!vibrateType) {
      switch (props.type) {
        case "primary":
          vibrateType = "medium";
          break;
        case "success":
          vibrateType = "success";
          break;
        case "warning":
          vibrateType = "warning";
          break;
        case "danger":
          vibrateType = "error";
          break;
        default:
          vibrateType = "light";
      }
    }
    useVibrate(vibrateType);
  }

  emit("click", event);
};

// 自动聚焦
if (props.autofocus) {
  nextTick(() => {
    buttonRef.value?.focus();
  });
}
</script>

<template>
  <button
    ref="buttonRef"
    :class="classList"
    :type="nativeType"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <!-- 加载图标 -->
    <span v-if="loading" class="tx-button__loading-icon">
      <svg class="tx-button__spinner" viewBox="0 0 24 24">
        <circle
          class="tx-button__spinner-path"
          cx="12"
          cy="12"
          r="10"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-dasharray="31.416"
          stroke-dashoffset="31.416"
        />
      </svg>
    </span>

    <!-- 图标 -->
    <span v-else-if="icon" class="tx-button__icon">
      <i :class="`tx-icon-${icon}`" />
    </span>

    <!-- 按钮内容 -->
    <span v-if="$slots.default && !circle" class="tx-button__text">
      <slot />
    </span>

    <!-- 圆形按钮只显示图标，不显示文字 -->
    <slot v-else-if="!circle" />
  </button>
</template>
