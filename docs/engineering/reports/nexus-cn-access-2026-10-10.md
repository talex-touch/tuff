# 中国大陆访问 Nexus 的链路评估

> 日期：2026-10-10
> 状态：**检测中**。方案对比已完成；推荐方案只在一个观测点、非高峰时段测过，§5 的待实测项完成前不切生产。
> 观测点：北京联通家庭宽带出口一个，北京时间 10-10 上午 10:40–11:15。两台测试机共用这个出口，只算一个观测点。
> 依据：`curl` 实测。EdgeOne 部分只读了腾讯云官方文档和社区文章，**未实测**（来源见 §7）。
> 本仓核对基线：`origin/master` 06daf6fed。10-10 第二次更新（§2 补客户端 IP 的约束；§4 记录构建方式的决定，补入其余待定项）按 0f935867c 核对。

## 0. 结论

- **慢在跨境链路，不在 Worker。** 本次观测点（北京联通）的请求落在美国 LAX 机房（`/cdn-cgi/trace` 返回 `loc=CN colo=LAX`），耗时主要花在 TCP 建连之后的 TLS 握手。其他运营商和晚高峰还没测，见 §5。Worker 自报的 `Server-Timing` 只有 18–525 ms，继续优化服务端代码，体感不会明显变快。
- **推荐优选 IP。** 把 `tuff.tagzxia.com` 子域的 NS 委派给国内 DNS，按线路解析。访客仍直连 Cloudflare，Nexus 看到的 Host 和客户端 IP 不变，不用改代码；撤销委派即可回滚。它不是 Cloudflare 官方支持的用法，切换前要补完 §5 的实测。
- **EdgeOne 能用，但代价大。** 大陆节点要 ICP 备案。除了能缓存 5 分钟的文档页，首页、接口和登录后的请求仍要跨境回源到 Cloudflare。还要改 Nexus 取 Host 和客户端 IP 的代码。只建议在测试子域上试。
- **自建境外中转、国内云主机反代都不建议进生产。**

## 1. 现状实测

| 路径 | 结果 |
| --- | --- |
| 测试机 A → `/cdn-cgi/trace` | 2.2–12.3 s，5 次里 1 次超时；TCP 建连完成于 0.2–0.57 s，TLS 握手完成于 0.9–11.3 s |
| 测试机 B → `/cdn-cgi/trace` | 2.6–24.9 s，5 次里 1 次失败 |
| 同一出口 → baidu.com | 77 ms |
| Worker 自报（`Server-Timing`） | 18–525 ms |

`/cdn-cgi/trace` 由边缘直接返回、不进 Worker，所以前两行的耗时都是网络链路。

建连和握手的数字是 curl 的 `time_connect` 与 `time_appconnect`，都从请求开始累计，握手本身的耗时是两者之差。建连最晚 0.57 s 就完成了，慢的那几次主要耗在握手上。

## 2. 方案对比

| 方案 | 实测 | 改代码 | 主要代价 | 结论 |
| --- | --- | --- | --- | --- |
| 优选 IP（子域 NS 委派 + 分线路解析） | 抽样 IP 的 TTFB 0.57–0.9 s，均 3/3 成功 | 不需要 | 非官方用法；IP 会变，要定期重扫 | **推荐**，补测后再切 |
| EdgeOne（CNAME 接入） | 未实测 | 需要 | 大陆节点要备案；动态请求仍跨境回源 | 只在测试子域试 |
| 自建境外中转（美西 VPS） | 6/6 成功，TTFB 0.56–0.86 s | 需要 | 单点；所有国内访客共用一个 IP | 不建议进生产 |
| 国内云主机反代 | 新连接 1–5.5 s | 需要 | 到 Cloudflare 落在欧洲机房；合规风险 | 不建议 |
| Cloudflare 中国网络 | — | 不需要 | 要 Enterprise 计划和 ICP 备案 | 不在考虑范围 |

**客户端 IP**：10-10 起（#2091），Nexus 取客户端 IP 一律以 `CF-Connecting-IP` 为准。EdgeOne、自建中转和国内反代都会在 Cloudflare 前面多一层代理，这个头就变成了代理的地址：按 IP 的限流、封禁、设备授权的 IP 比对和审计记录，会全部落到同一个 IP 上。这三种方案上线前，都要先做一个用共享密钥认证的可信代理头。

### 2.1 优选 IP

**实测**（每个 IP 用 `--resolve` 指定后请求 3 次，方法见 §6）：

- `tuff.tagzxia.com` 当前解析到的两个 IP（104.21.80.101、172.67.177.44）恰好在慢的那批里。
- 104.26.x 和 172.67.68.157 落在 HKG，TTFB 0.57–0.72 s；104.20、104.24、104.27 段落在 LAX，TTFB 0.66–0.9 s。都是 3/3 成功。
- 社区优选域名给出的 27 个 IP，有 22 个在这条线路上超时，不能直接照抄。

**做法**：

1. 在国内 DNS 服务商添加 `tuff.tagzxia.com` 子域，完成 TXT 授权验证，拿到 NS 地址。
2. 在 Cloudflare 的 `tagzxia.com` zone 里，把 tuff 的记录换成指向这组 NS 的 NS 记录。
3. 在国内 DNS 上按请求来源分线路解析：
   - 境外 → CNAME 到 Pages 项目的默认域名（`*.pages.dev`）；
   - 中国 → 自测筛出的优选 IP（A 记录），或社区维护的优选域名（CNAME）。

**好处**：访客仍直连 Cloudflare 边缘，Nexus 收到的 `Host` 和 `CF-Connecting-IP` 都不变，不用改代码。撤掉委派、恢复原记录就能回滚。

**代价与未知**：

- 不在官方机制内。Pages 自定义域名的官方接入方式是 CNAME 到 Pages 默认域名，把记录直接写成边缘 IP 不受支持。边缘 IP 会调整，要定期重扫。
- tuff 不再经过 `tagzxia.com` zone 的代理记录，这个 zone 上的规则（WAF、缓存规则、重定向等）预计不再作用于 tuff。
- DNS 不再由 Cloudflare 应答后，Pages 自定义域名能否保持 Active、证书能否续期，**没有验证**（见 §5）。
- 回滚时，已缓存 NS 委派的解析器在 TTL 过期前仍会去问国内 DNS，所以国内 DNS 上的记录要保留到 TTL 过期后再删。

### 2.2 EdgeOne

只读了官方文档和社区文章，未实测。标「博客」的未经官方证实。

- **套餐**：免费版仍在，属于限量内测。流量和请求不限量，1 个站点、200 个子域名、20 条规则；没有 QUIC、WebSocket，也没有 SLA；全站刷新每天 10 次。中国站要在实名认证后到活动页领取。个人版 29.9 元/月，商品页正在促销 9.9 元/月。
- **大陆节点要 ICP 备案**：加速区域选「中国大陆」或「全球」都要备案，未备案只能选「全球（不含中国大陆）」。备案可以在任意接入商办理；只有源站是腾讯云服务器时，才要求在腾讯云接入备案。`tagzxia.com` 是否已备案，待确认。
- **动态请求仍要跨境**：源站在境外时，官方说明跨境回源质量无法保障，跨境优化只有企业版能买。节点缓存默认遵循源站的 `Cache-Control`（70777）。按 Nexus 现在的响应头（10-10 实测）：
  - 文档页是 `public, max-age=300, s-maxage=300`，能在大陆节点缓存 5 分钟；
  - 首页是 `max-age=0, must-revalidate`，每次都要回源；
  - `/api/releases/latest`、`/api/store/plugins` 不带 `Cache-Control`，按 EdgeOne 的默认缓存策略处理，这部分没有核对；
  - 带登录态的请求不能放进共享缓存。

  所以除了文档页，首页、接口和登录后的请求仍要从 EdgeOne 回到 Cloudflare，除非另配缓存规则并自己处理失效。
- **接入方式**：NS 可以留在 Cloudflare，用 CNAME 接入，用 TXT 记录或验证文件证明归属。tuff 的记录要改成灰云，CNAME 到 EdgeOne。Cloudflare 免费版不能按地区解析，所以海外访客也会经过 EdgeOne。
- **回源**：源站填 Pages 默认域名，走 HTTPS。回源 SNI 跟随回源 Host，控制台改不了，所以 Host 必须是 `*.pages.dev`。博客提到两个坑：Host 不对时 Pages 返回 404；用 HTTP 回源会被 301 到 HTTPS，形成循环。
- **要改 Nexus**：
  - Nexus 看到的 Host 会变成 `*.pages.dev`，`CF-Connecting-IP` 会变成 EdgeOne 节点的 IP。
  - EdgeOne 回源默认带 `EO-Connecting-IP`、`CDN-Loop`，并在 `X-Forwarded-For` 原值后追加；规则可以添加自定义回源头，免费版也能用。
  - 免费版没有回源 IP 段，只能靠共享密钥头确认请求来自 EdgeOne，校验通过后再取原域名和真实 IP。
- **Pages 自定义域名**：tuff 改指向 EdgeOne 后，会不会被 Cloudflare 判为失效，没找到资料。
- **社区实测**（博客、论坛）：
  - 一次全国测速，免费版平均 1.48 s（电信 1.30、联通 2.03、移动 1.33 s），未注明加速区域。
  - 选「不含中国大陆」时，大陆访客多被分到香港、新加坡、日本节点，加载 1–3 s。
  - 论坛评价两极。

### 2.3 自建境外中转

用一台美西 VPS（回程走联通 9929）测过：

- 到北京约 165 ms，不丢包；北京联通建连 0.16–0.30 s，20 次里 4 次 SYN 重传。
- 经它转发（SSH 隧道）访问 tuff，6/6 成功，TTFB 0.56–0.86 s；同一时段直连 10 次里 3 次超时。

不建议进生产：

- 2C/2G 单点；机器另有业务，443 端口已被占用。
- 所有国内访客在 Nexus 看来是同一个 IP，按 IP 的安全窗口和限流会误伤。要避免，同样得改代码取真实 IP。
- 流量费用和被封风险都压在这一台机器上。

### 2.4 国内云主机反代

杭州的一台云主机访问 Cloudflare，落在阿姆斯特丹（AMS）：新连接 1–5.5 s；连接复用后每个请求约 0.2 s，偶尔卡到 3.7 s。大陆主机反代境外站点还有合规风险，不建议。

## 3. 建议路径

1. 在自己的设备上用 hosts 指定优选 IP，先看真实页面的体感。不碰 DNS，随时可撤。
2. 补完 §5 的实测。
3. 用一个测试子域走完 NS 委派，确认 Pages 自定义域名和证书的状态。
4. 再切 `tuff.tagzxia.com`，同时备好回滚步骤。DNS 改动属于生产操作，切换前单独确认。

## 4. 同批待定项（与链路无关）

- **生产构建：继续用 Cloudflare Pages 构建**（10-10 决定），不迁 GitHub Actions。
  - Pages 构建需要 7–8 GB 堆，仍会随机超时。超时的构建不会替换线上版本，在控制台或用 Pages API 重试即可。
  - Pages 同时只跑 1 个构建，而每次推送都会排一个构建，包括任务分支和只改文档的提交，preview 会挡在生产构建前面。可以考虑：
    - preview 只构建 `stage`，或者关掉；
    - 加构建监视路径，只在 Nexus 依赖的目录变化时构建。目录清单要先列准，漏了生产就不会更新。
  - 搁置的 Actions 方案，以后重新考虑时从这里接着看：
    - 卡点：`apps/nexus/nuxt.config.ts` 在**构建时**把下列值从 `process.env` 写进 runtimeConfig：
      `ADMIN_CONTROL_PLANE_PEPPER`、`ADMIN_EMERGENCY_JWT_SECRET`、`ADMIN_SECRET`、`APP_AUTH_JWT_SECRET`、`AUTH_SECRET`、`EXCHANGE_RATE_API_KEY`、`GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`LINUXDO_CLIENT_ID`、`LINUXDO_CLIENT_SECRET`、`NOTIFICATION_SECURE_STORE_KEY`、`PROVIDER_REGISTRY_SECURE_STORE_KEY`。开启 source map 上传时还要 `SENTRY_AUTH_TOKEN`。
    - Pages 构建环境里有这些值，Actions 里没有。Cloudflare 的密钥只能写、不能读，没法从 Pages 项目取出来。
    - 方案 A：把这些值补成 GitHub secret。两个 `*_SECURE_STORE_KEY` 和 pepper 不能轮换（一换，已加密或已哈希的数据就失效），必须用原值。
    - 方案 B：改成运行时从 Pages 环境读取。Nitro 的 `nitro.envExpansion` 支持在运行时展开 `{{VAR}}`。前提是先改掉 server 里 9 处不传 event 的 `useRuntimeConfig()`，再在 preview 部署上验证。这 9 处分布在 `api/auth/[...].ts`、`api/passkeys/` 下 4 个文件、`api/user/linked-accounts/[provider].delete.ts`、`plugins/sentry.ts`、`utils/docAnalyticsStore.ts`。
- **边缘缓存命中时跳过检查**：命中时请求不进处理函数，存储策略检查和写 D1 的治理事件都会跳过。
  - 好处：不碰 D1 和 R2，应用耗时约 11–15 ms；未命中要往返 D1 1–4 次，每次约 146 ms。同时省下 D1 免费额度。
  - 代价：用量和下载计数偏低；改策略或下架后，要等缓存过期才生效（图片最长 1 小时，更新包 5 分钟，catalog 24 小时）。
  - 建议保留。
- **前端 Sentry**：`sendDefaultPii` 已是 `true`，保持不变。全仓没有 `Sentry.setUser`，事件看不出是哪个账号；是否补上，待定。
- **Nexus 维护定时任务**：`apps/nexus/maintenance-worker` 已经写好，但账号的定时任务名额（Workers 免费版 5 个）已经用满，触发器没挂上；升级付费版推迟。在它上线前，维护仍由请求顺带触发。
- **共享的 D1 读额度**：D1 额度按账号算。同账号另一个项目的数据库每小时稳定读 7 万多行，九成来自它每 5 分钟整表读一次用户表的定时任务；10-10 之前一周每天约 173 万行，占每天 500 万行免费读额度的 35%，Nexus 实际能用的不到 65%。这个定时任务每次约用 50 ms CPU，超过 Workers 免费版 10 ms 的上限，10-10 03:55 UTC 起每次都被终止，但读取照样计数。要在那个项目里改，待定。
- **Smart Placement 的执行位置变了**：配置仍是 smart。10-08 核验时请求被挪到 HKG 执行（`cf-placement: remote-HKG`），10-10 02:45 UTC 之后看到的都是在 LAX 本地执行（`local-LAX`）。目前服务端耗时正常（未命中缓存时 4 次 D1 往返共 0.26–0.53 s），原因待复查。

## 5. 待实测清单

- [ ] 晚高峰（北京时间 20:00–23:00）复测同一批 IP。
- [ ] 电信、移动线路各至少一个观测点。
- [ ] 经优选 IP 打开真实页面和接口：首页、文档页、登录、`/api/releases/latest`。目前只测了 `/cdn-cgi/trace`。
- [ ] 国内线路的解析目标：自测 IP 和社区优选域名，各连续观察一周的可用率。
- [ ] 测试子域做 NS 委派后：Pages 自定义域名能否保持 Active，证书能否签发和续期，`tagzxia.com` 的 zone 规则是否还生效。
- [ ] `tagzxia.com` 的 ICP 备案状态，决定 EdgeOne 能否用大陆节点。
- [ ] （可选）EdgeOne 测试子域：回源 Host、共享密钥头、真实 IP 与 TTFB。

## 6. 测量方法

```bash
# 链路耗时（/cdn-cgi/trace 不进 Worker；tcp、tls 都从请求开始累计）
curl -so /dev/null -w 'tcp=%{time_connect} tls=%{time_appconnect} ttfb=%{time_starttransfer} total=%{time_total}\n' \
  https://tuff.tagzxia.com/cdn-cgi/trace

# 指定边缘 IP：看落在哪个机房，再计 TTFB（§2.1 的数据，每个 IP 请求 3 次）
curl -s --resolve tuff.tagzxia.com:443:<ip> https://tuff.tagzxia.com/cdn-cgi/trace | grep -E '^(colo|loc)='
curl -so /dev/null --resolve tuff.tagzxia.com:443:<ip> -w 'code=%{http_code} ttfb=%{time_starttransfer}\n' \
  https://tuff.tagzxia.com/cdn-cgi/trace

# Worker 自身耗时
curl -s -D - -o /dev/null https://tuff.tagzxia.com/<页面或接口> | grep -i -E 'server-timing|cf-placement|x-edge-cache'
```

- 返回 403 且错误码 1034：该 IP 在受限地址段，不能用。错误码 1003：请求没带上域名，等于直接访问 IP。
- 每轮都用同一出口访问国内站点（如 baidu.com）做基线。
- 结论至少要两个不同出口的数据；共用一个出口的多台机器只算一个观测点。

## 7. 来源

腾讯云 EdgeOne 官方文档，2026-10-10 访问。中国站前缀为 `https://cloud.tencent.com/document/product/1552/`，下面只写编号，括号里是页面的最近更新时间：

- 套餐与价格：94165（2026-08-19）、94158（2026-05-22）
- 免费版领取与限制：118985（2026-08-25）；免费套餐增值套件：133025（2026-08-10）
- 加速区域与备案：110835、87601（2025-12-12）
- 源站与回源 Host：90433、73024；回源 SNI：115260（2025-08-27）
- CNAME 接入与归属验证：70789（2026-01-06）；CNAME 展平：122623（2025-09-04）
- 回源请求头与客户端 IP：87654（2026-09-24）、73133、71012
- 节点缓存 TTL：70777（2025-06-26）
- 国际站：`https://edgeone.ai/document/55650`（价格，2026-08-19）、`70405`（免费版领取，2026-08-26）、`54208`（实名要求，2025-08-14）、`56448`（中国大陆网络优化，2026-09-07）

社区文章（未经官方证实）：

- `blog.zhangp.net/zh/archives/24-CF-page-to-EdgeOne`（2026-05-20）：Pages 回源的 Host、301 循环和缓存头。
- `catcat.blog/2026/08/edgeone-cloudflare-geo-split-cdn`（2026-08-14）：免费版全国测速、Cloudflare WAF 拦截回源。
- `blog.tianhw.top/posts/edgeone/`（2025-10-09 修订）：选「不含中国大陆」时的节点分配。
- `linux.do/t/topic/802260`（2025-07-20）：用户评价。
