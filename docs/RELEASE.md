# v0.9 预发行与部署

版本：`0.9.0-rc.1`。发布前须由独立 audit agent 审核代码、媒体、配置隔离和真实模型通关；公开部署后再核验匿名浏览器访问及跨域 AI 链路。两个阶段的证据分别记录于 `AUDIT.md`，准备好工作流不等于发布成功。

## 部署结构

- GitHub 仓库：`liaojs2025/life-cfo-game`。
- 游戏前端：GitHub Pages，项目路径 `/life-cfo-game/`，所有图片和模块均用相对路径。
- AI 转发：`https://life-cfo-investment-lab.sapphirevale1.chatgpt.site/api/ai`，必须设为任何访客可访问，不能依赖平台登录或测试绕过凭证。
- 本地：`npm run dev` 在 `127.0.0.1:4173` 同时服务网页和 AI 转发。

GitHub Pages 只托管静态网页，无法运行此转发处理器。`npm run build:pages` 输出 `output/pages`，自动排除 Worker、站点配置和闲置封面。GitHub Actions 工作流在 `main` 更新时执行测试、语法检查、静态构建与部署。首次需在仓库 Settings → Pages 启用 GitHub Actions 来源（或使用 GitHub API 配置 `build_type: workflow`）。工作流无模型密钥；自动检查均用可复现模拟接口。

## 转发契约

`dist/providers.js` 是公开的固定上游清单。浏览器 POST `{provider, apiKey, request}`，转发服务仅向对应 HTTPS 地址发送临时 Bearer 密钥，不接受任意 URL、重定向、工具或流式请求。凭证不写入日志、缓存、磁盘或存档。不额外注入 `max_tokens` 或 `max_completion_tokens`，输出额度采用服务商默认设置；响应大小与超时限制不构成费用上限。密钥属于每位玩家自己的服务商账号，游戏不提供共用密钥、费用额度或费用代付。

精确允许来源是当前游戏服务域名、`https://liaojs2025.github.io` 及两个本地预览地址。Origin 不含路径，因此同账户的其他 GitHub Pages 项目也属于这个浏览器信任来源；Origin 白名单不是面向非浏览器调用者的鉴权或防滥用方案。转发服务不自带供应商密钥，即使非浏览器调用也必须提供调用者自己的有效凭证。

错误响应仅可附实际上游 HTTP 状态及固定枚举原因，不包含供应商原始正文或日志凭证，用于区分临时容量、额度、参数与连接问题。

自定义且未列入固定清单的兼容端点由浏览器直连，要求服务商支持 CORS；不能保证任意第三方接口兼容。六家品牌的八条固定路由提供同一种转发协议，但真实端到端验收覆盖本地环境中现有的 EFUND `gpt-4o` 账号，其余服务以协议与异常模拟验证，不宣称验证了不存在的账号权限。

## 维护步骤

1. 本地完成修改，执行 `npm test`、`npm run check`、`npm run build:pages` 与适用浏览器验收。
2. 审计通过后，更新转发 Worker；使用 Sites 的源码同步与归档发布流程，保持 `.openai/hosting.json` 对应项目不变。
3. GitHub 发布不携带旧 Sites Git 历史、`.openai` 身份配置、`output`、浏览器临时资料、环境文件或密钥；上传可复现源码、文档、授权素材及工作流。后续更新保留 GitHub `main` 历史，不强制覆盖。
4. 检查 Actions 产物和 Pages 公共 URL；用新浏览器上下文访问，无 cookie、平台认证或测试绕过头，再执行真实模型通关与画像。
5. 检查审计结论，创建 `v0.9.0-rc.1` 预发行版本；保留明确的模拟数据、来源和供应商兼容边界。

复制或自托管时需要把 `PUBLIC_RELAY_ORIGIN` 和 Worker 的 Origin 白名单一起修改，并独立部署转发端；前端单独复制到其他域名不能自动获得原服务跨域许可。
