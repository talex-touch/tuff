<script setup lang="ts">
import ShiningButton from '~/components/button/ShiningButton.vue'
import { price } from '~/constants/price'

const router = useRouter()

const tableData = [
  {
    id: 'QuotaGPT 标准模型',
    free: true,
    standard: true,
    ultimate: true,
  },
  {
    id: 'QuotaGPT 强化模型',
    free: false,
    standard: true,
    ultimate: true,
  },
  {
    id: 'QuotaGPT 高级模型',
    free: false,
    standard: false,
    ultimate: true,
  },
  {
    id: '科塔大模型 工具包矩阵',
    free: false,
    standard: true,
    ultimate: true,
  },
  {
    id: '科塔大模型·百变角色',
    free: '每日3次',
    standard: '不限量使用',
    ultimate: '不限量使用',
  },
  {
    id: '上下文限制',
    free: '32k tokens',
    standard: '128k tokens',
    ultimate: '256k tokens',
  },
  {
    id: '文档阅读',
    info: '文档阅读正在制作中，敬请期待',
    free: '64MB / 月',
    standard: '1GB / 月',
    ultimate: '8GB / 月',
  },
  {
    id: '图片分析',
    info: '图片分析正在制作中，敬请期待',
    free: '2张 / 日',
    standard: '32张 / 日',
    ultimate: '512张 / 日',
  },
  {
    id: '图片生成',
    free: '512张 / 日',
    standard: '暂不支持',
    ultimate: '暂不支持',
  },
  {
    id: '科塔智能体',
    info: '科塔智能体正在制作中，敬请期待',
    free: false,
    standard: true,
    ultimate: true,
  },
  {
    id: '自定义墙纸',
    free: 'Zakaria',
    standard: '全部',
    ultimate: '全部',
  },
  {
    id: '高级数据分析',
    info: '高级数据分析正在制作中，敬请期待',
    free: false,
    standard: true,
    ultimate: true,
  },
  {
    id: '静态图表生成',
    free: true,
    standard: true,
    ultimate: true,
  },
  {
    id: '数学公式渲染',
    free: true,
    standard: true,
    ultimate: true,
  },
  {
    id: '情境感知',
    info: '基础情境感知正在制作中，敬请期待',
    free: '基础情境感知',
    standard: '情境情绪感知',
    ultimate: '全面情境情绪感知',
  },
  {
    id: '基础情境感知',
    info: '基础情境感知正在制作中，敬请期待',
    free: true,
    standard: true,
    ultimate: true,
  },
  {
    id: '创作素材库',
    info: '创作素材库正在制作中，敬请期待',
    free: false,
    standard: true,
    ultimate: true,
  },
  {
    id: '信息加密分享',
    info: '信息加密分享正在制作中，敬请期待',
    free: false,
    standard: true,
    ultimate: true,
  },
]

function handleBuy() {
  // router.push({
  //   path: '/buy',
  //   query: {
  //     type: 'SUBSCRIPTION',
  //     plan: 'STANDARD',
  //     time: 'MONTH',
  //   },
  // })

  const url = new URL(window.location.origin)

  url.pathname = '/buy'
  url.searchParams.set('type', 'SUBSCRIPTION')
  url.searchParams.set('plan', 'STANDARD')
  url.searchParams.set('time', 'MONTH')

  window.open(url.toString(), '_blank')
}
</script>

<template>
  <div class="PlanWrapper">
    <div class="PlanWrapper-Header">
      <el-page-header title="返回" @back="router.back()">
        <template #content>
          <span class="text-large mr-3 font-600">
            选择订阅
          </span>
        </template>
      </el-page-header>
    </div>

    <div class="PlanWrapper-Main">
      <el-alert title="价格以结算页面最终价格为准。" type="warning" close-text="了解" />

      <br>

      <h1>简单，透明，高性价比计划</h1>
      <p>立即开始提升你的办公效率、生活体验</p>

      <div class="PlanWrapper-Main-Plan">
        <!-- :span-method="objectSpanMethod" -->
        <el-table height="85%" stripe :data="tableData" style="width: 100%; margin-top: 20px">
          <el-table-column prop="id" label="权益对比" width="180">
            <template #default="{ row }">
              <div flex items-center gap-1 text-sm op-50>
                {{ row.id }}
                <el-tooltip v-if="row.info" :content="row.info">
                  <div i-carbon:information />
                </el-tooltip>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="free" label="免费订阅">
            <template #default="{ row }">
              <span v-if="row.free?.length" class="text symbol emphasis">
                {{ row.free }}
              </span>
              <span v-else-if="row.free" class="symbol emphasis">
                <i i-carbon:checkmark block />
              </span>
              <span v-else class="symbol">
                <i i-carbon:close block />
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="standard" label="标准订阅">
            <template #default="{ row }">
              <span v-if="row.standard?.length" class="text symbol emphasis standard">
                {{ row.standard }}
              </span>
              <span v-else-if="row.standard" class="symbol emphasis standard">
                <i i-carbon:checkmark block />
              </span>
              <span v-else class="symbol standard">
                <i i-carbon:close block />
              </span>
            </template>
            <template #header>
              <span flex flex-col justify-center>
                标准订阅
                <span class="pricing">
                  <span>
                    <span class="unit">￥</span>9.99<span class="origin-price">(29.99)</span> <small>/ 月</small>

                  </span>
                  <span class="pricing origin">
                    3.3 折
                  </span>
                </span>
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="ultimate" label="高级订阅">
            <template #default="{ row }">
              <span v-if="row.ultimate?.length" class="text symbol emphasis ultimate">
                {{ row.ultimate }}
              </span>
              <span v-else-if="row.ultimate" class="symbol emphasis ultimate">
                <i i-carbon:checkmark block />
              </span>
              <span v-else class="symbol ultimate">
                <i i-carbon:close block />
              </span>
            </template>
            <template #header>
              高级订阅
              <span class="pricing">
                <span>
                  <span class="unit">￥</span>54<span class="origin-price">(69)</span> <small>/ 月</small>

                </span>
                <span class="pricing origin">
                  7.8 折
                </span>
              </span>
            </template>
          </el-table-column>
        </el-table>
        <!-- <PlanCard
            v-for="plan in plans" :key="plan.name" :got="plan.got" :type="plan.type" :desc="plan.desc"
            :name="plan.name" :price="plan.price" @click="toCheckout(plan)"
          >
            <li v-for="feature in plan.features" :key="feature">
              {{ feature }}
            </li>
          </PlanCard> -->
      </div>
    </div>

    <ShiningButton
      mb-4 @click="handleBuy"
    >
      立即订阅 PRO
    </ShiningButton>
  </div>
</template>

<style lang="scss" scoped>
.pricing {
  &.origin {
    font-weight: 600;
    color: #f4d553;
    text-shadow: 0 0 4px #000e;
  }

  .origin-price {
    margin: 0 5px;

    opacity: 0.75;
    text-decoration: line-through;
  }

  .unit {
    position: relative;

    top: -2.5px;
    margin-right: 2.5px;

    font-size: 0.75em;
  }

  // width: max-content;
  // backdrop-filter: blur(18px) saturate(180%) brightness(90%);
  /* background: var(--theme-color-light); */

  gap: 0.5rem;
  display: flex;
  align-items: center;
  font-weight: 600;
  // padding: 0.25rem 0.5rem;
  // margin: 0 0 0.25rem;

  border-radius: 12px;
}

.PlanWrapper-Main-Plan :deep(.el-table) {
  .symbol {
    &.emphasis {
      opacity: 1;
    }

    &.standard {
      --c: #306df7e0;
    }

    &.ultimate {
      --c: #299b48e0;
    }

    &.text {
      font-weight: normal;
      font-size: 12px;
      transform: scale(1, 1);
    }

    font-size: 24px;
    color: var(--c);
    font-weight: 600;

    opacity: 0.5;
    transform: scale(0.75, 0.8);
  }

  .cell {
    & > span {
      display: flex;

      justify-content: center;
    }
    text-align: center;
  }
}

.PlanWrapper-Main-Plan {
  padding: 1rem 0;
  display: flex;

  height: 100%;

  overflow: hidden;
  justify-content: center;
}

.PlanWrapper-Main {
  width: 70%;
  max-width: 1440px;

  height: 80%;

  overflow: hidden;
  border-radius: 8px;
  background-color: var(--el-bg-color);
}

.PlanWrapper {
  position: absolute;
  display: flex;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  align-items: center;
  flex-direction: column;
  justify-content: space-between;
  background-color: var(--el-bg-color-page);
}

div.PlanWrapper-Header {
  position: relative;
  padding: 1rem;
  display: flex;

  flex-direction: row;

  justify-content: space-between;
  align-items: center;

  top: 0;
  width: 100%;

  background-color: var(--el-bg-color);
}

.PlanWrapper-Main {
  h1 {
    font-size: 24px;
    font-weight: 600;
  }

  p {
    margin: 0.5rem 0;

    opacity: 0.75;
    font-weight: 400;
  }

  // height: 800px;

  text-align: center;
}
</style>
