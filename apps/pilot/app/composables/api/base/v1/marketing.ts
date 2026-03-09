// 营销管理

import { endHttp } from '../../axios'
import type { IDataResponse, IPageResponse, IStandardResponse } from '../index.type'
import type { IBannerGroup } from './marketing.type'

export default {
  banner: {
    list(data: Partial<IBannerGroup>) {
      return endHttp.get('marketing/banner/list', data) as Promise<IPageResponse<IBannerGroup>>
    },

    create(data: IBannerGroup) {
      return endHttp.post('marketing/banner', data) as Promise<IDataResponse<IBannerGroup>>
    },

    update(id: number, data: IBannerGroup) {
      return endHttp.put(`marketing/banner/${id}`, data) as Promise<IDataResponse<IBannerGroup>>
    },

    delete(id: number) {
      return endHttp.del(`marketing/banner/${id}`) as Promise<IStandardResponse>
    },
  },
}
