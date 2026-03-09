<script setup lang="ts">
import { getCouponList, userBindCoupon } from '~/composables/api/account'

const props = defineProps<{
  selectable?: boolean
}>()

const emits = defineEmits<{
  (e: 'selectable', value: string): void
}>()

const bindModel = ref('')
const coupons = reactive<any>([])

// 把coupons按照顺序排列
// 1. endDate快到的（临期最前） 2. 其余都按照updatedAt 排序
const orderedCoupons = computed(() => {
  // const now = Date.now()

  const res = [...coupons].sort((a: any, b: any) => {
    // 如果已经使用过或者已经失效了 直接放到最后
    if (a.usedCount >= a.maxUsage || a.endDate && new Date(a.endDate).getTime() < new Date().getTime())
      return 1

    if (a.endDate && b.endDate)
      return new Date(a.endDate).getTime() - new Date(b.endDate).getTime()

    else if (a.endDate)
      return -1

    else if (b.endDate)
      return 1

    else
      return new Date(b.updatedAt).getTime() - new Date().getTime()
  })

  if (props.selectable)
    return res.filter(item => item.usedCount < item.maxUsage && (!item.endDate || new Date(item.endDate).getTime() >= new Date().getTime()))

  return res
})

onMounted(async () => {
  Object.assign(coupons, (await getCouponList()).data)
})

async function bindCouponCode() {
  if (bindModel.value?.length !== 35 && bindModel.value?.length !== 22) {
    ElMessage({
      message: `优惠券码格式不正确！`,
      grouping: true,
      type: 'error',
      plain: true,
    })
    return
  }

  const res: any = await userBindCoupon(bindModel.value)

  if (!res.data) {
    ElMessage({
      message: `绑定失败(${res.message || 'error'})！`,
      grouping: true,
      type: 'error',
      plain: true,
    })
    return
  }

  coupons.push(res.data)

  ElMessage({
    message: `绑定成功！`,
    grouping: true,
    type: 'success',
    plain: true,
  })
}

function handleSelectable(couponCode: string) {
  if (!props.selectable)
    return

  emits('selectable', couponCode)

  ElMessage({
    message: '已选择该优惠券！',
    grouping: true,
    type: 'success',
    plain: true,
  })
}
</script>

<template>
  <div class="Coupons">
    <div class="CouponsHeader">
      <el-input v-model="bindModel" placeholder="绑定优惠券" />
      <el-button @click="bindCouponCode">
        绑定
      </el-button>
    </div>

    <div class="CouponsList">
      <!-- <el-scrollbar> -->
      <div v-if="coupons.length" class="CouponsList-Wrapper">
        <CardCouponCard
          v-for="coupon in orderedCoupons"
          :key="coupon.id"
          :selectable="selectable"
          :disabled="coupon.usedCount >= coupon.maxUsage || coupon.endDate && new Date(coupon.endDate).getTime() < new Date().getTime()" :code="coupon.mainCode" :new-users-only="coupon.newUserOnly"
          @click="handleSelectable(coupon.mainCode)"
        >
          <template #price>
            <span v-if="coupon.discountAmount > 0">
              <template v-if="coupon.discountAmount >= 10000">
                {{ (coupon.discountAmount / 100).toFixed(0) }}
              </template>
              <template v-else>
                {{ (coupon.discountAmount / 100).toFixed(2) }}
              </template>
            </span>
            <span v-else>{{ coupon.discountAmount }}%</span>
          </template>
          <template #getTime>
            <span v-if="coupons.endDate">
              {{ formatDate(coupon.endDate, 'YYYY-MM-DD') }}
            </span>
            <span v-else>无时间限制</span>
          </template>
          <template #badge>
            <span v-if="coupon.stackable">可叠加</span>
            <span v-if="coupon.newUserOnly">新用户专享</span>
          </template>
          <template #content>
            <p class="title">
              <span v-if="coupon.minimumSpend === 1">无门槛</span>
              <span v-else-if="coupon.minimumSpend > 1">
                满{{ coupon.minimumSpend }}元可用
              </span>
            </p>

            <p class="subtitle">
              <span v-if="!coupon.maximumDiscount">抵扣无上限</span>
              <span v-else-if="coupon.maximumDiscount > 1">
                最多抵扣{{ (coupon.maximumDiscount / 100).toFixed(2) }}元
              </span>
              <span v-else>最多抵扣{{ coupon.maximumDiscount }}%</span>
            </p>
          </template>
        </CardCouponCard>

        <span op-50>共计 {{ orderedCoupons.length }} 个<span v-if="selectable">可用</span>券码.</span>
      </div>
      <el-empty v-else description="暂无优惠券" />
      <!-- </el-scrollbar> -->
    </div>
  </div>
</template>

<style lang="scss">
.Coupons {
  &List {
    &-Wrapper {
      display: flex;

      width: 100%;

      gap: 1rem;
      align-items: center;
      flex-direction: column;
    }

    margin: 1rem 0;
  }

  &Header {
    display: flex;

    gap: 0.5rem;
  }
}
</style>
