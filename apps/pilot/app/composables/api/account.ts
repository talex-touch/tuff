import { endHttp } from './axios'

// -----------------------------------------------用户管理

// 获取用户列表
export interface UserQuery {
  id: string
  username: string
  nickname: string
  avatar: string
  qq: string
  email: string
  phone: string
  remark: string
  status: number
  roleIds: number[]
  dept: any
  password: string
}

export interface UserGetQuery {
  page: number
  pageSize: number
  username: string
  deptId: number
  nickname: string
  email: string
  phone: string
  qq: string
  remark: string
  status: number
}

/**
 * 获取用户列表
 * @param data
 * @returns
 */
export function getUsers(data?: Partial<UserGetQuery>) {
  return endHttp.get('system/users', data)
}
/**
 * 新增用户
 * @param query
 * @returns
 */
export function addUser(query: UserQuery) {
  return endHttp.post('system/users', query)

  // axios({
  //   method: "POST",
  //   data: query
  // })
}

/**
 * 更新用户
 * @param id
 * @param query
 * @returns
 */
export function updateUser(id: string, query: UserQuery) {
  return endHttp.put(`system/users/${id}`, query)
}

/**
 * 删除用户
 * @param id
 * @returns
 */
export function deleteUser(id: string) {
  return endHttp.del(`system/users/${id}`)
}

// ---------------------------------------------菜单管理

export interface MenuGetQuery {
  /**
   * 菜单路由路径或外链
   */
  component?: string
  /**
   * 外链打开方式
   */
  extOpenMode?: number
  /**
   * 是否外链
   */
  isExt?: boolean
  /**
   * 是否开启页面缓存
   */
  keepAlive?: number
  /**
   * 菜单或权限名称
   */
  name?: string
  /**
   * 前端路由地址
   */
  path?: string
  /**
   * 状态
   */
  status?: number
  /**
   * 菜单类型
   */
  type?: number
}

/**
 * 获取所有菜单列表
 * @param query
 * @returns
 */
export function getMenuList(query: MenuGetQuery) {
  return endHttp.get('system/menus', {
    query,
  })
}
/**
 * 更新菜单或权限
 * @param id
 * @param query
 * @returns
 */
export function updateMenu(id: number, query: MenuGetQuery) {
  return endHttp.put(`system/menus/${id}`, query)
}
/**
 * 新增菜单或权限
 * @param query
 * @returns
 */
export function addMenu(query: MenuGetQuery) {
  return endHttp.post('system/menus', query)
}
/**
 * 删除菜单或权限
 * @param id
 * @returns
 */
export function delMenu(id: number) {
  return endHttp.del(`system/menus/${id}`)
}

// -------------------------部门

/**
 * 获取部门列表
 * @returns
 */
export function getDepartmentList() {
  return endHttp.get('system/depts')
}

/**
 * 新增部门
 * @param body
 * @returns
 */
export function addDept(body: any) {
  return endHttp.post('system/depts', body)
}
/**
 * 删除部门
 * @param id
 * @returns
 */
export function delDept(id: number) {
  return endHttp.del(`/system/depts/${id}`)
}

/**
 * 更新部门
 * @param id
 * @returns
 */
export function UpdateDept(id: number) {
  return endHttp.put(`/system/depts/${id}`)
}

// ----------------------------------------------字典管理

/**
 * 获取字典列表
 * @param Query
 * @returns
 */
export function getDictList(Query: any) {
  return endHttp.get('system/dict-type', Query)
}

/**
 * DictTypeDto 新增字典
 */
export interface DictRequest {
  /**
   * 字典类型code
   */
  code?: string
  createdAt?: Date
  /**
   * 创建者
   */
  creator?: string
  id?: number
  /**
   * 字典类型名称
   */
  name?: string
  /**
   * 备注
   */
  remark?: string
  /**
   * 状态
   */
  status?: number
  updatedAt?: Date
  /**
   * 更新者
   */
  updater?: string
  [property: string]: any
}
/**
 * 新增字典
 * @param Header
 * @returns
 */
export function addDict(Body: DictRequest) {
  return endHttp.post('system/dict-type', Body)
}
/**
 * 获取一次性所有字典列表
 *
 * @returns
 */
export function getAllDictList() {
  return endHttp.get('system/dict-type/select-options')
}
/**
 * 查询字典类型信息
 * @param Path
 * @returns
 */
export function queryDictInfo(Path: any) {
  return endHttp.get(`system/dict-type/${Path}`)
}
/**
 * 更新字典
 * @param Path  id
 * @param Body
 * @returns
 */
export function updateDict(Path: number, Body: any) {
  return endHttp.post(`system/dict-type/${Path}`, Body)
}
/**
 * 删除字典
 * @param Path  --id
 * @returns
 */
export function delDict(Path: any) {
  return endHttp.del(`system/dict-type/${Path}`)
}

// -------------------------------------------------字典项管理

export interface DictItemsListReq {
  _t?: number
  field?: string
  /**
   * 字典项键名
   */
  label?: string
  order?: string
  page?: number
  pageSize?: number
  /**
   * 字典类型 ID
   */
  typeId: number
  /**
   * 字典项值
   */
  value?: string
  [property: string]: any
}
export function getDictItemsList(Query: Partial<DictItemsListReq>) {
  return endHttp.get('system/dict-item', Query)
}

/**
 * 查询字典项信息
 * @param Path
 * @returns
 */
export function queryDictItemsInfo(Path: number) {
  return endHttp.get(`system/dict-item/${Path}`)
}

/**
 * DictItemsRequest
 */
export interface DictItemsRequest {
  createdAt?: Date
  /**
   * 创建者
   */
  creator?: string
  id?: number
  /**
   * 字典项键名
   */
  label?: string
  orderNo?: number
  /**
   * 备注
   */
  remark?: string
  /**
   * 状态
   */
  status?: number
  type?: DictTypeEntity
  /**
   * 字典类型 ID
   */
  typeId: number
  updatedAt?: Date
  /**
   * 更新者
   */
  updater?: string
  /**
   * 字典项值
   */
  value?: string
  [property: string]: any
}

/**
 * DictTypeEntity
 */
export interface DictTypeEntity {
  /**
   * 字典编码
   */
  code: string
  createdAt: Date
  /**
   * 创建者
   */
  creator: string
  id: number
  /**
   * 字典名称
   */
  name: string
  /**
   * 备注
   */
  remark: string
  /**
   * 状态
   */
  status: number
  updatedAt: Date
  /**
   * 更新者
   */
  updater: string
  [property: string]: any
}

/**
 * 新增字典项
 * @param Header
 * @returns
 */
export function addDictItems(Body: DictItemsRequest) {
  return endHttp.post('system/dict-type', Body)
}

/**
 * 更新字典项
 * @param Path  id
 * @param Body
 * @returns
 */
export function updateDictItems(Path: number, Body: any) {
  return endHttp.post(`system/dict-type/${Path}`, Body)
}

/**
 * 删除字典项
 * @param Path  --id
 * @returns
 */
export function delDictItems(Path: any) {
  return endHttp.del(`system/dict-type/${Path}`)
}

// -------------------------------------------------任务调度

export interface TaskEntity {
  createdAt: Date
  /**
   * cron表达式
   */
  cron: string
  /**
   * 任务参数
   */
  data: string
  /**
   * 结束时间
   */
  endTime: Date
  /**
   * 执行次数
   */
  every: number
  id: number
  /**
   * 任务配置
   */
  jobOpts: string
  /**
   * 间隔时间
   */
  limit: number
  /**
   * 任务名
   */
  name: string
  /**
   * 任务描述
   */
  remark: string
  /**
   * 任务标识
   */
  service: string
  /**
   * 开始时间
   */
  startTime: Date
  /**
   * 任务状态 0禁用 1启用
   */
  status: number
  /**
   * 任务类型 0cron 1间隔
   */
  type: number
  updatedAt: Date
  [property: string]: any
}

export interface TaskReq {
  _t?: number
  /**
   * cron表达式
   */
  cron?: string
  /**
   * 执行参数
   */
  data?: string
  /**
   * 结束时间
   */
  endTime?: string
  /**
   * 执行间隔，毫秒单位
   */
  every?: number
  field?: string
  /**
   * 限制执行次数，负数则无限制
   */
  limit?: number
  /**
   * 任务名称
   */
  name?: string
  order?: string
  page?: number
  pageSize?: number
  /**
   * 任务备注
   */
  remark?: string
  /**
   * 调用的服务
   */
  service?: string
  /**
   * 开始时间
   */
  startTime?: string
  /**
   * 任务状态
   */
  status?: number
  /**
   * 任务类别：cron | interval
   */
  type?: number
  [property: string]: any
}
/**
 * 获取任务调度列表
 *
 * @param Query 查询参数，用于筛选和定制返回的任务列表
 * @returns 返回一个Promise对象，包含任务调度列表的数据
 */
export function getScheduleList(Query: Partial<TaskReq>) {
  return endHttp.get('system/tasks', Query)
}
/**
 * 添加任务计划
 *
 * @param Header 请求体，包含要添加的任务计划的详细信息
 * @returns 返回POST请求的响应结果，通常包含添加任务计划的结果信息
 */
export function addSchedule(Header: any) {
  return endHttp.post('system/tasks', Header)
}

/**
 * 更新任务调度
 *
 * @param Path - 包含更新任务所需信息的对象，如任务ID等。这个参数被用作请求的路径参数。
 * @returns 返回一个Promise，该Promise在API请求完成后解析为API响应。
 */
export function updateSchedule(Path: any, Body: TaskEntity) {
  return endHttp.put(`system/tasks/${Path}`, Body)
}

/**
 * 查询任务调度信息
 *
 * @param Path - 包含路径参数的对象，应至少包含一个与{id}对应的值
 * @returns 返回一个Promise，解析为包含任务调度信息的对象
 */
export function queryScheduleInfo(Path: any) {
  return endHttp.get('system/tasks/{id}', Path)
}
/**
 * 删除任务
 * @param Path
 * @returns
 */
export function delSchedule(Path: any) {
  return endHttp.del('system/tasks/{id}', Path)
}
/**
 * 手动执行一次任务
 * @param Path
 * @returns
 */
export function runScheduleOnce(Path: any) {
  return endHttp.put('system/tasks/{id}/once', Path)
}
/**
 * 停止任务
 * @param Path
 * @returns
 */
export function stopSchedule(Path: any) {
  return endHttp.put('system/tasks/{id}/stop', Path)
}
/**
 * 启动任务
 * @param Path
 * @returns
 */
export function startSchedule(Path: any) {
  return endHttp.put('system/tasks/{id}/stop', Path)
}

// ---------------------------------------账户模块

/**
 * 获取账户资料
 * @returns
 */
export function getAccountDetail() {
  return endHttp.get('account/profile')
}

/**
 * 获取权限列表
 * @returns
 */
export function getPermissionList() {
  return endHttp.get('account/permissions')
}

/**
 * 获取菜单列表
 * @returns
 */
export function getAccountMenuList() {
  return endHttp.get('account/menus')
}

/**
 * 查询登录日志列表
 * @returns
 */
export function getHistoryList() {
  return endHttp.get('account/login_histories')
}

// ---------------------------------------------参数配置模块

export interface ParamsListReq {
  _t?: number
  field?: string
  /**
   * 参数名称
   */
  name: string
  order?: string
  page?: number
  pageSize?: number
  [property: string]: any
}

/**
 * 获取参数配置列表
 * @param Query
 * @returns
 */
export function getParamList(Query: Partial<ParamsListReq>) {
  return endHttp.get('system/param-config', Query)
}

export interface ParamConfigEntity {
  createdAt: Date
  id: number
  /**
   * 配置键名
   */
  key: string
  /**
   * 配置名
   */
  name: string
  /**
   * 配置描述
   */
  remark: string
  updatedAt: Date
  /**
   * 配置值
   */
  value: string
  [property: string]: any
}

/**
 * 新增参数配置
 * @param Body
 * @returns
 */
export function addParam(Body: Partial<ParamConfigEntity>) {
  return endHttp.post('system/param-config', Body)
}

/**
 * 查询参数配置信息
 * @param Path
 * @returns
 */
export function queryParamInformation(Path: number) {
  return endHttp.get('system/param-config/{id}', Path)
}
/**
 * 更新参数配置
 * @param Path
 * @returns
 */
export function updateParam(Path: number, Body: Partial<ParamConfigEntity>) {
  return endHttp.post(`system/param-config/${Path}`, Body)
}
/**
 * 删除指定的参数配置
 * @param Path
 * @returns
 */
export function delParam(Path: number) {
  return endHttp.post('system/param-config/{id}', Path)
}

// 订单
export function getOrderPlanPrice(type: 'STANDARD' | 'ULTIMATE', time: string, code: string) {
  return endHttp.get(`order/price?_time=${Date.now()}`, {
    type,
    time,
    couponCode: code || '',
    payMethod: 2,
  })
}

export function orderPlanPrice(type: 'STANDARD' | 'ULTIMATE', time: string, couponCode: string) {
  return endHttp.post('order/subscribe', {
    type,
    time,
    payMethod: 2,
    couponCode,
  })
}

export function getUserNearestUnPayOrder() {
  return endHttp.get(`order/target?now=${Date.now()}`)
}

export function getOrderStatus(id: string) {
  return endHttp.get(`order/status/target?time=${Date.now()}`, { id })
}

export function getOrderList() {
  return endHttp.get('order/list')
}

export function getUserSubscription() {
  return endHttp.get('order/subscribe')
}

export function getCouponList() {
  return endHttp.get('coupon/list')
}

export function userBindCoupon(code: string) {
  return endHttp.post('coupon/add', {
    couponId: code,
  })
}

export function getUserBindingPlatforms() {
  return endHttp.get('platform/list')
}

export interface CreateCouponDto extends Record<string, string | number | boolean | undefined> {
  prefix?: string // 优惠码前缀（必须是6位）
  quantity: number // 优惠码数量，一次性最多不超过1000个
  discountAmount: number // 优惠金额（正数表示优惠金额[单位：分]，负数表示优惠百分比）
  startDate?: string // 有效期开始时间（没有表示通用）
  endDate?: string // 有效期结束时间（没有表示通用）
  maxUsage: number // 最大使用次数
  minimumSpend: number // 最小消费金额（单位：分）
  maximumDiscount?: number // 最大抵扣消费（正数表示消费金额[单位：分]，负数表示消费百分比）
  stackable?: boolean // 是否可叠加使用，默认为false
  newUserOnly?: boolean // 是否仅限新用户使用，默认为false

  code?: string
  user_id?: number
  updater_id?: number
  creator_id?: number
}

export interface CouponListQueryDto extends Partial<CreateCouponDto> {
  page: number
  pageSize: number
}

export function getAllCoupon(query: CouponListQueryDto) {
  return endHttp.post('coupon/all', query)
}

export interface ICouponCode {
  applicableCategories?: null
  code?: string
  createdAt?: string
  creator?: any
  discountAmount?: number
  endDate?: null
  id?: number
  info?: null
  mainCode?: string
  maximumDiscount?: null
  maxUsage?: number
  minimumSpend?: number
  newUserOnly?: boolean
  stackable?: boolean
  startDate?: null
  updatedAt?: string
  usedCount?: number
}

export function createBatchesCodeList(dto: CreateCouponDto) {
  return endHttp.post('coupon/create_batches', dto)
}

export function assignCouponCode(code: string, userId: number) {
  return endHttp.post('coupon/assign', { couponId: code, uid: userId })
}

export function invalidateCouponCode(couponId: string) {
  return endHttp.post('coupon/invalidate', { couponId })
}

export interface IAdminOrderQuery extends Record<string, any> {
  /**
   * 支付时间范围(max)
   */
  maxPayTime?: Date
  /**
   * 购买金额范围(max)
   */
  maxPrice?: number
  /**
   * 支付时间范围(min)
   */
  minPayTime?: Date
  /**
   * 购买金额范围(min)
   */
  minPrice?: number
  page: number
  pageSize: number
  payMethod?: number
  status?: number
  /**
   * 购买用户
   */
  userid?: number
}

export function getAdminOrders(query: IAdminOrderQuery) {
  return endHttp.post('order/admin/list', query)
}

export function getAdminOrderStatistics() {
  return endHttp.get('order/admin/statistics')
}
