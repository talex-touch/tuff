<script lang="ts" setup>
import dayjs from 'dayjs'
import type { FormInstance, FormRules } from 'element-plus'
import IconSelector from '~/components/selector/IconSelector.vue'
import { type MenuGetQuery, addMenu, addUser, delMenu, deleteUser, getMenuList, updateMenu, updateUser } from '~/composables/api/account'

definePageMeta({
  name: '菜单管理',
  layout: 'cms',
  pageTransition: {
    name: 'rotate',
  },
})

const formLoading = ref(false)
const menus = ref([])

const formInline = reactive({
  user: '',
  email: '',
  phone: '',
  remark: '',
})

function handleReset() {
  formInline.user = ''
  formInline.email = ''
  formInline.phone = ''
  formInline.remark = ''
}

onMounted(fetchData)

type MenuGetQueryType<T extends MenuGetQuery> = Partial<{
  [K in keyof T as string]: T[K]
}>

interface MenuGetQueryData extends MenuGetQuery {
  id: number
  show: number
  parentId: number
  orderNo: number
  activeMenu: string
  icon: string
  permission: string
}

async function fetchData() {
  formLoading.value = true

  refreshCurrentUserRPM()

  const query: MenuGetQueryType<MenuGetQuery> = {
    name: '',
  }

  // 过滤掉为空的值
  Object.entries(query).forEach(([key, value]) => {
    if (!value)
      delete query[key]
  })

  const res: any = (await getMenuList(query))
  if (!res) {
    ElMessage.warning('参数错误，查询失败！')
  }
  else {
    if (res.code === 200)
      menus.value = res.data
  }

  formLoading.value = false
}

function formatDate(date: string) {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

const dialogOptions = reactive<{
  visible: boolean
  mode: 'edit' | 'read' | 'new'
  data: Partial<MenuGetQueryData>
  loading: boolean
}>({
  visible: false,
  mode: 'edit',
  data: {},
  loading: false,
})

function handleDialog(data: Partial<MenuGetQueryData>, mode: 'edit' | 'read' | 'new') {
  dialogOptions.mode = mode
  dialogOptions.visible = true
  dialogOptions.data = mode === 'new'
    ? {
        type: 0,
        parentId: -1,
        name: '',
        orderNo: 0,
        path: '',
        isExt: false,
        extOpenMode: 1,
        show: 1,
        activeMenu: '',
        keepAlive: 1,
        status: 1,
        icon: '',
        permission: '',
        component: '',
      }
    : { ...data }

  if (dialogOptions.data.parentId === null)
    dialogOptions.data.parentId = -1
}

const ruleFormRef = ref<FormInstance>()

const rules = reactive<Partial<Record<keyof MenuGetQueryData, any>>>({
  type: {
    available() {
      return true
    },
    conditions: [
      { required: true, message: '请选择菜单类型', trigger: 'blur' },
    ],
  },
  name: {
    available(type: number) {
      if (type === 2)
        this.conditions[0].message = '请输入权限名称'
      else
        this.conditions[0].message = '请输入菜单名称'

      return true
    },
    conditions: [
      { required: true, message: '请输入菜单名称', trigger: 'blur' },
    ],
  },
  parentId: {
    available() {
      return true
    },
    conditions: [
      { required: true, message: '请选择上级节点', trigger: 'blur' },
    ],
  },
  path: {
    available(type: number) {
      return type !== 2
    },
    conditions: [
      { required: true, message: '请输入路由地址', trigger: 'blur' },
    ],
  },
  permission: {
    available(type: number) {
      return type === 2
    },
    conditions: [
      { required: true, message: '请输入权限', trigger: 'blur' },
    ],
  },
})
const compRules = computed<FormRules<MenuGetQuery>>(() => {
  const accessedRules = Object.entries({ ...rules }).filter(([, value]) => value.available(dialogOptions.data.type))
    .reduce((prev: any, [key, value]: any) => {
      prev[key] = value.conditions
      return prev
    }, {} as FormRules<MenuGetQuery>)

  return accessedRules
})

async function submitForm(formEl: FormInstance | undefined) {
  if (!formEl)
    return
  await formEl.validate(async (valid) => {
    if (!valid)
      return

    const data = dialogOptions.data
    if (data.parentId === -1)
      data.parentId = undefined

    dialogOptions.loading = true

    if (dialogOptions.mode !== 'new') {
      const res: any = await updateMenu(dialogOptions.data.id!, data as MenuGetQuery)

      if (res.code === 200) {
        ElMessage.success('修改成功！')
        dialogOptions.visible = false
        fetchData()
      }
      else {
        ElMessage.error(res.message ?? '修改失败！')
      }
    }
    else {
      const res: any = await addMenu(data as MenuGetQuery)

      if (res.code === 200) {
        ElMessage.success('添加成功！')
        dialogOptions.visible = false
        fetchData()
      }
      else {
        ElMessage.error(res.message ?? '添加失败！')
      }
    }

    dialogOptions.loading = false
  })
}

function resetForm(formEl: FormInstance | undefined) {
  if (!formEl)
    return
  formEl.resetFields()
}

function handleDelete(id: number, data: MenuGetQuery) {
  const typeText = data.type === 0 ? '目录' : data.type === 1 ? '菜单' : '权限'

  ElMessageBox.confirm(
    `你确定要删除${typeText} ${data.name} #${id} 吗？删除后这个${typeText}永久无法找回。`,
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
        message: `已取消删除${typeText}！`,
      })
    })
    .catch(async () => {
      const res: any = await delMenu(id)
      if (res.code !== 200) {
        ElMessage.error('删除失败！')
        return
      }

      fetchData()

      ElNotification({
        title: 'Info',
        message: `你永久删除了${typeText} ${data.name} 及其相关数据！`,
        type: 'info',
      })
    })
}

const menuWithRoot = computed(() => ([{ id: -1, name: '根目录', children: [...menus.value] }]))
</script>

<template>
  <el-container class="CmsRole">
    <el-main>
      <el-form :disabled="formLoading" :inline="true" :model="formInline">
        <el-form-item label="用户名">
          <el-input v-model="formInline.user" minlength="4" placeholder="搜索用户名" clearable />
        </el-form-item>
        <el-form-item label="邮箱">
          <el-input v-model="formInline.email" placeholder="搜索邮箱" clearable />
        </el-form-item>
        <el-form-item label="手机号">
          <el-input v-model="formInline.phone" placeholder="搜索手机号" clearable />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="formInline.remark" placeholder="搜索备注" clearable />
        </el-form-item>

        <el-form-item float-right style="margin-right: 0">
          <el-button @click="handleReset">
            重置
          </el-button>
          <el-button :loading="formLoading" type="primary" @click="fetchData">
            查询
          </el-button>
          <el-button type="success" @click="handleDialog({}, 'new')">
            新建菜单/权限
          </el-button>
        </el-form-item>
      </el-form>

      <ClientOnly>
        <div class="table-wrapper">
          <el-table
            v-if="menus" table-layout="auto" row-key="id" default-expand-all border :data="menus"
            style="width: 100%"
          >
            <el-table-column label="序号" prop="id" />
            <el-table-column label="名称" prop="name" />
            <el-table-column label="图标">
              <template #default="{ row }">
                <div flex items-center justify-center>
                  <div :class="row.icon" />
                </div>
              </template>
            </el-table-column>
            <el-table-column label="类型">
              <template #default="{ row }">
                <el-tag v-if="!row.type" type="warning">
                  目录
                </el-tag>
                <el-tag v-else-if="row.type === 2" type="danger">
                  权限
                </el-tag>
                <el-tag v-else type="success">
                  菜单
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="路由" prop="path" />
            <el-table-column label="文件路径" prop="component" />
            <el-table-column label="权限标识">
              <template #default="{ row }">
                <el-tag v-if="row.permission" type="primary">
                  {{ row.permission }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="排序" prop="orderNo" />
            <el-table-column label="路由缓存">
              <template #default="{ row }">
                {{ row.keepAlive ? '是' : '否' }}
              </template>
            </el-table-column>
            <el-table-column label="是否显示">
              <template #default="{ row }">
                <el-tag v-if="!row.show" type="danger">
                  隐藏
                </el-tag>
                <el-tag v-else type="success">
                  显示
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" label="状态">
              <template #default="scope">
                <el-tag :type="scope.row.status === 1 ? 'success' : 'danger'">
                  {{ scope.row.status === 1 ? '启用' : '禁用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="updatedAt" label="更新时间">
              <template #default="scope">
                {{ formatDate(scope.row.updatedAt) }}
              </template>
            </el-table-column>
            <el-table-column fixed="right" label="操作">
              <template #default="{ row }">
                <el-button plain text size="small" @click="handleDialog(row, 'read')">
                  详情
                </el-button>
                <el-button plain text size="small" type="warning" @click="handleDialog(row, 'edit')">
                  编辑
                </el-button>
                <el-button plain text size="small" type="danger" @click="handleDelete(row.id, row)">
                  删除
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </ClientOnly>
    </el-main>

    <el-drawer v-model="dialogOptions.visible" :close-on-click-modal="false" :close-on-press-escape="false">
      <template #header>
        <h4>
          <span v-if="dialogOptions.mode === 'new'">新建</span>
          <span v-else-if="dialogOptions.mode === 'edit'">编辑</span>
          <span v-else-if="dialogOptions.mode === 'read'">查看</span>菜单信息<span v-if="dialogOptions.data" mx-4 op-50>#{{
            dialogOptions.data.id }}</span>
        </h4>
      </template>
      <template #default>
        <el-form
          ref="ruleFormRef" :disabled="dialogOptions.loading || dialogOptions.mode === 'read'"
          style="max-width: 600px" :model="dialogOptions.data" :rules="compRules" label-width="auto"
          class="demo-ruleForm" status-icon
        >
          <el-form-item label="菜单类型" prop="type">
            <el-radio-group v-model="dialogOptions.data.type">
              <el-radio-button :value="0">
                目录
              </el-radio-button>
              <el-radio-button :value="1">
                菜单
              </el-radio-button>
              <el-radio-button :value="2">
                权限
              </el-radio-button>
            </el-radio-group>
          </el-form-item>

          <el-form-item v-if="dialogOptions.data.type === 2" label="权限名称" prop="name">
            <el-input v-model="dialogOptions.data.name" placeholder="请输入权限名称..." />
          </el-form-item>
          <el-form-item v-else label="节点名称" prop="name">
            <el-input v-model="dialogOptions.data.name" placeholder="请输入节点名称..." />
          </el-form-item>
          <el-form-item label="上级节点" prop="parentId">
            <el-tree-select
              v-model="dialogOptions.data.parentId" default-expand-all
              :props="{ label: 'name', value: 'id' }" :data="menuWithRoot" check-strictly :render-after-expand="false"
              placeholder="请选择上级节点..."
            />
          </el-form-item>
          <el-form-item v-if="dialogOptions.data.type !== 2" label="路由地址" prop="name">
            <el-input v-model="dialogOptions.data.path" placeholder="请输入路由地址..." />
          </el-form-item>
          <el-form-item v-if="dialogOptions.data.type !== 0" label="权限" prop="permission">
            <el-input v-model="dialogOptions.data.permission" placeholder="请输入权限..." />
          </el-form-item>
          <el-form-item v-show="dialogOptions.data.type !== 2" label="节点图标" prop="icon">
            <IconSelector v-model="dialogOptions.data.icon!" />
          </el-form-item>
          <el-form-item label="排序优先级" prop="orderNo">
            <el-input v-model="dialogOptions.data.orderNo" placeholder="请输入排序优先级..." />
          </el-form-item>
          <el-form-item v-if="dialogOptions.data.type !== 2" label="是否外链" prop="isExt">
            <el-radio-group v-model="dialogOptions.data.isExt">
              <el-radio-button :value="false">
                否
              </el-radio-button>
              <el-radio-button :value="true">
                是
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="dialogOptions.data.type === 1" label="是否缓存" prop="keepAlive">
            <el-radio-group v-model="dialogOptions.data.keepAlive">
              <el-radio-button :value="0">
                否
              </el-radio-button>
              <el-radio-button :value="1">
                是
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item v-if="dialogOptions.data.type !== 2" label="是否显示" prop="show">
            <el-radio-group v-model="dialogOptions.data.show">
              <el-radio-button :value="0">
                否
              </el-radio-button>
              <el-radio-button :value="1">
                是
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="状态" prop="status">
            <el-radio-group v-model="dialogOptions.data.status">
              <el-radio-button :value="0">
                否
              </el-radio-button>
              <el-radio-button :value="1">
                是
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
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
              {{ dialogOptions.mode !== 'new' ? "修改" : "新增" }}
            </el-button>
          </template>
        </div>
      </template>
    </el-drawer>
  </el-container>
</template>

<style lang="scss">
.CmsRole {
  .el-table__cell .cell {
    text-align: center;
  }

  .el-table_1_column_1 .cell {
    text-align: left;
  }

  .table-wrapper {
    .el-table {
      height: 100%;
    }

    height: calc(100vh - 200px);
  }
}
</style>
