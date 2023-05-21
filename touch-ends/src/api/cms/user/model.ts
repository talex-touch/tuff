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
import { AuthFailedError } from '../../../error/user-error.js';
import { hexPassword } from '../../../lib/util/common.js'
import { DataTypes } from 'sequelize'
import { IdentityType, MessageStatus, MessageType } from '../../../lib/util/enums.js'
import { RoleModel, UserRole } from '../eller/model.js'

export interface IUserIdentity {
    user_id: number
    identity_type: IdentityType
    identifier: string
    credential: string
}
@Table({ tableName: "user_identity" })
export class UserIdentity extends Model<IUserIdentity> {

    @PrimaryKey
    @AutoIncrement
    @Comment("用户IdentityID")
    @Column(DataTypes.INTEGER)
    id: number

    @Comment("用户UID")
    @Column(DataTypes.INTEGER)
    user_id: string

    @Comment("登录类型（手机号 邮箱 用户名）或第三方应用名称（微信 微博等）")
    @Column(DataTypes.STRING(32))
    identity_type: IdentityType

    @Comment("标识（手机号 邮箱 用户名或第三方应用的唯一标识）")
    @Column(DataTypes.STRING(128))
    identifier: string

    @Comment("密码凭证（站内的保存密码，站外的不保存或保存token）")
    @Column(DataTypes.STRING(128))
    credential: string

    // async checkPassword (username: string): Promise<any> {
    //     if (!this.credential || this.credential === '') {
    //         return false;
    //     }
    //     return UserIdentity.verify(username, this.credential);
    // }

    static async changePassword(user: number, original_password: string, change_password: string): Promise<boolean> {
        const userIdentity = await UserIdentity.findOne({
            where: {
                identity_type: IdentityType.PASSWORD,
                user_id: user
            }
        });
        if (!userIdentity) {
            throw new AuthFailedError("user identity not found");
        }
        if ( userIdentity.credential !== hexPassword(original_password) ) {
            throw new AuthFailedError("password not match");
        }

        userIdentity.credential = hexPassword(change_password)
        return true
    }

    static async verify (username: string, password: string): Promise<UserModel> {
        const userIdentity = await UserIdentity.findOne({
            where: {
                identity_type: IdentityType.PASSWORD,
                identifier: username
            }
        });
        if (!userIdentity) {
            throw new AuthFailedError("user identity not found");
        }
        if ( userIdentity.credential !== hexPassword(password) ) {
            throw new AuthFailedError("password not match");
        }

        return await UserModel.findOne({
            where: {
                id: userIdentity.user_id
            }
        })
    }

    static hexPassword (originalPassword): string {

        return hexPassword(originalPassword)

    }

}

export interface IUser {
    id?: number
    username: string
    avatar?: string
    email?: string
    login_history?: LoginHistory[]
    options?: UserOptionModel[]
}
@Table({ tableName: "users" })
export class UserModel extends Model<IUser> {

    @PrimaryKey
    @AutoIncrement
    @Comment("用户UID")
    @Column(DataTypes.INTEGER)
    id: number

    @Comment("用户名称")
    @Column(DataTypes.STRING(32))
    username: string

    @Comment("用户头像")
    @Column(DataTypes.STRING(256))
    avatar: string

    @Comment("用户邮箱")
    @Column(DataTypes.STRING(48))
    email?: string

    @HasMany(() => LoginHistory)
    login_history?: LoginHistory[]

    @HasMany(() => UserOptionModel)
    options?: UserOptionModel[]

    @BelongsToMany(() => RoleModel, () => UserRole)
    roles: RoleModel[]

}

export interface ILoginHistory {
    user_id: number
    identity_type: IdentityType
    locale: string
    device: string
    ip: string
}
@Table({ tableName: "login_history" } )
export class LoginHistory extends Model<ILoginHistory> {

    @PrimaryKey
    @AutoIncrement
    @Comment("用户IdentityID")
    @Column(DataTypes.INTEGER)
    id: number

    @BelongsTo(() => UserModel)
    user: UserModel

    @ForeignKey(() => UserModel)
    @Comment("用户UID")
    @Column(DataTypes.INTEGER)
    user_id: number

    @Comment("登录类型（手机号 邮箱 用户名）或第三方应用名称（微信 微博等）")
    @Column(DataTypes.STRING(32))
    identity_type: IdentityType

    @Comment("登录位置")
    @Column(DataTypes.STRING(32))
    locale: string

    @Comment("登录设备")
    @Column(DataTypes.STRING(128))
    device: string

    @Comment("登录IP")
    @Column(DataTypes.STRING(64))
    ip: string

}

export interface IUserOptions {
    id?: number
    user_id: number
    key: string
    value: string
    user: UserModel
}
@Table({ tableName: "user_options" })
export class UserOptionModel extends Model<IUserOptions> {

    @PrimaryKey
    @AutoIncrement
    @Comment("记录ID")
    @Column(DataTypes.INTEGER)
    id: number

    @ForeignKey(() => UserModel)
    @Comment("用户UID")
    @Column(DataTypes.INTEGER)
    user_id: number

    @Comment("用户属性头")
    @Column(DataTypes.STRING(256))
    key: string

    @Comment("用户属性值")
    @Column(DataTypes.STRING(256))
    value: string

    @BelongsTo(() => UserModel)
    user: UserModel

}

export interface IUserMsg {
    id?: number
    user_id: number
    user: UserModel
    sender_id: number
    sender: UserModel
    type: MessageType
    value: string
    status: MessageStatus
    extra: object
    extra_msg: string
}
@Table({ tableName: "user_msgs" })
export class UserMsgModel extends Model<IUserMsg> {

    @PrimaryKey
    @AutoIncrement
    @Comment("记录ID")
    @Column(DataTypes.INTEGER)
    id: number

    @ForeignKey(() => UserModel)
    @Comment("接收者用户UID")
    @Column(DataTypes.INTEGER)
    user_id: number

    @BelongsTo(() => UserModel, "user_id")
    user: UserModel

    @Comment("消息类型")
    @Column(DataTypes.INTEGER)
    type: MessageType

    @ForeignKey(() => UserModel)
    @Comment("消息发出者")
    @Column(DataTypes.INTEGER)
    sender_id: number

    @BelongsTo(() => UserModel, "sender_id")
    sender: UserModel

    @Comment("消息内容")
    @Column(DataTypes.STRING(256))
    value: string

    @Comment("消息状态")
    @Column(DataTypes.INTEGER)
    status: MessageStatus = MessageStatus.UNREAD

    @Comment("消息附加数据")
    @Column(DataTypes.TEXT)
    extra_msg: string

    extra: object

    extraBuild() {
        this.extra = this.extra_msg && JSON.parse(this.extra_msg)
    }



}

sequelize.addModels([UserModel, UserIdentity, LoginHistory, UserOptionModel, UserMsgModel])

await sequelize.sync({
    force: false,
    alter: true
})
