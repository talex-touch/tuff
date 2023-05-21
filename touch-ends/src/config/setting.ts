import { IEndsSetting } from "../types/setting-config.js";

export default {
  domain: "api.pvpin.net",
  port: 9981,
  dir: {
    public: "../public",
    static: "../static",
    logs: "../logs",
    data: "../data",
    mail: "../email"
  },
  token: {
    accessExp: 60 * 60, // 1h 单位秒
    refreshExp: 60 * 60 * 24 * 30,
    // refreshExp 设置refresh_token的过期时间，默认一个月
    secret: '\x88W\x88W\xf09\x91\x07\x98\x89\x87\x96\xa0A\xc68\xf9\xecJJU\x17\xc5V\xbe\x8b\xef\xd7\xd8\xd3\xe6\x95*4',
    salt: "n{;3uG^q~)s;afNFv"
  },
  page: {
    size: 15,
  },
  database: {
    mysql: {
      host: __development ? '124.223.71.129' : 'localhost',
      port: 5002,
      database: 'talex_wiki_main',
      username: 'root',
      password: '9712985574a8250d',
      logging: false,
      timezone: '+08:00',
      define: {
        timestamps: true,
        paranoid: true,
        underscored: true,
        freezeTableName: true,
        charset: 'utf8mb4'
      }
    },
    // casbin: {
    //   database: 'talex_wiki_cas',
    //   username: 'talex_wiki_cas',
    //   password: 'RzdnxXJcKWejDtCZ'
    // }
  },
  file: {
    dir: 'assets',
    singleLimit: 1024 * 1024 * 2,
    totalLimit: 1024 * 1024 * 20,
    exclude: []
  },
  captcha: {
    dir: '../captcha',
    offset: -5
  },
  email: {
    126: {
      from: '"TalexWiki" <TalexWiki@126.com>',
      port: 465,
      auth: {
        user: "talexwiki@126.com",
        pass: "JNLBFYTUPQWOGBXT"
      }
    }
  }
} as IEndsSetting
