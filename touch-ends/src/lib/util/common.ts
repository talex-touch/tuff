import * as crypto from 'crypto'
import Setting from '../../config/setting.js'
import chalk from 'chalk'
import { common } from '../../types/polyfill-addon.js'
import ICostChalk = common.ICostChalk
import fs from 'fs'
import path from 'path'
import { fileTypeFromFile } from 'file-type'

export async function isImageFile(file): Promise<boolean> {
    return (await fileTypeFromFile(file)).mime.indexOf("image") !== -1
}

// 递归创建目录 异步方法
export async function createAllDirectory (dirname: string) {
    return new Promise<void>(async (resolve) => {
        if( fs.existsSync(dirname) ) return resolve()

        // 递归调用 mkdirs
        fs.mkdirSync(dirname)
        return createAllDirectory(path.dirname(dirname));
    })
}
// 递归创建目录 同步方法
export function createAllDirectorySync (dirname) {
    if (fs.existsSync(dirname)) {
        return true;
    } else {
        if ( createAllDirectorySync(path.dirname(dirname)) ) {
            fs.mkdirSync(dirname);
            return true;
        }
    }
}

export function UrlDecode(str: string): string {
    const decoded = Buffer.from(str, 'base64url').toString()
    // if( decoded !== str ) return UrlDecode(decoded)
    return decoded
}

export function Base64Decode(str: string): string {
    return Buffer.from(str, 'base64').toString('utf-8')
}

export function Base64Encode(data: any): string {
    return Buffer.from(data, 'utf-8').toString('base64')
}

export function getFileUUIDFromName(name: string): string {

    return String(crypto.createHash('md5').update(
        `n=${name}&_t=file`
    ).digest().toString('base64'))

}

export function hexPassword(password: string): string {

    return String(crypto.createHash('md5').update(
        `p=${password}&_salt=${Setting.token.salt}`
    ).digest())

}

export class TimeCosts {
    map = new Map()
    globalIdentifier: string

    constructor(globalIdentifier = "__global") {
        this.globalIdentifier = globalIdentifier
    }

    getType(type?) {
        return this.map.get(type || this.globalIdentifier)
    }

    start(type?) {
        this.map.set(type || this.globalIdentifier, {
            start: new Date().getTime()
        })
    }

    stop(type?) {
        const obj = this.getType(type)
        if( !obj ) return NaN
        obj.end = new Date().getTime()
        obj.diff = obj.end - obj.start
        this.map.set(type || this.globalIdentifier, obj)

        return obj.diff
    }

    clear(type?) {
        this.map.set(type || this.globalIdentifier, undefined)
    }

    clearAll() {
        this.map.clear()
    }

    stopAndOutput(type?, options?: ICostChalk): string {
        const diff = this.stop(type)
        if( isNaN(diff) ) return "- / NAN"
        return timeCostsChalk(diff, options)
    }

    stopWithClearAndOutput(type?, options?: ICostChalk): string {
        const output = this.stopAndOutput(type, options)
        this.clear(type)
        return output
    }

}

export const LARGER_INTERVAL_COST_CHALK: ICostChalk = {
    10000: (str) => chalk.bgRed.white(`  ${str}ms costs  `),
    5000: (str) => chalk.bgYellow.black(` ${str}ms costs `),
    2000: (str) => chalk.white(` ${str}ms costs `),
    0: (str) => chalk.grey(`${str}ms`)
}

export function timeCostsChalk(costs: number, options: ICostChalk = {
    500: (str) => chalk.bgRed.white(`  ${str}ms costs  `),
    200: (str) => chalk.bgYellow.black(` ${str}ms costs `),
    0: (str) => chalk.grey(`${str}ms`)
}): string {
    const costConditions: Array<{ minimum: number, handler: string | Function }> = []

    Object.keys(options).forEach(option => costConditions.push({ minimum: Number(option), handler: options[option] }))
    costConditions.sort((a, b) => b.minimum - a.minimum)

    for( const condition of costConditions ) {

        if( costs >= condition.minimum )
            return (
            (condition.handler instanceof Function) ? condition.handler(costs) : condition.handler
        )

    }

    return costs + ''

}
