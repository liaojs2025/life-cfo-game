# 发布与维护

更新：**2026-11-25 · 三十年投资手记**。主入口为美日三十年旅程，港湾城旧入口继续读取原有存档。版本号沿用 1.0.0。

## 本轮验证与发布状态

| 项目 | 记录范围 |
| --- | --- |
| 新财务与 AI 核心 | 已完成定向测试：两国三十年、共同现金流、费用与归因、破产、存档重放、模型引用及早退复盘。独立结果以 [AUDIT30](AUDIT30.md) 为准。 |
| 浏览器与截图 | 两国各 30 轮、全部 24 张事件卡、提前破产、存档恢复、模型失败重试与 390px 布局均已通过浏览器验收。风险表五行、三种参考和峰谷跳转已验证；全套 215 项测试通过。截图见 [游戏手册](GUIDE.md)。 |
| 本轮真实模型 | DeepSeek Flash 经游戏本机中继实测两次。年度分析成功生成三份配置，进取与稳健对手股票仓位分别为 80% 和 35%。三十年画像的首个回答有一条数值评论未通过原校验。修正后已用离线响应验证历史数字绑定、单条点评来源标记及重放，未追加付费调用。 |
| 本轮 Sites／Pages 发布 | 主分支通过审计后由 [Pages 工作流](https://github.com/liaojs2025/life-cfo-game/actions/workflows/pages.yml) 发布静态游戏；公共模型中继使用同项目的 Sites Worker。 |

旧版服务曾出现 EFUND 中断和 520，上述问题没有因更换游戏入口而被证明消失。历史实测与诊断保留在 [AUDIT](AUDIT.md)，不把旧版短期成功样本推广为长期稳定性保证。

## 运行与构建

| 部分 | 地址或命令 |
| --- | --- |
| 源码 | [liaojs2025/life-cfo-game](https://github.com/liaojs2025/life-cfo-game) |
| 公共前端 | [GitHub Pages](https://liaojs2025.github.io/life-cfo-game/) |
| 主／旧入口 | `/index.html`（三十年）／`/legacy.html`（港湾城） |
| 固定中继 | [Sites](https://life-cfo-investment-lab.sapphirevale1.chatgpt.site) 的 `/api/ai` |
| 本地预览 | Node.js 22+，`npm run dev`，`http://127.0.0.1:4173` |
| 静态构建 | `npm run build:pages` → `output/pages` |
| Worker 构建 | Sites 维护环境 `npm run build` → `dist/server/index.js` |

`build:pages` 复制公共资源并排除 `server` 和隐藏目录。Pages 工作流在 `main` 推送后先运行测试、语法检查与构建，再上传静态产物。Sites Worker 负责固定服务商中继，并携带公共静态资源。

维护步骤：

1. 更新代码和对应规划、数据、审计、素材文档，运行 `npm test`、`npm run check`；检查差异与公开产物不含凭证。
2. 浏览器核验主入口与旧入口，尤其国家进度、封存刷新、提前出局、模型失败、迟到响应和小屏布局；记录测试使用规则、模拟响应还是真实模型。
3. 构建 Pages 与 Worker。若修改 `PUBLIC_RELAY_ORIGIN` 或允许来源，同步固定中继配置，不开放任意 URL 转发。
4. 使用现有授权的 GitHub／Sites 发布流程。部署后核对公开资源与本地版本、两个入口及 `/api/ai` 的协议，再记录提交、部署版本与可验证链接。
5. 只有明确授权且设定调用预算时才做真实付费验证；保留失败次数，不把 HTTP 200 直接算作有效模型决定。

## 服务商与额度

| 服务 | 固定 HTTPS 上游 | 默认模型与参数 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/chat/completions` | `deepseek-flash`；关闭 thinking。 |
| EFUND | `https://aigc.efunds.com.cn/v1/chat/completions` | `deepseek-v4-flash`；同网关可自选 `glm-5.3-flash`，这两个预设关闭 thinking。 |
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4.1-mini`。 |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | `glm-4.7-flash`；thinking disabled、temperature 1。 |
| Kimi | `https://api.moonshot.cn/v1/chat/completions` | `kimi-k3.1-pro`；reasoning_effort low，不传 temperature 或 thinking。 |

EFUND 单次年度／复盘上限 **4,000／6,000 token**，其他服务 **2,500／3,500 token**。Kimi 推理与回答共用输出预算。OpenAI 和 EFUND GPT/o 模型使用 `max_completion_tokens`，其他使用 `max_tokens`；参数兼容不能移除额度或提高推理预算。

客户端单次操作最多三次请求，共用六十秒总时限；Worker 每次仅调用上游一次，五十五秒时限。EFUND 精确识别的非 JSON 520、响应头前重置和流读取中断可在同一预算内按 4／8 秒等待恢复；其他服务不照搬这类恢复。明确不支持 `response_format`／`temperature` 的 400 可进行一次参数兼容，同样计入三次总数。真实内容、配置、工具调用、截断或密钥回显错误不会自动改写为成功。

请求上限 160,000 bytes；普通／聚合 JSON 响应上限 200,000 bytes；EFUND SSE 传输上限 2,000,000 bytes。密钥仅在浏览器内存和单次固定转发期间使用，不记正文日志、不持久化。浏览器向中继的凭证放在 JSON 请求体，避免站点认证头冲突。当前允许来源为项目 Sites、`https://liaojs2025.github.io` 和两个指定本地预览地址。

重试可能重复计费，输出上限不是整次操作的累计费用上限。项目没有共用密钥，也不在失败时自动换服务商。

## 存档与兼容

三十年主入口按国家使用 `life-cfo-atlas-1-` 存档，新账本 `version: 4`。恢复时从种子与封存配置重放，并核对历史和终态；密钥不进入存档或连接偏好。新主玩法暂不提供文件导入、导出或跨设备同步。

旧入口保留原 `life-cfo-save-v3` 家庭双账本、财务规则和画像。不要因为主入口升级覆盖旧档，也不要把旧版费用、房车、生活值或 2026 模拟收益套用到三十年账本。共用传输导出修改必须回归两个入口。

## 历史发布索引

- [v1.0.0 正式 Release](https://github.com/liaojs2025/life-cfo-game/releases/tag/v1.0.0)：旧版港湾城二十年。
- [2026-11-18 EFUND 参数实现](https://github.com/liaojs2025/life-cfo-game/commit/ba0d25180424afccaeb2451bf0814fa0512b5881) 与 [对应 Pages 工作流](https://github.com/liaojs2025/life-cfo-game/actions/runs/44223390230)：属于旧版已发布记录。
- 更早的接口试验、恢复结果、真实调用范围与失败证据见 [AUDIT](AUDIT.md) 和 Git 历史。新财务及浏览器证据见 [AUDIT30](AUDIT30.md)。

接口依据保留于 [DeepSeek 文档](https://api-docs.deepseek.com/api/create-chat-completion/)、[OpenAI 模型文档](https://developers.openai.com/api/docs/models/gpt-4.1-mini)、[智谱文档](https://docs.bigmodel.cn/)、[Kimi 模型列表](https://platform.kimi.com/docs/models.md) 与 [推理参数](https://platform.kimi.com/docs/guide/use-thinking-models.md)。

作者：[liaojs2025](https://github.com/liaojs2025)
