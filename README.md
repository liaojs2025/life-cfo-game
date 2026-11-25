# 人生 CFO · 三十年投资手记

[游戏入口](https://liaojs2025.github.io/life-cfo-game/) · [图文手册](docs/GUIDE.md) · [产品规划](docs/PRODUCT.md) · [发布状态](docs/RELEASE.md)

选择美国或日本，从 **1995 年走到 2024 年**。每年只做一件事：在现金、两项股票指数和黄金之间分配资金。工资、婚育、健康支出和遗产会随人生自动发生；你与进取、稳健两位对手从同一起点出发，经历同一组家庭收支。

本次维护更新的代码与文档日期为 **2026-11-25**。本轮上线与真实模型验收以 [RELEASE](docs/RELEASE.md) 的记录为准，不沿用旧版本的实测结论。

## 开始游戏

1. 选择美国（美元）或日本（日元），开启或继续本国旅程。
2. 读年初情报，调整四项资产，总和保持 100%；也可以采用建议后修改。
3. 点击年度结算，查看三方回报、家庭事件、资产负债表与净资产变化。
4. 完成三十年，或在净资产耗尽时提前结束，再看画像、关键年份和历史事件图谱。

美国起始资产 10 万美元，日本为 1,000 万日元；初始年龄由本局种子在 22–35 岁间生成。家庭起点、工资趋势与个人事件为教学模拟；生活费基数按历史 CPI 在年末调整供下一年使用。股票、黄金采用已完成年份的历史序列，各资产注明价格回报或含分红总回报。

**不连接模型也能完整游玩。** 进取规则对手股票指数占比至少 60%，稳健对手至多 40%；出局账户不复活。

## 连接自己的 AI

点击“连接 AI”，选择服务、填写账号模型和自己的 API Key。一次年度请求同时产生两位对手的独立配置及给玩家的建议，成功决定在揭晓行情前封存。

| 服务 | 默认模型 |
| --- | --- |
| DeepSeek（默认） | `deepseek-flash` |
| EFUND | `deepseek-v4-flash` |
| OpenAI | `gpt-4.1-mini` |
| 智谱 GLM | `glm-4.7-flash` |
| Kimi | `kimi-k3.1-pro` |

五家通过固定中继调用。密钥只留当前页面内存，经中继临时转交，不写入进度、偏好或仓库；刷新后需重填。连接失败时可以重试，或明确选择“本年用规则策略”，不会把规则结果标成真实 AI。

API 按服务商用量计费，重试可能重复计费。EFUND 单次年度／复盘输出上限为 4,000／6,000 token，其他服务为 2,500／3,500；每次操作最多三次请求，共用六十秒预算。参数和已知接口限制见 [RELEASE](docs/RELEASE.md)。

## 看懂曲线与进度

“组合与指数”从同一起点 100 比较年度配置回报复利，剔除工资、遗产和家庭支出；“家庭净资产”则包含这些现金流及交易费用。指数回报口径不完全相同，图例和数据说明中单独标注。

美国与日本进度分别保存在当前浏览器和站点。恢复时按原种子与封存决策重放核账；重开本国会替换该国进度。新玩法没有文件导入、JSON 导出或跨设备同步。

[旧版港湾城二十年](https://liaojs2025.github.io/life-cfo-game/legacy.html) 保留原 v3 存档、房车保障和双账本玩法，与新旅程不混算。旧版数据与审计入口分别见 [DATA](docs/DATA.md)、[AUDIT](docs/AUDIT.md)。

## 本地运行

需要 Node.js 22+，无需安装前端依赖。

```sh
git clone https://github.com/liaojs2025/life-cfo-game.git
cd life-cfo-game
npm run dev
```

打开 [本地游戏](http://127.0.0.1:4173)，旧版路径为 `/legacy.html`。

```sh
npm test
npm run check
npm run build:pages
```

静态前端产物为 `output/pages`；Sites 维护环境通过 `npm run build` 构建固定中继。部署流程见 [RELEASE](docs/RELEASE.md)。

## 维护索引

[背景](docs/BACKGROUND.md) · [规划](docs/PRODUCT.md) · [模块记录](docs/MODULES.md) · [三十年数据](docs/DATA30.md) · [三十年审计](docs/AUDIT30.md) · [素材](docs/ASSETS.md)

新玩法由 `campaign.js` 统一结算，`campaign-ai.js` 管理年度模型包和复盘；旧版继续使用 `engine.js`、`ai.js`、`session.js`。两个入口共用固定服务商传输模块。新增规则必须同步文档并由独立 audit agent 复核。

作者：[liaojs2025](https://github.com/liaojs2025)
