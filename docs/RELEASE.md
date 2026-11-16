# v0.9 预发行与部署

版本：`0.9.0-rc.1`。发布前须由独立 audit agent 审核代码、媒体、配置隔离和真实模型通关；公开部署后再核验匿名浏览器访问及跨域 AI 链路。两个阶段的证据分别记录于 `AUDIT.md`，准备好工作流不等于发布成功。

## 当前状态

截至 2026-11-17，[GitHub Pages 基础游戏](https://liaojs2025.github.io/life-cfo-game/)可使用规则陪练完整游玩，公网 AI 完整旅程仍未通过。用户已切换到 Paratera；新局和快捷预设使用截图中的 `DeepSeek-V3.2-Instruct`，显式自选模型与已有存档连接偏好保留。CORS 预检返回 200、允许 Authorization 与 Content-Type，但使用该精确模型的 CLI 两条对话路径均返回 401，公开 GitHub Pages Chrome 首次直连也在 1.654 秒返回 401（本机证据 `output/playwright/v09-public-paratera-result.json`）。这不是 CORS 拦截；模型名已解决，当前需要确认有效密钥与账号，不推断具体权限或余额原因。

最新默认模型已通过独立代码审计，148 项测试与 15 项语法检查通过。公开浏览器失败后双方账本仍为第 0 回合，无封存模型包或画像；代码通过不代表凭证认证或完整旅程通过。EFUND 最新 Node HTTP 测试也仅完成两年后返回 502；旧成功记录不能外推为当前稳定。Node 源码产物已通过独立审计，保留为可选部署方式，不再要求提供主机；Docker 镜像仍未构建。密钥未进入仓库，`PUBLIC_RELAY_ORIGIN` 未改，当前不创建 release 或 tag。

## 部署结构

- GitHub 仓库：`liaojs2025/life-cfo-game`。
- 游戏前端：GitHub Pages，项目路径 `/life-cfo-game/`，所有图片和模块均用相对路径。
- 当前直连预设：Paratera `https://llmapi.paratera.com/v1/chat/completions`，由浏览器直接发送请求，不经过现有 Worker 或 Node。
- 原八条固定路由的 AI 转发：`https://life-cfo-investment-lab.sapphirevale1.chatgpt.site/api/ai`，保持公开访问，不依赖平台登录或测试绕过凭证。
- 本地：`npm run dev` 在 `127.0.0.1:4173` 同时服务网页和 AI 转发。
- 可选 Node：`npm run start:relay` 启动独立转发服务，默认端口 8080；自托管时按 [DEPLOYMENT](DEPLOYMENT.md) 配置 HTTPS，不影响 Paratera 直连。

GitHub Pages 只托管静态网页，无法运行此转发处理器。`npm run build:pages` 输出 `output/pages`，自动排除 Worker、站点配置和闲置封面。GitHub Actions 工作流在 `main` 更新时执行测试、语法检查、静态构建与部署。首次需在仓库 Settings → Pages 启用 GitHub Actions 来源（或使用 GitHub API 配置 `build_type: workflow`）。工作流无模型密钥；自动检查均用可复现模拟接口。

## 直连与转发契约

Paratera 位于 `DIRECT_PROVIDERS`，不加入服务器白名单。浏览器请求 `/v1/chat/completions`，以 Authorization Bearer 仅向所填服务发送密钥，省略 Cookie/Referrer 并拒绝重定向。根地址自动补齐路径；普通 JSON 请求不启用 EFUND 的 SSE 或 520 恢复，401 只请求一次。服务端仍拒绝 `provider: paratera`，不借直连预设扩大中继范围。

`dist/providers.js` 是公开的固定上游清单。浏览器 POST `{provider, apiKey, request}`，转发服务仅向对应 HTTPS 地址发送临时 Bearer 密钥，不接受任意 URL、重定向、工具或客户端 `stream: true` 请求；客户端接口保持普通 JSON。凭证不写入日志、缓存、磁盘或存档。不额外注入 `max_tokens` 或 `max_completion_tokens`，输出额度采用服务商默认设置；响应大小与超时限制不构成费用上限。密钥属于每位玩家自己的服务商账号，游戏不提供共用密钥、费用额度或费用代付。

精确允许来源是当前游戏服务域名、`https://liaojs2025.github.io` 及两个本地预览地址。Origin 不含路径，因此同账户的其他 GitHub Pages 项目也属于这个浏览器信任来源；Origin 白名单不是面向非浏览器调用者的鉴权或防滥用方案。转发服务不自带供应商密钥，即使非浏览器调用也必须提供调用者自己的有效凭证。

错误响应仅可附实际上游 HTTP 状态及固定枚举原因，不包含供应商原始正文或日志凭证，用于区分临时容量、额度、参数与连接问题。

自定义且未列入固定清单的兼容端点由浏览器直连，要求服务商支持 CORS；不能保证任意第三方接口兼容。六家品牌的八条固定路由提供同一种转发协议。既有 EFUND 成功调用是局部历史证据，最新完整路径仍失败；Paratera 当前仅完成预检和 401 失败取证，其他服务以协议与异常模拟验证，不宣称全面可用。

## EFUND 流式传输（已部署，完整旅程待验收）

仅 EFUND 固定上游请求改为 `stream: true`。`worker/stream.js` 有界读取 SSE 并聚合成普通 Chat Completions JSON，再走既有内容校验后返回浏览器；不是浏览器流式 UI，也不新增上游调用或服务端重试。非 EFUND 保持原传输；若 EFUND 忽略 stream 而返回 JSON，直接在同一次响应中读取，不另发请求。

- Worker 55 秒限制覆盖整个流的读取和聚合，收到首字节不重置计时；取消继续有效。客户端仍共用 60 秒总预算。
- SSE 原始传输上限 2,000,000 bytes；聚合 JSON 上限 200,000 bytes。普通 JSON（含忽略 stream 的返回）仍限制为 200,000 bytes。
- 兼容 `role: null`、空工具调用数组及 `null` 工具调用占位，不将它们误判为实际工具调用；真实工具调用和非法角色继续拒绝。此项回归通过不证明它是公网故障根因。

该传输与安全诊断已部署，当前继续收集公网新局证据。第二阶段仍未通过，不据此创建 release 或声称故障根因已修复；请求次数与字节/超时上限仍不是费用上限。

## 有限恢复与请求预算

恢复由客户端控制，同一次操作最多 **3 次总 fetch（含首次）**。现有 HTTP 400 可选参数兼容分支最多重试一次，并与临时恢复共用三次额度。Worker 每次只请求固定上游一次，禁止再叠加服务端循环；构建产物不得另行引入服务器重试，以免三次乘两次放大为六次调用。

| 分支 | 精确条件 | 行为 |
| --- | --- | --- |
| 可选参数兼容 | HTTP 400 明确拒绝 `response_format` 或 `temperature` | 最多 1 次兼容重试，消耗总 fetch 额度 |
| EFUND 临时恢复 | 受控 `efund` relay 的 HTTP 502，且错误为 `code: upstream_error`、实际上游 `upstreamStatus: 520`、`upstreamReason: non_json` | 按已用请求次数等待 1 秒或 2 秒后重连；总 fetch 始终最多 3 次 |
| 不符合的失败 | 认证、权限、额度、网络异常、JSON 520、其他供应商、直连或其他错误组合 | 不走 EFUND 临时恢复分支，正常显示失败 |

例如 400 参数兼容后再收到符合条件的 520，第三次请求前等待 2 秒；只有真正发起新 fetch 才通知 UI 尝试次数，取消等待不虚报重连。

客户端 **60 秒总预算不因重试重置**，请求与退避都计入；Worker 每个请求维持单次 55 秒上限。取消必须中断等待或当前请求，迟到响应不能封存为成功。合法参数兼容与临时恢复不得放宽正文、未来信息、密钥回显、配置或家庭决策检查。

界面应在操作前提示可能重复计费，在自动恢复时显示第几次重连。即使首个请求只收到错误，上游也可能已经消耗额度；自动或手动重试都不能承诺免费。游戏不内置共用密钥或费用额度，服务商默认输出限制、客户端请求上限、请求/响应字节数和超时都不等同于费用封顶。

本轮审计需覆盖精确字段匹配、仅 EFUND 可恢复、400 与 520 交错时全局三次上限、1/2 秒退避、总超时、等待中取消、服务端单次上游调用，以及失败后的 UI/封存状态。模拟测试通过后还需记录公网实测范围；没有完整新证据前不创建最终发布结论。

## 维护步骤

1. 本地完成修改，执行 `npm test`、`npm run check`、`npm run build:pages` 与适用浏览器验收。
2. 审计通过后更新中继：现有 Sites 使用源码同步与归档发布流程；新 Node 主机按 [DEPLOYMENT](DEPLOYMENT.md) 部署和验证，不先更改尚未验证的公开路由。
3. GitHub 发布不携带旧 Sites Git 历史、`.openai` 身份配置、`output`、浏览器临时资料、环境文件或密钥；上传可复现源码、文档、授权素材及工作流。后续更新保留 GitHub `main` 历史，不强制覆盖。
4. 检查 Actions 产物和 Pages 公共 URL；用新浏览器上下文访问，无 cookie、平台认证或测试绕过头，再执行真实模型通关与画像。
5. 检查审计结论，创建 `v0.9.0-rc.1` 预发行版本；保留明确的模拟数据、来源和供应商兼容边界。

复制或自托管时需要把 `PUBLIC_RELAY_ORIGIN` 和 Worker 的 Origin 白名单一起修改，并独立部署转发端；前端单独复制到其他域名不能自动获得原服务跨域许可。
