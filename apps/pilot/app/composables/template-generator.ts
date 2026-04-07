import type { FormInstance } from 'element-plus'
import type { IDataResponse, IPageResponse, IStandardPageModel, IStandardResponse } from './api/base/index.type'

export interface TemplateDataHandler<T extends Record<string, any>, PageT extends Partial<T> & { page: number, pageSize: number }, O> {
  getEmptyModel: () => T
  onFetchSuccess?: () => Promise<void>
  /**
   * 函数的功能是根据传入的原始数据和操作模式，转换并返回一个新的数据。
   * @param originData
   * @param mode
   * @returns
   */
  transformSubmitData?: (originData: T, mode: CrudMode) => any
  postList?: (body: Partial<PageT>) => Promise<IPageResponse<T>>
  getList?: (query: Partial<PageT>) => Promise<IPageResponse<T>>
  update?: (id: string | number, data: T) => Promise<IStandardResponse>
  create?: (data: T) => Promise<IStandardResponse>
  delete?: (id: string | number) => Promise<IStandardResponse>
  deletes?: (ids: Array<number>) => Promise<IStandardResponse>
  handleCrudDialog?: (data: T, mode: CrudMode, meta?: Partial<O>) => void

  getDeleteBoxTitle: (id: string | number) => string
  getDeleteBoxTitles?: (ids: Array<number>) => string
}

export type CrudMode = 'NEW' | 'EDIT' | 'READ'

export enum CurdController {
  CREATE = 1,
  REVIEW = 2,
  UPDATE = 4,
  DELETE = 8,
}

/**
 * 生成CMS模板数据
 *
 * @template T 扩展自Record<string, any>与可选的id属性，用于定义数据的基本结构
 * @template PageT 扩展自T并增加page和pageSize属性，用于定义分页数据的结构
 * @template O 用于定义额外的元数据结构，可选
 * @param dataHandler 数据处理函数，用于与后端API交互
 * @param queryData 查询参数，用于初始化查询条件
 * @returns 返回一个对象，包含数据列表、表单加载状态、CRUD对话框选项以及数据获取和处理函数
 */
export function genCmsTemplateData<T extends Record<string, any> & { id?: number | string }, PageT extends Partial<T> & { page: number, pageSize: number }, O extends Record<string, any> | null>(
  dataHandler: TemplateDataHandler<T, PageT, O>,
  queryData: Partial<PageT>,
) {
  const formLoading = ref(false)
  const list = ref<IStandardPageModel<T>>({
    items: [],
    meta: {
      currentPage: 0,
      itemCount: 0,
      totalPages: 0,
      itemsPerPage: 20,
      totalItems: 0,
    },
  })

  /**
   * 传什么类型，生成什么类型
   */
  type QueryDataType<TValue> = { [key in keyof TValue]: TValue[key] }

  const internalQueryData = reactive<QueryDataType<PageT>>(JSON.parse(JSON.stringify(queryData)))
  const getDeleteBoxTitles = dataHandler.getDeleteBoxTitles ?? ((ids: Array<number>) => ids.map(id => dataHandler.getDeleteBoxTitle(id)).join('、'))

  async function fetchData() {
    if (formLoading.value)
      return

    formLoading.value = true

    const query: Record<string, any> = {
      page: list.value.meta.currentPage,
      pageSize: list.value.meta.itemsPerPage,
      ...internalQueryData,
    }

    // 过滤掉为空的值
    Object.entries(query).forEach(([key, value]) => {
      if (!value)
        delete query[key]
    })

    const res = await dataHandler.getList!(query as PageT)
    if (res.code === 200) {
      console.log('res', res.data)

      list.value = res.data as any

      console.log('list', list.value)

      dataHandler.onFetchSuccess?.()
    }

    formLoading.value = false
  }

  const crudDialogOptions = reactive<{
    visible: boolean
    mode: CrudMode
    data: T | null
    loading: boolean
    meta: Partial<O>
  }>({
    visible: false,
    mode: 'NEW',
    data: null,
    loading: false,
    meta: {},
  })

  function handleCrudDialog(data: T | null, mode: CrudMode, meta?: Partial<O>) {
    Object.assign(crudDialogOptions, {
      meta,
      mode,
      data: data || dataHandler.getEmptyModel(),
      visible: true,
    })

    dataHandler.handleCrudDialog?.(data!, mode, meta)
  }

  async function submitForm(formEl: FormInstance | undefined) {
    if (!formEl)
      return

    await formEl.validate(async (valid) => {
      if (!valid)
        return

      const data = crudDialogOptions.data as T | undefined

      if (!data) {
        ElMessage.error('流程数据错误！')
        return
      }

      crudDialogOptions.loading = true
      const submitData = dataHandler.transformSubmitData?.(data, crudDialogOptions.mode) || data

      if (crudDialogOptions.mode === 'EDIT') {
        const res: any = await dataHandler.update!(submitData.id!, submitData)

        if (res.code === 200) {
          ElMessage.success('修改成功！')
          crudDialogOptions.visible = false

          fetchData()
        }
        else {
          ElMessage.error(res.message ?? '修改失败！')
        }
      }
      else {
        const res: any = await dataHandler.create!(data)

        if (res.code === 200) {
          ElMessage.success('添加成功！')
          crudDialogOptions.visible = false

          fetchData()
        }
        else {
          ElMessage.error(res.message ?? '添加失败！')
        }
      }

      crudDialogOptions.loading = false
    })
  }

  async function handleDeleteDatas(ids: Array<number>) {
    ElMessageBox.confirm(`你确定要删除${getDeleteBoxTitles(ids)} 吗？删除后这个${getDeleteBoxTitles(ids)}永久无法找回。`, '是否确认删除', {
      confirmButtonText: '取消',
      cancelButtonText: '确定删除',
      type: 'error',
    })
      .then(() => {
        ElMessage({
          type: 'success',
          message: `已取消删除${getDeleteBoxTitles(ids)}！`,
        })
      })
      .catch(async () => {
        const res = await dataHandler.deletes!(ids)

        if (res.code !== 200) {
          ElMessage.error(res.message || '删除失败！')
          return
        }

        fetchData() // 刷新数据

        ElNotification({
          title: 'Info',
          message: `你永久删除了${getDeleteBoxTitles(ids)}！`,
          type: 'info',
        })
      })
  }

  async function handleDeleteData(id: string | number) {
    ElMessageBox.confirm(`你确定要删除${dataHandler.getDeleteBoxTitle(id)} 吗？删除后这个${dataHandler.getDeleteBoxTitle(id)}永久无法找回。`, '是否确认删除', {
      confirmButtonText: '取消',
      cancelButtonText: '确定删除',
      type: 'error',
    })
      .then(() => {
        ElMessage({
          type: 'success',
          message: `已取消删除${dataHandler.getDeleteBoxTitle(id)}！`,
        })
      })
      .catch(async () => {
        const res = await dataHandler.delete!(id)

        if (res.code !== 200) {
          ElMessage.error(res.message || '删除失败！')
          return
        }

        fetchData() // 刷新数据

        ElNotification({
          title: 'Info',
          message: `你永久删除了${dataHandler.getDeleteBoxTitle(id)}！`,
          type: 'info',
        })
      })
  }

  return {
    list,
    listForm: internalQueryData,
    formLoading,
    crudDialogOptions,

    fetchData,
    submitForm,
    handleCrudDialog,
    handleDeleteData,
    handleDeleteDatas,

    resetQueryForm() {
      Object.assign(internalQueryData, queryData)
    },
  }
}

export interface TemplateSingleDataHandler<T extends Record<string, any>, O> {
  getEmptyModel: () => T
  onFetchSuccess?: () => Promise<void>
  /**
   * 函数的功能是根据传入的原始数据和操作模式，转换并返回一个新的数据。
   * @param originData
   * @param mode
   * @returns
   */
  transformSubmitData?: (originData: T, mode: CrudMode) => any
  getList: (query: Partial<T>) => Promise<IDataResponse<T[]>>
  update?: (id: string | number, data: T) => Promise<IStandardResponse>
  create?: (data: T) => Promise<IStandardResponse>
  delete?: (id: string | number) => Promise<IStandardResponse>
  handleCrudDialog?: (data: T, mode: CrudMode, meta?: Partial<O>) => void

  getDeleteBoxTitle: (id: string | number) => string
}

/**
 * 生成CMS模板单列数据
 * 同普通CMS模板一样，但是会内部维护一个pages，以实现一页浏览的功能
 */
/**
 * 生成CMS模板数据
 *
 * @template T 扩展自Record<string, any>与可选的id属性，用于定义数据的基本结构
 * @template O 用于定义额外的元数据结构，可选
 * @param dataHandler 数据处理函数，用于与后端API交互
 * @param queryData 查询参数，用于初始化查询条件
 * @returns 返回一个对象，包含数据列表、表单加载状态、CRUD对话框选项以及数据获取和处理函数
 */
export function genCmsTemplateSingleData<T extends Record<string, any> & { id?: number | string }, O extends Record<string, any> | null>(
  dataHandler: TemplateSingleDataHandler<T, O>,
  queryData: Partial<T>,
) {
  const formLoading = ref(false)
  const list = shallowRef<Array<T>>([])

  /**
   * 传什么类型，生成什么类型
   */
  type QueryDataType<T> = { [key in keyof T]: T[key] }

  const internalQueryData = reactive<QueryDataType<T>>(JSON.parse(JSON.stringify(queryData)))

  async function fetchData() {
    formLoading.value = true

    const query: Record<string, any> = {
      ...internalQueryData,
    }

    // 过滤掉为空的值
    Object.entries(query).forEach(([key, value]) => {
      if (!value)
        delete query[key]
    })

    const res = await dataHandler.getList(query as T)
    if (res.code === 200) {
      list.value = res.data!

      dataHandler.onFetchSuccess?.()
    }

    formLoading.value = false
  }

  const crudDialogOptions = reactive<{
    visible: boolean
    mode: CrudMode
    data: T | null
    loading: boolean
    meta: Partial<O>
  }>({
    visible: false,
    mode: 'NEW',
    data: null,
    loading: false,
    meta: {},
  })

  function handleCrudDialog(data: T | null, mode: CrudMode, meta?: Partial<O>) {
    Object.assign(crudDialogOptions, {
      meta,
      mode,
      data: data || dataHandler.getEmptyModel(),
      visible: true,
    })

    dataHandler.handleCrudDialog?.(data!, mode, meta)
  }

  async function submitForm(formEl: FormInstance | undefined) {
    if (!formEl)
      return

    await formEl.validate(async (valid) => {
      if (!valid)
        return

      const data = crudDialogOptions.data as T | undefined

      if (!data) {
        ElMessage.error('流程数据错误！')
        return
      }

      crudDialogOptions.loading = true
      const submitData = dataHandler.transformSubmitData?.(data, crudDialogOptions.mode) || data

      if (crudDialogOptions.mode === 'EDIT') {
        const res: any = await dataHandler.update!(submitData.id!, submitData)

        if (res.code === 200) {
          ElMessage.success('修改成功！')
          crudDialogOptions.visible = false

          fetchData()
        }
        else {
          ElMessage.error(res.message ?? '修改失败！')
        }
      }
      else {
        const res: any = await dataHandler.create!(data)

        if (res.code === 200) {
          ElMessage.success('添加成功！')
          crudDialogOptions.visible = false

          fetchData()
        }
        else {
          ElMessage.error(res.message ?? '添加失败！')
        }
      }

      crudDialogOptions.loading = false
    })
  }

  async function handleDeleteData(id: string | number) {
    ElMessageBox.confirm(`你确定要删除${dataHandler.getDeleteBoxTitle(id)} 吗？删除后这个${dataHandler.getDeleteBoxTitle(id)}永久无法找回。`, '是否确认删除', {
      confirmButtonText: '取消',
      cancelButtonText: '确定删除',
      type: 'error',
    })
      .then(() => {
        ElMessage({
          type: 'success',
          message: `已取消删除${dataHandler.getDeleteBoxTitle(id)}！`,
        })
      })
      .catch(async () => {
        const res = await dataHandler.delete!(id)

        if (res.code !== 200) {
          ElMessage.error(res.message || '删除失败！')
          return
        }

        fetchData() // 刷新数据

        ElNotification({
          title: 'Info',
          message: `你永久删除了${dataHandler.getDeleteBoxTitle(id)}！`,
          type: 'info',
        })
      })
  }

  return {
    list,
    listForm: internalQueryData,
    formLoading,
    crudDialogOptions,

    fetchData,
    submitForm,
    handleCrudDialog,
    handleDeleteData,
    resetQueryForm() {
      Object.assign(internalQueryData, queryData)
    },
  }
}
