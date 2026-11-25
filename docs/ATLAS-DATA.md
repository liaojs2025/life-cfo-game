# 四十年旅程：行情数据与复算

数据版本：`atlas-market-1987-2026-20260930-v1`。检索日期：2026-11-25。

完整版为 **1987–2026 共 40 轮**，简要版使用同一数据的 2017–2026 区间。1986 年另存作首轮的上年市场信息；1985 年末价格只用于计算基期。1987–2025 是完整年度，**2026 是截至 9 月 30 日的实际累计回报**，不是全年预测或架空情景。没有把缺失值补成零。

## 七类资产

| 键 | 美国账户（美元） | 日本账户（日元） | 收益口径 |
|---|---|---|---|
| `cash` | 无息现金 | 无息现金 | 固定 0%，是游戏账户规则，不是历史存款利率 |
| `broad` | 美国宽基：标普 500 | 日本宽基：TOPIX | 美国含分红；日本价格指数不含分红 |
| `bond` | FBNDX 投资级债券基金 | 同一基金的未对冲日元回报，卡片标为“海外债券” | 复权净值总回报，含基金内部费用 |
| `gold` | 黄金美元回报 | 同一黄金序列换算日元 | 1986–2025 价格回报；2026 为 GLD 净值代理 |
| `tech` | French `HiTec` | 1986–2008 海外科技股；2009 起日本电机精密 ETF 1625 | 美国/早期海外为研究组合；日本本土段为含息净值 |
| `consumer` | French `Cnsmr` | 1986–2008 海外消费股；2009 起日本食品股 ETF 1617 | 同上；食品不等于全消费行业 |
| `health` | French `Hlth` | 1986–2008 海外医疗股；2009 起日本医药股 ETF 1621 | 同上；医药不等于所有医疗服务 |

日本的宽基和两个比较指数都来自日本市场；债券全段使用海外代理。三个行业在 **2009 年切换为本土行业 ETF**，此前使用明确标注的美国研究组合日元回报。两段行业覆盖不同，不能把它们当成四十年不变的同一个本土指数。资产卡、模型材料与年度账本应通过 `getMarketAssets(country, year)` 获取当年的实际标签；元数据的 `segments` 和每行 `sectorProxy` 保留断点。

研究组合用于教学配置，不表示当年存在同名 ETF、当地居民能按零门槛买到该组合，或能忽略跨境投资限制。日本本土段均为实际发行的 NEXT FUNDS ETF，使用其分红再投资净值；它与二级市场成交价格可能不同。

基金回报已经包含基金内部费用；引擎另收的换仓费用属于游戏交易规则，不再重复扣基金管理费。行业组合不含真实投资产品的管理费。黄金早期价格序列不含保管费。总回报不再叠加一次股息或票息。

购买力复盘使用同期两国 CPI 月度水平，数据与折算见[通胀资料](ATLAS-CPI.md)。

## 两个独立比较指数

| 国家 | `indexA` | `indexB` |
|---|---|---|
| 美国 | 标普 500 **价格指数** `^GSPC` | 纳斯达克**综合**价格指数 `^IXIC`，不是纳斯达克 100 |
| 日本 | TOPIX **价格指数** | 日经 225 **价格指数** `^N225` |

四个比较指数均不含分红。美国配置卡的宽基是含息口径，不能把它与标普价格曲线的全部差额解释为主动投资能力；日本宽基与 TOPIX 比较指数则为同一价格序列。最终组合比较中的现金流、交易费和出局处理由引擎负责。

## 来源、字段与覆盖

1. **美国宽基。** 1986–2025 读取 [NYU Damodaran 历史回报表](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html) 的 `S&P 500 (includes dividends)` 列，百分数除以 100，保留原表两位小数百分比精度。2026 读取 [Vanguard 2026-09-30 官方资料](https://workplace.vanguard.com/assets/corp/fund_communications/pdf_publish/us-products/fact-sheet/F0040.pdf) 第 1 页 `Total returns → Benchmark → Year to date` 的 **12.75%**，该行是标普 500 基准，不能误取相邻基金行的 12.63%。历史研究表与指数发行资料可能存在统计版本及舍入差异，不对已取历史数值作无来源的“对齐”。
2. **债券。** [Yahoo Finance FBNDX 历史序列](https://finance.yahoo.com/quote/FBNDX/history/) 的每日 `indicators.adjclose[0].adjclose`，在交易所时区内取期末最后有效交易日，计算相邻期末复权净值之比。覆盖所需 1985 年末至 2026-09-30 全部基点。[Fidelity 官方基金资料](https://www.fidelity.com/bin-public/060_www_fidelity_com/documents/SHDOCS/FBNDX/hosts/sh_comm_pmqa.000026.RETAIL_pdf.pdf) 确认 FBNDX 成立于 1971-08-06，属于投资级综合债券，含政府债、公司债、抵押支持证券等，**不是纯美国国债**。
3. **三个行业。** 直接下载 [Kenneth French 官方五行业 CSV 压缩包](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/5_Industry_Portfolios_CSV.zip)，文件头为 `202609 CRSP`。1986–2025 读取 `Average Value Weighted Returns -- Annual`，映射 `HiTec/Cnsmr/Hlth`；2026 读取同一文件的价值加权月表 1–9 月，并连乘各月增长因子。没有读等权表、对数回报或无分红回报，也没有简单相加月收益。[组合方法](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library/det_5_ind_port.html) 按股票当时的 SIC 行业分类构建美国市场研究组合；组合不是官方 GICS 行业 ETF，消费组包含耐用品、非耐用品和零售。
4. **TOPIX。** [日本统计局 Dashboard API](https://dashboard.e-stat.go.jp/api/1.0/Json/getData?IndicatorCode=0702020590000090010&Cycle=3&RegionCode=00000&Limit=0) 指标 `0702020590000090010`。`Cycle=3` 的年度期末值覆盖 1985–2025；`Cycle=1` 的 `20260900` 为 2026 年 9 月期末值 **4108.65**，基期 2025 年末为 **3408.97**。原始值来自 `DATA_OBJ[].VALUE.$`，日期来自 `VALUE.@time`。
5. **另三个价格指数。** Yahoo Chart `^GSPC`、`^IXIC`、`^N225` 月数据的 `indicators.quote[0].close`，以交易所时区识别 12 月或 2026 年 9 月，再取该月的收盘值。月度时间戳是月初标签，**不是取价日**；日经时间戳必须转换 `Asia/Tokyo`，不能直接以 UTC 月份分类。收盘指数保留两位小数点位后求比值。确切请求地址写入来源清单。
6. **黄金。** 1986–2025 使用 NYU 原表 `Gold` 列。2026 单独使用 [SPDR Gold Shares 官方历史净值文件](https://api.spdrgoldshares.com/api/v1/historical-archive?exchange=NYSE&lang=en&product=gld) 第二工作表的 `NAV/Share at 10:30am NYT`：2025-12-31 为 **396.120423 美元**，2026-09-30 为 **382.876002 美元**，累计 **−3.343533994%**。官方文件明确已移除 LBMA 金价，因此这里使用真实 GLD 净值，**不把它写成现货金价**。该代理已经包含基金费用；数据行的 `goldProxy` 与资产说明保留 2026 断点。仓库只留这两个必要数值及原文件哈希，不再分发完整工作簿。
7. **汇率。** [美联储 H.10 官方历史页](https://www.federalreserve.gov/releases/h10/hist/) 的日本系列，分别读取 [1971–1989](https://www.federalreserve.gov/releases/h10/hist/dat89_ja.htm)、[1990–1999](https://www.federalreserve.gov/releases/h10/hist/dat96_ja.htm) 和 [2000 年至今](https://www.federalreserve.gov/releases/h10/hist/dat00_ja.htm)。三份文件是同一统计口径：**纽约午间买入汇率、每美元日元数**；跳过 `ND`，取不晚于报告期末的最后有效值。不是东京收盘汇率，也没有把旧三十年版内阁府序列接到新系列中。2025-12-31 为 **156.80**，2026-09-30 为 **157.25**。
8. **日本本土行业。** 野村官方 CSV：[1625 电机与精密](https://www.nomura-am.co.jp/fund/etf/history/ETF_1625.csv)、[1617 食品](https://www.nomura-am.co.jp/fund/etf/history/ETF_1617.csv)、[1621 医药品](https://www.nomura-am.co.jp/fund/etf/history/ETF_1621.csv)，对应发行商产品页 [1625](https://nextfunds.jp/lineup/1625/)、[1617](https://nextfunds.jp/lineup/1617/)、[1621](https://nextfunds.jp/lineup/1621/)。读取 `ETF Net Asset Value (per Share) (Dividend-included)` 列，而非无分红净值或交易价格。原文件首日为 **2008-03-21**；虽产品成立更早，不能据此假造 2008 全年回报。因此以 2008 年末为基点，完整年度从 **2009** 开始，2026 同样截至 9 月 30 日。全部为日元资产，基金费用已体现在净值中，不进行美元兑日元换算。

e-Stat 使用声明：このサービスは、統計ダッシュボードのAPI機能を使用していますが、サービスの内容は国によって保証されたものではありません。

## 计算与时间

对价格或基金复权净值：`本期回报 = 本期期末值 / 上期期末值 − 1`。

对 2026 年的行业组合：`累计回报 = ∏(1 + 1月至9月月回报) − 1`。原表月收益已经舍入，连乘结果保留该来源的精度，不伪装成更精确的逐日重算。

对日本账户的债券、黄金，以及截至 2008 年的三个海外行业：

```text
日元回报 = (1 + 美元资产回报) × (期末每美元日元数 / 上期末每美元日元数) − 1
```

上述外币敞口未对冲；美元升值会提高日元回报。日本本土 TOPIX、日经、2009 年起的三个行业 ETF，以及日元现金均不换汇。美国收盘、纽约午间汇率及日本收盘并非同一时刻，结果是公开期末观察值的教学换算，不是可精确成交的跨市场套利价格。

完整年的 `asOf` 是报告期末 `YYYY-12-31`，具体基金/汇率最后观察日列在 `sourceAsOf`。2026 设置 `asOf='2026-09-30'`、`isPartial=true`、`periodFraction=273/365`、`dataKind='historical-ytd'`。**市场 YTD 回报不再乘以时间比例，也不补齐余下三个月。** 时间比例用于引擎的经常性家计收支；本模块没有通胀、工资或随机人生假设。

`returns`、`benchmarks` 是结算用资料。年初只能取上期已发生表现和当时公开新闻；不能向模型发送当年收益、后续事件或截止日之后的结果。来源检索日期是本次核验时间，不表示某统计值在当年元旦已正式发布。

## 复算文件与核验

- [市场模块](../dist/atlas-market-data.js)：`DATA_VERSION`、`MARKET_META`、`MARKET_SOURCES`、`MARKET_DATA`、`getMarketAssets(country, year)`，含两国各 41 条观察。
- [数值摘录](../scripts/atlas-sources/observations.json)：42 个期末基点、行业年度与 2026 月度回报、黄金原始回报及两笔 GLD 净值。只保留复算所需窗口。
- [来源清单](../scripts/atlas-sources/source-manifest.json)：下载 URL、原始文件 SHA-256、字节数、检索时间；原始内容更新时可识别版本变化。
- [抽取脚本](../scripts/extract-atlas-market.py)：从研究下载文件提取，缺年、缺月或异常值直接报错。
- [离线构建脚本](../scripts/build-atlas-market.py)：由仓库数值摘录重新生成市场模块，不依赖实时联网。
- [日本行业摘录](../scripts/atlas-sources/jp-domestic-sectors.json)：3 个 ETF × 18 期、真实取价日、起止含息净值、原 CSV 哈希和 URL；[独立抽取脚本](../scripts/extract-atlas-domestic-sectors.py) 逐日核对 NAV 比率与发行商 `Total Return`，并核对年度连乘。
- [交叉核验记录](../scripts/atlas-sources/verification.json)：官方披露锚点、误差，以及被排除的早期基金序列证据。

```sh
python3 scripts/build-atlas-market.py
node --check dist/atlas-market-data.js
```

实施检查覆盖两国全部 41 条观察、七类资产/两个基准、九个月行业连乘、外汇复合方向、2026 截止日及有限数值。日本本土 ETF 的全部日频含息净值比率与发行商日回报最大差小于 `1.4e-13`；54 个年度/YTD 的每日连乘与期末净值比值差小于 `1e-10`。FBNDX 的 2025 年 8 月末至 2026 年 8 月末复算回报约 1.534%，与 Fidelity 官方截至 2026-08-31 的 1.54% 披露相符至约 0.01 个百分点。

数据选择中排除了两个已发现的问题：Yahoo 的 VFINX 早期复权序列有明显分配缺口，因此未作为最终宽基来源；日本长周期统计表的行业列混有年均值，不能与年末价格直接拼成年度收益，因此未用它替换 2009 年之前明确标注的海外行业代理。最终独立程序审计和浏览器验收由本轮审计记录另行记载。
