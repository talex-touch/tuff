import http, { Server } from 'http'
import Ws, { WebSocketServer } from 'ws'
import { TalexSocket } from '../../types/socket-connection.js'
import INetworkLife = TalexSocket.INetworkLife
import ITWebSocket = TalexSocket.ITWebSocket
import Application from 'koa'
import ITProtocol = TalexSocket.ITProtocol
import IProtocolHandler = TalexSocket.IProtocolHandler
import IWebsocketChannel = TalexSocket.IWebsocketChannel
import chalk from 'chalk'

const USER_KEY = Symbol('user')
const INTERCEPTORS = Symbol('WebSocket#interceptors')
const HANDLE_CLOSE = Symbol('WebSocket#close')
const HANDLE_ERROR = Symbol('WebSocket#error')
const HANDLE_MESSAGE = Symbol('WebSocket#message')

class NetworkLife implements INetworkLife {
  lifeHandlers: Map<TalexSocket.INetworkLifeSymbol, TalexSocket.INetworkLifeHandlers> = new Map()

  emitsLife(type: TalexSocket.INetworkLifeSymbol, ...data: any) {
    this.lifeHandlers.get(type).forEach(handler => handler(...data))
  }

  registerLifeHandler(type: TalexSocket.INetworkLifeSymbol, handler: Function) {
    const handlers = this.lifeHandlers.get(type) || []
    handlers.push(handler)
    this.lifeHandlers.set(type, handlers)
  }

}
export const networkLife = new NetworkLife()

class WebSocket implements ITWebSocket {

  app: Application
  ws: WebSocketServer
  messageFunc: Function
  sessions: Set<any> = new Set<any>()

  init (): Server {
    const server = http.createServer(this.app.callback())
    this.ws = new Ws.Server({
      path: "/",
      noServer: true
    })

    server.on('upgrade', this[INTERCEPTORS].bind(this))

    this.ws.on('connection', socket => {
      socket.on('close', this[HANDLE_CLOSE].bind(this))
      socket.on('error', this[HANDLE_ERROR].bind(this))
      socket.on('message', (res) => this.messageFunc(socket, res))
    })

    return server
  }

  onMessage(func) {
    this.messageFunc = func
  }

  [INTERCEPTORS] (request, socket, head) {

    this.ws.handleUpgrade(request, socket, head, ws => {

      this.sessions.add(ws)
      this.ws.emit('connection', ws, request)

      socket.ws = ws

      networkLife.emitsLife('LifeHandler#Connection', ws)
      console.log("WebSocket", "来自 " + socket._host + " 的请求连接成功!")
    })

  }

  [HANDLE_CLOSE] () {
    for (const session of this.sessions) {
      if (session.readyState === Ws.CLOSED) {
        networkLife.emitsLife('LifeHandler#DisConnection', session)
        this.sessions.delete(session)
      }
    }
  }

  [HANDLE_ERROR] (session, error) {
    console.log(error)
  }

  /**
   * 广播
   *
   * @param {string} message 消息
   */
  broadCast (message) {
    this.sessions.forEach(session => {
      if (session.readyState === Ws.OPEN) {
        session.send(message)
      }
    })
  }

  /**
   * 获取所有会话
   */
  getSessions () {
    return this.sessions
  }

  /**
   * 获得当前连接数
   */
  getConnectionCount () {
    return this.sessions.size
  }

  initApp (app): Server {
    this.app = app
    this.app.context.websocket = this

    return this.init()
  }
}
export const webSocket = new WebSocket()

class NetworkProtocol implements ITProtocol {

  protocolHandlers: Map<string, TalexSocket.IProtocolHandler> = new Map()

  registerProtocol(protocol: string, opts: IProtocolHandler) {
    if( this.protocolHandlers[protocol] ) {
      throw new Error('Already exist.')
    }
    this.protocolHandlers[protocol] = opts
    console.log("WebSocket#Protocol", "Register protocol: " + chalk.grey(protocol))
  }
}
export const networkProtocol = new NetworkProtocol()

class WebSocketChannel implements IWebsocketChannel {

  app: Application
  websocket: ITWebSocket = webSocket

  initApp (app): Server {
    this.app = app

    this.websocket.messageFunc = this.messageProcess

    networkProtocol.registerProtocol('t-ws', ( { socket, info }) => {
      this.channelProgress(socket, info)
    })

    networkLife.registerLifeHandler('LifeHandler#Connection', (socket) => {

      socket.sendChannelMsg = (channel, data) => {

        socket.send(JSON.stringify({
          protocol: 't-ws',
          version: 1,
          channel, data
        }))

      }

    })

    return this.websocket.initApp(app)
  }

  messageProcess(socket, info) {
    try {
      const data = JSON.parse(String(info))
      if( !data.protocol || !data.channel || !data.version || !data.data ) {
        return socket.sendChannelMsg && socket.sendChannelMsg('error', 'invalid data format')
      }

      console.log("WebSocket", chalk.blue('->') + " ReqComing # " + data.protocol + "@" + data.version + " -> " + data.channel)
      const protocolHandler = networkProtocol.protocolHandlers.get(data.protocol)

      if( protocolHandler )
        protocolHandler({ socket, info: data })
      else {

        socket.sendChannelMsg('error', 'cannot find resolver for protocol: ' + data.protocol)

      }
      // socket.sendChannelMsg('join-room', 'Let you join room: default')
    } catch(e) {
      return socket.sendChannelMsg('error', 'invalid data: '+ e.message)
    }

  }

  channelProgress(ws, info) {

    Object.keys(this.channels).forEach(channel => {

      if( (channel + '/').startsWith(String(info.channel)) ) {

        this.channels[channel].invoke({ ws, info })

      }

    })

  }

  channels = {}

  registerChannel(channel, handler) {
    if( this.channels[channel + '/'] ) {
      throw new Error('Already exist.')
    }
    this.channels[channel + '/'] = handler

    return {
      broadcast(data) {

        webSocket.broadCast(JSON.stringify({
          protocol: 't-ws',
          version: 1,
          channel, data
        }))

      }
    }
  }

}

const channel = new WebSocketChannel()

export default channel
