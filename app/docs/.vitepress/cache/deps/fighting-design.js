import {
  Fragment,
  Teleport,
  Transition,
  __export,
  computed,
  createApp,
  createBaseVNode,
  createBlock,
  createCommentVNode,
  createElementBlock,
  createSlots,
  createTextVNode,
  createVNode,
  defineComponent,
  getCurrentInstance,
  h,
  inject,
  isRef,
  isVNode,
  nextTick,
  normalizeClass,
  normalizeStyle,
  onBeforeUnmount,
  onMounted,
  onUnmounted,
  openBlock,
  provide,
  reactive,
  ref,
  render,
  renderList,
  renderSlot,
  resolveComponent,
  resolveDynamicComponent,
  shallowRef,
  toDisplayString,
  toHandlerKey,
  toRef,
  toRefs,
  unref,
  useSlots,
  vModelCheckbox,
  vModelRadio,
  vShow,
  watch,
  watchEffect,
  withCtx,
  withDirectives,
  withKeys,
  withModifiers
} from "./chunk-VIOCOIKA.js";

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/index3.js
var index3_exports = {};
__export(index3_exports, {
  FAlert: () => a6,
  FAside: () => s10,
  FAvatar: () => i6,
  FBackTop: () => i7,
  FBadge: () => i9,
  FBox: () => a54,
  FBreadcrumb: () => i10,
  FBreadcrumbItem: () => i12,
  FButton: () => a10,
  FButtonGroup: () => p7,
  FCalendar: () => i14,
  FCard: () => i16,
  FCheckbox: () => a13,
  FCheckboxGroup: () => p9,
  FCloseBtn: () => s8,
  FCollapseAnimation: () => r21,
  FDatePicker: () => a45,
  FDialog: () => a14,
  FDivider: () => a15,
  FDrawer: () => i19,
  FDropdown: () => p23,
  FDropdownItem: () => p26,
  FEmpty: () => p10,
  FExpandCard: () => i21,
  FFightingGlobal: () => a51,
  FFooter: () => a16,
  FForm: () => a52,
  FFormItem: () => a53,
  FHeader: () => i22,
  FImage: () => i20,
  FImagePreview: () => a19,
  FInfiniteScrolling: () => n25,
  FInput: () => p19,
  FInputNumber: () => p28,
  FLayout: () => i31,
  FLink: () => a20,
  FList: () => s22,
  FListItem: () => s23,
  FMain: () => a21,
  FMenu: () => a47,
  FMenuItem: () => a48,
  FMenuItemGroup: () => p32,
  FMessage: () => a22,
  FNotification: () => a24,
  FNumberAnimate: () => a55,
  FOption: () => p25,
  FPageHeader: () => e6,
  FPagination: () => r26,
  FPopup: () => i18,
  FProgress: () => i36,
  FRadio: () => a26,
  FRadioGroup: () => a27,
  FRate: () => i37,
  FRipple: () => r19,
  FSelect: () => a40,
  FSkeleton: () => a29,
  FSlider: () => a50,
  FSpace: () => i38,
  FStickyCard: () => a31,
  FSubmenu: () => a49,
  FSvgIcon: () => a4,
  FSwap: () => i43,
  FSwitch: () => a32,
  FTable: () => i51,
  FTabs: () => i55,
  FTabsPane: () => i56,
  FTag: () => i39,
  FText: () => a28,
  FTextarea: () => i52,
  FTimePicker: () => a46,
  FToolbar: () => i24,
  FToolbarItem: () => i25,
  FTooltip: () => p17,
  FTree: () => a34,
  FTrigger: () => a39,
  FUpLoad: () => i47,
  FWatermark: () => i41
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_utils/is/index.js
var { toString: n } = Object.prototype;
var o = (t6, s44) => n.call(t6) === `[object ${s44}]`;
var r = (t6) => o(t6, "Date");
var e = (t6) => typeof t6 == "string";
var c = (t6) => typeof t6 == "number" && !isNaN(t6);
var i = (t6) => o(t6, "Boolean");
var a = (t6) => o(t6, "Object");
var b = Array.isArray;

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_utils/props/index.js
var u = (t6 = false) => ({
  type: Boolean,
  default: () => t6
});
var l = (t6) => ({
  type: Number,
  default: () => c(t6) ? t6 : null
});
var p = (t6, e9) => e9 ? {
  type: String,
  default: () => t6 || null,
  validator: e9
} : {
  type: String,
  default: () => t6 || null
};
var s = (t6) => ({
  type: [String, Number],
  default: () => t6 || null
});
var c2 = (t6 = null) => ({
  type: Object,
  default: () => t6
});
var i2 = (t6 = null) => ({
  type: Function,
  default: () => t6
});
var y = (t6) => ({
  type: Array,
  default: () => t6 || null
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_tokens/attrs/index.js
var n2 = ["large", "middle", "small", "mini"];
var e2 = ["default", "primary", "success", "danger", "warning", "info"];
var o2 = ["_blank", "_self", "_parent", "_top"];
var a2 = ["fill", "contain", "cover", "none", "scale-down"];

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/alert/src/index3.js
var m = {
  type: p(null, (n26) => e2.includes(n26)),
  fontSize: s(),
  titleSize: s(),
  bold: u(),
  center: u(),
  close: u(),
  simple: u(),
  title: p(),
  round: u(),
  background: p(),
  color: p(),
  titleColor: p(),
  fixed: u(),
  closeIcon: c2(),
  beforeIcon: c2(),
  alertList: y(),
  duration: l(),
  onClose: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/close-btn/src/index3.js
var s2 = {
  size: s(),
  round: u(),
  disabled: u(),
  color: p(),
  hoverColor: p(),
  icon: c2(),
  onClick: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/svg-icon/src/index3.js
var n3 = {
  icon: c2(),
  color: p(),
  size: s(),
  onClick: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_utils/utils/index.js
var i3 = (r32, t6 = 2) => c(r32) ? Number(r32.toFixed(t6)) : r32;
var p2 = (r32, t6) => {
  let e9;
  return (...n26) => {
    e9 && clearTimeout(e9), e9 = setTimeout(() => {
      r32(...n26);
    }, t6);
  };
};
var s3 = (r32) => r32 < 10 ? `0${r32}` : r32.toString();
var a3 = (r32, t6 = "px") => r32 ? e(r32) ? r32 : r32 + t6 : "";
var f = (r32) => r32 ? c(r32) ? r32 : Number.parseFloat(r32) || 0 : 0;
var b2 = (r32) => r32.replace(/([A-Z])/g, (t6, e9) => "-" + e9.toLowerCase());

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-props/index.js
var k = (c30) => ({
  filter: (e9) => {
    const t6 = reactive({});
    return e9.forEach((r32) => {
      e(r32) ? t6[r32] = toRef(c30, r32) : a(r32) && r32.callback && r32.callback() && (t6[r32.key] = toRef(c30, r32.key));
    }), t6;
  },
  interceptors: (e9, t6, r32 = null) => t6() ? toRef(c30, e9) : r32
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-run/index.js
var o3 = (e9, ...n26) => {
  e9 && e9(...n26);
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/loading/src/index3.js
var s4 = {
  visible: u(),
  text: p(),
  color: p(),
  fullscreen: u(),
  background: p(),
  icon: c2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_virtual/index.js
var s5 = (t6, e9) => {
  const o8 = t6.__vccOpts || t6;
  for (const [r32, c30] of e9)
    o8[r32] = c30;
  return o8;
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-loading-a/index.js
var c3 = {};
var n4 = {
  width: "32",
  height: "32",
  viewBox: "0 0 24 24"
};
var l2 = createBaseVNode("path", {
  fill: "currentColor",
  d: "M12 2a1 1 0 0 1 1 1v3a1 1 0 0 1-2 0V3a1 1 0 0 1 1-1zm0 15a1 1 0 0 1 1 1v3a1 1 0 0 1-2 0v-3a1 1 0 0 1 1-1zm10-5a1 1 0 0 1-1 1h-3a1 1 0 0 1 0-2h3a1 1 0 0 1 1 1zM7 12a1 1 0 0 1-1 1H3a1 1 0 0 1 0-2h3a1 1 0 0 1 1 1zm12.071 7.071a1 1 0 0 1-1.414 0l-2.121-2.121a1 1 0 0 1 1.414-1.414l2.121 2.12a1 1 0 0 1 0 1.415zM8.464 8.464a1 1 0 0 1-1.414 0l-2.12-2.12a1 1 0 0 1 1.414-1.415l2.12 2.121a1 1 0 0 1 0 1.414zM4.93 19.071a1 1 0 0 1 0-1.414l2.121-2.121a1 1 0 1 1 1.414 1.414l-2.12 2.121a1 1 0 0 1-1.415 0zM15.536 8.464a1 1 0 0 1 0-1.414l2.12-2.121a1 1 0 0 1 1.415 1.414L16.95 8.464a1 1 0 0 1-1.414 0z"
}, null, -1);
var r2 = [
  l2
];
function _(s44, i61) {
  return openBlock(), createElementBlock("svg", n4, r2);
}
var m2 = s5(c3, [["render", _]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/loading/src/index2.js
var h2 = {
  key: 0,
  class: "f-loading__title"
};
var v = defineComponent({
  name: "FLoading"
});
var w = defineComponent({
  ...v,
  props: s4,
  setup(l20) {
    const a56 = l20, { styles: c30, classes: m22 } = P(a56, "loading"), p36 = c30(["background", "color"]), d6 = m22(["fullscreen"], "f-loading");
    return (o8, z10) => o8.visible ? (openBlock(), createElementBlock("div", {
      key: 0,
      class: normalizeClass(unref(d6)),
      style: normalizeStyle(unref(p36))
    }, [
      createVNode(unref(a4), {
        size: 20,
        class: "f-loading__animation",
        icon: o8.icon
      }, {
        default: withCtx(() => [
          renderSlot(o8.$slots, "icon", {}, () => [
            createVNode(unref(m2))
          ])
        ]),
        _: 3
      }, 8, ["icon"]),
      o8.text ? (openBlock(), createElementBlock("span", h2, toDisplayString(o8.text), 1)) : createCommentVNode("", true)
    ], 6)) : createCommentVNode("", true);
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-tips/index.js
var n5 = reactive({});
var N = (c30) => {
  let d6 = 1;
  const m22 = (e9, t6) => !n5[e9] || !b(n5[e9]) ? -1 : n5[e9].findIndex((r32) => r32.id === t6), l20 = (e9, t6, r32) => {
    const s44 = m22(e9, t6);
    if (s44 === -1)
      return 0;
    const o8 = n5[e9] && n5[e9][r32 ? s44 + 1 : s44 - 1] || null;
    return o8 ? (o8.vm.exposeProxy || o8.vm.exposed).bottom : 0;
  }, g5 = (e9, t6) => {
    const r32 = m22(e9, t6);
    n5[e9].splice(r32, 1);
  }, u17 = (e9, t6) => (n5[t6] ? n5[t6].push(e9) : n5[t6] = [e9], e9), i61 = (e9) => {
    const t6 = document.createElement("div"), r32 = `message-${d6}`;
    e(e9) && (e9 = { message: e9 });
    const s44 = {
      id: r32,
      placement: c30.name === "FMessage" ? "top" : "top-right",
      ...e9,
      onDestroy: () => {
        o3(s44.onClose), render(null, t6);
      }
    }, o8 = h(c30, s44);
    render(o8, t6), document.body.appendChild(t6.firstElementChild);
    const f10 = o8.component;
    return d6++, u17(
      {
        id: r32,
        vm: f10,
        bottom: 0,
        visible: 0,
        close: () => {
          f10.exposed.close();
        }
      },
      s44.placement
    );
  };
  return e2.forEach((e9) => {
    i61[e9] = (t6) => i61({ message: t6, type: e9 });
  }), {
    getSiblingOffset: l20,
    removeInstance: g5,
    createInstance: u17,
    renderInstance: i61
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-list/index.js
var P = (y9, i61) => {
  const { filter: u17 } = k(y9);
  return {
    classes: (n26, t6) => computed(() => {
      const o8 = ref([]), s44 = u17(n26);
      t6 && o8.value.push(t6);
      for (const e9 in s44)
        s44[e9] && o8.value.push(`f-${i61}__${i(s44[e9]) ? b2(e9) : s44[e9]}`);
      return o8.value;
    }),
    styles: (n26, t6 = true) => computed(() => {
      const o8 = reactive({}), s44 = u17(n26), e9 = (r32, L7) => {
        if (i(t6))
          return c(r32) && t6 ? a3(r32) : r32;
        if (e(t6)) {
          if (t6 === L7)
            return r32;
        } else
          b(t6) && t6.forEach((h16) => {
            if (h16 === r32)
              return r32;
          });
        return a3(r32);
      };
      for (const r32 in s44)
        s44[r32] && (o8[`--${i61}-${b2(r32)}`] = e9(s44[r32], r32));
      return o8;
    })
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/svg-icon/src/index2.js
var C = defineComponent({
  name: "FSvgIcon"
});
var L = defineComponent({
  ...C,
  props: n3,
  setup(r32) {
    const e9 = r32, { styles: s44 } = P(e9, "svg-icon"), i61 = (o8) => {
      o3(e9.onClick, o8);
    }, c30 = s44(["size", "color"]);
    return (o8, _25) => (openBlock(), createElementBlock("i", {
      role: "img",
      class: "f-svg-icon",
      "text-indent": "middle",
      style: normalizeStyle(unref(c30)),
      onClick: i61
    }, [
      o8.icon ? (openBlock(), createBlock(resolveDynamicComponent(o8.icon), { key: 0 })) : renderSlot(o8.$slots, "default", { key: 1 })
    ], 4));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_utils/install/index.js
var n6 = (t6) => (t6.install = (e9) => {
  const { name: l20 } = t6;
  l20 && e9.component(l20, t6);
}, t6);
var r3 = (t6, e9) => (t6.install = (l20) => {
  l20.config.globalProperties[e9] = t6;
}, t6);
var s6 = (t6, e9) => (t6.install = (l20) => {
  l20.directive(e9, t6);
}, t6);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/svg-icon/index.js
var a4 = n6(L);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-cross/index.js
var r4 = {};
var c4 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s7 = createBaseVNode("path", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5",
  d: "m11.25 4.75l-6.5 6.5m0-6.5l6.5 6.5"
}, null, -1);
var i4 = [
  s7
];
function l3(_25, d6) {
  return openBlock(), createElementBlock("svg", c4, i4);
}
var a5 = s5(r4, [["render", l3]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/close-btn/src/index2.js
var v2 = defineComponent({
  name: "FCloseBtn"
});
var N2 = defineComponent({
  ...v2,
  props: s2,
  setup(n26) {
    const s44 = n26, { styles: l20, classes: i61 } = P(s44, "close-btn"), c30 = (o8) => {
      s44.disabled || o3(s44.onClick, o8);
    }, m22 = i61(["round", "disabled"], "f-close-btn"), a56 = l20(["color", "hoverColor"]);
    return (o8, B17) => (openBlock(), createElementBlock("div", {
      role: "button",
      class: normalizeClass(unref(m22)),
      style: normalizeStyle(unref(a56)),
      onClick: c30
    }, [
      createVNode(unref(a4), {
        size: o8.size,
        icon: o8.icon
      }, {
        default: withCtx(() => [
          renderSlot(o8.$slots, "default", {}, () => [
            createVNode(unref(a5))
          ])
        ]),
        _: 3
      }, 8, ["size", "icon"])
    ], 6));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/close-btn/index.js
var s8 = n6(N2);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/fighting-global/src/index3.js
var p3 = {
  size: p(null, (r32) => n2.includes(r32)),
  type: p(null, (r32) => e2.includes(r32)),
  lang: p("zh-CN", (r32) => ["en-US", "zh-CN"].includes(r32))
};
var s9 = Symbol("fighting-global-props-key");

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_lang/index.js
var e3 = {
  "en-US": {
    empty: {
      content: "No data"
    },
    calendar: {
      weekList: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
    },
    stickyCard: {
      openText: "close",
      closeText: "open"
    },
    pageHeader: {
      backText: "back"
    }
  },
  "zh-CN": {
    empty: {
      content: "暂无数据"
    },
    calendar: {
      weekList: ["日", "一", "二", "三", "四", "五", "六"]
    },
    stickyCard: {
      openText: "关闭",
      closeText: "开启"
    },
    pageHeader: {
      backText: "返回"
    }
  }
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-global/index.js
var T = (t6) => {
  const n26 = inject(s9, null);
  return {
    getType: (e9 = "default") => computed(() => t6 && t6.type && !e2.includes(t6.type) ? e9 : t6 && t6.type || n26 && n26.type || e9),
    getSize: (e9 = "middle", i61) => computed(() => t6 && t6.size && !n2.includes(t6.size) ? e9 : t6 && t6.size || i61 || n26 && n26.size || e9),
    getLang: (e9) => computed(() => {
      const i61 = n26 && n26.lang || "zh-CN";
      return e3[i61][e9];
    })
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-alert-list/index.js
var C2 = (e9) => {
  (() => {
    const s44 = e9.children[0].cloneNode(true);
    e9.appendChild(s44);
  })();
  const o8 = 24;
  let n26 = 0;
  const l20 = e9.children.length, c30 = () => {
    let t6 = n26 * o8;
    n26++;
    const s44 = n26 * o8, i61 = 500, r32 = 15, a56 = i61 / r32, h16 = (s44 - t6) / a56, d6 = setInterval(() => {
      if (t6 += h16, t6 >= s44 && (clearInterval(d6), n26 === l20 - 1)) {
        e9.scrollTop = 0, n26 = 0;
        return;
      }
      e9.scrollTop = t6;
    }, r32);
  };
  return (t6 = 2e3) => {
    setInterval(c30, t6);
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/alert/src/index2.js
var q = { class: "f-alert__content" };
var H = {
  key: 0,
  class: "f-alert__title"
};
var J = {
  key: 1,
  class: "f-alert__sub-title"
};
var K = defineComponent({
  name: "FAlert"
});
var se = defineComponent({
  ...K,
  props: m,
  setup(p36) {
    const o8 = p36, { getType: y9 } = T(o8), v9 = reactive({
      ...toRefs(o8),
      type: y9()
    }), { styles: k8, classes: L7 } = P(v9, "alert"), f10 = ref(true), n26 = ref(), _25 = L7(["type", "bold", "simple", "center", "round", "fixed"], "f-alert"), b8 = k8(["fontSize", "color", "background", "titleSize", "titleColor"]), h16 = (e9) => {
      f10.value = false, o3(o8.onClose, e9);
    };
    return onMounted(() => {
      o8.alertList && o8.alertList.length && n26.value && C2(n26.value)(c(o8.duration) ? o8.duration : 2e3);
    }), (e9, O9) => (openBlock(), createBlock(Transition, { name: "f-alert" }, {
      default: withCtx(() => [
        f10.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          role: "alert",
          class: normalizeClass(unref(_25)),
          style: normalizeStyle(unref(b8))
        }, [
          e9.$slots.beforeIcon || e9.beforeIcon ? (openBlock(), createBlock(unref(a4), {
            key: 0,
            icon: e9.beforeIcon
          }, {
            default: withCtx(() => [
              renderSlot(e9.$slots, "beforeIcon")
            ]),
            _: 3
          }, 8, ["icon"])) : createCommentVNode("", true),
          createBaseVNode("div", q, [
            e9.title ? (openBlock(), createElementBlock("div", H, [
              renderSlot(e9.$slots, "title", {}, () => [
                createTextVNode(toDisplayString(e9.title), 1)
              ])
            ])) : createCommentVNode("", true),
            e9.$slots.default ? (openBlock(), createElementBlock("div", J, [
              renderSlot(e9.$slots, "default")
            ])) : createCommentVNode("", true),
            e9.alertList && e9.alertList.length ? (openBlock(), createElementBlock("div", {
              key: 2,
              ref_key: "alertListEl",
              ref: n26,
              class: "f-alert__list"
            }, [
              (openBlock(true), createElementBlock(Fragment, null, renderList(e9.alertList, (C9, g5) => (openBlock(), createElementBlock("div", {
                key: g5,
                class: "f-alert__list-item"
              }, toDisplayString(C9), 1))), 128))
            ], 512)) : createCommentVNode("", true)
          ]),
          e9.close ? (openBlock(), createBlock(unref(s8), {
            key: 1,
            round: "",
            color: e9.type === "default" ? "#333" : "#fff",
            size: 16,
            icon: e9.closeIcon,
            "on-click": h16
          }, {
            default: withCtx(() => [
              renderSlot(e9.$slots, "closeIcon")
            ]),
            _: 3
          }, 8, ["color", "icon"])) : createCommentVNode("", true)
        ], 6)) : createCommentVNode("", true)
      ]),
      _: 3
    }));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/alert/index.js
var a6 = n6(se);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/aside/src/index3.js
var i5 = {
  width: s(),
  padding: s(),
  background: p()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/aside/src/index2.js
var f2 = defineComponent({
  name: "FAside"
});
var B = defineComponent({
  ...f2,
  props: i5,
  setup(t6) {
    const o8 = t6, { styles: s44 } = P(o8, "aside"), r32 = s44(["width", "padding", "background"]);
    return (n26, u17) => (openBlock(), createElementBlock("aside", {
      class: "f-aside",
      style: normalizeStyle(unref(r32))
    }, [
      renderSlot(n26.$slots, "default")
    ], 4));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/aside/index.js
var s10 = n6(B);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/avatar/src/index3.js
var a7 = {
  src: p(),
  errSrc: p(),
  icon: c2(),
  alt: p(),
  round: u(),
  lazy: u(),
  fit: p(null, (o8) => a2.includes(o8)),
  size: {
    type: [String, Number],
    default: () => "middle",
    validator: (o8) => e(o8) ? n2.includes(o8) : c(o8) ? o8 >= 1 : false
  },
  background: p(),
  fontSize: s(),
  fontColor: p(),
  text: p(),
  rootMargin: s("100px"),
  onLoad: i2(),
  onError: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-avatar/index.js
var z = (s44) => {
  const { styles: i61, classes: t6 } = P(s44, "avatar"), e9 = t6(
    [
      "round",
      "fit",
      {
        key: "size",
        callback: () => e(s44.size)
      }
    ],
    "f-avatar__img"
  ), o8 = t6(
    [
      "round",
      {
        key: "size",
        callback: () => e(s44.size)
      }
    ],
    "f-avatar"
  ), r32 = i61([
    "background",
    "fontColor",
    "fontSize",
    {
      key: "size",
      callback: () => c(s44.size)
    }
  ]);
  return {
    nodeClassList: e9,
    classList: o8,
    styleList: r32
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-load-img/index.js
var M = (o8) => {
  const i61 = ref(true), a56 = ref(false);
  let u17 = false;
  const f10 = (e9, r32, t6) => {
    e9.src = t6, i61.value = true, a56.value = true, o3(o8.onLoad, r32);
  }, w15 = (e9) => {
    i61.value = false, o3(o8.onError, e9);
  }, c30 = (e9, r32) => {
    const t6 = new Image();
    new Promise((s44, l20) => {
      t6.src = r32 || o8.src, t6.addEventListener("load", (n26) => {
        s44(n26);
      }), t6.addEventListener("error", (n26) => {
        l20(n26);
      });
    }).then((s44) => {
      s44 && f10(e9, s44, t6.src);
    }).catch((s44) => {
      if (!u17 && o8.errSrc) {
        c30(e9, o8.errSrc), u17 = true;
        return;
      }
      w15(s44);
    });
  }, g5 = (e9) => {
    const r32 = new IntersectionObserver(
      (t6) => {
        t6[0].isIntersecting && (c30(e9), r32.unobserve(e9));
      },
      { rootMargin: a3(o8.rootMargin) }
    );
    return r32;
  }, v9 = (e9) => {
    const r32 = () => {
      const t6 = window.innerHeight || document.documentElement.clientHeight, s44 = document.documentElement.scrollTop || document.body.scrollTop, l20 = e9.offsetParent.offsetTop, n26 = t6 + s44 - l20;
      Math.abs(n26) < Math.abs(f(o8.rootMargin)) && (c30(e9), window && window.removeEventListener("scroll", r32));
    };
    window && window.addEventListener("scroll", r32);
  };
  return {
    isSuccess: i61,
    isShowNode: a56,
    loadImg: (e9) => {
      if (o8.lazy) {
        IntersectionObserver ? g5(e9).observe(e9) : v9(e9);
        return;
      }
      c30(e9);
    }
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/avatar/src/index2.js
var $ = {
  key: 1,
  class: "f-avatar__text"
};
var w2 = ["alt"];
var M2 = { class: "f-avatar__error-text" };
var N3 = defineComponent({
  name: "FAvatar"
});
var O = defineComponent({
  ...N3,
  props: a7,
  setup(p36) {
    const s44 = p36, u17 = useSlots(), { filter: d6 } = k(s44), { nodeClassList: y9, classList: v9, styleList: n26 } = z(s44), { loadImg: _25, isSuccess: k8, isShowNode: S9 } = M(
      d6(["src", "errSrc", "rootMargin", "lazy", "onLoad", "onError"])
    ), a56 = ref();
    return onMounted(() => {
      !u17.icon && !s44.icon && !s44.text && a56.value && _25(a56.value);
    }), (o8, P14) => unref(k8) ? (openBlock(), createElementBlock("div", {
      key: 0,
      role: "img",
      class: normalizeClass(unref(v9)),
      style: normalizeStyle(unref(n26))
    }, [
      o8.$slots.icon || o8.icon ? (openBlock(), createBlock(unref(a4), {
        key: 0,
        size: o8.fontSize || 15,
        color: o8.fontColor,
        icon: o8.icon
      }, {
        default: withCtx(() => [
          renderSlot(o8.$slots, "icon")
        ]),
        _: 3
      }, 8, ["size", "color", "icon"])) : o8.text ? (openBlock(), createElementBlock("span", $, toDisplayString(o8.text), 1)) : (openBlock(), createElementBlock("img", {
        key: 2,
        ref_key: "avatarEl",
        ref: a56,
        src: "",
        class: normalizeClass(unref(y9)),
        style: normalizeStyle(unref(S9) ? "" : "visibility: hidden"),
        alt: o8.alt
      }, null, 14, w2))
    ], 6)) : (openBlock(), createElementBlock("div", {
      key: 1,
      class: "f-avatar__error",
      style: normalizeStyle(unref(n26))
    }, [
      renderSlot(o8.$slots, "error", {}, () => [
        createBaseVNode("span", M2, toDisplayString(o8.alt || "加载失败"), 1)
      ])
    ], 4));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/avatar/index.js
var i6 = n6(O);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/back-top/src/index3.js
var p4 = {
  round: u(),
  behavior: p("smooth", (e9) => ["smooth", "auto"].includes(e9)),
  visibleHeight: l(200),
  right: s(),
  bottom: s(),
  zIndex: l(),
  top: l(0),
  listenEl: p(),
  background: p(),
  color: p()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/back-top/src/index2.js
var I = ["onClick"];
var M3 = defineComponent({
  name: "FBackTop"
});
var J2 = defineComponent({
  ...M3,
  props: p4,
  setup(u17) {
    const o8 = u17, { styles: d6, classes: m22 } = P(o8, "back-top"), l20 = ref(false), r32 = (e9) => p2(() => {
      const t6 = (e9 || document.documentElement).scrollTop, s44 = c(o8.visibleHeight) ? o8.visibleHeight : 200;
      l20.value = t6 > s44;
    }, 200), p36 = () => {
      const { top: e9, behavior: t6, listenEl: s44 } = toRefs(o8);
      if (s44.value) {
        const i61 = document.querySelector(s44.value);
        i61 && i61.scrollTo({ top: e9.value, behavior: t6.value });
        return;
      }
      window && window.scrollTo({ top: e9.value, behavior: t6.value });
    };
    onMounted(() => {
      if (o8.listenEl && e(o8.listenEl)) {
        const e9 = document.querySelector(o8.listenEl);
        e9 && e9.addEventListener("scroll", r32(e9));
      } else
        e(o8.listenEl), document.addEventListener("scroll", r32());
    });
    const f10 = d6(["right", "bottom", "background", "color", "zIndex"], "zIndex"), v9 = m22(["round"], "f-back-top");
    return (e9, t6) => (openBlock(), createBlock(Transition, { name: "f-back-top" }, {
      default: withCtx(() => [
        withDirectives(createBaseVNode("div", {
          class: normalizeClass(unref(v9)),
          style: normalizeStyle(unref(f10)),
          onClick: withModifiers(p36, ["stop"])
        }, [
          renderSlot(e9.$slots, "default")
        ], 14, I), [
          [vShow, l20.value]
        ])
      ]),
      _: 3
    }));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/back-top/index.js
var i7 = n6(J2);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/badge/src/index3.js
var i8 = {
  value: s(),
  max: l(99),
  dot: u(),
  show: u(true),
  type: p("danger", (t6) => e2.includes(t6)),
  background: p(),
  color: p()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/badge/src/index2.js
var L2 = {
  key: 0,
  class: "f-badge__content"
};
var N4 = defineComponent({
  name: "FBadge"
});
var T2 = defineComponent({
  ...N4,
  props: i8,
  setup(m22) {
    const n26 = m22, { classes: u17, styles: d6 } = P(n26, "badge"), p36 = u17(["type", "dot"], "f-badge"), f10 = d6(["background", "color"]), _25 = computed(() => {
      const { dot: t6, max: e9, value: o8 } = n26;
      return t6 ? "" : c(e9) && c(o8) && o8 > e9 ? e9 + "+" : o8;
    }), g5 = computed(() => {
      const { value: t6, show: e9 } = n26;
      return !c(t6) && e9 ? true : e9 && c(t6) && t6 > 0;
    });
    return (t6, e9) => (openBlock(), createElementBlock("div", {
      class: normalizeClass(unref(p36)),
      style: normalizeStyle(unref(f10))
    }, [
      renderSlot(t6.$slots, "default"),
      createVNode(Transition, { name: "f-badge" }, {
        default: withCtx(() => [
          unref(g5) ? (openBlock(), createElementBlock("sup", L2, toDisplayString(unref(_25)), 1)) : createCommentVNode("", true)
        ]),
        _: 1
      })
    ], 6));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/badge/index.js
var i9 = n6(T2);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/breadcrumb/src/index3.js
var s11 = {
  separator: c2(),
  fontColor: p(),
  iconColor: p(),
  fontSize: s()
};
var n7 = Symbol("breadcrumb-props-key");

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/breadcrumb/src/index2.js
var m3 = {
  key: 0,
  class: "f-breadcrumb"
};
var l4 = defineComponent({
  name: "FBreadcrumb"
});
var B2 = defineComponent({
  ...l4,
  props: s11,
  setup(r32) {
    return provide(n7, r32), (e9, _25) => e9.$slots.default ? (openBlock(), createElementBlock("div", m3, [
      renderSlot(e9.$slots, "default")
    ])) : createCommentVNode("", true);
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/breadcrumb/index.js
var i10 = n6(B2);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/breadcrumb-item/src/index3.js
var p5 = {
  fontColor: p(),
  iconColor: p(),
  separator: c2(),
  to: {
    type: [String, Object],
    default: () => null
  }
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-chevron-right/index.js
var r5 = {};
var c5 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s12 = createBaseVNode("path", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5",
  d: "M5.75 12.25L10.25 8l-4.5-4.25"
}, null, -1);
var i11 = [
  s12
];
function _2(l20, d6) {
  return openBlock(), createElementBlock("svg", c5, i11);
}
var a8 = s5(r5, [["render", _2]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/breadcrumb-item/src/index2.js
var E = { class: "f-breadcrumb-item__text" };
var P2 = defineComponent({
  name: "FBreadcrumbItem"
});
var w3 = defineComponent({
  ...P2,
  props: p5,
  setup(s44) {
    const t6 = s44, o8 = inject(n7, null), { styles: i61 } = P(
      reactive({
        iconColor: t6.iconColor || o8 && o8.iconColor,
        fontColor: t6.fontColor || o8 && o8.fontColor,
        fontSize: o8 && o8.fontSize
      }),
      "breadcrumb-item"
    ), a56 = getCurrentInstance(), l20 = computed(() => t6.separator ? t6.separator : o8 && o8.separator ? o8.separator : a8), m22 = i61(["fontColor", "iconColor", "fontSize"]), p36 = () => {
      const e9 = a56.appContext.config.globalProperties.$router;
      if (e9 && t6.to)
        try {
          e9.push(t6.to);
        } catch (n26) {
          console.warn(n26);
        }
    };
    return (e9, n26) => (openBlock(), createElementBlock("div", {
      class: "f-breadcrumb-item",
      style: normalizeStyle(unref(m22)),
      onClick: p36
    }, [
      createBaseVNode("span", E, [
        renderSlot(e9.$slots, "default")
      ]),
      createVNode(unref(a4), {
        icon: unref(l20),
        size: 16
      }, null, 8, ["icon"])
    ], 4));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/breadcrumb-item/index.js
var i12 = n6(w3);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/button/src/index3.js
var a9 = {
  bold: u(),
  circle: u(),
  round: u(),
  spread: u(),
  fontSize: s(),
  fontColor: p(),
  size: p(null, (r32) => n2.includes(r32)),
  block: u(),
  href: p(),
  target: p("_self", (r32) => o2.includes(r32)),
  loading: u(),
  disabled: u(),
  loadingIcon: c2(),
  type: p(null, (r32) => e2.includes(r32)),
  autofocus: u(),
  name: p("f-button"),
  shadow: p(),
  text: u(),
  nativeType: p("button", (r32) => ["button", "submit", "reset"].includes(r32)),
  simple: u(),
  beforeIcon: c2(),
  afterIcon: c2(),
  ripples: u(),
  ripplesColor: p(),
  color: p(),
  onClick: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-ripples/index.js
var d = (s44, p36, t6) => {
  const c30 = computed(() => {
    if (t6.ripplesColor)
      return t6.ripplesColor;
    const r32 = {
      default: "#f0f0f0",
      primary: "#2d5af1",
      success: "#52b35e",
      danger: "#ff0200",
      warning: "#fcc202",
      info: "#1d1d1f"
    };
    if (t6.component === "f-button") {
      const { simple: n26, text: e9 } = t6;
      return n26 || e9 ? r32[t6.type] : "";
    }
    return r32[t6.type];
  }), o8 = (r32) => {
    setTimeout(() => {
      r32.remove();
    }, t6.duration || 400);
  }, a56 = (r32, n26) => {
    const e9 = document.createElement("span");
    if (e9.className = t6.className, e9.style.background = c30.value, e9.style.left = `${r32}px`, t6.component === "f-button") {
      const l20 = document.createElement("div");
      return l20.className = "f-button__ripples-box", l20.appendChild(e9), e9.style.top = `${n26}px`, l20;
    }
    return e9;
  };
  return { runRipples: () => {
    const { layerX: r32, layerY: n26 } = s44, e9 = a56(r32, n26);
    p36.appendChild(e9), o8(e9);
  } };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-color/index.js
var c6 = (o8) => {
  if (!/^\#?[0-9A-Fa-f]{6}$/.test(o8))
    throw new Error(`Fighting Design - useColor: ${o8} is not a valid hex color number`);
  const n26 = () => {
    const t6 = o8.replace("#", "").match(/../g);
    for (let e9 = 0; e9 < t6.length; e9++)
      t6[e9] = parseInt(t6[e9], 16).toString();
    return t6;
  }, g5 = (...r32) => {
    const t6 = [...r32];
    for (let e9 = 0; e9 < t6.length; e9++)
      t6[e9].length === 1 && (t6[e9] = "0" + t6[e9]);
    return "#" + t6.join("");
  };
  return {
    getDark: (r32 = 0) => {
      const t6 = n26();
      for (let e9 = 0; e9 < t6.length; e9++)
        t6[e9] = Math.floor(Number(t6[e9]) * (1 - r32)).toString(16);
      return g5(...t6);
    },
    getLight: (r32 = 0) => {
      const t6 = n26();
      for (let e9 = 0; e9 < t6.length; e9++)
        t6[e9] = Math.floor((255 - Number(t6[e9])) * r32 + Number(t6[e9])).toString(16);
      return g5(...t6);
    }
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/button-group/src/index3.js
var p6 = {
  size: p(null, (o8) => n2.includes(o8)),
  direction: p("horizontal", (o8) => ["horizontal", "vertical"].includes(o8))
};
var l5 = Symbol("button-group-props-key");

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-button/index.js
var I2 = (t6) => {
  const o8 = useSlots(), { getType: r32, getSize: u17 } = T(t6), m22 = inject(l5, null), a56 = computed(() => !(o8.default && o8.default() && o8.default()[0].children)), f10 = reactive({
    ...toRefs(t6),
    size: u17("middle", m22),
    type: !t6.color && r32(),
    simple: t6.simple && !t6.color,
    text: t6.text && !t6.color,
    icon: a56
  }), { classes: b8 } = P(f10, "button"), d6 = b8(
    ["type", "icon", "round", "simple", "block", "bold", "text", "size", "circle", "spread"],
    "f-button"
  ), h16 = computed(() => {
    const { color: e9, fontColor: n26, shadow: s44, fontSize: l20 } = t6;
    if (t6.color) {
      const { getLight: g5, getDark: z10 } = c6(t6.color);
      return {
        "--button-background": e9 || null,
        "--button-hover": e9 ? g5(0.4) : null,
        "--button-active": e9 ? z10(0.2) : null,
        "--button-color": n26,
        "--button-shadow": s44,
        "--button-font-size": a3(l20)
      };
    }
    return {
      "--button-color": n26,
      "--button-shadow": s44,
      "--button-font-size": a3(l20)
    };
  });
  return {
    classList: d6,
    styleList: h16
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/button/src/index2.js
var P3 = ["href", "target"];
var j = ["disabled", "autofocus", "name", "type"];
var q2 = defineComponent({
  name: "FButton"
});
var Y = defineComponent({
  ...q2,
  props: a9,
  setup(I11) {
    const n26 = I11, { getType: v9 } = T(n26), { classList: u17, styleList: f10 } = I2(n26), i61 = ref(), c30 = (o8) => {
      const { disabled: p36, loading: h16, ripples: B17 } = toRefs(n26);
      if (p36.value || h16.value) {
        o8.preventDefault();
        return;
      }
      if (B17.value) {
        const { ripplesColor: z10, simple: F11, text: E9 } = toRefs(n26), R8 = reactive({
          duration: 700,
          component: "f-button",
          className: "f-button__ripples",
          ripplesColor: z10.value,
          simple: F11.value,
          text: E9.value,
          type: v9()
        }), { runRipples: L7 } = d(o8, i61.value, R8);
        L7();
      }
      o3(n26.onClick, o8);
    }, C9 = computed(() => n26.loading ? n26.loadingIcon || m2 : n26.beforeIcon);
    return (o8, p36) => o8.href ? (openBlock(), createElementBlock("a", {
      key: 0,
      ref_key: "FButtonEl",
      ref: i61,
      role: "link",
      tabindex: "0",
      class: normalizeClass(unref(u17)),
      href: o8.href,
      target: o8.target,
      style: normalizeStyle(unref(f10)),
      onClick: c30
    }, [
      o8.loading || o8.beforeIcon ? (openBlock(), createBlock(unref(a4), {
        key: 0,
        class: normalizeClass({ "f-button__loading-animation": o8.loading }),
        icon: unref(C9),
        size: 16
      }, null, 8, ["class", "icon"])) : createCommentVNode("", true),
      renderSlot(o8.$slots, "default"),
      o8.afterIcon ? (openBlock(), createBlock(unref(a4), {
        key: 1,
        icon: o8.afterIcon,
        size: 16
      }, null, 8, ["icon"])) : createCommentVNode("", true)
    ], 14, P3)) : (openBlock(), createElementBlock("button", {
      key: 1,
      ref_key: "FButtonEl",
      ref: i61,
      role: "button",
      tabindex: "0",
      class: normalizeClass(unref(u17)),
      disabled: o8.disabled || o8.loading,
      autofocus: o8.autofocus,
      name: o8.name,
      type: o8.nativeType,
      style: normalizeStyle(unref(f10)),
      onClick: c30
    }, [
      o8.loading || o8.beforeIcon ? (openBlock(), createBlock(unref(a4), {
        key: 0,
        class: normalizeClass(["f-button_before-icon", { "f-button__loading-animation": o8.loading }]),
        icon: o8.loading ? o8.loadingIcon || unref(m2) : o8.beforeIcon,
        size: 16
      }, null, 8, ["class", "icon"])) : createCommentVNode("", true),
      renderSlot(o8.$slots, "default"),
      o8.afterIcon ? (openBlock(), createBlock(unref(a4), {
        key: 1,
        class: "f-button_after-icon",
        icon: o8.afterIcon,
        size: 16
      }, null, 8, ["icon"])) : createCommentVNode("", true)
    ], 14, j));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/button/index.js
var a10 = n6(Y);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/button-group/src/index2.js
var B3 = defineComponent({
  name: "FButtonGroup"
});
var R = defineComponent({
  ...B3,
  props: p6,
  setup(r32) {
    const o8 = r32, { classes: n26 } = P(o8, "button-group"), t6 = inject(s9, null), s44 = computed(() => o8.size || t6 && t6.size || "middle");
    provide(l5, s44.value);
    const i61 = n26(["direction", "size"], "f-button-group");
    return (p36, O9) => (openBlock(), createElementBlock("div", {
      role: "group",
      class: normalizeClass(unref(i61))
    }, [
      renderSlot(p36.$slots, "default")
    ], 2));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/button-group/index.js
var p7 = n6(R);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/calendar/src/index3.js
var p8 = {
  date: {
    type: Date,
    default: () => /* @__PURE__ */ new Date(),
    required: true
  },
  lunar: u(),
  showHeader: u(true),
  border: u(),
  borderColor: p(),
  dayCellHeight: s(),
  weekCellHeight: s(),
  onChangeDate: i2(),
  onChangeMonth: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-chevron-left/index.js
var r6 = {};
var c7 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s13 = createBaseVNode("path", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5",
  d: "M10.25 3.75L5.75 8l4.5 4.25"
}, null, -1);
var i13 = [
  s13
];
function _3(l20, d6) {
  return openBlock(), createElementBlock("svg", c7, i13);
}
var m4 = s5(r6, [["render", _3]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-lunar/src/index.js
var b3 = [
  19416,
  19168,
  42352,
  21717,
  53856,
  55632,
  91476,
  22176,
  39632,
  21970,
  19168,
  42422,
  42192,
  53840,
  119381,
  46400,
  54944,
  44450,
  38320,
  84343,
  18800,
  42160,
  46261,
  27216,
  27968,
  109396,
  11104,
  38256,
  21234,
  18800,
  25958,
  54432,
  59984,
  92821,
  23248,
  11104,
  100067,
  37600,
  116951,
  51536,
  54432,
  120998,
  46416,
  22176,
  107956,
  9680,
  37584,
  53938,
  43344,
  46423,
  27808,
  46416,
  86869,
  19872,
  42416,
  83315,
  21168,
  43432,
  59728,
  27296,
  44710,
  43856,
  19296,
  43748,
  42352,
  21088,
  62051,
  55632,
  23383,
  22176,
  38608,
  19925,
  19152,
  42192,
  54484,
  53840,
  54616,
  46400,
  46752,
  103846,
  38320,
  18864,
  43380,
  42160,
  45690,
  27216,
  27968,
  44870,
  43872,
  38256,
  19189,
  18800,
  25776,
  29859,
  59984,
  27480,
  23232,
  43872,
  38613,
  37600,
  51552,
  55636,
  54432,
  55888,
  30034,
  22176,
  43959,
  9680,
  37584,
  51893,
  43344,
  46240,
  47780,
  44368,
  21977,
  19360,
  42416,
  86390,
  21168,
  43312,
  31060,
  27296,
  44368,
  23378,
  19296,
  42726,
  42208,
  53856,
  60005,
  54576,
  23200,
  30371,
  38608,
  19195,
  19152,
  42192,
  118966,
  53840,
  54560,
  56645,
  46496,
  22224,
  21938,
  18864,
  42359,
  42160,
  43600,
  111189,
  27936,
  44448,
  84835,
  37744,
  18936,
  18800,
  25776,
  92326,
  59984,
  27424,
  108228,
  43744,
  37600,
  53987,
  51552,
  54615,
  54432,
  55888,
  23893,
  22176,
  42704,
  21972,
  21200,
  43448,
  43344,
  46240,
  46758,
  44368,
  21920,
  43940,
  42416,
  21168,
  45683,
  26928,
  29495,
  27296,
  44368,
  84821,
  19296,
  42352,
  21732,
  53600,
  59752,
  54560,
  55968,
  92838,
  22224,
  19168,
  43476,
  41680,
  53584,
  62034,
  54560
];
var f3 = [
  "鼠",
  "牛",
  "虎",
  "兔",
  "龙",
  "蛇",
  "马",
  "羊",
  "猴",
  "鸡",
  "狗",
  "猪"
];
var c8 = {
  "1-1": { title: "元旦节" },
  "2-14": { title: "情人节" },
  "5-1": { title: "劳动节" },
  "5-4": { title: "青年节" },
  "6-1": { title: "儿童节" },
  "9-10": { title: "教师节" },
  "10-1": { title: "国庆节" },
  "12-25": { title: "圣诞节" },
  "3-8": { title: "妇女节" },
  "3-12": { title: "植树节" },
  "4-1": { title: "愚人节" },
  "5-12": { title: "护士节" },
  "7-1": { title: "建党节" },
  "8-1": { title: "建军节" },
  "12-24": { title: "平安夜" }
};
var e4 = {
  "12-30": { title: "除夕" },
  "1-1": { title: "春节" },
  "1-15": { title: "元宵节" },
  "2-2": { title: "龙抬头" },
  "5-5": { title: "端午节" },
  "7-7": { title: "七夕节" },
  "7-15": { title: "中元节" },
  "8-15": { title: "中秋节" },
  "9-9": { title: "重阳节" },
  "10-1": { title: "寒衣节" },
  "10-15": { title: "下元节" },
  "12-8": { title: "腊八节" },
  "12-23": { title: "北方小年" },
  "12-24": { title: "南方小年" }
};
var u2 = [
  "小寒",
  "大寒",
  "立春",
  "雨水",
  "惊蛰",
  "春分",
  "清明",
  "谷雨",
  "立夏",
  "小满",
  "芒种",
  "夏至",
  "小暑",
  "大暑",
  "立秋",
  "处暑",
  "白露",
  "秋分",
  "寒露",
  "霜降",
  "立冬",
  "小雪",
  "大雪",
  "冬至"
];
var d2 = [
  "日",
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
  "十"
];
var t = ["初", "十", "廿", "卅"];
var a11 = [
  "9778397bd097c36b0b6fc9274c91aa",
  "97b6b97bd19801ec9210c965cc920e",
  "97bcf97c3598082c95f8c965cc920f",
  "97bd0b06bdb0722c965ce1cfcc920f",
  "b027097bd097c36b0b6fc9274c91aa",
  "97b6b97bd19801ec9210c965cc920e",
  "97bcf97c359801ec95f8c965cc920f",
  "97bd0b06bdb0722c965ce1cfcc920f",
  "b027097bd097c36b0b6fc9274c91aa",
  "97b6b97bd19801ec9210c965cc920e",
  "97bcf97c359801ec95f8c965cc920f",
  "97bd0b06bdb0722c965ce1cfcc920f",
  "b027097bd097c36b0b6fc9274c91aa",
  "9778397bd19801ec9210c965cc920e",
  "97b6b97bd19801ec95f8c965cc920f",
  "97bd09801d98082c95f8e1cfcc920f",
  "97bd097bd097c36b0b6fc9210c8dc2",
  "9778397bd197c36c9210c9274c91aa",
  "97b6b97bd19801ec95f8c965cc920e",
  "97bd09801d98082c95f8e1cfcc920f",
  "97bd097bd097c36b0b6fc9210c8dc2",
  "9778397bd097c36c9210c9274c91aa",
  "97b6b97bd19801ec95f8c965cc920e",
  "97bcf97c3598082c95f8e1cfcc920f",
  "97bd097bd097c36b0b6fc9210c8dc2",
  "9778397bd097c36c9210c9274c91aa",
  "97b6b97bd19801ec9210c965cc920e",
  "97bcf97c3598082c95f8c965cc920f",
  "97bd097bd097c35b0b6fc920fb0722",
  "9778397bd097c36b0b6fc9274c91aa",
  "97b6b97bd19801ec9210c965cc920e",
  "97bcf97c3598082c95f8c965cc920f",
  "97bd097bd097c35b0b6fc920fb0722",
  "9778397bd097c36b0b6fc9274c91aa",
  "97b6b97bd19801ec9210c965cc920e",
  "97bcf97c359801ec95f8c965cc920f",
  "97bd097bd097c35b0b6fc920fb0722",
  "9778397bd097c36b0b6fc9274c91aa",
  "97b6b97bd19801ec9210c965cc920e",
  "97bcf97c359801ec95f8c965cc920f",
  "97bd097bd097c35b0b6fc920fb0722",
  "9778397bd097c36b0b6fc9274c91aa",
  "97b6b97bd19801ec9210c965cc920e",
  "97bcf97c359801ec95f8c965cc920f",
  "97bd097bd07f595b0b6fc920fb0722",
  "9778397bd097c36b0b6fc9210c8dc2",
  "9778397bd19801ec9210c9274c920e",
  "97b6b97bd19801ec95f8c965cc920f",
  "97bd07f5307f595b0b0bc920fb0722",
  "7f0e397bd097c36b0b6fc9210c8dc2",
  "9778397bd097c36c9210c9274c920e",
  "97b6b97bd19801ec95f8c965cc920f",
  "97bd07f5307f595b0b0bc920fb0722",
  "7f0e397bd097c36b0b6fc9210c8dc2",
  "9778397bd097c36c9210c9274c91aa",
  "97b6b97bd19801ec9210c965cc920e",
  "97bd07f1487f595b0b0bc920fb0722",
  "7f0e397bd097c36b0b6fc9210c8dc2",
  "9778397bd097c36b0b6fc9274c91aa",
  "97b6b97bd19801ec9210c965cc920e",
  "97bcf7f1487f595b0b0bb0b6fb0722",
  "7f0e397bd097c35b0b6fc920fb0722",
  "9778397bd097c36b0b6fc9274c91aa",
  "97b6b97bd19801ec9210c965cc920e",
  "97bcf7f1487f595b0b0bb0b6fb0722",
  "7f0e397bd097c35b0b6fc920fb0722",
  "9778397bd097c36b0b6fc9274c91aa",
  "97b6b97bd19801ec9210c965cc920e",
  "97bcf7f1487f531b0b0bb0b6fb0722",
  "7f0e397bd097c35b0b6fc920fb0722",
  "9778397bd097c36b0b6fc9274c91aa",
  "97b6b97bd19801ec9210c965cc920e",
  "97bcf7f1487f531b0b0bb0b6fb0722",
  "7f0e397bd07f595b0b6fc920fb0722",
  "9778397bd097c36b0b6fc9274c91aa",
  "97b6b97bd19801ec9210c9274c920e",
  "97bcf7f0e47f531b0b0bb0b6fb0722",
  "7f0e397bd07f595b0b0bc920fb0722",
  "9778397bd097c36b0b6fc9210c91aa",
  "97b6b97bd197c36c9210c9274c920e",
  "97bcf7f0e47f531b0b0bb0b6fb0722",
  "7f0e397bd07f595b0b0bc920fb0722",
  "9778397bd097c36b0b6fc9210c8dc2",
  "9778397bd097c36c9210c9274c920e",
  "97b6b7f0e47f531b0723b0b6fb0722",
  "7f0e37f5307f595b0b0bc920fb0722",
  "7f0e397bd097c36b0b6fc9210c8dc2",
  "9778397bd097c36b0b70c9274c91aa",
  "97b6b7f0e47f531b0723b0b6fb0721",
  "7f0e37f1487f595b0b0bb0b6fb0722",
  "7f0e397bd097c35b0b6fc9210c8dc2",
  "9778397bd097c36b0b6fc9274c91aa",
  "97b6b7f0e47f531b0723b0b6fb0721",
  "7f0e27f1487f595b0b0bb0b6fb0722",
  "7f0e397bd097c35b0b6fc920fb0722",
  "9778397bd097c36b0b6fc9274c91aa",
  "97b6b7f0e47f531b0723b0b6fb0721",
  "7f0e27f1487f531b0b0bb0b6fb0722",
  "7f0e397bd097c35b0b6fc920fb0722",
  "9778397bd097c36b0b6fc9274c91aa",
  "97b6b7f0e47f531b0723b0b6fb0721",
  "7f0e27f1487f531b0b0bb0b6fb0722",
  "7f0e397bd097c35b0b6fc920fb0722",
  "9778397bd097c36b0b6fc9274c91aa",
  "97b6b7f0e47f531b0723b0b6fb0721",
  "7f0e27f1487f531b0b0bb0b6fb0722",
  "7f0e397bd07f595b0b0bc920fb0722",
  "9778397bd097c36b0b6fc9274c91aa",
  "97b6b7f0e47f531b0723b0787b0721",
  "7f0e27f0e47f531b0b0bb0b6fb0722",
  "7f0e397bd07f595b0b0bc920fb0722",
  "9778397bd097c36b0b6fc9210c91aa",
  "97b6b7f0e47f149b0723b0787b0721",
  "7f0e27f0e47f531b0723b0b6fb0722",
  "7f0e397bd07f595b0b0bc920fb0722",
  "9778397bd097c36b0b6fc9210c8dc2",
  "977837f0e37f149b0723b0787b0721",
  "7f07e7f0e47f531b0723b0b6fb0722",
  "7f0e37f5307f595b0b0bc920fb0722",
  "7f0e397bd097c35b0b6fc9210c8dc2",
  "977837f0e37f14998082b0787b0721",
  "7f07e7f0e47f531b0723b0b6fb0721",
  "7f0e37f1487f595b0b0bb0b6fb0722",
  "7f0e397bd097c35b0b6fc9210c8dc2",
  "977837f0e37f14998082b0787b06bd",
  "7f07e7f0e47f531b0723b0b6fb0721",
  "7f0e27f1487f531b0b0bb0b6fb0722",
  "7f0e397bd097c35b0b6fc920fb0722",
  "977837f0e37f14998082b0787b06bd",
  "7f07e7f0e47f531b0723b0b6fb0721",
  "7f0e27f1487f531b0b0bb0b6fb0722",
  "7f0e397bd097c35b0b6fc920fb0722",
  "977837f0e37f14998082b0787b06bd",
  "7f07e7f0e47f531b0723b0b6fb0721",
  "7f0e27f1487f531b0b0bb0b6fb0722",
  "7f0e397bd07f595b0b0bc920fb0722",
  "977837f0e37f14998082b0787b06bd",
  "7f07e7f0e47f531b0723b0b6fb0721",
  "7f0e27f1487f531b0b0bb0b6fb0722",
  "7f0e397bd07f595b0b0bc920fb0722",
  "977837f0e37f14998082b0787b06bd",
  "7f07e7f0e47f149b0723b0787b0721",
  "7f0e27f0e47f531b0b0bb0b6fb0722",
  "7f0e397bd07f595b0b0bc920fb0722",
  "977837f0e37f14998082b0723b06bd",
  "7f07e7f0e37f149b0723b0787b0721",
  "7f0e27f0e47f531b0723b0b6fb0722",
  "7f0e397bd07f595b0b0bc920fb0722",
  "977837f0e37f14898082b0723b02d5",
  "7ec967f0e37f14998082b0787b0721",
  "7f07e7f0e47f531b0723b0b6fb0722",
  "7f0e37f1487f595b0b0bb0b6fb0722",
  "7f0e37f0e37f14898082b0723b02d5",
  "7ec967f0e37f14998082b0787b0721",
  "7f07e7f0e47f531b0723b0b6fb0722",
  "7f0e37f1487f531b0b0bb0b6fb0722",
  "7f0e37f0e37f14898082b0723b02d5",
  "7ec967f0e37f14998082b0787b06bd",
  "7f07e7f0e47f531b0723b0b6fb0721",
  "7f0e37f1487f531b0b0bb0b6fb0722",
  "7f0e37f0e37f14898082b072297c35",
  "7ec967f0e37f14998082b0787b06bd",
  "7f07e7f0e47f531b0723b0b6fb0721",
  "7f0e27f1487f531b0b0bb0b6fb0722",
  "7f0e37f0e37f14898082b072297c35",
  "7ec967f0e37f14998082b0787b06bd",
  "7f07e7f0e47f531b0723b0b6fb0721",
  "7f0e27f1487f531b0b0bb0b6fb0722",
  "7f0e37f0e366aa89801eb072297c35",
  "7ec967f0e37f14998082b0787b06bd",
  "7f07e7f0e47f149b0723b0787b0721",
  "7f0e27f1487f531b0b0bb0b6fb0722",
  "7f0e37f0e366aa89801eb072297c35",
  "7ec967f0e37f14998082b0723b06bd",
  "7f07e7f0e47f149b0723b0787b0721",
  "7f0e27f0e47f531b0723b0b6fb0722",
  "7f0e37f0e366aa89801eb072297c35",
  "7ec967f0e37f14998082b0723b06bd",
  "7f07e7f0e37f14998083b0787b0721",
  "7f0e27f0e47f531b0723b0b6fb0722",
  "7f0e37f0e366aa89801eb072297c35",
  "7ec967f0e37f14898082b0723b02d5",
  "7f07e7f0e37f14998082b0787b0721",
  "7f07e7f0e47f531b0723b0b6fb0722",
  "7f0e36665b66aa89801e9808297c35",
  "665f67f0e37f14898082b0723b02d5",
  "7ec967f0e37f14998082b0787b0721",
  "7f07e7f0e47f531b0723b0b6fb0722",
  "7f0e36665b66a449801e9808297c35",
  "665f67f0e37f14898082b0723b02d5",
  "7ec967f0e37f14998082b0787b06bd",
  "7f07e7f0e47f531b0723b0b6fb0721",
  "7f0e36665b66a449801e9808297c35",
  "665f67f0e37f14898082b072297c35",
  "7ec967f0e37f14998082b0787b06bd",
  "7f07e7f0e47f531b0723b0b6fb0721",
  "7f0e26665b66a449801e9808297c35",
  "665f67f0e37f1489801eb072297c35",
  "7ec967f0e37f14998082b0787b06bd",
  "7f07e7f0e47f531b0723b0b6fb0721",
  "7f0e27f1487f531b0b0bb0b6fb0722"
];

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-lunar/index.js
var V = () => {
  const T9 = (t6) => {
    let e9, l20 = 348;
    for (e9 = 32768; e9 > 8; e9 >>= 1)
      l20 += b3[t6 - 1900] & e9 ? 1 : 0;
    return l20 + p36(t6);
  }, L7 = (t6) => b3[t6 - 1900] & 15, p36 = (t6) => L7(t6) ? b3[t6 - 1900] & 65536 ? 30 : 29 : 0, F11 = (t6, e9) => e9 > 12 || e9 < 1 ? -1 : b3[t6 - 1900] & 65536 >> e9 ? 30 : 29, m22 = (t6, e9) => {
    const l20 = "魔羯水瓶双鱼白羊金牛双子巨蟹狮子处女天秤天蝎射手魔羯", n26 = [20, 19, 21, 21, 21, 22, 23, 23, 23, 23, 22, 22];
    return l20.substr(t6 * 2 - (e9 < n26[t6 - 1] ? 2 : 0), 2) + "座";
  }, b8 = (t6, e9) => {
    if (t6 < 1900 || t6 > 2100 || e9 < 1 || e9 > 24)
      return -1;
    const l20 = a11[t6 - 1900], n26 = [];
    for (let u17 = 0; u17 < l20.length; u17 += 5) {
      const s44 = parseInt("0x" + l20.substr(u17, 5)).toString();
      n26.push(s44[0], s44.substr(1, 2), s44[3], s44.substr(4, 2));
    }
    return parseInt(n26[e9 - 1]);
  }, h16 = (t6) => {
    let e9;
    switch (t6) {
      case 10:
        e9 = "初十";
        break;
      case 20:
        e9 = "二十";
        break;
      case 30:
        e9 = "三十";
        break;
      default:
        e9 = t[Math.floor(t6 / 10)], e9 += d2[t6 % 10];
    }
    return e9;
  }, y9 = (t6) => f3[(t6 - 4) % 12];
  return (t6, e9, l20) => {
    let n26 = parseInt(t6.toString()), u17 = parseInt(e9.toString()), s44 = parseInt(l20.toString());
    if (n26 < 1900 || n26 > 2100 || n26 === 1900 && u17 === 1 && s44 < 31)
      return -1;
    let o8;
    n26 ? o8 = new Date(n26, parseInt(u17.toString()) - 1, s44) : o8 = /* @__PURE__ */ new Date();
    let r32, c30 = 0, i61 = 0;
    n26 = o8.getFullYear(), u17 = o8.getMonth() + 1, s44 = o8.getDate();
    let a56 = (Date.UTC(o8.getFullYear(), o8.getMonth(), o8.getDate()) - Date.UTC(1900, 0, 31)) / 864e5;
    for (r32 = 1900; r32 < 2101 && a56 > 0; r32++)
      i61 = T9(r32), a56 -= i61;
    a56 < 0 && (a56 += i61, r32--);
    let C9 = o8.getDay();
    C9 === 0 && (C9 = 7);
    const D7 = r32;
    c30 = L7(r32);
    let f10 = false;
    for (r32 = 1; r32 < 13 && a56 > 0; r32++)
      c30 > 0 && r32 === c30 + 1 && f10 === false ? (--r32, f10 = true, i61 = p36(D7)) : i61 = F11(D7, r32), f10 === true && r32 === c30 + 1 && (f10 = false), a56 -= i61;
    a56 === 0 && c30 > 0 && r32 === c30 + 1 && (f10 ? f10 = false : (f10 = true, --r32)), a56 < 0 && (a56 += i61, --r32);
    const E9 = r32, g5 = a56 + 1, B17 = b8(n26, u17 * 2);
    let _25 = null;
    B17 === s44 && (_25 = u2[u17 * 2 - 1]);
    const M9 = m22(u17, s44), S9 = u17 + "-" + s44;
    let I11 = E9 + "-" + g5;
    return E9 === 12 && g5 === 29 && F11(D7, E9) === 29 && (I11 = "12-30"), {
      festival: c8[S9] ? c8[S9].title : "",
      lunarFestival: e4[I11] ? e4[I11].title : "",
      animal: y9(D7),
      IDayCn: h16(g5),
      year: n26,
      month: u17,
      day: s44,
      week: C9,
      term: _25,
      constellation: M9
    };
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-calendar/index.js
var m5 = (t6) => {
  const s44 = (o8, n26) => n26 === 0 ? 31 : n26 !== 2 ? [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][n26 - 1] : o8 % 4 == 0 && o8 % 100 != 0 || o8 % 400 == 0 ? 29 : 28, y9 = computed(() => (/* @__PURE__ */ new Date(`${t6.year}/${t6.month}/1`)).getDay()), r32 = V(), i61 = computed(() => {
    let o8 = s44(t6.year, t6.month - 1);
    const n26 = [];
    for (let e9 = 0; e9 < y9.value; e9++) {
      const h16 = r32(t6.year, t6.month - 1, o8);
      h16 !== -1 ? n26.push(h16) : n26.push({
        day: o8,
        month: t6.month
      }), o8--;
    }
    return n26.reverse();
  }), l20 = computed(() => {
    const o8 = s44(t6.year, t6.month), n26 = [];
    for (let e9 = 0; e9 < o8; e9++) {
      const h16 = r32(t6.year, t6.month, e9 + 1);
      h16 !== -1 ? n26.push(h16) : n26.push({
        day: e9 + 1,
        month: t6.month
      });
    }
    return n26;
  }), f10 = computed(() => {
    const o8 = s44(t6.year, t6.month) + y9.value, n26 = o8 % 7 === 0 ? 0 : 7 - o8 % 7;
    if (!n26)
      return [];
    const e9 = [];
    for (let h16 = 0; h16 < n26; h16++) {
      const c30 = r32(t6.year, t6.month + 1, h16 + 1);
      c30 !== -1 ? e9.push(c30) : e9.push({
        day: h16 + 1,
        month: t6.month + 2
      });
    }
    return e9;
  }), D7 = () => {
    if (t6.month > 1) {
      t6.month--;
      return;
    }
    t6.year--, t6.month = 12;
  }, L7 = () => {
    if (t6.month < 12) {
      t6.month = t6.month + 1;
      return;
    }
    t6.year++, t6.month = 1;
  };
  return {
    AllMonthDays: computed(() => [...i61.value, ...l20.value, ...f10.value]),
    changeLastMonth: D7,
    changeNextMonth: L7
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/calendar/src/index2.js
var J3 = {
  key: 0,
  class: "f-calendar__header"
};
var K2 = { class: "f-calendar__option" };
var O2 = { class: "f-calendar__now-time" };
var Q = { class: "f-calendar__week" };
var U = { class: "f-calendar__day" };
var W = ["onClick"];
var X = { class: "f-calendar__solar" };
var ee = {
  key: 0,
  class: "f-calendar__lunar"
};
var te = defineComponent({
  name: "FCalendar"
});
var pe = defineComponent({
  ...te,
  props: p8,
  setup(M9) {
    const r32 = M9, m22 = computed(() => r(r32.date) ? r32.date : /* @__PURE__ */ new Date()), e9 = reactive({
      year: m22.value.getFullYear(),
      month: m22.value.getMonth() + 1,
      date: m22.value.getDate()
    }), { AllMonthDays: $12, changeLastMonth: f10, changeNextMonth: p36 } = m5(e9), { getLang: V7 } = T(), { styles: I11, classes: N10 } = P(r32, "calendar"), b8 = computed(() => V7("calendar").value.weekList), x5 = (t6, o8) => o8 === e9.date && t6 === e9.month ? "f-calendar__day-today" : t6 !== e9.month ? "f-calendar__not-month" : "", _25 = (t6) => {
      const o8 = {
        last: () => f10(),
        next: () => p36(),
        now: () => {
          e9.month = r32.date.getMonth(), e9.year = r32.date.getFullYear(), e9.date = r32.date.getDate();
        }
      };
      o8[t6] && o8[t6]();
    }, E9 = computed(() => `${e9.year} / ${s3(e9.month)} / ${s3(e9.date)}`), H6 = (t6) => {
      const o8 = e9.date;
      e9.date = t6.day, t6.year > e9.year || t6.month > e9.month ? p36() : (t6.year > e9.year || t6.month < e9.month) && f10(), o8 !== t6.day && o3(r32.onChangeDate, {
        year: e9.year,
        month: t6.month || e9.month,
        date: t6.day
      });
    };
    watch(
      () => e9.month,
      (t6) => {
        o3(r32.onChangeMonth, {
          year: e9.year,
          month: t6,
          date: e9.date
        });
      }
    );
    const S9 = I11(["borderColor", "dayCellHeight", "weekCellHeight"]), z10 = N10(["border"], "f-calendar");
    return (t6, o8) => (openBlock(), createElementBlock("div", {
      class: normalizeClass(unref(z10)),
      style: normalizeStyle(unref(S9))
    }, [
      t6.showHeader ? (openBlock(), createElementBlock("header", J3, [
        createVNode(unref(a4), {
          icon: unref(m4),
          onClick: o8[0] || (o8[0] = withModifiers((n26) => _25("last"), ["stop"]))
        }, null, 8, ["icon"]),
        createBaseVNode("div", K2, [
          createBaseVNode("span", O2, toDisplayString(unref(E9)), 1),
          createBaseVNode("span", {
            class: "f-calendar__now-date",
            onClick: o8[1] || (o8[1] = withModifiers((n26) => _25("now"), ["stop"]))
          }, "今天")
        ]),
        createVNode(unref(a4), {
          icon: unref(a8),
          onClick: o8[2] || (o8[2] = withModifiers((n26) => _25("next"), ["stop"]))
        }, null, 8, ["icon"])
      ])) : createCommentVNode("", true),
      createBaseVNode("div", Q, [
        (openBlock(true), createElementBlock(Fragment, null, renderList(unref(b8), (n26, u17) => (openBlock(), createElementBlock("div", {
          key: u17,
          class: "f-calendar__week-item"
        }, toDisplayString(n26), 1))), 128))
      ]),
      createBaseVNode("div", U, [
        (openBlock(true), createElementBlock(Fragment, null, renderList(unref($12), (n26, u17) => (openBlock(), createElementBlock("div", {
          key: u17,
          class: normalizeClass(["f-calendar__day-item", x5(n26.month, n26.day)]),
          onClick: withModifiers((oe4) => H6(n26), ["stop"])
        }, [
          createBaseVNode("span", X, toDisplayString(n26.day), 1),
          t6.lunar ? (openBlock(), createElementBlock("span", ee, toDisplayString(n26.lunarFestival || n26.festival || n26.term || n26.IDayCn), 1)) : createCommentVNode("", true)
        ], 10, W))), 128))
      ])
    ], 6));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/calendar/index.js
var i14 = n6(pe);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/card/src/index3.js
var i15 = {
  title: p(),
  round: u(),
  padding: s(),
  shadow: p(null, (t6) => ["hover", "always"].includes(t6)),
  borderColor: p(),
  background: p(),
  titleColor: p(),
  titleBold: u(),
  close: u(),
  onClose: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/card/src/index2.js
var V2 = {
  key: 0,
  role: "heading",
  class: "f-card__header"
};
var $2 = {
  role: "none",
  class: "f-card__body"
};
var z2 = defineComponent({
  name: "FCard"
});
var A = defineComponent({
  ...z2,
  props: i15,
  setup(f10) {
    const l20 = f10, t6 = ref(true), { classes: u17, styles: p36 } = P(l20, "card"), _25 = u17(["round", "shadow"], "f-card"), h16 = p36(["padding", "borderColor", "background", "titleColor"]), C9 = () => {
      t6.value = false, o3(l20.onClose, t6.value);
    };
    return (e9, E9) => (openBlock(), createBlock(Transition, { name: "f-card" }, {
      default: withCtx(() => [
        t6.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: normalizeClass(unref(_25)),
          style: normalizeStyle(unref(h16))
        }, [
          e9.$slots.header || e9.title ? (openBlock(), createElementBlock("header", V2, [
            createBaseVNode("span", {
              class: normalizeClass(["f-card__title", { "f-card__title-bold": e9.titleBold }])
            }, [
              renderSlot(e9.$slots, "header", {}, () => [
                createTextVNode(toDisplayString(e9.title), 1)
              ])
            ], 2),
            e9.close ? (openBlock(), createBlock(unref(s8), {
              key: 0,
              "on-click": C9
            })) : createCommentVNode("", true)
          ])) : createCommentVNode("", true),
          createBaseVNode("main", $2, [
            renderSlot(e9.$slots, "default")
          ])
        ], 6)) : createCommentVNode("", true)
      ]),
      _: 3
    }));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/card/index.js
var i16 = n6(A);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/checkbox/src/index3.js
var r7 = {
  modelValue: {
    type: Boolean,
    default: () => false
  },
  label: {
    type: [String, Number, Boolean],
    default: () => null
  },
  disabled: u(),
  border: u(),
  showLabel: u(true),
  indeterminate: u(),
  onChange: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_tokens/emits/index.js
var t2 = "update:modelValue";
var e5 = "update:visible";
var E2 = "update:date";
var I3 = "update:files";
var T3 = "update:time";

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/checkbox-group/src/index3.js
var a12 = {
  modelValue: y([]),
  disabled: u(),
  vertical: u(),
  label: p(),
  border: u(),
  size: p("middle", (t6) => n2.includes(t6)),
  columnGap: s(),
  rowGap: s(),
  onChange: i2()
};
var P4 = Symbol("f-checkbox-group-props-key");

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/checkbox/src/index2.js
var N5 = ["value", "disabled"];
var O3 = {
  key: 0,
  class: "f-checkbox__box"
};
var S = { class: "f-checkbox__text" };
var T4 = defineComponent({
  name: "FCheckbox"
});
var z3 = defineComponent({
  ...T4,
  props: r7,
  emits: {
    [t2]: (s44) => typeof s44 != "object"
  },
  setup(s44, { emit: f10 }) {
    const t6 = s44, o8 = inject(P4, null), r32 = computed({
      get: () => o8 && o8.modelValue || t6.modelValue,
      set: (e9) => {
        if (!o8) {
          f10(t2, e9), o3(t6.onChange, e9);
          return;
        }
        o8.setChange(e9);
      }
    }), p36 = computed(() => {
      const e9 = r32.value;
      return b(e9) ? e9.includes(t6.label) : i(e9) ? e9 : e9 === t6.label;
    }), _25 = computed(() => [
      "f-checkbox",
      {
        "f-checkbox__active": p36.value,
        "f-checkbox__indeterminate": t6.indeterminate,
        "f-checkbox__bordered": o8 && o8.border,
        "f-checkbox__disabled": t6.disabled || o8 && o8.disabled
      }
    ]);
    return (e9, i61) => (openBlock(), createElementBlock("label", {
      role: "checkbox",
      "aria-checked": "false",
      tabindex: "0",
      "aria-labelledby": "chk1-label",
      class: normalizeClass(unref(_25))
    }, [
      withDirectives(createBaseVNode("input", {
        "onUpdate:modelValue": i61[0] || (i61[0] = (h16) => isRef(r32) ? r32.value = h16 : null),
        type: "checkbox",
        class: "f-checkbox__input",
        hidden: "",
        value: e9.label,
        disabled: e9.disabled || !!unref(o8) && unref(o8).disabled
      }, null, 8, N5), [
        [vModelCheckbox, unref(r32)]
      ]),
      unref(o8) && unref(o8).border ? createCommentVNode("", true) : (openBlock(), createElementBlock("span", O3)),
      createBaseVNode("span", S, [
        renderSlot(e9.$slots, "default"),
        !e9.$slots.default && e9.showLabel ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
          createTextVNode(toDisplayString(e9.label), 1)
        ], 64)) : createCommentVNode("", true)
      ])
    ], 2));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/checkbox/index.js
var a13 = n6(z3);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/checkbox-group/src/index2.js
var y2 = defineComponent({
  name: "FCheckboxGroup"
});
var L3 = defineComponent({
  ...y2,
  props: a12,
  emits: {
    [t2]: (t6) => b(t6)
  },
  setup(t6, { emit: m22 }) {
    const r32 = t6, l20 = (o8) => {
      m22(t2, o8), o3(r32.onChange, o8);
    };
    provide(
      P4,
      reactive({
        ...toRefs(r32),
        setChange: l20
      })
    );
    const u17 = computed(() => {
      const { columnGap: o8, rowGap: e9 } = r32;
      return {
        columnGap: a3(o8),
        rowGap: a3(e9)
      };
    }), f10 = computed(() => {
      const { border: o8, vertical: e9, size: c30 } = r32;
      return [
        "f-checkbox-group",
        {
          "f-checkbox-group__border": o8,
          "f-checkbox-group__vertical": e9,
          [`f-checkbox-group__${c30}`]: c30 && o8
        }
      ];
    });
    return (o8, e9) => (openBlock(), createElementBlock("div", {
      role: "group",
      "aria-label": "checkbox-group",
      class: normalizeClass(unref(f10)),
      style: normalizeStyle(unref(u17))
    }, [
      renderSlot(o8.$slots, "default")
    ], 6));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/checkbox-group/index.js
var p9 = n6(L3);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/dialog/src/index3.js
var i17 = {
  visible: {
    ...u(),
    required: true
  },
  title: p(),
  appendToBody: u(),
  width: s(),
  fullscreen: u(),
  showMask: u(true),
  maskClose: u(true),
  maskBlur: u(),
  showCloseIcon: u(true),
  closeIcon: c2(),
  zIndex: l(1999),
  onOpen: i2(),
  onOpenEnd: i2(),
  onClose: i2(),
  onCloseEnd: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/popup/src/index3.js
var u3 = {
  visible: {
    ...u(),
    required: true
  },
  appendToBody: u(),
  showMask: u(true),
  maskClose: u(true),
  maskBlur: u(),
  zIndex: l(1999),
  maskBackground: p(),
  maskOpacity: l(),
  direction: p("center", (p36) => ["left", "right", "top", "bottom", "center"].includes(p36)),
  popupSize: s(),
  padding: s(),
  onOpen: i2(),
  onClose: i2(),
  onOpenEnd: i2(),
  onCloseEnd: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/popup/src/index2.js
var P5 = ["onClick"];
var $3 = defineComponent({
  name: "FPopup"
});
var J4 = defineComponent({
  ...$3,
  props: u3,
  emits: {
    [e5]: (p36) => i(p36)
  },
  setup(p36, { emit: y9 }) {
    const o8 = p36, v9 = () => {
      !o8.maskClose || y9(e5, false);
    }, C9 = (e9) => {
      document.body.style.overflow = "hidden", o3(o8.onOpen, e9);
    }, w15 = (e9) => {
      o3(o8.onOpenEnd, e9);
    }, b8 = (e9) => {
      document.body.style.overflow = "", o3(o8.onClose, e9);
    }, B17 = (e9) => {
      o3(o8.onCloseEnd, e9);
    }, E9 = computed(() => {
      const { direction: e9, popupSize: r32, padding: d6 } = o8;
      return e9 === "top" || e9 === "bottom" ? {
        height: a3(r32),
        padding: a3(d6)
      } : {
        width: a3(r32),
        padding: a3(d6)
      };
    });
    return (e9, r32) => (openBlock(), createBlock(Teleport, {
      to: "body",
      disabled: !e9.appendToBody
    }, [
      createVNode(Transition, {
        name: "f-popup__transition",
        onBeforeEnter: C9,
        onAfterEnter: w15,
        onBeforeLeave: b8,
        onAfterLeave: B17
      }, {
        default: withCtx(() => [
          withDirectives(createBaseVNode("div", {
            class: "f-popup",
            style: normalizeStyle({ zIndex: e9.zIndex })
          }, [
            e9.showMask ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: normalizeClass(["f-popup__mask", { "f-popup__blur": e9.maskBlur }]),
              style: normalizeStyle({ background: e9.maskBackground, opacity: e9.maskOpacity })
            }, null, 6)) : createCommentVNode("", true),
            createBaseVNode("div", {
              class: normalizeClass([
                "f-popup__container",
                {
                  [`f-popup__container-${e9.direction}`]: e9.direction
                }
              ]),
              onClick: withModifiers(v9, ["self"])
            }, [
              createVNode(Transition, { name: "f-popup__wrapper-transition" }, {
                default: withCtx(() => [
                  withDirectives(createBaseVNode("div", {
                    class: normalizeClass([
                      "f-popup__wrapper",
                      {
                        [`f-popup__wrapper-${e9.direction}`]: e9.direction
                      }
                    ]),
                    style: normalizeStyle(unref(E9))
                  }, [
                    renderSlot(e9.$slots, "default")
                  ], 6), [
                    [vShow, e9.visible]
                  ])
                ]),
                _: 3
              })
            ], 10, P5)
          ], 4), [
            [vShow, e9.visible]
          ])
        ]),
        _: 3
      })
    ], 8, ["disabled"]));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/popup/index.js
var i18 = n6(J4);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-visible/index.js
var v3 = (r32, s44, l20) => {
  const o8 = ref(r32.value), i61 = (e9) => {
    s44(e5, false), o3(l20, e9);
  };
  return watch(
    () => o8.value,
    (e9) => {
      e9 || i61();
    }
  ), watch(
    () => r32.value,
    (e9) => {
      o8.value = e9;
    }
  ), {
    isVisible: o8,
    closeVisible: i61
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/dialog/src/index2.js
var $4 = { class: "f-dialog__header" };
var S2 = { class: "f-dialog__header-title" };
var F = {
  key: 0,
  class: "f-dialog__body"
};
var D = {
  key: 1,
  class: "f-dialog__footer"
};
var M4 = defineComponent({
  name: "FDialog"
});
var G = defineComponent({
  ...M4,
  props: i17,
  emits: {
    [e5]: (n26) => i(n26)
  },
  setup(n26, { emit: u17 }) {
    const c30 = n26, { isVisible: i61, closeVisible: k8 } = v3(toRef(c30, "visible"), u17);
    return (o8, a56) => (openBlock(), createBlock(unref(i18), {
      visible: unref(i61),
      "onUpdate:visible": a56[0] || (a56[0] = (h16) => isRef(i61) ? i61.value = h16 : null),
      "append-to-body": o8.appendToBody,
      "show-mask": o8.showMask,
      "mask-close": o8.maskClose,
      "z-index": o8.zIndex,
      "mask-blur": o8.maskBlur,
      "on-open": o8.onOpen,
      "on-open-end": o8.onOpenEnd,
      "on-close": o8.onClose,
      "on-close-end": o8.onCloseEnd
    }, {
      default: withCtx(() => [
        createBaseVNode("div", {
          role: "dialog",
          "aria-modal": "true",
          tabindex: "-1",
          class: normalizeClass(["f-dialog", { "f-dialog__fullscreen": o8.fullscreen }]),
          style: normalizeStyle({ width: unref(a3)(o8.width) })
        }, [
          createBaseVNode("header", $4, [
            renderSlot(o8.$slots, "header", {}, () => [
              createBaseVNode("span", S2, toDisplayString(o8.title), 1),
              o8.showCloseIcon ? (openBlock(), createBlock(unref(s8), {
                key: 0,
                icon: o8.closeIcon,
                "on-click": unref(k8)
              }, {
                default: withCtx(() => [
                  renderSlot(o8.$slots, "closeIcon")
                ]),
                _: 3
              }, 8, ["icon", "on-click"])) : createCommentVNode("", true)
            ])
          ]),
          o8.$slots.default ? (openBlock(), createElementBlock("section", F, [
            renderSlot(o8.$slots, "default")
          ])) : createCommentVNode("", true),
          o8.$slots.footer ? (openBlock(), createElementBlock("footer", D, [
            renderSlot(o8.$slots, "footer")
          ])) : createCommentVNode("", true)
        ], 6)
      ]),
      _: 3
    }, 8, ["visible", "append-to-body", "show-mask", "mask-close", "z-index", "mask-blur", "on-open", "on-open-end", "on-close", "on-close-end"]));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/dialog/index.js
var a14 = n6(G);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/divider/src/index3.js
var s14 = {
  position: p("center", (r32) => ["left", "center", "right"].includes(r32)),
  vertical: u(),
  color: p(),
  fontColor: p(),
  margin: s(),
  height: s(),
  background: p(),
  type: p("solid", (r32) => ["dashed", "dotted", "double", "solid"].includes(r32))
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/divider/src/index2.js
var y3 = {
  key: 0,
  class: "f-divider__text"
};
var h3 = defineComponent({
  name: "FDivider"
});
var S3 = defineComponent({
  ...h3,
  props: s14,
  setup(i61) {
    const l20 = i61, { classes: n26, styles: a56 } = P(l20, "divider"), c30 = n26(["vertical", "position"], "f-divider"), p36 = a56(["color", "margin", "background", "fontColor", "height", "type"]);
    return (e9, k8) => (openBlock(), createElementBlock("div", {
      role: "separator",
      class: normalizeClass(unref(c30)),
      style: normalizeStyle(unref(p36))
    }, [
      !e9.vertical || !e9.$slots.default ? (openBlock(), createElementBlock("span", y3, [
        renderSlot(e9.$slots, "default")
      ])) : createCommentVNode("", true)
    ], 6));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/divider/index.js
var a15 = n6(S3);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/drawer/src/index3.js
var u4 = {
  visible: u(),
  appendToBody: u(),
  direction: p("right", (r32) => ["left", "top", "right", "bottom"].includes(r32)),
  size: s("30%"),
  title: p(),
  showMask: u(true),
  maskClose: u(true),
  maskBlur: u(),
  showCloseIcon: u(true),
  closeIcon: c2(),
  zIndex: l(1999),
  onOpen: i2(),
  onOpenEnd: i2(),
  onClose: i2(),
  onCloseEnd: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/drawer/src/index2.js
var E3 = { class: "f-drawer" };
var V3 = { class: "f-drawer__header" };
var $5 = { class: "f-drawer__header-title" };
var F2 = {
  key: 0,
  class: "f-drawer__body"
};
var S4 = {
  key: 1,
  class: "f-drawer__footer"
};
var D2 = defineComponent({
  name: "FDrawer"
});
var j2 = defineComponent({
  ...D2,
  props: u4,
  emits: {
    [e5]: (r32) => i(r32)
  },
  setup(r32, { emit: c30 }) {
    const u17 = r32, { isVisible: i61, closeVisible: k8 } = v3(toRef(u17, "visible"), c30);
    return (o8, d6) => (openBlock(), createBlock(unref(i18), {
      visible: unref(i61),
      "onUpdate:visible": d6[0] || (d6[0] = (h16) => isRef(i61) ? i61.value = h16 : null),
      "append-to-body": o8.appendToBody,
      "show-mask": o8.showMask,
      "mask-close": o8.maskClose,
      "z-index": o8.zIndex,
      "mask-blur": o8.maskBlur,
      direction: o8.direction,
      "popup-size": o8.size,
      "on-open": o8.onOpen,
      "on-open-end": o8.onOpenEnd,
      "on-close": o8.onClose,
      "on-close-end": o8.onCloseEnd
    }, {
      default: withCtx(() => [
        createBaseVNode("div", E3, [
          createBaseVNode("header", V3, [
            renderSlot(o8.$slots, "header", {}, () => [
              createBaseVNode("span", $5, toDisplayString(o8.title), 1),
              o8.showCloseIcon ? (openBlock(), createBlock(unref(s8), {
                key: 0,
                icon: o8.closeIcon,
                "on-click": unref(k8)
              }, {
                default: withCtx(() => [
                  renderSlot(o8.$slots, "closeIcon")
                ]),
                _: 3
              }, 8, ["icon", "on-click"])) : createCommentVNode("", true)
            ])
          ]),
          o8.$slots.default ? (openBlock(), createElementBlock("section", F2, [
            renderSlot(o8.$slots, "default")
          ])) : createCommentVNode("", true),
          o8.$slots.footer ? (openBlock(), createElementBlock("footer", S4, [
            renderSlot(o8.$slots, "footer")
          ])) : createCommentVNode("", true)
        ])
      ]),
      _: 3
    }, 8, ["visible", "append-to-body", "show-mask", "mask-close", "z-index", "mask-blur", "direction", "popup-size", "on-open", "on-open-end", "on-close", "on-close-end"]));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/drawer/index.js
var i19 = n6(j2);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/empty/src/index3.js
var n8 = {
  content: p(),
  contentSize: s(),
  contentColor: p(),
  imageSrc: p(),
  imageSize: s(),
  background: p(),
  iconSize: s(30)
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-full-sharp/index.js
var c9 = {};
var n9 = {
  width: "32",
  height: "32",
  viewBox: "0 0 512 512"
};
var l6 = createBaseVNode("path", {
  fill: "currentColor",
  d: "M128 128h256v38H128zm-16 64h288v38H112z"
}, null, -1);
var _4 = createBaseVNode("path", {
  fill: "currentColor",
  d: "M448 64H64L32 256v192h448V256Zm-12 192H320a64 64 0 0 1-128 0H76l22-150h316Z"
}, null, -1);
var h4 = [
  l6,
  _4
];
function s15(i61, d6) {
  return openBlock(), createElementBlock("svg", n9, h4);
}
var m6 = s5(c9, [["render", s15]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/image/src/index3.js
var s16 = {
  src: p(),
  alt: p(),
  draggable: u(true),
  lazy: u(),
  rootMargin: s("100px"),
  width: s(),
  height: s(),
  block: u(),
  fit: p(null, (n26) => a2.includes(n26)),
  noSelect: u(),
  referrerPolicy: p(),
  round: s(),
  errSrc: p(),
  title: p(),
  onLoad: i2(),
  onError: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/image/src/index2.js
var D3 = ["draggable", "referrer-policy", "alt", "title"];
var I4 = {
  key: 1,
  class: "f-image__error"
};
var P6 = { class: "f-image__error-text" };
var B4 = defineComponent({
  name: "FImage"
});
var q3 = defineComponent({
  ...B4,
  props: s16,
  setup(p36) {
    const t6 = p36, { filter: u17 } = k(t6), { loadImg: _25, isSuccess: h16, isShowNode: y9 } = M(
      u17(["src", "errSrc", "rootMargin", "lazy", "onLoad", "onError"])
    ), i61 = ref();
    onMounted(() => {
      i61.value && _25(i61.value);
    });
    const b8 = computed(() => {
      const { fit: e9, noSelect: o8 } = t6;
      return [
        "f-image__img",
        {
          [`f-image__${e9}`]: e9,
          "f-image__select": o8
        }
      ];
    }), a56 = computed(() => {
      const { width: e9, height: o8, round: k8 } = t6;
      return {
        "--image-width": a3(e9),
        "--image-height": a3(o8),
        "--image-border-radius": a3(k8)
      };
    });
    return (e9, o8) => unref(h16) ? (openBlock(), createElementBlock("div", {
      key: 0,
      role: "img",
      class: normalizeClass(["f-image", { "f-image__block": e9.block }]),
      style: normalizeStyle(unref(a56))
    }, [
      createBaseVNode("img", {
        ref_key: "imageEl",
        ref: i61,
        src: "",
        class: normalizeClass(unref(b8)),
        style: normalizeStyle((unref(a56), unref(y9) ? "" : "visibility: hidden")),
        draggable: e9.draggable,
        "referrer-policy": e9.referrerPolicy,
        alt: e9.alt,
        title: e9.title
      }, null, 14, D3)
    ], 6)) : (openBlock(), createElementBlock("div", I4, [
      renderSlot(e9.$slots, "error", {}, () => [
        createBaseVNode("span", P6, toDisplayString(e9.alt || "加载失败"), 1)
      ])
    ]));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/image/index.js
var i20 = n6(q3);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/empty/src/index2.js
var w4 = { class: "f-empty__wrapper" };
var B5 = { class: "f-empty__content" };
var C3 = {
  key: 0,
  class: "f-empty__footer"
};
var E4 = defineComponent({
  name: "FEmpty"
});
var q4 = defineComponent({
  ...E4,
  props: n8,
  setup(l20) {
    const r32 = l20, { styles: p36 } = P(r32, "empty"), { getLang: a56 } = T(), f10 = computed(() => r32.content || a56("empty").value.content), d6 = p36(["contentColor", "contentSize", "background"]);
    return (e9, I11) => (openBlock(), createElementBlock("div", {
      class: "f-empty",
      style: normalizeStyle(unref(d6))
    }, [
      createBaseVNode("div", w4, [
        e9.$slots.default ? renderSlot(e9.$slots, "default", { key: 0 }) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
          e9.imageSrc ? (openBlock(), createBlock(unref(i20), {
            key: 0,
            src: e9.imageSrc,
            width: e9.imageSize
          }, null, 8, ["src", "width"])) : (openBlock(), createBlock(unref(a4), {
            key: 1,
            icon: unref(m6),
            size: e9.iconSize
          }, null, 8, ["icon", "size"]))
        ], 64))
      ]),
      createBaseVNode("span", B5, toDisplayString(unref(f10)), 1),
      e9.$slots.footer ? (openBlock(), createElementBlock("div", C3, [
        renderSlot(e9.$slots, "footer")
      ])) : createCommentVNode("", true)
    ], 4));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/empty/index.js
var p10 = n6(q4);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/expand-card/src/index3.js
var n10 = {
  imageList: y([]),
  round: u(),
  expandIndex: l(0),
  color: p(),
  vertical: u(),
  width: s(),
  height: s()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/expand-card/src/index2.js
var A2 = ["onClick"];
var B6 = defineComponent({
  name: "FExpandCard"
});
var j3 = defineComponent({
  ...B6,
  props: n10,
  setup(f10) {
    const s44 = f10, { classes: _25, styles: x5 } = P(s44, "expand-card"), i61 = ref(s44.expandIndex), y9 = (e9) => {
      i61.value = e9;
    }, d6 = computed(() => {
      const { imageList: e9 } = s44;
      return !e9 || !e9.length || !b(e9) ? [] : e9.map((t6) => e(t6) ? { url: t6 } : t6);
    }), g5 = _25(["round", "vertical"], "f-expand-card"), h16 = x5(["width", "height", "color"]);
    return (e9, t6) => unref(d6).length ? (openBlock(), createElementBlock("div", {
      key: 0,
      class: normalizeClass(unref(g5)),
      style: normalizeStyle(unref(h16))
    }, [
      (openBlock(true), createElementBlock(Fragment, null, renderList(unref(d6), (a56, c30) => (openBlock(), createElementBlock("div", {
        key: c30,
        class: normalizeClass(["f-expand-card__item", { "f-expand-card__active": c30 === i61.value }]),
        style: normalizeStyle({ backgroundImage: `url(${a56.url})` }),
        onClick: (F11) => y9(c30)
      }, [
        a56.text ? (openBlock(), createElementBlock("h3", {
          key: 0,
          class: "f-expand-card__title",
          style: normalizeStyle({ color: e9.color })
        }, toDisplayString(a56.text), 5)) : createCommentVNode("", true)
      ], 14, A2))), 128))
    ], 6)) : createCommentVNode("", true);
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/expand-card/index.js
var i21 = n6(j3);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/footer/src/index3.js
var p11 = {
  height: s(),
  padding: s()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/footer/src/index2.js
var u5 = defineComponent({
  name: "FFooter"
});
var B7 = defineComponent({
  ...u5,
  props: p11,
  setup(t6) {
    const e9 = t6, { styles: r32 } = P(e9, "footer"), s44 = r32(["height", "padding"]);
    return (n26, d6) => (openBlock(), createElementBlock("footer", {
      class: "f-footer",
      style: normalizeStyle(unref(s44))
    }, [
      renderSlot(n26.$slots, "default")
    ], 4));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/footer/index.js
var a16 = n6(B7);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/header/src/index3.js
var p12 = {
  height: s(),
  padding: s()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/header/src/index2.js
var f4 = defineComponent({
  name: "FHeader"
});
var B8 = defineComponent({
  ...f4,
  props: p12,
  setup(t6) {
    const r32 = t6, { styles: o8 } = P(r32, "header"), s44 = o8(["height", "padding"]);
    return (n26, u17) => (openBlock(), createElementBlock("header", {
      role: "banner",
      class: "f-header",
      style: normalizeStyle(unref(s44))
    }, [
      renderSlot(n26.$slots, "default")
    ], 4));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/header/index.js
var i22 = n6(B8);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/image-preview/src/index3.js
var i23 = {
  visible: u(),
  imgList: y([]),
  modalClose: u(true),
  appendToBody: u(),
  isCloseBtn: u(true),
  showIndex: l(0),
  zIndex: l(),
  isOption: u(true),
  round: p(),
  onClose: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/toolbar/src/index3.js
var m7 = {
  round: u(),
  size: p("middle", (e9) => n2.includes(e9)),
  background: p(),
  textColor: p(),
  fixed: u(),
  width: s(),
  height: s(),
  onClick: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/toolbar/src/index2.js
var y4 = defineComponent({
  name: "FToolbar"
});
var F3 = defineComponent({
  ...y4,
  props: m7,
  setup(l20) {
    const e9 = l20, n26 = useSlots(), { classes: a56, styles: i61 } = P(e9, "toolbar"), c30 = a56(["size", "round", "fixed"], "f-toolbar"), m22 = i61(["textColor", "background", "width", "height"]), f10 = (t6) => {
      if (!n26.default)
        return;
      const o8 = t6.target;
      if (o8.className === "f-toolbar-item") {
        const d6 = o8.dataset.index;
        o3(e9.onClick, { evt: t6, index: d6 });
      }
    };
    return (t6, o8) => (openBlock(), createElementBlock("div", {
      role: "toolbar",
      class: normalizeClass(unref(c30)),
      style: normalizeStyle(unref(m22)),
      onClick: f10
    }, [
      renderSlot(t6.$slots, "default")
    ], 6));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/toolbar/index.js
var i24 = n6(F3);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/toolbar-item/src/index3.js
var p13 = {
  color: p(),
  icon: c2(),
  iconSize: s(16),
  index: s(),
  onClick: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/toolbar-item/src/index2.js
var k2 = ["data-index"];
var C4 = defineComponent({
  name: "FToolbarItem"
});
var F4 = defineComponent({
  ...C4,
  props: p13,
  setup(r32) {
    const t6 = r32, i61 = (o8) => {
      o3(t6.onClick, o8);
    };
    return (o8, z10) => (openBlock(), createElementBlock("span", {
      class: "f-toolbar-item",
      "data-index": o8.index,
      style: normalizeStyle({ color: o8.color }),
      onClick: i61
    }, [
      o8.icon ? (openBlock(), createBlock(unref(a4), {
        key: 0,
        size: o8.iconSize,
        icon: o8.icon
      }, null, 8, ["size", "icon"])) : createCommentVNode("", true),
      renderSlot(o8.$slots, "default")
    ], 12, k2));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/toolbar-item/index.js
var i25 = n6(F4);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-layout-rows/index.js
var r8 = {};
var c10 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s17 = createBaseVNode("path", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5",
  d: "M1.75 2.75h12.5v10.5H1.75zM2 8h12"
}, null, -1);
var i26 = [
  s17
];
function _5(d6, l20) {
  return openBlock(), createElementBlock("svg", c10, i26);
}
var m8 = s5(r8, [["render", _5]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-rotate-anti-clockwise/index.js
var r9 = {};
var c11 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s18 = createBaseVNode("path", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5",
  d: "M4.75 5.25h-3m0 3.5c0 2.5 2.798 5.5 6.25 5.5a6.25 6.25 0 1 0 0-12.5c-3.75 0-6.25 3.5-6.25 3.5v-3.5"
}, null, -1);
var i27 = [
  s18
];
function _6(l20, d6) {
  return openBlock(), createElementBlock("svg", c11, i27);
}
var m9 = s5(r9, [["render", _6]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-rotate-clockwise/index.js
var r10 = {};
var c12 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s19 = createBaseVNode("path", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5",
  d: "M11.25 5.25h3m0 3.5c0 2.5-2.798 5.5-6.25 5.5a6.25 6.25 0 1 1 0-12.5c3.75 0 6.25 3.5 6.25 3.5v-3.5"
}, null, -1);
var i28 = [
  s19
];
function _7(l20, d6) {
  return openBlock(), createElementBlock("svg", c12, i28);
}
var m10 = s5(r10, [["render", _7]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-zoom-in/index.js
var n11 = {};
var c13 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s20 = createBaseVNode("g", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5"
}, [
  createBaseVNode("circle", {
    cx: "7.5",
    cy: "7.5",
    r: "4.75"
  }),
  createBaseVNode("path", { d: "M9.25 7.5h-3.5M7.5 5.75v3.5m3.75 2l3 3" })
], -1);
var i29 = [
  s20
];
function _8(d6, l20) {
  return openBlock(), createElementBlock("svg", c13, i29);
}
var a17 = s5(n11, [["render", _8]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-zoom-out/index.js
var c14 = {};
var n12 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s21 = createBaseVNode("g", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5"
}, [
  createBaseVNode("circle", {
    cx: "7.5",
    cy: "7.5",
    r: "4.75"
  }),
  createBaseVNode("path", { d: "M9.25 7.5h-3.5m5.5 3.75l3 3" })
], -1);
var i30 = [
  s21
];
function _9(d6, l20) {
  return openBlock(), createElementBlock("svg", n12, i30);
}
var a18 = s5(c14, [["render", _9]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-operation-img/index.js
var p14 = () => {
  const e9 = ref(1), o8 = ref(0), t6 = () => {
    i3(e9.value, 1) >= 0.2 && (e9.value -= 0.2);
  }, r32 = () => {
    e9.value <= 10 && (e9.value += 0.2);
  };
  return {
    scale: e9,
    rotate: o8,
    smaller: t6,
    bigger: r32,
    scrollZoom: (l20) => {
      l20.preventDefault(), l20.deltaY > 1 ? t6() : r32();
    },
    recovery: () => {
      e9.value = 1, o8.value = 0;
    },
    rotateClockwise: () => {
      o8.value += 90;
    },
    rotateCounterClock: () => {
      o8.value -= 90;
    }
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/image-preview/src/index2.js
var Y2 = createBaseVNode("div", { class: "f-image-preview__mask" }, null, -1);
var ee2 = ["onClick"];
var oe = { class: "f-image-preview__wrapper" };
var ie = ["src"];
var ne = defineComponent({
  name: "FImagePreview"
});
var Ce = defineComponent({
  ...ne,
  props: i23,
  emits: {
    [e5]: (c30) => i(c30)
  },
  setup(c30, { emit: F11 }) {
    const r32 = c30, { scale: V7, rotate: x5, smaller: L7, bigger: y9, scrollZoom: f10, recovery: u17, rotateClockwise: B17, rotateCounterClock: E9 } = p14(), t6 = ref(r32.showIndex > r32.imgList.length - 1 ? 0 : r32.showIndex), R8 = () => {
      b(r32.imgList) && r32.imgList.forEach((o8) => {
        const i61 = new Image();
        i61.src = o8;
      });
    }, d6 = (o8) => {
      u17();
      const i61 = {
        next: () => {
          if (t6.value < r32.imgList.length - 1) {
            t6.value++;
            return;
          }
          t6.value = 0;
        },
        prev: () => {
          if (t6.value > 0) {
            t6.value--;
            return;
          }
          t6.value = r32.imgList.length - 1;
        }
      };
      i61[o8] && i61[o8]();
    }, T9 = (o8) => {
      if (!o8.index)
        return;
      const i61 = {
        1: () => L7(),
        2: () => y9(),
        3: () => u17(),
        4: () => B17(),
        5: () => E9()
      };
      i61[o8.index] && i61[o8.index]();
    }, g5 = (o8) => {
      F11(e5, false), o3(r32.onClose, o8);
    };
    return (o8, i61) => (openBlock(), createBlock(Teleport, {
      to: "body",
      disabled: !o8.appendToBody
    }, [
      createVNode(Transition, {
        name: "f-image-preview__transition",
        onBeforeEnter: R8
      }, {
        default: withCtx(() => [
          withDirectives(createBaseVNode("div", {
            class: "f-image-preview",
            style: normalizeStyle({ zIndex: o8.zIndex }),
            onMousewheel: i61[0] || (i61[0] = (...M9) => unref(f10) && unref(f10)(...M9))
          }, [
            Y2,
            createBaseVNode("div", {
              class: "f-image-preview__container",
              onClick: withModifiers(g5, ["self"])
            }, [
              createVNode(Transition, { name: "f-image-preview__wrapper-transition" }, {
                default: withCtx(() => [
                  withDirectives(createBaseVNode("div", oe, [
                    createBaseVNode("img", {
                      class: "f-image-preview__node",
                      draggable: "false",
                      src: o8.imgList[t6.value],
                      style: normalizeStyle({
                        transform: `scale(${unref(V7)}) rotate(${unref(x5)}deg)`,
                        borderRadius: o8.round
                      })
                    }, null, 12, ie)
                  ], 512), [
                    [vShow, o8.visible]
                  ])
                ]),
                _: 1
              }),
              o8.isOption ? (openBlock(), createBlock(unref(i24), {
                key: 0,
                class: "f-image-preview__option",
                round: "",
                "on-click": T9
              }, {
                default: withCtx(() => [
                  createVNode(unref(i25), {
                    icon: unref(a18),
                    index: 1
                  }, null, 8, ["icon"]),
                  createVNode(unref(i25), {
                    icon: unref(a17),
                    index: 2
                  }, null, 8, ["icon"]),
                  createVNode(unref(i25), {
                    icon: unref(m8),
                    index: 3
                  }, null, 8, ["icon"]),
                  createVNode(unref(i25), {
                    icon: unref(m10),
                    index: 4
                  }, null, 8, ["icon"]),
                  createVNode(unref(i25), {
                    icon: unref(m9),
                    index: 5
                  }, null, 8, ["icon"])
                ]),
                _: 1
              })) : createCommentVNode("", true),
              o8.imgList.length > 1 ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                createVNode(unref(a10), {
                  class: "f-image-preview__next",
                  circle: "",
                  "before-icon": unref(a8),
                  "on-click": () => d6("next")
                }, null, 8, ["before-icon", "on-click"]),
                createVNode(unref(a10), {
                  class: "f-image-preview__prev",
                  circle: "",
                  "before-icon": unref(m4),
                  "on-click": () => d6("prev")
                }, null, 8, ["before-icon", "on-click"])
              ], 64)) : createCommentVNode("", true),
              createVNode(unref(a10), {
                class: "f-image-preview__close",
                circle: "",
                "before-icon": unref(a5),
                "on-click": g5
              }, null, 8, ["before-icon"])
            ], 8, ee2)
          ], 36), [
            [vShow, o8.visible]
          ])
        ]),
        _: 1
      })
    ], 8, ["disabled"]));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/image-preview/index.js
var a19 = n6(Ce);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/layout/src/index3.js
var n13 = {
  direction: p(null, (r32) => ["horizontal", "vertical"].includes(r32))
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/layout/src/index2.js
var v4 = defineComponent({
  name: "FLayout"
});
var h5 = defineComponent({
  ...v4,
  props: n13,
  setup(a56) {
    const t6 = a56, e9 = useSlots(), l20 = computed(() => t6.direction === "vertical" ? true : t6.direction === "horizontal" ? false : e9 && e9.default ? e9.default().some((r32) => {
      const n26 = r32.type.name;
      return n26 === "FHeader" || n26 === "FFooter";
    }) : false);
    return (o8, r32) => (openBlock(), createElementBlock("section", {
      class: normalizeClass([
        "f-layout",
        {
          "f-layout__vertical": unref(l20)
        }
      ])
    }, [
      renderSlot(o8.$slots, "default")
    ], 2));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/layout/index.js
var i31 = n6(h5);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/link/src/index3.js
var P7 = {
  type: p(null, (r32) => e2.includes(r32)),
  href: p(),
  size: s(),
  state: p(null, (r32) => ["line", "background"].includes(r32)),
  disabled: u(),
  target: p("_self", (r32) => o2.includes(r32)),
  color: p(),
  hoverColor: p(),
  noCopy: u(),
  noLink: u(),
  beforeIcon: c2(),
  afterIcon: c2(),
  onClick: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/link/src/index2.js
var _10 = ["href", "target"];
var E5 = defineComponent({
  name: "FLink"
});
var j4 = defineComponent({
  ...E5,
  props: P7,
  setup(a56) {
    const o8 = a56, { getType: c30 } = T(o8), m22 = reactive({
      ...toRefs(o8),
      type: c30("primary")
    }), { classes: f10, styles: p36 } = P(m22, "link"), u17 = (e9) => {
      if (o8.disabled || o8.noLink) {
        e9.preventDefault();
        return;
      }
      o3(o8.onClick, e9);
    }, d6 = f10(["type", "state", "disabled", "noCopy"], "f-link"), k8 = p36(["size", "color", "hoverColor"]);
    return (e9, F11) => (openBlock(), createElementBlock("div", {
      role: "link",
      class: normalizeClass(unref(d6)),
      style: normalizeStyle(unref(k8))
    }, [
      createBaseVNode("a", {
        class: "f-link__a",
        href: e9.href,
        target: e9.target,
        onClick: u17
      }, [
        e9.beforeIcon ? (openBlock(), createBlock(unref(a4), {
          key: 0,
          icon: e9.beforeIcon,
          size: e9.size
        }, null, 8, ["icon", "size"])) : createCommentVNode("", true),
        renderSlot(e9.$slots, "default"),
        e9.afterIcon ? (openBlock(), createBlock(unref(a4), {
          key: 1,
          icon: e9.afterIcon,
          size: e9.size
        }, null, 8, ["icon", "size"])) : createCommentVNode("", true)
      ], 8, _10)
    ], 6));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/link/index.js
var a20 = n6(j4);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/list/src/index3.js
var l7 = {
  zebra: u(),
  center: u(),
  textColor: p(),
  borderColor: p(),
  size: p("middle", (e9) => n2.includes(e9)),
  maxHeight: s(),
  zebraColor: p()
};
var n14 = Symbol("list-props-key");

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/list/src/index2.js
var C5 = {
  key: 0,
  class: "f-list__header"
};
var L4 = {
  key: 1,
  class: "f-list__footer"
};
var $6 = defineComponent({
  name: "FList"
});
var g = defineComponent({
  ...$6,
  props: l7,
  setup(n26) {
    const r32 = n26;
    provide(n14, r32);
    const { classes: c30, styles: m22 } = P(r32, "list"), f10 = m22(["borderColor", "maxHeight", "zebraColor"]), p36 = c30(["zebra", "center", "size"], "f-list");
    return (e9, k8) => (openBlock(), createElementBlock("ul", {
      role: "list",
      class: normalizeClass(unref(p36)),
      style: normalizeStyle(unref(f10))
    }, [
      e9.$slots.header ? (openBlock(), createElementBlock("header", C5, [
        renderSlot(e9.$slots, "header")
      ])) : createCommentVNode("", true),
      renderSlot(e9.$slots, "default"),
      e9.$slots.footer ? (openBlock(), createElementBlock("footer", L4, [
        renderSlot(e9.$slots, "footer")
      ])) : createCommentVNode("", true)
    ], 6));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/list/index.js
var s22 = n6(g);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/list-item/src/index3.js
var p15 = {
  background: p(),
  color: p()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/list-item/src/index2.js
var b4 = defineComponent({
  name: "FListItem"
});
var P8 = defineComponent({
  ...b4,
  props: p15,
  setup(r32) {
    const t6 = r32, o8 = inject(n14, null), { styles: l20 } = P(
      reactive({
        borderColor: o8 && o8.borderColor,
        textColor: t6.color || o8 && o8.textColor,
        background: t6.background
      }),
      "list-item"
    ), s44 = l20(["textColor", "borderColor", "background"]);
    return (n26, k8) => (openBlock(), createElementBlock("li", {
      role: "listitem",
      class: "f-list-item",
      style: normalizeStyle(unref(s44))
    }, [
      renderSlot(n26.$slots, "default")
    ], 4));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/list-item/index.js
var s23 = n6(P8);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/main/src/index3.js
var t3 = {
  padding: s()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/main/src/index2.js
var L5 = defineComponent({
  props: t3,
  setup(t6) {
    const e9 = t6, { styles: o8 } = P(e9, "main"), r32 = o8(["padding"]);
    return (n26, u17) => (openBlock(), createElementBlock("main", {
      role: "main",
      class: "f-main",
      style: normalizeStyle(unref(r32))
    }, [
      renderSlot(n26.$slots, "default")
    ], 4));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/main/index.js
var a21 = n6(L5);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/message/src/index3.js
var s24 = {
  id: p(),
  message: {
    type: [String, Object],
    default: () => null,
    required: true
  },
  type: p("default", (e9) => e2.includes(e9)),
  close: u(),
  duration: l(3e3),
  round: u(),
  icon: c2(),
  color: p(),
  background: p(),
  offset: l(20),
  placement: p("top", (e9) => ["top", "top-left", "top-right", "bottom", "bottom-left", "bottom-right"].includes(e9)),
  zIndex: l(),
  closeBtn: {
    type: [String, Object],
    default: () => null
  },
  onClose: {
    type: Function,
    default: () => null
  }
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-eject/index.js
var H2 = (e9, s44, u17) => {
  const n26 = ref(0), o8 = ref(false), l20 = ref(), { classes: g5, styles: b8 } = P(e9, s44), { getSiblingOffset: x5, removeInstance: T9 } = N(), y9 = g5(["type", "placement", "round"], `f-${s44}`), h16 = b8(["color", "background", "zIndex"], "zIndex");
  onMounted(() => {
    nextTick(() => {
      n26.value = u17.value ? u17.value.getBoundingClientRect().height : 0;
    });
  });
  const m22 = computed(() => e9.placement.includes(s44 === "message" ? "top" : "right")), I11 = computed(() => x5(e9.placement, e9.id, !m22.value)), i61 = computed(() => e9.offset + I11.value), L7 = computed(() => n26.value + i61.value), M9 = computed(() => {
    const c30 = {};
    return e9.placement.includes("bottom") ? c30.bottom = i61.value + "px" : c30.top = i61.value + "px", c30;
  }), r32 = () => {
    !l20.value || clearTimeout(l20.value);
  }, f10 = () => {
    r32(), o8.value = false;
  }, k8 = () => {
    T9(e9.placement, e9.id);
  }, v9 = () => {
    !e9.duration || (l20.value = setTimeout(() => {
      f10();
    }, e9.duration));
  };
  return onMounted(() => {
    v9(), o8.value = true;
  }), {
    classList: y9,
    styleList: h16,
    elHeight: n26,
    bottom: L7,
    offsetStyle: M9,
    isPosition: m22,
    visible: o8,
    clearTimer: r32,
    closeMessage: f10,
    closeMessageEnd: k8,
    startTime: v9
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/message/src/index2.js
var J5 = {
  key: 2,
  class: "f-message__text"
};
var K3 = defineComponent({
  name: "FMessage"
});
var h6 = defineComponent({
  ...K3,
  props: s24,
  emits: {
    destroy: () => true
  },
  setup(B17, { expose: C9, emit: M9 }) {
    const f10 = B17, p36 = ref(), {
      classList: E9,
      styleList: F11,
      bottom: S9,
      offsetStyle: L7,
      isPosition: z10,
      visible: d6,
      clearTimer: g5,
      closeMessage: i61,
      closeMessageEnd: N10,
      startTime: c30
    } = H2(f10, "message", p36);
    return C9({
      visible: d6,
      bottom: S9,
      close: i61
    }), (o8, t6) => (openBlock(), createBlock(Transition, {
      mode: "out-in",
      name: "f-message-fade" + (unref(z10) ? "-top" : "-bottom"),
      onBeforeLeave: unref(N10),
      onAfterLeave: t6[3] || (t6[3] = (r32) => M9("destroy"))
    }, {
      default: withCtx(() => [
        withDirectives(createBaseVNode("div", {
          ref_key: "FMessageEl",
          ref: p36,
          class: normalizeClass(unref(E9)),
          style: normalizeStyle([unref(F11), unref(L7)]),
          onMouseleave: t6[1] || (t6[1] = (...r32) => unref(c30) && unref(c30)(...r32)),
          onMouseenter: t6[2] || (t6[2] = (...r32) => unref(g5) && unref(g5)(...r32))
        }, [
          isVNode(o8.icon) ? (openBlock(), createBlock(unref(a4), {
            key: 0,
            size: 24,
            class: "f-message__icon"
          }, {
            default: withCtx(() => [
              (openBlock(), createBlock(resolveDynamicComponent(o8.icon)))
            ]),
            _: 1
          })) : createCommentVNode("", true),
          isVNode(o8.message) ? (openBlock(), createBlock(resolveDynamicComponent(o8.message), { key: 1 })) : (openBlock(), createElementBlock("div", J5, toDisplayString(o8.message), 1)),
          f10.close ? (openBlock(), createElementBlock("div", {
            key: 3,
            class: "f-message__close",
            onClick: t6[0] || (t6[0] = (...r32) => unref(i61) && unref(i61)(...r32))
          }, [
            unref(e)(o8.closeBtn) ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
              createTextVNode(toDisplayString(o8.closeBtn), 1)
            ], 64)) : (openBlock(), createBlock(unref(s8), {
              key: 1,
              size: 16
            }, {
              default: withCtx(() => [
                (openBlock(), createBlock(resolveDynamicComponent(o8.closeBtn)))
              ]),
              _: 1
            }))
          ])) : createCommentVNode("", true)
        ], 38), [
          [vShow, unref(d6)]
        ])
      ]),
      _: 1
    }, 8, ["name", "onBeforeLeave"]));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/message/index.js
var { renderInstance: r11 } = N(h6);
var a22 = r3(r11, "FMessage");

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/notification/src/index3.js
var c15 = {
  id: p(),
  title: {
    type: [String, Object],
    default: () => null
  },
  message: {
    type: [String, Object],
    default: () => null,
    required: true
  },
  type: p("default", (e9) => e2.includes(e9)),
  close: u(),
  duration: l(3e3),
  round: u(),
  showIcon: u(true),
  icon: c2(),
  color: p(),
  background: p(),
  offset: l(20),
  placement: p("top-right", (e9) => ["top-left", "top-right", "bottom-left", "bottom-right"].includes(e9)),
  zIndex: l(),
  closeBtn: {
    type: [String, Object],
    default: () => null
  },
  onClose: {
    type: Function,
    default: () => null
  }
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-circle-cross/index.js
var c16 = {};
var n15 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s25 = createBaseVNode("g", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5"
}, [
  createBaseVNode("path", { d: "m10.25 5.75l-4.5 4.5m0-4.5l4.5 4.5" }),
  createBaseVNode("circle", {
    cx: "8",
    cy: "8",
    r: "6.25"
  })
], -1);
var i32 = [
  s25
];
function l8(_25, d6) {
  return openBlock(), createElementBlock("svg", n15, i32);
}
var a23 = s5(c16, [["render", l8]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-lightbulb/index.js
var r12 = {};
var c17 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s26 = createBaseVNode("path", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5",
  d: "M6.75 14.25h2.5M8 1.75c-2.75 0-4.25 2-4.25 4s2 2.5 2 4.5v1h4.5v-1c0-2 2-2.5 2-4.5s-1.5-4-4.25-4z"
}, null, -1);
var i33 = [
  s26
];
function _11(l20, d6) {
  return openBlock(), createElementBlock("svg", c17, i33);
}
var u6 = s5(r12, [["render", _11]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-smile-line/index.js
var n16 = {};
var r13 = {
  width: "32",
  height: "32",
  viewBox: "0 0 24 24"
};
var l9 = createBaseVNode("path", {
  fill: "currentColor",
  d: "M7.291 20.824L2 22l1.176-5.291A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10s-4.477 10-10 10a9.956 9.956 0 0 1-4.709-1.176zm.29-2.113l.653.35A7.955 7.955 0 0 0 12 20a8 8 0 1 0-8-8c0 1.334.325 2.618.94 3.766l.349.653l-.655 2.947l2.947-.655zM7 12h2a3 3 0 0 0 6 0h2a5 5 0 0 1-10 0z"
}, null, -1);
var s27 = [
  l9
];
function _12(i61, a56) {
  return openBlock(), createElementBlock("svg", r13, s27);
}
var m11 = s5(n16, [["render", _12]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-thumb-up/index.js
var r14 = {};
var c18 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s28 = createBaseVNode("path", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5",
  d: "M5.25 5.75c1.5 0 3-4 4.5-4v4h4.5s-.5 7.5-3.5 7.5h-5.5zm0 0h-3.5v7.5h3.5"
}, null, -1);
var i34 = [
  s28
];
function h7(_25, d6) {
  return openBlock(), createElementBlock("svg", c18, i34);
}
var u7 = s5(r14, [["render", h7]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-warning/index.js
var r15 = {};
var c19 = {
  width: "32",
  height: "32",
  viewBox: "0 0 32 32"
};
var l10 = createBaseVNode("path", {
  fill: "currentColor",
  d: "M16 23a1.5 1.5 0 1 0 1.5 1.5A1.5 1.5 0 0 0 16 23zm-1-11h2v9h-2z"
}, null, -1);
var _13 = createBaseVNode("path", {
  fill: "currentColor",
  d: "M29 30H3a1 1 0 0 1-.887-1.461l13-25a1 1 0 0 1 1.774 0l13 25A1 1 0 0 1 29 30ZM4.65 28h22.7l.001-.003L16.002 6.17h-.004L4.648 27.997Z"
}, null, -1);
var s29 = [
  l10,
  _13
];
function h8(i61, a56) {
  return openBlock(), createElementBlock("svg", c19, s29);
}
var m12 = s5(r15, [["render", h8]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/notification/src/index2.js
var X2 = {
  key: 0,
  class: "f-notification__icon"
};
var Y3 = { class: "f-notification__info" };
var Z = { class: "f-notification__title" };
var x = {
  key: 1,
  class: "f-notification__title-text"
};
var ee3 = {
  key: 1,
  class: "f-notification__text"
};
var oe2 = defineComponent({
  name: "FNotification"
});
var ye = defineComponent({
  ...oe2,
  props: c15,
  emits: {
    destroy: () => true
  },
  setup(F11, { expose: V7, emit: C9 }) {
    const n26 = F11, m22 = ref(), {
      classList: B17,
      styleList: N10,
      bottom: I11,
      offsetStyle: L7,
      visible: u17,
      isPosition: S9,
      clearTimer: p36,
      closeMessage: a56,
      closeMessageEnd: h16,
      startTime: d6
    } = H2(n26, "notification", m22), y9 = computed(() => n26.icon ? n26.icon : n26.type ? {
      default: m11,
      primary: u6,
      success: u7,
      danger: a23,
      warning: m12,
      info: null
    }[n26.type] : null);
    return V7({
      visible: u17,
      bottom: I11,
      close: a56
    }), (o8, i61) => (openBlock(), createBlock(Transition, {
      mode: "out-in",
      name: "f-notification-fade" + (unref(S9) ? "-right" : "-left"),
      onBeforeLeave: unref(h16),
      onAfterLeave: i61[3] || (i61[3] = (s44) => C9("destroy"))
    }, {
      default: withCtx(() => [
        withDirectives(createBaseVNode("div", {
          ref_key: "FNotificationEl",
          ref: m22,
          class: normalizeClass(unref(B17)),
          style: normalizeStyle([unref(L7), unref(N10)]),
          onMouseleave: i61[1] || (i61[1] = (...s44) => unref(d6) && unref(d6)(...s44)),
          onMouseenter: i61[2] || (i61[2] = (...s44) => unref(p36) && unref(p36)(...s44))
        }, [
          o8.showIcon && unref(y9) ? (openBlock(), createElementBlock("div", X2, [
            createVNode(unref(a4), {
              icon: unref(y9),
              size: 28
            }, null, 8, ["icon"])
          ])) : createCommentVNode("", true),
          createBaseVNode("div", Y3, [
            createBaseVNode("div", Z, [
              isVNode(o8.title) ? (openBlock(), createBlock(resolveDynamicComponent(o8.title), { key: 0 })) : (openBlock(), createElementBlock("h3", x, toDisplayString(o8.title), 1))
            ]),
            isVNode(o8.message) ? (openBlock(), createBlock(resolveDynamicComponent(o8.message), { key: 0 })) : (openBlock(), createElementBlock("div", ee3, toDisplayString(o8.message), 1))
          ]),
          n26.close ? (openBlock(), createElementBlock("div", {
            key: 1,
            class: "f-notification__close",
            onClick: i61[0] || (i61[0] = (...s44) => unref(a56) && unref(a56)(...s44))
          }, [
            unref(e)(o8.closeBtn) ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
              createTextVNode(toDisplayString(o8.closeBtn), 1)
            ], 64)) : (openBlock(), createBlock(unref(s8), {
              key: 1,
              size: 16
            }))
          ])) : createCommentVNode("", true)
        ], 38), [
          [vShow, unref(u17)]
        ])
      ]),
      _: 1
    }, 8, ["name", "onBeforeLeave"]));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/notification/index.js
var { renderInstance: r16 } = N(ye);
var a24 = r3(r16, "FMessage");

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/page-header/src/index3.js
var l11 = {
  icon: c2(),
  iconSize: s("16px"),
  backText: p(),
  title: p(),
  titleBold: u(),
  titleColor: p(),
  titleCenter: u(),
  subtitle: p(),
  onBack: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-arrow-left/index.js
var n17 = {};
var c20 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s30 = createBaseVNode("path", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5",
  d: "m7.25 3.75l-4.5 4.5l4.5 4.5m6-4.5H2.75"
}, null, -1);
var i35 = [
  s30
];
function l12(_25, d6) {
  return openBlock(), createElementBlock("svg", c20, i35);
}
var h9 = s5(n17, [["render", l12]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/page-header/src/index2.js
var N6 = { class: "f-page-header" };
var $7 = { class: "f-page-header__text" };
var F5 = {
  key: 0,
  class: "f-page-header__main-subtitle"
};
var w5 = defineComponent({
  name: "FPageHeader"
});
var R2 = defineComponent({
  ...w5,
  props: l11,
  setup(m22) {
    const c30 = m22, { getLang: p36 } = T(), f10 = computed(() => p36("pageHeader").value.backText), u17 = (e9) => {
      o3(c30.onBack, e9);
    };
    return (e9, D7) => (openBlock(), createElementBlock("header", N6, [
      createBaseVNode("div", {
        class: "f-page-header__left",
        onClick: u17
      }, [
        createVNode(unref(a4), { size: e9.iconSize }, {
          default: withCtx(() => [
            renderSlot(e9.$slots, "icon", {}, () => [
              (openBlock(), createBlock(resolveDynamicComponent(e9.icon || unref(h9))))
            ])
          ]),
          _: 3
        }, 8, ["size"]),
        createBaseVNode("div", $7, toDisplayString(unref(f10)), 1)
      ]),
      createBaseVNode("div", {
        class: normalizeClass(["f-page-header__main", { "f-page-header__main-center": e9.titleCenter }])
      }, [
        createBaseVNode("div", {
          style: normalizeStyle({ color: e9.titleColor }),
          class: normalizeClass(["f-page-header__main-title", { "f-page-header__main-title-bold": e9.titleBold }])
        }, [
          renderSlot(e9.$slots, "title", {}, () => [
            createTextVNode(toDisplayString(e9.title), 1)
          ])
        ], 6),
        e9.subtitle || e9.$slots.subtitle ? (openBlock(), createElementBlock("div", F5, [
          renderSlot(e9.$slots, "subtitle", {}, () => [
            createTextVNode(toDisplayString(e9.subtitle), 1)
          ])
        ])) : createCommentVNode("", true)
      ], 2)
    ]));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/page-header/index.js
var e6 = n6(R2);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/progress/src/index3.js
var u8 = {
  percentage: l(0),
  type: p("primary", (e9) => e2.includes(e9)),
  height: s(),
  showText: u(true),
  outsideText: u(),
  textColor: p(),
  color: p(),
  background: p(),
  stripe: u()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/progress/src/index2.js
var k3 = ["aria-value"];
var w6 = { class: "f-progress__bar" };
var T5 = {
  key: 0,
  class: "f-progress__percentage"
};
var C6 = {
  key: 0,
  class: "f-progress__text"
};
var L6 = defineComponent({
  name: "FProgress"
});
var F6 = defineComponent({
  ...L6,
  props: u8,
  setup(c30) {
    const s44 = c30, { classes: m22, styles: g5 } = P(s44, "progress"), u17 = m22(["type", "stripe"], "f-progress"), d6 = g5(["height", "color", "textColor", "background"]), _25 = computed(() => {
      const { percentage: e9 } = s44;
      if (!c(e9))
        throw new TypeError("Fighting Design - progress: percentage is not a number");
      return { width: `${s44.percentage}%` };
    });
    return (e9, E9) => (openBlock(), createElementBlock("div", {
      role: "progressbar",
      class: normalizeClass(unref(u17)),
      style: normalizeStyle(unref(d6)),
      "aria-value": e9.percentage,
      "aria-valuemin": 0,
      "aria-valuemax": 100
    }, [
      createBaseVNode("div", w6, [
        createBaseVNode("div", {
          class: "f-progress__fill",
          style: normalizeStyle(unref(_25))
        }, [
          !e9.outsideText && e9.showText ? (openBlock(), createElementBlock("div", T5, toDisplayString(e9.percentage) + "%", 1)) : createCommentVNode("", true)
        ], 4)
      ]),
      e9.outsideText && e9.showText ? (openBlock(), createElementBlock("div", C6, toDisplayString(e9.percentage) + "%", 1)) : createCommentVNode("", true)
    ], 14, k3));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/progress/index.js
var i36 = n6(F6);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/radio/src/index3.js
var r17 = {
  modelValue: {
    type: [String, Number, Boolean],
    default: () => null
  },
  disabled: u(),
  name: p("f-radio"),
  label: {
    type: [String, Number, Boolean],
    default: () => null
  },
  onChange: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/radio-group/src/index3.js
var s31 = {
  modelValue: {
    type: [String, Number, Boolean],
    default: () => null
  },
  disabled: u(),
  vertical: u(),
  columnGap: s(),
  rowGap: s(),
  border: u(),
  size: p("middle", (e9) => n2.includes(e9)),
  onChange: i2()
};
var a25 = Symbol("radio-group-props-key");

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/radio/src/index2.js
var O4 = ["value", "disabled", "name"];
var T6 = {
  key: 0,
  class: "f-radio__circle"
};
var U2 = { class: "f-radio__text" };
var j5 = defineComponent({
  name: "FRadio"
});
var $8 = defineComponent({
  ...j5,
  props: r17,
  emits: {
    [t2]: (t6) => e(t6) || c(t6) || i(t6)
  },
  setup(t6, { emit: f10 }) {
    const r32 = t6, e9 = inject(a25, null), a56 = computed({
      get: () => e9 && e9.modelValue || r32.modelValue,
      set: (o8) => {
        if (e9 && !e9.disabled) {
          e9.changeEvent(o8);
          return;
        }
        r32.disabled || (f10(t2, o8), o3(r32.onChange, o8));
      }
    }), _25 = computed(() => [
      "f-radio",
      {
        "f-radio__checked": a56.value === r32.label,
        "f-radio__margin": !e9,
        "f-radio__disabled": r32.disabled || e9 && e9.disabled
      }
    ]);
    return (o8, l20) => {
      var n26;
      return openBlock(), createElementBlock("label", {
        role: "radio",
        "aria-checked": "false",
        tabindex: "0",
        class: normalizeClass(unref(_25))
      }, [
        withDirectives(createBaseVNode("input", {
          "onUpdate:modelValue": l20[0] || (l20[0] = (b8) => isRef(a56) ? a56.value = b8 : null),
          hidden: "",
          type: "radio",
          value: o8.label,
          disabled: o8.disabled,
          name: o8.name
        }, null, 8, O4), [
          [vModelRadio, unref(a56)]
        ]),
        (n26 = unref(e9)) != null && n26.border ? createCommentVNode("", true) : (openBlock(), createElementBlock("span", T6)),
        createBaseVNode("span", U2, [
          renderSlot(o8.$slots, "default", {}, () => [
            createTextVNode(toDisplayString(o8.label), 1)
          ])
        ])
      ], 2);
    };
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/radio/index.js
var a26 = n6($8);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/radio-group/src/index2.js
var C7 = defineComponent({
  name: "FRadioGroup"
});
var w7 = defineComponent({
  ...C7,
  props: s31,
  emits: {
    [t2]: (o8) => e(o8) || c(o8) || i(o8)
  },
  setup(o8, { emit: n26 }) {
    const e9 = o8, { styles: p36, classes: m22 } = P(e9, "radio-group"), a56 = (r32) => {
      n26(t2, r32), o3(e9.onChange, r32);
    };
    provide(
      a25,
      reactive({
        ...toRefs(e9),
        changeEvent: a56
      })
    );
    const c30 = m22(["vertical", "border", "size"], "f-radio-group"), l20 = p36(["columnGap", "rowGap"]);
    return (r32, L7) => (openBlock(), createElementBlock("div", {
      role: "radiogroup",
      class: normalizeClass(unref(c30)),
      style: normalizeStyle(unref(l20))
    }, [
      renderSlot(r32.$slots, "default")
    ], 6));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/radio-group/index.js
var a27 = n6(w7);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/rate/src/index3.js
var l13 = {
  modelValue: l(0),
  max: l(5),
  effectColor: p("#fcc202"),
  invalidColor: p("#eef"),
  readonly: u(),
  icon: c2(),
  size: s(25),
  textShow: u(),
  textColor: p(),
  textArr: y(["极差", "失望", "一般", "不错", "很棒"]),
  textSize: s(),
  onChange: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-star-b/index.js
var l14 = {};
var q5 = {
  width: "32",
  height: "32",
  viewBox: "0 0 24 24"
};
var r18 = createBaseVNode("path", {
  fill: "currentColor",
  d: "m12 18.275l-4.15 2.5q-.275.175-.575.15q-.3-.025-.525-.2q-.225-.175-.35-.437q-.125-.263-.05-.588l1.1-4.725L3.775 11.8q-.25-.225-.312-.513Q3.4 11 3.5 10.725q.1-.275.3-.45q.2-.175.55-.225l4.85-.425l1.875-4.45q.125-.3.388-.45q.262-.15.537-.15t.538.15q.262.15.387.45l1.875 4.45l4.85.425q.35.05.55.225q.2.175.3.45q.1.275.038.562q-.063.288-.313.513l-3.675 3.175l1.1 4.725q.075.325-.05.588q-.125.262-.35.437q-.225.175-.525.2q-.3.025-.575-.15Z"
}, null, -1);
var n18 = [
  r18
];
function _14(s44, i61) {
  return openBlock(), createElementBlock("svg", q5, n18);
}
var f5 = s5(l14, [["render", _14]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/text/src/index3.js
var s32 = {
  type: p(null, (o8) => e2.includes(o8)),
  size: s(),
  color: p(),
  background: p(),
  block: u(),
  spacing: s(),
  lineHeight: s(),
  indent: s(),
  bold: u(),
  decoration: p(null, (o8) => ["overline", "line-through", "underline"].includes(o8)),
  padding: s(),
  width: s(),
  ellipsis: u(),
  center: u()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/text/src/index2.js
var h10 = defineComponent({
  name: "FText"
});
var w8 = defineComponent({
  ...h10,
  props: s32,
  setup(s44) {
    const t6 = s44, { getType: r32 } = T(t6), n26 = reactive({
      ...toRefs(t6),
      type: r32()
    }), { classes: l20, styles: c30 } = P(n26, "text"), i61 = l20(["type", "block", "bold", "ellipsis", "center"], "f-text"), p36 = c30([
      "color",
      "background",
      "decoration",
      "width",
      "size",
      "padding",
      "spacing",
      "lineHeight",
      "indent"
    ]);
    return (a56, z10) => (openBlock(), createElementBlock("p", {
      class: normalizeClass(unref(i61)),
      style: normalizeStyle(unref(p36))
    }, [
      renderSlot(a56.$slots, "default")
    ], 6));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/text/index.js
var a28 = n6(w8);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/rate/src/index2.js
var P9 = {
  class: "f-rate",
  role: "slider"
};
var R3 = { class: "f-rate__list" };
var $9 = ["onMouseover", "onClick"];
var b5 = defineComponent({
  name: "FRate"
});
var Y4 = defineComponent({
  ...b5,
  props: l13,
  emits: {
    [t2]: (l20) => l20
  },
  setup(l20, { emit: c30 }) {
    const o8 = l20, t6 = ref(o8.modelValue), f10 = (e9) => {
      o8.readonly || (t6.value = e9);
    }, d6 = () => {
      o8.readonly || (t6.value = o8.modelValue);
    }, p36 = (e9) => {
      o8.readonly || (t6.value = e9, c30(t2, e9), o3(o8.onChange, e9));
    };
    watch(
      () => o8.modelValue,
      () => {
        t6.value = o8.modelValue;
      }
    );
    const v9 = computed(() => o8.textArr[unref(t6) - 1]), _25 = computed(() => c(o8.max) ? o8.max : 5);
    return (e9, U6) => (openBlock(), createElementBlock("div", P9, [
      createBaseVNode("div", R3, [
        (openBlock(true), createElementBlock(Fragment, null, renderList(unref(_25), (j9, n26) => (openBlock(), createElementBlock("div", {
          key: n26,
          class: normalizeClass(["f-rate__star", { "f-rate__star-readonly": e9.readonly }]),
          onMouseout: d6,
          onMouseover: (C9) => f10(n26 + 1),
          onClick: (C9) => p36(n26 + 1)
        }, [
          createVNode(unref(a4), {
            size: e9.size,
            icon: e9.icon || unref(f5),
            color: t6.value > n26 ? e9.effectColor : e9.invalidColor
          }, null, 8, ["size", "icon", "color"])
        ], 42, $9))), 128))
      ]),
      e9.textShow ? (openBlock(), createBlock(unref(a28), {
        key: 0,
        size: e9.textSize,
        color: e9.textColor
      }, {
        default: withCtx(() => [
          createTextVNode(toDisplayString(unref(v9)), 1)
        ]),
        _: 1
      }, 8, ["size", "color"])) : createCommentVNode("", true)
    ]));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/rate/index.js
var i37 = n6(Y4);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/ripple/src/index3.js
var l15 = {
  ripplesColor: p(),
  duration: l(400),
  type: p(null, (t6) => e2.includes(t6)),
  disabled: u(),
  startOpacity: l(),
  endOpacity: l()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/ripple/src/index2.js
var O5 = defineComponent({
  name: "Ripple"
});
var T7 = defineComponent({
  ...O5,
  props: l15,
  setup(n26) {
    const e9 = n26, { getType: p36 } = T(e9), a56 = reactive({
      ...toRefs(e9),
      type: p36("default")
    }), { styles: c30 } = P(a56, "ripple"), t6 = ref(), f10 = c30(["startOpacity", "endOpacity"], false), m22 = (o8) => {
      if (e9.disabled)
        return;
      const { ripplesColor: r32, duration: u17 } = toRefs(e9), d6 = reactive({
        duration: u17.value,
        component: "f-ripple",
        className: "f-ripple__animation",
        type: p36(),
        ripplesColor: r32.value
      });
      if (t6.value) {
        const { runRipples: y9 } = d(o8, t6.value, d6);
        y9();
      }
    };
    return (o8, r32) => (openBlock(), createElementBlock("div", {
      ref_key: "rippleEl",
      ref: t6,
      class: "f-ripple",
      style: normalizeStyle(unref(f10)),
      onClick: m22
    }, [
      renderSlot(o8.$slots, "default")
    ], 4));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/ripple/index.js
var r19 = n6(T7);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/skeleton/src/index3.js
var s33 = {
  round: u(),
  animated: u(),
  rows: l(1),
  loading: u(),
  size: p("middle", (r32) => n2.includes(r32))
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/skeleton/src/index2.js
var S5 = defineComponent({
  name: "FSkeleton"
});
var v5 = defineComponent({
  ...S5,
  props: s33,
  setup(l20) {
    const t6 = l20, { classes: u17 } = P(t6, "skeleton"), a56 = u17(["round", "animated", "size"], "f-skeleton"), i61 = computed(() => useSlots().default ? t6.loading === true : true);
    return (e9, g5) => unref(i61) ? (openBlock(true), createElementBlock(Fragment, { key: 0 }, renderList(e9.rows, (c30) => (openBlock(), createElementBlock("div", {
      key: c30,
      role: "section",
      class: normalizeClass(unref(a56))
    }, null, 2))), 128)) : renderSlot(e9.$slots, "default", { key: 1 });
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/skeleton/index.js
var a29 = n6(v5);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/space/src/index3.js
var a30 = {
  vertical: u(),
  nowrap: u(),
  spacing: p(null, (p36) => n2.includes(p36)),
  rowGap: p(),
  columnGap: p()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/space/src/index2.js
var k4 = defineComponent({
  name: "FSpace"
});
var B9 = defineComponent({
  ...k4,
  props: a30,
  setup(t6) {
    const r32 = t6, { classes: n26, styles: a56 } = P(r32, "space"), l20 = n26(["spacing", "nowrap", "vertical"], "f-space"), c30 = a56(["rowGap", "columnGap"]);
    return (e9, C9) => e9.$slots.default ? (openBlock(), createElementBlock("div", {
      key: 0,
      role: "none",
      class: normalizeClass(unref(l20)),
      style: normalizeStyle(unref(c30))
    }, [
      renderSlot(e9.$slots, "default")
    ], 6)) : createCommentVNode("", true);
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/space/index.js
var i38 = n6(B9);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/sticky-card/src/index3.js
var p16 = {
  open: u(),
  openText: p(),
  closeText: p(),
  borderColor: p(),
  onOpen: i2(),
  onClose: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/collapse-animation/src/index3.js
var r20 = {
  opened: u(),
  disabled: u()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/collapse-animation/src/index2.js
var m13 = defineComponent({
  name: "FCollapseAnimation"
});
var k5 = defineComponent({
  ...m13,
  props: r20,
  setup(u17) {
    const o8 = u17, a56 = computed(() => !!o8.opened), e9 = ref(), t6 = ref(), i61 = () => {
      e9.value && (e9.value.style.height = "auto", t6.value = e9.value.offsetHeight, e9.value.style.height = a56.value ? t6.value + "px" : "0");
    };
    return watch(
      () => a56.value,
      (l20) => {
        o8.disabled || e9.value && (l20 ? e9.value.style.height = t6.value + "px" : e9.value.style.height = "0");
      }
    ), onMounted(() => {
      i61();
    }), (l20, _25) => (openBlock(), createElementBlock("div", {
      ref_key: "collapseEl",
      ref: e9,
      class: "f-collapse-animation"
    }, [
      renderSlot(l20.$slots, "default")
    ], 512));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/collapse-animation/index.js
var r21 = n6(k5);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/sticky-card/src/index2.js
var z4 = {
  key: 0,
  class: "f-sticky-card__source"
};
var B10 = { class: "f-sticky-card__box" };
var E6 = { class: "f-sticky-card__option-text" };
var F7 = defineComponent({
  name: "FStickyCard"
});
var q6 = defineComponent({
  ...F7,
  props: p16,
  setup(d6) {
    const o8 = d6, { getLang: m22 } = T(), { styles: u17 } = P(o8, "sticky-card"), e9 = ref(o8.open), _25 = () => {
      e9.value = !e9.value, o3(e9.value ? o8.onClose : o8.onOpen, e9.value);
    }, f10 = computed(() => {
      const { openText: t6, closeText: r32 } = o8, c30 = m22("stickyCard").value;
      return unref(e9) ? t6 || c30.openText : r32 || c30.closeText;
    }), y9 = u17(["borderColor"]);
    return (t6, r32) => (openBlock(), createElementBlock("div", {
      class: "f-sticky-card",
      style: normalizeStyle(unref(y9))
    }, [
      t6.$slots.source ? (openBlock(), createElementBlock("div", z4, [
        renderSlot(t6.$slots, "source")
      ])) : createCommentVNode("", true),
      createBaseVNode("div", B10, [
        createVNode(unref(r21), { opened: e9.value }, {
          default: withCtx(() => [
            renderSlot(t6.$slots, "default")
          ]),
          _: 3
        }, 8, ["opened"])
      ]),
      createBaseVNode("div", {
        class: normalizeClass(["f-sticky-card__option", { "f-sticky-card__option-open": e9.value }]),
        onClick: _25
      }, [
        createBaseVNode("span", E6, toDisplayString(unref(f10)), 1)
      ], 2)
    ], 4));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/sticky-card/index.js
var a31 = n6(q6);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/switch/src/index3.js
var u9 = {
  modelValue: {
    ...u(),
    required: true
  },
  size: p(null, (r32) => n2.includes(r32)),
  disabled: u(),
  icon: c2(),
  closeColor: p(),
  activeColor: p(),
  activeText: p(),
  closeText: p(),
  square: u(),
  iconSize: s(),
  onChange: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/switch/src/index2.js
var B11 = defineComponent({
  name: "FSwitch"
});
var M5 = defineComponent({
  ...B11,
  props: u9,
  emits: {
    [t2]: (i61) => String(i61)
  },
  setup(i61, { emit: p36 }) {
    const t6 = i61, { getSize: u17 } = T(t6), d6 = reactive({
      ...toRefs(t6),
      size: u17()
    }), { styles: h16, classes: _25 } = P(d6, "switch"), w15 = () => {
      t6.disabled || (p36(t2, !t6.modelValue), o3(t6.onChange, !t6.modelValue));
    }, v9 = h16(["closeColor", "activeColor"]), k8 = _25(["size", "square"], "f-switch__input");
    return (e9, L7) => (openBlock(), createElementBlock("div", {
      role: "switch",
      class: normalizeClass(["f-switch", { "f-switch__disabled": e9.disabled }]),
      style: normalizeStyle(unref(v9))
    }, [
      e9.closeText ? (openBlock(), createElementBlock("span", {
        key: 0,
        class: normalizeClass(["f-switch__right-text", { "f-switch__text-active": !e9.modelValue }])
      }, toDisplayString(e9.closeText), 3)) : createCommentVNode("", true),
      createBaseVNode("div", {
        class: normalizeClass([unref(k8), { "f-switch__active": e9.modelValue }]),
        onClick: w15
      }, [
        createBaseVNode("span", {
          class: normalizeClass(["f-switch__roll", { "f-switch__roll-active": e9.modelValue }])
        }, [
          e9.icon ? (openBlock(), createBlock(unref(a4), {
            key: 0,
            icon: e9.icon,
            size: e9.iconSize
          }, null, 8, ["icon", "size"])) : createCommentVNode("", true)
        ], 2)
      ], 2),
      e9.activeText ? (openBlock(), createElementBlock("span", {
        key: 1,
        class: normalizeClass(["f-switch__left-text", { "f-switch__text-active": e9.modelValue }])
      }, toDisplayString(e9.activeText), 3)) : createCommentVNode("", true)
    ], 6));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/switch/index.js
var a32 = n6(M5);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tag/src/index3.js
var u10 = {
  type: p(null, (e9) => e2.includes(e9)),
  close: u(),
  round: u(),
  background: p(),
  color: p(),
  beforeIcon: c2(),
  afterIcon: c2(),
  size: p(null, (e9) => n2.includes(e9)),
  simple: u(),
  block: u(),
  line: u(),
  onClose: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tag/src/index2.js
var E7 = defineComponent({
  name: "FTag"
});
var J6 = defineComponent({
  ...E7,
  props: u10,
  setup(i61) {
    const n26 = i61, { getType: m22, getSize: f10 } = T(n26), p36 = reactive({
      ...toRefs(n26),
      size: f10(),
      type: m22()
    }), { classes: u17, styles: d6 } = P(p36, "tag"), l20 = ref(true), y9 = u17(["simple", "type", "size", "block", "round", "line"], "f-tag"), k8 = d6(["color", "background"]), g5 = (e9) => {
      l20.value = false, o3(n26.onClose, e9);
    };
    return (e9, G3) => (openBlock(), createBlock(Transition, { name: "f-tag" }, {
      default: withCtx(() => [
        l20.value ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: normalizeClass(unref(y9)),
          style: normalizeStyle(unref(k8))
        }, [
          e9.beforeIcon ? (openBlock(), createBlock(unref(a4), {
            key: 0,
            icon: e9.beforeIcon
          }, null, 8, ["icon"])) : createCommentVNode("", true),
          renderSlot(e9.$slots, "default"),
          e9.afterIcon ? (openBlock(), createBlock(unref(a4), {
            key: 1,
            icon: e9.afterIcon
          }, null, 8, ["icon"])) : createCommentVNode("", true),
          e9.close ? (openBlock(), createBlock(unref(s8), {
            key: 2,
            size: 14,
            "on-click": g5
          })) : createCommentVNode("", true)
        ], 6)) : createCommentVNode("", true)
      ]),
      _: 3
    }));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tag/index.js
var i39 = n6(J6);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tooltip/src/index3.js
var s34 = {
  content: s(),
  position: p("bottom", (r32) => ["top", "bottom", "right", "left"].includes(r32)),
  disabled: u(),
  state: p("hover", (r32) => ["hover", "active", "always"].includes(r32)),
  noArrow: u(),
  bold: u(),
  bright: u(),
  background: p(),
  fontColor: p()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tooltip/src/index2.js
var b6 = ["f-content"];
var k6 = defineComponent({
  name: "FTooltip"
});
var S6 = defineComponent({
  ...k6,
  props: s34,
  setup(s44) {
    const n26 = s44, { classes: r32, styles: l20 } = P(n26, "tooltip"), i61 = r32(["position", "state", "disabled", "bold", "noArrow", "bright"], "f-tooltip"), a56 = l20(["background", "fontColor"]);
    return (o8, C9) => o8.$slots.default ? (openBlock(), createElementBlock("div", {
      key: 0,
      role: "tooltip",
      "f-content": o8.content,
      class: normalizeClass(unref(i61)),
      style: normalizeStyle(unref(a56))
    }, [
      renderSlot(o8.$slots, "default")
    ], 14, b6)) : createCommentVNode("", true);
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tooltip/index.js
var p17 = n6(S6);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tree/src/index3.js
var p18 = {
  data: y([])
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_utils/tree/index.js
var e7 = (l20) => {
  const d6 = [];
  return l20.forEach((h16) => {
    d6.push(h16), h16.children && d6.push(...e7(h16.children));
  }), d6;
};
var a33 = (l20) => {
  if (!b(l20))
    return [];
  const d6 = (o8, n26 = 0) => (n26++, o8.map((r32) => {
    r32.level = n26, r32.show = r32.level === 1, r32.open = false, r32.isChild = !!r32.children;
    const c30 = r32.children;
    return c30 && c30.length && d6(c30, n26), r32;
  })), h16 = (o8, n26 = "") => (o8.forEach((r32, c30) => {
    r32.children && r32.children.length ? (r32.id = Number(`${n26}${c30 + 1}`), h16(r32.children, `${n26}${c30 + 1}`)) : r32.id = Number(`${n26}${c30 + 1}`);
  }), o8);
  return h16(d6(l20));
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-tree-data/index.js
var D4 = (s44) => {
  const n26 = computed(() => a33(s44)), d6 = computed(() => e7(n26.value)), c30 = (o8) => {
    b(o8) && o8.forEach((e9) => {
      e9.show = false, e9.open = false, e9.children && c30(e9.children);
    });
  }, h16 = (o8, e9) => {
    o8.forEach((r32) => {
      r32.id === e9 ? (r32.open ? r32.children && c30(r32.children) : r32.children && r32.children.forEach((l20) => {
        l20.show = !l20.show;
      }), r32.open = !r32.open) : r32.children && r32.children.length && h16(r32.children, e9);
    });
  };
  return {
    treeData: n26,
    flatTreeData: d6,
    getItem: h16
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tree/src/index2.js
var w9 = {
  role: "tree",
  class: "f-tree"
};
var z5 = ["onClick"];
var B12 = defineComponent({
  name: "FTree"
});
var q7 = defineComponent({
  ...B12,
  props: p18,
  setup(l20) {
    const s44 = l20, { getItem: c30, treeData: i61, flatTreeData: m22 } = D4(s44.data), p36 = (n26) => {
      c30(i61.value, n26.id);
    };
    return (n26, I11) => (openBlock(), createElementBlock("div", w9, [
      (openBlock(true), createElementBlock(Fragment, null, renderList(unref(m22), (e9, d6) => (openBlock(), createElementBlock("div", {
        key: d6,
        role: "treeitem",
        class: "f-tree__data"
      }, [
        withDirectives(createBaseVNode("div", {
          class: "f-tree__label",
          style: normalizeStyle({ paddingLeft: 30 * (e9.level - 1) + 5 + "px" }),
          onClick: (N10) => p36(e9)
        }, [
          e9.isChild ? (openBlock(), createBlock(unref(a4), {
            key: 0,
            class: normalizeClass({ "f-tree__icon-animation": e9.open }),
            size: 17,
            icon: unref(a8)
          }, null, 8, ["class", "icon"])) : createCommentVNode("", true),
          createTextVNode(" " + toDisplayString(e9.label), 1)
        ], 12, z5), [
          [vShow, e9.show]
        ])
      ]))), 128))
    ]));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tree/index.js
var a34 = n6(q7);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/watermark/src/index3.js
var i40 = {
  content: p(),
  width: l(280),
  height: l(200),
  fontSize: s("30px"),
  fontColor: p("#333"),
  image: p(),
  block: u(),
  zIndex: l(100)
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-canvas/index.js
var d3 = () => ({ createWatermark: (t6) => {
  const i61 = document.createElement("canvas"), n26 = window && window.devicePixelRatio || 1;
  i61.width = t6.width * n26, i61.height = t6.height * n26, i61.style.width = t6.width + "px", i61.style.height = t6.height + "px";
  const e9 = i61.getContext("2d");
  return e9 && (e9.rotate(-8 * Math.PI / 100), e9.font = `${a3(t6.fontSize)} serif`, e9.fillStyle = t6.fontColor, e9.textAlign = "left", e9.textBaseline = "middle", e9.strokeText(t6.content, t6.width / 20, t6.height)), i61.toDataURL("image/png");
} });

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/watermark/src/index2.js
var w10 = defineComponent({
  name: "FWatermark"
});
var x2 = defineComponent({
  ...w10,
  props: i40,
  setup(m22) {
    const r32 = m22, { filter: s44 } = k(r32), t6 = ref({}), l20 = computed(() => ({ backgroundImage: `url(${d3().createWatermark(
      s44(["content", "width", "height", "fontSize", "fontColor"])
    )})` })), c30 = computed(() => {
      const { image: e9, width: o8, height: i61 } = r32;
      return {
        backgroundImage: `url(${e9})`,
        backgroundSize: `${o8}px ${i61}px`
      };
    });
    return onMounted(() => {
      t6.value = r32.image ? c30.value : l20.value;
    }), (e9, o8) => (openBlock(), createElementBlock("div", {
      class: normalizeClass(["f-watermark", { "f-watermark__block": e9.block }]),
      style: normalizeStyle([t6.value, { zIndex: e9.zIndex }])
    }, [
      renderSlot(e9.$slots, "default")
    ], 6));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/watermark/index.js
var i41 = n6(x2);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/input/src/index3.js
var i42 = {
  modelValue: s(),
  type: p("text", (t6) => ["text", "password", "number"].includes(t6)),
  size: p("middle", (t6) => n2.includes(t6)),
  disabled: u(),
  max: l(),
  min: l(),
  maxLength: l(),
  autofocus: u(),
  name: p("f-input"),
  placeholder: p(),
  placeholderColor: p(),
  clear: u(),
  search: u(),
  background: p(),
  textColor: p(),
  activeBackground: p(),
  activeBorderColor: p(),
  readonly: u(),
  showPassword: u(),
  enterSearch: u(),
  icon: c2(),
  afterIcon: c2(),
  autocomplete: p(),
  onSearch: i2(),
  onChange: i2(),
  onBlur: i2(),
  onFocus: i2(),
  onInput: i2(),
  onEnter: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/swap/src/index3.js
var u11 = {
  modelValue: {
    ...u(),
    require: true
  },
  size: s(40),
  type: p(null, (o8) => ["sound", "swap"].includes(o8)),
  iconOn: c2(),
  iconOff: c2(),
  onChange: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/swap/src/index2.js
var h11 = defineComponent({
  name: "FSwap"
});
var I5 = defineComponent({
  ...h11,
  props: u11,
  emits: {
    [t2]: (s44) => typeof s44 == "boolean"
  },
  setup(s44, { emit: i61 }) {
    const e9 = s44, { classes: l20 } = P(e9, "swap"), m22 = (o8) => {
      i61(t2, !e9.modelValue), o3(e9.onChange, o8, !e9.modelValue);
    }, a56 = l20(["type", "modelValue"], "f-swap");
    return (o8, k8) => (openBlock(), createElementBlock("div", {
      role: "switch",
      class: normalizeClass(unref(a56)),
      onClick: m22
    }, [
      createVNode(unref(a4), {
        icon: o8.modelValue ? o8.iconOn : o8.iconOff,
        size: o8.size
      }, null, 8, ["icon", "size"])
    ], 2));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/swap/index.js
var i43 = n6(I5);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-eye-off-outline/index.js
var n19 = {};
var r22 = {
  width: "32",
  height: "32",
  viewBox: "0 0 24 24"
};
var _15 = createBaseVNode("path", {
  fill: "currentColor",
  d: "M2 5.27L3.28 4L20 20.72L18.73 22l-3.08-3.08c-1.15.38-2.37.58-3.65.58c-5 0-9.27-3.11-11-7.5c.69-1.76 1.79-3.31 3.19-4.54L2 5.27M12 9a3 3 0 0 1 3 3a3 3 0 0 1-.17 1L11 9.17A3 3 0 0 1 12 9m0-4.5c5 0 9.27 3.11 11 7.5a11.79 11.79 0 0 1-4 5.19l-1.42-1.43A9.862 9.862 0 0 0 20.82 12A9.821 9.821 0 0 0 12 6.5c-1.09 0-2.16.18-3.16.5L7.3 5.47c1.44-.62 3.03-.97 4.7-.97M3.18 12A9.821 9.821 0 0 0 12 17.5c.69 0 1.37-.07 2-.21L11.72 15A3.064 3.064 0 0 1 9 12.28L5.6 8.87c-.99.85-1.82 1.91-2.42 3.13Z"
}, null, -1);
var l16 = [
  _15
];
function s35(i61, a56) {
  return openBlock(), createElementBlock("svg", r22, l16);
}
var h12 = s5(n19, [["render", s35]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-eye-outline/index.js
var n20 = {};
var r23 = {
  width: "32",
  height: "32",
  viewBox: "0 0 24 24"
};
var _16 = createBaseVNode("path", {
  fill: "currentColor",
  d: "M12 9a3 3 0 0 1 3 3a3 3 0 0 1-3 3a3 3 0 0 1-3-3a3 3 0 0 1 3-3m0-4.5c5 0 9.27 3.11 11 7.5c-1.73 4.39-6 7.5-11 7.5S2.73 16.39 1 12c1.73-4.39 6-7.5 11-7.5M3.18 12a9.821 9.821 0 0 0 17.64 0a9.821 9.821 0 0 0-17.64 0Z"
}, null, -1);
var a35 = [
  _16
];
function s36(i61, l20) {
  return openBlock(), createElementBlock("svg", r23, a35);
}
var h13 = s5(n20, [["render", s36]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-update-input/index.js
var c21 = (n26, e9) => ({
  onInput: (t6) => {
    e9(
      t2,
      c(n26.type) ? Number(t6.target.value) : t6.target.value
    ), o3(n26.onInput, t6.target.value);
  },
  onChange: (t6) => {
    o3(n26.onChange, t6.target.value);
  },
  onClear: () => {
    n26.disabled || e9(t2, "");
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/input/src/index2.js
var Y5 = ["type", "max", "min", "maxlength", "value", "disabled", "readonly", "autofocus", "autocomplete", "name", "placeholder", "onKeyup"];
var Z2 = createTextVNode("搜索");
var _17 = defineComponent({
  name: "FInput"
});
var he = defineComponent({
  ..._17,
  props: i42,
  emits: {
    [t2]: (u17) => e(u17) || c(u17)
  },
  setup(u17, { emit: w15 }) {
    const r32 = u17, { filter: I11 } = k(r32), { styles: g5 } = P(r32, "input"), p36 = ref(r32.type), l20 = ref(false), { onInput: V7, onClear: z10, onChange: b8 } = c21(
      I11(["onChange", "onInput", "disabled", "type"]),
      w15
    ), B17 = (e9) => {
      V7(e9);
    }, F11 = (e9) => {
      b8(e9);
    }, f10 = (e9) => {
      o3(r32.onSearch, { evt: e9, value: r32.modelValue });
    }, S9 = (e9) => {
      const { search: n26, enterSearch: t6, onEnter: N10 } = toRefs(r32);
      n26.value && t6.value && f10(e9), o3(N10.value, e9);
    }, E9 = () => {
      if (l20.value) {
        p36.value = "text", l20.value = true;
        return;
      }
      p36.value = "password", l20.value = false;
    }, P14 = g5(["placeholderColor", "background", "textColor", "activeBackground", "activeBorderColor"]);
    return (e9, n26) => (openBlock(), createElementBlock("div", {
      role: "input",
      class: normalizeClass(["f-input", { [`f-input__${e9.size}`]: e9.size }]),
      style: normalizeStyle(unref(P14))
    }, [
      createBaseVNode("div", {
        class: normalizeClass(["f-input__wrapper", { "f-input__disabled": e9.disabled }])
      }, [
        renderSlot(e9.$slots, "before"),
        e9.icon ? (openBlock(), createBlock(unref(a4), {
          key: 0,
          class: "f-input__icon",
          icon: e9.icon,
          size: 13
        }, null, 8, ["icon"])) : createCommentVNode("", true),
        createBaseVNode("input", {
          class: "f-input__input",
          type: p36.value,
          max: e9.max,
          min: e9.min,
          maxlength: e9.maxLength,
          value: e9.modelValue,
          disabled: e9.disabled,
          readonly: e9.readonly,
          autofocus: e9.autofocus,
          autocomplete: e9.autocomplete,
          name: e9.name,
          placeholder: e9.placeholder,
          onInput: B17,
          onChange: F11,
          onKeyup: withKeys(S9, ["enter"]),
          onBlur: n26[0] || (n26[0] = (...t6) => e9.onBlur && e9.onBlur(...t6)),
          onFocus: n26[1] || (n26[1] = (...t6) => e9.onFocus && e9.onFocus(...t6))
        }, null, 40, Y5),
        e9.clear ? (openBlock(), createBlock(unref(a4), {
          key: 1,
          class: "f-input__clear-btn",
          icon: unref(a5),
          size: 14,
          "on-click": unref(z10)
        }, null, 8, ["icon", "on-click"])) : createCommentVNode("", true),
        e9.afterIcon ? (openBlock(), createBlock(unref(a4), {
          key: 2,
          icon: e9.afterIcon,
          size: 14
        }, null, 8, ["icon"])) : createCommentVNode("", true),
        e9.showPassword ? (openBlock(), createBlock(unref(i43), {
          key: 3,
          modelValue: l20.value,
          "onUpdate:modelValue": n26[2] || (n26[2] = (t6) => l20.value = t6),
          class: "f-input__show-password",
          type: "swap",
          "icon-on": unref(h13),
          "icon-off": unref(h12),
          size: 14,
          "on-change": E9
        }, null, 8, ["modelValue", "icon-on", "icon-off"])) : createCommentVNode("", true),
        renderSlot(e9.$slots, "after")
      ], 2),
      e9.search ? (openBlock(), createElementBlock("div", {
        key: 0,
        class: "f-input__search",
        onClick: f10
      }, [
        renderSlot(e9.$slots, "searchBtn", {}, () => [
          createVNode(unref(a10), {
            type: "primary",
            size: e9.size
          }, {
            default: withCtx(() => [
              Z2
            ]),
            _: 1
          }, 8, ["size"])
        ])
      ])) : createCommentVNode("", true)
    ], 6));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/input/index.js
var p19 = n6(he);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/up-load/src/index3.js
var i44 = {
  files: y([]),
  accept: p(),
  name: p(),
  drag: u(),
  isRemove: u(true),
  showList: u(true),
  multiple: u(),
  maxSize: l(),
  maxLength: l(),
  disabled: u(),
  onLoad: i2(),
  onChange: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-notes/index.js
var r24 = {};
var c22 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s37 = createBaseVNode("path", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5",
  d: "M2.75 1.75h10.5v12.5H2.75zm3 6h4.5m-4.5 3h2.5m-2.5-6h4.5"
}, null, -1);
var i45 = [
  s37
];
function _18(h16, d6) {
  return openBlock(), createElementBlock("svg", c22, i45);
}
var a36 = s5(r24, [["render", _18]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-plus/index.js
var r25 = {};
var c23 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s38 = createBaseVNode("path", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5",
  d: "M12.75 7.75h-10m5-5v10"
}, null, -1);
var i46 = [
  s38
];
function _19(l20, d6) {
  return openBlock(), createElementBlock("svg", c23, i46);
}
var u12 = s5(r25, [["render", _19]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/up-load/src/index2.js
var H3 = { class: "f-up-load" };
var J7 = ["onDrop", "onDragover"];
var K4 = createTextVNode("选择文件");
var O6 = ["name", "disabled", "accept", "multiple"];
var Q2 = {
  key: 0,
  class: "f-up-load__file-list"
};
var W2 = { class: "f-up-load__file-name" };
var X3 = defineComponent({
  name: "FUpLoad"
});
var ue = defineComponent({
  ...X3,
  props: i44,
  emits: {
    [I3]: (u17) => u17
  },
  setup(u17, { emit: B17 }) {
    const i61 = u17, m22 = ref(false), l20 = ref(), c30 = ref(), v9 = () => {
      c30.value && c30.value.click();
    }, _25 = (e9) => {
      l20.value = e9, B17(I3, e9), o3(i61.onLoad, e9);
    }, h16 = (e9) => {
      const { maxSize: o8, maxLength: r32 } = toRefs(i61);
      let t6 = [...e9];
      return o8.value && (t6 = t6.filter((g5) => g5.size < o8.value)), r32.value && (t6 = t6.splice(0, r32.value)), t6;
    }, N10 = (e9) => {
      const o8 = e9.target.files;
      o8 && _25(h16(o8));
    }, S9 = (e9) => {
      l20.value && l20.value.splice(e9, 1);
    }, w15 = (e9) => {
      e9.preventDefault(), m22.value = true;
    }, b8 = (e9) => {
      m22.value = false;
      const o8 = e9.dataTransfer.files;
      o8 && _25(h16(o8));
    };
    return (() => {
      !i61.onChange || watch(
        () => i61.files,
        () => {
          o3(i61.onChange, l20.value);
        },
        { deep: true }
      );
    })(), (e9, o8) => (openBlock(), createElementBlock(Fragment, null, [
      createBaseVNode("div", H3, [
        e9.drag ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "f-up-load__drag",
          onClick: v9,
          onDrop: withModifiers(b8, ["prevent"]),
          onDragover: withModifiers(w15, ["prevent"])
        }, [
          renderSlot(e9.$slots, "default", {}, () => [
            createVNode(unref(a4), { icon: unref(u12) }, null, 8, ["icon"])
          ])
        ], 40, J7)) : (openBlock(), createElementBlock("div", {
          key: 1,
          class: "f-up-load__content",
          onClick: v9
        }, [
          renderSlot(e9.$slots, "default", {}, () => [
            createVNode(unref(a10), null, {
              default: withCtx(() => [
                K4
              ]),
              _: 1
            })
          ])
        ])),
        createBaseVNode("input", {
          ref_key: "inputEl",
          ref: c30,
          type: "file",
          hidden: "",
          name: e9.name,
          disabled: e9.disabled,
          accept: e9.accept,
          multiple: e9.multiple,
          onChange: N10
        }, null, 40, O6)
      ]),
      e9.showList && l20.value && l20.value.length ? (openBlock(), createElementBlock("ul", Q2, [
        (openBlock(true), createElementBlock(Fragment, null, renderList(l20.value, (r32, t6) => (openBlock(), createElementBlock("li", {
          key: t6,
          class: "f-up-load__file-list-item"
        }, [
          createBaseVNode("span", W2, [
            createVNode(unref(a4), { icon: unref(a36) }, null, 8, ["icon"]),
            createTextVNode(" " + toDisplayString(r32.name), 1)
          ]),
          e9.isRemove ? (openBlock(), createBlock(unref(s8), {
            key: 0,
            size: 14,
            onClick: (g5) => S9(t6)
          }, null, 8, ["onClick"])) : createCommentVNode("", true)
        ]))), 128))
      ])) : createCommentVNode("", true)
    ], 64));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/up-load/index.js
var i47 = n6(ue);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/pagination/src/index3.js
var u13 = {
  current: {
    ...l(1),
    require: true
  },
  total: {
    ...l(0),
    require: true
  },
  pageSize: l(10),
  pageSizes: y(),
  pagerCount: l(7),
  background: u(),
  round: u(),
  prevIcon: c2(),
  nextIcon: c2(),
  disabled: u(),
  jumpSearch: u(),
  onPrev: i2(),
  onNext: i2(),
  pageSizeChange: i2(),
  onChange: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-menu-meatball/index.js
var t4 = {};
var n21 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var i48 = createBaseVNode("g", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5"
}, [
  createBaseVNode("circle", {
    cx: "2.5",
    cy: "8",
    r: ".75"
  }),
  createBaseVNode("circle", {
    cx: "8",
    cy: "8",
    r: ".75"
  }),
  createBaseVNode("circle", {
    cx: "13.5",
    cy: "8",
    r: ".75"
  })
], -1);
var s39 = [
  i48
];
function l17(_25, d6) {
  return openBlock(), createElementBlock("svg", n21, s39);
}
var f6 = s5(t4, [["render", l17]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/select/src/index3.js
var o4 = {
  modelValue: {
    type: [String, Number, Boolean],
    default: () => null,
    required: true
  },
  width: {
    type: [Number, String],
    default: () => null
  },
  name: p("f-select"),
  placeholder: p(),
  clear: u(),
  disabled: u()
};
var p20 = Symbol("f-select-props-key");

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_utils/get-children/index.js
var p21 = (e9, n26) => {
  let r32 = [];
  return b(e9) && e9.length && e9.forEach((t6) => {
    const o8 = a(t6.type) && t6.type.name;
    if (o8 === n26 && r32.push(t6), o8 !== n26 && t6.children && b(t6.children)) {
      const i61 = p21(t6.children, n26);
      r32 = r32.concat(i61);
    }
  }), r32;
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/dropdown/src/index3.js
var a37 = {
  spacing: s(),
  disabled: u(),
  trigger: p("hover", (n26) => ["hover", "click"].includes(n26)),
  arrow: u(),
  enterDuration: l(),
  leaveDuration: l(),
  onChange: i2(),
  onOpen: i2(),
  onClose: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/trigger/src/index3.js
var a38 = {
  spacing: s(),
  disabled: u(),
  trigger: p("hover", (t6) => ["hover", "click"].includes(t6)),
  arrow: u(),
  enterDuration: l(),
  leaveDuration: l(),
  onChange: i2(),
  onOpen: i2(),
  onClose: i2()
};
var c24 = Symbol("trigger-close-key");

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/trigger/src/index2.js
var K5 = { class: "f-trigger__content" };
var P10 = defineComponent({
  name: "FTrigger"
});
var Y6 = defineComponent({
  ...P10,
  props: a38,
  setup(f10, { expose: p36 }) {
    const e9 = f10, t6 = ref(false), _25 = () => {
      e9.disabled || (t6.value = true, o3(e9.onOpen, t6.value), o3(e9.onChange, t6.value));
    }, i61 = () => {
      t6.value = false, o3(e9.onClose, t6.value), o3(e9.onChange, t6.value);
    }, h16 = computed(() => e9.trigger === "hover" ? "mouseover" : "click"), C9 = computed(() => e9.trigger === "hover" ? "mouseleave" : ""), E9 = computed(() => {
      const { spacing: r32, enterDuration: o8, leaveDuration: n26 } = e9;
      return {
        "--trigger-spacing-size": a3(r32),
        "--trigger-enter-duration": o8 && o8 + "s",
        "--trigger-leave-duration": n26 && n26 + "s"
      };
    }), g5 = (r32) => {
      r32.composedPath().some(
        (n26) => n26.className === "f-trigger"
      ) || (i61(), document.removeEventListener("click", g5));
    }, w15 = () => {
      document.addEventListener("click", g5);
    };
    return provide(c24, {
      handelClose: () => {
        t6.value = false;
      }
    }), p36({ handelClose: i61 }), (r32, o8) => (openBlock(), createElementBlock("div", {
      class: "f-trigger",
      style: normalizeStyle(unref(E9)),
      [toHandlerKey(unref(C9))]: withModifiers(i61, ["stop"])
    }, [
      createBaseVNode("div", {
        class: "f-trigger__trigger",
        [toHandlerKey(unref(h16))]: withModifiers(_25, ["stop"])
      }, [
        renderSlot(r32.$slots, "default")
      ], 16),
      createVNode(Transition, {
        name: "f-trigger",
        onBeforeEnter: w15
      }, {
        default: withCtx(() => [
          withDirectives(createBaseVNode("div", {
            class: normalizeClass(["f-trigger__content-box", { "f-trigger__arrow": r32.arrow }])
          }, [
            createBaseVNode("div", K5, [
              renderSlot(r32.$slots, "content")
            ])
          ], 2), [
            [vShow, t6.value]
          ])
        ]),
        _: 3
      })
    ], 16));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/trigger/index.js
var a39 = n6(Y6);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/dropdown/src/index2.js
var p22 = { class: "f-dropdown" };
var g2 = defineComponent({
  name: "FDropdown"
});
var w11 = defineComponent({
  ...g2,
  props: a37,
  setup(u17) {
    return (e9, f10) => (openBlock(), createElementBlock("div", p22, [
      createVNode(unref(a39), {
        trigger: e9.trigger,
        disabled: e9.disabled,
        spacing: e9.spacing,
        arrow: e9.arrow,
        "enter-duration": e9.enterDuration,
        "leave-duration": e9.leaveDuration,
        "on-change": e9.onChange,
        "on-open": e9.onOpen,
        "on-close": e9.onClose
      }, {
        content: withCtx(() => [
          renderSlot(e9.$slots, "content")
        ]),
        default: withCtx(() => [
          renderSlot(e9.$slots, "default")
        ]),
        _: 3
      }, 8, ["trigger", "disabled", "spacing", "arrow", "enter-duration", "leave-duration", "on-change", "on-open", "on-close"])
    ]));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/dropdown/index.js
var p23 = n6(w11);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/select/src/index2.js
var N7 = defineComponent({
  name: "FSelect"
});
var H4 = defineComponent({
  ...N7,
  props: o4,
  emits: {
    [t2]: (s44) => !!s44
  },
  setup(s44, { emit: V7 }) {
    const t6 = s44, i61 = useSlots(), { styles: b8 } = P(t6, "select"), d6 = computed(() => i61.default ? p21(i61.default(), "FOption") : []), o8 = computed({
      get: () => {
        if (!d6.value.length)
          return "";
        const e9 = d6.value.filter((p36) => {
          const r32 = p36.props;
          return r32 ? r32.value ? r32.value === t6.modelValue : r32.label === t6.modelValue : p36.children.default()[0].children === t6.modelValue;
        });
        if (!e9.length)
          return "";
        const l20 = e9[0], a56 = l20.children && l20.children.default()[0].children, S9 = l20.props && l20.props.label, u17 = l20.props && l20.props.value;
        return a56 || S9 || u17 && u17.toString() || "";
      },
      set: (e9) => e9
    });
    provide(p20, reactive({ setValue: (e9, l20) => {
      o8.value = e9, V7(t2, l20);
    } }));
    const g5 = b8(["width"]);
    return (e9, l20) => (openBlock(), createElementBlock("div", {
      class: "f-select",
      style: normalizeStyle(unref(g5))
    }, [
      createVNode(unref(p23), {
        trigger: "click",
        disabled: e9.disabled
      }, {
        content: withCtx(() => [
          renderSlot(e9.$slots, "default")
        ]),
        default: withCtx(() => [
          createVNode(unref(p19), {
            modelValue: unref(o8),
            "onUpdate:modelValue": l20[0] || (l20[0] = (a56) => isRef(o8) ? o8.value = a56 : null),
            readonly: "",
            name: e9.name,
            disabled: e9.disabled,
            placeholder: e9.placeholder,
            clear: e9.clear
          }, null, 8, ["modelValue", "name", "disabled", "placeholder", "clear"])
        ]),
        _: 3
      }, 8, ["disabled"])
    ], 4));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/select/index.js
var a40 = n6(H4);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/option/src/index3.js
var p24 = {
  value: s(),
  label: s(),
  disabled: u()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/option/src/index2.js
var y5 = defineComponent({
  name: "FOption"
});
var I6 = defineComponent({
  ...y5,
  props: p24,
  setup(p36) {
    const o8 = p36, t6 = useSlots(), a56 = inject(p20, null), n26 = inject(c24, null), c30 = () => {
      if (!a56 || o8.disabled)
        return;
      const { value: e9, label: l20 } = toRefs(o8), s44 = t6.default && t6.default()[0].children;
      a56.setValue(
        s44 || l20.value || e9.value,
        e9.value || l20.value || s44
      ), n26 && n26.handelClose();
    };
    return (e9, l20) => e9.$slots.default || e9.label || e9.value ? (openBlock(), createElementBlock("div", {
      key: 0,
      class: normalizeClass(["f-option", { "f-option__disabled": e9.disabled }]),
      onClick: c30
    }, [
      e9.$slots.default ? renderSlot(e9.$slots, "default", { key: 0 }) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
        createTextVNode(toDisplayString(e9.label || e9.value), 1)
      ], 64))
    ], 2)) : createCommentVNode("", true);
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/option/index.js
var p25 = n6(I6);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/pagination/src/index2.js
var W3 = { class: "f-pagination" };
var X4 = {
  key: 0,
  class: normalizeClass(["f-pagination__prev-more", "f-pagination__pages-item"])
};
var Y7 = ["onClick"];
var Z3 = {
  key: 1,
  class: normalizeClass(["f-pagination__next-more", "f-pagination__pages-item"])
};
var ee4 = defineComponent({
  name: "FPagination"
});
var ce = defineComponent({
  ...ee4,
  props: u13,
  emits: {
    "update:current": (m22) => c(m22),
    "update:pageSize": (m22) => c(m22)
  },
  setup(m22, { emit: v9 }) {
    const a56 = m22, b8 = ref("1"), S9 = ref(10), k8 = ref(false), N10 = ref(false), o8 = computed(() => {
      const e9 = Math.floor(a56.total / a56.pageSize);
      return a56.total % a56.pageSize === 0 ? e9 : e9 + 1;
    }), R8 = computed(() => {
      const { background: e9, round: n26, disabled: t6 } = a56;
      return [
        "f-pagination__pages",
        {
          "f-pagination__pages-round": n26,
          "f-pagination__pages-disabled": t6,
          "f-pagination__pages-background": e9
        }
      ];
    }), $12 = computed(() => {
      const { current: e9 } = a56;
      return [
        "f-pagination__pages-item",
        {
          "f-pagination__pages-item-active": e9 === 1
        }
      ];
    }), D7 = computed(() => {
      const { current: e9 } = a56;
      return [
        "f-pagination__pages-item",
        {
          "f-pagination__pages-item-active": e9 === o8.value
        }
      ];
    }), z10 = computed(() => {
      const e9 = Number(a56.pagerCount), n26 = Number(a56.current), t6 = (e9 - 1) / 2;
      let u17 = false, s44 = false;
      o8.value > e9 && (a56.current > e9 - t6 && (u17 = true), a56.current < o8.value - t6 && (s44 = true));
      const p36 = [];
      if (!u17 && s44)
        for (let l20 = 2; l20 < e9; l20++)
          p36.push(l20);
      else if (u17 && !s44) {
        let l20 = o8.value - (e9 - 2);
        for (let c30 = l20; c30 < o8.value; c30++)
          p36.push(c30);
      } else if (u17 && s44) {
        let l20 = Math.floor(e9 / 2) - 1;
        for (let c30 = n26 - l20; c30 <= n26 + l20; c30++)
          p36.push(c30);
      } else
        for (let l20 = 2; l20 < e9; l20++)
          p36.push(l20);
      return p36;
    }), F11 = (e9) => {
      if (a56.disabled)
        return;
      let n26;
      const t6 = {
        next: () => {
          const u17 = a56.current === o8.value ? o8.value : a56.current + 1;
          a56.onNext && a56.onNext(u17, a56.pageSize), v9("update:current", u17);
        },
        prev: () => {
          n26 = a56.current === 1 ? 1 : a56.current - 1, a56.onPrev && a56.onPrev(n26, a56.pageSize), v9("update:current", n26);
        }
      };
      t6[e9] && t6[e9]();
    }, U6 = (e9) => {
      a56.disabled || (v9("update:current", e9), a56.onChange && a56.onChange(e9, a56.pageSize));
    }, V7 = () => {
      a56.disabled || (Number(b8.value) > z10.value.length && (b8.value = String(z10.value.length)), v9("update:current", Number(b8.value)));
    };
    watchEffect(() => {
      const e9 = Number(a56.pagerCount);
      let n26 = (e9 - 1) / 2;
      k8.value = false, N10.value = false, o8.value > e9 && (a56.current > e9 - n26 && (k8.value = true), a56.current < o8.value - n26 && (N10.value = true));
    });
    const x5 = (e9) => {
      const n26 = e9.target;
      if (n26.tagName.toLowerCase() === "ul" || a56.disabled)
        return;
      let t6 = Number(n26.textContent), u17 = a56.pagerCount, s44 = a56.current, p36 = u17 - 2;
      n26.className.includes("f-pagination__prev-more") && (t6 = s44 - p36), n26.className.includes("f-pagination__next-more") && (t6 = s44 + p36), Number.isNaN(t6) || (t6 < 1 && (t6 = 1), t6 > o8.value && (t6 = o8.value)), t6 !== s44 && (v9("update:current", t6), a56.onChange && a56.onChange(t6, a56.pageSize));
    };
    return (e9, n26) => (openBlock(), createElementBlock("div", W3, [
      e9.pageSizes && e9.pageSizes.length ? (openBlock(), createBlock(unref(a40), {
        key: 0,
        modelValue: S9.value,
        "onUpdate:modelValue": n26[0] || (n26[0] = (t6) => S9.value = t6),
        width: 60,
        disabled: e9.disabled
      }, {
        default: withCtx(() => [
          (openBlock(true), createElementBlock(Fragment, null, renderList(e9.pageSizes, (t6) => (openBlock(), createBlock(unref(p25), {
            key: t6,
            value: t6,
            label: t6 + "/页"
          }, null, 8, ["value", "label"]))), 128))
        ]),
        _: 1
      }, 8, ["modelValue", "disabled"])) : createCommentVNode("", true),
      createVNode(unref(a10), {
        circle: "",
        disabled: e9.disabled,
        size: e9.background ? "middle" : "small",
        style: { borderRadius: "2px" },
        "before-icon": e9.prevIcon || unref(m4),
        onClick: n26[1] || (n26[1] = (t6) => F11("prev"))
      }, null, 8, ["disabled", "size", "before-icon"]),
      e9.total > 0 ? (openBlock(), createElementBlock("div", {
        key: 1,
        class: normalizeClass(unref(R8)),
        onClick: x5
      }, [
        createBaseVNode("div", {
          class: normalizeClass(unref($12))
        }, "1", 2),
        k8.value ? (openBlock(), createElementBlock("div", X4, [
          createVNode(unref(a4), {
            size: 15,
            icon: unref(f6)
          }, null, 8, ["icon"])
        ])) : createCommentVNode("", true),
        (openBlock(true), createElementBlock(Fragment, null, renderList(unref(z10), (t6) => (openBlock(), createElementBlock("div", {
          key: t6,
          class: normalizeClass([
            "f-pagination__pages-item",
            {
              "f-pagination__pages-item-active": e9.current === t6
            }
          ]),
          onClick: (u17) => U6(t6)
        }, toDisplayString(t6), 11, Y7))), 128)),
        N10.value ? (openBlock(), createElementBlock("div", Z3, [
          createVNode(unref(a4), {
            size: 15,
            icon: unref(f6)
          }, null, 8, ["icon"])
        ])) : createCommentVNode("", true),
        e9.total > 1 ? (openBlock(), createElementBlock("div", {
          key: 2,
          class: normalizeClass(unref(D7))
        }, toDisplayString(unref(o8)), 3)) : createCommentVNode("", true)
      ], 2)) : createCommentVNode("", true),
      createVNode(unref(a10), {
        circle: "",
        disabled: e9.disabled,
        size: e9.background ? "middle" : "small",
        style: { borderRadius: "2px" },
        "before-icon": e9.nextIcon || unref(a8),
        onClick: n26[2] || (n26[2] = (t6) => F11("next"))
      }, null, 8, ["disabled", "size", "before-icon"]),
      e9.jumpSearch ? (openBlock(), createBlock(unref(p19), {
        key: 2,
        modelValue: b8.value,
        "onUpdate:modelValue": n26[3] || (n26[3] = (t6) => b8.value = t6),
        placeholder: "输入跳转的页数",
        class: "f-pagination__jump",
        disabled: e9.disabled,
        "on-blur": V7,
        "on-enter": V7
      }, null, 8, ["modelValue", "disabled"])) : createCommentVNode("", true)
    ]));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/pagination/index.js
var r26 = n6(ce);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/table/src/index3.js
var i49 = {
  data: y(),
  columns: y(),
  align: p("left", (t6) => ["left", "center", "right"].includes(t6)),
  border: u(),
  num: u(),
  zebra: u(),
  zebraColor: p(),
  height: s(),
  optional: u(),
  bgColor: p(),
  headBgColor: p(),
  showHead: u(true)
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/table/src/components/table-colgroup/index3.js
var t5 = {
  columns: y()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/table/src/components/table-colgroup/index2.js
var i50 = ["width"];
var _20 = defineComponent({
  name: "FTableColgroup"
});
var k7 = defineComponent({
  ..._20,
  props: t5,
  setup(a56) {
    return (t6, d6) => (openBlock(), createElementBlock("colgroup", null, [
      (openBlock(true), createElementBlock(Fragment, null, renderList(t6.columns, (n26, l20) => (openBlock(), createElementBlock("col", {
        key: l20,
        width: unref(a3)(n26.width)
      }, null, 8, i50))), 128))
    ]));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/table/src/index2.js
var $10 = {
  key: 0,
  class: "f-table__header"
};
var P11 = { class: "f-table__table" };
var U3 = ["align"];
var j6 = { key: 0 };
var q8 = { key: 1 };
var A3 = { class: "f-table__table" };
var G2 = ["align"];
var I7 = { key: 0 };
var J8 = { key: 1 };
var K6 = ["align"];
var M6 = { key: 0 };
var O7 = { key: 1 };
var Q3 = { key: 1 };
var R4 = defineComponent({
  name: "FTable"
});
var te2 = defineComponent({
  ...R4,
  props: i49,
  setup(p36) {
    const k8 = p36, { classes: g5 } = P(k8, "table"), b8 = ref(false), C9 = g5(["zebraColor", "bgColor", "headBgColor", "height"]), V7 = (e9) => e9(h);
    return (e9, c30) => {
      const v9 = resolveComponent("f-checkbox");
      return openBlock(), createElementBlock("div", {
        role: "table",
        class: "f-table",
        style: normalizeStyle(unref(C9))
      }, [
        createBaseVNode("div", {
          class: normalizeClass([
            "f-table__container",
            {
              "f-table__border": e9.border,
              "f-table__zebra": e9.zebra
            }
          ])
        }, [
          e9.columns || e9.data ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [
            e9.height && e9.showHead ? (openBlock(), createElementBlock("header", $10, [
              createBaseVNode("table", P11, [
                createVNode(unref(k7), { columns: e9.columns }, null, 8, ["columns"]),
                createBaseVNode("thead", { align: e9.align }, [
                  createBaseVNode("tr", null, [
                    e9.num ? (openBlock(), createElementBlock("th", j6, "序号")) : createCommentVNode("", true),
                    e9.optional ? (openBlock(), createElementBlock("th", q8, "选择")) : createCommentVNode("", true),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(e9.columns, (r32, n26) => (openBlock(), createElementBlock("th", { key: n26 }, toDisplayString(r32.title), 1))), 128))
                  ])
                ], 8, U3)
              ])
            ])) : createCommentVNode("", true),
            createBaseVNode("main", {
              class: normalizeClass(["f-table__body", { "f-table__body-margin": e9.height && e9.showHead }])
            }, [
              createBaseVNode("table", A3, [
                createVNode(unref(k7), { columns: e9.columns }, null, 8, ["columns"]),
                !e9.height && e9.showHead ? (openBlock(), createElementBlock("thead", {
                  key: 0,
                  align: e9.align
                }, [
                  createBaseVNode("tr", null, [
                    e9.num ? (openBlock(), createElementBlock("th", I7, "序号")) : createCommentVNode("", true),
                    e9.optional ? (openBlock(), createElementBlock("th", J8, "选择")) : createCommentVNode("", true),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(e9.columns, (r32, n26) => (openBlock(), createElementBlock("th", { key: n26 }, toDisplayString(r32.title), 1))), 128))
                  ])
                ], 8, G2)) : createCommentVNode("", true),
                e9.data.length ? (openBlock(), createElementBlock("tbody", {
                  key: 1,
                  align: e9.align
                }, [
                  (openBlock(true), createElementBlock(Fragment, null, renderList(e9.data, (r32, n26) => (openBlock(), createElementBlock("tr", { key: n26 }, [
                    e9.optional ? (openBlock(), createElementBlock("td", M6, [
                      createVNode(v9, {
                        modelValue: b8.value,
                        "onUpdate:modelValue": c30[0] || (c30[0] = (u17) => b8.value = u17),
                        "show-label": false,
                        label: (n26 + 1).toString()
                      }, null, 8, ["modelValue", "label"])
                    ])) : createCommentVNode("", true),
                    e9.num ? (openBlock(), createElementBlock("td", O7, toDisplayString(n26 + 1), 1)) : createCommentVNode("", true),
                    (openBlock(true), createElementBlock(Fragment, null, renderList(e9.columns, (u17, E9) => (openBlock(), createElementBlock("td", { key: E9 }, [
                      u17.render ? (openBlock(), createBlock(resolveDynamicComponent(V7(u17.render)), { key: 0 })) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
                        createTextVNode(toDisplayString(r32[u17.key]), 1)
                      ], 64))
                    ]))), 128))
                  ]))), 128))
                ], 8, K6)) : createCommentVNode("", true)
              ])
            ], 2)
          ], 64)) : (openBlock(), createElementBlock("table", Q3, [
            renderSlot(e9.$slots, "default")
          ]))
        ], 2)
      ], 4);
    };
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/table/index.js
var i51 = n6(te2);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/dropdown-item/src/index3.js
var e8 = {
  disabled: u(),
  onClick: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/dropdown-item/src/index2.js
var u14 = defineComponent({
  name: "FDropdownItem"
});
var I8 = defineComponent({
  ...u14,
  props: e8,
  setup(l20) {
    const e9 = l20, n26 = inject(c24, null), s44 = (o8) => {
      e9.disabled || (o3(n26 && n26.handelClose), o3(e9.onClick, o8));
    };
    return (o8, _25) => (openBlock(), createElementBlock("div", {
      class: normalizeClass([
        "f-dropdown-item",
        {
          "f-dropdown-item__disabled": o8.disabled
        }
      ]),
      onClick: s44
    }, [
      renderSlot(o8.$slots, "default")
    ], 2));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/dropdown-item/index.js
var p26 = n6(I8);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/textarea/src/index3.js
var p27 = {
  modelValue: p(),
  rows: s(3),
  disabled: u(),
  maxLength: l(),
  autofocus: u(),
  name: p("f-textarea"),
  placeholder: p(),
  readonly: u(),
  onInput: i2(),
  resize: p("none", (n26) => ["none", "both", "horizontal", "vertical"].includes(n26)),
  clear: u(),
  onChange: i2(),
  onBlur: i2(),
  onFocus: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/textarea/src/index2.js
var N8 = ["rows", "value", "disabled", "readonly", "autofocus", "placeholder", "name"];
var P12 = defineComponent({
  name: "FTextarea"
});
var J9 = defineComponent({
  ...P12,
  props: p27,
  emits: {
    [t2]: (o8) => e(o8) || c(o8)
  },
  setup(o8, { emit: l20 }) {
    const i61 = o8, { filter: m22 } = k(i61), { onInput: u17, onClear: d6, onChange: p36 } = c21(
      m22(["onChange", "onInput", "disabled"]),
      l20
    ), f10 = (e9) => {
      u17(e9);
    }, c30 = (e9) => {
      p36(e9);
    };
    return (e9, r32) => (openBlock(), createElementBlock("div", {
      class: "f-textarea",
      style: normalizeStyle({ resize: e9.resize })
    }, [
      createBaseVNode("textarea", {
        class: normalizeClass(["f-textarea__textarea", { "f-textarea__disabled": e9.disabled }]),
        rows: e9.rows,
        value: e9.modelValue,
        disabled: e9.disabled,
        readonly: e9.readonly,
        autofocus: e9.autofocus,
        placeholder: e9.placeholder,
        name: e9.name,
        onInput: f10,
        onBlur: r32[0] || (r32[0] = (...n26) => e9.onBlur && e9.onBlur(...n26)),
        onFocus: r32[1] || (r32[1] = (...n26) => e9.onFocus && e9.onFocus(...n26)),
        onChange: c30
      }, null, 42, N8),
      e9.clear ? (openBlock(), createBlock(unref(a4), {
        key: 0,
        class: "f-textarea__clear-btn",
        icon: unref(a5),
        size: 14,
        onClick: unref(d6)
      }, null, 8, ["icon", "onClick"])) : createCommentVNode("", true)
    ], 4));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/textarea/index.js
var i52 = n6(J9);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/input-number/src/index3.js
var m14 = {
  modelValue: l(1),
  model: p("default", (o8) => ["default", "button", "switch"].includes(o8)),
  precision: l(0),
  buttonType: p(null, (o8) => e2.includes(o8)),
  step: l(1),
  size: p("middle", (o8) => n2.includes(o8)),
  disabled: u(),
  max: l(),
  min: l(),
  maxLength: l(),
  autofocus: u(),
  name: p("f-input-number"),
  placeholder: p(),
  clear: u(),
  readonly: u(),
  onChange: i2(),
  onBlur: i2(),
  onFocus: i2(),
  onInput: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-chevron-up/index.js
var r27 = {};
var c25 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s40 = createBaseVNode("path", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5",
  d: "M12.25 10.25L8 5.75l-4.25 4.5"
}, null, -1);
var i53 = [
  s40
];
function _21(l20, d6) {
  return openBlock(), createElementBlock("svg", c25, i53);
}
var a41 = s5(r27, [["render", _21]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-chevron-down/index.js
var r28 = {};
var c26 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s41 = createBaseVNode("path", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5",
  d: "M3.75 5.75L8 10.25l4.25-4.5"
}, null, -1);
var i54 = [
  s41
];
function _22(l20, d6) {
  return openBlock(), createElementBlock("svg", c26, i54);
}
var a42 = s5(r28, [["render", _22]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/input-number/src/index2.js
var U4 = {
  role: "input",
  class: "f-input-number"
};
var P13 = { class: "f-input-number__wrapper" };
var A4 = defineComponent({
  name: "FInputNumber"
});
var Y8 = defineComponent({
  ...A4,
  props: m14,
  emits: {
    [t2]: (t6) => c(t6)
  },
  setup(t6, { emit: V7 }) {
    const r32 = t6, i61 = computed({
      get: () => {
        const { modelValue: e9, precision: o8 } = r32;
        return c(e9) ? Number(e9.toFixed(c(o8) ? o8 : 0)) : 0;
      },
      set: (e9) => {
        V7(t2, Number(e9));
      }
    }), f10 = computed(() => {
      const { step: e9, min: o8 } = r32;
      return !o8 && !c(o8) ? false : i61.value - Math.abs(e9) < o8;
    }), c30 = computed(() => {
      const { step: e9, max: o8 } = r32;
      return !o8 && !c(o8) ? false : i61.value + Math.abs(e9) > o8;
    }), l20 = (e9) => {
      const { disabled: o8, readonly: m22, step: y9 } = r32;
      if (o8 || m22)
        return;
      const h16 = {
        minus: () => {
          i61.value -= y9;
        },
        plus: () => {
          i61.value += y9;
        }
      };
      h16[e9] && h16[e9](), o3(r32.onChange, i61.value);
    };
    return (e9, o8) => (openBlock(), createElementBlock("div", U4, [
      e9.model === "button" ? (openBlock(), createBlock(unref(a10), {
        key: 0,
        class: "f-input-number__minus",
        type: e9.buttonType || "primary",
        size: e9.size,
        disabled: e9.disabled || unref(f10),
        "before-icon": unref(m4),
        "on-click": () => l20("minus")
      }, null, 8, ["type", "size", "disabled", "before-icon", "on-click"])) : createCommentVNode("", true),
      createBaseVNode("div", P13, [
        createVNode(unref(p19), {
          modelValue: unref(i61),
          "onUpdate:modelValue": o8[0] || (o8[0] = (m22) => isRef(i61) ? i61.value = m22 : null),
          type: "number",
          max: e9.max,
          min: e9.min,
          disabled: e9.disabled,
          readonly: e9.readonly,
          autofocus: e9.autofocus,
          name: e9.name,
          size: e9.size,
          clear: e9.clear,
          placeholder: e9.placeholder,
          "on-blur": e9.onBlur,
          "on-focus": e9.onFocus,
          "on-input": e9.onInput,
          "on-change": e9.onChange
        }, {
          after: withCtx(() => [
            e9.model === "switch" ? (openBlock(), createElementBlock("div", {
              key: 0,
              class: normalizeClass(["f-input-number__switch", `f-input-number__switch-${e9.size}`])
            }, [
              createVNode(unref(a10), {
                disabled: e9.disabled || unref(c30),
                size: e9.size,
                type: e9.buttonType || "default",
                "before-icon": unref(a41),
                onclick: () => l20("plus")
              }, null, 8, ["disabled", "size", "type", "before-icon", "onclick"]),
              createVNode(unref(a10), {
                disabled: e9.disabled || unref(f10),
                size: e9.size,
                type: e9.buttonType || "default",
                "before-icon": unref(a42),
                "on-click": () => l20("minus")
              }, null, 8, ["disabled", "size", "type", "before-icon", "on-click"])
            ], 2)) : createCommentVNode("", true)
          ]),
          _: 1
        }, 8, ["modelValue", "max", "min", "disabled", "readonly", "autofocus", "name", "size", "clear", "placeholder", "on-blur", "on-focus", "on-input", "on-change"])
      ]),
      e9.model === "button" ? (openBlock(), createBlock(unref(a10), {
        key: 1,
        class: "f-input-number__plus",
        type: e9.buttonType || "primary",
        size: e9.size,
        disabled: e9.disabled || unref(c30),
        "before-icon": unref(a8),
        "on-click": () => l20("plus")
      }, null, 8, ["type", "size", "disabled", "before-icon", "on-click"])) : createCommentVNode("", true)
    ]));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/input-number/index.js
var p28 = n6(Y8);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tabs/src/index3.js
var l18 = {
  modelValue: s(),
  position: p("top", (e9) => ["left", "right", "top", "bottom"].includes(e9)),
  type: p("line", (e9) => ["line", "card", "segment"].includes(e9)),
  justifyContent: p(null, (e9) => ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"].includes(
    e9
  )),
  editStatus: u(),
  trigger: p("click", (e9) => ["click", "hover"].includes(e9)),
  onSwitch: i2(),
  onEdit: i2()
};
var c27 = Symbol("tabs-props-key");

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tabs/src/components/tabs-nav/index3.js
var o5 = {
  navs: y(),
  type: {
    type: String,
    default: () => "line",
    validator: (t6) => ["line", "card", "segment"].includes(t6)
  },
  position: {
    type: String,
    default: () => "top",
    validator: (t6) => ["left", "right", "top", "bottom"].includes(t6)
  },
  activeName: {
    type: [String, Number],
    default: () => null
  },
  justifyContent: {
    type: String,
    default: () => "flex-start",
    validator: (t6) => ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"].includes(
      t6
    )
  },
  editStatus: u(),
  trigger: {
    type: String,
    default: () => "click",
    validator: (t6) => ["click", "hover"].includes(t6)
  },
  setActiveName: i2(),
  setEdit: i2(),
  onSwitch: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-tabs-nav-style/index.js
var p29 = (i61) => {
  const e9 = getCurrentInstance(), r32 = ref({}), a56 = computed(
    () => i61.navs ? Math.max(
      i61.navs.findIndex((n26) => n26.name === i61.activeName),
      0
    ) : 0
  ), l20 = async () => {
    if (await nextTick(), !e9 || !e9.subTree.el)
      return;
    const { position: n26 } = i61, t6 = {}, o8 = e9.subTree.el.querySelectorAll(".f-tabs-nav__item");
    if (!o8 || !o8.length)
      return;
    const s44 = o8[a56.value], f10 = window && window.getComputedStyle(s44);
    n26 === "top" || n26 === "bottom" ? (t6.width = s44.clientWidth - f(f10.padding) + "px", t6.bottom = 0, t6.transform = `translateX(${s44.offsetLeft}px)`) : (n26 === "left" || n26 === "right") && (t6.height = s44.clientHeight - f(f10.padding) + "px", t6.transform = `translateY(${s44.offsetTop}px)`, n26 === "left" ? t6.right = 0 : t6.left = 0), r32.value = t6;
  }, c30 = new IntersectionObserver(l20);
  return onMounted(() => {
    !e9 || !e9.subTree.el || c30.observe(e9.subTree.el);
  }), onUnmounted(() => {
    !e9 || !e9.subTree.el || c30.unobserve(e9.subTree.el);
  }), {
    activeIndex: a56,
    activeLineStyle: r32,
    setActiveLineStyle: l20
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tabs/src/components/tabs-nav/index2.js
var D5 = {
  key: 0,
  class: "f-tabs-nav__prefix"
};
var H5 = { class: "f-tabs-nav__wrapper" };
var K7 = { class: "f-tabs-nav__item-label" };
var M7 = {
  key: 1,
  class: "f-tabs-nav__suffix"
};
var R5 = defineComponent({
  name: "FTabsNav"
});
var x3 = defineComponent({
  ...R5,
  props: o5,
  setup(y9) {
    const t6 = y9, { setActiveLineStyle: _25, activeIndex: b8, activeLineStyle: k8 } = p29(t6), S9 = async (e9) => {
      let s44 = true;
      t6.onSwitch && (s44 = await t6.onSwitch(e9)), !(i(s44) && !s44) && o3(t6.setActiveName, e9);
    }, m22 = (e9, s44, o8) => {
      o3(t6.setEdit, e9, s44, o8);
    };
    watch(
      [
        () => t6.position,
        () => t6.type,
        () => t6.justifyContent,
        () => b8.value
      ],
      () => {
        t6.type === "line" && _25();
      },
      { immediate: true }
    );
    const C9 = computed(() => t6.trigger === "hover" ? "mouseenter" : "click");
    return (e9, s44) => (openBlock(), createElementBlock("div", {
      class: normalizeClass(["f-tabs-nav", `f-tabs-nav__${e9.type}`])
    }, [
      e9.$slots.prefix ? (openBlock(), createElementBlock("div", D5, [
        renderSlot(e9.$slots, "prefix")
      ])) : createCommentVNode("", true),
      createBaseVNode("div", H5, [
        createBaseVNode("div", {
          class: "f-tabs-nav__main",
          style: normalizeStyle({ justifyContent: e9.type === "line" ? e9.justifyContent : "" })
        }, [
          (openBlock(true), createElementBlock(Fragment, null, renderList(e9.navs, (o8, l20) => (openBlock(), createElementBlock("div", {
            key: l20,
            role: "tablist",
            class: normalizeClass([
              "f-tabs-nav__item",
              {
                "f-tabs-nav__item-active": o8.name === e9.activeName
              }
            ]),
            [toHandlerKey(unref(C9))]: (h16) => S9(o8.name)
          }, [
            createBaseVNode("span", K7, toDisplayString(o8.label || `标签 ${l20}`), 1),
            e9.type === "card" && e9.editStatus ? (openBlock(), createBlock(unref(s8), {
              key: 0,
              round: "",
              onClick: withModifiers((h16) => m22("remove", o8.name, l20), ["stop"])
            }, null, 8, ["onClick"])) : createCommentVNode("", true)
          ], 16))), 128)),
          e9.type === "card" && e9.editStatus ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: "f-tabs-nav__item",
            onClick: s44[0] || (s44[0] = (o8) => m22("add"))
          }, [
            createVNode(unref(a4), {
              icon: unref(u12),
              color: "#666"
            }, null, 8, ["icon"])
          ])) : createCommentVNode("", true)
        ], 4),
        e9.type === "line" ? (openBlock(), createElementBlock("div", {
          key: 0,
          class: "f-tabs-nav__line-active",
          style: normalizeStyle(unref(k8))
        }, null, 4)) : createCommentVNode("", true)
      ]),
      e9.$slots.suffix ? (openBlock(), createElementBlock("div", M7, [
        renderSlot(e9.$slots, "suffix")
      ])) : createCommentVNode("", true)
    ], 2));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_utils/tabs/index.js
var u15 = (t6) => {
  const o8 = b(t6) ? t6 : [t6], n26 = [];
  return o8.forEach((e9) => {
    b(e9) ? n26.push(...u15(e9)) : isVNode(e9) && b(e9.children) ? n26.push(...u15(e9.children)) : isVNode(e9) && e9.component && n26.push(e9);
  }), n26;
};
var d4 = (t6, o8) => t6.subTree ? u15(t6.subTree.children).filter((e9) => a(e9.type) && e9.type.name === o8) : [];
var v6 = (t6, o8) => {
  const n26 = /* @__PURE__ */ new Map(), e9 = shallowRef([]);
  return {
    children: e9,
    registerChild: (r32) => {
      n26.set(r32.uid, r32);
      const s44 = d4(t6, o8);
      console.log(s44);
      const a56 = s44.map((i61) => i61.component ? i61.component.uid : null).filter(Boolean);
      e9.value = a56.map((i61) => n26.get(i61)).filter(Boolean);
    },
    unRegisterChild: (r32) => {
      n26.delete(r32.uid), e9.value = e9.value.filter((s44) => s44.uid !== r32.uid);
    }
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-tabs/index.js
var R6 = (t6, l20) => {
  const m22 = getCurrentInstance(), n26 = v6(m22, "FTabsPane"), a56 = ref(0), s44 = (e9) => {
    a56.value = e9, l20(t2, e9);
  }, u17 = (e9, r32, c30) => {
    o3(t6.onEdit, e9, r32, c30);
  }, o8 = computed(() => n26.children.value && n26.children.value.map((e9, r32) => (e9.paneName = e9.paneName || r32, {
    name: e9.paneName,
    label: e9.slots.label || e9.prop.label
  })));
  return watch(
    () => t6.modelValue,
    (e9) => {
      a56.value = e9;
    },
    { immediate: true }
  ), onMounted(async () => {
    await nextTick(), s44(t6.modelValue || o8.value[0] && o8.value[0].name);
  }), provide(c27, {
    activeName: a56,
    ...n26
  }), {
    navs: o8,
    activeName: a56,
    setEdit: u17,
    setActiveName: s44
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tabs/src/index2.js
var j7 = { class: "f-tabs__content" };
var B13 = defineComponent({
  name: "FTabs"
});
var U5 = defineComponent({
  ...B13,
  props: l18,
  emits: {
    [t2]: (s44) => c(s44) || e(s44)
  },
  setup(s44, { expose: u17, emit: l20 }) {
    const i61 = s44, { navs: n26, activeName: r32, setEdit: d6, setActiveName: v9 } = R6(i61, l20), a56 = computed(() => {
      const { position: t6, type: m22 } = i61;
      return m22 === "segment" && (t6 === "right" || t6 === "left") ? "top" : t6;
    });
    return u17({ activeName: r32 }), (t6, m22) => (openBlock(), createElementBlock("div", {
      role: "tab",
      class: normalizeClass(["f-tabs", `f-tabs__${unref(a56)}`])
    }, [
      unref(n26).length ? (openBlock(), createBlock(unref(x3), {
        key: 0,
        navs: unref(n26),
        type: t6.type,
        "active-name": unref(r32),
        position: unref(a56),
        "edit-status": t6.editStatus,
        "justify-content": t6.justifyContent,
        trigger: t6.trigger,
        "set-edit": unref(d6),
        "set-active-name": unref(v9),
        "on-switch": t6.onSwitch
      }, createSlots({ _: 2 }, [
        t6.$slots.prefix ? {
          name: "prefix",
          fn: withCtx(() => [
            renderSlot(t6.$slots, "prefix")
          ])
        } : void 0,
        t6.$slots.suffix ? {
          name: "suffix",
          fn: withCtx(() => [
            renderSlot(t6.$slots, "suffix")
          ])
        } : void 0
      ]), 1032, ["navs", "type", "active-name", "position", "edit-status", "justify-content", "trigger", "set-edit", "set-active-name", "on-switch"])) : createCommentVNode("", true),
      createBaseVNode("div", j7, [
        renderSlot(t6.$slots, "default")
      ])
    ], 2));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tabs/index.js
var i55 = n6(U5);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tabs-pane/src/index3.js
var m15 = {
  name: s(),
  label: p(),
  lazy: u()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tabs-pane/src/index2.js
var y6 = {
  key: 0,
  role: "tabpanel",
  class: "f-tabs-pane"
};
var E8 = defineComponent({
  name: "FTabsPane"
});
var z6 = defineComponent({
  ...E8,
  props: m15,
  setup(c30) {
    const t6 = c30, l20 = useSlots(), i61 = getCurrentInstance(), n26 = ref(t6.name), e9 = inject(c27, null), u17 = computed(() => e9 ? e9.activeName.value === n26.value ? true : !t6.lazy : false), m22 = computed(() => e9 && e9.activeName.value === n26.value), o8 = reactive({
      paneName: n26,
      label: t6.label,
      uid: i61.uid,
      slots: l20,
      prop: t6
    });
    return onMounted(() => {
      e9 && e9.registerChild(o8);
    }), onBeforeUnmount(() => {
      e9 && e9.unRegisterChild(o8);
    }), (p36, I11) => unref(u17) ? withDirectives((openBlock(), createElementBlock("div", y6, [
      renderSlot(p36.$slots, "default")
    ], 512)), [
      [vShow, unref(m22)]
    ]) : createCommentVNode("", true);
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/tabs-pane/index.js
var i56 = n6(z6);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/date-picker/src/index3.js
var a43 = {
  date: p(),
  disabled: u(),
  clear: u(),
  size: p("middle", (e9) => n2.includes(e9)),
  format: p("YYYY/MM/DD"),
  placeholder: p(),
  addZero: u()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-calendar/index.js
var r29 = {};
var c28 = {
  width: "1em",
  height: "1em",
  viewBox: "0 0 16 16"
};
var s42 = createBaseVNode("path", {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
  "stroke-width": "1.5",
  d: "M1.75 3.75h12.5v10.5H1.75zm9.5-2v1.5m-6.5-1.5v1.5m-2.5 4h11.5"
}, null, -1);
var i57 = [
  s42
];
function _23(d6, l20) {
  return openBlock(), createElementBlock("svg", c28, i57);
}
var a44 = s5(r29, [["render", _23]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/date-picker/src/index2.js
var R7 = { class: "f-date-picker" };
var w12 = { class: "f-date-picker__content" };
var z7 = defineComponent({
  name: "FDatePicker"
});
var j8 = defineComponent({
  ...z7,
  props: a43,
  emits: {
    [E2]: (n26) => e(n26)
  },
  setup(n26, { emit: D7 }) {
    const r32 = n26, i61 = /* @__PURE__ */ new Date(), l20 = computed({
      get: () => r32.date,
      set: (e9) => {
        D7(E2, e9);
      }
    }), h16 = ({ year: e9, month: t6, date: o8 }) => {
      if (!RegExp(/([Y]{4})|([M]{2})|([D]{2})/).test(r32.format)) {
        l20.value = `${e9}/${r32.addZero ? s3(t6) : t6}/${r32.addZero ? s3(o8) : o8}`;
        return;
      }
      const m22 = {
        YYYY: e9,
        MM: r32.addZero ? s3(t6) : t6,
        DD: r32.addZero ? s3(o8) : o8
      };
      let s44 = r32.format;
      for (const p36 in m22)
        s44 = s44.replace(p36, m22[p36].toString());
      l20.value = s44;
    };
    return (e9, t6) => (openBlock(), createElementBlock("div", R7, [
      createVNode(unref(a39), {
        trigger: "click",
        disabled: e9.disabled
      }, {
        content: withCtx(() => [
          createBaseVNode("div", w12, [
            createVNode(unref(i14), {
              date: unref(i61),
              "onUpdate:date": t6[1] || (t6[1] = (o8) => isRef(i61) ? i61.value = o8 : null),
              "day-cell-height": 40,
              "week-cell-height": 40,
              "on-change-date": h16
            }, null, 8, ["date"])
          ])
        ]),
        default: withCtx(() => [
          createVNode(unref(p19), {
            modelValue: unref(l20),
            "onUpdate:modelValue": t6[0] || (t6[0] = (o8) => isRef(l20) ? l20.value = o8 : null),
            autocomplete: "off",
            readonly: "",
            disabled: e9.disabled,
            placeholder: e9.placeholder || "请选择日期",
            clear: e9.clear,
            size: e9.size,
            "after-icon": unref(a44)
          }, null, 8, ["modelValue", "disabled", "placeholder", "clear", "size", "after-icon"])
        ]),
        _: 1
      }, 8, ["disabled"])
    ]));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/date-picker/index.js
var a45 = n6(j8);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/time-picker/src/index3.js
var m16 = {
  time: p(),
  disabled: u(),
  clear: u(),
  placeholder: p(),
  size: p("middle", (o8) => n2.includes(o8))
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_svg/f-icon-clock-time/index.js
var n22 = {};
var r30 = {
  width: "32",
  height: "32",
  viewBox: "0 0 24 24"
};
var s43 = createBaseVNode("path", {
  fill: "currentColor",
  d: "M12 20c4.4 0 8-3.6 8-8s-3.6-8-8-8s-8 3.6-8 8s3.6 8 8 8m0-18c5.5 0 10 4.5 10 10s-4.5 10-10 10S2 17.5 2 12S6.5 2 12 2m5 9.5V13h-6V7h1.5v4.5H17Z"
}, null, -1);
var _24 = [
  s43
];
function i58(l20, h16) {
  return openBlock(), createElementBlock("svg", r30, _24);
}
var f7 = s5(n22, [["render", i58]]);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/time-picker/src/index2.js
var J10 = { class: "f-time-picker" };
var K8 = { class: "f-time-picker__content" };
var O8 = ["onClick"];
var Q4 = ["onClick"];
var W4 = ["onClick"];
var X5 = { class: "f-time-picker__option" };
var Y9 = createTextVNode("当前");
var ee5 = createTextVNode("取消");
var te3 = createTextVNode("确定");
var oe3 = defineComponent({
  name: "FTimePicker"
});
var ue2 = defineComponent({
  ...oe3,
  props: m16,
  emits: {
    [T3]: (_25) => e(_25)
  },
  setup(_25, { emit: M9 }) {
    const H6 = _25, f10 = /* @__PURE__ */ new Date(), t6 = reactive({
      hour: s3(f10.getHours()),
      minute: s3(f10.getMinutes()),
      second: s3(f10.getSeconds())
    }), m22 = computed({
      get: () => H6.time,
      set: (o8) => {
        M9(T3, o8);
      }
    }), F11 = ref(), p36 = (o8 = true) => {
      if (o8 && !e(o8) && (m22.value = `${t6.hour}:${t6.minute}:${t6.second}`), o8 === "now") {
        const r32 = /* @__PURE__ */ new Date();
        t6.hour = s3(r32.getHours()), t6.minute = s3(r32.getMinutes()), t6.second = s3(r32.getSeconds());
      }
      i(o8) && F11.value.handelClose();
    }, N10 = ref(), S9 = ref(), k8 = ref(), v9 = computed(() => k8.value.querySelector(".f-time-picker__second-item").offsetHeight), z10 = async () => {
      await nextTick(), N10.value.scrollTo({
        top: (Number(t6.hour) === 0 ? 24 : Number(t6.hour) - 2) * v9.value,
        behavior: "smooth"
      }), S9.value.scrollTo({
        top: (Number(t6.minute) - 2) * v9.value,
        behavior: "smooth"
      }), k8.value.scrollTo({
        top: (Number(t6.second) - 2) * v9.value,
        behavior: "smooth"
      });
    }, h16 = (o8, r32) => {
      t6[r32] = s3(o8);
    };
    return watch(
      () => t6,
      () => {
        z10();
      },
      { deep: true }
    ), (o8, r32) => {
      const g5 = resolveComponent("f-button");
      return openBlock(), createElementBlock("div", J10, [
        createVNode(unref(a39), {
          ref_key: "triggerInstance",
          ref: F11,
          trigger: "click",
          disabled: o8.disabled,
          "on-open": z10
        }, {
          content: withCtx(() => [
            createBaseVNode("div", K8, [
              createBaseVNode("div", {
                ref_key: "hoverEl",
                ref: N10,
                class: "f-time-picker__hour"
              }, [
                (openBlock(), createElementBlock(Fragment, null, renderList(24, (e9) => createBaseVNode("div", {
                  key: e9,
                  class: normalizeClass([
                    "f-time-picker__hour-item",
                    { "f-time-picker__hour-active": unref(s3)(e9 === 24 ? 0 : e9).toString() === unref(t6).hour }
                  ]),
                  onClick: withModifiers((D7) => h16(e9 === 24 ? 0 : e9, "hour"), ["stop"])
                }, toDisplayString(unref(s3)(e9 === 24 ? 0 : e9)), 11, O8)), 64))
              ], 512),
              createBaseVNode("div", {
                ref_key: "minuteEl",
                ref: S9,
                class: "f-time-picker__minute"
              }, [
                (openBlock(), createElementBlock(Fragment, null, renderList(59, (e9) => createBaseVNode("div", {
                  key: e9,
                  class: normalizeClass([
                    "f-time-picker__minute-item",
                    { "f-time-picker__minute-active": unref(s3)(e9).toString() === unref(t6).minute }
                  ]),
                  onClick: withModifiers((D7) => h16(e9, "minute"), ["stop"])
                }, toDisplayString(unref(s3)(e9)), 11, Q4)), 64))
              ], 512),
              createBaseVNode("div", {
                ref_key: "secondEl",
                ref: k8,
                class: "f-time-picker__second"
              }, [
                (openBlock(), createElementBlock(Fragment, null, renderList(59, (e9) => createBaseVNode("div", {
                  key: e9,
                  class: normalizeClass([
                    "f-time-picker__second-item",
                    { "f-time-picker__second-active": unref(s3)(e9).toString() === unref(t6).second }
                  ]),
                  onClick: withModifiers((D7) => h16(e9, "second"), ["stop"])
                }, toDisplayString(unref(s3)(e9)), 11, W4)), 64))
              ], 512)
            ]),
            createBaseVNode("div", X5, [
              createVNode(g5, {
                size: "mini",
                "on-click": () => p36("now")
              }, {
                default: withCtx(() => [
                  Y9
                ]),
                _: 1
              }, 8, ["on-click"]),
              createVNode(g5, {
                size: "mini",
                "on-click": () => p36(false)
              }, {
                default: withCtx(() => [
                  ee5
                ]),
                _: 1
              }, 8, ["on-click"]),
              createVNode(g5, {
                type: "primary",
                size: "mini",
                "on-click": () => p36(true)
              }, {
                default: withCtx(() => [
                  te3
                ]),
                _: 1
              }, 8, ["on-click"])
            ])
          ]),
          default: withCtx(() => [
            createVNode(unref(p19), {
              modelValue: unref(m22),
              "onUpdate:modelValue": r32[0] || (r32[0] = (e9) => isRef(m22) ? m22.value = e9 : null),
              autocomplete: "off",
              type: "text",
              placeholder: o8.placeholder || "请选择时间",
              disabled: o8.disabled,
              size: o8.size,
              clear: o8.clear,
              "after-icon": unref(f7)
            }, null, 8, ["modelValue", "placeholder", "disabled", "size", "clear", "after-icon"])
          ]),
          _: 1
        }, 8, ["disabled"])
      ]);
    };
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/time-picker/index.js
var a46 = n6(ue2);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/menu/src/index3.js
var n23 = {
  mode: p("horizontal", (o8) => ["horizontal", "vertical", "inline"].includes(o8)),
  activeName: s()
};
var m17 = Symbol("menu-provide-key");

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/menu/src/index2.js
var C8 = {
  key: 0,
  class: "f-menu__before"
};
var V4 = { class: "f-menu__content" };
var y7 = {
  key: 1,
  class: "f-menu__after"
};
var A5 = defineComponent({
  name: "FMenu"
});
var D6 = defineComponent({
  ...A5,
  props: n23,
  setup(c30) {
    const o8 = c30, { classes: l20 } = P(o8, "menu"), r32 = ref(o8.activeName), f10 = computed(() => r32.value), i61 = (e9) => {
      r32.value = e9;
    };
    provide(m17, {
      mode: toRef(o8, "mode"),
      defaultActive: f10,
      setActiveName: i61
    });
    const u17 = l20(["mode"], "f-menu");
    return (e9, B17) => (openBlock(), createElementBlock("div", {
      role: "menu",
      class: normalizeClass(unref(u17))
    }, [
      e9.$slots.before ? (openBlock(), createElementBlock("div", C8, [
        renderSlot(e9.$slots, "before")
      ])) : createCommentVNode("", true),
      createBaseVNode("div", V4, [
        renderSlot(e9.$slots, "default")
      ]),
      e9.$slots.after ? (openBlock(), createElementBlock("div", y7, [
        renderSlot(e9.$slots, "after")
      ])) : createCommentVNode("", true)
    ], 2));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/menu/index.js
var a47 = n6(D6);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/menu-item/src/index3.js
var n24 = {
  icon: c2(),
  fontSize: s(),
  color: p(),
  to: p(),
  name: s(),
  disabled: u()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/menu-item/src/index2.js
var S7 = { class: "f-menu-item__text" };
var z8 = defineComponent({
  name: "FMenuItem"
});
var $11 = defineComponent({
  ...z8,
  props: n24,
  setup(c30) {
    const t6 = c30, { styles: l20 } = P(t6, "menu-item"), o8 = inject(m17, null), m22 = getCurrentInstance(), a56 = l20(["fontSize", "color"]), u17 = () => {
      if (t6.disabled)
        return;
      const e9 = m22.appContext.config.globalProperties.$router;
      if (o8 && o8.setActiveName(t6.name), e9 && t6.to)
        try {
          e9.push(t6.to);
        } catch (r32) {
          console.warn(r32);
        }
    }, f10 = computed(() => !o8 || !o8.defaultActive ? false : t6.name === (o8 && o8.defaultActive.value));
    return (e9, r32) => (openBlock(), createElementBlock("div", {
      role: "menuitem",
      class: normalizeClass(["f-menu-item", { "f-menu-item__active": unref(f10), "f-menu-item__disabled": e9.disabled }]),
      style: normalizeStyle(unref(a56)),
      onClick: u17
    }, [
      e9.icon ? (openBlock(), createBlock(unref(a4), {
        key: 0,
        icon: e9.icon
      }, null, 8, ["icon"])) : createCommentVNode("", true),
      createBaseVNode("span", S7, [
        renderSlot(e9.$slots, "default")
      ])
    ], 6));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/menu-item/index.js
var a48 = n6($11);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/submenu/src/index3.js
var r31 = {
  disabled: u(),
  opened: u()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/submenu/src/index2.js
var F8 = { class: "f-submenu__title" };
var I9 = { class: "f-submenu__title-text" };
var N9 = {
  key: 1,
  role: "none",
  class: "f-submenu__inline"
};
var V5 = {
  role: "none",
  class: "f-submenu__title-text"
};
var y8 = {
  role: "none",
  class: "f-submenu__content"
};
var B14 = defineComponent({
  name: "FSubmenu"
});
var M8 = defineComponent({
  ...B14,
  props: r31,
  setup(p36) {
    const a56 = p36, o8 = inject(m17, null), s44 = ref(a56.opened), v9 = () => {
      a56.disabled || (s44.value = !s44.value);
    };
    return console.log(o8), (n26, D7) => (openBlock(), createElementBlock("div", {
      role: "menuitem",
      class: normalizeClass([
        "f-submenu",
        {
          [`f-submenu__${unref(o8) && unref(o8).mode.value}`]: unref(o8) && unref(o8).mode.value,
          "f-submenu__disabled": n26.disabled
        }
      ])
    }, [
      unref(o8) && unref(o8).mode.value !== "inline" ? (openBlock(), createBlock(unref(p23), {
        key: 0,
        trigger: "click",
        spacing: 5
      }, {
        content: withCtx(() => [
          renderSlot(n26.$slots, "default")
        ]),
        default: withCtx(() => [
          createBaseVNode("div", F8, [
            createBaseVNode("div", I9, [
              n26.$slots.title ? renderSlot(n26.$slots, "title", { key: 0 }) : createCommentVNode("", true)
            ]),
            createVNode(unref(a4), { icon: unref(a42) }, null, 8, ["icon"])
          ])
        ]),
        _: 3
      })) : (openBlock(), createElementBlock("div", N9, [
        createBaseVNode("div", {
          role: "none",
          class: "f-submenu__title",
          onClick: v9
        }, [
          createBaseVNode("div", V5, [
            renderSlot(n26.$slots, "title")
          ]),
          createVNode(unref(a4), {
            class: normalizeClass(["f-submenu__arrow-icon", { "f-submenu__arrow-icon-animation": s44.value }]),
            icon: unref(a42)
          }, null, 8, ["class", "icon"])
        ]),
        createBaseVNode("div", y8, [
          createVNode(unref(r21), { opened: s44.value }, {
            default: withCtx(() => [
              renderSlot(n26.$slots, "default")
            ]),
            _: 3
          }, 8, ["opened"])
        ])
      ]))
    ], 2));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/submenu/index.js
var a49 = n6(M8);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/menu-item-group/src/index3.js
var p30 = {
  title: p()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/menu-item-group/src/index2.js
var l19 = { class: "f-menu-item-group" };
var m18 = { class: "f-menu-item-group__title" };
var p31 = { class: "f-menu-item-group__list" };
var c29 = defineComponent({
  name: "FMenuItemGroup"
});
var g3 = defineComponent({
  ...c29,
  props: p30,
  setup(u17) {
    return (e9, a56) => (openBlock(), createElementBlock("div", l19, [
      createBaseVNode("div", m18, toDisplayString(e9.title), 1),
      createBaseVNode("div", p31, [
        renderSlot(e9.$slots, "default")
      ])
    ]));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/menu-item-group/index.js
var p32 = n6(g3);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/slider/src/index3.js
var m19 = {
  modelValue: l(0),
  step: l(1),
  min: l(0),
  max: l(100),
  disabled: u(),
  background: p(),
  activeColor: p(),
  width: s()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-slider/index.js
var d5 = (t6, n26) => {
  const e9 = (m22) => {
    n26(m22.clientX);
  }, s44 = () => {
    document.removeEventListener("mousemove", e9), document.removeEventListener("mouseup", s44);
  }, o8 = () => {
    document.addEventListener("mousemove", e9, { passive: false }), document.addEventListener("mouseup", s44, { passive: false });
  };
  return () => {
    t6.addEventListener("mousedown", o8, { passive: false });
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/slider/src/index2.js
var z9 = { class: "f-slider__road" };
var B15 = defineComponent({
  name: "FSlider"
});
var F9 = defineComponent({
  ...B15,
  props: m19,
  emits: {
    [t2]: (r32) => c(r32)
  },
  setup(r32, { emit: _25 }) {
    const e9 = r32, { styles: v9, classes: y9 } = P(e9, "slider"), d6 = ref(), l20 = ref(), i61 = ref(0), h16 = computed(() => parseInt(d6.value.offsetWidth + "")), E9 = y9(["disabled"], "f-slider"), k8 = v9(["background", "activeColor", "width"]), f10 = (s44) => {
      s44 < 0 ? s44 = 0 : s44 > 100 && (s44 = 100);
      const t6 = Math.round(s44 / e9.step) * e9.step;
      i61.value = t6, _25(t2, t6);
    };
    return onMounted(() => {
      l20.value && (d5(l20.value, (o8) => {
        if (e9.disabled)
          return;
        const t6 = o8 * 100 / h16.value;
        f10(t6);
      })(), f10((e9.modelValue - e9.min) * 100 / (e9.max - e9.min)));
    }), (s44, o8) => (openBlock(), createElementBlock("div", {
      ref_key: "sliderEl",
      ref: d6,
      role: "slider",
      class: normalizeClass(unref(E9)),
      style: normalizeStyle(unref(k8))
    }, [
      createBaseVNode("div", z9, [
        createBaseVNode("div", {
          class: "f-slider__selected",
          style: normalizeStyle(`width: ${i61.value}%`)
        }, null, 4),
        createBaseVNode("div", {
          ref_key: "sliderCircle",
          ref: l20,
          class: "f-slider__icon",
          style: normalizeStyle(`left: ${i61.value}%`)
        }, null, 4)
      ])
    ], 6));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/slider/index.js
var a50 = n6(F9);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/fighting-global/src/index2.js
var I10 = defineComponent({
  name: "FFightingGlobal"
});
var T8 = defineComponent({
  ...I10,
  props: p3,
  setup(o8) {
    const e9 = o8, { interceptors: t6 } = k(e9), s44 = computed(() => t6(
      "type",
      () => e2.includes(e9.type),
      "default"
    )), p36 = computed(() => t6(
      "size",
      () => n2.includes(e9.size),
      "middle"
    )), i61 = computed(() => t6(
      "lang",
      () => ["en-US", "zh-CN"].includes(e9.lang),
      "zh-CN"
    ));
    return provide(
      s9,
      reactive({
        type: s44.value,
        size: p36.value,
        lang: i61.value
      })
    ), (u17, g5) => renderSlot(u17.$slots, "default");
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/fighting-global/index.js
var a51 = n6(T8);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/form/src/index3.js
var p33 = {
  labelWidth: s(),
  model: c2(),
  onSubmit: i2()
};
var i59 = Symbol("form-provide-key");

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/form/src/index2.js
var B16 = defineComponent({
  name: "FForm"
});
var A6 = defineComponent({
  ...B16,
  props: p33,
  setup(l20) {
    const t6 = l20, p36 = useSlots(), s44 = reactive({}), m22 = computed(() => {
      if (!p36.default)
        return [];
      const r32 = p21(p36.default(), "FFormItem");
      return r32.forEach((e9) => {
        e9.props && e9.props.name && (s44[e9.props.name] = false);
      }), r32;
    }), i61 = (r32, e9) => {
      const n26 = (o8) => {
        const c30 = r32.length + 1;
        return !(o8.required && !r32 || o8.max && c30 > o8.max || o8.min && c30 < o8.min || o8.regExp && !o8.regExp.test(r32));
      };
      if (b(e9)) {
        for (const o8 of e9)
          if (!n26(o8))
            return o8.message || false;
      } else if (a(e9) && !n26(e9))
        return e9.message || false;
      return true;
    }, u17 = () => {
      m22.value.forEach((e9) => {
        if (e9.props && e9.props.rules && e9.props.name && t6.model) {
          const n26 = i61(
            t6.model[e9.props.name],
            e9.props.rules
          );
          s44[e9.props.name] = n26;
        }
      });
      const r32 = Object.values(s44);
      return r32.length ? r32.every((e9) => !!e9 && !e(e9)) : true;
    }, d6 = (r32) => {
      r32.preventDefault();
      const e9 = t6.model ? u17() : true;
      o3(t6.onSubmit, { ok: e9, res: s44, evt: r32 });
    };
    return provide(
      i59,
      reactive({
        ...toRefs(t6),
        childrenCheckResult: s44
      })
    ), (r32, e9) => r32.$slots.default ? (openBlock(), createElementBlock("form", {
      key: 0,
      role: "form",
      class: "f-form",
      onsubmit: d6
    }, [
      renderSlot(r32.$slots, "default")
    ])) : createCommentVNode("", true);
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/form/index.js
var a52 = n6(A6);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/form-item/src/index3.js
var o6 = {
  label: p(),
  name: p(),
  rules: {
    type: [Array, Object],
    default: () => null
  }
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/form-item/src/index2.js
var S8 = { class: "f-form-item__label" };
var V6 = { class: "f-form-item__content" };
var v7 = {
  key: 0,
  class: "f-form-item__error"
};
var F10 = defineComponent({
  name: "FFormItem"
});
var w13 = defineComponent({
  ...F10,
  props: o6,
  setup(c30) {
    const f10 = c30, t6 = inject(i59, null), r32 = computed(() => {
      const e9 = t6 && t6.childrenCheckResult[f10.name];
      return e(e9) ? e9 : false;
    }), _25 = computed(() => ({
      "--form-item-label-width": t6 && t6.labelWidth
    }));
    return (e9, I11) => (openBlock(), createElementBlock("div", {
      class: "f-form-item",
      style: normalizeStyle(unref(_25))
    }, [
      createBaseVNode("label", S8, toDisplayString(e9.label), 1),
      createBaseVNode("div", V6, [
        renderSlot(e9.$slots, "default"),
        createVNode(Transition, { name: "f-form-item__err-transition" }, {
          default: withCtx(() => [
            unref(r32) ? (openBlock(), createElementBlock("div", v7, toDisplayString(unref(r32)), 1)) : createCommentVNode("", true)
          ]),
          _: 1
        })
      ])
    ], 4));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/form-item/index.js
var a53 = n6(w13);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/box/src/index3.js
var p34 = {
  role: p(),
  padding: s(),
  width: s(),
  height: s(),
  background: p(),
  display: p()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/box/src/index2.js
var f8 = ["role"];
var u16 = defineComponent({
  name: "FBox"
});
var x4 = defineComponent({
  ...u16,
  props: p34,
  setup(t6) {
    const r32 = t6, { styles: s44 } = P(r32, "box"), n26 = s44(["padding", "width", "height", "background", "display"]);
    return (o8, _25) => (openBlock(), createElementBlock("div", {
      class: "f-box",
      role: o8.role || "none",
      style: normalizeStyle(unref(n26))
    }, [
      renderSlot(o8.$slots, "default")
    ], 12, f8));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/box/index.js
var a54 = n6(x4);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/infinite-scrolling/src/index3.js
var p35 = {
  distance: l(0),
  styles: c2(),
  loading: u(),
  onScrollEnd: i2(),
  onScrollWhen: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/infinite-scrolling/src/index2.js
var v8 = {
  key: 0,
  class: "f-infinite-scrolling__loading"
};
var h14 = defineComponent({
  name: "FInfiniteScrolling"
});
var w14 = defineComponent({
  ...h14,
  props: p35,
  setup(f10) {
    const l20 = f10, o8 = ref(false), n26 = ref(), u17 = () => {
      if (l20.loading)
        return;
      const e9 = n26.value;
      if (!e9)
        return;
      const t6 = Math.ceil(e9.scrollTop + e9.clientHeight + l20.distance);
      o3(l20.onScrollWhen, Math.ceil(e9.scrollTop)), t6 >= e9.scrollHeight && !o8.value && (o8.value = true, o3((p36) => {
        l20.onScrollEnd(p36), o8.value = false;
      }, t6));
    };
    return (e9, t6) => (openBlock(), createElementBlock("div", {
      ref_key: "scrollEl",
      ref: n26,
      class: "f-infinite-scrolling",
      style: normalizeStyle(e9.styles),
      onScroll: u17
    }, [
      renderSlot(e9.$slots, "default"),
      e9.loading ? (openBlock(), createElementBlock("div", v8, "加载中...")) : createCommentVNode("", true)
    ], 36));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/infinite-scrolling/index.js
var n25 = n6(w14);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/number-animate/src/index3.js
var m20 = {
  from: l(0),
  to: l(),
  approximateTime: l(2e3),
  localeString: u(),
  styles: c2(),
  automatic: u(true),
  onAnimationEnd: i2()
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/number-animate/src/index2.js
var A7 = defineComponent({
  name: "FNumberAnimate"
});
var h15 = defineComponent({
  ...A7,
  props: m20,
  setup(l20, { expose: c30 }) {
    const e9 = l20, t6 = ref(e9.from), r32 = ref(false), a56 = (o8) => {
      r32.value && (t6.value = e9.from, r32.value = false);
      const n26 = Number(e9.to);
      if (!(!c(Number(t6.value)) || !c(n26))) {
        if (t6.value += n26 / e9.approximateTime * 20, t6.value >= n26) {
          t6.value = n26, o3(e9.onAnimationEnd, o8);
          return;
        }
        window && window.requestAnimationFrame(a56);
      }
    }, f10 = computed(() => e9.localeString ? t6.value.toLocaleString() : t6.value), m22 = (o8 = true) => {
      r32.value = o8, window && window.requestAnimationFrame(a56);
    };
    return onMounted(() => {
      e9.automatic && m22(false);
    }), c30({ run: () => {
      m22();
    } }), (o8, n26) => (openBlock(), createElementBlock("div", {
      class: "f-number-animate",
      style: normalizeStyle(o8.styles)
    }, toDisplayString(unref(f10)), 5));
  }
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/number-animate/index.js
var a55 = n6(h15);

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/index4.js
var o7 = "0.25.1";

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_hooks/use-loading/index.js
var g4 = () => {
  const r32 = (o8, t6) => {
    const e9 = (n26) => t6.value[n26], i61 = (n26) => e9(n26) || o8.getAttribute(`f-loading-${n26}`) || "";
    return {
      visible: !!t6.value,
      fullscreen: t6.modifiers.fullscreen,
      text: i61("text"),
      color: i61("color"),
      background: i61("background")
    };
  }, a56 = (o8, t6) => {
    o8.originalPosition !== "absolute" && o8.originalPosition !== "fixed" && (o8.style.position = "relative");
    const e9 = r32(o8, t6), i61 = createApp(w, e9), n26 = i61.mount(document.createElement("div"));
    o8.vm = n26, o8.loadingInstance = i61, o8.appendChild(n26.$el);
  }, s44 = (o8) => {
    !o8.loadingInstance || (o8.style.position = o8.originalPosition, o8.removeChild(o8.vm.$el), o8.loadingInstance.unmount(), o8.loadingInstance = null);
  };
  return {
    mounted: (o8, t6) => {
      const e9 = getComputedStyle(o8).position || "static";
      o8.originalPosition = e9, t6.value && a56(o8, t6);
    },
    updated: (o8, t6) => {
      t6.value !== t6.oldValue && (t6.value ? a56(o8, t6) : s44(o8));
    }
  };
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/loading/index.js
var m21 = n6({
  directive: s6(g4(), "loading")
});

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/_utils/compatible/index.js
var i60 = (e9) => {
  if (typeof e9 != "object" || e9 === null)
    return [];
  if (Object.entries && Object.entries !== void 0)
    return Object.entries(e9);
  const r32 = [];
  for (const t6 in e9)
    Object.prototype.hasOwnProperty.call(e9, t6) && r32.push([t6, e9[t6]]);
  return r32;
};

// ../../node_modules/.pnpm/fighting-design@0.25.1/node_modules/fighting-design/es/index2.js
var f9 = (o8) => (i60(index3_exports).forEach(([i61, r32]) => {
  o8.component(i61, r32);
}), o8.config.globalProperties.FMessage = a22, o8.config.globalProperties.FNotification = a24, o8.directive("loading", m21.directive), o8);
var b7 = {
  version: o7,
  install: f9
};
export {
  a6 as FAlert,
  s10 as FAside,
  i6 as FAvatar,
  i7 as FBackTop,
  i9 as FBadge,
  a54 as FBox,
  i10 as FBreadcrumb,
  i12 as FBreadcrumbItem,
  a10 as FButton,
  p7 as FButtonGroup,
  i14 as FCalendar,
  i16 as FCard,
  a13 as FCheckbox,
  p9 as FCheckboxGroup,
  s8 as FCloseBtn,
  r21 as FCollapseAnimation,
  a45 as FDatePicker,
  a14 as FDialog,
  a15 as FDivider,
  i19 as FDrawer,
  p23 as FDropdown,
  p26 as FDropdownItem,
  p10 as FEmpty,
  i21 as FExpandCard,
  a51 as FFightingGlobal,
  a16 as FFooter,
  a52 as FForm,
  a53 as FFormItem,
  i22 as FHeader,
  i20 as FImage,
  a19 as FImagePreview,
  n25 as FInfiniteScrolling,
  p19 as FInput,
  p28 as FInputNumber,
  i31 as FLayout,
  a20 as FLink,
  s22 as FList,
  s23 as FListItem,
  a21 as FMain,
  a47 as FMenu,
  a48 as FMenuItem,
  p32 as FMenuItemGroup,
  a22 as FMessage,
  a24 as FNotification,
  a55 as FNumberAnimate,
  p25 as FOption,
  e6 as FPageHeader,
  r26 as FPagination,
  i18 as FPopup,
  i36 as FProgress,
  a26 as FRadio,
  a27 as FRadioGroup,
  i37 as FRate,
  r19 as FRipple,
  a40 as FSelect,
  a29 as FSkeleton,
  a50 as FSlider,
  i38 as FSpace,
  a31 as FStickyCard,
  a49 as FSubmenu,
  a4 as FSvgIcon,
  i43 as FSwap,
  a32 as FSwitch,
  i51 as FTable,
  i55 as FTabs,
  i56 as FTabsPane,
  i39 as FTag,
  a28 as FText,
  i52 as FTextarea,
  a46 as FTimePicker,
  i24 as FToolbar,
  i25 as FToolbarItem,
  p17 as FTooltip,
  a34 as FTree,
  a39 as FTrigger,
  i47 as FUpLoad,
  i41 as FWatermark,
  b7 as default
};
//# sourceMappingURL=fighting-design.js.map
