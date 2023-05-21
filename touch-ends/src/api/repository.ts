import { PermissionModel, RoleModel, RolePer, UserRole } from './cms/eller/model.js'
import { UserIdentity, UserModel } from './cms/user/model.js'
import { hexPassword } from '../lib/util/common.js'
import { IdentityType } from '../lib/util/enums.js'
import { Op } from 'sequelize'

export let adminRole: RoleModel = await RoleModel.findOne({
    where: {
        name: "admin"
    }
})
export let rootUser: UserModel = await UserModel.findOne({
    where: {
        username: "root"
    }
})

export let defaultRole = await RoleModel.findOne({
    where: {
        name: "default"
    }
})

if( !adminRole ) {

    adminRole = await RoleModel.create({
        name: "admin",
        desc: "全局最高角色"
    })

    defaultRole = await RoleModel.create({
        name: "default",
        desc: "默认用户组"
    })

    // install default root permission
    await PermissionModel.create({
        id: -1,
        name: "*",
        module: "*"
    })

    await PermissionModel.create({
        id: 0,
        name: "default",
        module: "default"
    })

    // install permissions to user
    await RolePer.create({
        per_id: -1, // remark to all
        role_id: adminRole.id
    })

    await RolePer.create({
        per_id: 1,
        role_id: defaultRole.id
    })

}

if( !rootUser ) {

    console.log("Model", "Installing default data info ...")

    // install role
    // await eller.addPermissionForUser("r:root", "p:*")

    // console.log("Model", "Root role installed: " + JSON.stringify(rootUser))

    rootUser = await UserModel.create({ username: "root" })

    const userIdentify: UserIdentity = await UserIdentity.create({
        user_id: rootUser.id,
        identity_type: IdentityType.PASSWORD,
        identifier: rootUser.username,
        credential: hexPassword("e10adc3949ba59abbe56e057f20f883e")
    })

    await UserRole.create({
        user_id: userIdentify.id,
        role_id: adminRole.id
    })
    // await eller.addRoleForUser(String(rootUser.id), "r:root")

    console.log("Model", "Admin user installed: " + JSON.stringify(rootUser))

    // TODO ADD GUEST GROUP && DEFAULT GROUP

}

export async function createRole({ name, desc, permissions }) {

    const role = await RoleModel.create({
        name,
        desc
    })

    const pendingList = []

    if( permissions instanceof Array ) {

        permissions.forEach(per => pendingList.push(Promise.resolve(RolePer.create({
            per_id: per,
            role_id: role.id
        }))))

        return Promise.all(pendingList)

    } return RolePer.create({
        per_id: permissions,
        role_id: role.id
    })

}

export async function getUserRoles(id: number) {
    const res: UserModel = await UserModel.findOne({
                where: {
                    id
                },
                include: [RoleModel]
            }
        )

    // console.log("@Return: " + JSON.stringify(res))
    return res.roles || []
}

export async function getRolePerList(id: number): Promise<Array<PermissionModel>> {
    const perIdList: Array<RolePer> = await RolePer.findAll({
        where: {
            role_id: id
        }
    })

    const conditionList: Array<number> = []

    perIdList.forEach(rolePer => conditionList.push(rolePer.per_id))

    // console.log("Role pers: " + JSON.stringify(perList))

    return PermissionModel.findAll({
        where: {
            id: {
                [Op.or]: conditionList
            }
        }
    })
}

export async function getUserPermissions(id: number) {
    const roles = await getUserRoles(id)

    // TODO PROMISE ALL

    const perList: PermissionModel[] = []

    for ( const role of roles ) {
        perList.push(...(await getRolePerList(role.id)))
    }

    return perList
}

export async function getAllPermissions() {
    return PermissionModel.findAndCountAll()
}

export async function getAllRoles() {
    return RoleModel.findAndCountAll()
}

export async function getUserEller(id: number) {
    const roles = await getUserRoles(id)

    // TODO PROMISE ALL

    const perList: PermissionModel[] = []

    for ( const role of roles ) {
        perList.push(...(await getRolePerList(role.id)))
    }

    return {
        permissions: perList,
        roles
    }
}


export default {}
