<script lang="ts" setup>
import dayjs from 'dayjs'
import type { ComponentSize, FormInstance, FormRules } from 'element-plus'
import { type UserQuery, addUser, deleteUser, getDepartmentList, getUsers, updateUser } from '~/composables/api/account'
import UserAvatar from '~/components/personal/UserAvatar.vue'
import UserUploadAvatar from '~/components/personal/UserUploadAvatar.vue'
import { $endApi } from '~/composables/api/base'

definePageMeta({
  name: '用户管理',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

const defaultProps = {
  children: 'children',
  label: 'name',
}

const treeDom = ref()
const treeFilterQuery = ref()
const depts = ref()

const formLoading = ref(false)
const users = ref({
  items: [],
  meta: {
    currentPage: 0,
    perPage: 0,
    total: 0,
    totalPages: 0,
    itemsPerPage: 0,
    totalItems: 0,
  },
})

const formInline = reactive({
  user: '',
  email: '',
  phone: '',
  remark: '',
  deptId: 0,
})

function handleReset() {
  formInline.user = ''
  formInline.email = ''
  formInline.phone = ''
  formInline.remark = ''
  formInline.deptId = 0

  treeDom.value?.setCurrentKey(null)
}

const roles = ref()

onMounted(fetchData)

async function fetchData() {
  formLoading.value = true

  const query: Record<string, any> = {
    page: users.value.meta.currentPage,
    pageSize: users.value.meta.itemsPerPage,
    username: formInline.user,
    email: formInline.email,
    phone: formInline.phone,
    remark: formInline.remark,
    deptId: formInline.deptId,
  }

  // 过滤掉为空的值
  Object.entries(query).forEach(([key, value]) => {
    if (!value)
      delete query[key]
  })

  const res: any = (await getUsers(query))
  if (!res) {
    ElMessage.warning('参数错误，查询失败！')
  }
  else {
    if (res.code === 200) {
      depts.value = (await getDepartmentList()).data
      roles.value = (await $endApi.v1.cms.role.list({})).data

      users.value = res.data
    }
  }

  formLoading.value = false
}

watch(() => formInline.deptId, () => {
  fetchData()
})

function formatDate(date: string) {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss')
}

interface UserForm extends UserQuery {
  roles?: any[]
  deptId: number
}

const dialogOptions = reactive<{
  visible: boolean
  mode: 'edit' | 'read' | 'new'
  data: UserForm | null
  loading: boolean
}>({
  visible: false,
  mode: 'edit',
  data: null,
  loading: false,
})

function handleDialog(data: UserForm | null, mode: 'edit' | 'read' | 'new') {
  dialogOptions.mode = mode
  dialogOptions.visible = true
  dialogOptions.data = (mode === 'new'
    ? {
        id: '',
        email: '',
        username: '',
        nickname: '',
        avatar: '',
        qq: '',
        phone: '',
        status: 1,
        remark: '',
        roles: [],
      }
    : { ...data }) as UserForm

  dialogOptions.data.roleIds = dialogOptions.data.roles!.map((item: any) => item.id)
  dialogOptions.data.deptId = dialogOptions.data.dept?.id ?? 0
}

const ruleFormRef = ref<FormInstance>()

const rules = reactive<FormRules<UserForm>>({
  username: [
    { required: true, message: '请输入用户名称', trigger: 'blur' },
    { min: 2, max: 24, message: '用户名需要在 2-24 位之间', trigger: 'blur' },
  ],
  nickname: [
    { required: true, message: '请输入用户昵称', trigger: 'blur' },
    { min: 2, max: 24, message: '用户名需要在 2-24 位之间', trigger: 'blur' },
  ],
  // password: [
  //   { required: true, message: '请输入用户密码', trigger: 'blur' },
  //   { min: 6, max: 16, message: '用户密码需要在 6-16 位之间', trigger: 'blur' },
  //   { pattern: /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d]{6,16}$/, message: '用户密码必须包含数字和字母', trigger: 'blur' },
  // ],
  avatar: [
    { required: true, message: '请上传头像', trigger: 'blur' },
  ],
  // qq: [
  //   { required: true, message: '请输入QQ号', trigger: 'blur' },
  // ],
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
  ],
  status: [
    { required: true, message: '请选择状态', trigger: 'blur' },
  ],
})

async function submitForm(formEl: FormInstance | undefined) {
  if (!formEl)
    return
  await formEl.validate(async (valid) => {
    if (!valid)
      return

    dialogOptions.loading = true

    if (dialogOptions.mode !== 'new') {
      const res: any = await updateUser(dialogOptions.data!.id!, dialogOptions.data as UserForm)

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
      const res: any = await addUser(dialogOptions.data as UserForm)

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

function handleDeleteUser(id: number, data: UserForm) {
  ElMessageBox.confirm(
    `你确定要删除用户 ${data.username}(${data.nickname}) #${id} 吗？删除后这个账户永久无法找回。`,
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
      const res: any = await deleteUser(`${id}`)
      if (res.code !== 200) {
        ElMessage.error('删除失败！')
        return
      }

      fetchData()

      ElNotification({
        title: 'Info',
        message: `你永久删除了用户 ${data.username}(${data.nickname}) #${id} 及其相关数据！`,
        type: 'info',
      })
    })
}

function handleNodeClick(node: any, treeNode: any) {
  if (treeNode.checked) {
    treeDom.value?.setCurrentKey(null)
    formInline.deptId = 0
  }
  else { formInline.deptId = node.id }
}

watch(treeFilterQuery, (val) => {
  nextTick(() => treeDom.value!.filter(val))
}, { immediate: true })

function filterNode(value: string, data: any) {
  if (!value)
    return true

  if (data.id === +value)
    return true

  return data.name.includes(value)
}
</script>

<template>
  <el-container class="CmsUser CmsStandard">
    <el-aside width="320px">
      <el-header>
        <p font-bold>
          组织架构
        </p>
        <el-input v-model="treeFilterQuery" style="width: 200px" placeholder="搜索部门" />
      </el-header>

      <el-tree
        ref="treeDom" :filter-node-method="filterNode" :default-expand-all="true" :highlight-current="true"
        :current-node-key="formInline.deptId" node-key="id" :check-on-click-node="true" style="max-width: 600px"
        :data="depts" :props="defaultProps" @node-click="handleNodeClick"
      />
    </el-aside>

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

        <el-form-item style="margin-right: 0" float-right>
          <el-button @click="handleReset">
            重置
          </el-button>
          <el-button :loading="formLoading" type="primary" @click="fetchData">
            查询
          </el-button>
          <el-button v-permission="`system:user:create`" type="success" @click="handleDialog(null, 'new')">
            新建用户
          </el-button>
        </el-form-item>
      </el-form>

      <ClientOnly>
        <el-table v-if="users?.items" :data="users.items" height="90%">
          <el-table-column prop="id" label="序号" width="60" />
          <el-table-column prop="date" label="头像" width="80">
            <template #default="scope">
              <UserAvatar :avatar="scope.row.avatar" />
            </template>
          </el-table-column>
          <el-table-column prop="username" label="用户名(昵称)" width="240">
            <template #default="{ row }">
              {{ row.username }}<span op-50>({{ row.nickname }})</span>
            </template>
          </el-table-column>
          <el-table-column prop="email" label="邮箱" width="180" />
          <el-table-column prop="department" label="部门" width="180">
            <template #default="{ row }">
              <el-tag v-if="row.dept">
                {{ row.dept.name }}
              </el-tag>
              <span v-else>无</span>
            </template>
          </el-table-column>
          <el-table-column prop="phone" label="手机号" width="180" />
          <el-table-column prop="role" label="角色" width="180">
            <template #default="{ row }">
              <span v-if="row.roles?.length">
                <el-tag v-for="role in row.roles" :key="role.id" mr-2> {{ role.name }}</el-tag>
              </span>
              <span v-else>无</span>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="180">
            <template #default="scope">
              <el-tag :type="scope.row.status === 1 ? 'success' : 'danger'">
                {{ scope.row.status === 1 ? '启用' : '禁用' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="remark" label="备注" width="180" />
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
              <el-button
                v-permission="`system:user:update`" plain text size="small" type="warning"
                @click="handleDialog(row, 'edit')"
              >
                编辑
              </el-button>
              <el-button
                v-permission="`system:user:delete`" plain text size="small" type="danger"
                @click="handleDeleteUser(row.id, row)"
              >
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-if="users?.meta" v-model:current-page="users.meta.currentPage" v-model:page-size="users.meta.itemsPerPage"
          :disabled="formLoading" float-right my-4 :page-sizes="[20, 40, 60, 80]"
          layout="total, sizes, prev, pager, next, jumper" :total="users.meta.totalItems" @change="fetchData"
        />
      </ClientOnly>
    </el-main>

    <el-drawer v-model="dialogOptions.visible" :close-on-click-modal="false" :close-on-press-escape="false">
      <template #header>
        <h4>
          <span v-if="dialogOptions.mode === 'new'">新建</span>
          <span v-else-if="dialogOptions.mode === 'edit'">编辑</span>
          <span v-else-if="dialogOptions.mode === 'read'">查看</span>用户信息<span v-if="dialogOptions.data" mx-4 op-50>#{{
            dialogOptions.data.id }}</span>
        </h4>
      </template>
      <template #default>
        <el-form
          v-if="dialogOptions.data" ref="ruleFormRef"
          :disabled="dialogOptions.loading || dialogOptions.mode === 'read'" style="max-width: 600px"
          :model="dialogOptions.data" :rules="rules" label-width="auto" status-icon
        >
          <el-form-item label="用户头像" prop="avatar">
            <UserUploadAvatar
              v-model="dialogOptions.data.avatar"
              :disabled="dialogOptions.loading || dialogOptions.mode === 'read'"
            />
          </el-form-item>
          <el-form-item label="用户名称" prop="username">
            <el-input v-model="dialogOptions.data.username" :disabled="dialogOptions.mode !== 'new'" />
          </el-form-item>
          <el-form-item label="用户昵称" prop="nickname">
            <el-input v-model="dialogOptions.data.nickname" />
          </el-form-item>
          <el-form-item label="用户密码" prop="password">
            <el-input v-model="dialogOptions.data.password" :disabled="dialogOptions.mode !== 'new'" type="password" />
          </el-form-item>
          <el-form-item label="用户邮箱" prop="email">
            <el-input v-model="dialogOptions.data.email" />
          </el-form-item>
          <el-form-item label="QQ" prop="qq">
            <el-input v-model="dialogOptions.data.qq" />
          </el-form-item>
          <el-form-item label="用户手机号" prop="phone">
            <el-input v-model="dialogOptions.data.phone" />
          </el-form-item>
          <el-form-item label="用户部门" prop="dept">
            <el-tree-select
              v-model="dialogOptions.data.deptId" :default-expand-all="true" :highlight-current="true"
              node-key="id" :check-on-click-node="true" :props="defaultProps" :data="depts"
              :render-after-expand="false"
            />
          </el-form-item>
          <el-form-item label="用户角色" prop="roles">
            <el-select v-model="dialogOptions.data.roleIds" multiple placeholder="请选择角色">
              <el-option v-for="item in roles.items" :key="item.id" :label="item.name" :value="item.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="用户状态" prop="status">
            <el-radio-group v-model="dialogOptions.data.status">
              <el-radio-button :value="0">
                已禁用
              </el-radio-button>
              <el-radio-button :value="1">
                未禁用
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item label="用户备注" prop="remark">
            <el-input v-model="dialogOptions.data.remark" placeholder="请输入备注..." type="textarea" />
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
.CmsUser {
  .el-aside {
    .el-header {
      & > p {
        margin: 0.5rem 0;
      }
      margin: 1rem 0;
    }
    border-right: 1px solid var(--el-border-color);
  }
}
</style>
