import {
    AutoIncrement,
    BelongsTo, BelongsToMany,
    Column,
    Comment,
    ForeignKey,
    HasMany,
    Model,
    PrimaryKey,
    Table
} from 'sequelize-typescript'
import { DataTypes } from 'sequelize'
import { UserModel } from '../user/model.js'

export interface IRole {
    id?: number
    name: string
    desc: string
    parent: number
}
@Table({ tableName: "roles" })
export class RoleModel extends Model<IRole> {

    @PrimaryKey
    @AutoIncrement
    @Comment("角色的UID")
    @Column(DataTypes.INTEGER)
    id: number

    @Comment("角色名称")
    @Column(DataTypes.STRING(8))
    name: string

    @Comment("角色描述")
    @Column(DataTypes.STRING(24))
    desc: string

    @Comment("父角色的UID")
    @Column(DataTypes.INTEGER)
    parent: number

    // @BelongsToMany(() => UserModel, () => UserRole)
    // users: UserModel[]

    @BelongsToMany(() => PermissionModel, () => RolePer)
    permissions: PermissionModel[]

}

export interface IUserRole {
    id?: number
    user_id: number
    role_id: number
}
@Table({ tableName: "user_roles" })
export class UserRole extends Model<IUserRole> {

    @PrimaryKey
    @AutoIncrement
    @Comment("记录UID")
    @Column(DataTypes.INTEGER)
    id: number

    @ForeignKey(() => UserModel)
    @Comment("用户的UID")
    @Column(DataTypes.INTEGER)
    user_id: number

    @ForeignKey(() => RoleModel)
    @Comment("角色的UID")
    @Column(DataTypes.INTEGER)
    role_id: number

}

export interface IPermission {
    id?: number
    name?: string
    module?: string
}
@Table({ tableName: "permissions" })
export class PermissionModel extends Model<IPermission> {

    @PrimaryKey
    @AutoIncrement
    @Comment("权限的UID")
    @Column(DataTypes.INTEGER)
    id: number

    @Comment("权限名称")
    @Column(DataTypes.STRING(16))
    name: string

    @Comment("权限所属模块")
    @Column(DataTypes.STRING(24))
    module: string

    @BelongsToMany(() => RoleModel, () => RolePer)
    roles: RoleModel[]
}

export interface IRolePer {
    id?: number
    per_id: number
    role_id: number
}
@Table({ tableName: "role_permissions", timestamps: false })
export class RolePer extends Model<IRolePer> {

    @PrimaryKey
    @AutoIncrement
    @Comment("记录UID")
    @Column(DataTypes.INTEGER)
    id: number

    @ForeignKey(() => PermissionModel)
    @Comment("权限的UID")
    @Column(DataTypes.INTEGER)
    per_id: number

    @ForeignKey(() => RoleModel)
    @Comment("角色的UID")
    @Column(DataTypes.INTEGER)
    role_id: number

}

sequelize.addModels([RoleModel, UserRole, PermissionModel, RolePer])

await sequelize.sync({
    force: false,
    alter: true
})
