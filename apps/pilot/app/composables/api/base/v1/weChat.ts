import type { ILivechat, IUpdateLivechat } from './wechat.type'
import { endHttp } from '../../axios'

export default {
  Livechat: {
    list(data: Partial<ILivechat>) {
      return endHttp.get('/livechat/list', data)
    },
    create(data: ILivechat) {
      return endHttp.post('/livechat', data)
    },
    update(id: string | number, data: IUpdateLivechat) {
      return endHttp.put(`/livechat/${id}`, data)
    },
    delete(id: string | number) {
      return endHttp.del(`/livechat/${id}`)
    },
    randomOne() {
      return endHttp.get('/livechat/random')
    },
  },
}
