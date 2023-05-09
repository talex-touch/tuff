import fse from 'fs-extra'
import log4js from 'log4js'
import { IEndsSetting } from '../../types/setting-config.js'
import { SystemLog } from '../../api/cms/system/model.js'
import { LogType } from '../../lib/util/enums.js'
import path from 'path'

export const logger = (type: LogType, template) => {
    return async (ctx, next) => {
        await loggerMiddleware(type, template, ctx, next);
    };
};

// function writeLog (template, ctx) {
//     const message = template(ctx, ctx.currentUser, ctx.response, ctx.request)
//
//
// }

const loggerMiddleware = async (type: LogType, template, ctx, next) => {

    // const start = new Date().getTime()

    await next()

    // const ms = new Date().getTime() - start

    // 打印出请求相关参数
    // const remoteAddress = ctx.headers['x-forwarded-for'] || ctx.ip || ctx.ips ||
    //     (ctx.socket && (ctx.socket.remoteAddress || (ctx.socket.socket && ctx.socket.socket.remoteAddress)))
    // let logText = `${ctx.method} ${ctx.status} ${ctx.url} 请求参数： ${JSON.stringify(ctx.request.body)} 响应参数： ${JSON.stringify(ctx.body)} - ${remoteAddress} - ${ms}ms`

    // log.info(logText)

    template && await SystemLog.create(
        {
            message: template({ ctx, user: ctx.currentUser, response: ctx.response, request: ctx.request, body: ctx.body }),
            executor_id: ctx.currentUser.id,
            executor: ctx.currentUser,
            status: ctx.status,
            method: ctx.request.method,
            path: ctx.request.path,
            type
        }
    );
}

const log = log4js.getLogger('[Network]')

export function createLogger(setting: IEndsSetting) {

    // 这个是判断是否有logs目录，没有就新建，用来存放日志
    const logsDir = path.resolve(__dirname, setting.dir.logs)

    if ( !fse.existsSync(logsDir) ) fse.mkdirSync(logsDir)

    log4js.configure({
        appenders: {
            console: { type: 'console' },
            dateFile: { type: 'dateFile', filename: logsDir, pattern: '-yyyy-MM-dd' }
        },
        categories: {
            default: {
                appenders: ['console', 'dateFile'],
                level: 'info'
            }
        }
    })

}
