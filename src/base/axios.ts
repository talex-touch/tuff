import _axios, {AxiosRequestConfig} from 'axios'

// 封装完整的 axios 实例代码
const axios = _axios.create({
    baseURL: 'http://localhost:9981',
    timeout: 60000
})

// 请求拦截器
axios.interceptors.request.use(
    config => {
        // 在发送请求之前做些什么
        return config
    },
    error => {
        // 对请求错误做些什么
        return Promise.reject(error)
    }
)

// 响应拦截器
axios.interceptors.response.use(
    response => {
        // 对响应数据做点什么
        // console.log( response )

        return response.data
    },
    error => {
        // 对响应错误做点什么
        console.log( error )

        return {
            code: 500,
            message: '服务器错误',
            data: null,
            error
        } //Promise.reject(error)
    }
)

export default axios

export interface IReqConfig extends AxiosRequestConfig {
}

export function post(url: string, data: any, config?: IReqConfig) {
    return axios.post(url, data, config)
}

export function get(url: string, config?: IReqConfig) {
    return axios.get(url, config)
}

export function put(url: string, data: any, config?: IReqConfig) {
    return axios.put(url, data, config)
}

export function del(url: string, config?: IReqConfig) {
    return axios.delete(url, config)
}

export function patch(url: string, data: any, config?: IReqConfig) {
    return axios.patch(url, data, config)
}

export function head(url: string, config?: IReqConfig) {
    return axios.head(url, config)
}

export function options(url: string, config?: IReqConfig) {
    return axios.options(url, config)
}

export function request(config: IReqConfig) {
    return axios.request(config)
}