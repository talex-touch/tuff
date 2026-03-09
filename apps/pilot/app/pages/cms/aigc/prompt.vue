<script lang="ts" setup>
import type { FormInstance, FormRules } from 'element-plus'
import StandardPrompt from './standard-prompt.txt?raw'
import ImageUpload from '~/components/personal/ImageUpload.vue'
import UserAvatar from '~/components/personal/UserAvatar.vue'
import UserUploadAvatar from '~/components/personal/UserUploadAvatar.vue'
import RenderContentOld from '~/components/render/RenderContent.vue'
import { assignPromptTags, getPromptDailyStatistics, searchPromptTag } from '~/composables/api/chat'
import { $endApi } from '~/composables/api/base'

definePageMeta({
  name: 'PromptTemplate管理',
  layout: 'cms',
  pageTransition: {
    name: 'rotate',
  },
})

const userStatistics = ref()
const formLoading = ref(false)
const prompts = ref({
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

const statistics = ref<{
  status: number
  count: string
}[]>([])
const PromptEngineer = ref(`\`\`\`markdown\n${StandardPrompt} \n\`\`\``)
const formInline = reactive({
  keyword: '',
  status: -1,
})

function handleReset() {
  formInline.keyword = ''
  formInline.status = -1
}

onMounted(fetchData)

async function fetchData() {
  if (formLoading.value)
    return
  formLoading.value = true

  const query: Record<string, any> = {
    page: prompts.value.meta.currentPage,
    pageSize: prompts.value.meta.itemsPerPage,
    keyword: formInline.keyword,
    status: formInline.status === -1 ? undefined : formInline.status,
  }

  // 过滤掉为空的值
  Object.entries(query).forEach(([key, value]) => {
    if (value === null || value === undefined)
      delete query[key]
  })

  const res: any = await chatAdminManager.promptList(query)
  if (!res) { ElMessage.warning('参数错误，查询失败！') }
  else
    if (res.code === 200) {
      prompts.value = res.data

      statistics.value = (await getPromptDailyStatistics()).data
      userStatistics.value = (await $endApi.v1.cms.aigc.userStatistics()).data
    }

  formLoading.value = false
}
const dialogOptions = reactive<{
  visible: boolean
  mode: 'edit' | 'read' | 'new'
  data: PromptEntityDto | null
  loading: boolean
  meta: {
    stashContent: string
    polish: boolean
    translation: boolean
    dialog: boolean
  }
}>({
  visible: false,
  mode: 'edit',
  data: null,
  loading: false,
  meta: {
    stashContent: '',
    dialog: false,
  },
})

function handleDialog(data: PromptEntityDto | null, mode: 'edit' | 'read' | 'new') {
  dialogOptions.mode = mode
  dialogOptions.visible = true
  dialogOptions.data = (mode === 'new'
    ? {
        id: '',
        avatar: '',
        content: '',
        title: '',
        description: '',
        keywords: [],
      }
    : { ...data }) as PromptEntityDto

  dialogOptions.data.keywords = Array.isArray(dialogOptions.data.keywords) ? dialogOptions.data.keywords : (dialogOptions.data.keywords?.split(','))

  dialogOptions.meta.stashContent = ''
  dialogOptions.meta.polish = false
  dialogOptions.meta.translation = false
}

const ruleFormRef = ref<FormInstance>()

const rules = reactive<FormRules<PromptEntityDto>>({
  title: [
    { required: true, message: '请输入模板标题', trigger: 'blur' },
    { min: 4, max: 255, message: '模板标题需要在 4-255 位之间', trigger: 'blur' },
  ],
  content: [
    { required: true, message: '请输入模板内容', trigger: 'blur' },
    { min: 200, max: 512, message: '模板内容需要在 150-512 位之间', trigger: 'blur' },
  ],
  avatar: [{ required: true, message: '请上传头像', trigger: 'blur' }],
  description: [
    { required: true, message: '请输入模板描述', trigger: 'blur' },
    { min: 32, max: 200, message: '模板描述需要在 32-200 位之间', trigger: 'blur' },
  ],
  // keywords: [
  //   { required: true, message: '请输入关键词', trigger: 'blur' },
  //   { min: 20, max: 255, message: '关键词需要在 20-255 位之间', trigger: 'blur' },
  // ],
})

async function submitForm(formEl: FormInstance | undefined) {
  if (!formEl)
    return
  await formEl.validate(async (valid) => {
    if (!valid)
      return

    dialogOptions.loading = true

    if (Array.isArray(dialogOptions.data!.keywords)) {
      if (dialogOptions.data!.keywords.length < 10) {
        ElMessage.error('关键词数量不能少于10个！')
        dialogOptions.loading = false
        return
      }

      dialogOptions.data!.keywords = dialogOptions.data!.keywords.join(',')
    }

    if (dialogOptions.mode !== 'new') {
      const res: any = await chatAdminManager.updateTemplate(
        `${dialogOptions.data!.id!}`,
        dialogOptions.data as PromptEntityDto,
      )

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
      const res: any = await chatAdminManager.createTemplate(
        dialogOptions.data as PromptEntityDto,
      )

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

const auditOptions = reactive<{
  dialog: boolean
  data: PromptEntityDto
  result: {
    agreement: boolean
    status: 'pass' | 'reject'
    reason: string
  }
}>({
  dialog: false,
  data: {},
  result: {
    agreement: true,
    status: 'reject',
    reason: '',
  },
})

function handleAudit(data: any) {
  auditOptions.data = data
  auditOptions.dialog = true
  auditOptions.result.status = 'reject'
  auditOptions.result.reason = ''
}

async function submitAudit() {
  const id = auditOptions.data.id!
  const status = auditOptions.result.status === 'pass' ? 1 : 2
  const reason = auditOptions.result.reason

  const res: any = await chatAdminManager.auditTemplate(+id, {
    status,
    reason,
  })

  if (res.code === 200 && res.data) {
    ElMessage.success('审核提交成功！')
    auditOptions.dialog = false
    fetchData()
  }
  else {
    ElMessage.error(res.message ?? '审核提交失败！')
  }
}

function handleFilterTableTagStatus(value: string, row: any) {
  return row.status === +value
}

const rejectReason = reactive([
  { label: '内容违规', value: '您提交的内容违反了相关规定，不能通过审核哦。' },
  { label: '内容涉黄', value: '您的内容包含了不适当的色情信息，这是不被允许的哟。' },
  { label: '内容涉政', value: '您的内容涉及到政治方面的敏感信息，无法通过审核呢。' },
  { label: '内容涉恐', value: '您的内容涉及恐怖相关的信息，不符合要求哦。' },
  { label: '内容涉毒', value: '您的内容涉及毒品相关信息，这是绝对不可以的哈。' },
  { label: '内容抄袭', value: '亲，您的内容存在抄袭情况，这是不被认可的哟。' },
  { label: '内容虚假', value: '哎呀，您的内容存在虚假信息，不能通过审核呀。' },
  { label: '内容侵权', value: '您的内容侵犯了他人的权益，是不可以的呢。' },
  { label: '内容质量差', value: '亲，您的内容质量不太好，无法达到通过的标准哟。' },
  { label: '内容表意不明', value: '哎呀，您的内容意思表达不清晰，不能通过审核哈。' },
  { label: '内容存在误导', value: '您的内容可能会对他人产生误导，所以不能通过呢。' },
  { label: '内容过时', value: '亲，您的内容已经过时了，不符合当前的要求哟。' },
  { label: '内容与主题不符', value: '哎呀，您的内容与主题不相关，不能予以通过呀。' },
  { label: '内容缺乏依据', value: '您的内容缺乏足够的依据支持，是无法通过审核的呢。' },
  { label: '内容存在偏见', value: '亲，您的内容存在一定的偏见，这是不合适的哟。' },
  { label: '内容逻辑混乱', value: '哎呀，您的内容逻辑不够清晰，不能通过审核哈。' },
  { label: '内容语言不当', value: '您的内容语言使用不恰当，无法通过审核呢。' },
  { label: '内容重复', value: '亲，您的内容存在重复的情况，不能通过哟。' },
  { label: '内容格式错误', value: '哎呀，您的内容格式存在问题，不能予以通过呀。' },
  { label: '内容未经证实', value: '您的内容未经证实，是不可以通过审核的呢。' },
  {
    label: '内容存在安全隐患',
    value: '亲，您的内容可能存在安全方面的隐患，不能通过哟。',
  },
  { label: '内容违反道德规范', value: '哎呀，您的内容违反了道德规范，不能通过审核哈。' },
])

function getAuditType(status: number) {
  if (status === 0)
    return 'primary'
  else if (status === 1)
    return 'success'
  else if (status === 2)
    return 'warning'
  else if (status === 4)
    return 'primary'
  else if (status === 3)
    return 'info'
  else return 'danger'
}

function formateTitle(status: number) {
  switch (status) {
    case 0:
      return '待审核'
    case 1:
      return '审核通过'
    case 2:
      return '审核不通过'
    case 3:
      return '已发布'
    case 4:
      return '已下线'
    default:
      return '未知'
  }
}

const auditAssignOptions = reactive<{
  loading: boolean
  dialog: boolean
  data: {
    id: number
    tags: number[]
  } | null
  options: any[]
}>({
  dialog: false,
  data: null,
  loading: false,
  options: [],
})

function handleAuditAssign(data: PromptEntityDto) {
  auditAssignOptions.data = {
    id: data.id!,
    tags: data.tags?.map(item => item.id) || [],
  }
  auditAssignOptions.dialog = true
  auditAssignOptions.options = data.tags || []
}

async function remoteMethod(query: string) {
  if (query) {
    auditAssignOptions.loading = true

    const res: any = await searchPromptTag(query)

    if (res.code !== 200)
      ElMessage.error(res.message || '获取失败！')
    else
      auditAssignOptions.options = res.data

    auditAssignOptions.loading = false
  }
  else {
    auditAssignOptions.options = []
  }
}

async function submitAuditAssign() {
  const res: any = await assignPromptTags(auditAssignOptions.data!.id, auditAssignOptions.data!.tags)

  if (res.code === 200) {
    ElMessage.success('分配成功！')
    fetchData()
    auditAssignOptions.dialog = false
  }
  else {
    ElMessage.error(res.message || '分配失败！')
  }
}

async function publishPrompt(id: number, doPublish: boolean) {
  const res: any = await chatAdminManager.publishTemplate(id, doPublish)

  if (res.code === 200) {
    ElMessage.success('发布成功！')
    fetchData()
  }
  else {
    ElMessage.error(res.message || '发布失败！')
  }
}

function handleTableRowClass(data: any) {
  const { row } = data

  // 如果这条记录未审核则标黄 如果未通过则标红
  if (row.status === 0)
    return 'warning-row'
  else if (row.status === 2)
    return 'error-row'

  return ''
}

const statusOptions = [
  { label: '无', value: -1 },
  { label: '待审核', value: 0 },
  { label: '审核通过', value: 1 },
  { label: '审核不通过', value: 2 },
  { label: '已发布', value: 3 },
  { label: '已下线', value: 4 },
]
</script>

<template>
  <el-container class="CmsPrompt">
    <el-drawer
      v-model="auditAssignOptions.dialog" direction="btt" :close-on-press-escape="false"
      :close-on-click-modal="false" size="60%" title="PromptTemplate 分配"
    >
      <el-form
        v-if="auditAssignOptions.data" v-loading="auditAssignOptions.loading" :model="auditOptions.data"
        label-width="auto"
      >
        <el-form-item label="模板标题" prop="title">
          <el-select
            v-model="auditAssignOptions.data!.tags" multiple filterable remote reserve-keyword
            placeholder="输入文本进行搜索" :remote-method="remoteMethod" :loading="auditAssignOptions.loading"
            style="width: 240px"
          >
            <el-option v-for="item in auditAssignOptions.options" :key="item.id" :label="item.name" :value="item.id">
              <div flex items-center justify-between gap-4>
                <div flex items-center gap-2>
                  <div :class="item.icon" />
                  {{ item.name }}
                </div>
                <div float-right class="color-box" :style="`--c: ${item.color}`" />
              </div>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item label="操作" prop="action">
          <el-button type="warning" @click="submitAuditAssign">
            保存提交
          </el-button>
        </el-form-item>
      </el-form>
    </el-drawer>

    <el-dialog
      v-model="auditOptions.dialog" :close-on-press-escape="false" :close-on-click-modal="false" width="60%"
      title="PromptTemplate 审核"
    >
      <el-form v-if="auditOptions.data" :model="auditOptions.data" label-width="auto">
        <el-form-item label="模板头像" prop="avatar">
          <UserUploadAvatar v-model="auditOptions.data.avatar!" disabled />
        </el-form-item>
        <el-form-item label="模板标题" prop="title">
          <el-input v-model="auditOptions.data.title" :maxlength="255" disabled />
        </el-form-item>
        <el-form-item label="模板内容" prop="content">
          <el-input
            v-model="auditOptions.data.content" show-word-limit :maxlength="1024" disabled
            :autosize="{ minRows: 5, maxRows: 30 }" type="textarea"
          />
        </el-form-item>
        <el-form-item label="参考Prompt" prop="agreement">
          <span>
            I want you to act as a prompt generator. Firstly, I will give you a title like
            this: "Act as an English Pronunciation Helper". Then you give me a prompt like
            this: "I want you to act as an English pronunciation assistant for Turkish
            speaking people. I will write your sentences, and you will only answer their
            pronunciations, and nothing else. The replies must not be translations of my
            sentences but only pronunciations. Pronunciations should use Turkish Latin
            letters for phonetics. Do not write explanations on replies. My first sentence
            is "how the weather is in Istanbul?"." (You should adapt the sample prompt
            according to the title I gave. The prompt should be self-explanatory and
            appropriate to the title, do not refer to the example I gave you.). My first
            title is "提示词功能" (Give me prompt only)<el-link
              mx-2 type="primary"
              @click="dialogOptions.meta.dialog = true"
            >Prompt工程师参考</el-link>
          </span>
        </el-form-item>
      </el-form>

      <el-divider />
      <el-form>
        <el-form-item :model="auditOptions.result" label="审核结果" prop="status">
          <el-radio-group v-model="auditOptions.result.status" size="small">
            <el-radio-button label="通过审核" value="pass" />
            <el-radio-button label="拒绝驳回" value="reject" />
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="auditOptions.result.status === 'reject'" label="拒绝原因" prop="reason">
          <el-select v-model="auditOptions.result.reason">
            <el-option v-for="item in rejectReason" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
          {{ auditOptions.result.reason }}
        </el-form-item>
        <el-form-item v-if="auditOptions.result.status === 'pass'" label="审核承诺" prop="agreement">
          <el-checkbox v-model="auditOptions.result.agreement">
            通过模板审核代表我对该模板造成的任何后果负责，包括但不限于民事责任，刑事责任。若因该模板自身缺陷所表达不佳所造成的后果由模板创建者承担。
          </el-checkbox>
        </el-form-item>
        <el-form-item label="审核操作" prop="action">
          <el-button type="warning" @click="submitAudit">
            提交
          </el-button>
        </el-form-item>
      </el-form>
    </el-dialog>

    <div class="CmsPrompt-Header">
      <el-row>
        <el-col v-for="item in statistics" :key="item.status" :span="4">
          <el-statistic :title="`今日${formateTitle(item.status)}`" :value="+item.count" />
        </el-col>
      </el-row>
    </div>

    <el-main>
      <el-form :disabled="formLoading" :inline="true" :model="formInline">
        <el-form-item label="标题">
          <el-input v-model="formInline.keyword" minlength="4" placeholder="搜索模板..." clearable />
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="formInline.status" placeholder="状态" style="width: 120px">
            <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>

        <el-form-item style="margin-right: 0" float-right>
          <el-button @click="handleReset">
            重置
          </el-button>
          <el-button :loading="formLoading" type="primary" @click="fetchData">
            查询
          </el-button>
          <el-button type="success" @click="handleDialog(null, 'new')">
            新建模板
          </el-button>
        </el-form-item>
      </el-form>

      <ClientOnly>
        <el-table
          v-if="prompts?.items" :row-class-name="handleTableRowClass" :data="prompts.items" height="80%"
          table-layout="auto"
        >
          <el-table-column prop="id" label="编号" />
          <el-table-column label="头像">
            <template #default="scope">
              <UserAvatar :avatar="scope.row.avatar" />
            </template>
          </el-table-column>
          <el-table-column label="标题">
            <template #default="{ row }">
              {{ row.title }}
            </template>
          </el-table-column>
          <el-table-column label="正文字数" width="100px">
            <template #default="{ row }">
              {{ row.content?.length }}字
            </template>
          </el-table-column>
          <el-table-column
            :filters="[
              { text: '待审核', value: '0' },
              { text: '已通过', value: '1' },
              { text: '未通过', value: '2' },
              { text: '已发布', value: '3' },
              { text: '未发布', value: '4' },
            ]" prop="status" label="状态" :filter-method="handleFilterTableTagStatus" filter-placement="bottom-end"
          >
            <template #default="{ row }">
              <template v-if="row.status === 0">
                <el-tag type="warning">
                  等待审核
                </el-tag>

                <el-button v-permission="`aigc:audit`" type="primary" size="small" plain mx-2 @click="handleAudit(row)">
                  立即审核
                </el-button>
              </template>
              <div v-else-if="row.status === 1" flex items-center gap-2>
                <el-tag type="primary">
                  已通过
                </el-tag>
                <el-tooltip effect="dark" content="要想模板被发现，你还需要配置Prompt的分类!" placement="top">
                  <div i-carbon:warning />
                </el-tooltip>
                <el-button
                  v-permission="`aigc:audit`" type="primary" size="small" plain
                  @click="handleAuditAssign(row)"
                >
                  立即分配
                </el-button>
              </div>
              <el-tag v-else-if="row.status === 2" type="danger">
                未通过
              </el-tag>
              <el-tag v-else-if="row.status === 4" type="info">
                未发布
              </el-tag>
              <el-tag v-else-if="row.status === 3" type="success">
                已发布
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="createdAt" label="创建时间">
            <template #default="scope">
              {{ formatDate(scope.row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column prop="updatedAt" label="更新时间" width="180">
            <template #default="scope">
              {{ formatDate(scope.row.updatedAt) }}
            </template>
          </el-table-column>
          <el-table-column label="最后更新">
            <template #default="{ row }">
              <PersonalNormalUser :data="row.updater" />
            </template>
          </el-table-column>
          <el-table-column label="创建者">
            <template #default="{ row }">
              <PersonalNormalUser :data="row.creator" />
            </template>
          </el-table-column>
          <el-table-column fixed="right" label="操作" width="200">
            <template #default="{ row }">
              <el-button plain text size="small" @click="handleDialog(row, 'read')">
                详情
              </el-button>
              <el-button
                v-if="row.status !== 0" plain text size="small" type="warning"
                @click="handleDialog(row, 'edit')"
              >
                编辑
              </el-button>
              <el-button
                v-if="row.status === 4" plain text size="small" type="primary"
                @click="publishPrompt(row.id, true)"
              >
                发布
              </el-button>
              <el-button
                v-if="row.status === 3" plain text size="small" type="warning"
                @click="publishPrompt(row.id, false)"
              >
                下线
              </el-button>
              <el-button v-if="row.status === 1" :disabled="true" plain text size="small" type="danger">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="CmsPrompt-Footer">
          <div class="UserStatistics">
            <h1>尊敬的 {{ userStore.nickname }} 您累计数据如下：</h1>
            <el-row>
              <el-col v-for="item in userStatistics" :key="item.status" :span="4">
                <el-statistic :title="`历史${formateTitle(item.status)}`" :value="+item.count" />
              </el-col>
            </el-row>
          </div>

          <el-pagination
            v-if="prompts?.meta" v-model:current-page="prompts.meta.currentPage"
            v-model:page-size="prompts.meta.itemsPerPage" :disabled="formLoading" :page-sizes="[15, 30, 50, 100]"
            layout="total, sizes, prev, pager, next, jumper" :total="prompts.meta.totalItems" @change="fetchData"
          />
        </div>
      </ClientOnly>
    </el-main>

    <el-drawer v-model="dialogOptions.visible" size="50%" :close-on-click-modal="false" :close-on-press-escape="false">
      <template #header>
        <h4>
          <span v-if="dialogOptions.mode === 'new'">新建</span>
          <span v-else-if="dialogOptions.mode === 'edit'">编辑</span>
          <span v-else-if="dialogOptions.mode === 'read'">查看</span>模板信息<span v-if="dialogOptions.data" mx-4 op-50>#{{
            dialogOptions.data.id }}</span>
        </h4>
      </template>
      <template #default>
        <el-form
          v-if="dialogOptions.data" ref="ruleFormRef"
          :disabled="dialogOptions.loading || dialogOptions.mode === 'read'" style="max-width: 1280px"
          :model="dialogOptions.data" :rules="rules" label-width="auto" status-icon
        >
          <el-form-item label="模板头像" prop="avatar">
            <ImageUpload
              v-model="dialogOptions.data.avatar!"
              :disabled="dialogOptions.loading || dialogOptions.mode === 'read'"
            />
          </el-form-item>
          <el-form-item v-if="dialogOptions.data && dialogOptions.mode === 'read'" label="模板状态">
            <el-tag v-if="dialogOptions.data.status === 0" type="warning">
              等待审核
            </el-tag>
            <el-tag v-else-if="dialogOptions.data.status === 1" type="success">
              已通过
            </el-tag>
            <el-tag v-else-if="dialogOptions.data.status === 2" type="danger">
              未通过
            </el-tag>
            <el-tag v-else-if="dialogOptions.data.status === 4" type="info">
              未发布
            </el-tag>
            <el-tag v-else-if="dialogOptions.data.status === 3" type="success">
              已发布
            </el-tag>
          </el-form-item>
          <el-form-item label="模板标题" prop="title">
            <el-input v-model="dialogOptions.data.title" :maxlength="255" :disabled="dialogOptions.mode !== 'new'" />
          </el-form-item>
          <el-form-item label="模板介绍" prop="description">
            <el-input v-model="dialogOptions.data.description" :maxlength="255" type="textarea" />
          </el-form-item>
          <el-form-item label="模板关键词">
            <el-select
              v-model="dialogOptions.data.keywords" filterable multiple allow-create default-first-option
              :reserve-keyword="false" placeholder="选择或创建模板关键词"
            >
              <el-option label="信息" value="信息" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="dialogOptions.mode === 'read'" label="模板标签" prop="tags">
            <span v-for="item in dialogOptions.data.tags" :key="item.id" mx-2 flex items-center>
              <el-tooltip>
                <template #default>
                  <el-tag type="primary">
                    <div flex items-center gap-2>
                      #{{ item.id }} {{ item.name }}
                      <div class="color-box" :style="`--c: ${item.color}`" />
                    </div>
                  </el-tag>
                </template>
                <template #content>
                  <div>{{ item.description }}</div>
                </template>
              </el-tooltip>
            </span>
          </el-form-item>
          <el-form-item label="模板内容" prop="content">
            <el-input
              v-model="dialogOptions.data.content" show-word-limit :maxlength="512"
              :autosize="{ minRows: 5, maxRows: 30 }" type="textarea"
            />
          </el-form-item>
          <el-form-item v-if="dialogOptions.mode === 'read'" label="创建者" prop="content">
            <PersonalNormalUser :data="dialogOptions.data.creator" />
          </el-form-item>
          <el-form-item v-if="dialogOptions.mode === 'read'" label="操作记录">
            <el-timeline style="max-width: 600px">
              <el-timeline-item
                v-for="(audit, index) in dialogOptions.data.audits" :key="index"
                :type="getAuditType(audit.status)" size="large" :timestamp="audit.createdAt"
              >
                <span v-if="audit.status === 2" flex items-center>
                  <PersonalNormalUser :data="audit.auditor" />: {{ audit.reason }}
                </span>
                <span v-else-if="audit.status === 1" flex items-center>
                  已由
                  <PersonalNormalUser :data="audit.auditor" /> 审核通过
                </span>
                <span v-else-if="audit.status === 0" flex items-center>
                  <PersonalNormalUser :data="audit.auditor" />: 正在审核中({{
                    audit.reason
                  }})
                </span>
                <span v-else-if="audit.status === 3" flex items-center>
                  <PersonalNormalUser :data="audit.auditor" />: 已发布上线
                </span>
                <span v-else-if="audit.status === 4" flex items-center>
                  <PersonalNormalUser :data="audit.auditor" />: {{
                    audit.reason
                  }}
                </span>
              </el-timeline-item>
            </el-timeline>
          </el-form-item>

          <el-form-item v-if="dialogOptions.mode !== 'read'" label="提交须知" prop="agreement">
            <ul>
              <li>1.您的提示词需要为标准格式</li>
              <li>2.您的提示词需要保证清晰明了，不能包含任何恶意内容</li>
              <li>3.提示词必须至少200字以保证模板效果</li>
              <li>4.请您在提交之前仔细核验变量</li>
              <li>
                5.提交后，您的模板将会进入审核流程，审核通过后，您的模板将会在角色市场中展示
              </li>
            </ul>
          </el-form-item>

          <el-form-item v-if="dialogOptions.mode !== 'read'" label="参考Prompt" prop="agreement">
            <span>
              I want you to act as a prompt generator. Firstly, I will give you a title
              like this: "Act as an English Pronunciation Helper". Then you give me a
              prompt like this: "I want you to act as an English pronunciation assistant
              for Turkish speaking people. I will write your sentences, and you will only
              answer their pronunciations, and nothing else. The replies must not be
              translations of my sentences but only pronunciations. Pronunciations should
              use Turkish Latin letters for phonetics. Do not write explanations on
              replies. My first sentence is "how the weather is in Istanbul?"." (You
              should adapt the sample prompt according to the title I gave. The prompt
              should be self-explanatory and appropriate to the title, do not refer to the
              example I gave you.). My first title is "提示词功能" (Give me prompt
              only)<el-link mx-2 type="primary" @click="dialogOptions.meta.dialog = true">Prompt工程师参考</el-link>
            </span>
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
            <el-popconfirm
              v-if="dialogOptions.data"
              title="提交模板审核代表我对该模板造成的任何后果负责，包括但不限于民事责任，刑事责任。若因该模板自身缺陷所表达不佳所造成的后果由我自身承担。"
              @confirm="submitForm(ruleFormRef)"
            >
              <template #reference>
                <!-- !dialogOptions.meta.polish && dialogOptions.meta.translation -->
                <el-button
                  :disabled="dialogOptions.data.content!.length < 200" :loading="dialogOptions.loading"
                  type="primary"
                >
                  {{ dialogOptions.mode !== "new" ? "修改并提交审核" : "新建并提交审核" }}
                </el-button>
              </template>
            </el-popconfirm>
          </template>
        </div>
      </template>
    </el-drawer>

    <el-drawer
      v-model="dialogOptions.meta.dialog" size="50%" :close-on-click-modal="false"
      :close-on-press-escape="false" direction="ltr"
    >
      <template #header>
        <h4>标准 PromptEngineer 格式参考</h4>
      </template>
      <el-tabs>
        <el-tab-pane label="PromptEngineer">
          <RenderContentOld readonly :data="PromptEngineer" />
        </el-tab-pane>
        <el-tab-pane label="External">
          <div flex gap-2>
            <el-link target="_blank" href="https://prompt-shortcut.writeathon.cn/">
              WriteAthon
            </el-link>
            <el-link target="_blank" href="https://prompts.chat/">
              Prompts
            </el-link>
            <el-link target="_blank" href="https://gpt.candobear.com/prompt">
              CandoBear Prompts
            </el-link>
            <el-link target="_blank" href="https://github.com/langgptai/wonderful-prompts">
              Wonderful Prompts(GitHub)
            </el-link>
            <el-link target="_blank" href="https://huggingface.co/spaces/merve/ChatGPT-prompt-generator">
              Auto Prompt Generator(HuggingFace)
            </el-link>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-drawer>
  </el-container>
</template>

<style lang="scss">
section.CmsPrompt {
  .UserStatistics {
    h1 {
      font-size: 18px;
    }

    flex: 1;
  }

  .CmsPrompt-Footer {
    display: flex;

    width: 100%;

    align-items: center;
    justify-content: space-between;
  }
  .el-main {
    padding: 2rem;
    display: flex;

    flex-direction: column;
  }

  display: flex;

  flex-direction: column;
}

.color-box {
  position: relative;
  margin: 0 0.25rem;

  width: 12px;
  height: 12px;

  border-radius: 4px;
  background-color: var(--c);
}
</style>
