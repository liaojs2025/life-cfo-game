# v1.0.0 正式版 · 发布与维护

更新：2026-11-17

v1.0 保留二十年双账本玩法，加入 DeepSeek、EFUND、OpenAI 三服务选择，精简玩家文案，并让 AI 分析更具体地联系配置与家庭选择。

## 发布记录

| 项目 | 本次结果 |
| --- | --- |
| 版本 | `1.0.0` 正式版 |
| GitHub 提交与 Release | 实现提交 [4b96d6e](https://github.com/liaojs2025/life-cfo-game/commit/4b96d6e28864603c8287166d76344154a9a5652b) · [v1.0 正式版](https://github.com/liaojs2025/life-cfo-game/releases/tag/v1.0.0) |
| Pages 部署 | [工作流 44015366937](https://github.com/liaojs2025/life-cfo-game/actions/runs/44015366937) 构建及部署成功；五个核心脚本与审计源码哈希相同 |
| Sites 中继部署 | Sites 版本 15 已发布；源码 `dc38fa3eb3e90ca7a0e5c528779ab92558064444` |
| 本地检查与浏览器验证 | 158 项测试、14 项语法检查通过；完整二十年规则流程、双账本结算与刷新恢复、390px 布局通过 |
| 真实模型调用范围 | DeepSeek / deepseek-flash：本机两次真实年度分析及结算通过，公网真实画像通过；EFUND、OpenAI 完成协议测试 |

提交作者及提交者均为 `liaojs2025`。正式版本标签为 `v1.0.0`，Release 标题为“v1.0 正式版”。历史验证与故障调查见 [AUDIT](AUDIT.md)。

本次按限额共发起 **6 次真实请求后停止**：两次年度成功、一次测试脚本中止的画像、两次旧校验未接纳的画像、一次修正后的公网画像成功。公网画像输入 6,966、输出 858 token；基于已完整执行的二十年规则测试旅程生成，并已核对事实引用。此次未运行二十年全部由大模型参与的付费通关。

## 部署结构

| 部分 | 地址或命令 |
| --- | --- |
| 源码 | [liaojs2025/life-cfo-game](https://github.com/liaojs2025/life-cfo-game) |
| 游戏入口 | [GitHub Pages](https://liaojs2025.github.io/life-cfo-game/) |
| 公共中继 | [Sites 站点](https://life-cfo-investment-lab.sapphirevale1.chatgpt.site) 的 `/api/ai` |
| 本地预览 | `npm run dev`，`http://127.0.0.1:4173` |
| 静态构建 | `npm run build:pages` → `output/pages` |
| 中继构建 | Sites 维护环境运行 `npm run build` → `dist/server/index.js` |

Pages 托管静态前端，Sites 运行固定转发。三个服务都经中继调用：

| Provider | 固定上游 | 默认模型 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/chat/completions` | `deepseek-flash` |
| EFUND | `https://aigc.efunds.com.cn/v1/chat/completions` | `gpt-4o` |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4.1-mini` |

## 发布步骤

1. 运行 `npm test`、`npm run check` 和 `npm run build:pages`；按变更范围检查界面、账本与接口，由独立 audit agent 复核关键逻辑。
2. 检查提交内容，排除密钥、环境文件、`.openai`、`output`、浏览器临时数据与生成的服务器产物。
3. 更新 Sites 中继；向现有 GitHub `main` 提交，等待 Actions 完成静态构建和 Pages 部署。
4. 检查公开页面、资源和本次涉及的接口，记录实际结果与模型调用范围。
5. 创建 `v1.0.0` 正式 Release，并补齐本页发布记录。

复制到其他域名时，同步配置 `PUBLIC_RELAY_ORIGIN` 和中继 Origin 白名单。站点身份文件不随公开源码分发。

## 连接与存档

浏览器发送固定 provider ID、临时密钥和游戏请求；中继仅转发到对应的 HTTPS 上游。密钥只在请求期间使用，不保存、缓存或记录到正文日志。允许来源包括现有 Sites、`https://liaojs2025.github.io` 和本地预览地址。

切换服务清空旧密钥，已有封存决定保持不变。v1.0 沿用 v3 存档、双账本和历史画像；刷新后恢复已封存结果，后续模型请求需重新填写密钥。

## 请求预算

单次年度请求输出预算 **2,500 token**，画像请求 **3,500 token**；重试会发起新的请求，这不是整次操作的累计输出限制。DeepSeek 使用 `max_tokens` 并关闭 thinking；OpenAI 和 EFUND 的 GPT/o 系模型使用 `max_completion_tokens`，EFUND 其他模型使用 `max_tokens`。中继为未带额度的旧客户端补上 2,500 token，参数兼容与恢复继续保留输出额度。

同次操作最多 3 次客户端请求，包含首次、参数兼容和符合条件的临时恢复；客户端共用 60 秒总预算，中继每次只调用上游一次，55 秒超时。取消可中断等待和请求。

请求正文上限 160,000 bytes；普通或聚合 JSON 响应上限 200,000 bytes；EFUND SSE 原始传输上限 2,000,000 bytes。EFUND 流在中继聚合为普通 JSON，其他服务使用各自兼容参数。

API 按服务商计费，自动恢复或手动重试都可能重复计费。游戏不提供共用密钥。参数兼容只处理服务商明确拒绝的可选参数；认证、额度或内容错误按实际原因提示。

作者：[liaojs2025](https://github.com/liaojs2025)

接口依据：[DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[DeepSeek thinking 参数](https://api-docs.deepseek.com/guides/thinking_mode/)、[OpenAI GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)。
