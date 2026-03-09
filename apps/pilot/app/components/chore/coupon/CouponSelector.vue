<script setup lang="ts">
const props = defineProps<{
  modelValue: string
  modalClass?: string
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const visible = ref(false)
const code = useVModel(props, 'modelValue', emits)

function handleSelectable(_code: string) {
  visible.value = false

  code.value = _code
}
</script>

<template>
  <div class="CouponList">
    <div class="CouponList-Inner" @click="visible = true">
      <el-input v-model="code" placeholder="可选" />
    </div>

    <teleport to="body">
      <el-drawer v-model="visible" :modal-class="modalClass || ''" @open="code = ''">
        <template #title>
          优惠券列表
        </template>
        <LazyChorePersonalAddonCoupons selectable @selectable="handleSelectable" />
      </el-drawer>
    </teleport>
  </div>
</template>
