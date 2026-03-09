export enum Order {
  Asc = 'ASC',
  Desc = 'DESC',
}

export interface ILivechat extends Record<string, any> {
  /**
   * 客服名称
   */
  name: string
  /**
   * 客服手机号
   */
  phone: number
  /**
   * 客服二维码
   */
  qrcode: string
}

export interface IUpdateLivechat extends Partial<ILivechat> {}

export interface ILivechatQuery extends ILivechat {
  order?: Order
  page: number
  pageSize: number
}
