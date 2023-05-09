interface IEndsSetting {
    // 域
    domain: string
    // 端口
    port: number

    // 相关目录
    dir: {
        public: string,
        static: string,
        logs: string,
        data: string,
        mail: string
    }

    // token
    token: {
        accessExp: number,
        refreshExp: number,
        secret: string,
        salt: string
    }

    // 传递页面 list 设置
    page: {
        // 每页大小
        size: number
    }

    // 数据库设置
    database: {
        mysql: {
            host: string,
            port: number,
            database: string,
            username: string,
            password: string,
            logging: boolean,
            timezone: string,
            define: {
                charset: string
            }
        },
        // extends mysql (casbin adapter for sequelize)
        // casbin: {
        //     database: string,
        //     username: string,
        //     password: string
        // }
    }

    file: {
        dir: string,
        singleLimit: number,
        totalLimit: number,

    }

    captcha: {
        dir: string,
        offset: number
    }

    email: {
        126: {
            from: string,
            port: number,
            auth: {
                user: string,
                pass: string
            }
        }
    }

}

export { IEndsSetting }
