import Router from 'koa-router'
import './model.js'
import { adminRequired } from '../../../middleware/jwt/index.js'
import { Context } from 'koa'
import { getAllPermissions, getAllRoles } from '../../repository.js'
import { DeleteRoleValidator, UpdateRoleValidator } from './validate.js'
import { RoleModel } from './model.js'
import { ResourceNotFoundError, ResourceProtectedError } from '../../../error/base-error.js'
import { logger } from '../../../middleware/logger/logger.js'
import { LogType } from '../../../lib/util/enums.js'

const router = new Router({
    prefix: "/eller"
})

router.get('/permissions', adminRequired, async (ctx: Context) => {

    ctx.body = await getAllPermissions()

})

router.get('/roles', adminRequired, async (ctx: Context) => {

    ctx.body = await getAllRoles()

})

router.put('/role/:id', adminRequired, logger(LogType.UPD, ({ user, body, request }) => {
    return `${user.username} 更新了角色 ${request.params.id} 的信息 | ${body.name}, ${body.desc}`
}), async (ctx: Context) => {
    const v: UpdateRoleValidator = await new UpdateRoleValidator().validate(ctx)

    const role = await RoleModel.findOne({
        where: {
            id: v.id
        }
    })

    if( !role ) throw new ResourceNotFoundError("unknown role for id: " + v.id)

    ctx.body = await role.update({
        name: v.name,
        desc: v.desc
    })

})

router.delete('/role/:id', adminRequired, async (ctx: Context) => {
    const v: DeleteRoleValidator = await new DeleteRoleValidator().validate(ctx)

    const role = await RoleModel.findOne({
        where: {
            id: v.id
        }
    })

    if( !role ) throw new ResourceNotFoundError("unknown role for id: " + v.id)
    else if ( role.id < 2 ) throw new ResourceProtectedError(v.id + " could not be deleted")
    else ctx.body = await role.destroy()

})

export default () => router
