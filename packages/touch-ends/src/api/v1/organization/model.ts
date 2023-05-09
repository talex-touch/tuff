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
import { UserModel } from '../../cms/user/model.js'
import { OrgActionType, OrgMemberStatus } from '../../../lib/util/enums.js'

export interface IOrganization {
    id?: number
    name: string
    owner_id: number
    owner: UserModel
    avatar?: string
    summary?: string
    members?: OrgMemberModel[]
}
@Table({ tableName: "organizations" })
export class OrganizationModel extends Model<IOrganization> {

    @PrimaryKey
    @AutoIncrement
    @Comment("组织UID")
    @Column(DataTypes.INTEGER)
    id: number

    @Comment("组织名称")
    @Column(DataTypes.STRING(32))
    name: string

    @BelongsTo(() => UserModel)
    owner: UserModel

    @ForeignKey(() => UserModel)
    @Comment("拥有者ID")
    @Column(DataTypes.INTEGER)
    owner_id: number

    @Comment("组织头像")
    @Column(DataTypes.STRING(256))
    avatar: string

    @Comment("组织简介")
    @Column(DataTypes.STRING(256))
    summary?: string

    @HasMany(() => OrgMemberModel)
    members?: OrgMemberModel[]

    static async getUserOrgAccounts(id: number) {

        return OrganizationModel.findAndCountAll({
            where: {
                owner_id: id
            }
        })

    }

}

export interface IOrgMember {
    id?: number
    org_id: number
    organization: OrganizationModel
    member_id: number
    user: UserModel
    status: OrgMemberStatus
}
@Table({ tableName: "org_members" })
export class OrgMemberModel extends Model<IOrgMember> {

    @PrimaryKey
    @AutoIncrement
    @Comment("OrgMember ID")
    @Column(DataTypes.INTEGER)
    id: number

    @BelongsTo(() => OrganizationModel)
    organization: OrganizationModel

    @ForeignKey(() => OrganizationModel)
    @Comment("所属组织ID")
    @Column(DataTypes.INTEGER)
    org_id: number

    @ForeignKey(() => UserModel)
    @Comment("维基成员的UID")
    @Column(DataTypes.INTEGER)
    member_id: number

    @BelongsTo(() => UserModel)
    user: UserModel

    // 用户状态
    @Comment("用户状态")
    @Column(DataTypes.INTEGER)
    status: OrgMemberStatus

}

export interface IOrgLog {
    id?: number
    org_id: number
    organization: OrganizationModel
    member_id: number
    user: UserModel
    action: OrgActionType
    content: string
}
@Table({ tableName: "org_logs" })
export class OrgLog extends Model<IOrgLog> {

    @PrimaryKey
    @AutoIncrement
    @Comment("OrgLog ID")
    @Column(DataTypes.INTEGER)
    id: number

    @BelongsTo(() => OrganizationModel)
    organization: OrganizationModel

    @ForeignKey(() => OrganizationModel)
    @Comment("所属组织ID")
    @Column(DataTypes.INTEGER)
    org_id: number

    @ForeignKey(() => UserModel)
    @Comment("操作对象的UID")
    @Column(DataTypes.INTEGER)
    member_id: number

    @BelongsTo(() => UserModel)
    user: UserModel

    @Comment("操作类型")
    @Column(DataTypes.INTEGER)
    action: OrgActionType

    @Comment("操作内容")
    @Column(DataTypes.STRING(256))
    content: string

}

sequelize.addModels([OrganizationModel, OrgMemberModel, OrgLog])

await sequelize.sync({
    force: false,
    alter: true
})
