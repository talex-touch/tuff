import channelApi, { registerLifeHandler, registerProtocol, LIFE_HANDLER_CONNECTION, LIFE_HANDLER_DISCONNECTION } from './../../extension/socket/socket'
import { config, jwt } from 'lin-mizar'

const rooms = {}
let defaultRoom

function addMemberToRoom(member, roomName, opts) {
  const room = rooms[roomName]
  if( !room ) {
    // throw new Error("Room not found.")
    opts?.notFoundRoom()
    return false;
  }
  if( room === member.room ) {
    opts?.repeatJoin()
    return false
  }
  let msg
  const msgFunc = (tMsg) => {
    msg = tMsg
  }
  if( room && !room?.onBeforeJoin(member, opts.apply(), msgFunc) ) {
    opts?.roomNotAllow(msg)
    return false
  }

  delMemberAnyRoom(member)

  member.room = room
  member.reply = (data) => {
    member.socket.sendRoomMsg(roomName, data)
  }

  room.children.push(member)
  room?.onJoined(member)
  opts?.success()
  return true
}

// 将用户从任何房间中移除
function delMemberAnyRoom(member) {
  if( member.room ) {
    member.room.onExited && member.room.onExited()
    const index = [ ...member.room.children ].indexOf(member)
    member.room.children = [ ...member.room.children ].splice(index, 1)
  }
}

async function processRoomMsg(member, roomName, data) {
  const preRooms = []

  Object.keys(rooms).forEach(room => {
    if( room.startsWith(roomName + '/') ) {
      preRooms.push(Promise.resolve(rooms[room].handler({ room: member.room, member, data})))
    }

  })

  await Promise.all(preRooms)

}

export function registerRoom(name, opts) {
  if( rooms[name] ) throw new Error('Already exist.')

  if( opts.default ) {

    rooms[name] = defaultRoom = {
      name, default: true, children: [],
      ...opts
    }

  }

  rooms[name] = {
    name, children: [],
    ...opts
  }

}

registerLifeHandler(LIFE_HANDLER_CONNECTION, (ws) => {

  ws.socket.sendRoomMsg = ws.sendRoomMsg = (roomName, data) => {

    ws.send(JSON.stringify({
      protocol: 't-room',
      version: 1,
      channel: roomName, data
    }))

  }

  ws.socket.member = ws.member = {
    ws: ws,
    room: null
  }

  ws.socket.sendActionMsg = ws.sendActionMsg = (action, room, status, data) => {

    if( data.code ) {

      ws.send(JSON.stringify({
        protocol: 't-room-action',
        version: 1,
        channel: action, data: {
          status, ...data,
          room
        }
      }))

    } else ws.send(JSON.stringify({
      protocol: 't-room-action',
      version: 1,
      channel: action, data: {
        status,
        room,
        apply: data
      }
    }))

  }

})

registerLifeHandler(LIFE_HANDLER_DISCONNECTION, (socket) => {

  const member = socket.member

  member?.room?.onExited && member?.room?.onExited()

  delMemberAnyRoom(member)

})

registerProtocol('t-room', {
  async invoke({ socket, info }) {
    const { channel, data } = info

    socket.member.reply = (data) => {
      socket.sendRoomMsg(channel, data)
    }

    await processRoomMsg( socket.member, channel, data )
  }
})

registerProtocol('t-room-action', {
  async invoke({ socket, info }) {
    const { channel, data } = info

    if( !data.room || !data.apply ) return socket.sendActionMsg(channel, 'undefined', false, 'error data format')
    const room = data.room
    const apply = data.apply

    if( channel.toLowerCase() === 'join' ) {

      socket.member.socket = socket

      addMemberToRoom(socket.member, room, {
        apply() {
          return apply
        },
        success() {
          socket.sendActionMsg(channel, room, true, data)
        },
        repeatJoin() {
          socket.sendActionMsg(channel, room, false, 'repeat join')
        },
        roomNotAllow() {
          socket.sendActionMsg(channel, room, false, 'access denied')
        },
        notFoundRoom() {
          socket.sendActionMsg(channel, room, false, 'could not join this room, because it\'s undefined')
        }
      })

    } else if( channel.toLowerCase() === 'exit' ) {
      const memberRoom = socket.member?.room
      if( !memberRoom ) return  socket.sendActionMsg(channel, room, false, 'has not rom')

      if(memberRoom.name !== room) return  socket.sendActionMsg(channel, room, false, 'not in it')

      memberRoom?.onBeforeExit && memberRoom?.onBeforeExit()

      delMemberAnyRoom(socket.member)

      memberRoom?.onExited && memberRoom?.onExited()

    }

  }
})

registerRoom('default', {
  onBeforeJoin(socket, apply, func) {
    // 可以随时随地加入默认房间
    // 是否开启 websocket 的鉴权拦截器
    if (config.getItem('socket.intercept')) {
      if( !apply.token ) return false

      try {
        const { identity } = jwt.verifyToken(apply.token)
        socket.identity = identity

      } catch (error) {
        console.log("[Room] 来自 " + socket._host + " 的请求连接 default-room 失败: " + error.message)

        return false
      }

    }
    return true;
  },
  onJoined(member) {
    member.reply('Welcome to room default !')
  },
  handler({ member, data}) {
    member.reply('Hello: ' + data)
  }
})
