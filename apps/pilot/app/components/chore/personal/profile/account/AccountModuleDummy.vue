<script setup lang="ts">
import PlanCard from '~/components/card/PlanCard.vue'
import { getOrderList } from '~/composables/api/account'
import { price } from '~/constants/price'

const drawerVisible = ref(false)
const plans = computed(() => price.map((item, index) => ({
  ...item,
  price: {
    discount: item.price.discounted / item.price.origin,
    saved: item.price.origin - item.price.discounted,
    ...item.price,
  },
  got: !index,
})))

const orderList = ref<any[]>([])

async function fetchData() {
  const res = await getOrderList()

  orderList.value = res.data
}

onMounted(fetchData)

function tableRowClassName({ row, rowIndex }: any) {
  if (row.status === 1)
    return 'success-row'

  else if (row.status === 0)
    return 'warning-row'
  else if (row.status === 3)
    return 'error-row'

  return ''
}

function handleViewOrder(id: string) {
  window.open(`${window.origin}/buy?orderId=${id}`, '_blank')
}

const cards = [100, 500, 1000, 2000, 5000, 10000, 50000, 0]
const active = ref(0)
const amo = ref(0)

watch(active, () => amo.value = cards[active.value])

function redirectToCheckout() {
  location.replace(`${window.origin}/buy?type=DUMMY&value=${amo.value}`)
}
</script>

<template>
  <div class="TouchDialog-Title">
    <div i-carbon:cloud />钱包余额
  </div>
  <el-scrollbar>
    <div class="ModuleDummy TouchDialog-Content">
      <div flex justify-between class="ProfileWrapper-Header">
        <p class="title-theme">
          充值余额
        </p>
        <el-link type="primary" @click="drawerVisible = true">
          订单管理
        </el-link>
      </div>

      <div class="ProfileWrapper-Main">
        <div class="Dummy-Cards">
          <div
            v-for="(i, index) in cards" :key="i" v-wave :class="{ active: active === index }"
            class="dummy-card transition-cubic" @click="active = index"
          >
            <div flex items-center gap-2 class="dummy-card-title">
              <template v-if="i === 0">
                自定义
              </template>
              <template v-else>
                {{ i }}
                <div i-carbon:cloud />
              </template>
            </div>
            <p v-if="i !== 0" class="dummy-card-price">
              <span class="tag">￥</span>{{ (i / 100).toFixed(2) }}
            </p>
          </div>
        </div>
        <br>
        <el-input-number v-model="amo" :disabled="active !== 7" style="width: 100%" :min="1" :max="1000000">
          <template #prefix>
            <div i-carbon:cloud />
          </template>
        </el-input-number>

        <div my-2 class="Price">
          预计价格：
          <span class="display-price"><span class="tag">￥</span>{{ (+amo / 100).toFixed(2) }}</span>
        </div>

        <el-button my-2 w-full type="primary" style="background-color: var(--theme-color)" @click="redirectToCheckout">
          开始结账
        </el-button>
      </div>

      <el-drawer v-model="drawerVisible" size="90%">
        <template #title>
          订单列表
        </template>

        <div class="PlanWrapper-List">
          <!-- el-table -->
          <el-table height="400" :row-class-name="tableRowClassName" size="small" :data="orderList">
            <!-- <el-table-column label="订单号" prop="id" /> -->
            <el-table-column label="订单名" prop="description" />
            <!-- <el-table-column label="订单内容">
            <template #default="{ row }">
              {{ row.items.length }}项
            </template>
          </el-table-column> -->
            <!-- <el-table-column label="状态">
            <template #default="{ row }">
              <span v-if="row.status === 0">待支付</span>
              <span v-if="row.status === 1">已完成</span>
              <span v-if="row.status === 2">已取消</span>
              <span v-if="row.status === 3">超时未支付</span>
              <span v-if="row.status === 4">待退款</span>
              <span v-if="row.status === 5">已退款</span>
              <span v-if="row.status === 6">审核中</span>
            </template>
          </el-table-column> -->
            <el-table-column label="价格">
              <template #default="{ row }">
                ￥{{ row.totalAmount / 100 }}
              </template>
            </el-table-column>
            <!-- <el-table-column label="支付方式">
            <template #default="{ row }">
              <span v-if="row.paymentMethod === 1">-</span>
              <span v-if="row.paymentMethod === 2">微信支付</span>
              <span v-if="row.paymentMethod === 3">*</span>
            </template>
          </el-table-column> -->
            <el-table-column label="创建时间">
              <template #default="{ row }">
                {{ formatDate(row.createdAt) }}
              </template>
            </el-table-column>
            <el-table-column fixed="right" label="查看详情">
              <template #default="{ row }">
                <el-button type="text" size="small" @click="handleViewOrder(row.id)">
                  查看
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-drawer>
    </div>
  </el-scrollbar>
</template>

<style lang="scss" scoped>
.Price {
  .display-price {
    color: var(--el-text-color-regular);
  }

  font-size: 24px;
}

.Dummy-Cards {
  .dummy-card {
    &.active {
      border: 1px solid var(--theme-color);
    }

    display: flex;
    padding: 1rem;

    flex: 1 0 150px;
    border-radius: 12px;
    border: 1px solid var(--el-border-color);

    cursor: pointer;
    align-items: center;
    flex-direction: column;
    justify-content: center;

    .dummy-card-price {
      span.tag {
        position: relative;

        font-size: 12px;
        top: -2px;
      }

      font-size: 14px;
      font-weight: 600;
      color: var(--el-text-color-secondary);
    }
  }

  position: relative;
  display: flex;
  width: 720px;
  max-width: 100%;

  gap: 0.5rem;
  flex-wrap: wrap;
}

.PlanWrapper-List {
  display: flex;

  flex-direction: column;

  gap: 1rem;
}

div.ModuleDummy {
  padding: 1rem !important;

  height: min(60vh, 720px);
  // max-height: 300px;
}
</style>
