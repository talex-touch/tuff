import { Sequelize } from 'sequelize-typescript';
import cls from 'cls-hooked'
import setting from './../../config/setting.js'

export default function createSequelize() {

  const namespace = cls.createNamespace('talex_sequelize')

  Sequelize.useCLS(namespace)

  const { database, username, password } = setting.database.mysql

  /**
   * 全局的 Sequelize 实例
   */
  global.sequelize = new Sequelize(database, username, password, {
    dialect: "mysql",
    ...setting.database.mysql
  });

  console.log("DataBase", "Mysql server connected!")

  // global.sequelize.sync({
  //   force: false,
  //   // alter: true
  // });

  // sequelize.afterSync(installDefaultData)

  return global.sequelize

};
