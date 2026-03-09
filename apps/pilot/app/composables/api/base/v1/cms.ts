import type { promises } from 'node:dns'
import { endHttp } from '../../axios'
import type { IDataResponse, IPageResponse, IStandardResponse } from '../index.type'
import type {
  IAdminOrder,
  IAdminOrderQuery,
  IDeptModelQuery,
  IDictItemModel,
  IDictItemModelQuery,
  IDictTypeModel,
  IDictTypeModelQuery,
  IDoc,
  IDocQuery,

  IFeedbackModel,
  IFeedbackModelQuery,

  IMenuModel,
  IMenuModelQuery,
  IParamConfigModel,
  IParamConfigModelQuery,
  IRoleModel,
  IRoleModelQuery,
  ISubscriptionPlan,
  ISubscriptionPlanQuery,
  ITasksModel,
  ITasksModelQuery,
  IUserModel,
  IUserModelQuery,
  ServeStatInfo,
} from './cms.type'

export default {
  doc: {
    deployedList(query: Partial<IDocQuery>) {
      return endHttp.post('doc/published/list', query) as Promise<IPageResponse<IDoc>>
    },
    list(query: Partial<IDocQuery>) {
      return endHttp.post('doc/list', query) as Promise<IPageResponse<IDoc>>
    },
    create(body: IDoc) {
      return endHttp.post('doc', body) as Promise<IDataResponse<IDoc>>
    },
    tempSave(id: number, body: IDoc) {
      return endHttp.post(`doc/temp_save?id=${id}`, body) as Promise<IDataResponse<IDoc>>
    },
    update(id: number, body: IDoc) {
      return endHttp.put(`doc/${id}`, body) as Promise<IDataResponse<IDoc>>
    },
    archived(id: number) {
      return endHttp.del(`doc/${id}`) as Promise<IStandardResponse>
    },
    public(id: number) {
      return endHttp.post(`doc/publish/${id}`) as Promise<IDataResponse<boolean>>
    },
    info(id: number) {
      return endHttp.get(`doc/${id}`) as Promise<IDataResponse<[IDoc, { content: string }]>>
    },
    associateAgreement(id: number, key: string) {
      return endHttp.post(`doc/agreement/${id}?key=${key}`)
    },
    agreementInfo(key: string) {
      return endHttp.get(`doc/agreement/${key}`)
    },
  },

  users: {
    list(query: IUserModelQuery) {
      return endHttp.get('system/users', query) as Promise<IPageResponse<IUserModel>>
    },
    create(Body: IUserModel) {
      return endHttp.post('system/users', Body)
    },
    get(id: number | string) {
      return endHttp.get(`system/users/${id}`) as Promise<IDataResponse<IUserModel>>
    },
    update(id: number | string, Body: IUserModel) {
      return endHttp.put(`system/users/${id}`, Body) as Promise<IDataResponse<IUserModel>>
    },
    delete(id: number | string) {
      return endHttp.del(`system/users/${id}`) as Promise<IStandardResponse>
    },
    search(query: string) {
      return endHttp.get(`system/users/search?query=${query}`) as Promise<IDataResponse<[IUserModel[], number]>>
    },
  },
  order: {
    list(body: Partial<IAdminOrderQuery>) {
      return endHttp.post('order/admin/list', body) as Promise<IPageResponse<IAdminOrder>>
    },

  },

  role: {
    list(query: Partial<IRoleModelQuery> = { page: 1, pageSize: 50 }) {
      return endHttp.get('system/roles', query) as Promise<IPageResponse<IRoleModel>>
    },
    create(Body: IRoleModel) {
      return endHttp.post('system/roles', Body)
    },
    get(id: number | string) {
      return endHttp.get(`system/roles/${id}`) as Promise<IDataResponse<IRoleModel>>
    },
    update(id: number | string, query: IRoleModel) {
      return endHttp.put(`system/roles/${id}`, query) as Promise<IDataResponse<IRoleModel>>
    },
    delete(id: number | string) {
      return endHttp.del(`system/roles/${id}`) as Promise<IStandardResponse>
    },
  },
  menu: {
    list(query: IMenuModelQuery = { page: 1, pageSize: 50 }) {
      return endHttp.get('system/menus', query) as Promise<IPageResponse<IMenuModel>>
    },
    create(Body: IMenuModel) {
      return endHttp.post('system/menus', Body)
    },
    get(id: number | string) {
      return endHttp.get(`system/menus/${id}`) as Promise<IDataResponse<IMenuModel>>
    },
    update(id: number | string, query: IMenuModel) {
      return endHttp.put(`system/menus/${id}`, query) as Promise<IDataResponse<IMenuModel>>
    },
    delete(id: number | string) {
      return endHttp.del(`system/menus/${id}`) as Promise<IStandardResponse>
    },

    /* 获取后端定义的所有权限集
     *
     */
    getPermissions() {
      return endHttp.get('system/menus/permissions') as Promise<{ data: [] }>
    },
  },

  dept: {
    list(query: Partial<IDeptModelQuery>) {
      return endHttp.get('system/depts', query) as Promise<IDataResponse<IDeptModelQuery>>
    },
    create(Body: IDeptModelQuery) {
      return endHttp.post('system/depts', Body) as Promise<IStandardResponse>
    },
    get(id: number | string) {
      return endHttp.get(`system/depts/${id}`) as Promise<IDataResponse<IDeptModelQuery>>
    },
    update(id: number | string, Body: IDeptModelQuery) {
      return endHttp.put(`system/depts/${id}`, Body) as Promise<IDataResponse<IDeptModelQuery>>
    },
    delete(id: number | string) {
      return endHttp.del(`system/depts/${id}`) as Promise<IStandardResponse>
    },
  },

  dictType: {
    list(query: IDictTypeModelQuery) {
      return endHttp.get('system/dict-type', query) as Promise<IPageResponse<IDictTypeModel>>
    },
    create(Body: IDictTypeModel) {
      return endHttp.post('system/dict-type', Body)
    },
    get(id: number | string) {
      return endHttp.get(`system/dict-type/${id}`) as Promise<IDataResponse<IDictTypeModel>>
    },
    /**
     * 这个跟新奇怪  竟然是post
     * @param id
     * @param query
     */
    update(id: number | string, query: IDictTypeModel) {
      return endHttp.put(`system/dict-type/${id}`, query) as Promise<IDataResponse<IDictTypeModel>>
    },
    delete(id: number | string) {
      return endHttp.del(`system/dict-type/${id}`) as Promise<IStandardResponse>
    },
  },

  Tasks: {
    list(query: ITasksModelQuery) {
      return endHttp.get('system/tasks', query) as Promise<IPageResponse<ITasksModel>>
    },
    create(Body: ITasksModel) {
      return endHttp.post('system/tasks', Body)
    },
    get(id: number | string) {
      return endHttp.get(`system/tasks/${id}`) as Promise<IDataResponse<ITasksModel>>
    },
    update(id: number | string, query: ITasksModel) {
      return endHttp.put(`system/tasks/${id}`, query) as Promise<IDataResponse<ITasksModel>>
    },
    delete(id: number | string) {
      return endHttp.del(`system/tasks/${id}`) as Promise<IStandardResponse>
    },
  },

  paramConfig: {
    list(query: Partial<IParamConfigModelQuery>) {
      return endHttp.get('system/param-config', query) as Promise<IPageResponse<IParamConfigModel>>
    },
    create(Body: IParamConfigModel) {
      return endHttp.post('system/param-config', Body)
    },
    get(id: number | string) {
      return endHttp.get(`system/param-config/${id}`) as Promise<IDataResponse<IParamConfigModel>>
    },
    update(id: number | string, Body: IParamConfigModel) {
      return endHttp.post(`system/param-config/${id}`, Body) as Promise<IDataResponse<IParamConfigModel>>
    },
    delete(id: number | string) {
      return endHttp.del(`system/param-config/${id}`) as Promise<IStandardResponse>
    },
  },

  dictItem: {
    list(query: IDictItemModelQuery) {
      return endHttp.get('system/dict-item', query) as Promise<IPageResponse<IDictItemModel>>
    },
    create(Body: IDictItemModel) {
      return endHttp.post('system/dict-item', Body)
    },
    get(id: number | string) {
      return endHttp.get(`system/dict-item/${id}`) as Promise<IDataResponse<IDictItemModel>>
    },
    update(id: number | string, Body: IDictItemModel) {
      return endHttp.post(`system/dict-item/${id}`, Body) as Promise<IDataResponse<IDictItemModel>>
    },
    delete(id: number | string) {
      return endHttp.del(`system/dict-item/${id}`) as Promise<IStandardResponse>
    },
  },

  systemServer: {
    list() {
      return endHttp.get('system/serve/stat') as Promise<IDataResponse<ServeStatInfo>>
    },
  },
  aigc: {
    userStatistics() {
      return endHttp.get('aigc/prompts/user') as Promise<IStandardResponse>
    },
  },
  subscription: {
    list(query: Partial<ISubscriptionPlanQuery>) {
      return endHttp.post('subscribe/list', query) as Promise<IPageResponse<ISubscriptionPlan>>
    },
    forceUpdate(uid: number) {
      return endHttp.get(`subscribe/update?uid=${uid}`) as Promise<IStandardResponse>
    },
  },

  feedback: {

    create(data: IFeedbackModel) {
      return endHttp.post('feedback/create', data) as Promise<IStandardResponse>
    },
    list(query: Partial<IFeedbackModelQuery>) {
      return endHttp.post('feedback/listAll', query) as Promise<IPageResponse<IFeedbackModel>>
    },
    update(id: number | string, data: IFeedbackModel) {
      return endHttp.put(`feedback/${id}`, data) as Promise<IStandardResponse>
    },
    delete(id: number | string) {
      return endHttp.del(`feedback/${id}`) as Promise<IStandardResponse>
    },

  },

}
