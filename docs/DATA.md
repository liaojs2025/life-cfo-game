# 数据来源与结算口径

版本：`harbor-2007-2026-v3`
核验日期：2026-11-16
执行数据：`dist/data.js`、`dist/market-v2.js`、`dist/market-v3.js`；财务实现：`dist/engine.js`。

20 回合覆盖 2007–2026：前 19 回合使用已完成年份的历史行情代理，现金及家庭参数始终属于模拟；最后一回合明确为 **2026 架空情景**。截至核验日 2026 年尚未结束，不提供虚构的“2026 全年历史回报”。

## 历史市场数据

取 Aswath Damodaran 在 NYU Stern 发布的 [Historical Returns on Stocks, Bonds and Bills](https://pages.stern.nyu.edu/adamodar/New_Home_Page/datafile/histretSP.html) 中 2007–2025 年的三个字段：`S&P 500 (includes dividends)`、`US T. Bond (10-year)`、`Gold`。采用页面 2026-01-05 更新版本，页面标题虽仍写至 2024，表体已包含 2025 完整行。百分数保留两位，程序除以 100 后以小数使用。此数据为研究者汇编的历史代理序列，不是本游戏销售的金融产品净值。

| 年份 | 股票：含分红 % | 10 年国债：总回报 % | 黄金：价格回报 % |
| --- | ---: | ---: | ---: |
| 2007 | 5.48 | 10.21 | 31.92 |
| 2008 | -36.55 | 20.10 | 4.32 |
| 2009 | 25.94 | -11.12 | 25.04 |
| 2010 | 14.82 | 8.46 | 29.24 |
| 2011 | 2.10 | 16.04 | 12.02 |
| 2012 | 15.89 | 2.97 | 5.68 |
| 2013 | 32.15 | -9.10 | -27.61 |
| 2014 | 13.52 | 10.75 | 0.12 |
| 2015 | 1.38 | 1.28 | -12.11 |
| 2016 | 11.77 | 0.69 | 8.10 |
| 2017 | 21.61 | 2.80 | 12.66 |
| 2018 | -4.23 | -0.02 | -0.93 |
| 2019 | 31.21 | 9.64 | 19.08 |
| 2020 | 18.02 | 11.33 | 24.17 |
| 2021 | 28.47 | -4.42 | -3.75 |
| 2022 | -18.04 | -17.83 | 0.55 |
| 2023 | 26.06 | 3.88 | 13.26 |
| 2024 | 24.88 | -1.64 | 25.96 |
| 2025 | 17.78 | 7.80 | 66.22 |

[数据口径说明](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSPX.html) 指出股票包含分红，国债包含票息及价格变化；本游戏因此不另加分红或票息，也不把长期债券回报当成保证利息。黄金不产生额外利息。2007 年初的回望使用同一来源的 2006 年股票回报 +15.61%。

全程美元计价，没有跨币种转换。游戏每侧成交费另在账本扣除；不再次扣除已经反映在 ETF 公布净值回报中的运营费用。数据缺失不插值：当前覆盖区间已具备三个字段的完整年度记录。若来源后续修订，必须新建数据版本并决定旧存档的重放兼容策略。

网页公开可读不等于商业再分发许可已经完成法律核验。本版保留少量教学使用的数值、来源与口径；大范围商业化或扩展数据集前，应核验原始底层数据授权和再使用条件，不宣称拥有指数/产品品牌授权。

## 新闻来源与信息时间

| 来源 | 用于游戏的事实 | 最早在年初出现 |
| --- | --- | --- |
| [美联储 2010 年危机回顾](https://www.federalreserve.gov/newsevents/speech/20100407a.htm) | 2007 年信用压力、2008 年金融危机与雷曼破产 | 2008 / 2009 |
| [美联储资产负债表政策时间线](https://www.federalreserve.gov/monetarypolicy/timeline-balance-sheet-policies.htm) | 2008 年开始资产购买；2010 年 11 月第二轮；2012 年 9 月第三轮；2013 年 12 月缩减；2014 年 10 月结束新增购买 | 相应事件之后的下一年 |
| [美联储 2015 年 12 月 16 日声明](https://www.federalreserve.gov/newsevents/pressreleases/monetary20151216a.htm) | 政策利率由零附近上调 | 2016 |
| [英国选举委员会公投报告](https://www.electoralcommission.org.uk/research-reports-and-data/our-reports-and-data-past-elections-and-referendums/report-23-june-2016-referendum-uks-membership-european-union) | 2016 年 6 月英国脱欧公投 | 2017 |

来源材料可能发表于事件之后；游戏使用的是可核验的事件日期，并不向当年的角色提供事后结论或原文报告。新闻不推出唯一买卖建议，当年收益只在结算后展示。年度资产表现与宏观事件同时出现，也不等于能从一条新闻解释全部回报。

## 教学模拟参数

以下均是模型假设，不是所述年份的真实城市/金融产品数据。

| 项目 | 当前参数和处理 |
| --- | --- |
| 家庭 | 林舟、阿宁、小满与港湾城虚构；30 岁开始、20 回合后 50 岁，阶段结束不等于退休 |
| 现金 | 全部年份固定年回报 2%，不是历史存款或短票据序列 |
| 物价 | 每年固定 2%；生活支出、租金、保险参数、汽车购价与维护按该指数调整 |
| 工资 | 初始税后 $72,000；次年基准增长 2.5% 后加上本年选择产生的年薪增量 |
| 消费 | 初始每年 $36,000，其中租金 $18,000；次年按 2% 增长再加选择产生的年度增量 |
| 人生选择 | 选项中的一次性成本在当年年初支付；年度工资/支出增量从下一年开始；生活满意度 0–100；两项均无力负担时提供零成本暂缓计划，生活 −2 |
| 保险 | 模拟医疗保障，年保费 $1,200、免赔 $1,000、上限 $30,000，随物价调整；当年买当年生效，无等待期，每年续保 |
| 赔付 | `min(max(医疗费 − 当年免赔, 0), 当年上限)`；只保 `medicalCost`，不赔失业、父母照护或其他家庭支出 |
| 房产 | 初始参考价 $240,000；首付 20%+不可回收购置费 2%；按揭 30 年、年利率 5%、按月计算固定还款；当年维护按年初房值 1.2% |
| 房价 | 模拟年度变动依次为 −3%、−12%、−7%、−2%、−3%、+4%、+8%、+5%、+4%、+5%、+4%、+3%、+3%、+5%、+8%、−2%、+3%、+3%、+2%、+1%（2007–2026）；不是某地房价指数 |
| 住房使用 | 只有一套自住房；购买后免去租金，保留其他生活成本；无租金收入、卖房或提前还贷 |
| 车辆 | 基准购价 $18,000 随物价调整；每年折旧 15%，维护 $1,800 随物价调整；只购一辆，无卖车/车贷 |
| 成交 | 宽基、科技、消费、医疗、债券、黄金每侧成交额的 0.2%；卖出与买入分别收费，现金不收费 |
| 现金配置 | 不设现金下限或储备月数；年度再平衡按七类目标比例执行，0% 现金合法；维持持仓不主动补现金 |
| 现金不足 | 年末按比例出售非现金金融资产，并收费；仍不足形成现金缺口借款，次年开始按 12% 计息；现有现金优先还这类借款 |
| 税费与约束 | 工资已税后；未另计资本利得税、基金管理费、真实保险核保及金融产品申购限制；2019–2025 板块 ETF 的运营费已反映在源回报中 |

住房报价每年按同一模拟路径更新，无论角色是否已买房。房贷本金偿还减少现金并同额减少负债，不计作净资产损失；利息才是消费费用。首付和购车价格将现金换成实物资产，也不立即全部计作损失。房屋购置费计入家庭费用，车辆后续折旧计入资产变动。

## 固定的外生家庭事件

- 2008：税后工资为当前计划的 72%。
- 2009：税后工资为当前计划的 88%。
- 2012：角色发生 $42,000 医疗开支，按是否投保、免赔和上限计算赔款。
- 2015：父母照护支持 $9,000，记作家庭支出，不属于被保险人的医疗费。
- 2020：税后工资为当前计划的 80%，另有 $3,000 家庭支出。
- 2022：父母照护支持 $12,000，不属被保险人医疗费。
- 2024：角色医疗开支 $28,000，按当年保险参数赔付。
- 2026：架空情景设定 $5,000 临时家庭照护支出；不声称真实 2026 事件。
- 其余年份：工资按当前计划到账，无额外突发账单。

这些情节都是模拟，不据此推断真实职业风险或疾病概率。所有路径面对相同外生事件，选择会改变可负担能力和事件后果。事件金额本身固定为各发生年的名义美元值，不另乘物价指数。

## 指标定义

- **净资产：** 流动金融资产+房产+汽车−按揭−现金缺口借款。
- **家庭净投入：** 税后工资−生活/人生选择消费−保障与事件净费用−维护−贷款利息−房屋购置费；不含贷款本金和资产购买本金。
- **投资与资产变动：** 金融资产年度收益+房价变动−汽车折旧−成交费用。
- **年度金融回报指数：** 每年执行配置后的金融组合税费前年度回报相乘；不含工资入金、房车和交易费。该指数的最大回撤只观察年度节点。
- **净资产回撤：** 从历史年末净资产高点下降的比例；会受工资和消费影响，不能当作纯投资回撤。
- **无缺口年度：** 当年新增现金缺口借款不大于浮点容差且年末也没有剩余缺口借款；房贷不属于该指标。此项替代已移除的应急金月数目标。
- **实际购买力：** 期末净资产除以累计 2% 模拟物价指数；不是按真实历史 CPI 调整的财富。

## 可复现与局限

v0.3 扩展为 20 回合并采用独立玩家/AI 同桌账本。v0.1/v0.2 存档保留供下载；新版本单独开局，不能混用新引擎重放后声称旧结果不变。

不使用随机行情。数据版本、初始条件和每轮决策完整保留后，可以重放结果；更新引擎或数据版本需要重新验证存档。前端界面隐藏未来信息，但静态源代码包含全部剧情，用户也可能记得历史。可选真实大模型使用下述人工匿名信息摘要，但仍可能从机制组合识别历史情境；无法保证消除知识记忆造成的前视偏差。

## 2007–2018 行业资产：French 研究组合

科技（tech）、消费（consumer）、医疗（health）三类代理在 2007–2018 年采用 [Kenneth French 五行业研究组合方法](https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library/det_5_ind_port.html) 对应 HiTec、Cnsmr、Hlth 的价值加权含分红年度收益。它们是按 SIC 分类构造的学术研究组合，不是可直接购买的 ETF，也不与 GICS 行业分类等同。科技包含通讯等业务，消费包含耐用品和非耐用品等业务；与宽基持仓存在重叠。

官方方法页说明按每年六月末行业分类构造组合；文件头明确 Annual Returns 为一月至十二月。这是组合更新月份和收益统计区间的区别，本游戏采用自然年年度表，不把七月至次年六月误当一个回合。

本次官方 ZIP 下载遇到超时/502，实际采用 [原始 CSV 公开存档镜像](https://raw.githubusercontent.com/smartrus/kenneth-french-data-library/master/data/5_Industry_Portfolios.CSV)，文件头为“202002 CRSP database”。这是 2020 年 2 月数据库版本的固定快照，不声称已取得当前官方最新修订。取表名为 Average Value Weighted Returns -- Annual；未使用 Equal Weighted、月度数据求和或 ex. Dividends 版本。数值精度为百分数两位，程序转换为小数。

完整原始文件 SHA256：

`e5dd04abf70e747ff1a5173acd29039cf87425b984ca5ad144b85d50865842fb`

| 年份 | 科技 HiTec % | 消费 Cnsmr % | 医疗 Hlth % |
| --- | ---: | ---: | ---: |
| 2007 | 11.59 | 2.12 | 3.68 |
| 2008 | -40.78 | -25.87 | -17.27 |
| 2009 | 50.04 | 30.63 | 21.20 |
| 2010 | 16.84 | 21.59 | 4.70 |
| 2011 | 0.33 | 9.04 | 10.89 |
| 2012 | 16.68 | 16.25 | 20.38 |
| 2013 | 34.00 | 32.98 | 41.38 |
| 2014 | 14.57 | 12.71 | 24.49 |
| 2015 | 3.80 | 6.76 | 6.07 |
| 2016 | 13.79 | 5.52 | -4.47 |
| 2017 | 29.49 | 18.66 | 20.42 |
| 2018 | -1.01 | -3.62 | 4.22 |

数据 agent 与独立 audit agent 分别读取该存档年度表，36 个映射值一致。股票和行业组合均已包含分红，不再重复加股息；本游戏每侧交易费用另行扣除。将来替换为新版数据必须变更 DATA_VERSION 并重新核验，不静默修改旧结果。

## 2019–2025 行业资产：发行人 ETF 年度回报

延长至 2025 所需的 French 官方最新 ZIP 未能成功获取，不以旧镜像缺失值或虚构值续接。v0.3 明确改用发行人在 [2026-01-31 SEC 招募说明书](https://www.sec.gov/Archives/edgar/data/1064641/000119312526027312/d15107d485bpos.htm) 披露的自然年基金总回报：科技 XLK、**可选消费 XLY**、医疗 XLV。使用各基金 “Annual Total Returns (years ended 12/31)” 柱图数字，属于投资者税前、含分配再投资、已扣基金运营费用的净值回报；不是原始收盘价涨跌，也不是基准指数回报。

| 年份 | 科技 XLK % | 可选消费 XLY % | 医疗 XLV % |
| --- | ---: | ---: | ---: |
| 2019 | 49.97 | 28.42 | 20.66 |
| 2020 | 43.57 | 29.58 | 13.27 |
| 2021 | 34.53 | 27.83 | 25.92 |
| 2022 | -27.71 | -36.24 | -2.05 |
| 2023 | 55.98 | 39.64 | 1.99 |
| 2024 | 21.62 | 26.45 | 2.50 |
| 2025 | 24.60 | 7.37 | 14.51 |

原始图可独立复读：[XLK，正文第 80 页](https://www.sec.gov/Archives/edgar/data/1064641/000119312526027312/g15107img4820f56110.jpg)、[XLY，第 14 页](https://www.sec.gov/Archives/edgar/data/1064641/000119312526027312/g15107imgd7b71f512.jpg)、[XLV，第 47 页](https://www.sec.gov/Archives/edgar/data/1064641/000119312526027312/g15107img6f6843806.jpg)。本次下载原始图的 SHA256 依次为：

- XLK：`0bd7cfd0277c235db17dbb1b1ea06ffb3e1b227148ab2cd7d0aaa50915b14f82`
- XLY：`5188d5f78c9bebd66b000168d6f878e50f03d06fb952b014ef0e0d2e97458711`
- XLV：`8cc3d5e2f925ea6cd13cdf07e026bc27efef1bcd1902ee5333daae9c736d71cd`

**2019 是代理断点。** French SIC 五行业研究组合与这些 GICS 基金的分类、成分、权重、费用均不同；尤其 Cnsmr 包括更广的消费业务，XLY 只代表可选消费。游戏保留三个操作槽，按年份明确显示 `sectorProxy`，不把整段 2007–2025 宣称为同一指数或同一基金的连续回测。科技、消费、医疗与宽基仍可能持仓重叠。

2026-01-31 是历史数据来源版本，不是 2019–2025 年初已知材料。相应年度收益仅用于年末结算，不进入该年决策资讯或 AI 输入。

## 2026 架空情景终章

最后一轮 `dataKind: scenario`，其余年度为 `historical`（该标记仅说明行情类型，不把现金、房价或家庭剧情变成历史事实）。2026 的 `dataLabel`、标题、揭晓、锐评与原创封面均标明模拟；真实世界截至核验日没有完整 2026 全年答案。

| 资产 | 固定模拟年度回报 % |
| --- | ---: |
| 现金 | 2 |
| 宽基 | 4 |
| 科技 | -6 |
| 可选消费 | 5 |
| 医疗 | 9 |
| 国债 | 3 |
| 黄金 | 6 |

这些数值没有历史数据来源，是确定性教学题设，不是预测。住房 +1% 同属模拟。年初仍使用 2025 年已发布的政策、产业和就业资料，之后的年度结算与 $5,000 照护事件完全为架空安排。

## 年初信息可见性

每年年初提供 3 条中性简报（经济政策、行业进展、社会就业）和 3 项市场数据。政策、就业和行业简报记录 sourceUrl、asOf 与 publishedAt；asOf/publishedAt 为原始材料公开日期，均早于该回合 1 月 1 日。

失业率特意使用前一年 **11 月、在 12 月已经发布** 的季调值，不使用通常在次年 1 月才公布的 12 月值，也不拿当前修订后的时间序列回填。2006 年使用 12 月 22 日原始地区就业报告的全美值，2007 年使用 12 月 10 日 BLS 当期报道，其余使用对应就业报告。

| 回合 | 已知政策利率 | 政策声明公开日 | 前一年 11 月失业率 | 所用就业材料公开日 |
| --- | --- | --- | --- | --- |
| 2007 年初 | 5.25% | [2006-12-12](https://www.federalreserve.gov/newsevents/pressreleases/monetary20061212a.htm) | 4.5% | [2006-12-22](https://www.bls.gov/news.release/archives/laus_12222006.pdf) |
| 2008 年初 | 4.25% | [2007-12-11](https://www.federalreserve.gov/newsevents/pressreleases/monetary20071211a.htm) | 4.7% | [2007-12-10](https://www.bls.gov/opub/ted/2007/dec/wk2/art01.htm) |
| 2009 年初 | 0–0.25% | [2008-12-16](https://www.federalreserve.gov/newsevents/pressreleases/monetary20081216b.htm) | 6.7% | [2008-12-05](https://www.bls.gov/news.release/archives/empsit_12052008.htm) |
| 2010 年初 | 0–0.25% | [2009-12-16](https://www.federalreserve.gov/newsevents/pressreleases/monetary20091216a.htm) | 10.0% | [2009-12-04](https://www.bls.gov/news.release/archives/empsit_12042009.htm) |
| 2011 年初 | 0–0.25% | [2010-12-14](https://www.federalreserve.gov/newsevents/pressreleases/monetary20101214a.htm) | 9.8% | [2010-12-03](https://www.bls.gov/news.release/archives/empsit_12032010.htm) |
| 2012 年初 | 0–0.25% | [2011-12-13](https://www.federalreserve.gov/newsevents/pressreleases/monetary20111213a.htm) | 8.6% | [2011-12-02](https://www.bls.gov/news.release/archives/empsit_12022011.htm) |
| 2013 年初 | 0–0.25% | [2012-12-12](https://www.federalreserve.gov/newsevents/pressreleases/monetary20121212a.htm) | 7.7% | [2012-12-07](https://www.bls.gov/news.release/archives/empsit_12072012.htm) |
| 2014 年初 | 0–0.25% | [2013-12-18](https://www.federalreserve.gov/newsevents/pressreleases/monetary20131218a.htm) | 7.0% | [2013-12-06](https://www.bls.gov/news.release/archives/empsit_12062013.htm) |
| 2015 年初 | 0–0.25% | [2014-12-17](https://www.federalreserve.gov/newsevents/pressreleases/monetary20141217a.htm) | 5.8% | [2014-12-05](https://www.bls.gov/news.release/archives/empsit_12052014.htm) |
| 2016 年初 | 0.25–0.50% | [2015-12-16](https://www.federalreserve.gov/newsevents/pressreleases/monetary20151216a.htm) | 5.0% | [2015-12-04](https://www.bls.gov/news.release/archives/empsit_12042015.htm) |
| 2017 年初 | 0.50–0.75% | [2016-12-14](https://www.federalreserve.gov/newsevents/pressreleases/monetary20161214a.htm) | 4.6% | [2016-12-02](https://www.bls.gov/news.release/archives/empsit_12022016.htm) |
| 2018 年初 | 1.25–1.50% | [2017-12-13](https://www.federalreserve.gov/newsevents/pressreleases/monetary20171213a.htm) | 4.1% | [2017-12-08](https://www.bls.gov/news.release/archives/empsit_12082017.htm) |
| 2019 年初 | 2.25–2.50% | [2018-12-19](https://www.federalreserve.gov/newsevents/pressreleases/monetary20181219a.htm) | 3.7% | [2018-12-07](https://www.bls.gov/news.release/archives/empsit_12072018.htm) |
| 2020 年初 | 1.50–1.75% | [2019-12-11](https://www.federalreserve.gov/newsevents/pressreleases/monetary20191211a.htm) | 3.5% | [2019-12-06](https://www.bls.gov/news.release/archives/empsit_12062019.htm) |
| 2021 年初 | 0–0.25% | [2020-12-16](https://www.federalreserve.gov/newsevents/pressreleases/monetary20201216a.htm) | 6.7% | [2020-12-04](https://www.bls.gov/news.release/archives/empsit_12042020.htm) |
| 2022 年初 | 0–0.25% | [2021-12-15](https://www.federalreserve.gov/newsevents/pressreleases/monetary20211215a.htm) | 4.2% | [2021-12-03](https://www.bls.gov/news.release/archives/empsit_12032021.htm) |
| 2023 年初 | 4.25–4.50% | [2022-12-14](https://www.federalreserve.gov/newsevents/pressreleases/monetary20221214a.htm) | 3.7% | [2022-12-02](https://www.bls.gov/news.release/archives/empsit_12022022.htm) |
| 2024 年初 | 5.25–5.50% | [2023-12-13](https://www.federalreserve.gov/newsevents/pressreleases/monetary20231213a.htm) | 3.7% | [2023-12-08](https://www.bls.gov/news.release/archives/empsit_12082023.htm) |
| 2025 年初 | 4.25–4.50% | [2024-12-18](https://www.federalreserve.gov/newsevents/pressreleases/monetary20241218a.htm) | 4.2% | [2024-12-06](https://www.bls.gov/news.release/archives/empsit_12062024.htm) |
| 2026 年初 | 3.50–3.75% | [2025-12-10](https://www.federalreserve.gov/newsevents/pressreleases/monetary20251210a.htm) | 4.6% | [2025-12-16](https://www.bls.gov/news.release/archives/empsit_12162025.htm) |

2026 年初使用的 BLS 材料为 2025-12-16 原始发布：11 月失业率 4.6%，联邦政府停摆导致 10 月家庭调查未收集。正文明确数据空缺，不补造不存在的 10 月观测。

过去一年宽基回报为 NYU 当前整理的 **已经结束年份** 数据，源材料版本标为 sourceVintage: 2026-01（延展模块精确到 2026-01-05），retrospective: true，observationEnd 为过去一年末；其 asOf 表示观察期结束，**不冒充该版本数据库的历史发布日期**。界面明确“已结束年份的历史整理值”。尤其 2026 年初所示 2025 回报，数据库版本发布于 1 月 5 日，晚于游戏年初；所示的是已结束观察期的整理值，并非声称 1 月 1 日已取得该版本原表。这类历史整理可能有版本修订，因此不宣称完全还原当年数据库快照。AI 匿名摘要不含这些事后整理收益值。

| 回合 | 行业简报 | 原始材料公开日/来源 |
| --- | --- | --- |
| 2007 年初 | 服务器，也可以按需租 | [2006-03-14](https://press.aboutamazon.com/2006/3/amazon-web-services-launches) |
| 2008 年初 | 口袋里的小屏幕 | [2007-09-10](https://www.apple.com/newsroom/2007/09/10Apple-Sells-One-Millionth-iPhone/) |
| 2009 年初 | 手机上多了一家商店 | [2008-07-10](https://www.apple.com/newsroom/2008/07/10iPhone-3G-on-Sale-Tomorrow/) |
| 2010 年初 | 新流感推动医疗响应 | [2009-09-15](https://www.fda.gov/vaccines-blood-biologics/vaccines/influenza-h1n1-2009-monovalent-vaccines-questions-and-answers) |
| 2011 年初 | 电脑与手机之间 | [2010-01-27](https://www.apple.com/uk/newsroom/2010/01/27Apple-Launches-iPad/) |
| 2012 年初 | 开始对手机说话 | [2011-10-04](https://www.apple.com/uk/newsroom/2011/10/04Apple-Launches-iPhone-4S-iOS-5-iCloud/) |
| 2013 年初 | 换机理由，换了一种 | [2012-09-12](https://www.apple.com/newsroom/2012/09/12Apple-Introduces-iPhone-5/) |
| 2014 年初 | 口服丙肝新药获批 | [2013-12-06](https://www.accessdata.fda.gov/drugsatfda_docs/nda/2013/204671Orig1s000Approv.pdf) |
| 2015 年初 | 收银台前，拿出手机 | [2014-10-16](https://www.apple.com/newsroom/2014/10/16Apple-Pay-Set-to-Transform-Mobile-Payments-Starting-October-20/) |
| 2016 年初 | 购物节不只在年末 | [2015-07-15](https://press.aboutamazon.com/2015/7/amazon-announces-prime-day-update) |
| 2017 年初 | 癌症治疗有了新进展 | [2016-11-17](https://www.cancer.gov/news-events/cancer-currents-blog/2016/fda-atezolizumab-pembrolizumab-lung) |
| 2018 年初 | 细胞也成为治疗工具 | [2017-08-30](https://www.fda.gov/media/107337/download) |
| 2019 年初 | 可穿戴设备增加心电图功能 | [2018-12-06](https://www.apple.com/newsroom/2018/12/ecg-app-and-irregular-heart-rhythm-notification-available-today-on-apple-watch/) |
| 2020 年初 | 视频订阅服务上线 | [2019-11-01](https://www.apple.com/newsroom/2019/11/apple-tv-plus-is-now-available/) |
| 2021 年初 | 个人电脑厂商自研芯片 | [2020-11-10](https://www.apple.com/newsroom/2020/11/apple-unleashes-m1/) |
| 2022 年初 | 专业计算设备继续更换芯片路线 | [2021-10-18](https://www.apple.com/newsroom/2021/10/apple-unveils-game-changing-macbook-pro/) |
| 2023 年初 | 对话式生成工具研究预览 | [2022-11-30](https://openai.com/index/chatgpt/) |
| 2024 年初 | 镰状细胞病基因疗法获批 | [2023-12-08](https://www.fda.gov/news-events/press-announcements/fda-approves-first-gene-therapies-treat-patients-sickle-cell-disease) |
| 2025 年初 | 日常设备软件加入生成式功能 | [2024-10-28](https://www.apple.com/newsroom/2024/10/apple-intelligence-is-available-today-on-iphone-ipad-and-mac/) |
| 2026 年初 | 非阿片类急性疼痛药获批 | [2025-01-30](https://www.fda.gov/news-events/press-announcements/fda-approves-novel-non-opioid-treatment-moderate-severe-acute-pain) |

行业新闻只讲已经发生的产品、渠道或审批事实，相关经营问题是中性编辑提问；不根据随后的资产涨跌暗示买卖。企业原始发布中的宣传性结论未照搬。FDA/NCI 新闻仅提供产业背景，不构成医疗建议。相同年份的宏观数据不直接修改家庭工资或投资回报，实际规则仍以固定结算数据和已声明的模拟事件执行。

## 年度资产负债快照

每轮记录 startBalanceSheet 与 endBalanceSheet：年初为本次选择/购置/交易前，年末为行情、全年收入支出、保险、强制卖出和缺口借款清偿之后。各表包含 7 类金融资产、住房、车辆、房贷、缺口借款及资产/负债/净资产合计。

逐项年末减年初是**余额变化**，不是投资收益：买入、卖出、工资入金、消费和还本都会改变余额。总净资产变化依旧必须与家庭净投入加投资/资产变动对齐。

储备月数、现金下限与应急金评分已移除。年度再平衡直接按七类比例执行；hold 模式不主动补现金，但年初必要支付或年末收支不足仍可能触发金融资产出售。无现金不代表免费借钱，支出之后的现金缺口仍按既有借款规则处理。


## AI 可见信息与推理边界

`YEARS[].aiContext` 为 20 年各 3 条人工编写的 `{topic,title,text}` 摘要，逐条对应当前公开的政策、行业和就业资讯。它保留可分析的因果条件与分歧，去掉年份、具体机构/产品名、准确利率或金额和来源链接；不含当年收益、家庭事件、年末揭晓或锐评。`buildDecisionContext` 优先映射为 `news-1/2/3`，并与当前双方家庭状态、可选方案和公开规则一起提供给模型。原始新闻及其来源仍供玩家查阅，匿名摘要也向玩家展示。

v0.9 模型分析以 signalId 选择公开信号，观察原文由程序绑定；如返回自写观察仍须与允许材料一致。绑定只保证依据可追溯，不能证明自由推理正确。模型可能依据剩余机制组合或自身历史记忆识别情境，匿名不等于消除前视偏差。规则顾问与真实大模型明确区分；没有真实调用时不把本地规则输出伪称模型意见。

v0.9 的 8 条已知固定上游路由经现有 Sites 公共 `/api/ai` 中继（本机开发使用本机路由），未知自定义端点由浏览器直连并需 CORS。API Key 仅在页面内存保留；固定中继以 HTTPS POST JSON 请求体临时接收 `{provider, apiKey, request}`，再用上游 Authorization 转交，不保存、不记录请求日志、不缓存。它不是密钥不经过服务器的纯浏览器直连。模型仍只接收公开白名单，不读取本地完整未来数据集。兼容基础地址、合法 JSON 围栏与一次可选参数重试不放宽内容/决定边界；实现以 `dist/ai.js`、`dist/providers.js` 和服务器中继为准。本轮线上发布与真实兼容范围见最终审计记录。

玩家和 AI 同桌分别按自己的决策积累账本；若人生选择、购置或保障也不同，净资产差额不能只归因于投资配置。所谓“中国散户风格分位”仅为假设策略池在本游戏美国市场、美元计价环境中的模拟排序，不是真实中国投资者的统计样本或实际财富百分位。

## 影像与文字的时间边界

`dist/media.js` 保存 2006–2026 的 21 项时代素材：17 张真实历史照片、2022/2023/2024 三幅原创历史主题图解，以及 2026 架空情景封面。照片使用真实 `capturedAt`；图解使用当年 `eventDate` 与实际 `createdAt`，其 `capturedAt` 为 null，不能冒充当年照片。详见 `docs/ASSETS.md`。年初展示前一年主题，年末解锁本年素材；图解只使用当年已公开事实。2024 HBM 图解中“海力士的黄金时代”是趣味概括，不是官方称号或股价结论。媒体更换不改年度收益或固定 2% 模拟物价。每年 `roast` 是原创年末趣味短评，不是年初资讯或历史人物引语。40 个家庭选择、20 个外生事件与角色对话均属虚构剧情。
