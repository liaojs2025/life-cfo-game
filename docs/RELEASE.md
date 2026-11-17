# v0.9 预发行与部署维护

当前版本：`0.9.0-rc.1` · 更新：2026-11-17

本页集中记录现行部署结构、操作步骤与验证范围。功能和数据边界分别见 [PRODUCT](PRODUCT.md)、[DATA](DATA.md)，独立检查见 [AUDIT](AUDIT.md)。

## 部署结构

| 部分 | 位置与用途 |
| --- | --- |
| 源码 | [liaojs2025/life-cfo-game](https://github.com/liaojs2025/life-cfo-game) |
| 游戏入口 | [GitHub Pages](https://liaojs2025.github.io/life-cfo-game/)，纯静态前端 |
| 公共转发 | [Sites 站点](https://life-cfo-investment-lab.sapphirevale1.chatgpt.site) 的 `/api/ai`，无需平台登录 |
| 唯一上游 | `https://aigc.efunds.com.cn/v1/chat/completions`，默认 `gpt-4o`；自选模型须为账号已开通的 ID |
| 本地预览 | `npm run dev`，`http://127.0.0.1:4173` 同时提供网页与固定转发 |

GitHub Pages 不运行服务器代码。`npm run build:pages` 输出 `output/pages`，排除服务端产物与站点配置；所有网页资源使用相对路径。Sites 维护环境的 `npm run build` 使用本机 `.openai/hosting.json`，生成含网页资源及转发处理器的 `dist/server/index.js`。站点身份文件不随公开源码分发。

## 更新与发布步骤

1. 在本地修改并更新适用文档；执行 `npm test`、`npm run check`、`npm run build:pages`。界面或协议变化补做浏览器验证，关键规则由独立 audit agent 复核。
2. 检查待提交内容：不上传密钥、环境文件、`.openai`、`output`、浏览器临时资料或生成的服务器产物。向现有 GitHub `main` 正常提交，保留历史，不强制覆盖。
3. 涉及中继时，在已有 Sites 维护环境构建，通过 Sites 源码同步与归档发布更新现有项目。只改变前端不能更新公共中继。
4. GitHub Actions 在 `main` 更新后运行测试、语法检查、静态构建和 Pages 发布。仓库 Settings → Pages 的来源应为 GitHub Actions；工作流不需要模型密钥。
5. 确认 Actions 完成、Pages 页面和资源可访问；用全新浏览器上下文检查公共中继，不携带平台 cookie 或测试绕过头。模型实测必须区分新局、续玩、模拟接口、真实请求与失败恢复。
6. 将实际提交、部署结果和验证范围补到本页。完整公网模型旅程与画像未验收前，不将版本标为最终完成或创建正式 release/tag。

复制到其他域名时，必须同时调整 `PUBLIC_RELAY_ORIGIN` 与 Worker 的 Origin 白名单，并独立验证；复制静态前端不会自动获得原中继的跨域许可。

## 中继与凭证边界

浏览器向中继发送 `{provider, apiKey, request}`；中继只接受 `efund`，将本次密钥转为固定 HTTPS 上游的 Bearer 认证。它不接受任意 URL、不跟随重定向，不记录凭证、请求正文或原始响应正文，不保存或缓存密钥与回答。错误仅返回固定类别和受限诊断字段。

客户端密钥只在页面内存，刷新需重填；端点与模型偏好可保存。v3 存档、已封存结果和画像继续核验恢复，旧非 EFUND 偏好仅迁回连接默认值，不改账本。导出不含密钥或连接偏好。

允许的浏览器来源是当前 Sites、`https://liaojs2025.github.io` 及两个本地预览地址。Origin 不包含路径，所以同账户的其他 Pages 项目也属于该来源；Origin 白名单不是非浏览器鉴权。游戏不提供共用密钥或费用额度。

EFUND 的浏览器预检没有所需跨域许可，当前保留中继。上游使用 SSE，`worker/stream.js` 有界聚合为普通 Chat Completions JSON，浏览器接口仍为非流式；若上游直接返回 JSON，在同一次响应中读取。

| 限制 | 当前设置 |
| --- | --- |
| 请求正文 | 160,000 bytes |
| 普通或聚合 JSON 响应 | 200,000 bytes |
| SSE 原始传输 | 2,000,000 bytes |
| 单次中继超时 | 55 秒，覆盖完整接收与聚合 |
| 客户端操作预算 | 60 秒，包含全部请求和退避，不重置 |

中继不额外注入 `max_tokens` 或 `max_completion_tokens`，输出额度采用服务商设置。次数、字节与超时限制不是费用上限。

## 有限恢复

一次操作最多 **3 次客户端请求（含首次）**；Worker 每次只请求上游一次，不叠加服务端重试。

| 可恢复情况 | 精确条件 |
| --- | --- |
| 可选参数兼容，最多一次 | HTTP 400 明确不支持 `response_format` 或 `temperature` |
| 网关非 JSON 520 | 受控 EFUND 中继 HTTP 502，`code=upstream_error`、`upstreamStatus=520`、`upstreamReason=non_json` |
| 响应头前连接重置 | 受控 EFUND 中继 HTTP 502，`code=upstream_connection`、`upstreamReason=connection_reset`、`upstreamPhase=headers` |

后两类按已用请求次数退避 1 秒或 2 秒，与参数兼容共用三次额度及原总预算。认证、权限、额度、DNS/TLS、未知网络错误、正文中断、超时、JSON 520 或内容核验拒绝不触发这类恢复。取消在等待和请求时均有效，迟到回答不能封存。

界面预告可能重复计费，并只在实际发出新请求时更新尝试次数。即使前一次返回错误，上游也可能已计费；自动恢复与手动重试都不承诺免费，不宣称已解决供应商故障根因。

## 当前验证范围

2026-11-17 的本机 Chrome 实测完成 **20 个真实 EFUND/gpt-4o 年度与真实模型画像**，共 24 次旅程请求，不含额外诊断。过程中第 9 年内容拒绝、第 16 年连接重置、首次画像结构拒绝后均显式恢复，已经封存的年度结果保持不变。因此这是带恢复的完整旅程，不是无故障一次通关。

独立重放已核对双方账本和封存；画像绑定五个真实决策年度。刷新恢复、密钥不落盘和手机无页面横向溢出完成核验。本地证据为 `output/playwright/v09-efund-diagnostic-local-result.json` 及对应 `-journey.json`，这些临时产物不进入公开发布。

本轮清理后的独立审计确认 **148 项测试、14 项语法检查通过**。构建与公开部署由维护流程继续执行；本机结果不能证明公网链路永久稳定，历史公网失败不能被预检成功或一次请求成功替代。精确审计范围见 [AUDIT](AUDIT.md)。

## 2026-11-17 同步结果

- 最新实现、六项冗余文件删除及三图手册已由 `liaojs2025` 提交：[73dc439](https://github.com/liaojs2025/life-cfo-game/commit/73dc4391af7763be785e0a885299ecb56654d762)。GitHub 已确认作者和提交者均归属该账号。
- [Pages 工作流 44009703158](https://github.com/liaojs2025/life-cfo-game/actions/runs/44009703158) 的测试、构建及部署全部成功；公共 Sites 中继已部署版本 14，源码 `7ce972a1e1b091038b198250862b3d8cca03dfcb`。
- 公开 Pages 的 `app.js`、`ai.js`、`providers.js`、`engine.js`、`session.js` 哈希与已审源码一致；手册及三张图片均 HTTP 200。规则模式已用浏览器实际完成首年并检查完整复盘。
- **公网 AI 两次首轮验收均未通过。** 全新 Chrome、EFUND/gpt-4o、无平台辅助认证：第一次 1 次 POST 返回 502，界面报告响应无法解析；第二次共 3 次 POST，均为 `502 / upstream_error / upstreamStatus=520 / non_json`，触发了有界恢复后停止。共计 4 次请求，双方均未完成首年；没有验证到公网模型结算、刷新恢复或画像。
- 浏览器请求未携带模型 Authorization、Cookie 或平台绕过头，未出现页面脚本错误。失败结果保留于本地 `latest-public-smoke-first-result.json`、`latest-public-smoke-result.json`，不上传真实调用产物。未放宽解析或内容核验来使检查通过。

本次完成代码同步、文档清理和网站更新；公开模型链路仍有失败，不能宣称已经稳定可用。规则陪练可完整游玩，本机完整模型旅程证据与公网失败分开保留；未创建最终 release/tag。
