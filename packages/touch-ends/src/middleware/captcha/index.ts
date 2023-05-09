import sharp from 'sharp'
import Setting from '../../config/setting.js'
import path from 'path'
import chalk from 'chalk'
import fs from 'fs'
import jwt from 'jsonwebtoken'
import { createAllDirectorySync } from '../../lib/util/common.js'
import { AuthFailedError } from '../../error/user-error.js'
import { InfoError } from '../../error/base-error.js'

const captchaDir = path.resolve(__dirname, Setting.captcha.dir)
if( !fs.existsSync(captchaDir) ) createAllDirectorySync(captchaDir)

console.log("Captcha", "Captcha imports images from: " + chalk.grey(captchaDir))

const captchaMap = new Map()

export interface IVerifyCaptcha {
    id: string,
    image: Buffer,
    bg: Buffer,
    rotate: number,
    done: boolean
}
export async function generateCaptcha() {
    const num = Math.ceil(Math.random() * 180 + 90)
    const id = new Date().getTime() + ''

    const imgSource = _getRandomImage()

    const captcha = {
        id,
        rotate: num,
        bg: await sharp(imgSource).resize(512, 512).toBuffer(),
        image: await sharp(imgSource)
            .resize(512, 512)
            .extract({
                left: 128,
                top: 128,
                width: 256,
                height: 256
            })
            .rotate(num)
            .toBuffer()

    }

    captchaMap.set(id, captcha)

    return captcha as IVerifyCaptcha
}

export async function captchaRequired(ctx, next) {
    const captchaToken = ctx.request.headers.captcha
    if( !captchaToken ) throw new AuthFailedError("lack token")

    const data = jwt.verify(captchaToken, Setting.token.secret + "F1SE35G42S31V32SD1V32S2_TOKEN_CAPTCHA_TALEX")

    const id = data.captcha
    const captcha = captchaMap.get(id)
    if( !captcha ) throw new AuthFailedError("not found by captcha token")

    const diff = new Date().getTime() - +id
    if( diff >= 60 * 1000 * 5 ) throw new InfoError("time out")

    if( !captcha.done ) throw new AuthFailedError("captcha not verify yet")

    captchaMap.set(id, undefined)
    console.log("Captcha", "Accessed!")

    return await next()
}

export function _signCaptchaVerifiedToken(captcha: IVerifyCaptcha) {
    return jwt.sign({
            captcha: captcha.id,
            type: "verified"
        },
        Setting.token.secret + "F1SE35G42S31V32SD1V32S2_TOKEN_CAPTCHA_TALEX",
        {
            algorithm: 'HS256',
            expiresIn: 60 * 60 * 2
        }
    )
}

export async function validateCaptcha(ctx, next) {
    const captchaID = ctx.request.headers.captcha
    if( !captchaID ) throw new InfoError("captcha id lacked")

    const captchaParam = ctx.request.body.captcha
    if( !captchaParam ) throw new InfoError("captcha param lacked")

    const captcha: IVerifyCaptcha = captchaMap.get(captchaID)
    if( !captcha ) throw new InfoError("captcha id not found")

    // captchaMap.set(captchaID, undefined)

    const diff = new Date().getTime() - +captcha.id
    if( diff >= 60 * 1000 * 3 ) throw new InfoError("time out")

    if( Math.abs(captcha.rotate - captchaParam) > Setting.captcha.offset  ) {

        console.warn("Captcha", "Verify captcha failed. By: " + captcha.rotate + " as " + captchaParam + " | " + Math.abs(captcha.rotate - captchaParam))
        throw new InfoError("verify failed")
    }

    captcha.done = true

    console.log("Captcha", "Verify success in " + diff + "ms")
    await next()

    ctx.body = _signCaptchaVerifiedToken(captcha)

}

function _getRandomImage() {
    const dir = fs.readdirSync(captchaDir)

    let i = 0
    while( true ) {

        const file = dir[i]

        if( Math.random() >= 0.85 ) return path.resolve(captchaDir, file)

        ++i;
        if( i >= dir.length ) i = 0
    }
    // return path.resolve(captchaDir, 'default.png')
}

export default () => {}
