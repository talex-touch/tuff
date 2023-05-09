import Router from 'koa-router'
import { Context } from 'koa'
import { adminRequired, getToken, loginRequired, refreshToken2AccessToken } from '../../../middleware/jwt/index.js'
import Setting from '../../../config/setting.js'
import { GetUsersValidator } from './validate.js'
import { UserModel } from '../user/model.js'
import { RoleModel } from '../eller/model.js'
// import koaBodyParser from 'koa-bodyparser'

const router = new Router({
    prefix: "/admin"
})

// router.get('/roles', adminRequired, async (ctx: Context) => {
//
//     ctx.body = await eller.getAllRoles()
// })

router.post('/users', adminRequired, async (ctx: Context) => {
    const v: GetUsersValidator = await new GetUsersValidator().validate(ctx);

    const role = v.role //ctx.request.body.role
    // await eller.getUsersForRole("")

    const includeRole = role ? {
        model: RoleModel,
        as: "roles",
        where: {
            id: role
        }
    } : {
        model: RoleModel,
        as: "roles"
    }

    ctx.body = await UserModel.findAndCountAll({
        offset: (Math.max(0, v.page - 1) * Setting.page.size) || 0,
        limit: Setting.page.size,
        include: [ includeRole ]
    })
})

export default () => router
// export default ({ app }) => {
//
//     app
//         // .use(koaBodyParser)
//         .use(router.routes()).use(router.allowedMethods())
//
//
// }
