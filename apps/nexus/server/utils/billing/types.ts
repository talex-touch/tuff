export type BillingProviderKey = string

export type PaymentMethod =
  | 'card'
  | 'wallet'
  | 'bank_transfer'
  | 'apple_pay'
  | 'google_pay'
  | 'alipay'
  | 'wechat'
  | 'paypal'
  | 'crypto'

export interface CheckoutIntent {
  id: string
  provider: BillingProviderKey
  plan: string
  amountCents: number
  currency: string
  status: 'pending' | 'paid' | 'failed' | 'canceled'
  metadata?: Record<string, any>
  createdAt: string
  updatedAt?: string
}

export interface BillingProvider {
  key: BillingProviderKey
  name: string
  methods: PaymentMethod[]
  createCheckout: (input: {
    userId: string
    plan: string
    amountCents: number
    currency: string
    metadata?: Record<string, any>
  }) => Promise<CheckoutIntent>
  getCheckoutStatus: (input: { checkoutId: string }) => Promise<CheckoutIntent | null>
  handleWebhook?: (payload: unknown, headers?: Record<string, string | string[] | undefined>) => Promise<void>
}
