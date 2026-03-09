

export interface IUserModel extends Record<string, any> {
  /**
   * 头像
   */
  avatar?: string
  /**
   * 归属大区
   */
  deptId?: number
  /**
   * 邮箱
   */
  email?: string

  /**
   * 呢称
   */
  nickname?: string

  /**
   * 登录密码
   */
  password?: string
  /**
   * 手机号
   */
  phone?: string
  /**
   * QQ
   */
  qq?: string
  /**
   * 备注
   */
  remark?: string
  /**
   * 归属角色
   */
  roleIds?: string[]
  /**
   * 状态
   */
  status?: number
  /**
   * 登录账号
   */
  username?: string

  id?: number
  updatedAt?: string
  createdAt?: string
}
export interface IUserModelQuery extends IUserModel {
  page?: number
  pageSize?: number
}

export interface IAdminOrderQuery extends IAdminOrder {
  page: number
  pageSize: number
  /**
   * 支付时间范围(max)
   */
  maxPayTime: Date
  /**
   * 购买金额范围(max)
   */
  maxPrice: number
  /**
   * 支付时间范围(min)
   */
  minPayTime: Date
  /**
   * 购买金额范围(min)
   */
}

export interface IAdminOrder {
  additionalInfo: string
  createdAt: string
  description: string
  id: string
  paymentMethod: number
  status: number
  totalAmount: number
  updatedAt: string
}

export interface IRoleModel extends Record<string, any> {
  /**
   * 关联菜单、权限编号
   */
  menuIds?: string[]
  /**
   * 角色名称
   */
  name?: string
  order?: string
  /**
   * 角色备注
   */
  remark?: string
  /**
   * 状态
   */
  status?: number
  /**
   * 角色值
   */
  value?: string

  id?: number
  updatedAt?: string
  createdAt?: string
}

export interface IRoleModelQuery extends IRoleModel {
  page: number
  pageSize: number
}

export interface IMenuModel extends Record<string, any> {
  /**
   * 设置当前路由高亮的菜单项，一般用于详情页
   */
  activeMenu?: string
  /**
   * 菜单路由路径或外链
   */
  component?: string
  /**
   * 外链打开方式
   */
  extOpenMode?: number
  /**
   * 菜单图标
   */
  icon?: string
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
   * 排序
   */
  orderNo?: number
  /**
   * 父级菜单
   */
  parentId?: number
  /**
   * 前端路由地址
   */
  path?: string
  /**
   * 对应权限
   */
  permission?: string
  /**
   * 菜单是否显示
   */
  show?: number
  /**
   * 状态
   */
  status?: number
  /**
   * 菜单类型
   */
  type?: number
}
// 这里这个菜单疑惑有没有page,pagesize
export interface IMenuModelQuery extends IMenuModel {
  page: number
  pageSize: number
}

export interface IDeptModelQuery {
  name: string
}

export interface IDeptModel extends Record<string, any> {
  children: childrenDeptEntity[]
  createdAt: Date
  /**
   * 创建者
   */
  creator: string
  id: number
  /**
   * 部门名称
   */
  name: string
  /**
   * 排序
   */
  orderNo: number
  parent?: DeptEntity
  parentid?: number
  updatedAt: Date
  /**
   * 更新者
   */
  updater: string
}

interface childrenDeptEntity extends DeptEntity {
  parent: DeptEntity
}

interface DeptEntity {
  createdAt: string
  creator: string
  id: number
  name: string
  orderNo: number
  updatedAt: string
  updater: null
}

export interface IParamConfigModel extends Record<string, any> {
  /**
   * 配置键名
   */
  key: string
  /**
   * 配置值
   */
  value: string
  /**
   * 配置名
   */
  name: string
  /**
   * 配置描述
   */
  remark: string

  id: number
  updatedAt?: string
  createdAt?: string
}

export interface IParamConfigModelQuery extends IParamConfigModel {
  page: number
  pageSize: number

  /**
   * 参数名称
   */
  name: string
}

export interface IDictTypeModel extends Record<string, any> {
  /**
   * 字典编码
   */
  code: string

  /**
   * 创建者
   */
  creator: string

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

  /**
   * 更新者
   */
  updater: string

  id?: number
  updatedAt?: string
  createdAt?: string
}

export interface IDictTypeModelQuery extends IDictTypeModel {
  page: number
  pageSize: number
}

export interface IDictItemModel extends Record<string, any> {
  /**
   * 创建者
   */
  creator: string

  /**
   * 字典项键名
   */
  label: string
  orderNo: number
  /**
   * 备注
   */
  remark: string
  /**
   * 状态
   */
  status: number
  type: DictTypeEntity

  /**
   * 更新者
   */
  updater: string
  /**
   * 字典项值
   */
  value: string
  [property: string]: any

  id: number
  updatedAt: string
  createdAt: string
}
export interface DictTypeEntity {
  /**
   * 字典编码
   */
  code: string

  /**
   * 创建者
   */
  creator: string

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

  /**
   * 更新者
   */
  updater: string

  id: number
  createdAt: Date
  updatedAt: Date
}

export interface IDictItemModelQuery extends Partial<IDictItemModel> {
  page: number
  pageSize: number

  /**
   * 字典项键名
   */
  label?: string

  /**
   * 字典类型 ID
   */
  typeid?: number
  /**
   * 字典项值
   */
  value?: string
}

export interface ITasksModel extends Record<string, any> {
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

  /**
   * 限制执行次数，负数则无限制
   */
  limit?: number
  /**
   * 任务名称
   */
  name?: string

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

  id: number
  updatedAt: string
  createdAt: string
}

export interface ITasksModelQuery extends ITasksModel {
  page: number
  pageSize: number
}

// 系统监控
/**
 * ServeStatInfo
 */
export interface ServeStatInfo {
  /**
   * CPU信息
   */
  cpu: Cpu
  /**
   * 磁盘信息
   */
  disk: Disk
  /**
   * 内存信息
   */
  memory: Memory
  /**
   * 运行环境
   */
  runtime: Runtime
}

/**
 * CPU信息
 *
 * Cpu
 */
export interface Cpu {
  /**
   * 品牌
   */
  brand: string
  /**
   * cpu资源消耗
   */
  coresLoad: CoreLoad[]
  /**
   * 制造商
   */
  manufacturer: string
  /**
   * 型号
   */
  model: string
  /**
   * 物理核心数
   */
  physicalCores: number
  /**
   * CPU资源消耗 原始滴答
   */
  rawCurrentLoad: number
  /**
   * 空闲CPU资源 原始滴答
   */
  rawCurrentLoadIdle: number
  /**
   * 速度 in GHz
   */
  speed: number
}

/**
 * CoreLoad
 */
export interface CoreLoad {
  /**
   * 当前CPU资源消耗
   */
  rawLoad: number
  /**
   * 当前空闲CPU资源
   */
  rawLoadIdle: number
}

/**
 * 磁盘信息
 *
 * Disk
 */
export interface Disk {
  /**
   * 可用磁盘空间 (bytes)
   */
  available: number
  /**
   * 磁盘空间大小 (bytes)
   */
  size: number
  /**
   * 已使用磁盘空间 (bytes)
   */
  used: number
}

/**
 * 内存信息
 *
 * Memory
 */
export interface Memory {
  /**
   * 可用内存
   */
  available: number
  /**
   * total memory in bytes
   */
  total: number
}

/**
 * 运行环境
 *
 * Runtime
 */
export interface Runtime {
  /**
   * 服务器架构
   */
  arch: string
  /**
   * Node版本
   */
  nodeVersion: string
  /**
   * Npm版本
   */
  npmVersion: string
  /**
   * 系统
   */
  os: string
}

export interface IDoc extends Record<string, any> {
  field: string
  /**
   * 文档元数据
   */
  meta: string
  order: 'ASC' | 'DESC'
  /**
   * 文档权限
   */
  permission: string
  /**
   * 文档标题
   */
  title: string

  record?: {
    id: number
    updatedAt: string
    createdAt: string
    title: string
    content: string
    reason: string
    status: number
  }

  id?: number
  updatedAt?: string
  createdAt?: string
}

export interface IDocQuery extends IDoc {
  page?: number
  pageSize?: number
}

export interface ISubscriptionPlan extends Record<string, any> {
  /**
   * 订阅结束日期
   */
  endDate: Date
  /**
   * 订阅是否有效
   */
  isActive: boolean
  /**
   * 是否自动续费
   */
  isAutoRenew: boolean
  /**
   * 是否是试用订阅
   */
  isTrial: boolean
  /**
   * 相关订单号
   */
  orderId: string
  /**
   * 订阅开始日期
   */
  startDate: Date
  /**
   * 订阅计划类型
   */
  type: 'STANDARD' | 'ULTIMATE'
  /**
   * 用户id
   */
  userId: string
}

export interface ISubscriptionPlanQuery extends ISubscriptionPlan {
  page: number
  pageSize: number
}

export enum SubscribeType {
  STANDARD = 'STANDARD', // 标准订阅计划
  ULTIMATE = 'ULTIMATE', // 旗舰订阅计划
}








export interface IFeedbackModelQuery extends Partial<IFeedbackModel> {
  page: number
  pageSize: number
}




export interface IFeedbackModel {
  feedID?: string
  rating?: number
  type?: string
  lack?:string
  suggestion?: null | string
  user?:any
  id?: number
  updatedAt?: string
  createdAt?: string
}
