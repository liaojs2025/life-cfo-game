# 发布与维护

**v2.0 · 投资年代记 · 2026-11-25**

[在线游戏](https://liaojs2025.github.io/life-cfo-game/) · [v2.0 正式发行](https://github.com/liaojs2025/life-cfo-game/releases/tag/v2.0) · [图文手册](GUIDE.md)

美日两条历史线共有 80 张独立照片、80 篇开年产业侧记和 80 句收盘锐评。简版和完整版重叠年份共用同一档案。每期开局可读三项历史宏观数据，日本早期缺少同期失业率版本的年份显示美元兑日元。已结算的 v1 账本和封存决定按其签发时的信息重放。

### 共享统计

Pages 从固定 Sites Worker 的 `/api/community` 读写统计；D1 绑定名为 `DB`。每次页面加载提交一个随机访问编号，同一请求重试按一次计。匿名终局以国家、路线和一局的随机种子判重。服务端复用游戏的七资产、家计、换仓和费用规则复核年度配仓，再保存总结。破产单独记录。

公开接口返回访问总量、通关总数、最近登记的四份匿名成绩和全库完整通关的前十名。排名按原始扣费前组合累计回报降序，同回报按服务器登记时间升序，再按局摘要稳定排序。`0001_finish_leaderboard.sql` 增加排名索引和可空的设备结束时刻；旧行可直接按原始回报入榜，显示登记时间。浏览器提交的种子、年度权重不存入结果表；公开列表不返回访问编号、种子、模型分析或密钥。浏览量反映页面打开和刷新，不能换算为独立人数。数据库 SQL 与迁移元数据在 `drizzle/`，本地预览使用独立 SQLite 数据库。

### 验收范围

从游戏主页实际游玩四条路线共 100 次结算，逐期核对宏观读数、配图和收盘点评。浏览器验证了两个独立访问者看到同一统计、网络中断后补传一次、v1 模型封存决定继续结算和手机布局。财务回放测试核对各路线净资产、费用与组合回报，并校验提前破产的通关计数。

252 项自动测试通过。各开局指标的来源、发布时间和历史修订处理可按年份复核。

[新闻档案](ATLAS-PRESS.md) · [开年数据口径](OPENING-DATA.md) · [产业侧记来源](ERA-NOTES.md) · [v2.0 独立审计](V2-AUDIT.md)

## 历史发布

**v1.0 正式版 · 投资年代记 · 2026-11-25**

[在线游戏](https://liaojs2025.github.io/life-cfo-game/) · [Pages 发布工作流](https://github.com/liaojs2025/life-cfo-game/actions/workflows/pages.yml) · [游戏手册](GUIDE.md)

美国和日本各有 10 年与 40 年路线。四份存档分别保留。2026 使用到 9 月 30 日的实际观察。新闻 80 篇、实际使用历史照片 51 张。原三十年及港湾城均保留历史入口。

### v1.0 验收

全套 238 项自动化测试通过，两个发布构建及语法检查通过。

- 账本测试涵盖七类真实资产、两位对手独立的年度决定、三方费用归因、日元折算、2009 年日本本土行业切换、年内收支以及破产与重放。
- Chrome 从正常入口通过美国／日本各两条完整路线，共 100 次实际结算。逐期检查上一年照片解码、新闻日期、7 个配仓控件、结算、刷新与终局。简版和完整版终局的年频样本分别为 9 年和 39 年，另保留 2026 年内曲线。
- 本轮模型验收使用模拟响应验证请求与封存协议；未消耗用户的付费模型额度。
- 逐年行情与代理见 [数据记录](ATLAS-DATA.md)。历史事实、日期与图片许可见 [新闻档案](ATLAS-PRESS.md)。独立验收见 [审计记录](ATLAS-AUDIT.md)。

## 运行与构建

| 部分 | 地址或命令 |
| --- | --- |
| 源码 | [liaojs2025/life-cfo-game](https://github.com/liaojs2025/life-cfo-game) |
| 公共前端 | [GitHub Pages](https://liaojs2025.github.io/life-cfo-game/) |
| 主／旧入口 | `/index.html`（四路线）／`/atlas30.html`（三十年）／`/legacy.html`（港湾城） |
| 固定中继 | [Sites](https://life-cfo-investment-lab.sapphirevale1.chatgpt.site) 的 `/api/ai` |
| 本地预览 | Node.js 22+，`npm run dev`，`http://127.0.0.1:4173` |
| 静态构建 | `npm run build:pages` → `output/pages` |
| Worker 构建 | 安装构建依赖 `npm ci` 后执行 `npm run build` → `dist/server/index.js` |

`build:pages` 复制公共资源并排除 `server` 和隐藏目录。Pages 工作流在 `main` 推送后先运行测试、语法检查与构建，再上传静态产物。Sites Worker 负责固定服务商中继，并提供同版前端。镜像中的历史图片由路径白名单指向 GitHub Pages 的同版公开照片。

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

## 三十年旧版验收记录

| 项目 | 记录范围 |
| --- | --- |
| 新财务与 AI 核心 | 已完成定向测试：两国三十年、共同现金流、费用与归因、破产、存档重放、模型引用及早退复盘。独立结果以 [AUDIT30](AUDIT30.md) 为准。 |
| 浏览器与截图 | 两国各 30 轮、全部 24 张事件卡、提前破产、存档恢复、模型失败重试与 390px 布局均已通过浏览器验收。风险表五行、三种参考和峰谷跳转已验证；全套 215 项测试通过。截图见 [游戏手册](GUIDE.md)。 |
| 三十年版真实模型 | DeepSeek Flash 经游戏本机中继实测两次。年度分析成功生成三份配置，进取与稳健对手股票仓位分别为 80% 和 35%。三十年画像的首个回答有一条数值评论未通过原校验。修正后已用离线响应验证历史数字绑定、单条点评来源标记及重放，未追加付费调用。 |
| 三十年版上线 | 主分支通过审计后由 [Pages 工作流](https://github.com/liaojs2025/life-cfo-game/actions/workflows/pages.yml) 发布静态游戏；公共模型中继使用同项目的 Sites Worker。 |

旧版服务曾出现 EFUND 中断和 520，上述问题没有因更换游戏入口而被证明消失。历史实测与诊断保留在 [AUDIT](AUDIT.md)，不把旧版短期成功样本推广为长期稳定性保证。
