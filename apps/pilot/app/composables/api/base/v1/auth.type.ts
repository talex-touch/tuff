export interface ILoginToken {
  /**
   * JWT身份Token
   */
  accessToken: string
  /**
   * JWT刷新Token
   */
  refreshToken: string
}
