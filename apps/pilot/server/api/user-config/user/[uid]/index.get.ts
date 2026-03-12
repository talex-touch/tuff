import { quotaOk } from '../../../../utils/quota-api'

export default defineEventHandler((_event) => {
  return quotaOk({
    pub_info: '',
    pri_info: '',
    readonly: true,
  })
})
