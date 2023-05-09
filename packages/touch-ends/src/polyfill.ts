/// <reference path="types/talex-global.d.ts" />

import { fileURLToPath } from 'url'
import path from 'path'

import chalk from 'chalk'

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename)

global.__dirname = __dirname
global.__development = process.env.npm_lifecycle_event === 'dev'

global.sleep = (time: number): Promise<any> => {
    return new Promise((res) => setTimeout(res, time))
}

// Model polyfill
// Model.prototype.toJSON = function(): object {
//     // 浅拷贝从数据库获取到的数据
//     let data = clone(this['dataValues'])
//     // 删除指定字段
//     unset(data, 'updatedAt')
//     unset(data, 'deletedAt')
//     // 这个是自己再Model原型上定义的变量
//     // 用于控制我们再某次查询数据时想要排除的其他字段
//     // 类型为数组，数组的值便是想要排除的字段
//     // 例如user.exclude['a', 'b']，此次查询将会增加排除a,b字段
//     if(isArray(this['exclude'])) {
//         this['exclude'].forEach(value => {
//             unset(data, value)
//         })
//     }
//     return data;
// };

// modify prototype of console
;(() => {

    Date.prototype._format = function (fmt) {
        const o = {
            "M+": this.getMonth() + 1, //月份
            "d+": this.getDate(), //日
            "h+": this.getHours(), //小时
            "m+": this.getMinutes(), //分
            "s+": this.getSeconds(), //秒
            "q+": Math.floor((this.getMonth() + 3) / 3), //季度
            "S": this.getMilliseconds() //毫秒
        }
        if (/(y+)/.test(fmt)) fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
        for (var k in o)
            if (new RegExp("(" + k + ")").test(fmt)) fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
        return fmt;
    }

    console.oLog = console.log

    console.log = (msg, extra) => {

        const time = new Date()._format("hh:mm:ss");

        if( !extra )
            console.oLog(chalk.hex('#664b60')(`[${time}] `) + chalk.reset(msg))
        else
            console.oLog(chalk.hex('#664b60')(`[${time}] `) + chalk.hex('#0192c8')(`[${msg}]`) + ' ' + chalk.reset(extra))

    }

    console.oWarn = console.warn

    console.warn = (msg, extra) => {

        const time = new Date()._format("hh:mm:ss");

        if( !extra )
            console.oWarn(chalk.hex('#905c10')(`[${time}] `) + chalk.hex('#ffcc00')(msg))
        else
            console.oWarn(chalk.hex('#905c10')(`[${time}] `) + chalk.hex('#FFA500')(`[${msg}]`) + ' ' + chalk.hex('#ffcc00')(extra))
    }

    console.oError = console.error

    console.error = (msg, extra) => {

        const time = new Date()._format("hh:mm:ss");

        if( !extra )
            console.oError(chalk.hex('#992726')(`[${time}] `) + chalk.hex('#ef5350')(msg))
        else
            console.oError(chalk.hex('#992726')(`[${time}] `) + chalk.hex('#a4221c')(`[${msg}]`) + ' ' + chalk.hex('#ef5350')(extra))

    }

})()
