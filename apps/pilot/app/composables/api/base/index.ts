import AuthApi from './v1/auth'
import CmsApi from './v1/cms'
import CommonApi from './v1/common'
import ToolsApi from './v1/tools'
import AigcApi from './v1/aigc'
import AccountApi from './v1/account'
import MarketAPi from './v1/marketing'
import WeChatApi from './v1/weChat'

export const $endApi = {
  v1: {
    auth: AuthApi,
    account: AccountApi,
    cms: CmsApi,
    common: CommonApi,
    tools: ToolsApi,
    aigc: AigcApi,
    market: MarketAPi,
    wechat: WeChatApi,
  },
}
