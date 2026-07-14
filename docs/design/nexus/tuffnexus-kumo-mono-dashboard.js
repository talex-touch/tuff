/**
 * @schema 2.11
 */

const width = pencil.width || 1440;
const height = pencil.height || 900;

const c = {
  bg: "#030303",
  panel: "#0A0A0BE6",
  panelSoft: "#0E0E10D9",
  row: "#FFFFFF08",
  rowSoft: "#FFFFFF05",
  line: "#FFFFFF14",
  lineSoft: "#FFFFFF0A",
  text: "#F8FAFC",
  text2: "#A1A1AA",
  text3: "#63636B",
  cyan: "#22D3EE",
  cyanSoft: "#22D3EE24",
  green: "#34D399",
  greenSoft: "#34D39924",
  amber: "#FBBF24",
  amberSoft: "#FBBF2420",
  danger: "#EF4444",
  dangerSoft: "#EF444420",
  black: "#000000",
  white: "#FFFFFF"
};

function shadow(opacity, y, blur) {
  return {
    type: "shadow",
    shadowType: "outer",
    color: opacity,
    offset: { x: 0, y },
    blur
  };
}

function glass(name, x, y, w, h, children, options) {
  const o = options || {};
  return {
    type: "frame",
    name,
    x,
    y,
    width: w,
    height: h,
    fill: o.fill || c.panel,
    cornerRadius: o.radius || 18,
    stroke: o.stroke || c.line,
    strokeWidth: 1,
    effect: [
      { type: "background_blur", radius: o.blur || 28 },
      shadow(o.shadow || "#00000066", o.shadowY || 18, o.shadowBlur || 48)
    ],
    layout: "none",
    clip: true,
    children
  };
}

function rect(name, x, y, w, h, fill, options) {
  const o = options || {};
  const node = {
    type: "rectangle",
    name,
    x,
    y,
    width: w,
    height: h,
    fill,
    cornerRadius: o.radius || 0
  };
  if (o.stroke) {
    node.stroke = o.stroke;
    node.strokeWidth = o.strokeWidth || 1;
  }
  if (o.effect) node.effect = o.effect;
  if (o.rotation !== undefined) node.rotation = o.rotation;
  return node;
}

function ellipse(name, x, y, w, h, fill, options) {
  const o = options || {};
  const node = {
    type: "ellipse",
    name,
    x,
    y,
    width: w,
    height: h,
    fill
  };
  if (o.innerRadius !== undefined) node.innerRadius = o.innerRadius;
  if (o.startAngle !== undefined) node.startAngle = o.startAngle;
  if (o.sweepAngle !== undefined) node.sweepAngle = o.sweepAngle;
  if (o.stroke) {
    node.stroke = o.stroke;
    node.strokeWidth = o.strokeWidth || 1;
  }
  return node;
}

function text(name, x, y, content, size, fill, options) {
  const o = options || {};
  const node = {
    type: "text",
    name,
    x,
    y,
    content,
    fill,
    fontFamily: o.mono ? "JetBrains Mono" : "Inter",
    fontSize: size,
    fontWeight: o.weight || "500",
    lineHeight: o.lineHeight || 1.15
  };
  if (o.width) {
    node.width = o.width;
    node.textGrowth = "fixed-width";
  }
  if (o.height) {
    node.height = o.height;
    node.textGrowth = "fixed-width-height";
  }
  if (o.align) node.textAlign = o.align;
  if (o.vertical) node.textAlignVertical = o.vertical;
  return node;
}

function icon(name, x, y, size, glyph, fill) {
  return {
    type: "icon",
    name,
    x,
    y,
    width: size,
    height: size,
    library: "lucide",
    icon: glyph,
    fill
  };
}

function chip(name, x, y, label, fill, fg, w) {
  return {
    type: "frame",
    name,
    x,
    y,
    width: w || 88,
    height: 26,
    fill,
    cornerRadius: 999,
    stroke: c.lineSoft,
    strokeWidth: 1,
    layout: "none",
    children: [
      ellipse(name + " Dot", 10, 9, 8, 8, fg),
      text(name + " Label", 24, 6, label, 10, fg, { mono: true, weight: "700" })
    ]
  };
}

function navItem(name, y, glyph, label, active) {
  return {
    type: "frame",
    name,
    x: 14,
    y,
    width: 196,
    height: 42,
    fill: active ? "#FFFFFF12" : "#FFFFFF00",
    cornerRadius: 12,
    stroke: active ? "#FFFFFF20" : "#FFFFFF00",
    strokeWidth: 1,
    layout: "none",
    children: [
      active ? rect(name + " Accent", 0, 10, 2, 22, c.cyan, { radius: 2 }) : rect(name + " Accent Idle", 0, 10, 2, 22, "#FFFFFF00", { radius: 2 }),
      icon(name + " Icon", 16, 12, 18, glyph, active ? c.white : c.text3),
      text(name + " Label", 48, 13, label, 13, active ? c.text : c.text2, { weight: active ? "700" : "500" }),
      active ? text(name + " Hotkey", 154, 14, "01", 10, c.text3, { mono: true, weight: "700" }) : text(name + " Hotkey", 154, 14, "", 10, c.text3, { mono: true })
    ]
  };
}

function metricCard(name, x, title, value, delta, tone) {
  const color = tone === "green" ? c.green : tone === "cyan" ? c.cyan : tone === "amber" ? c.amber : c.text;
  const soft = tone === "green" ? c.greenSoft : tone === "cyan" ? c.cyanSoft : tone === "amber" ? c.amberSoft : c.row;
  return glass(name, x, 140, 190, 124, [
    text(name + " Label", 18, 18, title, 11, c.text3, { mono: true, weight: "700" }),
    text(name + " Value", 18, 42, value, 31, c.text, { mono: true, weight: "700" }),
    rect(name + " Trend Track", 18, 88, 120, 6, "#FFFFFF0D", { radius: 999 }),
    rect(name + " Trend Value", 18, 88, tone === "amber" ? 68 : 94, 6, color, { radius: 999 }),
    {
      type: "frame",
      name: name + " Delta",
      x: 142,
      y: 80,
      width: 34,
      height: 24,
      fill: soft,
      cornerRadius: 999,
      stroke: c.lineSoft,
      strokeWidth: 1,
      layout: "none",
      children: [
        text(name + " Delta Text", 7, 7, delta, 9, color, { mono: true, weight: "700" })
      ]
    }
  ], { radius: 16, fill: "#0A0A0CEB", blur: 24, shadow: "#00000052" });
}

function serviceNode(name, x, y, w, title, meta, state, tone, glyph) {
  const color = tone === "green" ? c.green : tone === "cyan" ? c.cyan : tone === "amber" ? c.amber : c.text3;
  const soft = tone === "green" ? c.greenSoft : tone === "cyan" ? c.cyanSoft : tone === "amber" ? c.amberSoft : c.row;
  return {
    type: "frame",
    name,
    x,
    y,
    width: w,
    height: 76,
    fill: "#09090AEF",
    cornerRadius: 16,
    stroke: color + "40",
    strokeWidth: 1,
    effect: [
      { type: "background_blur", radius: 20 },
      shadow("#0000004D", 10, 30)
    ],
    layout: "none",
    children: [
      {
        type: "frame",
        name: name + " Icon Well",
        x: 14,
        y: 14,
        width: 32,
        height: 32,
        fill: soft,
        cornerRadius: 10,
        stroke: color + "33",
        strokeWidth: 1,
        layout: "none",
        children: [
          icon(name + " Icon", 8, 8, 16, glyph, color)
        ]
      },
      text(name + " Title", 58, 14, title, 13, c.text, { weight: "700", width: w - 112 }),
      text(name + " Meta", 58, 38, meta, 10, c.text3, { mono: true, weight: "600", width: w - 112 }),
      text(name + " State", w - 48, 18, state, 9, color, { mono: true, weight: "700", width: 34, align: "right" })
    ]
  };
}

function eventRow(name, y, time, label, value, tone) {
  const color = tone === "green" ? c.green : tone === "cyan" ? c.cyan : tone === "amber" ? c.amber : c.text3;
  return {
    type: "frame",
    name,
    x: 22,
    y,
    width: 772,
    height: 36,
    fill: y === 488 ? "#FFFFFF08" : "#FFFFFF00",
    cornerRadius: 10,
    layout: "none",
    children: [
      text(name + " Time", 0, 10, time, 10, c.text3, { mono: true, weight: "700", width: 58 }),
      ellipse(name + " Dot", 74, 14, 8, 8, color),
      text(name + " Label", 96, 9, label, 12, c.text2, { weight: "600", width: 500 }),
      text(name + " Value", 628, 9, value, 11, color, { mono: true, weight: "700", width: 132, align: "right" })
    ]
  };
}

function controlRow(name, y, label, value, tone, on) {
  const color = tone === "green" ? c.green : tone === "cyan" ? c.cyan : tone === "amber" ? c.amber : c.danger;
  return {
    type: "frame",
    name,
    x: 18,
    y,
    width: 260,
    height: 48,
    fill: c.rowSoft,
    cornerRadius: 14,
    stroke: c.lineSoft,
    strokeWidth: 1,
    layout: "none",
    children: [
      text(name + " Label", 14, 10, label, 12, c.text, { weight: "700", width: 150 }),
      text(name + " Value", 14, 28, value, 9, c.text3, { mono: true, weight: "700", width: 150 }),
      rect(name + " Switch Track", 206, 14, 38, 20, on ? color + "33" : "#FFFFFF10", { radius: 999, stroke: on ? color + "66" : c.lineSoft }),
      ellipse(name + " Switch Thumb", on ? 224 : 210, 17, 14, 14, on ? color : c.text3)
    ]
  };
}

const nodes = [
  rect("Mono Background", 0, 0, width, height, c.bg),
  rect("Top Glass Wash", 0, 0, width, 260, {
    type: "gradient",
    gradientType: "linear",
    rotation: 180,
    colors: [
      { color: "#FFFFFF0E", position: 0 },
      { color: "#FFFFFF00", position: 1 }
    ]
  }, { effect: { type: "blur", radius: 28 } }),
  rect("Cyan Status Wash", 0, 610, width, 290, {
    type: "gradient",
    gradientType: "linear",
    rotation: 0,
    colors: [
      { color: "#22D3EE12", position: 0 },
      { color: "#03030300", position: 1 }
    ]
  }, { effect: { type: "blur", radius: 34 } }),
  rect("Hairline North", 272, 119, 1140, 1, "#FFFFFF12"),
  rect("Hairline West", 252, 28, 1, 844, "#FFFFFF0A"),
  glass("Nexus Navigation", 28, 28, 224, 844, [
    {
      type: "frame",
      name: "Nexus Brand Mark",
      x: 18,
      y: 18,
      width: 46,
      height: 46,
      fill: "#FFFFFF10",
      cornerRadius: 14,
      stroke: "#FFFFFF1F",
      strokeWidth: 1,
      layout: "none",
      children: [
        text("Nexus Brand Initial", 15, 10, "N", 20, c.white, { mono: true, weight: "700" })
      ]
    },
    text("Nexus Brand Name", 76, 23, "TuffNexus", 15, c.text, { weight: "700" }),
    text("Nexus Brand Env", 76, 46, "prod-usw2 / edge", 10, c.text3, { mono: true, weight: "700" }),
    rect("Navigation Divider Top", 18, 86, 188, 1, c.lineSoft),
    navItem("Nav Overview", 112, "layout-dashboard", "Overview", true),
    navItem("Nav Services", 162, "network", "Services", false),
    navItem("Nav Incidents", 212, "activity", "Incidents", false),
    navItem("Nav Deploys", 262, "git-branch", "Deploys", false),
    navItem("Nav Storage", 312, "database", "Storage", false),
    navItem("Nav Access", 362, "shield-check", "Access", false),
    rect("Navigation Divider Bottom", 18, 428, 188, 1, c.lineSoft),
    text("Nav Section Label", 18, 456, "LIVE REGIONS", 10, c.text3, { mono: true, weight: "700" }),
    chip("Region SFO", 18, 484, "SFO", c.greenSoft, c.green, 72),
    chip("Region LHR", 98, 484, "LHR", c.cyanSoft, c.cyan, 72),
    chip("Region NRT", 18, 522, "NRT", "#FFFFFF0A", c.text3, 72),
    chip("Region IAD", 98, 522, "IAD", "#FFFFFF0A", c.text3, 72),
    glass("Nav Session", 18, 708, 188, 110, [
      text("Session Label", 14, 14, "OPERATOR", 10, c.text3, { mono: true, weight: "700" }),
      text("Session Name", 14, 36, "Mira Chen", 14, c.text, { weight: "700" }),
      text("Session Role", 14, 59, "SRE Commander", 11, c.text2, { weight: "600" }),
      rect("Session Token Track", 14, 84, 160, 4, "#FFFFFF10", { radius: 999 }),
      rect("Session Token Fill", 14, 84, 112, 4, c.green, { radius: 999 })
    ], { fill: "#050505CC", radius: 16, blur: 16, shadow: "#00000033", shadowY: 8, shadowBlur: 20 })
  ], { radius: 22, fill: "#080809D9" }),
  glass("Command Header", 272, 28, 1140, 92, [
    text("Header Eyebrow", 24, 18, "BACKEND COMMAND CENTER", 10, c.cyan, { mono: true, weight: "700" }),
    text("Header Title", 24, 40, "Service fabric overview", 24, c.text, { weight: "700" }),
    {
      type: "frame",
      name: "Command Search",
      x: 382,
      y: 22,
      width: 410,
      height: 48,
      fill: "#FFFFFF08",
      cornerRadius: 14,
      stroke: "#FFFFFF18",
      strokeWidth: 1,
      layout: "none",
      children: [
        icon("Command Search Icon", 17, 15, 18, "search", c.text3),
        text("Command Search Prompt", 48, 15, "Command, service, trace, incident...", 13, c.text2, { width: 250 }),
        text("Command Search Shortcut", 342, 15, "CMD K", 10, c.text3, { mono: true, weight: "700" })
      ]
    },
    chip("Header Health Chip", 822, 32, "HEALTHY", c.greenSoft, c.green, 104),
    {
      type: "frame",
      name: "Header Time Window",
      x: 944,
      y: 26,
      width: 86,
      height: 38,
      fill: "#FFFFFF08",
      cornerRadius: 12,
      stroke: "#FFFFFF14",
      strokeWidth: 1,
      layout: "none",
      children: [
        text("Time Window Label", 17, 12, "15 MIN", 11, c.text2, { mono: true, weight: "700" })
      ]
    },
    {
      type: "frame",
      name: "Header Deploy Button",
      x: 1044,
      y: 26,
      width: 72,
      height: 38,
      fill: "#FFFFFF",
      cornerRadius: 12,
      layout: "none",
      children: [
        text("Header Deploy Label", 14, 12, "Deploy", 12, c.black, { weight: "800" })
      ]
    }
  ], { radius: 22, fill: "#09090BE6" }),
  metricCard("Metric Latency", 272, "P95 LATENCY", "38ms", "-12", "green"),
  metricCard("Metric Throughput", 482, "REQ / SEC", "19.8k", "+04", "cyan"),
  metricCard("Metric Errors", 692, "ERROR BUDGET", "99.2", "+02", "green"),
  metricCard("Metric Queue", 902, "QUEUE DEPTH", "1.7k", "+18", "amber"),
  glass("Service Map Panel", 272, 288, 820, 584, [
    text("Service Map Eyebrow", 22, 20, "SERVICE MAP", 10, c.text3, { mono: true, weight: "700" }),
    text("Service Map Title", 22, 42, "Runtime dependencies", 21, c.text, { weight: "700" }),
    text("Service Map Subtitle", 22, 72, "Live topology for API, auth, jobs, storage, and observability layers.", 12, c.text2, { width: 410 }),
    {
      type: "frame",
      name: "Service Map Tabs",
      x: 590,
      y: 22,
      width: 204,
      height: 38,
      fill: "#FFFFFF08",
      cornerRadius: 12,
      stroke: c.lineSoft,
      strokeWidth: 1,
      layout: "none",
      children: [
        rect("Map Tab Active", 4, 4, 64, 30, "#FFFFFF14", { radius: 10 }),
        text("Map Tab Live", 23, 13, "Live", 10, c.text, { mono: true, weight: "700" }),
        text("Map Tab Trace", 82, 13, "Trace", 10, c.text3, { mono: true, weight: "700" }),
        text("Map Tab Risk", 146, 13, "Risk", 10, c.text3, { mono: true, weight: "700" })
      ]
    },
    rect("Map Surface", 22, 112, 772, 348, "#050506A6", { radius: 18, stroke: "#FFFFFF12" }),
    rect("Map Horizontal Link A", 192, 250, 146, 2, "#22D3EE55", { radius: 2 }),
    rect("Map Horizontal Link B", 482, 250, 138, 2, "#34D39955", { radius: 2 }),
    rect("Map Vertical Link A", 410, 188, 2, 66, "#FFFFFF26", { radius: 2 }),
    rect("Map Vertical Link B", 410, 252, 2, 84, "#FFFFFF26", { radius: 2 }),
    rect("Map Diagonal Link A", 277, 187, 124, 2, "#FFFFFF20", { radius: 2, rotation: 18 }),
    rect("Map Diagonal Link B", 525, 199, 120, 2, "#FFFFFF20", { radius: 2, rotation: -20 }),
    {
      type: "frame",
      name: "Service Core Node",
      x: 336,
      y: 204,
      width: 148,
      height: 96,
      fill: "#FFFFFF12",
      cornerRadius: 22,
      stroke: "#FFFFFF28",
      strokeWidth: 1,
      effect: [
        { type: "background_blur", radius: 26 },
        shadow("#22D3EE24", 0, 48)
      ],
      layout: "none",
      children: [
        ellipse("Core Node Ring", 18, 18, 28, 28, "#FFFFFF00", { stroke: c.cyan, strokeWidth: 3, innerRadius: 0.74, startAngle: 0, sweepAngle: 302 }),
        text("Core Node Title", 58, 18, "core-api", 14, c.text, { mono: true, weight: "700" }),
        text("Core Node Meta", 58, 42, "41 pods / 3 zones", 10, c.text3, { mono: true, weight: "700" }),
        text("Core Node State", 18, 68, "SYNCHRONIZED", 10, c.cyan, { mono: true, weight: "700" })
      ]
    },
    serviceNode("Node Gateway", 54, 174, 168, "Gateway", "3.2ms edge", "OK", "green", "router"),
    serviceNode("Node Auth", 84, 310, 168, "Auth", "token p95 9ms", "OK", "green", "lock"),
    serviceNode("Node Queue", 324, 342, 172, "Queue", "1.7k pending", "HOT", "amber", "list-tree"),
    serviceNode("Node Worker", 564, 310, 168, "Workers", "68 active jobs", "OK", "cyan", "cpu"),
    serviceNode("Node Storage", 596, 174, 168, "Postgres", "replica lag 0.4s", "OK", "database"),
    serviceNode("Node Cache", 324, 126, 172, "Cache", "hit 94.7%", "OK", "cyan", "hard-drive"),
    eventRow("Event Row One", 488, "12:04", "Gateway shifted 18% traffic to usw2-b", "AUTO", "cyan"),
    eventRow("Event Row Two", 526, "12:02", "Queue scaler opened two worker lanes", "+2", "green")
  ], { radius: 20, fill: "#08080AE8" }),
  glass("Right Status Control", 1112, 140, 300, 732, [
    text("Right Eyebrow", 18, 18, "STATUS / CONTROL", 10, c.text3, { mono: true, weight: "700" }),
    text("Right Title", 18, 40, "Production state", 20, c.text, { weight: "700" }),
    ellipse("Status Ring Back", 86, 86, 128, 128, "#FFFFFF00", { stroke: "#FFFFFF12", strokeWidth: 10, innerRadius: 0.82 }),
    ellipse("Status Ring Active", 86, 86, 128, 128, "#FFFFFF00", { stroke: c.green, strokeWidth: 10, innerRadius: 0.82, startAngle: -90, sweepAngle: 318 }),
    text("Status Score", 118, 120, "98", 36, c.text, { mono: true, weight: "700" }),
    text("Status Score Unit", 171, 137, "%", 14, c.green, { mono: true, weight: "700" }),
    text("Status Caption", 94, 222, "all gates nominal", 11, c.text3, { mono: true, weight: "700", width: 112, align: "center" }),
    rect("Right Divider One", 18, 256, 260, 1, c.lineSoft),
    controlRow("Control Deploy Guard", 274, "Deploy guard", "freeze disabled", "green", true),
    controlRow("Control Rate Limit", 334, "Rate limiter", "adaptive 87%", "cyan", true),
    controlRow("Control Kill Switch", 394, "Kill switch", "manual only", "danger", false),
    rect("Right Divider Two", 18, 464, 260, 1, c.lineSoft),
    text("Gate Label", 18, 488, "RELEASE GATE", 10, c.text3, { mono: true, weight: "700" }),
    chip("Gate Migrations", 18, 516, "MIG OK", c.greenSoft, c.green, 98),
    chip("Gate Secrets", 126, 516, "KEYS OK", c.cyanSoft, c.cyan, 98),
    chip("Gate Owner", 18, 552, "OWNER", c.amberSoft, c.amber, 98),
    {
      type: "frame",
      name: "Control Command Button",
      x: 18,
      y: 610,
      width: 260,
      height: 48,
      fill: "#FFFFFF",
      cornerRadius: 14,
      layout: "none",
      children: [
        icon("Control Command Icon", 22, 16, 16, "terminal", c.black),
        text("Control Command Label", 52, 16, "Open command layer", 12, c.black, { weight: "800" })
      ]
    },
    {
      type: "frame",
      name: "Control Secondary Button",
      x: 18,
      y: 670,
      width: 260,
      height: 38,
      fill: "#FFFFFF08",
      cornerRadius: 12,
      stroke: c.line,
      strokeWidth: 1,
      layout: "none",
      children: [
        text("Control Secondary Label", 78, 12, "View runbook", 11, c.text2, { mono: true, weight: "700" })
      ]
    }
  ], { radius: 20, fill: "#08080AE8" })
];

return nodes;
