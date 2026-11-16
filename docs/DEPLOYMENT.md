# 可选的独立 Node 中继部署

当前接入路线是 Paratera 浏览器直连 `https://llmapi.paratera.com/v1/chat/completions`，预填截图中的 `DeepSeek-V3.2-Instruct`；显式自选模型和已有存档连接偏好不变。它不经过本指南的 Node 或现有 Worker，因此不需要先提供 Node 主机。预检已通过，但真实 CLI 和公开 Chrome 对话请求均返回 401；当前待确认的是有效密钥与账号。

Node 源码产物已通过独立审计，保留供可选自托管使用，尚未部署新公网地址。最新 EFUND 本机 Node HTTP 验证完成两年后返回 502，不能宣称更换运行时后已经稳定。`PUBLIC_RELAY_ORIGIN` 仍指向 [现有 Sites 中继](https://life-cfo-investment-lab.sapphirevale1.chatgpt.site)，不影响独立的 Paratera 直连预设。

以下步骤仅适用于选择自托管原固定中继路由时，需要 Node.js 22 主机及 HTTPS 域名，不是当前 Paratera 接入的前置条件。

## 1. 启动服务

在项目根目录运行，无需安装第三方运行依赖：

```sh
node --version
PORT=8080 npm run start:relay
```

等价命令为 `PORT=8080 node scripts/relay-server.mjs`。进程监听 `0.0.0.0`，用主机防火墙或容器端口映射限制后端端口，只经 HTTPS 反向代理对外开放。

| 环境变量 | 默认值 | 允许范围与行为 |
| --- | --- | --- |
| `PORT` / `LIFE_CFO_PORT` | `8080` | 1–65535；非空 `PORT` 优先 |
| `LIFE_CFO_MAX_CONCURRENT` | `8` | 1–64；超过并发上限返回 503 |
| `LIFE_CFO_REQUEST_TIMEOUT_MS` | `60000` | 1000–120000；Node 单次完整请求预算 |
| `LIFE_CFO_SHUTDOWN_GRACE_MS` | `10000` | 0–60000；SIGTERM/SIGINT 停止接收新请求，宽限期后中止未完成请求 |

Node 预算不会修改客户端同次操作的 60 秒总预算，或共享转发处理器的 55 秒上游限制。默认值即可与当前客户端配合；延长 Node 配置不保证客户端继续等待。

服务只提供两个精确路径，不托管网页、源码或其他文件：

- `GET /healthz`、`HEAD /healthz`：就绪时 200；关闭期间为 503。健康检查不调用模型，不能证明上游可用。
- `POST /api/ai`、`OPTIONS /api/ai`：复用 `worker/handler.js` 的固定供应商、Origin、请求校验及有界 SSE 聚合。其他路径返回 404。

```sh
curl --fail http://127.0.0.1:8080/healthz
curl -i -X OPTIONS http://127.0.0.1:8080/api/ai \
  -H 'Origin: https://liaojs2025.github.io' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type'
```

预期分别为 200 与 204。以上检查不含密钥，也不产生模型调用。

## 2. 配置 HTTPS 反向代理

为实际域名配置有效 TLS 证书，将 `/api/ai` 与 `/healthz` 原路径转发到本机 `127.0.0.1:8080`。保留 `Origin`、`Content-Type`、POST 请求体和 OPTIONS 方法，让应用自己生成 CORS 响应；不要额外加通配符 CORS 或平台登录拦截。代理读取超时应覆盖默认 60 秒服务预算，不缓存响应，不记录请求正文或密钥，不对 POST 自动重试。

这里没有写入示例公网域名，避免把占位地址当作已部署服务。取得真实主机后，应先在其 HTTPS 地址验证健康、预检、取消和同模型真实调用，再更新前端的公开中继配置。

## 3. 保持固定路由与密钥边界

服务器供应商清单为 `dist/providers.js` 中的 `PROVIDERS`，只接受已知 provider ID，不允许调用者提供任意上游 URL。独立的 `DIRECT_PROVIDERS`（含 Paratera）不加入 Node 白名单。当前精确允许的 Origin 是 `PUBLIC_RELAY_ORIGIN`、`https://liaojs2025.github.io`、`http://127.0.0.1:4173`、`http://localhost:4173`；Node 没有另一套可放宽的来源配置。

服务不从环境变量注入供应商 API Key，也不内置共享密钥。每位玩家的密钥随单次 HTTPS POST 临时到达中继，再转为固定上游的 Authorization；不写入文件、存档或日志。诊断仅输出固定类别和严格格式标识，不输出原始请求/响应正文。Origin 限制是浏览器边界，不是非浏览器调用者鉴权；调用者仍需自己的有效供应商凭证。

每次中继只发起一次上游请求。客户端最多三次总 fetch 与参数兼容共用预算，可能重复计费；字节数、并发和超时限制不是费用上限。更改宿主环境不会放宽内容、工具调用、未来信息或密钥回显检查。

## 4. 可选 Docker 方式

镜像使用 Node 22，以非 root 用户运行，只复制服务必需文件；`.dockerignore` 排除其余工作区内容，所需目录重新包含的修正已独立复核。当前环境没有可用 Docker daemon，**镜像构建及启动尚未实际验证**。

```sh
docker build -t life-cfo-relay .
docker run --rm --init --name life-cfo-relay \
  -p 127.0.0.1:8080:8080 -e PORT=8080 life-cfo-relay
```

同样需要宿主机或外部入口提供 HTTPS。无需传入服务器模型密钥；不要把个人凭证写入镜像、命令或环境文件。

## 5. 选择自托管并切换中继时的验证

1. 在真实主机完成上述检查，并用现有账号、同一模型比较新路径实际调用；本机成功不等于公网成功。
2. 修改 `dist/providers.js` 的 `PUBLIC_RELAY_ORIGIN` 为已验证的 HTTPS Origin（不含 `/api/ai` 路径），复核 `worker/handler.js` 的固定 Origin 集合。该值是构建配置，不是服务器环境变量；当前仍保留原 Sites 地址。
3. 运行测试、语法检查和独立 audit，重新构建及部署静态前端与中继；用无存档、无平台绕过凭证的浏览器完成二十年模型旅程和画像。
4. 将实际测试范围写回 [RELEASE](RELEASE.md) 与 [AUDIT](AUDIT.md)，通过后再决定发布。健康检查、模拟上游测试和少量成功回合都不替代完整验收。

Node 源码独立审计通过，Docker 镜像构建启动仍未验证。最新 Paratera 默认模型已通过独立代码复核，当前项目共 148 项测试与 15 项语法检查通过，见 [AUDIT](AUDIT.md)；真实公网完整旅程未通过，不创建 release 或 tag。基础游戏可继续从 GitHub Pages 使用本地规则陪练完整游玩。
