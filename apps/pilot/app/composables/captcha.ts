export enum CaptchaSceneId {
  Auth = 'wjwwx0wr',
}

export const CaptchaConstantConfig = {
  prefix: '1fi1ua',
  mode: 'popup',
}

export interface CaptchaCallback {
  captchaVerifyCallback: (query: string) => any
  onBizResultCallback: (result: boolean) => void
}

declare global {
  interface Window {
    initAliyunCaptcha: Function
  }
}

export function newCaptcha(scene: CaptchaSceneId, elementQuery: string, triggerQuery: string, callback: CaptchaCallback) {
  // if (!window.initAliyunCaptcha) {
  //   console.log('waiting')

  //   setTimeout(() => newCaptcha(scene, elementQuery, triggerQuery, callback), 200)
  //   return
  // }

  // let captcha: any

  // function getInstance(instance: any) {
  //   captcha = instance
  // }

  //   async function captchaVerifyCallback(captchaVerifyParam: any) {
  //     // 1.向后端发起业务请求，获取验证码验证结果和业务结果
  //     const result = await xxxx(`${EndUrl}/auth/captcha/validate`, {
  //       param: captchaVerifyParam, // 验证码参数
  //       yourBizParam... // 业务参数
  //     });

  //     // 2.构造标准返回参数
  //     const verifyResult = {
  //       captchaResult: result.captchaVerifyResult, // 验证码验证是否通过，boolean类型，必选
  //       bizResult: 从result获取您的业务验证结果, // 业务验证是否通过，boolean类型，可选；若为无业务验证结果的场景，bizResult可以为空
  //     };
  //     return verifyResult;
  //   }
  // }

  // window.initAliyunCaptcha({
  //   SceneId: scene,
  //   element: elementQuery,
  //   button: triggerQuery,
  //   captchaVerifyCallback: callback.captchaVerifyCallback, // 业务请求(带验证码校验)回调函数，无需修改
  //   onBizResultCallback: callback.onBizResultCallback, // 业务请求结果回调函数，无需修改
  //   getInstance,
  //   slideStyle: {
  //     width: 360,
  //     height: 40,
  //   },
  //   language: 'cn',
  //   region: 'cn',
  //   ...CaptchaConstantConfig,
  // })
}

//   /**
//  * @name captchaVerifyCallback
//  * @function
//  * 请求参数：由验证码脚本回调的验证参数，不需要做任何处理，直接传给服务端即可
//  * @params {string} captchaVerifyParam
//  * 返回参数：字段名固定，captchaResult为必选；如无业务验证场景时，bizResult为可选
//  * @returns {{captchaResult: boolean, bizResult?: boolean|undefined}}
//  */
//   async function captchaVerifyCallback(captchaVerifyParam: any) {
//     // 1.向后端发起业务请求，获取验证码验证结果和业务结果
//     const result = await xxxx('http://您的业务请求地址', {
//       captchaVerifyParam: captchaVerifyParam, // 验证码参数
//       yourBizParam... // 业务参数
//     });

//     // 2.构造标准返回参数
//     const verifyResult = {
//       captchaResult: result.captchaVerifyResult, // 验证码验证是否通过，boolean类型，必选
//       bizResult: 从result获取您的业务验证结果, // 业务验证是否通过，boolean类型，可选；若为无业务验证结果的场景，bizResult可以为空
//     };
//     return verifyResult;
//   }
// }

// // 业务请求验证结果回调函数
// function onBizResultCallback(bizResult) {
//   if (bizResult === true) {
//     // 如果业务验证通过，跳转到对应页面。此处以跳转到https://www.aliyun.com/页面为例
//     window.location.href = 'https://www.aliyun.com/';
//   } else {
//     // 如果业务验证不通过，给出不通过提示。此处不通过提示为业务验证不通过！
//     alert('业务验证不通过！');
//   }
// }
