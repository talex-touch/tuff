<script lang="ts" setup>
import type { FormInstance, FormRules } from 'element-plus'
import { $endApi } from '~/composables/api/base'
import type { IStandardPageModel } from '~/composables/api/base/index.type'
import type { IDoc, IDocQuery } from '~/composables/api/base/v1/cms.type'

definePageMeta({
  name: '文档管理',
  layout: 'admin',
  pageTransition: {
    name: 'rotate',
  },
})

const formLoading = ref(false)
const docs = ref<IStandardPageModel<IDoc>>({
  items: [],
  meta: {
    currentPage: 0,
    itemCount: 0,
    totalPages: 0,
    itemsPerPage: 0,
    totalItems: 0,
  },
})

const formInline = reactive({
  title: '',
  meta: '',
  permission: '',
  status: '',
})

function handleReset() {
  formInline.title = ''
  formInline.meta = ''
  formInline.permission = ''
  formInline.status = ''
}

onMounted(fetchData)

async function fetchData() {
  formLoading.value = true

  const query: Record<string, any> = {
    page: docs.value.meta.currentPage,
    pageSize: docs.value.meta.itemsPerPage,
    title: formInline.title,
    status: formInline.status,
  }

  // 过滤掉为空的值
  Object.entries(query).forEach(([key, value]) => {
    if (!value)
      delete query[key]
  })

  const res: any = await $endApi.v1.cms.doc.list(query as IDocQuery)
  if (!res) {
    ElMessage.warning('参数错误，查询失败！')
  }
  else {
    if (res.code === 200) {
      docs.value = res.data

      docs.value.items.forEach((item: IDocQuery) => {
        if (item.meta?.length) {
          if (item.meta === 'undefined' || atob(item.meta) === 'undefined')
            item.meta = ''
        }
        else { item.meta = decodeURIComponent(atob(item.meta)) }
      })
    }
  }

  formLoading.value = false
}

const dialogOptions = reactive<{
  visible: boolean
  mode: 'edit' | 'read' | 'new'
  data: Partial<IDoc & { content: string }>
  loading: boolean
  // meta: {
  //   parentDoc: number
  // }
  save: {
    cur: number
    loading: boolean
    lastSave: number
    text: string
  }
}>({
  visible: false,
  mode: 'edit',
  data: {},
  loading: false,
  // meta: {
  //   parentDoc: -1,
  // },
  save: {
    cur: -1,
    loading: false,
    lastSave: -1,
    text: '',
  },
})

async function handleDialog(data: Partial<IDoc>, mode: 'edit' | 'read' | 'new', addon?: 'copy' | 'download') {
  dialogOptions.mode = mode

  if (mode !== 'new') {
    const loading = ElLoading.service({
      lock: true,
      text: '加载中',
      background: 'rgba(0, 0, 0, 0.7)',
    })

    const res = await $endApi.v1.cms.doc.info(data.id!)

    loading.close()
    if (res.data?.length !== 2) {
      ElMessage.error('无法得到有效文档！')
      return
    }

    data.record = res.data[1] as any

    if (addon === 'copy') {
      const source = decodeText(data.record!.content)

      const { copy, copied } = useClipboard({ source })

      await copy(source)

      if (copied.value)
        ElMessage.success('复制成功！')
      else
        ElMessage.error('复制失败！')

      return
    }
    else if (addon === 'download') {
      const source = decodeText(data.record!.content)

      // 转存为md文件
      const blob = new Blob([source], { type: 'text/plain;charset=utf-8' })

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      document.body.appendChild(a)

      a.href = url
      a.download = `${data.title}.md`
      a.click()

      return
    }
  }

  dialogOptions.data
    = mode === 'new'
      ? {
          title: '',
          meta: '',
          permission: '',
          content: '',
        }
      : {
          ...data,
          content: data.record?.content ? decodeURIComponent(atob(data.record.content)) : '',
        }
  // dialogOptions.meta = data.meta ? JSON.parse(data.meta) : { parentDoc: -1 }

  dialogOptions.save.text = '编辑后保存'
  dialogOptions.visible = true

  if (!dialogOptions.data.metaOptions) {
    if (dialogOptions.data.meta) {
      dialogOptions.data.metaOptions = JSON.parse(dialogOptions.data.meta)
    }
    else {
      dialogOptions.data.metaOptions = {
        parentDoc: -1,
        password: '',
      }
    }
  }
}

const ruleFormRef = ref<FormInstance>()

const rules = reactive<FormRules<IDoc>>({
  status: [{ required: true, message: '请选择状态', trigger: 'blur' }],
})

function handleArchiveDoc(id: number, data: IDoc) {
  ElMessageBox.confirm(
    `你确定要归档文档 ${data.title} #${id} 吗？归档文件后你将不可以再编辑这个文件。`,
    '确认归档',
    {
      confirmButtonText: '取消',
      cancelButtonText: '确定归档',
      closeOnClickModal: false,
      showClose: false,
    },
  )
    .then(() => {
      ElMessage({
        grouping: true,
        type: 'success',
        message: '已取消归档文档！',
      })
    })
    .catch(async () => {
      const res: any = await $endApi.v1.cms.doc.archived(id)
      if (res.code !== 200) {
        ElMessage.error(res.message || '归档失败！')
        return
      }

      fetchData()

      ElNotification({
        title: 'Info',
        message: `你归档了文档 ${data.title} #${id} 及其相关数据！`,
        type: 'info',
      })
    })
}

function handleChangeName() {
  // 要求 2 - 32 位之间，不能出现特殊符号 可以有中文
  const namePattern = /^[\u4E00-\u9FA5a-zA-Z0-9]{2,32}$/

  ElMessageBox.prompt('请输入修改后的文档名称', '修改文档名称', {
    confirmButtonText: '修改',
    cancelButtonText: '取消',
    inputPattern: namePattern,
    inputValue: dialogOptions.data.title,
    inputErrorMessage: '不合规的文档名称',
  })
    .then(async ({ value }) => {
      dialogOptions.data.title = value

      const res = await $endApi.v1.cms.doc.create({
        ...dialogOptions.data,
        content: dialogOptions.data.content ? btoa(encodeURIComponent(dialogOptions.data.content)) : '',
      } as IDoc)

      if (res.code !== 200) {
        ElMessage({
          type: 'error',
          message: res.message || '修改失败！',
        })

        dialogOptions.data.title = ''

        return
      }

      dialogOptions.data.id = res.data?.id

      ElMessage({
        type: 'success',
        message: `修改成功`,
      })
    })
    .catch(() => {
    })
}

async function tryTempSave(content: string, callback: Function) {
  dialogOptions.save.loading = true

  const res = await $endApi.v1.cms.doc.tempSave(dialogOptions.data.id!, {
    ...dialogOptions.data,
    content: btoa(encodeURIComponent(content)),
  } as IDoc)

  dialogOptions.save.loading = false

  if (res.code === 200) {
    dialogOptions.save.lastSave = Date.now()
    callback(true)
  }
  else {
    callback(false)

    ElMessageBox.alert(res.message || '保存失败！', '提示', {
      confirmButtonText: '了解',
      callback: () => dialogOptions.visible = false,
    })
  }
}

function timer() {
  if (dialogOptions.visible) {
    dialogOptions.save.cur = Date.now()

    const diff = dialogOptions.save.cur - dialogOptions.save.lastSave
    if (dialogOptions.save.lastSave === -1 || diff >= 15000)
      dialogOptions.save.text = '编辑后保存'
    else
      dialogOptions.save.text = `${Number.parseInt(`${diff / 1000}`)} 秒前保存`
  }

  setTimeout(timer, 3000)
}

timer()

watch(() => dialogOptions.visible, async (visible) => {
  if (!visible && dialogOptions.data.status !== 3 && dialogOptions.mode !== 'read') {
    // 如果没有编辑文档则直接返回
    if (!dialogOptions.data.title)
      return

    const res = await $endApi.v1.cms.doc.update(dialogOptions.data.id!, {
      ...dialogOptions.data,
      meta: btoa(encodeURIComponent(JSON.stringify(dialogOptions.data.metaOptions))),
      content: dialogOptions.data.content ? btoa(encodeURIComponent(dialogOptions.data.content)) : '',
    } as IDoc)

    if (res.code !== 200) {
      ElMessage.error(res.message || '保存失败！')

      dialogOptions.visible = true
      return
    }

    fetchData()
  }
})

async function handlePublishVersion(id: number) {
  const res = await $endApi.v1.cms.doc.public(id)

  if (res.code !== 200) {
    ElMessage.error(res.message || '发版失败！')

    return
  }

  ElNotification({
    title: 'Info',
    message: `你发版了文档 #${id} 及其相关数据！`,
    type: 'info',
  })

  fetchData()
}

async function handleAssociateProtocol(id: number) {
  ElMessageBox.prompt('请输入关联协议key', '文档关联协议', {
    confirmButtonText: '关联',
    cancelButtonText: '取消',
  })
    .then(async ({ value }) => {
      const res = await $endApi.v1.cms.doc.associateAgreement(id, value)

      if (res.code !== 200) {
        ElMessage.error(res.message || '关联失败！')

        return
      }

      ElNotification({
        title: 'Info',
        message: `你关联了协议文档 #${id} 及其相关数据！`,
        type: 'info',
      })

      fetchData()
    })
    .catch(() => {
      ElMessage({
        type: 'info',
        message: '协议取消关联',
      })
    })
}
</script>

<template>
  <el-container class="CmsDoc">
    <el-main>
      <el-form :disabled="formLoading" :inline="true" :model="formInline">
        <el-form-item label="文档标题">
          <el-input v-model="formInline.title" minlength="4" placeholder="搜索文档标题" clearable />
        </el-form-item>
        <el-form-item label="状态">
          <el-input v-model="formInline.status" placeholder="搜索文档状态" clearable />
        </el-form-item>

        <el-form-item style="margin-right: 0" float-right>
          <el-button @click="handleReset">
            重置
          </el-button>
          <el-button :loading="formLoading" type="primary" @click="fetchData">
            查询
          </el-button>
          <el-button type="success" @click="handleDialog({}, 'new')">
            新建文档
          </el-button>
        </el-form-item>
      </el-form>

      <ClientOnly>
        <el-table v-if="docs?.items" table-layout="auto" fit :data="docs.items" style="width: 100%">
          <el-table-column prop="id" label="序号" />
          <el-table-column label="文档名">
            <template #default="{ row }">
              {{ row.title }}
            </template>
          </el-table-column>
          <el-table-column label="属性">
            <template #default="{ row }">
              {{ row.meta }}
            </template>
          </el-table-column>
          <el-table-column label="权限">
            <template #default="{ row }">
              {{ row.permission }}
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态">
            <template #default="{ row }">
              <el-tag v-if="row.status === 0" type="info">
                草稿
              </el-tag>
              <el-tag v-else-if="row.status === 1" type="warning">
                未发布
              </el-tag>
              <el-tag v-else-if="row.status === 2" type="success">
                已发布
              </el-tag>
              <el-tag v-else-if="row.status === 3" type="danger">
                归档
              </el-tag>
              <el-tag v-else-if="row.status === 4" type="primary">
                协议
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
          <el-table-column fixed="right" label="操作">
            <template #default="{ row }">
              <el-popover placement="bottom" :width="200" trigger="hover">
                <template #reference>
                  <el-button v-if="row.status !== 0" plain text size="small">
                    更多
                  </el-button>
                </template>
                <el-button plain text size="small" @click="handleDialog(row, 'read')">
                  详情
                </el-button>
                <el-button plain text size="small" @click="handleDialog(row, 'read', 'download')">
                  下载
                </el-button>
                <el-button plain text size="small" @click="handleDialog(row, 'read', 'copy')">
                  复制
                </el-button>
              </el-popover>

              <el-button
                v-if="row.status !== 3" plain text size="small" type="warning"
                @click="handleDialog(row, 'edit')"
              >
                编辑
              </el-button>
              <el-button
                v-if="row.status !== 0 && row.status !== 3" plain text size="small" type="danger"
                @click="handleArchiveDoc(row.id, row)"
              >
                归档
              </el-button>

              <el-popover v-if="row.status === 1" placement="bottom" :width="200" trigger="hover">
                <template #reference>
                  <el-button v-if="row.status !== 0" plain type="primary" text size="small">
                    发版
                  </el-button>
                </template>
                <el-button plain text size="small" type="primary" @click="handlePublishVersion(row.id)">
                  直接发版
                </el-button>
                <el-button plain text size="small" type="success" @click="handleAssociateProtocol(row.id)">
                  关联为协议
                </el-button>
              </el-popover>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-if="docs?.meta" v-model:current-page="docs.meta.currentPage"
          v-model:page-size="docs.meta.itemsPerPage" :disabled="formLoading" float-right my-4
          :page-sizes="[20, 40, 60, 80]" layout="total, sizes, prev, pager, next, jumper" :total="docs.meta.totalItems"
          @change="fetchData"
        />
      </ClientOnly>
    </el-main>

    <ClientOnly>
      <teleport to="body">
        <div class="GuideEditor" :class="{ visible: dialogOptions.visible }">
          <div class="Header">
            <div class="time-status">
              <OtherTextView v-if="dialogOptions.mode === 'read' || dialogOptions.data.status === 3" text="只读模式" />
              <OtherTextView v-else :text="dialogOptions.data.title ? dialogOptions.save.text : '无法保存'" />
            </div>

            <h4 flex items-center gap-2>
              <span>
                <span v-if="!dialogOptions.data.title" text-red>
                  未编辑文档标题，修改不会被保存
                </span>
                {{ dialogOptions.data.title }}
              </span>
              <span v-if="dialogOptions.mode !== 'read'" flex items-center gap-2>
                <div i-carbon:edit cursor-pointer op-75 @click="handleChangeName" />
                <span v-if="dialogOptions.mode === 'edit'">#{{ dialogOptions.data.id }}</span>
              </span>
            </h4>

            <div class="Header-Footer">
              <el-button :loading="dialogOptions.save.loading" @click="dialogOptions.visible = false">
                关闭
              </el-button>
            </div>
          </div>

          <div v-if="dialogOptions.data" class="GuideContent">
            <div class="GuideEditor-Mask" :class="{ hide: dialogOptions.data.title }">
              <span>请先编辑文档标题再编辑。</span>
            </div>

            <ArticleThEditor
              v-model="dialogOptions.data.content!"
              :readonly="dialogOptions.mode === 'read' || dialogOptions.data.status === 3" @save="tryTempSave"
            >
              <template #property>
                <el-form
                  v-if="!false" ref="ruleFormRef"
                  :disabled="dialogOptions.loading || dialogOptions.mode === 'read'" :model="dialogOptions.data"
                  :rules="rules" label-width="auto" status-icon my-4 inline
                >
                  <el-form-item label="文档权限" prop="permission">
                    <el-input v-model="dialogOptions.data.permission" :disabled="dialogOptions.mode === 'read'" />
                  </el-form-item>
                  <el-form-item v-if="dialogOptions.data.metaOptions" label="文档密码" prop="password">
                    <el-input
                      v-model="dialogOptions.data.metaOptions!.password"
                      :disabled="dialogOptions.mode === 'read'" type="password"
                    />
                  </el-form-item>
                  <el-form-item v-if="dialogOptions.data.metaOptions" label="父节点文档">
                    <el-select
                      v-model="dialogOptions.data.metaOptions.parentDoc" style="width: 177px"
                      placeholder="选择父节点文档"
                    >
                      <el-option label="根节点" :value="-1" />
                      <el-option v-for="item in docs.items" :key="item.id" :label="item.title" :value="item.id!" />
                    </el-select>
                  </el-form-item>
                </el-form>
              </template>
            </ArticleThEditor>
          </div>
        </div>
      </teleport>
    </ClientOnly>
  </el-container>
</template>

<style lang="scss">
.GuideEditor-Mask {
  &.hide {
    opacity: 0;
    pointer-events: none;
    transform: scale(1.25);
  }

  z-index: 1;
  position: absolute;
  display: flex;

  font-size: 2rem;
  align-items: center;
  justify-content: center;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  font-weight: 600;
  transition: 0.25s;
  cursor: not-allowed;
  color: var(--el-color-danger);
  background-color: var(--el-mask-color-extra-light);
  backdrop-filter: blur(1px) saturate(180%) brightness(80%);
}

.CmsDoc {
  .el-table__cell .cell {
    text-align: center;
  }

  .el-main {
    flex-direction: column;
  }
}

.GuideEditor {
  .Header {
    z-index: 1;
    position: sticky;
    display: flex;

    top: 0;
    left: 0;

    width: 100%;
    height: 60px;

    align-items: center;
    justify-content: center;

    font-size: 20px;
    font-weight: 600;

    flex-shrink: 0;
    // border-bottom: 1px solid var(--el-border-color);
    // box-shadow: var(--el-box-shadow);
    background-color: var(--el-bg-color);
  }

  .Header-Footer {
    position: absolute;

    right: 2rem;
  }

  .time-status {
    position: absolute;
    padding: 0.25rem 0.5rem;

    left: 2rem;

    font-weight: 300;
    font-size: 14px;

    border-radius: 12px;
    background-color: var(--el-color-info-light-9);
  }

  .GuideContent {
    position: relative;

    top: 0;
    left: 0;

    height: 100%;
    width: 100%;
    // height: calc(100% - 84px);

    overflow: hidden;
  }

  z-index: 100;
  position: absolute;
  display: flex;
  padding: 0;
  margin: 0;

  top: 0;
  left: 0;

  width: 100%;
  height: 100%;

  overflow: hidden;
  border-radius: 0;
  flex-direction: column;
  background-color: var(--el-bg-color);

  opacity: 0;
  pointer-events: none;
  transform: scale(1.15);
  transition: 0.25s;

  &.visible {
    opacity: 1;
    pointer-events: all;
    transform: scale(1);
  }
}
</style>
