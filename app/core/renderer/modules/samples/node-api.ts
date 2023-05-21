import { touchChannel } from "@modules/channel/channel-core";

export function asyncMainProcessMessage(eventName: string, data: any) {
  console.warn(
    "[asyncMainProcessMessage] Some where are still use this and it is deprecated, use touchChannel.sendSync instead!"
  );
  return touchChannel.sendSync(eventName, data);
}

export function postMainProcessMessage(eventName: string, data: any = {}) {
  console.warn(
    "[postMainProcessMessage] Some where are still use this and it is deprecated, use touchChannel.send instead!"
  );
  return touchChannel.send(eventName, data);
}

export function registerTypeProcess(
  type: string,
  callback: (data: any) => any
) {
  console.warn(
    "[registerTypeProcess] Some where are still use this and it is deprecated, use touchChannel.regChannel instead!"
  );
  touchChannel.regChannel(type, callback);
}