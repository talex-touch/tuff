<script lang="ts" setup>
import dayjs from 'dayjs'
import * as echarts from 'echarts'
import { CaretBottom, CaretTop, Warning } from '@element-plus/icons-vue'
import NormalUser from '~/components/personal/NormalUser.vue'
import { initLinearECharts } from '~/composables/charts/chat-log.chart'

definePageMeta({
  name: '流量监控',
  layout: 'cms',
  pageTransition: {
    name: 'rotate',
  },
})

const chartRef = ref()
const chartLinearRef = ref()
const formLoading = ref(false)
const logs = ref({
  items: [],
  meta: {
    currentPage: 1,
    perPage: 10,
    total: 0,
    totalPages: 0,
    itemsPerPage: 0,
    totalItems: 0,
  },
})

const formInline = reactive({
  message_type: 0,
  model: '',
  status: '',
})

function handleReset() {
  formInline.message_type = 0
  formInline.model = ''
  formInline.status = ''
}

onMounted(fetchData)

async function fetchData() {
  if (formLoading.value)
    return

  formLoading.value = true

  const query: ChatLogQueryDto = {
    page: logs.value.meta.currentPage,
    pageSize: logs.value.meta.itemsPerPage,
    message_type: formInline.message_type,
    model: formInline.model,
    status: formInline.status,
  }

  // 过滤掉为空的值
  Object.entries(query).forEach(([key, value]) => {
    if (!value)
      delete query[key]
  })

  const res: any = (await chatAdminManager.list(query))
  if (!res) {
    ElMessage.warning('参数错误，查询失败！')
  }
  else {
    if (res.code === 200) {
      logs.value = res.data

      await onFetchDataSucceed()
    }
  }

  formLoading.value = false
}

async function onFetchDataSucceed() {
  const responseData = await chatAdminManager.statistics()

  const option = generateEChartsConfig(responseData.data)

  // 使用 ECharts 初始化图表
  const myChart = echarts.init(chartRef.value)
  myChart.setOption(option)

  const linearResponse = await chatAdminManager.consumption_statistics()

  // 使用 ECharts 初始化图表
  initLinearECharts(chartLinearRef.value, linearResponse)
}

function formatDate(date: string) {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

const statistics = ref({
  cost: {
    total: 0,
    base_cost: 0,
  },
  tokens: {
    prompt: 0,
    completion: 0,
    rate: '',
  },
  time: {
    average: 0,
    rate: 0,
  },
})

function generateEChartsConfig(data: any) {
  const logTypes = data.map((item: any) => `${item.log_model} (Type ${item.log_message_type})`)
  const averageDurations = data.map((item: any) => Number.parseFloat(item.average_duration))
  const totalPromptTokens = data.map((item: any) => Number.parseInt(item.total_prompt_tokens))
  const totalCompletionTokens = data.map((item: any) => Number.parseInt(item.total_completion_tokens))
  const totalCosts = data.map((item: any) => Number.parseFloat(item.total_cost))

  Object.assign(statistics.value, {
    time: {
      average: averageDurations.reduce((a: any, b: any) => a + b, 0) / averageDurations.length,
    },
    cost: {
      total: totalCosts.reduce((a: any, b: any) => a + b, 0) * 7,
    },
    tokens: {
      prompt: totalPromptTokens.reduce((a: any, b: any) => a + b, 0),
      completion: totalCompletionTokens.reduce((a: any, b: any) => a + b, 0),
    },
  })

  statistics.value.cost.base_cost = statistics.value.cost.total / 4
  statistics.value.tokens.rate = (statistics.value.tokens.completion / statistics.value.tokens.prompt).toFixed(4)
  statistics.value.time.rate = (statistics.value.time.average / 1000)

  const option = {
    title: {
      text: '对话日志统计信息',
      subtext: '根据消息类型和模型',
      left: 'center',
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow',
      },
    },
    legend: {
      data: ['平均消耗时间 (ms)', '总提示令牌', '总完成令牌'],
      bottom: '10%',
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: logTypes,
      axisLabel: {
        rotate: 30, // 旋转标签以提高可读性
      },
    },
    yAxis: {
      type: 'value',
      name: '数值',
      nameLocation: 'middle',
      nameGap: 30,
    },
    series: [
      {
        name: '平均消耗时间 (ms)',
        type: 'bar',
        data: averageDurations,
        itemStyle: {
          color: '#4CAF50',
        },
      },
      {
        name: '总提示令牌',
        type: 'bar',
        data: totalPromptTokens,
        itemStyle: {
          color: '#2196F3',
        },
      },
      {
        name: '总完成令牌',
        type: 'bar',
        data: totalCompletionTokens,
        itemStyle: {
          color: '#FF9800',
        },
      },
    ],
  }

  return option
}
</script>

<template>
  <el-container class="CmsLog">
    <div class="CmsLog-Statistics">
      <el-row :gutter="16">
        <el-col :span="8">
          <div class="statistic-card">
            <el-statistic :value="`${statistics.cost.total}$`">
              <template #title>
                <div style="display: inline-flex; align-items: center">
                  时间均度花销
                  <el-tooltip effect="dark" content="在时间范围内总的计入花销" placement="top">
                    <el-icon style="margin-left: 4px" :size="12">
                      <Warning />
                    </el-icon>
                  </el-tooltip>
                </div>
              </template>
            </el-statistic>
            <div class="statistic-footer">
              <div class="footer-item">
                <span>成本预估</span>
                <span class="green">
                  {{ statistics.cost.base_cost.toFixed(6) }}$
                  <el-icon>
                    <CaretTop />
                  </el-icon>
                </span>
              </div>
            </div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="statistic-card">
            <el-statistic :value="+`${statistics.tokens.completion + statistics.tokens.prompt}`">
              <template #title>
                <div style="display: inline-flex; align-items: center">
                  时间均度Tokens花销
                  <el-tooltip effect="dark" content="在时间范围内总的tokens花销" placement="top">
                    <el-icon style="margin-left: 4px" :size="12">
                      <Warning />
                    </el-icon>
                  </el-tooltip>
                </div>
              </template>
            </el-statistic>
            <div class="statistic-footer">
              <div class="footer-item">
                <span>均等类型比例</span>
                <span class="red">
                  {{ +statistics.tokens.rate * 100 }}%
                  <el-icon>
                    <CaretBottom />
                  </el-icon>
                </span>
              </div>
            </div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="statistic-card">
            <el-statistic :value="statistics.time.average">
              <template #title>
                <div style="display: inline-flex; align-items: center">
                  时间均度响应
                  <el-tooltip effect="dark" content="在时间范围内总的响应速度(ms)" placement="top">
                    <el-icon style="margin-left: 4px" :size="12">
                      <Warning />
                    </el-icon>
                  </el-tooltip>
                </div>
              </template>
            </el-statistic>
            <div class="statistic-footer">
              <div class="footer-item">
                <span>较标准响应速度</span>
                <span :class="statistics.time.rate > 1 ? 'red' : 'green'">
                  {{ (statistics.time.rate * 100).toFixed(2) }}%
                  <el-icon>
                    <CaretTop />
                  </el-icon>
                </span>
              </div>
              <div class="footer-item">
                <el-icon :size="14">
                  <ArrowRight v-if="statistics.time.rate > 1" />
                  <CaretBottom v-else />
                </el-icon>
              </div>
            </div>
          </div>
        </el-col>
      </el-row>
    </div>

    <div class="CmsLog-Chart">
      <div ref="chartRef" class="CmsLog-ChartContent" />
      <div ref="chartLinearRef" class="CmsLog-ChartContent" />
    </div>

    <el-main>
      <el-form :disabled="formLoading" :inline="true" :model="formInline">
        <el-form-item label="MessageType">
          <el-input v-model="formInline.message_type" placeholder="搜索MessageType" clearable />
        </el-form-item>
        <el-form-item label="Model">
          <el-input v-model="formInline.model" placeholder="搜索Model" clearable />
        </el-form-item>
        <el-form-item label="Status">
          <el-input v-model="formInline.status" placeholder="搜索Status" clearable />
        </el-form-item>

        <el-form-item style="margin-right: 0" float-right>
          <el-button @click="handleReset">
            重置
          </el-button>
          <el-button :loading="formLoading" type="primary" @click="fetchData">
            查询
          </el-button>
        </el-form-item>
      </el-form>

      <ClientOnly>
        <div class="table-wrapper">
          <el-table v-if="logs?.items" table-layout="auto" :data="logs.items" style="width: 100%">
            <el-table-column type="index" label="序号" width="60" />
            <el-table-column label="类型">
              <template #default="{ row }">
                <el-tag type="warning" color="#5273E015">
                  {{ deserializeMsgType(+row.message_type) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="用户">
              <template #default="{ row }">
                <div v-if="row.user">
                  <NormalUser :data="row.user" />
                </div>
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column label="模型">
              <template #default="{ row }">
                <el-tag>
                  {{ row.model }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="耗时">
              <template #default="{ row }">
                {{ ((+row.duration) / 1000).toFixed(2) }}s
              </template>
            </el-table-column>
            <el-table-column label="流式">
              <template #default="{ row }">
                <el-tag v-if="row.is_stream" type="success">
                  流式
                </el-tag>
                <el-tag v-else type="warning">
                  非流
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="提示">
              <template #default="{ row }">
                {{ row.prompt_tokens }}
              </template>
            </el-table-column>
            <el-table-column label="补全">
              <template #default="{ row }">
                {{ row.completion_tokens }}
              </template>
            </el-table-column>
            <el-table-column label="消费">
              <template #default="{ row }">
                {{ row.cost }}$
              </template>
            </el-table-column>
            <el-table-column label="状态">
              <template #default="{ row }">
                {{ row.status }}
              </template>
            </el-table-column>
            <el-table-column label="用户IP">
              <template #default="{ row }">
                {{ row.user_ip }}
              </template>
            </el-table-column>
            <el-table-column label="设备信息">
              <template #default="{ row }">
                {{ row.device_info }}
              </template>
            </el-table-column>
            <el-table-column label="对话ID">
              <template #default="{ row }">
                {{ row.session_id }}
              </template>
            </el-table-column>
            <el-table-column label="最后更新">
              <template #default="{ row }">
                {{ formatDate(row.updated_at) }}
              </template>
            </el-table-column>
          </el-table>
        </div>

        <el-pagination
          v-if="logs?.meta" v-model:current-page="logs.meta.currentPage" v-model:page-size="logs.meta.itemsPerPage"
          :disabled="formLoading" float-right my-4 :page-sizes="[10, 30, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper" :total="logs.meta.totalItems" @change="fetchData"
        />
      </ClientOnly>
    </el-main>
  </el-container>
</template>

<style lang="scss" scoped>
:global(h2#card-usage ~ .example .example-showcase) {
  background-color: var(--el-bg-color-page) !important;
}

.el-statistic {
  --el-statistic-content-font-size: 28px;
}

.statistic-card {
  height: 100%;
  padding: 20px;
  border-radius: 16px;
  background-color: var(--el-bg-color);
}

.statistic-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-top: 16px;
}

.statistic-footer .footer-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.statistic-footer .footer-item span:last-child {
  display: inline-flex;
  align-items: center;
  margin-left: 4px;
}

.green {
  color: var(--el-color-success);
}

.red {
  color: var(--el-color-error);
}

.CmsLog {
  display: flex;
  flex-direction: column;

  &-Statistics {
    position: relative;
    margin: 1rem 0;
    padding: 1rem;
    // display: flex;

    // align-items: center;
    // justify-content: space-between;

    width: 100%;
    height: max-content;

    border-radius: 16px;
    // box-shadow: var(--el-box-shadow);
    // background-color: var(--el-bg-color);
  }

  &-Chart {
    &Content {
      height: 100%;
      width: 50%;

      flex: 1;
    }

    position: relative;
    display: flex;

    justify-content: center;

    gap: 0.5rem;

    width: 100%;
    height: 400px;
  }

  .table-wrapper {
    .el-table {
      height: 100%;
    }

    height: calc(50vh - 200px);
  }
}
</style>
