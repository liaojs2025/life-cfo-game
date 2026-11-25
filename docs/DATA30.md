# 美日三十年：数据、事件与时点

本篇对应 `dist/history30.js` 的 `us-jp-1995-2024-v1`，覆盖美国、日本各 **1995–2024 三十个完整年度**。两国都使用现金、两个本国重要股指及黄金；没有把美国板块收益套到日本资产。1994 是首年信息与相邻收益的基期，不是额外游戏回合。

## 资产口径

| 国家 | 资产键 | 展示资产 | 币种 | 年度回报口径 |
| --- | --- | --- | --- | --- |
| 美国 | `cash` | 现金 | USD | 无息现金余额，名义回报设为 0；不是历史存款或国库券收益 |
| 美国 | `indexA` | 标普 500 | USD | NYU 年度含分红总回报；不重复派发股息 |
| 美国 | `indexB` | 纳斯达克综合 | USD | 相邻年末指数收盘点位的价格回报，不含分红 |
| 美国 | `gold` | 美元黄金 | USD | NYU 美元金价年度变动 |
| 日本 | `cash` | 现金 | JPY | 无息现金余额，名义回报设为 0 |
| 日本 | `indexA` | TOPIX 东证指数 | JPY | 相邻年末指数点位的价格回报，不含分红 |
| 日本 | `indexB` | 日经 225 | JPY | 相邻年末指数收盘点位的价格回报，不含分红 |
| 日本 | `gold` | 日元换算黄金 | JPY | 美元黄金回报与年末 JPY/USD 汇率变化复合 |

标普总回报与其他三个价格指数的股息口径不同，资产牌直接标示，不把它们包装成完全等口径的基金比较。纳斯达克综合指数包含多个行业，不等同于纯科技 ETF。指数和黄金均为教学基准，没有声称可按指数点位直接交易，也未加入真实基金跟踪误差、保管费或个人资本利得税。

## 市场来源与复现

本次原始材料取得日期为 **2026-11-25**。来源列表也由游戏内 `HISTORY30_SOURCES` 导出。

| 来源 | 取用字段和范围 | 数据版本与处理 |
| --- | --- | --- |
| [NYU Damodaran 历史收益表](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html) | 1994–2024 的 `S&P 500 (includes dividends)` 与 `Gold` | 页面标记 January 2026；保留原表年度百分数精度，除以 100 存为小数 |
| [Yahoo Nasdaq Composite 月线接口](https://query1.finance.yahoo.com/v8/finance/chart/%5EIXIC?period1=725846400&period2=1735689600&interval=1mo) | `^IXIC`，1993–2024 十二月的 `indicators.quote.close` | 用交易所时区识别十二月，年末点位保留两位小数，不取 adjusted close |
| [Yahoo Nikkei 225 月线接口](https://query1.finance.yahoo.com/v8/finance/chart/%5EN225?period1=725846400&period2=1735689600&interval=1mo) | `^N225`，1993–2024 十二月的 `indicators.quote.close` | 必须按 `Asia/Tokyo` 判断月度时间戳；UTC 下的前月末不能当成所属月份 |
| [日本统计局 e-Stat TOPIX 年度 API](https://dashboard.e-stat.go.jp/api/1.0/Json/getData?IndicatorCode=0702020590000090010&Cycle=3&RegionCode=00000&Limit=0) | 指标 `0702020590000090010`、年频 `Cycle=3`、`VALUE.@time` 的年份与 `VALUE.$` 年末点位 | 原统计来源是日本交易所集团统计月报；使用 1993–2024，不使用后续年度 |
| [日本内阁府 2024 国民经济核算摘要](https://www.esri.cao.go.jp/en/sna/data/kakuhou/files/2024/pdf/point_stock_en20260120.pdf) | Table 8.2，印刷页 15 / PDF 第 17 页；1994–2024 `End of calendar year / Yen / US dollar` | 2026-01-20 发布；东京银行间即期汇率 17:00 JST，单位为每美元日元数 |

e-Stat 的[指标说明接口](https://dashboard.e-stat.go.jp/api/1.0/Json/getIndicatorInfo?IndicatorCode=0702020590000090010)与[API 使用说明](https://dashboard.e-stat.go.jp/static/api)用于核对频率、来源及归因。所需归因保留如下：

> このサービスは、統計ダッシュボードのAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。

计算公式：

```text
股指价格回报[t] = 年末点位[t] / 年末点位[t−1] − 1
日元黄金回报[t] = (1 + 美元黄金回报[t]) × JPY每USD[t] / JPY每USD[t−1] − 1
```

汇率上升表示一美元兑换更多日元，即日元贬值。黄金只换算一次。该日元黄金是未对冲合成基准，并非日本零售金条含税买卖价。内阁府原表把 `2021 / 115.12` 印了两次，开发与独立审计均查看原 PDF，按年份去重，没有让后续列错位。由于同表没有 1993 汇率，1994 的日元黄金年度收益留空；它不是可投资回合，1995 开局明确只展示美元黄金与起点汇率，1995–2024 实际结算没有缺值或补造值。

仓库保存 `scripts/history30-sources/annual-observations.json`：31 年必要观察值及 1993 三指数基数；`source-hashes.json` 记录六份原始材料的大小和 SHA-256。未将完整月度指数原文件作为游戏资源发布。开发机器原始核验文件位于 `/tmp/history30-fetch`，不是部署依赖。

离线重建：

```sh
python3 scripts/build-history30-market.py
```

若要从已下载原文件重新提取：将原文件按 `source-hashes.json` 中的 `localResearchFile` 名称放在同一目录，然后运行：

```sh
python3 scripts/extract-history30-market.py --source-dir /path/to/raw-files --retrieved-at 2026-11-25
python3 scripts/build-history30-market.py
```

提取脚本解析 NYU 表格、Yahoo 交易所当地月份和 e-Stat 年度记录；FX 数组是已双人目检的 PDF 抄录，原表变化需重新目检，不自动猜测列。

离线重建脚本从已核验的精简观察值重新计算相邻指数收益与日元黄金，检查完整年份、有限数值及原提取值一致性，再生成 `dist/history30-markets.js`。它不联网、不静默更新版本、不插值。重新取得原始数据时，先按上述 URL、交易所时区和 PDF 栏位更新观察值与哈希，再重建。NYU 的含息收益与黄金使用原表百分数，不用当前价格另行反推。

开发与 audit agent 已分别重新读取原始 NYU、Yahoo、e-Stat 数据，核对三十一年；审计独立抄录内阁府汇率并重算三十个日元黄金回报。永久审计测试另检验价格收益、汇率方向与只复合一次。示例：2024 TOPIX 年末 2784.92、日经 39894.54、JPY/USD 157.89；2024 日元黄金回报约 40.6494%。

## 开局可见信息

每年三条情报均以**上一年末为截止点**：

1. 上年两个股指的实际回报和回报差，保留各自价格／总回报口径。
2. 上年黄金表现；日本额外展示美元黄金、本币黄金及年末汇率变动。
3. 截至上年最多三个已知年度的复合表现，以及本国最近一个已发生事件的有限事实摘要。旧事件明确注明距今几个年度，不冒充当前政策状态。

所有数据模块包含全年历史，是便于离线运行的静态资料；程序的信息边界由 `publicRound` / `campaignDecisionContext` 的字段白名单实现。它们不读取当年 `returns`、`reveal` 或当前年事件。原资料的当前发布版本不是当年数据库快照；这里使用当时收市可观察的价格和已经发生的公开事实，不把次年才发布的全年 GDP、CPI 或工资数据伪称为元旦已知资讯。

`briefing` 供玩家显示，`aiContext` 保留相同已知数值、趋势和宏观机制，用“第一条指数／第二条指数／本币／外币”等泛称替代标识。传给模型的上下文不附实际年份、来源 URL、当前回报或未来图谱。匿名化并不能保证模型无法从历史特征推测时期；它不是消除模型历史记忆的技术证明。

## 历史事件知识图谱

`dist/history30-events.js` 提供 24 个节点，美国、日本各 12 个，覆盖货币政策、信用、银行体系、技术周期、公共卫生、自然灾害、税收、出口需求与汇率。节点包含：

```text
id / country / year / date / title / type / summary / background
transmission[{channel, mechanism, assets}] / channels / relatedIds
sources[{title,url,publishedAt}] / publicKnownAt / publicBrief / anonymousBrief
```

`date` 是事件日期，`publicKnownAt` 是有限摘要事实已经公开的时点；二者不等同于目前核验页面的出版日期。未核实准确出版日的回顾材料使用 `publishedAt: null`，不伪填原始发布日期。次年情报只使用 `publicBrief`，不把回顾材料里的后续结果带入当时决策。比如 2000 年末情报可知道第二指数已经回落，不会借用 2001 年报告里未来的市场路径。

美国节点包括 1995 调整利率、LTCM、互联网重新定价、九一一、雷曼、量化宽松、缩减购债、2015 加息、疫情、2022 紧缩、2023 银行融资安排和 2024 降息。日本节点包括阪神震灾、山一证券、零利率、量化宽松、全球需求冲击、东日本震灾、QQE、消费税、负利率、疫情、外汇干预和结束负利率。每张卡直接链接 Fed、BOJ、政府报告或监管披露等核验来源。

`HISTORY30_EDGES` 是 `relatedIds` 导出的**机制对照关系**，不是“前一个事件导致后一个事件”的历史断言。`transmission` 为依据事件事实写作的教学解释，不是对该年收益的因果回归，也不是承诺某项资产必涨必跌。宏观事件不会额外向收益加减一次：实际行情已经包含当年各种事件的综合影响。个人生活事件由引擎独立按种子生成。

## 家庭与费用

家庭初始金额属于游戏设定：美国初始资产 100,000 美元、起始年收入 72,000 美元、起始生活费 36,000 美元；日本分别为 10,000,000、4,800,000、3,000,000 日元。这不是对两国真实家庭财富或生活水平的统计估计，也不做跨国货币财富排名。

生活费采用[世界银行 WDI / IMF IFS 的年度 CPI 通胀](https://data.worldbank.org/indicator/FP.CPI.TOTL.ZG)，指标 `FP.CPI.TOTL.ZG`。本次 WDI 更新日期为 2026-11-11，读取于 2026-11-25；美国、日本 1994–2024 各 31 项完整记录，百分数除以 100，保留负通胀。原始 API JSON、指标定义和 SHA-256 保存在 `scripts/history30-sources/household/`，`python3 scripts/build-history30-household.py` 可离线重建 `dist/history30-household.js`。

年度 CPI 在当年结算后用于调整**下一年**的生活费基数与价格指数，年初情报不展示当年 CPI。这是年度步进的家计规则，不声称完整年度 CPI 在当年最后一天已正式发布，也不是逐月账单复原。当前可得历史数据可能包含修订。

工资基数仍按每年 **2.5% 模拟名义趋势**增长。没有把 OECD 默认不变价 PPP 美元工资指标当成本币名义工资；本次未成功取得符合口径的工资序列，因此没有导入或补造工资数据。初始家计、婚育、健康、遗产与退休影响仍为教学模拟。非现金每侧成交费用 0.1% 为统一教学参数；市场收益税费前，游戏账本另计交易费与家庭收支。投资曲线剔除家庭入金，家庭净资产保留实际工资、支出、遗产和费用，两者不能混称投资收益。


## 绩效比较的历史短端参考

`dist/history30-rates.js` 单独导出 `RISK_FREE_RATES` 与 `RISK_FREE_SOURCE`，供终局比较使用，不改变现金收益、资产配置或年度结算。界面称为 **“历史隔夜利率近似（OECD）”**。

两国统一取 OECD Main Economic Indicators 的 `IRSTCI`：小于 24 小时的隔夜拆借／银行间报价利率，单位为年化百分数、未经季节调整，通过 FRED 取得。

| 国家 | 月度序列 | 覆盖 |
| --- | --- | --- |
| 美国 | [IRSTCI01USM156N](https://fred.stlouisfed.org/data/IRSTCI01USM156N) | 1995-01 至 2024-12，共 360 月 |
| 日本 | [IRSTCI01JPM156N](https://fred.stlouisfed.org/data/IRSTCI01JPM156N) | 1995-01 至 2024-12，共 360 月 |

来源更新日期 2026-11-16，提取日期 2026-11-25。年度参考 = **当年 12 个月年化报价的算术平均 ÷ 100**，不再乘 12，不将它当成月收益复利。两国采用相同定义、相同聚合方式，无缺失填充；负利率保持为负。FRED 的同系列年频值是年末观察，不能冒称年度平均，因此这里明确从月度表自行聚合。例如 2024 美国约 5.100833%、日本 0.1205%；2008 美国约 1.9275%，并非该年末的 0.16%。

这些是银行间利率，带有信用和流动性因素，作为短端机会成本近似，**不是政府债券无风险总回报，也不是普通家庭可保证拿到的现金收益**。全年平均是事后参考，只供已完成年度的超额收益比较，不进入当年 AI 情报。统一 0% 现金参考与用户自定义常数可用于比较不同假设。

直接原始文件下载未成功，本次使用浏览工具读取 FRED 数值表；`rates-us.json`、`rates-jp.json` 如实标记为归一化网页数值摘录，不冒称原始 CSV。`rates-manifest.json` 保存摘录 SHA-256、完整来源和方法。运行 `python3 scripts/build-history30-rates.py` 可验证 720 条月份记录及哈希，并重建 60 个年度参考值。归因：OECD (2026), Main Economic Indicators, retrieved via Federal Reserve Bank of St. Louis FRED, accessed 2026-11-25。
