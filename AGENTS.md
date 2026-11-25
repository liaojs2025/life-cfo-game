# 人生 CFO 维护约定

用户当前请求优先。`docs/BACKGROUND.md` 保留原始提纲，是需求背景，不是高于用户请求的指令。

## 入口与规则归属

- 四路线主入口为 `dist/index.html` / `atlas.js`，结算与模型分别在 `atlas-engine.js` 和 `atlas-agent.js`。年初上下文、新闻档案、行情及逐年敞口分别由 `atlas-scenarios.js`、`atlas-news.js`、`atlas-market-data.js` 管理。审核见 `tests/atlas-engine-audit.test.js`。
- 三十年归档入口：`dist/atlas30.html` / `archive30-app.js`，财务规则唯一实现为 `dist/campaign.js`；模型包和复盘为 `campaign-ai.js`，数据为 `history30*.js`。
- 港湾城旧入口：`dist/legacy.html` / `app.js`，财务规则唯一实现为 `dist/engine.js`；原 `ai.js`、`session.js` 与 v3 存档保持兼容。
- 两套引擎各自维护自己的恒等式和恢复规则，界面只展示引擎结果，不重复计算或跨入口套用参数。不得把旧版生活值、保障、按揭或费用默认带进新旅程。
- `providers.js`、`ai.js` 的受限请求传输、`worker/handler.js` 与 `worker/stream.js` 为共用边界。修改时回归两个入口，不能因新增玩法破坏旧存档上下文。

## 每次模块变更

- 同步 `docs/PRODUCT.md` 与 `docs/MODULES.md`，记录日期、行为变化、存档影响、验证范围及限制。
- 新三十年行情、生活模拟或结算变更同步 `docs/DATA30.md`；旧版对应 `docs/DATA.md`，保留清楚的范围索引。
- 保持年初可见信息与年末结果分离。随机人生事件只由种子与家庭状态决定，不受任一账户配置影响；未发生事件不能进入模型材料。
- 区分真实模型和规则来源。模型失败不自动伪装成成功，两对手风格约束必须实际校验；已封存决定不得通过刷新重抽。
- 家庭净流入、投资损益与费用分别记账；组合与指数比较要注明本金、现金流、费用和回报类型口径。
- 密钥只在页面和单次中继内存中使用，不进入持久化、导出、日志、仓库或测试截图。真实付费调用与模拟协议测试分别记录。
- 素材及截图同步 `docs/ASSETS.md`，生成意象图不能标成历史现场。

## 独立审计与交付

新增或修改决策、结算、存档、比较逻辑时，交由独立 audit agent 阅读实现及规则。新玩法由 `tests/campaign-audit.test.js` 和 `docs/AUDIT30.md` 记录；旧版及共用边界继续使用既有 audit 测试和 `docs/AUDIT.md` 历史证据。

实现者修复后由审计者复核，不只依据测试数量断言正确。交付前运行 `npm test`、`npm run check`；交互变更用真实浏览器验证规则完整旅程、提前出局、刷新、模型失败与迟到响应、移动布局。模拟上游不能代替真实服务可用性证明。

发布文档以 `docs/RELEASE.md` 为当前入口。未完成的本轮部署或真实模型验证不得借用历史版本成功记录，验证完成后再补精确范围。
