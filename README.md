# 人生 CFO · 港湾城二十年

[打开游戏](https://liaojs2025.github.io/life-cfo-game/) · [五分钟图文手册](docs/GUIDE.md) · [产品规划](docs/PRODUCT.md)

**v1.0.0 正式版**。从 30 岁、10 万美元出发，安排投资、家庭与生活，和拥有独立账本的 AI 同桌一起走过二十年。

2007–2025 使用历史市场，2026 为模拟终章；美元计价。不连接模型，也能和规则陪练完整游玩。

## 怎么玩

每年读情报、选生活事件、安排现金／股票／国债／黄金，再点击“就这样，出发！”。股票可选宽基、科技、消费、医疗；“生活计划”管理医疗保障、房车和再平衡。三种模式分别是**自己玩、搭档建议、搭档托管**。

年末查看双方回报、家庭收支与完整资产负债表。二十年后，领取以实际选择为依据的行为画像，翻看时代相册。三张游戏截图和操作步骤见 [图文手册](docs/GUIDE.md)。

## 接入自己的 AI

在“接入我的 AI”中选择服务，填写自己的 API Key。默认使用 DeepSeek，也可切换 EFUND、OpenAI、GLM 或 Kimi：

| 服务 | 基础地址 | 默认模型 |
| --- | --- | --- |
| **DeepSeek** | `https://api.deepseek.com` | `deepseek-flash` |
| EFUND | `https://aigc.efunds.com.cn/v1` | `deepseek-v4-flash` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4.1-mini` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4.7-flash` |
| Kimi / Moonshot | `https://api.moonshot.cn/v1` | `kimi-k3.1-pro` |

地址会自动补齐接口路径，也可填写账号已开通的模型名称。五种服务都通过游戏的固定中继调用。

EFUND 单次年度/画像输出上限为 4,000 / 6,000 token；其他服务为 2,500 / 3,500 token。

AI 每年分析公开情报，给出配置与家庭方案，并解释依据和后续观察重点。你可以采纳后修改，同桌则执行自己的决定。成功结果在揭晓前封存；切换服务会清空密钥，已封存决定保持不变，新配置用于后续回合。

**API 按服务商计费，重试可能重复计费。密钥只保留在当前页面内存**，由中继临时转交，不写入存档或导出；刷新后需重新填写。请求失败时可以重试，或选择“本年用规则陪练”，界面会标明真实 AI 与规则来源。

## 看懂结果，保存旅程

净资产等于总资产减总负债。账本分列工资、家庭开支、金融回报、房价变化、折旧和费用；两位玩家的家庭选择会让收入和开支走向不同。

年度排名来自 **55 种模拟策略**。家庭、房车、保障与现金收益含教学设定；数据口径见 [DATA](docs/DATA.md)，照片、图解及授权见 [ASSETS](docs/ASSETS.md)。

进度自动保存在当前浏览器、当前站点。v1.0 沿用 v3 存档和已封存结果，旧版原档继续保留。“导出旅程”可下载账本与决策 JSON；目前没有文件导入或跨设备同步。

## 本地运行

需要 Node.js 22+，无需安装前端依赖。

```sh
git clone https://github.com/liaojs2025/life-cfo-game.git
cd life-cfo-game
npm run dev
```

打开 [本地游戏](http://127.0.0.1:4173)。

```sh
npm test
npm run check
npm run build:pages
```

`build:pages` 生成静态前端 `output/pages`；Sites 维护环境的 `npm run build` 生成公共中继。部署步骤及本次发布结果见 [RELEASE](docs/RELEASE.md)。

## 持续维护

[背景快照](docs/BACKGROUND.md) · [产品规划](docs/PRODUCT.md) · [模块记录](docs/MODULES.md) · [独立审计](docs/AUDIT.md)

`dist/engine.js` 统一财务规则，`ai.js` 管理模型请求，`session.js` 管理双账本封存与重放。新增模块同步规划和记录，由独立 audit agent 核对逻辑与程序。

作者：[liaojs2025](https://github.com/liaojs2025)
