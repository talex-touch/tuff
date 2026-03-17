<script lang="ts" setup>
import { reactive } from 'vue'
import dayjs from 'dayjs'
import isBetween from 'dayjs/plugin/isBetween'
import { $endApi } from '~/composables/api/base'
import type { IRoleModel, IRoleModelQuery, ISubscriptionPlan, ISubscriptionPlanQuery } from '~/composables/api/base/index.type'
import TemplateStandardCms from '~/components/template/StandardCms.vue'

dayjs.extend(isBetween)

definePageMeta({
  name: '订阅管理',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

type TemplateType = ISubscriptionPlan
const $dataApi = $endApi.v1.cms.subscription

const templateData = genCmsTemplateData<TemplateType, ISubscriptionPlanQuery, null>({
  getDeleteBoxTitle(id) {
    return ` 订阅#${id} `
  },
  getEmptyModel() {
    return {
      endDate: new Date(),
      field: '',
      /**
       * 订阅是否有效
       */
      isActive: false,
      /**
       * 是否自动续费
       */
      isAutoRenew: false,
      /**
       * 是否是试用订阅
       */
      isTrial: false,
      /**
       * 相关订单号
       */
      orderId: '',
      /**
       * 订阅开始日期
       */
      startDate: new Date(),
      /**
       * 订阅计划类型
       */
      type: 'STANDARD',
      /**
       * 用户id
       */
      userId: '',
    }
  },
  getList: $dataApi.list,
  getDeleteBoxTitles: function (ids: Array<number>): string {
   return ` 订阅#${ids.join(',')} `
  }
}, {
  name: '',
  value: '',
  status: 0,
  remark: '',
})
const { list, listForm, fetchData } = templateData

onMounted(fetchData)

// 判断订阅是否在有效期
function doSubscriptionValid({ startDate, endDate }: any) {
  return dayjs().isBetween(dayjs(startDate), dayjs(endDate))
}

function forceUpdateSubscribe(row: TemplateType) {
  ElMessageBox.confirm('确认更新吗？这是一个耗时操作，请勿频繁点击！', '强制更新订阅状态', {
    confirmButtonText: '强制更新订阅',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(async () => {
    const res = await $dataApi.forceUpdate(row.id)
    if (res.code === 200) {
      ElMessage.success('更新成功')
      fetchData()
    }
    else {
      ElMessage.error(res.message || '更新失败')
    }
  }).catch(() => {
    ElMessage.info('已取消')
  })
}
</script>

<template>
  <TemplateStandardCms :crud-controller="CurdController.REVIEW" :list="list" :template-data="templateData" name="订阅">
    <template #QueryForm>
      <el-form-item label="订阅类型">
        <!-- option: STANDARD | ULTIMATE -->
        <el-select v-model="listForm.type" placeholder="订阅类型">
          <el-option label="标准订阅" value="STANDARD" />
          <el-option label="高级订阅" value="ULTIMATE" />
        </el-select>
      </el-form-item>
      <el-form-item label="角色值">
        <el-input v-model="listForm.value" placeholder="角色值" clearable />
      </el-form-item>
      <el-form-item label="状态">
        <el-radio-group v-model="listForm.status">
          <el-radio-button :value="0">
            否
          </el-radio-button>
          <el-radio-button :value="1">
            是
          </el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item label="关联订单">
        <el-input v-model="listForm.orderId" placeholder="通过订单号搜索" clearable />
      </el-form-item>
    </template>
    <template #TableColumn>
      <el-table-column prop="id" label="编号" />
      <el-table-column label="用户">
        <template #default="{ row }">
          <PersonalNormalUser :data="row.user" />
        </template>
      </el-table-column>
      <el-table-column label="订阅类型">
        <template #default="{ row }">
          <el-tag v-if="row.type === 'ULTIMATE'" type="success">
            高级订阅
          </el-tag>
          <el-tag v-else-if="row.type === 'STANDARD'" type="warning">
            标准订阅
          </el-tag>
          <el-tag v-else type="danger">
            {{ row.type }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="status" label="生效">
        <template #default="{ row }">
          <template v-if="row.isActive">
            <el-tag type="success">
              已确认
            </el-tag>
            <el-tag v-if="!doSubscriptionValid(row)" ml-2 type="danger">
              订阅已过期
            </el-tag>
          </template>
          <template v-else>
            <el-tag type="warning">
              未确认订阅
            </el-tag>

            <el-button size="small" ml-2 type="danger" @click="forceUpdateSubscribe(row)">
              强制刷新订阅
            </el-button>
          </template>
        </template>
      </el-table-column>
      <el-table-column prop="orderId" label="关联订单号" />
      <el-table-column width="320" label="有效区间">
        <template #default="{ row }">
          {{ formatDate(row.startDate) }} - {{ formatDate(row.endDate) }}
        </template>
      </el-table-column>
      <el-table-column label="附加属性">
        <template #default="{ row }">
          <el-tag v-if="row.autoRenew" type="primary">
            自动续费
          </el-tag>
          <el-tag v-if="row.isTrial" type="warning">
            试用
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createdAt" label="创建时间">
        <template #default="scope">
          {{ formatDate(scope.row.createdAt) }}
        </template>
      </el-table-column>
      <el-table-column prop="updatedAt" label="更新时间">
        <template #default="scope">
          {{ formatDate(scope.row.updatedAt) }}
        </template>
      </el-table-column>
    </template>
    <template #CrudForm="{ data }">
      <el-form-item label="用户">
        <PersonalNormalUser :data="data.user" />
      </el-form-item>
      <el-form-item label="订阅类型">
        <el-select v-model="data.type" placeholder="订阅类型">
          <el-option label="标准订阅" value="STANDARD" />
          <el-option label="高级订阅" value="ULTIMATE" />
        </el-select>
      </el-form-item>
      <el-form-item label="关联订单">
        <el-tag type="info">
          #{{ data.orderId }}
        </el-tag>
      </el-form-item>
      <el-form-item label="有效区间">
        {{ formatDate(data.startDate) }} - {{ formatDate(data.endDate) }}
      </el-form-item>
      <el-form-item label="附加属性">
        <el-checkbox v-model="data.autoRenew" label="自动续费" />
        <el-checkbox v-model="data.isTrial" label="试用" />
      </el-form-item>
    </template>
  </TemplateStandardCms>
</template>
