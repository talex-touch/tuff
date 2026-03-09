<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  disabled?: boolean
  loading?: boolean
  methods: any
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const model = useVModel(props, 'modelValue', emits)
</script>

<template>
  <div v-if="!disabled" v-loading="loading" class="PaymentsCard">
    <p>支付方式</p>
    <ul>
      <li
        v-for="payment in methods" :key="payment.value"
        :class="{ active: model === payment.value, disabled: payment?.disabled() || loading }"
        @click="model = payment.value"
      >
        <img :src="payment.svg">{{ payment.name }}
      </li>
    </ul>
  </div>
</template>

<style lang="scss">
.PaymentsCard {
  ul {
    li {
      &.active {
        border: 2px solid var(--theme-color);
      }

      &.disabled {
        opacity: 0.75;
        pointer-events: none;
      }

      padding: 0.5rem 1rem;

      display: flex;
      align-items: center;
      gap: 0.5rem;

      img {
        width: 1.5rem;
        height: 1.5rem;

        .dark & {
          filter: invert(1);
        }
      }

      cursor: pointer;
      border-radius: 16px;
      background-color: var(--el-bg-color-page);

      transition: 0.25s;
      border: 2px solid #0000;
    }

    display: flex;

    gap: 1rem;

    flex-wrap: wrap;
  }
}

@media (max-width: 768px) {
  .PaymentsCard {
    ul {
      flex-direction: column;
      li {
        justify-content: flex-start !important;
      }
    }
  }
}
</style>
