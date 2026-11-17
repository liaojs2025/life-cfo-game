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

Pages 托管静态前端，Sites 运行固定转发。五个服务都经中继调用：

| Provider | 固定上游 | 默认模型 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/chat/completions` | `deepseek-flash` |
| EFUND | `https://aigc.efunds.com.cn/v1/chat/completions` | `deepseek-v4-flash` |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4.1-mini` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | `glm-4.7-flash` |
| Kimi / Moonshot | `https://api.moonshot.cn/v1/chat/completions` | `kimi-k3.1-pro` |

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

EFUND 单次年度/画像输出上限为 **4,000 / 6,000 token**；其他服务仍为 **2,500 / 3,500 token**。重试会发起新的请求，这不是整次操作的累计输出限制。DeepSeek 使用 `max_tokens` 并关闭 thinking；OpenAI 和 EFUND 的 GPT/o 系模型使用 `max_completion_tokens`，EFUND 其他模型使用 `max_tokens`。EFUND 的 deepseek-v4-flash 同时关闭 thinking，避免思考占满正文额度。中继为未带额度的旧客户端补上对应服务的年度上限（EFUND 4,000，其余 2,500），参数兼容与恢复继续保留输出额度。

同次操作最多 3 次客户端请求，包含首次、参数兼容和符合条件的临时恢复；客户端共用 60 秒总预算，中继每次只调用上游一次，55 秒超时。取消可中断等待和请求。

EFUND 精确归类的非 JSON 520、响应头前连接重置、SSE 读取中断，首次失败后等待 4 秒，第二次失败后等待 8 秒再恢复；等待同样计入原六十秒预算。没有增加调用次数，已产生的模型输出仍可能计费。正文格式、UTF-8、长度超限、未正常结束、工具调用、密钥回显及决策规则拒绝均不套用这一恢复。持续 520 可附经过格式和凭证过滤的 Cloudflare Ray 编号，供定位上游链路使用。

请求正文上限 160,000 bytes；普通或聚合 JSON 响应上限 200,000 bytes；EFUND SSE 原始传输上限 2,000,000 bytes。EFUND 流在中继聚合为普通 JSON，其他服务使用各自兼容参数。

API 按服务商计费，自动恢复或手动重试都可能重复计费。游戏不提供共用密钥。参数兼容只处理服务商明确拒绝的可选参数；认证、额度或内容错误按实际原因提示。

作者：[liaojs2025](https://github.com/liaojs2025)

接口依据：[DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/)、[DeepSeek thinking 参数](https://api-docs.deepseek.com/guides/thinking_mode/)、[OpenAI GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)。

## v1.0 维护更新 · GLM 与 Kimi

新增智谱 `glm-4.7-flash` 与 Kimi `kimi-k3.1-pro`，版本号保持 `1.0.0`。GLM 使用非思考模式；Kimi 使用低强度推理，推理与回答共用现有 token 预算。新接口仅做协议模拟验证，本轮无付费调用。

接口依据：[智谱 GLM](https://docs.bigmodel.cn/)、[Kimi 当前模型](https://platform.kimi.com/docs/models.md)、[Kimi 推理参数](https://platform.kimi.com/docs/guide/use-thinking-models.md)。

本次中继已更新为 Sites 版本 16；源码 `8c4c0626d6cbe08fec7145203c19e38f5cfde7c5`，160 项测试及 14 项语法检查通过。

## v1.0 维护更新 · EFUND Flash 与输出额度

EFUND 默认模型改为 `deepseek-v4-flash`，并对该模型关闭 thinking；年度输出上限提高到 4,000 token，画像提高到 6,000。其他服务保持原额度。设置窗口随服务显示相应上限；已有自选模型与封存结果保留，重新选择 EFUND 可填入新预设。

按用户给定顺序验证：`deepseek-flash` 不在当前账号模型列表内且请求返回 HTTP 403；`deepseek-v4-flash` 原先默认思考耗尽 2,500 token 后返回 `finish_reason=length`、正文为空；`glm-5.3-flash` 首次在读取正文阶段超过 55 秒。对照试验确认 V4 Flash 关闭思考后可完成回答；另一次完整回答曾因配置不合计 100% 被拒绝，因此补充了输出前分别核对双方加总的提示，程序仍严格校验，不改写模型决定。

最终新配置本机连续 6/6 次首次请求通过：脚本覆盖第 1、9、16 年及通关画像，浏览器覆盖真实年度结算及画像，耗时 12.9–14.3 秒。浏览器同时验证服务切换、额度显示、双账本结算、刷新封存、密钥不入存档及 390px 布局。独立审计通过 164 项测试及 14 项语法检查。测试使用合成游戏账户，画像基于已完成的规则测试旅程；小样本不代表长期或高并发稳定，公网验证另行记录。

发布结果：本地 Worker / Pages 均构建成功，95 个源码及构建文件凭证扫描通过。用户已明确授权发布及两次公网真实验证。

- Sites 中继版本 **17** 发布成功，源码 `6bde3327170d1c40084ad660f30cc1e23c1a3edb`；公开配置与本地一致。
- GitHub 实现提交 [026ccd5](https://github.com/liaojs2025/life-cfo-game/commit/026ccd50002eab10531873e5e8e6b7655d6f0452)，[Pages 工作流 44037337761](https://github.com/liaojs2025/life-cfo-game/actions/runs/44037337761) 成功；公开 `providers.js`、`ai.js`、`app.js` 与本地源码逐字一致。
- 两处实现提交的作者和提交者均为 `liaojs2025 <244429257+liaojs2025@users.noreply.github.com>`。
- 公网真实浏览器验收：年度决策 **10.092 秒**、画像 **10.922 秒**，两次均 HTTP 200、首次通过游戏校验；请求分别携带 4000/6000 上限及关闭思考参数。完成年度双账本结算、刷新封存、偏好恢复、密钥不入存档及 390px 布局验证，页面异常为零。浏览器未附加 Cookie、Authorization 或平台辅助认证头。
- 公网调用严格止于授权的两次；修正后累计本机与公网 **8/8** 个样本通过，无重试。画像使用已完成的规则测试旅程，不代表二十年全由模型决策，也不保证长期或高并发零失败。脱敏结果在本地 `output/playwright/efund-browser-public-result.json`，不包含密钥或请求正文。

## v1.0 维护更新 · EFUND 连接恢复与页面重绘

用户反馈后的生产日志记录了北京时间 **2026-11-17 15:25:52–15:28:33** 的 18 次上游 520，均为非 JSON 网关响应，经过 NRT 节点；站点中继相应返回 502，执行结果为正常错误处理，未出现 Worker 崩溃。示例上游 Ray：`a5bd04db6ec18685-NRT`。这是上游链路实际失败，不能由前端提高 token 额度消除。[Cloudflare 520 说明](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-5xx-errors/error-520/)解释了这一网关状态的含义。

本轮五次相同输入的公开中继/本机直连配对请求均收到 HTTP 200，但其中两次模型回答被内容校验拒绝。随后六个相邻年度单次请求中，五次通过；第 4 次在北京时间 15:56:56 被中继记录为 `ai_stream_failure / read`，传输途中断线被旧代码归为格式错误。修复将这种精确读中断归为连接错误，并加入原有有界恢复；原始回答不被保存或自动修正。两组结果分别统计，未将 HTTP 成功等同于有效决定，也不把此前八次成功扩展为长期稳定结论。

频闪复现来自请求状态变化调用整页 `innerHTML` 重建。浏览器注入两次 520 后成功时，旧版在游戏与账本页面各重建三次，丢失控件焦点、重建图片或重启图表；新实现只更新同桌、画像、结算控件及必要的自动配置区域。手动输入、图表和图片节点、滚动与焦点保留；重复渲染同时核对输入和实际 DOM，避免误跳过滑块等局部更新。画像断开或选择规则复盘会清除旧请求错误，迟到结果仍受请求代际保护。

独立审计通过 175 项测试、14 项语法检查与差异检查；Chrome 五场景修复后全部通过。Worker / Pages 构建和 96 个源码及产物文件的密钥扫描通过。持续的 EFUND 上游故障超出本项目控制；本次修复改善瞬时故障恢复和错误定位，不能保证 EFUND 永不出现 520。部署及发布后的连续实测结果如下。

本轮修复部署：Sites 版本 **18** 已发布，源码 `23d37ca5a4c2824c52b63aef05258c46c0e24083`；GitHub 实现提交 [deb660c](https://github.com/liaojs2025/life-cfo-game/commit/deb660c95de4c0cfe0ed8f1253833587c58f0b90)，[Pages 工作流 44045663389](https://github.com/liaojs2025/life-cfo-game/actions/runs/44045663389) 成功。两处作者和提交者均为用户 `liaojs2025` 账号。

版本18的公开浏览器连续旅程重现故障：前两年度有效决定分别耗时11.315秒、6.580秒；第三年度流式读取中断，随后两次恢复均收到上游520；第四年度首个请求仍为520，验证工具达到预设六次调用上限后阻止新增付费请求。总计六次真实调用中只有两次生成有效决定；测试明确点击规则后备完成其余两年，不计作模型成功。等待过程根节点重绘为0，页面异常为0，刷新封存、密钥不入存档及390px布局检查通过。脱敏记录在本地 `output/playwright/efund-recovery-public-result.json`。因此仅延长等待和重试不能宣称解决了持续520。

随后将受限非流式备用实验发布为 Sites 版本19（源码 `a6e4c2307a16d11bd3ed14bfd322b678cbb59eb3`），仅用于核验相同输入在两种传输下的差异。实验先通过179项测试与14项语法检查；这些代码检查不作为稳定性证据。北京时间16:46:42–16:47:40，共六次真实公网请求，禁用自动重试并保持相同模型、输入和4000输出上限：

| 顺序 | 传输 | 结果 | 耗时 |
| --- | --- | --- | --- |
| 1 | SSE | HTTP 200，有效决定 | 9.447秒 |
| 2 | JSON | HTTP 200，有效决定 | 7.960秒 |
| 3 | JSON | 上游520，中继502 | 6.758秒 |
| 4 | SSE | 上游520，中继502 | 3.640秒 |
| 5 | SSE | HTTP 200，有效决定 | 7.928秒 |
| 6 | JSON | HTTP 200，有效决定 | 6.703秒 |

两种传输各2/3成功，未证明JSON更稳。两次错误的安全字段均为 `code: upstream_error`、`upstreamStatus: 520`、`upstreamReason: non_json`；上游Ray分别为 `a5bd77feeef3e370-NRT`、`a5bd783c0ab5e370-NRT`，生产日志对应北京时间16:47:12.620、16:47:19.259。中继记录的正文类型为text、分类为cloudflare。请求正文的SHA256全部相同，未将密钥、模型回答或家庭正文写入诊断。脱敏记录在本地 `output/playwright/efund-transport-compare-result.json` 与对应 `budget` 文件，总调用数严格为六次。

最终撤回自动JSON切换，保留版本18中有证据支持的频闪修复、流读取中断归类、4/8秒有界恢复与安全诊断。未继续盲目增加重试、token额度或等待时间，也未暗中改用其他模型。**频闪已修复；EFUND上游520的持续稳定性尚未解决，需要接口方根据上述时间与Ray排查网关链路。** 已观察到的是中继收到的上游非JSON 520，不据此推断具体源站配置、配额或内部模型故障。

收敛后的最终代码重新通过175项测试、14项语法检查及差异检查；运行代码与已完成真实浏览器频闪验收的版本18逐字一致。所有源码提交继续使用用户 `liaojs2025` 的作者与提交者身份。
