import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import {
  deletePilotEntity,
  ensurePilotEntitySeed,
  getPilotEntity,
  listPilotEntities,
  listPilotEntitiesAll,
  upsertPilotEntity,
} from './pilot-entity-store'

const ORDER_DOMAIN = 'order.orders'
const COUPON_DOMAIN = 'order.coupons'
const SUBSCRIPTION_DOMAIN = 'order.subscriptions'

const AUTO_SETTLE_MS = 3000
const ORDER_EXPIRE_MS = 5 * 60 * 1000

type SubscriptionType = 'STANDARD' | 'ULTIMATE'
type SubscriptionTime = 'TRIAL' | 'TRIAL_WEEK' | 'MONTH_TRIAL' | 'MONTH' | 'QUARTER' | 'YEAR'

interface PlanMeta {
  type: SubscriptionType
  time: SubscriptionTime
  title: string
  range: string
  days: number
  originPrice: number
}

interface MockCoupon {
  id: string
  code: string
  mainCode: string
  discountAmount: number
  maximumDiscount: number | null
  minimumSpend: number
  maxUsage: number
  usedCount: number
  stackable: boolean
  newUserOnly: boolean
  startDate: string | null
  endDate: string | null
  status: number
  uid: string
  createdAt: string
  updatedAt: string
}

interface PriceInfo {
  name: string
  info: Array<{ name: string, price: number, free?: boolean }>
  meta: {
    originPrice: number
    fee: number
    tax: number
    feeTax: number
    average: number
    range: string
    discount: number
  }
}

interface MockOrder {
  id: string
  userId: string
  type: string
  time: string
  description: string
  status: number
  paymentMethod: number
  totalAmount: number
  originAmount: number
  discountAmount: number
  couponCode: string
  additionalInfo: string
  createdAt: string
  updatedAt: string
  payTime: string
}

const PLAN_CATALOG: PlanMeta[] = [
  {
    type: 'STANDARD',
    time: 'TRIAL',
    title: '标准订阅计划（天）',
    range: '1 天',
    days: 1,
    originPrice: 99,
  },
  {
    type: 'STANDARD',
    time: 'TRIAL_WEEK',
    title: '标准订阅计划（周）',
    range: '7 天',
    days: 7,
    originPrice: 699,
  },
  {
    type: 'STANDARD',
    time: 'MONTH_TRIAL',
    title: '标准订阅计划（月）',
    range: '30 天',
    days: 30,
    originPrice: 1999,
  },
  {
    type: 'STANDARD',
    time: 'MONTH',
    title: '标准订阅计划（月）',
    range: '30 天',
    days: 30,
    originPrice: 2999,
  },
  {
    type: 'STANDARD',
    time: 'QUARTER',
    title: '标准订阅计划（季度）',
    range: '90 天',
    days: 90,
    originPrice: 7999,
  },
  {
    type: 'STANDARD',
    time: 'YEAR',
    title: '标准订阅计划（年度）',
    range: '365 天',
    days: 365,
    originPrice: 29999,
  },
  {
    type: 'ULTIMATE',
    time: 'MONTH',
    title: '高级订阅计划（月）',
    range: '30 天',
    days: 30,
    originPrice: 9999,
  },
  {
    type: 'ULTIMATE',
    time: 'QUARTER',
    title: '高级订阅计划（季度）',
    range: '90 天',
    days: 90,
    originPrice: 26999,
  },
  {
    type: 'ULTIMATE',
    time: 'YEAR',
    title: '高级订阅计划（年度）',
    range: '365 天',
    days: 365,
    originPrice: 99999,
  },
]

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeCouponCode(value: unknown): string {
  return normalizeText(value).toUpperCase()
}

function encodeOrderAdditionalInfo(value: unknown): string {
  const text = JSON.stringify(value ?? {})
  return Buffer.from(encodeURIComponent(text), 'utf8').toString('base64')
}

function createOrderId(): string {
  return `order_${Date.now().toString(36)}_${randomUUID().replaceAll('-', '').slice(0, 12)}`
}

function resolvePlan(type: string, time: string): PlanMeta {
  const matched = PLAN_CATALOG.find(item => item.type === type && item.time === time)
  return matched || PLAN_CATALOG[0]
}

function calcCouponDiscount(originPrice: number, coupon: MockCoupon | null): number {
  if (!coupon || coupon.maxUsage === -1) {
    return 0
  }
  if (coupon.startDate && new Date(coupon.startDate).getTime() > Date.now()) {
    return 0
  }
  if (coupon.endDate && new Date(coupon.endDate).getTime() < Date.now()) {
    return 0
  }
  if (coupon.maxUsage >= 0 && coupon.usedCount >= coupon.maxUsage) {
    return 0
  }
  if (coupon.minimumSpend > 0 && originPrice < coupon.minimumSpend) {
    return 0
  }

  let discount = 0
  if (coupon.discountAmount > 0) {
    discount = coupon.discountAmount
  }
  else if (coupon.discountAmount < 0) {
    discount = Math.floor(originPrice * Math.abs(coupon.discountAmount) / 100)
  }

  if (coupon.maximumDiscount !== null && coupon.maximumDiscount !== undefined) {
    if (coupon.maximumDiscount > 0) {
      discount = Math.min(discount, coupon.maximumDiscount)
    }
    else if (coupon.maximumDiscount < 0) {
      discount = Math.min(discount, Math.floor(originPrice * Math.abs(coupon.maximumDiscount) / 100))
    }
  }

  return Math.max(0, Math.min(discount, originPrice))
}

function buildPriceInfo(
  title: string,
  range: string,
  days: number,
  originPrice: number,
  discount: number,
): PriceInfo {
  const fee = Math.max(0, originPrice - discount)
  const tax = 0
  const feeTax = fee + tax
  return {
    name: title,
    info: [
      { name: '标准费率', price: originPrice },
      { name: '优惠抵扣', price: discount, free: discount > 0 },
    ],
    meta: {
      originPrice,
      fee,
      tax,
      feeTax,
      average: days > 0 ? Math.round(fee / days) : fee,
      range,
      discount,
    },
  }
}

async function findCouponByCode(event: H3Event, code: string): Promise<MockCoupon | null> {
  const normalizedCode = normalizeCouponCode(code)
  if (!normalizedCode) {
    return null
  }
  const list = await listPilotEntitiesAll<MockCoupon>(event, COUPON_DOMAIN)
  return list.find(item => normalizeCouponCode(item.mainCode) === normalizedCode || normalizeCouponCode(item.code) === normalizedCode) || null
}

async function markCouponUsed(event: H3Event, coupon: MockCoupon): Promise<void> {
  await upsertPilotEntity(event, {
    domain: COUPON_DOMAIN,
    id: coupon.id,
    payload: {
      ...coupon,
      usedCount: Number(coupon.usedCount || 0) + 1,
      updatedAt: nowIso(),
    },
  })
}

function toSubscriptionExpiry(days: number): string {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + Math.max(1, days))
  return date.toISOString()
}

async function settleOrderIfNeeded(event: H3Event, order: MockOrder): Promise<MockOrder> {
  if (order.status !== 0) {
    return order
  }

  const createdAt = new Date(order.createdAt).getTime()
  if (!Number.isFinite(createdAt)) {
    return order
  }
  const now = Date.now()
  const elapsed = now - createdAt
  if (elapsed < AUTO_SETTLE_MS) {
    return order
  }

  if (elapsed > ORDER_EXPIRE_MS) {
    const expired = await upsertPilotEntity(event, {
      domain: ORDER_DOMAIN,
      id: order.id,
      payload: {
        ...order,
        status: 3,
        updatedAt: nowIso(),
      },
    }) as MockOrder
    return expired
  }

  const paidAt = nowIso()
  const settled = await upsertPilotEntity(event, {
    domain: ORDER_DOMAIN,
    id: order.id,
    payload: {
      ...order,
      status: 1,
      payTime: paidAt,
      updatedAt: paidAt,
    },
  }) as MockOrder

  if (settled.type === 'STANDARD' || settled.type === 'ULTIMATE') {
    const plan = resolvePlan(settled.type, settled.time)
    await upsertPilotEntity(event, {
      domain: SUBSCRIPTION_DOMAIN,
      id: settled.userId,
      payload: {
        id: settled.userId,
        uid: settled.userId,
        type: settled.type,
        time: settled.time,
        orderId: settled.id,
        status: 1,
        createdAt: paidAt,
        updatedAt: paidAt,
        expiredAt: toSubscriptionExpiry(plan.days),
      },
    })
  }

  const couponCode = normalizeCouponCode(settled.couponCode)
  if (couponCode) {
    const coupon = await findCouponByCode(event, couponCode)
    if (coupon) {
      await markCouponUsed(event, coupon)
    }
  }

  return settled
}

async function refreshOrdersByUser(event: H3Event, userId: string): Promise<MockOrder[]> {
  const list = await listPilotEntitiesAll<MockOrder>(event, ORDER_DOMAIN)
  const userOrders = list.filter(item => normalizeText(item.userId) === normalizeText(userId))
  const refreshed: MockOrder[] = []
  for (const order of userOrders) {
    refreshed.push(await settleOrderIfNeeded(event, order))
  }
  return refreshed.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export async function ensureMockCouponSeed(event: H3Event): Promise<void> {
  await ensurePilotEntitySeed(event, COUPON_DOMAIN, [
    {
      id: 'welcome_200',
      code: 'WELCOME-200',
      mainCode: 'WELCOME-200',
      discountAmount: 200,
      maximumDiscount: null,
      minimumSpend: 0,
      maxUsage: 1,
      usedCount: 0,
      stackable: false,
      newUserOnly: true,
      startDate: null,
      endDate: null,
      status: 1,
      uid: '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    },
  ])
}

export async function calcSubscriptionPrice(
  event: H3Event,
  input: { type: string, time: string, couponCode?: string },
): Promise<PriceInfo & { coupon: MockCoupon | null }> {
  await ensureMockCouponSeed(event)
  const plan = resolvePlan(normalizeText(input.type), normalizeText(input.time))
  const coupon = await findCouponByCode(event, input.couponCode || '')
  const discount = calcCouponDiscount(plan.originPrice, coupon)
  const info = buildPriceInfo(plan.title, plan.range, plan.days, plan.originPrice, discount)
  return {
    ...info,
    coupon,
  }
}

export async function calcDummyPrice(
  event: H3Event,
  input: { value: number, couponCode?: string },
): Promise<PriceInfo & { coupon: MockCoupon | null }> {
  await ensureMockCouponSeed(event)
  const originPrice = Math.max(1, Math.floor(Number(input.value || 0)))
  const coupon = await findCouponByCode(event, input.couponCode || '')
  const discount = calcCouponDiscount(originPrice, coupon)
  const info = buildPriceInfo('云点充值', '即时到账', 1, originPrice, discount)
  return {
    ...info,
    coupon,
  }
}

export async function createSubscriptionOrder(
  event: H3Event,
  input: {
    userId: string
    type: string
    time: string
    couponCode?: string
    paymentMethod?: number
  },
): Promise<{ order: MockOrder, code_url: string }> {
  const priced = await calcSubscriptionPrice(event, input)
  const createdAt = nowIso()
  const order: MockOrder = {
    id: createOrderId(),
    userId: input.userId,
    type: normalizeText(input.type) || 'STANDARD',
    time: normalizeText(input.time) || 'MONTH',
    description: priced.name,
    status: 0,
    paymentMethod: Number(input.paymentMethod || 2),
    totalAmount: priced.meta.feeTax,
    originAmount: priced.meta.originPrice,
    discountAmount: priced.meta.discount,
    couponCode: normalizeCouponCode(input.couponCode),
    additionalInfo: encodeOrderAdditionalInfo({
      meta: {
        subscription: priced,
      },
    }),
    createdAt,
    updatedAt: createdAt,
    payTime: '',
  }

  await upsertPilotEntity(event, {
    domain: ORDER_DOMAIN,
    id: order.id,
    payload: order,
  })

  return {
    order,
    code_url: `weixin://wxpay/pilot/mock/${order.id}`,
  }
}

export async function createDummyOrder(
  event: H3Event,
  input: {
    userId: string
    value: number
    couponCode?: string
    paymentMethod?: number
  },
): Promise<{ order: MockOrder, code_url: string, meta: PriceInfo['meta'] }> {
  const priced = await calcDummyPrice(event, {
    value: input.value,
    couponCode: input.couponCode,
  })
  const createdAt = nowIso()
  const order: MockOrder = {
    id: createOrderId(),
    userId: input.userId,
    type: 'DUMMY',
    time: 'BALANCE',
    description: '云点充值',
    status: 0,
    paymentMethod: Number(input.paymentMethod || 2),
    totalAmount: priced.meta.feeTax,
    originAmount: priced.meta.originPrice,
    discountAmount: priced.meta.discount,
    couponCode: normalizeCouponCode(input.couponCode),
    additionalInfo: encodeOrderAdditionalInfo({
      meta: {
        dummy: priced,
      },
    }),
    createdAt,
    updatedAt: createdAt,
    payTime: '',
  }

  await upsertPilotEntity(event, {
    domain: ORDER_DOMAIN,
    id: order.id,
    payload: order,
  })

  return {
    order,
    code_url: `weixin://wxpay/pilot/mock/${order.id}`,
    meta: priced.meta,
  }
}

export async function getLatestPendingOrder(
  event: H3Event,
  userId: string,
): Promise<{ order: MockOrder, code_url: string } | null> {
  const orders = await refreshOrdersByUser(event, userId)
  const pending = orders.find(item => item.status === 0)
  if (!pending) {
    return null
  }
  return {
    order: pending,
    code_url: `weixin://wxpay/pilot/mock/${pending.id}`,
  }
}

export async function getOrderById(
  event: H3Event,
  orderId: string,
): Promise<MockOrder | null> {
  const order = await getPilotEntity(event, ORDER_DOMAIN, orderId) as MockOrder | null
  if (!order) {
    return null
  }
  return await settleOrderIfNeeded(event, order)
}

export async function getOrderListByUser(
  event: H3Event,
  userId: string,
): Promise<MockOrder[]> {
  return await refreshOrdersByUser(event, userId)
}

export async function listOrderPage(
  event: H3Event,
  query: Record<string, unknown>,
): Promise<Awaited<ReturnType<typeof listPilotEntities<MockOrder>>>> {
  const page = await listPilotEntities<MockOrder>(event, ORDER_DOMAIN, {
    query,
    sorter: (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  })
  const refreshedItems: MockOrder[] = []
  for (const order of page.items) {
    refreshedItems.push(await settleOrderIfNeeded(event, order))
  }
  return {
    ...page,
    items: refreshedItems,
  }
}

export async function getOrderStatistics(event: H3Event): Promise<{
  orders: MockOrder[]
  payStatus: { success: number, other: number }
  price: { submit: number, success: number }
  totalPrice: number
}> {
  const orders = await listPilotEntitiesAll<MockOrder>(event, ORDER_DOMAIN)
  const refreshed: MockOrder[] = []
  for (const order of orders) {
    refreshed.push(await settleOrderIfNeeded(event, order))
  }

  let successCount = 0
  let submit = 0
  let successPrice = 0
  for (const order of refreshed) {
    submit += Number(order.totalAmount || 0)
    if (order.status === 1) {
      successCount += 1
      successPrice += Number(order.totalAmount || 0)
    }
  }

  return {
    orders: refreshed,
    payStatus: {
      success: successCount,
      other: Math.max(0, refreshed.length - successCount),
    },
    price: {
      submit,
      success: successPrice,
    },
    totalPrice: submit,
  }
}

export async function getUserSubscription(event: H3Event, userId: string): Promise<Record<string, any> | null> {
  const subscription = await getPilotEntity(event, SUBSCRIPTION_DOMAIN, userId)
  if (!subscription) {
    return null
  }
  return subscription
}

export async function listCouponByUser(event: H3Event, userId: string): Promise<MockCoupon[]> {
  await ensureMockCouponSeed(event)
  const list = await listPilotEntitiesAll<MockCoupon>(event, COUPON_DOMAIN)
  return list
    .filter((item) => {
      const uid = normalizeText(item.uid)
      return !uid || uid === normalizeText(userId)
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export async function bindCouponToUser(
  event: H3Event,
  userId: string,
  couponCode: string,
): Promise<MockCoupon> {
  await ensureMockCouponSeed(event)
  const normalizedCode = normalizeCouponCode(couponCode)
  let coupon = await findCouponByCode(event, normalizedCode)
  const now = nowIso()

  if (!coupon) {
    coupon = {
      id: normalizeCouponCode(normalizedCode).toLowerCase() || randomUUID(),
      code: normalizedCode,
      mainCode: normalizedCode,
      discountAmount: 100,
      maximumDiscount: null,
      minimumSpend: 0,
      maxUsage: 1,
      usedCount: 0,
      stackable: false,
      newUserOnly: false,
      startDate: null,
      endDate: null,
      status: 1,
      uid: userId,
      createdAt: now,
      updatedAt: now,
    }
  }

  const next = await upsertPilotEntity(event, {
    domain: COUPON_DOMAIN,
    id: coupon.id,
    payload: {
      ...coupon,
      uid: userId,
      updatedAt: now,
    },
  }) as MockCoupon

  return next
}

export async function listCouponPage(
  event: H3Event,
  query: Record<string, unknown>,
): Promise<Awaited<ReturnType<typeof listPilotEntities<MockCoupon>>>> {
  await ensureMockCouponSeed(event)
  return await listPilotEntities<MockCoupon>(event, COUPON_DOMAIN, {
    query,
    sorter: (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  })
}

function createCouponCode(prefix: string, seq: number): string {
  const random = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()
  const normalizedPrefix = normalizeCouponCode(prefix).slice(0, 10) || 'PILOT'
  return `${normalizedPrefix}-${String(seq).padStart(4, '0')}-${random}`
}

export async function createCouponBatches(
  event: H3Event,
  dto: Record<string, unknown>,
): Promise<MockCoupon[]> {
  const quantity = Math.min(Math.max(Number(dto.quantity || 0), 1), 1000)
  const prefix = normalizeText(dto.prefix || 'PILOT')
  const list: MockCoupon[] = []
  const now = nowIso()
  for (let index = 1; index <= quantity; index += 1) {
    const code = createCouponCode(prefix, index)
    const coupon = await upsertPilotEntity(event, {
      domain: COUPON_DOMAIN,
      id: `${code.toLowerCase()}_${Date.now().toString(36)}_${index}`,
      payload: {
        id: `${code.toLowerCase()}_${Date.now().toString(36)}_${index}`,
        code,
        mainCode: code,
        discountAmount: Number(dto.discountAmount || 0),
        maximumDiscount: dto.maximumDiscount === undefined ? null : Number(dto.maximumDiscount),
        minimumSpend: Number(dto.minimumSpend || 0),
        maxUsage: Number(dto.maxUsage || 1),
        usedCount: 0,
        stackable: Boolean(dto.stackable),
        newUserOnly: Boolean(dto.newUserOnly),
        startDate: dto.startDate ? String(dto.startDate) : null,
        endDate: dto.endDate ? String(dto.endDate) : null,
        status: 1,
        uid: '',
        createdAt: now,
        updatedAt: now,
      },
    }) as MockCoupon
    list.push(coupon)
  }
  return list
}

export async function assignCouponToUser(
  event: H3Event,
  couponCode: string,
  uid: string,
): Promise<MockCoupon | null> {
  const coupon = await findCouponByCode(event, couponCode)
  if (!coupon) {
    return null
  }
  const next = await upsertPilotEntity(event, {
    domain: COUPON_DOMAIN,
    id: coupon.id,
    payload: {
      ...coupon,
      uid: normalizeText(uid),
      updatedAt: nowIso(),
    },
  }) as MockCoupon
  return next
}

export async function invalidateCoupon(
  event: H3Event,
  couponCode: string,
): Promise<boolean> {
  const coupon = await findCouponByCode(event, couponCode)
  if (!coupon) {
    return false
  }
  await upsertPilotEntity(event, {
    domain: COUPON_DOMAIN,
    id: coupon.id,
    payload: {
      ...coupon,
      maxUsage: -1,
      status: 0,
      updatedAt: nowIso(),
    },
  })
  return true
}

export async function removeCouponById(event: H3Event, couponId: string): Promise<boolean> {
  return await deletePilotEntity(event, COUPON_DOMAIN, couponId)
}
