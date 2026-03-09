import { endHttp } from '../../axios'
import type { IPageResponse } from '../index.type'
import type { IStorageModel, IStorageModelQuery } from './tools.type'

export default {
  storage: {
    list(query: Partial<IStorageModelQuery>) {
      return endHttp.get('/tools/storage/list', query) as Promise<IPageResponse<IStorageModel>>
    },
    del(ids: Array<number>) {
      return endHttp.del('/tools/storage/delete', { ids })
    },
  },
}
