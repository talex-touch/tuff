import { TValidator } from '../../../extension/validator/index.js'
import { Length, Matches, Min, MinLength, NotEquals } from 'class-validator'

export class LoginValidator extends TValidator {

    @Length(3, 18, {
        message: "用户名长度应该为 3~18 个字符之间"
    })
    username?: string

    // @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[^]{6,32}$/, {
    //     message: "密码至少6-32个字符，至少1个大写字母，1个小写字母和1个数字"
    // })
    @MinLength(8, {
        message: "密码长度应该至少为 8"
    })
    password?: string

}

export class UpdateRoleValidator extends TValidator {

    @NotEquals(1, {
        message: "不可以修改 admin 角色信息"
    })
    id: number

    @NotEquals("admin", {
        message: "不可以将名称修改为 admin"
    })
    @Length(2, 8, {
        message: "角色名称长度应该为 2~8 个字符之间"
    })
    name: string

    @Length(0, 24, {
        message: "角色描述长度应该为 0~24 个字符之间"
    })
    desc: string

}

export class DeleteRoleValidator extends TValidator {

    @Min(2, {
        message: "角色受到保护，无法被删除"
    })
    id: number

}
