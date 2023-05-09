import { TValidator } from '../../../extension/validator/index.js'
import { IsNotEmpty, Length, IsEmail, MinLength, Min, Max } from 'class-validator'

export class HasUserValidator extends TValidator {
    @IsNotEmpty()
    user: string
}

export class RegisterCodeValidator extends TValidator {

    @IsEmail()
    email?: string

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

export class RegisterVerifyValidator extends TValidator {

    @Min(100000)
    @Max(999999)
    code?: number

    @IsNotEmpty()
    hex?: string
}

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

export class ChangePasswordValidator extends TValidator {

    @MinLength(8, {
        message: "原始密码长度应该至少为 8"
    })
    original_password?: string

    @MinLength(8, {
        message: "修改密码长度应该至少为 8"
    })
    changed_password?: string

}

export class SearchUserValidator extends TValidator {

    @IsNotEmpty()
    keyword: string

    tags?:string

}

export class UpdateInfoValidator extends TValidator {

    @IsNotEmpty()
    cover?: string

}

export class UpdateThemeOptionValidator extends TValidator {

    @IsNotEmpty()
    name: string

    @IsNotEmpty()
    adapt: string

}

export class GetUserOptionValidator extends TValidator {

    @IsNotEmpty()
    key: string

}

export class UserAvatarGetValidator extends TValidator {

    @IsNotEmpty({ message: "id must not be null" })
    id: number

}

export class UserMsgGetValidator extends TValidator {

    @IsNotEmpty({ message: "page must not be null" })
    page?: number

    allowRead: boolean

}
