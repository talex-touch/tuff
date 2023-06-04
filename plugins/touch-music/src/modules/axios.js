import _axios from 'axios'

export const axios = _axios.create({
  baseURL: `https://netease-cloud-music-api-umber-theta.vercel.app/`,
  timeout: 60000,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/json',
  }
})

axios.interceptors.response.use(async (res) => {

      return res.data

    },
    async res => {

      /*if ( !res.response || res.code === "ERR_INTERNET_DISCONNECTED" ) {
        return window.$tipper.tip( '请检查您的网络!', {
          stay: 8200,
          type: TipType.WARNING
        } );
      }

      // 判断请求超时
      if ( res.code === "ERR_NETWORK" && (res.message.indexOf('timeout') !== -1 || res.message === 'Network Error') ) {
        return window.$tipper.tip( '无法连接至远程服务器!', {
          stay: 8200,
          type: TipType.WARNING
        } );
      }*/

      console.log(res)

      return res

    }
)