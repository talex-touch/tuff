const { plugin, clipboard, logger, TuffItemBuilder, permission, openUrl } =
  globalThis;
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const process = require("node:process");

let DatabaseSync;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch {
  DatabaseSync = undefined;
}

const PLUGIN_NAME = "touch-browser-data";
const SOURCE_ID = "plugin-features";
const ICON = { type: "emoji", value: "🌐" };
const ACTION_ID = "browser-data";
const NETWORK_PERMISSION_ID = "network.internet";
const INDEX_PERMISSION_ID = "fs.index";
const BOOKMARK_PROVIDER_ID = "touch-browser-data.browser-bookmarks";
const HISTORY_PROVIDER_ID = "touch-browser-data.browser-history";
const BOOKMARK_SOURCE_ID = "browser-bookmarks";
const HISTORY_SOURCE_ID = "browser-history";
const BROWSER_DATA_SOURCES = [
  {
    id: BOOKMARK_SOURCE_ID,
    providerId: BOOKMARK_PROVIDER_ID,
    sourceType: "browser-bookmark",
    label: "浏览器书签",
    diagnosticLabel: "书签",
  },
  {
    id: HISTORY_SOURCE_ID,
    providerId: HISTORY_PROVIDER_ID,
    sourceType: "browser-history",
    label: "浏览器历史",
    diagnosticLabel: "历史",
  },
];
const MAX_RESULTS = 30;
const MAX_HISTORY_RESULTS = 20;
const MAX_HISTORY_ROWS_PER_PROFILE = 50;
const MAX_PROFILES_PER_BROWSER = 8;
const HISTORY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CHROMIUM_EPOCH_MICROS = 11644473600000000n;
const SUPPORTED_BROWSERS = ["chrome", "edge", "brave", "arc"];
const PREFIXES = [
  "browser-data",
  "browser",
  "bookmarks",
  "history",
  "chrome",
  "edge",
  "brave",
  "arc",
  "浏览器",
  "书签",
  "历史",
];
const BROWSER_LABELS = {
  chrome: "Chrome",
  edge: "Edge",
  brave: "Brave",
  arc: "Arc",
};

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeSourceIds(sourceIds) {
  const requested = Array.isArray(sourceIds)
    ? new Set(
        sourceIds.map((sourceId) => normalizeText(sourceId)).filter(Boolean),
      )
    : null;
  return BROWSER_DATA_SOURCES.filter(
    (source) => !requested || requested.has(source.id),
  ).map((source) => source.id);
}

function resolveEnabledSourceIds() {
  const isProviderEnabled = plugin?.feature?.isSearchProviderEnabled;
  if (typeof isProviderEnabled !== "function") return [];

  return BROWSER_DATA_SOURCES.filter((source) => {
    try {
      return isProviderEnabled(source.providerId) === true;
    } catch {
      return false;
    }
  }).map((source) => source.id);
}

function buildSourceMeta(sourceIds) {
  const normalizedSourceIds = normalizeSourceIds(sourceIds);
  if (normalizedSourceIds.length !== 1) return {};

  const source = BROWSER_DATA_SOURCES.find(
    (item) => item.id === normalizedSourceIds[0],
  );
  return source
    ? {
        searchProviderId: source.providerId,
        indexedSourceId: source.id,
        sourceType: source.sourceType,
      }
    : {};
}

function truncateText(value, max = 96) {
  const text = normalizeText(value);
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function getQueryText(query) {
  if (typeof query === "string") return query;
  return query?.text ?? "";
}

function normalizeUrl(value) {
  const text = normalizeText(value);
  if (!text) return "";
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function parseQuery(rawQuery) {
  const raw = normalizeText(getQueryText(rawQuery)).replace(/\s+/g, " ");
  if (!raw) return { browser: "", keyword: "" };

  const lower = raw.toLowerCase();
  for (const prefix of PREFIXES) {
    const prefixLower = prefix.toLowerCase();
    if (lower === prefixLower)
      return {
        browser: SUPPORTED_BROWSERS.includes(prefixLower) ? prefixLower : "",
        keyword: "",
      };
    if (lower.startsWith(`${prefixLower} `)) {
      return {
        browser: SUPPORTED_BROWSERS.includes(prefixLower) ? prefixLower : "",
        keyword: raw.slice(prefix.length).trim(),
      };
    }
    if (lower.startsWith(`${prefixLower}:`)) {
      return {
        browser: SUPPORTED_BROWSERS.includes(prefixLower) ? prefixLower : "",
        keyword: raw.slice(prefix.length + 1).trim(),
      };
    }
  }

  return { browser: "", keyword: raw };
}

function browserDefinitions(
  platform = process.platform,
  homeDir = os.homedir(),
  env = process.env,
) {
  if (platform === "darwin") {
    const appSupport = path.join(homeDir, "Library", "Application Support");
    return [
      {
        id: "chrome",
        name: "Chrome",
        root: path.join(appSupport, "Google", "Chrome"),
      },
      {
        id: "edge",
        name: "Edge",
        root: path.join(appSupport, "Microsoft Edge"),
      },
      {
        id: "brave",
        name: "Brave",
        root: path.join(appSupport, "BraveSoftware", "Brave-Browser"),
      },
      {
        id: "arc",
        name: "Arc",
        root: path.join(appSupport, "Arc", "User Data"),
      },
    ];
  }

  if (platform === "win32") {
    const localAppData =
      env.LOCALAPPDATA || path.join(homeDir, "AppData", "Local");
    return [
      {
        id: "chrome",
        name: "Chrome",
        root: path.join(localAppData, "Google", "Chrome", "User Data"),
      },
      {
        id: "edge",
        name: "Edge",
        root: path.join(localAppData, "Microsoft", "Edge", "User Data"),
      },
      {
        id: "brave",
        name: "Brave",
        root: path.join(
          localAppData,
          "BraveSoftware",
          "Brave-Browser",
          "User Data",
        ),
      },
      {
        id: "arc",
        name: "Arc",
        root: path.join(
          localAppData,
          "Packages",
          "TheBrowserCompany.Arc_ttt1ap7aakyb4",
          "LocalCache",
          "Local",
          "Arc",
          "User Data",
        ),
      },
    ];
  }

  if (platform === "linux") {
    const configHome = env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
    return [
      {
        id: "chrome",
        name: "Chrome",
        root: path.join(configHome, "google-chrome"),
      },
      {
        id: "edge",
        name: "Edge",
        root: path.join(configHome, "microsoft-edge"),
      },
      {
        id: "brave",
        name: "Brave",
        root: path.join(configHome, "BraveSoftware", "Brave-Browser"),
      },
    ];
  }

  return [];
}

function buildBrowserSourceDiagnostics(
  platform,
  definitions,
  browserFilter = "",
) {
  const byId = new Map(
    (Array.isArray(definitions) ? definitions : []).map((definition) => [
      definition.id,
      definition,
    ]),
  );
  const ids = browserFilter ? [browserFilter] : SUPPORTED_BROWSERS;
  return ids.map((id) => {
    const definition = byId.get(id);
    if (definition) {
      return {
        browserId: definition.id,
        browserName: definition.name,
        status: "supported",
        profileCount: 0,
        reason: "",
        lastError: "",
      };
    }

    return {
      browserId: id,
      browserName: BROWSER_LABELS[id] || id,
      status: "unsupported",
      profileCount: 0,
      reason: `${BROWSER_LABELS[id] || id} bookmarks are unsupported on ${platform}`,
      lastError: "",
    };
  });
}

function getAvailableBrowserNames(platform = process.platform) {
  return browserDefinitions(platform).map((definition) => definition.name);
}

function isProfileDirectoryName(name) {
  return (
    name === "Default" ||
    name === "Guest Profile" ||
    /^Profile \d+$/i.test(name)
  );
}

function discoverChromiumProfileFiles(definition, fileName, fsImpl = fs) {
  if (!definition?.root || !fileName) return [];
  if (!fsImpl.existsSync(definition.root)) return [];

  const candidates = [];
  const directPath = path.join(definition.root, fileName);
  if (fsImpl.existsSync(directPath)) {
    candidates.push({
      browserId: definition.id,
      browserName: definition.name,
      profile: "Default",
      path: directPath,
    });
  }

  let entries = [];
  try {
    entries = fsImpl.readdirSync(definition.root, { withFileTypes: true });
  } catch {
    return candidates;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !isProfileDirectoryName(entry.name)) continue;
    const filePath = path.join(definition.root, entry.name, fileName);
    if (!fsImpl.existsSync(filePath)) continue;
    candidates.push({
      browserId: definition.id,
      browserName: definition.name,
      profile: entry.name,
      path: filePath,
    });
    if (candidates.length >= MAX_PROFILES_PER_BROWSER) break;
  }

  const seen = new Set();
  return candidates.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });
}

function discoverBookmarkFiles(definition, fsImpl = fs) {
  return discoverChromiumProfileFiles(definition, "Bookmarks", fsImpl);
}

function discoverHistoryFiles(definition, fsImpl = fs) {
  return discoverChromiumProfileFiles(definition, "History", fsImpl);
}

function readJsonFile(filePath, fsImpl = fs) {
  const raw = fsImpl.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function collectBookmarkNodes(node, context, result = []) {
  if (!node || typeof node !== "object") return result;

  if (node.type === "url") {
    const url = normalizeUrl(node.url);
    if (url) {
      const title = normalizeText(node.name) || url;
      result.push({
        id: `${context.browserId}:${context.profile}:${url}`,
        browserId: context.browserId,
        browserName: context.browserName,
        profile: context.profile,
        title,
        url,
        folder: context.folder.join(" / "),
        dateAdded: normalizeText(node.date_added),
      });
    }
    return result;
  }

  const nextFolder = node.name
    ? [...context.folder, normalizeText(node.name)]
    : context.folder;
  const children = Array.isArray(node.children) ? node.children : [];
  children.forEach((child) =>
    collectBookmarkNodes(child, { ...context, folder: nextFolder }, result),
  );
  return result;
}

function parseChromiumBookmarks(payload, source) {
  const roots =
    payload?.roots && typeof payload.roots === "object" ? payload.roots : {};
  const result = [];
  Object.values(roots).forEach((root) => {
    collectBookmarkNodes(
      root,
      {
        browserId: source.browserId,
        browserName: source.browserName,
        profile: source.profile,
        folder: [],
      },
      result,
    );
  });
  return result;
}

function scanBrowserBookmarks(options = {}) {
  const platform = options.platform || process.platform;
  const homeDir = options.homeDir || os.homedir();
  const env = options.env || process.env;
  const fsImpl = options.fs || fs;
  const browserFilter = normalizeText(options.browserFilter).toLowerCase();
  const definitions = (
    options.definitions || browserDefinitions(platform, homeDir, env)
  ).filter((definition) => !browserFilter || definition.id === browserFilter);
  const items = [];
  const diagnostics = buildBrowserSourceDiagnostics(
    platform,
    definitions,
    browserFilter,
  );
  const diagnosticsById = new Map(
    diagnostics.map((item) => [item.browserId, item]),
  );

  for (const definition of definitions) {
    const files = discoverBookmarkFiles(definition, fsImpl);
    const diagnostic = diagnosticsById.get(definition.id);
    let readableProfileCount = 0;
    let failedProfileCount = 0;
    if (diagnostic) {
      diagnostic.status = files.length ? "available" : "not-found";
      diagnostic.profileCount = files.length;
      diagnostic.reason = files.length ? "" : "Bookmarks file not found";
      diagnostic.lastError = "";
    }

    for (const file of files) {
      try {
        const payload = readJsonFile(file.path, fsImpl);
        items.push(...parseChromiumBookmarks(payload, file));
        readableProfileCount += 1;
      } catch {
        failedProfileCount += 1;
      }
    }

    if (diagnostic && files.length) {
      diagnostic.readableProfileCount = readableProfileCount;
      diagnostic.failedProfileCount = failedProfileCount;
      if (failedProfileCount) {
        diagnostic.status = readableProfileCount ? "partial" : "read-failed";
        diagnostic.reason = readableProfileCount
          ? "Some Bookmarks files could not be read"
          : "Bookmarks file could not be read";
        diagnostic.lastError = "bookmarks-read-failed";
      }
    }
  }

  return { items: dedupeBookmarks(items), diagnostics };
}

function buildHistorySourceDiagnostics(
  platform,
  definitions,
  browserFilter = "",
) {
  return buildBrowserSourceDiagnostics(
    platform,
    definitions,
    browserFilter,
  ).map((diagnostic) => ({
    ...diagnostic,
    sourceType: "browser-history",
    reason: diagnostic.reason.replace("bookmarks", "history"),
  }));
}

function toChromiumTimestamp(unixMs) {
  const normalized = Math.max(0, Math.trunc(Number(unixMs) || 0));
  return BigInt(normalized) * 1000n + CHROMIUM_EPOCH_MICROS;
}

function fromChromiumTimestamp(value) {
  try {
    const timestamp = typeof value === "bigint" ? value : BigInt(value);
    if (timestamp <= CHROMIUM_EPOCH_MICROS) return 0;
    return Number((timestamp - CHROMIUM_EPOCH_MICROS) / 1000n);
  } catch {
    return 0;
  }
}

function describeHistoryError(error) {
  const code = normalizeText(error?.code).toUpperCase();
  const message = normalizeText(error?.message).toLowerCase();
  if (code === "TEMP_CLEANUP_FAILED")
    return "History temporary copy could not be removed";
  if (code === "ENOENT" || message.includes("no such file"))
    return "History database was not found";
  if (
    code === "EACCES" ||
    code === "EPERM" ||
    message.includes("permission denied")
  )
    return "History database permission was denied";
  if (
    code === "SQLITE_BUSY" ||
    code === "SQLITE_LOCKED" ||
    message.includes("database is locked")
  )
    return "History database is locked";
  if (
    message.includes("malformed") ||
    message.includes("not a database") ||
    message.includes("corrupt")
  )
    return "History database is corrupt or unsupported";
  if (message.includes("node:sqlite") || message.includes("databasesync"))
    return "History database support is unavailable in this runtime";
  return "History database could not be read";
}

function cleanupHistoryTemporaryCopy(tempCopy, fsImpl = fs) {
  if (!tempCopy?.directory) return;
  try {
    fsImpl.rmSync(tempCopy.directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 50,
    });
  } catch {
    const error = new Error("History temporary copy could not be removed");
    error.code = "TEMP_CLEANUP_FAILED";
    throw error;
  }
}

function createHistoryTemporaryCopy(
  sourcePath,
  fsImpl = fs,
  tempRoot = os.tmpdir(),
) {
  let directory = "";
  try {
    directory = fsImpl.mkdtempSync(
      path.join(tempRoot, "tuff-browser-history-"),
    );
    const databasePath = path.join(directory, "History");
    fsImpl.copyFileSync(sourcePath, databasePath);

    for (const suffix of ["-wal", "-shm"]) {
      const sidecar = `${sourcePath}${suffix}`;
      if (fsImpl.existsSync(sidecar))
        fsImpl.copyFileSync(sidecar, `${databasePath}${suffix}`);
    }

    return { directory, databasePath };
  } catch (error) {
    cleanupHistoryTemporaryCopy({ directory }, fsImpl);
    throw error;
  }
}

function normalizeHistoryRow(row, source) {
  const url = normalizeUrl(row?.url);
  if (!url) return null;
  const lastVisitedAt = fromChromiumTimestamp(row?.lastVisitTime);
  return {
    id: `${source.browserId}:${source.profile}:history:${url}`,
    browserId: source.browserId,
    browserName: source.browserName,
    profile: source.profile,
    title: normalizeText(row?.title) || url,
    url,
    visitCount: Math.max(0, Math.trunc(Number(row?.visitCount) || 0)),
    lastVisitedAt,
  };
}

function readChromiumHistory(file, options = {}) {
  const fsImpl = options.fs || fs;
  const DatabaseSyncImpl = options.DatabaseSync || DatabaseSync;
  if (typeof DatabaseSyncImpl !== "function") {
    return {
      items: [],
      reason: "History database support is unavailable in this runtime",
    };
  }

  let tempCopy;
  let database;
  let result;
  try {
    tempCopy = createHistoryTemporaryCopy(
      file.path,
      fsImpl,
      options.tempRoot || os.tmpdir(),
    );
    database = new DatabaseSyncImpl(tempCopy.databasePath, { readOnly: true });
    const statement = database.prepare(`
      SELECT url, title, last_visit_time AS lastVisitTime, visit_count AS visitCount
      FROM urls
      WHERE last_visit_time >= ? AND last_visit_time <= ?
      ORDER BY last_visit_time DESC
      LIMIT ?
    `);
    statement.setReadBigInts?.(true);
    const now = options.now ?? Date.now();
    const rows = statement.all(
      toChromiumTimestamp(now - HISTORY_WINDOW_MS),
      toChromiumTimestamp(now),
      MAX_HISTORY_ROWS_PER_PROFILE,
    );
    result = {
      items: rows.map((row) => normalizeHistoryRow(row, file)).filter(Boolean),
      reason: "",
    };
  } catch (error) {
    result = {
      items: [],
      reason: describeHistoryError(error),
    };
  } finally {
    try {
      database?.close?.();
    } catch {
      // Cleanup below remains authoritative and never exposes the source path.
    }

    try {
      cleanupHistoryTemporaryCopy(tempCopy, fsImpl);
    } catch (error) {
      result = {
        items: [],
        reason: describeHistoryError(error),
      };
    }
  }

  return result;
}

function dedupeHistory(history) {
  const byKey = new Map();
  for (const item of Array.isArray(history) ? history : []) {
    const key = `${item.browserId}:${item.profile}:${item.url}`;
    const existing = byKey.get(key);
    if (!existing || item.lastVisitedAt > existing.lastVisitedAt)
      byKey.set(key, item);
  }
  return Array.from(byKey.values());
}

function scanBrowserHistory(options = {}) {
  const platform = options.platform || process.platform;
  const homeDir = options.homeDir || os.homedir();
  const env = options.env || process.env;
  const fsImpl = options.fs || fs;
  const browserFilter = normalizeText(options.browserFilter).toLowerCase();
  const definitions = (
    options.definitions || browserDefinitions(platform, homeDir, env)
  ).filter((definition) => !browserFilter || definition.id === browserFilter);
  const items = [];
  const diagnostics = buildHistorySourceDiagnostics(
    platform,
    definitions,
    browserFilter,
  );
  const diagnosticsById = new Map(
    diagnostics.map((item) => [item.browserId, item]),
  );

  for (const definition of definitions) {
    const files = discoverHistoryFiles(definition, fsImpl);
    const diagnostic = diagnosticsById.get(definition.id);
    let readableProfileCount = 0;
    let failedProfileCount = 0;
    if (diagnostic) {
      diagnostic.status = files.length ? "available" : "not-found";
      diagnostic.profileCount = files.length;
      diagnostic.reason = files.length ? "" : "History database not found";
      diagnostic.lastError = "";
    }

    for (const file of files) {
      const result = readChromiumHistory(file, { ...options, fs: fsImpl });
      items.push(...result.items);
      if (result.reason) {
        failedProfileCount += 1;
        if (diagnostic) diagnostic.lastError = result.reason;
      } else {
        readableProfileCount += 1;
      }
    }

    if (diagnostic && files.length) {
      diagnostic.readableProfileCount = readableProfileCount;
      diagnostic.failedProfileCount = failedProfileCount;
      if (failedProfileCount) {
        diagnostic.status = readableProfileCount ? "partial" : "read-failed";
        diagnostic.reason = readableProfileCount
          ? "Some History databases could not be read"
          : diagnostic.lastError;
      }
    }
  }

  return { items: dedupeHistory(items), diagnostics };
}

function dedupeBookmarks(bookmarks) {
  const byUrl = new Map();
  for (const bookmark of Array.isArray(bookmarks) ? bookmarks : []) {
    const existing = byUrl.get(bookmark.url);
    if (!existing) {
      byUrl.set(bookmark.url, bookmark);
      continue;
    }
    byUrl.set(bookmark.url, {
      ...existing,
      title: existing.title || bookmark.title,
      folder: existing.folder || bookmark.folder,
      browserName: existing.browserName || bookmark.browserName,
      profile: existing.profile || bookmark.profile,
    });
  }
  return Array.from(byUrl.values());
}

function scoreBookmark(bookmark, keyword) {
  const lower = keyword.toLowerCase();
  if (!lower) return 10;
  const title = normalizeText(bookmark.title).toLowerCase();
  const url = normalizeText(bookmark.url).toLowerCase();
  const folder = normalizeText(bookmark.folder).toLowerCase();
  const browser = normalizeText(bookmark.browserName).toLowerCase();
  if (title === lower) return 100;
  if (title.startsWith(lower)) return 85;
  if (url.includes(lower)) return 70;
  if (folder.includes(lower)) return 55;
  if (browser.includes(lower)) return 45;
  if (`${title} ${url} ${folder} ${browser}`.includes(lower)) return 35;
  return 0;
}

function searchBookmarks(bookmarks, keyword, limit = MAX_RESULTS) {
  return (Array.isArray(bookmarks) ? bookmarks : [])
    .map((bookmark, index) => ({
      ...bookmark,
      score: scoreBookmark(bookmark, normalizeText(keyword)),
      index,
    }))
    .filter((bookmark) => bookmark.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit);
}

function searchHistory(history, keyword, limit = MAX_HISTORY_RESULTS) {
  return (Array.isArray(history) ? history : [])
    .map((item, index) => ({
      ...item,
      score: scoreBookmark(item, normalizeText(keyword)),
      index,
    }))
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        (Number(right.lastVisitedAt) || 0) -
          (Number(left.lastVisitedAt) || 0) ||
        left.index - right.index,
    )
    .slice(0, limit);
}

async function ensurePermission(permissionId, reason) {
  if (!permission?.check || !permission?.request) {
    return {
      granted: false,
      reason: "permission-sdk-unavailable",
    };
  }

  try {
    const hasPermission = await permission.check(permissionId);
    if (hasPermission) {
      return { granted: true };
    }

    const granted = await permission.request(permissionId, reason);
    if (granted) {
      return { granted: true };
    }

    return {
      granted: false,
      reason: "permission-denied",
    };
  } catch {
    logger?.warn?.("[touch-browser-data] Failed to request permission");
    return {
      granted: false,
      reason: "permission-request-failed",
    };
  }
}

async function checkPermissionStatus(permissionId) {
  if (!permission?.check)
    return {
      granted: false,
      status: "permission-missing",
      reason: "permission-sdk-unavailable",
    };

  try {
    const granted = Boolean(await permission.check(permissionId));
    return granted
      ? { granted: true, status: "available", reason: "" }
      : {
          granted: false,
          status: "permission-missing",
          reason: `${permissionId.replace(".", "-")}-permission-required`,
        };
  } catch {
    logger?.warn?.("[touch-browser-data] Failed to check permission");
    return {
      granted: false,
      status: "permission-missing",
      reason: "permission-check-failed",
    };
  }
}

async function resolveNetworkOpenCapabilityState() {
  return checkPermissionStatus(NETWORK_PERMISSION_ID);
}

function buildInfoItem({ id, featureId, title, subtitle, meta = {} }) {
  return new TuffItemBuilder(id)
    .setSource("plugin", SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({ pluginName: PLUGIN_NAME, featureId, ...meta })
    .build();
}

function extractUrlHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

function buildNetworkOpenCapability({
  featureId,
  item,
  bookmark,
  sourceType = "browser-bookmark",
  status = "available",
  reason = "",
}) {
  const record = item || bookmark || {};
  return {
    id: NETWORK_PERMISSION_ID,
    type: "network",
    permission: NETWORK_PERMISSION_ID,
    status,
    ...(reason ? { reason } : {}),
    audit: {
      pluginName: PLUGIN_NAME,
      featureId,
      actionId: "open-url",
      operation: "open-external-url",
      source:
        sourceType === "browser-history" ? "history-sqlite" : "bookmarks-json",
      browserId: record.browserId,
      browserName: record.browserName,
      urlHost: extractUrlHost(record.url),
    },
  };
}

function formatNetworkCapabilitySuffix(capabilityState) {
  if (!capabilityState || capabilityState.status === "available") return "";
  if (capabilityState.status === "permission-missing")
    return " · 缺少 network.internet 权限";
  return capabilityState.reason ? ` · ${capabilityState.reason}` : "";
}

function buildBookmarkItem(
  featureId,
  bookmark,
  index,
  networkCapabilityState = { status: "available", reason: "" },
) {
  return new TuffItemBuilder(`${featureId}-bookmark-${index}`)
    .setSource("plugin", SOURCE_ID, PLUGIN_NAME)
    .setTitle(`${bookmark.browserName} · ${bookmark.title}`)
    .setSubtitle(
      `${truncateText(bookmark.url, 72)}${formatNetworkCapabilitySuffix(networkCapabilityState)}`,
    )
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      searchProviderId: BOOKMARK_PROVIDER_ID,
      indexedSourceId: BOOKMARK_SOURCE_ID,
      sourceType: "browser-bookmark",
      sourceKind: "browser-bookmark",
      defaultAction: ACTION_ID,
      actionId: "open-url",
      payload: {
        url: bookmark.url,
        title: bookmark.title,
        sourceType: "browser-bookmark",
      },
      capability: buildNetworkOpenCapability({
        featureId,
        item: bookmark,
        sourceType: "browser-bookmark",
        status: networkCapabilityState.status,
        reason: networkCapabilityState.reason,
      }),
      actions: {
        copyUrl: {
          actionId: "copy-url",
          payload: { url: bookmark.url },
          permission: "clipboard.write",
        },
      },
    })
    .createAndAddAction("copy-url", "plugin", "复制 URL", { url: bookmark.url })
    .build();
}

function buildHistoryItem(
  featureId,
  historyItem,
  index,
  networkCapabilityState = { status: "available", reason: "" },
) {
  return new TuffItemBuilder(`${featureId}-history-${index}`)
    .setSource("plugin", SOURCE_ID, PLUGIN_NAME)
    .setTitle(`${historyItem.browserName} · 历史 · ${historyItem.title}`)
    .setSubtitle(
      `${truncateText(historyItem.url, 72)} · 最近访问${formatNetworkCapabilitySuffix(networkCapabilityState)}`,
    )
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      searchProviderId: HISTORY_PROVIDER_ID,
      indexedSourceId: HISTORY_SOURCE_ID,
      sourceType: "browser-history",
      sourceKind: "browser-history",
      defaultAction: ACTION_ID,
      actionId: "open-url",
      payload: {
        url: historyItem.url,
        title: historyItem.title,
        sourceType: "browser-history",
      },
      capability: buildNetworkOpenCapability({
        featureId,
        item: historyItem,
        sourceType: "browser-history",
        status: networkCapabilityState.status,
        reason: networkCapabilityState.reason,
      }),
      actions: {
        copyUrl: {
          actionId: "copy-url",
          payload: { url: historyItem.url, sourceType: "browser-history" },
          permission: "clipboard.write",
        },
      },
    })
    .createAndAddAction("copy-url", "plugin", "复制 URL", {
      url: historyItem.url,
      sourceType: "browser-history",
    })
    .build();
}

function buildMaintenanceItems(featureId, query, sourceIds) {
  const enabledSourceIds = new Set(normalizeSourceIds(sourceIds));
  const sources = BROWSER_DATA_SOURCES.filter((source) =>
    enabledSourceIds.has(source.id),
  );

  return sources.flatMap((source) => [
    new TuffItemBuilder(`${featureId}-${source.id}-rebuild`)
      .setSource("plugin", SOURCE_ID, PLUGIN_NAME)
      .setTitle(`重新扫描${source.label}`)
      .setSubtitle(`重新读取已授权的${source.label}；不会写入浏览器`)
      .setIcon(ICON)
      .setMeta({
        pluginName: PLUGIN_NAME,
        featureId,
        searchProviderId: source.providerId,
        indexedSourceId: source.id,
        sourceType: `${source.sourceType}-maintenance`,
        defaultAction: ACTION_ID,
        actionId: "rebuild-browser-data",
        payload: {
          query: getQueryText(query),
          sourceIds: [source.id],
        },
      })
      .build(),
    new TuffItemBuilder(`${featureId}-${source.id}-clear-results`)
      .setSource("plugin", SOURCE_ID, PLUGIN_NAME)
      .setTitle(`清除当前${source.label}结果`)
      .setSubtitle("仅清除当前面板结果；已索引来源请使用设置中的清除操作")
      .setIcon(ICON)
      .setMeta({
        pluginName: PLUGIN_NAME,
        featureId,
        searchProviderId: source.providerId,
        indexedSourceId: source.id,
        sourceType: `${source.sourceType}-maintenance`,
        defaultAction: ACTION_ID,
        actionId: "clear-browser-data-results",
        payload: { sourceIds: [source.id] },
      })
      .build(),
  ]);
}

function buildDiagnosticsItem(
  featureId,
  diagnostics,
  label,
  itemCount,
  sourceId,
) {
  const available = diagnostics.filter((item) =>
    ["available", "partial"].includes(item.status),
  );
  const failed = diagnostics.filter((item) => item.status === "read-failed");
  const partial = diagnostics.filter((item) => item.status === "partial");
  const unsupported = diagnostics.filter(
    (item) => item.status === "unsupported",
  );
  const degraded = diagnostics.filter(
    (item) =>
      !["available", "partial", "read-failed", "unsupported"].includes(
        item.status,
      ),
  );
  const subtitle = [
    available.length
      ? `${label} ${itemCount} 条 · ${available
          .map((item) => {
            const readableProfileCount = Number.isInteger(
              item.readableProfileCount,
            )
              ? item.readableProfileCount
              : item.profileCount;
            return `${item.browserName}已读取 ${readableProfileCount} 个档案`;
          })
          .join(" / ")}`
      : "",
    partial.length
      ? partial
          .map((item) => `${item.browserName}${label}部分读取失败`)
          .join(" / ")
      : "",
    failed.length
      ? failed.map((item) => `${item.browserName}${label}读取失败`).join(" / ")
      : "",
    unsupported.length
      ? unsupported
          .map((item) => `${item.browserName}${label}不支持`)
          .join(" / ")
      : "",
    degraded.length
      ? degraded
          .map(
            (item) => `${item.browserName}${label}：${item.reason || "不可用"}`,
          )
          .join(" / ")
      : "",
    available.length ? "" : `${label}未发现可读取的数据`,
  ]
    .filter(Boolean)
    .join(" · ");

  return buildInfoItem({
    id: `${featureId}-${sourceId}-diagnostics`,
    featureId,
    title: `${label}扫描状态`,
    subtitle,
    meta: buildSourceMeta([sourceId]),
  });
}

function buildResultItems(
  featureId,
  query,
  scanResult,
  networkCapabilityState = { status: "available", reason: "" },
) {
  const parsed = parseQuery(query);
  const sourceIds = normalizeSourceIds(scanResult?.sourceIds);
  const activeSources = BROWSER_DATA_SOURCES.filter((source) =>
    sourceIds.includes(source.id),
  );
  const bookmarkItems = Array.isArray(scanResult?.items)
    ? scanResult.items
    : [];
  const bookmarkDiagnostics = Array.isArray(scanResult?.diagnostics)
    ? scanResult.diagnostics
    : [];
  const historyItems = Array.isArray(scanResult?.historyItems)
    ? scanResult.historyItems
    : [];
  const historyDiagnostics = Array.isArray(scanResult?.historyDiagnostics)
    ? scanResult.historyDiagnostics
    : [];
  const matchedBookmarks = searchBookmarks(bookmarkItems, parsed.keyword);
  const matchedHistory = searchHistory(
    historyItems,
    parsed.keyword,
    MAX_HISTORY_RESULTS,
  );
  const resultItems = [];
  const availableBrowserNames = Array.from(
    new Set(
      [
        ...(sourceIds.includes(BOOKMARK_SOURCE_ID) ? bookmarkDiagnostics : []),
        ...(sourceIds.includes(HISTORY_SOURCE_ID) ? historyDiagnostics : []),
      ]
        .filter((item) => item.status !== "unsupported")
        .map((item) => item.browserName),
    ),
  );
  const availabilityText = availableBrowserNames.length
    ? `当前平台只读 ${availableBrowserNames.join(" / ")} 的浏览器书签与最近历史`
    : "当前平台暂无支持的浏览器数据源";

  if (!matchedBookmarks.length && !matchedHistory.length) {
    for (const source of activeSources) {
      resultItems.push(
        buildInfoItem({
          id: `${featureId}-${source.id}-empty`,
          featureId,
          title: parsed.keyword
            ? `没有匹配的${source.label}`
            : `未发现${source.label}`,
          subtitle: parsed.keyword
            ? "尝试输入标题、URL、文件夹、浏览器名称或 history"
            : availabilityText,
          meta: buildSourceMeta([source.id]),
        }),
      );
    }
  } else {
    matchedBookmarks.forEach((bookmark, index) =>
      resultItems.push(
        buildBookmarkItem(featureId, bookmark, index, networkCapabilityState),
      ),
    );
    matchedHistory.forEach((historyItem, index) =>
      resultItems.push(
        buildHistoryItem(featureId, historyItem, index, networkCapabilityState),
      ),
    );
  }

  resultItems.push(...buildMaintenanceItems(featureId, query, sourceIds));
  for (const source of activeSources) {
    const isBookmarkSource = source.id === BOOKMARK_SOURCE_ID;
    resultItems.push(
      buildDiagnosticsItem(
        featureId,
        isBookmarkSource ? bookmarkDiagnostics : historyDiagnostics,
        source.diagnosticLabel,
        isBookmarkSource ? bookmarkItems.length : historyItems.length,
        source.id,
      ),
    );
  }
  return resultItems;
}

function buildBlockedHistoryScan(browserFilter, reason) {
  const definitions = browserDefinitions().filter(
    (definition) => !browserFilter || definition.id === browserFilter,
  );
  return {
    items: [],
    diagnostics: buildHistorySourceDiagnostics(
      process.platform,
      definitions,
      browserFilter,
    ).map((diagnostic) => ({
      ...diagnostic,
      status: "permission-missing",
      reason,
      lastError: reason,
    })),
  };
}

async function scanBrowserData(query, sourceIds) {
  const parsed = parseQuery(query);
  const resolvedSourceIds = normalizeSourceIds(sourceIds);
  const bookmarks = resolvedSourceIds.includes(BOOKMARK_SOURCE_ID)
    ? scanBrowserBookmarks({ browserFilter: parsed.browser })
    : { items: [], diagnostics: [] };
  if (!resolvedSourceIds.includes(HISTORY_SOURCE_ID)) {
    return {
      ...bookmarks,
      historyItems: [],
      historyDiagnostics: [],
      sourceIds: resolvedSourceIds,
    };
  }

  if (typeof DatabaseSync !== "function") {
    const history = buildBlockedHistoryScan(
      parsed.browser,
      "History database support is unavailable in this runtime",
    );
    return {
      ...bookmarks,
      historyItems: history.items,
      historyDiagnostics: history.diagnostics,
      sourceIds: resolvedSourceIds,
    };
  }

  const indexPermission = await ensurePermission(
    INDEX_PERMISSION_ID,
    "需要 fs.index 权限以创建临时只读副本扫描浏览器历史记录",
  );
  const history = indexPermission.granted
    ? scanBrowserHistory({ browserFilter: parsed.browser })
    : buildBlockedHistoryScan(
        parsed.browser,
        indexPermission.reason === "permission-sdk-unavailable"
          ? "History scan requires the fs.index permission SDK"
          : "History scan requires fs.index permission",
      );

  return {
    ...bookmarks,
    historyItems: history.items,
    historyDiagnostics: history.diagnostics,
    sourceIds: resolvedSourceIds,
  };
}

function clearSourceResults(sourceIds) {
  if (
    typeof plugin?.feature?.getItems !== "function" ||
    typeof plugin?.feature?.removeItem !== "function"
  )
    return false;

  const targetSourceIds = new Set(normalizeSourceIds(sourceIds));
  for (const item of plugin.feature.getItems()) {
    if (targetSourceIds.has(normalizeText(item?.meta?.indexedSourceId)))
      plugin.feature.removeItem(item.id);
  }
  return true;
}

async function renderBrowserDataResults(
  featureId,
  query,
  sourceIds,
  replaceOnly = false,
) {
  const resolvedSourceIds = normalizeSourceIds(sourceIds);
  const scanResult = await scanBrowserData(query, resolvedSourceIds);
  const networkCapabilityState = await resolveNetworkOpenCapabilityState();
  if (replaceOnly) {
    if (!clearSourceResults(resolvedSourceIds))
      throw new Error("Browser source result replacement is unavailable");
  } else {
    plugin.feature.clearItems();
  }
  plugin.feature.pushItems(
    buildResultItems(featureId, query, scanResult, networkCapabilityState),
  );
  return scanResult;
}

const pluginLifecycle = {
  async onFeatureTriggered(featureId, query) {
    const sourceIds = resolveEnabledSourceIds();
    try {
      plugin.feature.clearItems();
      if (sourceIds.length === 0) return true;

      const permissionResult = await ensurePermission(
        "fs.read",
        "需要只读扫描已启用的浏览器书签或历史数据",
      );
      if (!permissionResult.granted) {
        plugin.feature.pushItems([
          buildInfoItem({
            id: `${featureId}-permission`,
            featureId,
            title: "缺少文件读取权限",
            subtitle: "授权 fs.read 后才能只读扫描已启用的浏览器数据源",
            meta: buildSourceMeta(sourceIds),
          }),
        ]);
        return true;
      }

      await renderBrowserDataResults(featureId, query, sourceIds);
      return true;
    } catch {
      logger?.error?.(
        "[touch-browser-data] Failed to process browser data feature",
      );
      plugin.feature.clearItems();
      plugin.feature.pushItems([
        buildInfoItem({
          id: `${featureId}-error`,
          featureId,
          title: "浏览器数据加载失败",
          subtitle: "请确认浏览器数据权限与本地数据库状态后重试",
          meta: buildSourceMeta(sourceIds),
        }),
      ]);
      return true;
    }
  },

  async onItemAction(item) {
    if (item?.meta?.defaultAction !== ACTION_ID) return;

    const actionId = item.meta?.actionId;
    const payload = item.meta?.payload || {};
    const featureId = normalizeText(item.meta?.featureId) || "browser-data";

    try {
      if (actionId === "rebuild-browser-data") {
        const requestedSourceIds = normalizeSourceIds(payload.sourceIds);
        const enabledSourceIds = new Set(resolveEnabledSourceIds());
        const sourceIds = requestedSourceIds.filter((sourceId) =>
          enabledSourceIds.has(sourceId),
        );
        if (sourceIds.length === 0) {
          return {
            externalAction: true,
            success: false,
            status: "blocked",
            reason: "search-provider-disabled",
            message: "请先启用对应的浏览器数据来源",
          };
        }

        const permissionResult = await ensurePermission(
          "fs.read",
          "需要只读重新扫描已启用的浏览器数据来源",
        );
        if (!permissionResult.granted) {
          return {
            externalAction: true,
            success: false,
            status: "blocked",
            reason: permissionResult.reason || "permission-denied",
            message: "缺少 fs.read 权限",
          };
        }
        await renderBrowserDataResults(
          featureId,
          payload.query,
          sourceIds,
          true,
        );
        return {
          externalAction: true,
          status: "completed",
          sourceIds,
          operation: "rebuild",
        };
      }

      if (actionId === "clear-browser-data-results") {
        const sourceIds = normalizeSourceIds(payload.sourceIds);
        const cleared = clearSourceResults(sourceIds);
        return {
          externalAction: true,
          ...(cleared ? {} : { success: false }),
          status: cleared ? "completed" : "failed",
          sourceIds,
          operation: "clear-results",
        };
      }

      const url = normalizeUrl(payload.url);
      if (!url) return;

      if (actionId === "open-url") {
        const permissionResult = await ensurePermission(
          NETWORK_PERMISSION_ID,
          "需要 network.internet 权限以默认浏览器打开网址",
        );
        if (!permissionResult.granted) {
          return {
            externalAction: true,
            success: false,
            status: "blocked",
            reason: permissionResult.reason || "permission-denied",
            message: "缺少 network.internet 权限",
          };
        }

        if (typeof openUrl !== "function") {
          return {
            externalAction: true,
            success: false,
            status: "blocked",
            reason: "open-url-unavailable",
            message: "当前环境不支持打开外链",
          };
        }
        await openUrl(url);
        return { externalAction: true, status: "started" };
      }

      if (actionId === "copy-url") {
        const permissionResult = await ensurePermission(
          "clipboard.write",
          "需要 clipboard.write 权限以复制浏览器网址",
        );
        if (!permissionResult.granted) {
          return {
            externalAction: true,
            success: false,
            status: "blocked",
            reason: permissionResult.reason || "permission-denied",
            message: "缺少 clipboard.write 权限",
          };
        }

        if (typeof clipboard?.writeText !== "function") {
          return {
            externalAction: true,
            success: false,
            status: "blocked",
            reason: "clipboard-unavailable",
            message: "当前环境不支持写入剪贴板",
          };
        }

        clipboard.writeText(url);
        return { externalAction: true, status: "started" };
      }
    } catch {
      logger?.error?.("[touch-browser-data] Browser data action failed");
      return {
        externalAction: true,
        success: false,
        message: "执行失败",
      };
    }
  },
};

module.exports = {
  ...pluginLifecycle,
  __test: {
    browserDefinitions,
    buildBrowserSourceDiagnostics,
    buildHistorySourceDiagnostics,
    buildNetworkOpenCapability,
    buildResultItems,
    collectBookmarkNodes,
    createHistoryTemporaryCopy,
    dedupeBookmarks,
    dedupeHistory,
    discoverBookmarkFiles,
    discoverHistoryFiles,
    getAvailableBrowserNames,
    parseChromiumBookmarks,
    parseQuery,
    readChromiumHistory,
    resolveNetworkOpenCapabilityState,
    scanBrowserBookmarks,
    scanBrowserHistory,
    searchBookmarks,
    searchHistory,
  },
};
