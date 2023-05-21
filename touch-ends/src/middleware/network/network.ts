import chalk from 'chalk'
import * as Searcher from './../../lib/ip2region/index.js'
import { Context } from 'koa'
import { BaseError } from '../../error/base-error.js'

export let reqCount = 0

const networkHandler = async (ctx, next) => {

    ++reqCount;

    ctx['_startTime'] = new Date().getTime()

    console.oLog("\n")
    console.log("Network", chalk.bgMagenta(` ${ctx.method} `) + " " + chalk.cyan("->") + " " + ctx.request.url + chalk.grey(" from ") +
        (
            (ctx.request.header['x-real-ip'] ? ctx.request.header['x-real-ip'] : ctx.ip)
            + (ctx.request.header['x-forwarded-for'] ? `(${ctx.request.header['x-forwarded-for']})` : '')
        )
    )
    // console.dir(ctx)

    let body = ctx.request.body
    if( body ) {

        console.log("Network", chalk.bold(`  Body`) + chalk.gray(` | ${JSON.stringify(body)}`))

        ctx.request.body = body

    }

    await next()

    responseHandler(ctx)

}

const searcher = Searcher.newWithBuffer(Searcher.buffer)

export async function mountIp(ctx: Context, next) {

    let ip;
    const proxyIp = ctx.request.header['x-forwarded-for'] ? String(ctx.request.header['x-forwarded-for'])?.split(', ')[0] : ctx.request.ips[0];

    if (proxyIp) ip = proxyIp;
    else {

        if( ctx.request.header['x-real-ip'] )
            ip = ctx.request.header['x-real-ip']
        else ip = ctx.request.ip;

    }

    const locale = await searcher.search(ip)

    const args = String(locale.region).split('|')
    locale.args = args.splice(1, 1)

    let localeStr = ''
    args.forEach((arg, index) => {
        localeStr += arg + (index + 1 >= args.length ? '' : '-')
    })

    locale.pos = localeStr

    ctx.currentSource = { ips: ctx.request.ips, ip: ip, locale };

    await next()

}

function responseHandler(ctx, err?) {

    // console.log("Network", JSON.stringify(ctx))

    const diffTime = new Date().getTime() - ctx['_startTime']
    const file = ctx['_file']

    const status = ctx.response.status
    let logText =
        (status === 200 ? chalk.green(`${ctx.response.status}`) :
            (status === 404 ? chalk.bgGray.white(` ${ctx.response.status} `) : status >= 500 ? chalk.bgRed.bold(` ${ctx.response.status} `) : chalk.bgMagenta(` ${ctx.response.status} `)))
        + " " + chalk.yellow("<-") + chalk.grey(" as results type: ") + ctx.app.env + chalk.grey(" | ") + ctx.host + "  "
    if( diffTime >= 400 )
        logText += chalk.bgRed.bold(`  ${diffTime}ms costs  `)
    else if( diffTime >= 200 )
        logText += chalk.bgYellow.black.bold(` ${diffTime}ms costs `)
    else
        logText += chalk.gray(` ${diffTime}ms `)

    if( file ) {

        console.log("Network", "File Responding!")

        return

    }

    console.log("Network", logText)

    if( !ctx['_logClosed'] && ctx.body )
        console.log("Network", chalk.gray(" -- " + JSON.stringify(ctx.body)))
    if( err )
        console.log("Network", chalk.red(" -- " + JSON.stringify(err)))
    console.oLog("\n")

    const result = {
        code: err?.code || ctx.response.status,
        message: err ? (err.message || err.data) : (ctx.message || 'success'),
        data: ctx.body,
        error: err?.data,
    }

    // __development
    if( ctx.app.env === 'development' ) {

        result['url'] = `${ctx.method} ${ctx.originalUrl}`
        result['costs'] = diffTime

        if( err ) {

            result['err'] = err
            // result['_err'] = JSON.stringify(err)

        }

    }

    ctx.body = result

}

// 这个middleware处理在其它middleware中出现的异常,我们在next()后面进行异常捕获，出现异常直接进入这个中间件进行处理
const errorHandler = (ctx, next) => {
    return next().catch(err => {

        if (err.code == null) {
            // console.oError(err)
            // logger.error(err.stack)
            console.warn("Network", "Error occurred while processing ...")
            console.oError(err)
        }
        // ctx.body = {
        //     code: err.code || 500,
        //     data: 'server error',
        //     message: err.message
        // }
        //
        // 保证返回状态是 200
        ctx.status = 200

        // if( err instanceof BaseError )
        //     ctx.status = err.code

        responseHandler(ctx, err)

        return Promise.resolve()
    })
}

export { networkHandler, errorHandler }
