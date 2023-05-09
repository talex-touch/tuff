import Application from 'koa'
import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import Router from 'koa-router'
import { TimeCosts } from '../lib/util/common.js'

function log(msg) {
    console.log("API", msg)
}

async function readAndLoad(app: Application, tPath: string) {

    log("Load api from: " + chalk.grey(tPath))

    const files = fs.readdirSync(tPath)

    for ( const file of files ) {
        if( file.indexOf("api-manager") !== -1 || file === "channel" ) continue

        let finalPath = path.resolve(tPath, file)
        // 如果是文件夹
        if( file.indexOf(".") === -1 ) {

            const indexPath = path.resolve(finalPath, __development ? "index.ts" : "index.js")

            // 没有 index.ts 就继续读取
            if( !fs.existsSync(indexPath) ) {

                await readAndLoad(app, path.resolve(tPath, file))

                continue;

            } else {

                finalPath = indexPath

            }

        }

        log("Loading api: " + chalk.grey(file))
        const imp = await import("file://" + finalPath)

        try {

            timer.start(finalPath)

            let back = imp.default

            if( back instanceof Function ) {

                back = imp.default({ router, app })

            }

            if( back && back instanceof Router ) {

                app.use(back.routes()).use(back.allowedMethods())

            }

            log("Api load done: " + chalk.green(file) + "     " + timer.stopWithClearAndOutput(finalPath))

        } catch (e) {

            console.error("API", "Api load error: " + chalk.bgRed.white(` ${file} `))
            console.oError(e)

        }

    }

}

const timer = new TimeCosts()

export const router = new Router()

export async function importsAllApis(app: Application) {

    timer.start()

    app.use(router.routes())

    const rootPath = path.resolve(__dirname, 'api')

    await readAndLoad(app, rootPath)

    log("All apis loaded!" + "     " + timer.stopWithClearAndOutput())

}
