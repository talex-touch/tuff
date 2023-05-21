import Koa from 'koa';
import KoaBodyParser from 'koa-bodyparser';
import cors from '@koa/cors';
import mount from 'koa-mount';
import serve from 'koa-static';
import webSocket from './lib/websocket/socket.js';
import { IEndsSetting } from './types/setting-config.js'
import { importsAllApis } from './api/api-manager.js'
import { importsAllMiddleWares } from './middleware/middleware-manager.js'
import { importsAllExtensions } from './extension/extension-manager.js'
import { errorHandler, networkHandler } from './middleware/network/network.js'
import chalk from 'chalk'

/**
 * 初始化Koa实例
 */
async function createApp (setting: IEndsSetting) {
  const app = new Koa();

  // applies
  app.use(errorHandler)
  // app.use(KoaBodyParser());
  app.use(cors());
  console.log("KoaMount", "Path for: " + chalk.grey(setting.dir.static))
  app.use(mount("/", serve(setting.dir.public)));

  await importsAllExtensions(app)
  await importsAllMiddleWares(app)

  app.use(networkHandler)
  await importsAllApis(app)

  // public
  app.use(serve(setting.dir.public));

  return webSocket.initApp(app);
  //   return app
}

export default createApp
