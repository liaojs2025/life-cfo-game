# 开年读数

美国和日本各有 40 张开年面板，覆盖 1987–2026。每张面板有三个同期可见的读数。表内 `period` 是统计月，`availableBy` 是可见日期的上界。来源列显示「公布」时使用实际发布日期，显示「截至」时使用保守的月末边界。政策利率用年末有效值，宏观月报取开局前已经发布的月份。

| 开年指标 | 取值与来源 |
| --- | --- |
| 美国利率 | 1987–1994 年开局展示上年 11 月银行间隔夜成交利率的月均值。联储自 1994 年起公布决策，随后使用 12 月末联邦基金目标利率，目标改为区间后取中点。[OECD／FRED](https://fred.stlouisfed.org/series/IRSTCI01USM156N) · [美联储公开市场操作](https://www.federalreserve.gov/monetarypolicy/openmarket.htm) · [BIS 美国政策利率](https://data.bis.org/topics/CBPOL/BIS,WS_CBPOL,1.0/M.US) |
| 日本利率 | 依当时政策制度分别取官方贴现率、无担保隔夜拆借目标或政策利率余额的适用利率。BIS 缺少年末数值目标时，采用上年 11 月实际隔夜拆借月均值，指标标签随之改为「隔夜利率」。[BIS 制度时间表](https://www.bis.org/pages/statistics/cbpol-doc.pdf) · [日本银行贴现率记录](https://www.boj.or.jp/en/statistics/boj/other/discount/discount.htm) · [OECD／FRED](https://fred.stlouisfed.org/series/IRSTCI01JPM156N) |
| 美国 CPI 同比 | BLS 城市消费者全项目 CPI-U，系列 CUUR0000SA0。取上年 11 月未季调指数及其一年前的同月指数，计算同比并四舍五入到一位小数。日期来自 BLS 逐期公报或早期发布时间表。[BLS 系列](https://data.bls.gov/timeseries/CUUR0000SA0) · [历年发布日期](https://www.bls.gov/bls/histreleasedates.pdf) |
| 日本 CPI 同比 | 全国综合 CPI 月报表 3-1 的 11 月同比。统计局保留各历史基准当时发布的涨幅，月报通常在次月发布。[日本总务省统计局原表](https://www.stat.go.jp/data/cpi/sokuhou/tsuki/pdf/zenkoku.pdf) · [基准及历史变化率](https://www.stat.go.jp/english/data/cpi/riyou.htm) · [发布时点](https://www.stat.go.jp/data/cpi/4-1.htm) |
| 美国失业率 | 尽量取上年 11 月 BLS 就业报告首次发布的经季调失业率。1987–1994 及 1997 年开局使用费城联储当时第四季度失业率档案的最后一行有效观测，信息截至上年 11 月 15 日。[BLS 就业报告档案](https://www.bls.gov/bls/news-release/empsit.htm) · [费城联储 RUC 实时数据](https://www.philadelphiafed.org/surveys-and-data/real-time-data-research/ruc) |
| 日本失业率 | 2004–2026 年开局使用上年 11 月全国经季调完全失业率。来源是统计局当时的月报 PDF 或日本劳动政策研究研修机构当月明确记录的数值与发布日期。[统计局历次月报](https://www.stat.go.jp/data/roudou/rireki/gaiyou.html) · [劳动政策研究研修机构月报](https://www.jil.go.jp/kokunai/statistics/saikin/index.html) |
| 日本早年汇率 | 1987–2003 年开局取 H.10 上年 11 月最后一个有报价的交易日，单位为每美元的日元数，保留具体日期。此段就业的可用来源是后来的全国未季调历史汇编，仅在年终回顾中展示，上年 10 月一栏也明确标注资料口径。[美联储 H.10 历史报价](https://www.federalreserve.gov/releases/h10/hist/) · [日本劳动力调查历史表](https://www.e-stat.go.jp/en/stat-search/file-download?statInfId=000031831358&fileKind=0) · [统计局修订说明](https://www.stat.go.jp/english/data/roudou/note.html) |

2026 年的美国开年面板保留了延迟发布的 2025 年 11 月失业率 4.6%（12 月 16 日）和 CPI 同比 2.7%（12 月 18 日）。同期的利率 3.625% 是 3.50%–3.75% 区间的中点。日本开年的三项分别为政策利率 0.75%、CPI 同比 2.9%、失业率 2.6%。[美国就业公报](https://www.bls.gov/news.release/archives/empsit_12162025.htm) · [美国 CPI 公报](https://www.bls.gov/news.release/archives/cpi_12182025.htm) · [日本 2025 年 12 月统计摘录](https://www.jil.go.jp/kokunai/statistics/saikin/2025/202512.html)

## 离线复算

`scripts/opening-sources/observations.json` 固定 240 项开年读数的来源摘录和另行存放的 17 项就业回顾。美国 CPI 保留前后两期原始指数，实时失业率档案保留工作表列名，各期公报保留单独链接。利率实际成交值使用仓库中的 OECD 隔夜利率月度摘录，汇率使用与市场资产相同的 H.10 原表。来源文件的下载校验值收录于 `scripts/opening-sources/provenance.json`。

```sh
python3 scripts/build-opening-indicators.py
python3 scripts/build-opening-indicators.py --check
node --test tests/opening-indicators.test.js
```

用 Python 标准库即可重建 `dist/opening-observations.js`。界面和对手从 `getOpeningIndicators(country, year)` 取得同一份开年数字。单独的 `getHistoricalEmployment(country, year)` 返回供上述 17 期结算使用的历史汇编，其余轮次返回 `null`。
