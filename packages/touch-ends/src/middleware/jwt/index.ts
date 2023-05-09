import Application from 'koa'
import koaJwt from 'koa-jwt'
import jwt from 'jsonwebtoken'
import Setting from '../../config/setting.js'
import { AuthExpiredError, AuthFailedError } from '../../error/user-error.js'
import { IUser, UserModel } from '../../api/cms/user/model.js'
import { getUserPermissions, getUserRoles } from '../../api/repository.js'

async function _mountUser(ctx) {

    if (typeof ctx.request.headers.authorization === 'string') {

        const token = ctx.request.headers.authorization.slice(7)

        try {

            const data = jwt.verify(token, Setting.token.secret)

            ctx.currentUser = data.user

            // console.log("@loginRequired:" + JSON.stringify(ctx.currentUser))

        } catch (e) {

            throw new AuthExpiredError(e.message)

        }

    } else {

        throw new AuthFailedError("no authorization")

    }

}

export async function loginRequired(ctx, next) {

    await _mountUser(ctx)

    await next()

}

export const adminRequired = perRequired("*")

export function perRequired(...permissions) {

    return async (ctx, next) => {

        await _mountUser(ctx)

        const { id } = ctx.currentUser

        // console.log( await getUserRoles(id) )

        const userPerList = []

        ;(await getUserPermissions(id)).forEach(per => {
            userPerList.push(per.name)
        })
        // const userPerList = (await eller.getImplicitPermissionsForUser(String(id))).flat()

        let accessible = userPerList.filter(v => v === "*" || permissions.indexOf(v) > -1).length >= permissions.length

        if( !accessible ) throw new AuthFailedError("permission denied")

        await next()

    }

}

export interface IUserToken {
    access_token: string
    refresh_token: string
}
export async function refreshToken2AccessToken(token): Promise<string> {
    try {

        const data = jwt.verify(token, Setting.token.secret)

        if( data.type !== "refresh" ) { return null }

        const userID = data.owner.id

        const user = await UserModel.findOne({
            where: {
                id: userID
            }
        })

        return _signAccessToken(user)

    } catch (e) {

        throw new AuthFailedError(e.message)

    }

}
export function getToken(user): IUserToken {

    return {
        access_token: _signAccessToken(user),
        refresh_token: jwt.sign({
                owner: {
                    id: user.id,
                    name: user.username
                },
                type: "refresh"
            },
            Setting.token.secret,
            {
                algorithm: 'HS256',
                expiresIn: Setting.token.refreshExp
            }
        )
    }

}

function _signAccessToken(user: IUser) {
    return jwt.sign({
            user,
            type: "access"
        },
        Setting.token.secret,
        {
            algorithm: 'HS256',
            expiresIn: Setting.token.accessExp
        }
    )
}

export default function (app: Application) {

    // app.use(koaJwt({ secret: Setting.token.secret }))

}
