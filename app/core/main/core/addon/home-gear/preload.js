"use strict";function i(e=["complete","interactive"]){return new Promise(t=>{e.includes(document.readyState)?t(!0):document.addEventListener("readystatechange",()=>{e.includes(document.readyState)&&t(!0)})})}const o={append(e,t){if(!Array.from(e.children).find(n=>n===t))return e.appendChild(t)},remove(e,t){if(Array.from(e.children).find(n=>n===t))return e.removeChild(t)}};function d(){const e="loaders-css__square-spin",t=`
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${e} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9;
}
    `,n=document.createElement("style"),a=document.createElement("div");return n.id="app-loading-style",n.innerHTML=t,a.className="app-loading-wrap",a.innerHTML=`<div class="${e}"><div></div></div>`,{appendLoading(){o.append(document.head,n),o.append(document.body,a)},removeLoading(){o.remove(document.head,n),o.remove(document.body,a)}}}const{appendLoading:s,removeLoading:r}=d();i().then(s);window.onmessage=e=>{e.data.payload==="removeLoading"&&r()};setTimeout(r,4999);const p={};module.exports=p;
