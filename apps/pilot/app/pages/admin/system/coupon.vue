<script lang="ts" setup>
import dayjs from 'dayjs'
import type { FormInstance, FormRules } from 'element-plus'
import { type CouponListQueryDto, type CreateCouponDto, createBatchesCodeList, getAllCoupon, invalidateCouponCode } from '~/composables/api/account'

definePageMeta({
  name: '券码管理',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

const router = useRouter()
const formLoading = ref(false)
const coupons = ref({
  items: [],
  meta: {
    currentPage: 0,
    perPage: 0,
    total: 0,
    totalPages: 0,
    itemsPerPage: 50,
    totalItems: 0,
  },
})

const formInline = reactive({
  user: '',
})

function handleReset() {
  formInline.user = ''
}

onMounted(fetchData)

async function fetchData() {
  // if (!window.h5sdk) {
  //   ElMessageBox.alert('您需要通过风险检测才可使用本功能！', '环境检测异常', {
  //     confirmButtonText: '了解',
  //   })

  //   router.back()
  //   return
  // }

  formLoading.value = true

  const query: CouponListQueryDto = {
    page: coupons.value.meta.currentPage,
    pageSize: coupons.value.meta.itemsPerPage,
  }

  // 过滤掉为空的值
  Object.entries(query).forEach(([key, value]) => {
    if (!value)
      delete query[key]
  })

  coupons.value.items.length = 0

  const res: any = (await getAllCoupon(query))
  if (!res) {
    ElMessage.warning('参数错误，查询失败！')
  }
  else {
    if (res.code === 200)

      coupons.value = res.data
  }

  formLoading.value = false
}

function formatDate(date: string) {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

const dialogOptions = reactive<{
  visible: boolean
  mode: 'read' | 'new'
  data: CreateCouponDto | null
  loading: boolean
}>({
  visible: false,
  mode: 'read',
  data: null,
  loading: false,
})

function handleDialog(data: CreateCouponDto | null, mode: 'read' | 'new') {
  dialogOptions.mode = mode
  dialogOptions.visible = true
  dialogOptions.data = (mode === 'new'
    ? {
        id: '',
      }
    : { ...data }) as CreateCouponDto
}

const ruleFormRef = ref<FormInstance>()

const rules = reactive<FormRules<CreateCouponDto>>({
  code: [
    { required: true, message: '请输入用户名称', trigger: 'blur' },
    { min: 5, max: 24, message: '用户名需要在 5-24 位之间', trigger: 'blur' },
  ],
})

async function submitForm(formEl: FormInstance | undefined) {
  if (!formEl)
    return
  await formEl.validate(async (valid) => {
    if (!valid)
      return

    dialogOptions.loading = true

    const res: any = await createBatchesCodeList(dialogOptions.data as CreateCouponDto)

    if (res.code === 200) {
      ElMessage.success('添加成功！')
      dialogOptions.visible = false
      fetchData()
    }
    else {
      ElMessage.error(res.message ?? '添加失败！')
    }

    dialogOptions.loading = false
  })
}

function resetForm(formEl: FormInstance | undefined) {
  if (!formEl)
    return
  formEl.resetFields()
}

function handleDeleteCouponCode(data: CreateCouponDto) {
  ElMessageBox.confirm(
    `你确定要删除券码 ${data.mainCode} #${data.id} 吗？删除后这个券码将永久无法使用。`,
    '确认删除',
    {
      confirmButtonText: '取消',
      cancelButtonText: '确定删除',
      type: 'error',
    },
  )
    .then(() => {
      ElMessage({
        type: 'success',
        message: '已取消删除用户！',
      })
    })
    .catch(async () => {
      const res: any = await invalidateCouponCode(data.code!)
      if (res.code !== 200) {
        ElMessage.error('删除失败！')
        return
      }

      fetchData()

      ElNotification({
        title: 'Info',
        message: `你永久删除了券码 ${data.mainCode} #${data.id} 及其相关数据！`,
        type: 'info',
      })
    })
}

// 将券码的随机码隐藏掉
function transformCodes(code: string) {
  if (code.length !== 22)
    return `ERROR CODE ${code}`

  const arr = code.split('-')
  if (arr.length < 2)
    return `ERROR FORMAT ${code}`

  const [...unique] = arr

  return `${unique.join()}-*****`
}

function handleTableRowClass(data: any) {
  const { row } = data

  // 如果这条记录未审核则标黄 如果未通过则标红
  if (row.maxUsage === -1)
    return 'error-row'

  return ''
}
</script>

<template>
  <el-container class="CmsCoupon">
    <el-main>
      <el-form :disabled="formLoading" :inline="true" :model="formInline">
        <el-form-item label="用户名">
          <el-input v-model="formInline.user" minlength="4" placeholder="搜索用户名" clearable />
        </el-form-item>

        <el-form-item style="margin-right: 0" float-right>
          <el-button @click="handleReset">
            重置
          </el-button>
          <el-button :loading="formLoading" type="primary" @click="fetchData">
            查询
          </el-button>
          <el-button type="success" @click="handleDialog(null, 'new')">
            新建券码
          </el-button>
        </el-form-item>
      </el-form>

      <ClientOnly>
        <el-table
          v-if="coupons?.items" :row-class-name="handleTableRowClass" border height="90%" :data="coupons.items"
          table-layout="auto" style="width: 100%"
        >
          <el-table-column width="60px" label="编号">
            <template #default="{ row }">
              {{ row.id }}
            </template>
          </el-table-column>

          <el-table-column label="券码">
            <template #default="{ row }">
              {{ transformCodes(row.mainCode) }}
            </template>
          </el-table-column>
          <el-table-column label="优惠金额">
            <template #default="{ row }">
              <el-tag v-if="row.discountAmount > 0">
                {{ (row.discountAmount / 100).toFixed(2) }}￥
              </el-tag>
              <el-tag v-else>
                {{ row.discountAmount * -1 }}%
              </el-tag>
              &nbsp;
              <el-tag v-if="row.minimumSpend > 0" type="warning">
                最低价：{{ (row.minimumSpend / 100).toFixed(2) }}￥
              </el-tag>
              &nbsp;
              <el-tag v-if="row.maximumDiscount > 0">
                最多抵扣：{{ (row.maximumDiscount / 100).toFixed(2) }}￥
              </el-tag>
              <el-tag v-else-if="row.maximumDiscount !== null">
                最多抵扣：{{ row.maximumDiscount * -100 }}%
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="优惠时期">
            <template #default="{ row }">
              <el-tag v-if="row.startDate">
                {{ formatDate(row.updatedAt) }}
              </el-tag>
              -
              <el-tag v-if="row.endDate">
                {{ formatDate(row.endDate) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="使用详情">
            <template #default="{ row }">
              {{ row.usedCount }} / {{ row.maxUsage }}
              <el-tag v-if="row.maxUsage === -1" type="danger">
                永久失效
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="附加数据">
            <template #default="scope">
              <el-tag :type="scope.row.stackable !== 1 ? 'success' : 'danger'">
                {{ scope.row.stackable === 1 ? '可叠加' : '不可叠加' }}
              </el-tag>
              &nbsp;
              <el-tag :type="scope.row.newUserOnly !== 1 ? 'warning' : 'info'">
                {{ scope.row.newUserOnly === 1 ? '新用户可用' : '通用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间" width="180">
            <template #default="scope">
              {{ formatDate(scope.row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column prop="updatedAt" label="更新时间" width="180">
            <template #default="scope">
              {{ formatDate(scope.row.updatedAt) }}
            </template>
          </el-table-column>
          <el-table-column fixed="right" label="操作" width="200">
            <template #default="{ row }">
              <el-button plain text size="small" @click="handleDialog(row, 'read')">
                详情
              </el-button>
              <el-button plain text size="small" type="danger" @click="handleDeleteCouponCode(row)">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-if="coupons?.meta" v-model:current-page="coupons.meta.currentPage" v-model:page-size="coupons.meta.itemsPerPage"
          :disabled="formLoading" float-right my-4 :page-sizes="[20, 40, 60, 80, 100, 120]"
          layout="total, sizes, prev, pager, next, jumper" :total="coupons.meta.totalItems" @change="fetchData"
        />
      </ClientOnly>
    </el-main>

    <el-drawer v-model="dialogOptions.visible" :close-on-click-modal="false" :close-on-press-escape="false">
      <template #header>
        <h4>
          <span v-if="dialogOptions.mode === 'new'">新建</span>
          <span v-else-if="dialogOptions.mode === 'read'">查看</span>券码信息<span v-if="dialogOptions.data" mx-4 op-50>#{{
            dialogOptions.data.id }}</span>
        </h4>
      </template>
      <template #default>
        <el-form
          v-if="dialogOptions.data" ref="ruleFormRef"
          :disabled="dialogOptions.loading || dialogOptions.mode === 'read'" style="max-width: 600px"
          :model="dialogOptions.data" :rules="rules" label-width="auto" status-icon
        >
          <template v-if="dialogOptions.mode === 'read'">
            <el-form-item label="卡券码">
              <span>{{ dialogOptions.data.mainCode }}</span>
              &nbsp;
              <div v-copy="dialogOptions.data.mainCode" i-carbon:copy cursor-pointer />
            </el-form-item>
            <el-form-item label="优惠金额">
              <span>
                <el-tag v-if="dialogOptions.data.discountAmount > 0">
                  {{ (dialogOptions.data.discountAmount / 100).toFixed(2) }}￥
                </el-tag>
                <el-tag v-else>
                  {{ dialogOptions.data.discountAmount * -100 }}%
                </el-tag>
                &nbsp;
                <el-tag v-if="dialogOptions.data.minimumSpend > 0" type="warning">
                  最低价：{{ (dialogOptions.data.minimumSpend / 100).toFixed(2) }}￥
                </el-tag>
                &nbsp;
                <el-tag v-if="dialogOptions.data.maximumDiscount !== null">
                  最多抵扣：{{ dialogOptions.data.maximumDiscount! * -100 }}%
                </el-tag>
                <el-tag v-else-if="dialogOptions.data?.maximumDiscount > 0">
                  最多抵扣：{{ (dialogOptions.data.maximumDiscount / 100).toFixed(2) }}￥
                </el-tag>

              </span>
            </el-form-item>

            <el-form-item label="优惠时期">
              <span>
                <el-tag v-if="dialogOptions.data.startDate">
                  {{ formatDate(dialogOptions.data.updatedAt) }}
                </el-tag>
                -
                <el-tag v-if="dialogOptions.data.endDate">
                  {{ formatDate(dialogOptions.data.endDate) }}
                </el-tag>
              </span>
            </el-form-item>

            <el-form-item label="使用详情">
              <span>{{ dialogOptions.data.usedCount }} / {{ dialogOptions.data.maxUsage }}</span>
            </el-form-item>

            <el-form-item label="附加数据">
              <span>
                <el-tag :type="dialogOptions.data.stackable ? 'success' : 'danger'">
                  {{ dialogOptions.data.stackable ? '可叠加' : '不可叠加' }}
                </el-tag>
                &nbsp;
                <el-tag :type="dialogOptions.data.newUserOnly ? 'warning' : 'info'">
                  {{ dialogOptions.data.newUserOnly ? '新用户可用' : '通用' }}
                </el-tag>
              </span>
            </el-form-item>

            <el-form-item label="创建时间">
              <span>{{ formatDate(dialogOptions.data.createdAt) }}</span>
            </el-form-item>

            <el-form-item label="更新时间">
              <span>{{ formatDate(dialogOptions.data.updatedAt) }}</span>
            </el-form-item>

            <!-- <el-form-item label="附加信息">
              <p>最后更新：{{ dialogOptions.data.updater_id }}</p>
            </el-form-item> -->
          </template>

          <template v-else>
            <el-form-item
              label="优惠码前缀" prop="prefix"
              :rules="[{ required: true, message: '请输入6位优惠码前缀', min: 6, max: 6 }]"
            >
              <el-input v-model="dialogOptions.data.prefix" style="width: 100px" maxlength="6" />
            </el-form-item>

            <el-form-item
              label="优惠码数量" prop="quantity"
              :rules="[{ required: true, message: '请输入优惠码数量' }, { type: 'number', min: 1, max: 1000, message: '数量必须在1到1000之间' }]"
            >
              <el-input-number v-model="dialogOptions.data.quantity" :min="1" :max="1000" />
            </el-form-item>

            <el-form-item label="优惠金额" prop="discountAmount" :rules="[{ required: true, message: '请输入优惠金额' }]">
              <el-input-number v-model="dialogOptions.data.discountAmount" :min="-100" />
            </el-form-item>

            <el-form-item label="有效期开始时间" prop="startDate">
              <el-date-picker v-model="dialogOptions.data.startDate" type="date" placeholder="选择开始日期" />
            </el-form-item>

            <el-form-item label="有效期结束时间" prop="endDate">
              <el-date-picker v-model="dialogOptions.data.endDate" type="date" placeholder="选择结束日期" />
            </el-form-item>

            <el-form-item label="最大使用次数" prop="maxUsage" :rules="[{ required: true, message: '请输入最大使用次数' }]">
              <el-input-number v-model="dialogOptions.data.maxUsage" :min="1" />
            </el-form-item>

            <el-form-item label="最小消费金额" prop="minimumSpend" :rules="[{ required: true, message: '请输入最小消费金额' }]">
              <el-input-number v-model="dialogOptions.data.minimumSpend" :min="0" />
            </el-form-item>

            <el-form-item label="最大抵扣消费" prop="maximumDiscount">
              <el-input-number v-model="dialogOptions.data.maximumDiscount" :min="-100" />
            </el-form-item>

            <el-form-item label="是否可叠加使用">
              <el-switch v-model="dialogOptions.data.stackable" />
            </el-form-item>

            <el-form-item label="仅限新用户使用">
              <el-switch v-model="dialogOptions.data.newUserOnly" />
            </el-form-item>
          </template>
        </el-form>
      </template>
      <template #footer>
        <div style="flex: auto">
          <template v-if="dialogOptions.mode === 'read'">
            <el-button @click="dialogOptions.visible = false">
              关闭
            </el-button>
          </template>
          <template v-else>
            <el-button @click="dialogOptions.visible = false">
              取消
            </el-button>
            <el-button @click="resetForm(ruleFormRef)">
              重置
            </el-button>
            <el-button :loading="dialogOptions.loading" type="primary" @click="submitForm(ruleFormRef)">
              确认创建
            </el-button>
          </template>
        </div>
      </template>
    </el-drawer>
  </el-container>
</template>

<style lang="scss">
.CmsCoupon {
  .el-main {
    overflow: hidden;
  }
}
</style>
