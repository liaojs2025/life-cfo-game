# 年度新闻、开年背景与图片

当前模块：`dist/atlas-news.js`。两国各 40 篇，共 80 篇；新闻事件覆盖 1986–2025，开年背景覆盖 1987–2026。新闻是精选事件，不是该年全部新闻。

## 时间与内容合同

- `NEWS[country][year]`：该年事件的日期、标题、原创中文梗概、`channel` 主题、`impact` 教学传导解释及来源。
- `OPENING[country][year]`：仅使用上一年已经发生的事件编写开年背景；`asOf` 为上一年 12 月 31 日，不引用本年回报或未来家庭事件。
- `sourcePublishedAt`：能核验的原公告日期；为空时是历史事实的事后核验资料，不冒充当日已公开的报道。`sourceTiming` 区分原公告与追溯核验。
- `date` 是事件日期；`knownBy` 是事实的时点标签，不是现代资料页的上传时间。`analysisKind=educational-mechanism` 表明市场传导是解释，不能用单一事件归因全年涨跌。
- 当时的预期只按当时预期表达；例如 1989 年日经高点不预告后来下跌，2024 年已发生的 AI 资本开支不保证未来盈利。
- 文本均为自行撰写的简要概括；不转载新闻全文。财经资料以央行、政府、国际机构、上市公司原始披露为主。
- 模型输入使用界面之外的匿名机制摘要；年初素材与年末市场揭晓分开。人类读者可见历史名称，不代表模型能清除其训练记忆。

## 图片合同与授权

美日共 80 张新闻卡使用 80 张独立照片。完整和简要路线在重叠年份使用同一份新闻档案。所有图片自托管，路径为 `./assets/…`；本轮新增照片已压缩为适合网页的 JPEG。没有生成冒充历史的现场照片。

`imageKind=event` 表示同一事件或相关活动的实拍；`background` 为相关人物、机构、地区或行业的资料照片。页面明确显示二者差别及照片日期，不把 1937 年央行大楼、1950 年交易所或不同年份的人物照说成当年现场。拍摄日期只有年精度时保留该精度，不补造月日。

每条保留作者、原始文件页、原图地址、许可链接和 SHA-256。文件缩放、压缩和网页裁切不改变原始授权；署名、CC BY-SA 等要求继续适用于对应素材。公共领域条目标明来源机构；`Attribution` 条目以原文件页给出的授权文本为准。

来源页面和图片授权是不同来源。已有馆藏图可能在事后上传；图片日期是拍摄日期，不把上传日期当成当年的公开证据。无法核实或与主题不符的图不采用：已移除爱知世博会标志图，换成实际场馆照片。

## 新闻目录

| 国家 | 事件日期 | 标题 | 事实来源 | 图片用途 |
|---|---|---|---|---|
| 美国 | 1986-10-22 | 税制重写，企业重新计算账本 | [里根总统图书馆：签署税改法案讲话](https://www.reaganlibrary.gov/archives/speech/remarks-signing-tax-reform-act-1986) | 事件相关实拍 · reagan-tax-1986 |
| 美国 | 1987-10-19 | 黑色星期一：流动性突然消失 | [美联储历史：1987年股灾](https://www.federalreservehistory.org/essays/stock-market-crash-of-1987) | 资料照片 · nyse-1963 |
| 美国 | 1988-08-23 | 贸易与竞争力，写入新法 | [白宫历史档案：1988年贸易法](https://georgewbush-whitehouse.archives.gov/history/thisday/0823_njs.html) | 资料照片 · trade |
| 美国 | 1989-08-09 | 储贷危机进入制度重建 | [FDIC：1980年代金融史](https://www.fdic.gov/history/1980-1989) | 资料照片 · fedny |
| 美国 | 1990-08-02 | 海湾供给中断，油价突然跳升 | [美国能源信息署：历史原油供给中断](https://www.eia.gov/todayinenergy/detail.php?id=730) | 资料照片 · gulf |
| 美国 | 1991-08-06 | 万维网走出实验室 | [W3C：万维网公开发布25周年](https://www.w3.org/blog/2016/25-years-ago-the-world-changed-forever/) | 资料照片 · annual-us-1991 |
| 美国 | 1992-09-04 | 短端利率进一步降低 | [美联储：公开市场操作历史](https://www.federalreserve.gov/monetarypolicy/openmarket_archive.htm) | 资料照片 · greenspan |
| 美国 | 1993-12-08 | 北美自贸区进入实施准备 | [美国国际贸易委员会：1993年贸易回顾](https://www.usitc.gov/publications/332/pub2769_0.pdf) | 资料照片 · nafta |
| 美国 | 1994-02-04 | 美联储开始收紧短端利率 | [美联储：公开市场操作历史](https://www.federalreserve.gov/monetarypolicy/openmarket_archive.htm) | 资料照片 · annual-us-1994 |
| 美国 | 1995-07-06 | 紧缩之后，小幅降息 | [美联储当日公告](https://www.federalreserve.gov/fomc/19950706default.htm) | 资料照片 · fed-1937 |
| 美国 | 1996-12-05 | 非理性繁荣，成为市场提问 | [格林斯潘：民主社会中的中央银行](https://www.federalreserve.gov/boarddocs/speeches/1996/19961205.htm) | 资料照片 · annual-us-1996 |
| 美国 | 1997-07-02 | 亚洲金融风暴进入全球视野 | [IMF：泰国汇率行动公告](https://www.imf.org/en/news/articles/2015/09/29/18/03/nb9712) | 资料照片 · annual-us-1997 |
| 美国 | 1998-09-23 | 精密模型遇上流动性 | [格林斯潘国会证词](https://www.federalreserve.gov/boarddocs/testimony/1998/19981001.htm) | 资料照片 · annual-us-1998 |
| 美国 | 1999-11-12 | 金融业务的边界被改写 | [美联储历史：金融服务现代化法](https://www.federalreservehistory.org/essays/gramm-leach-bliley-act) | 资料照片 · treasury |
| 美国 | 2000-12-29 | 技术改变世界，价格仍需检验 | [波士顿联储市场报告](https://www.bostonfed.org/-/media/Documents/stock-market-report/smr0801.pdf) | 资料照片 · annual-us-2000 |
| 美国 | 2001-09-11 | 市场首先需要恢复运转 | [美联储当日声明](https://www.federalreserve.gov/boarddocs/press/general/2001/20010911/default.htm) | 事件相关实拍 · sept11 |
| 美国 | 2002-07-30 | 公司治理，进入财报核心 | [SEC：萨班斯—奥克斯利法案原文](https://www.sec.gov/about/laws/soa2002.pdf) | 事件相关实拍 · annual-us-2002 |
| 美国 | 2003-06-25 | 联邦基金利率降至1% | [美联储：2003年6月25日决定](https://www.federalreserve.gov/boarddocs/press/monetary/2003/20030625/default.htm) | 资料照片 · annual-us-2003 |
| 美国 | 2004-06-30 | 利率正常化迈出第一步 | [美联储：2004年6月30日决定](https://www.federalreserve.gov/boarddocs/press/monetary/2004/20040630/default.htm) | 资料照片 · annual-us-2004 |
| 美国 | 2005-08-29 | 卡特里娜冲击海湾沿岸 | [NOAA/NHC：卡特里娜飓风报告](https://www.nhc.noaa.gov/data/tcr/AL122005_Katrina.pdf) | 事件相关实拍 · katrina-2005 |
| 美国 | 2006-06-29 | 政策利率达到5.25% | [美联储：2006年6月29日决定](https://www.federalreserve.gov/newsevents/pressreleases/monetary20060629a.htm) | 资料照片 · fed06 |
| 美国 | 2007-09-18 | 信用收紧，央行首次大幅降息 | [美联储：2007年9月18日声明](https://www.federalreserve.gov/newsevents/pressreleases/monetary20070918a.htm) | 资料照片 · subprime |
| 美国 | 2008-09-15 | 雷曼倒下，信用链条收紧 | [美联储2008年报告](https://www.federalreserve.gov/BoardDocs/RptCongress/annual08/sec1/c1.htm) | 事件相关实拍 · history-2008 |
| 美国 | 2009-03-18 | 央行影响更长的利率 | [美联储FOMC公告](https://www.federalreserve.gov/newsevents/pressreleases/monetary20090318a.htm) | 资料照片 · annual-us-2009 |
| 美国 | 2010-07-21 | 金融危机后的规则重建 | [美国国会：多德弗兰克法案记录](https://www.congress.gov/bill/111th-congress/house-bill/4173) | 事件相关实拍 · dodd-frank-2010 |
| 美国 | 2011-08-02 | 债务上限争议，留下财政约束 | [美国国会：2011年预算控制法案](https://www.congress.gov/bill/112th-congress/senate-bill/365) | 事件相关实拍 · capitol |
| 美国 | 2012-09-13 | 资产购买转向开放式安排 | [美联储：2012年9月13日决定](https://www.federalreserve.gov/newsevents/pressreleases/monetary20120913a.htm) | 资料照片 · annual-us-2012 |
| 美国 | 2013-12-18 | 减速购买，不等于立刻加息 | [美联储FOMC公告](https://www.federalreserve.gov/newsevents/pressreleases/monetary20131218a.htm) | 资料照片 · fed13 |
| 美国 | 2014-12-12 | 油价下滑，页岩供应仍在增长 | [美国能源信息署：低油价与美国原油生产](https://www.eia.gov/todayinenergy/detail.php?id=19171) | 资料照片 · shale |
| 美国 | 2015-12-16 | 零利率时代迈出一步 | [美联储FOMC公告](https://www.federalreserve.gov/newsevents/pressreleases/monetary20151216a.htm) | 事件相关实拍 · yellen |
| 美国 | 2016-06-23 | 英国公投，全球企业重估边界 | [英国选举委员会：2016年公投报告](https://www.electoralcommission.org.uk/research-reports-and-data/our-reports-and-data-past-elections-and-referendums/report-23-june-2016-referendum-uks-membership-european-union) | 资料照片 · history-2016 |
| 美国 | 2017-12-22 | 税改落地，利润预期重算 | [美国国会：2017年税改立法](https://www.congress.gov/bill/115th-congress/house-bill/1) | 事件相关实拍 · tax17 |
| 美国 | 2018-03-08 | 钢铝关税，改变投入成本 | [白宫档案：钢铁进口公告](https://trumpwhitehouse.archives.gov/presidential-actions/presidential-proclamation-adjusting-imports-steel-united-states/) | 资料照片 · annual-us-2018 |
| 美国 | 2019-09-17 | 回购市场的资金价格跳升 | [纽约联储：2019年9月17日操作声明](https://www.newyorkfed.org/markets/opolicy/operating_policy_190917) | 资料照片 · annual-us-2019 |
| 美国 | 2020-03-23 | 停摆冲击与流动性支持 | [美联储FOMC公告](https://www.federalreserve.gov/newsevents/pressreleases/monetary20200323a.htm) | 事件相关实拍 · history-2020 |
| 美国 | 2021-11-03 | 供应瓶颈与物价压力，促使减购启动 | [美联储：2021年11月3日声明](https://www.federalreserve.gov/newsevents/pressreleases/monetary20211103a.htm) | 资料照片 · federal |
| 美国 | 2022-03-16 | 通胀扳回政策方向 | [美联储FOMC公告](https://www.federalreserve.gov/newsevents/pressreleases/monetary20220316a.htm) | 资料照片 · powell22 |
| 美国 | 2023-03-12 | 久期风险遇上存款流失 | [美联储银行融资计划公告](https://www.federalreserve.gov/newsevents/pressreleases/monetary20230312a.htm) | 资料照片 · svb |
| 美国 | 2024-07-30 | AI算力投资，走进资本开支账本 | [微软：2024财年第四季度财报电话会](https://www.microsoft.com/en-us/investor/events/FY-2024/earnings-fy-2024-q4) | 资料照片 · techbuilding |
| 美国 | 2025-04-02 | 新一轮关税，重排贸易成本 | [美国联邦公报：2025年4月2日第14257号行政命令](https://www.govinfo.gov/content/pkg/FR-2025-04-07/html/2025-06063.htm) | 事件相关实拍 · annual-us-2025 |
| 日本 | 1986-11-01 | 日元升值背景下，利率继续下调 | [日本银行：公定步合历史](https://www.boj.or.jp/en/statistics/boj/other/discount/discount.htm) | 资料照片 · annual-jp-1986 |
| 日本 | 1987-02-23 | 公定步合降至2.5% | [日本银行：公定步合历史](https://www.boj.or.jp/en/statistics/boj/other/discount/discount.htm) | 资料照片 · boj84 |
| 日本 | 1988-04-10 | 濑户大桥连通本州与四国 | [本州四国联络高速公路：桥梁资料](https://www.jb-honshi.co.jp/english/customer_index/guide/route-guide/use_d.html) | 资料照片 · tokyo-1985 |
| 日本 | 1989-12-29 | 日经年末收于当时历史新高 | [日本证券业协会：1999统计年鉴历史行情表](https://www.jsda.or.jp/shiryoshitsu/toukei/factbook/files/efb1999.pdf) | 资料照片 · grand |
| 日本 | 1990-08-30 | 公定步合升至6% | [日本银行：公定步合历史](https://www.boj.or.jp/en/statistics/boj/other/discount/discount.htm) | 资料照片 · tokyo-exchange-1950 |
| 日本 | 1991-07-01 | 政策由升息转为降息 | [日本银行：公定步合历史](https://www.boj.or.jp/en/statistics/boj/other/discount/discount.htm) | 资料照片 · annual-jp-1991 |
| 日本 | 1992-07-27 | 宽松继续，借贷需求仍需观察 | [日本银行：公定步合历史](https://www.boj.or.jp/en/statistics/boj/other/discount/discount.htm) | 资料照片 · bojosaka |
| 日本 | 1993-07-07 | 东京峰会讨论增长与就业 | [日本外务省：历届峰会记录](https://www.mofa.go.jp/mofaj/gaiko/summit/table/index.html) | 事件相关实拍 · summit93 |
| 日本 | 1994-09-04 | 关西机场开港，连接全球航线 | [日本运输白皮书：关西机场开港](https://www.mlit.go.jp/english/white-paper/unyu-whitepaper/1994/1994000001.html) | 事件相关实拍 · kansai-1994 |
| 日本 | 1995-01-17 | 阪神大地震与经济网络 | [日本运输白皮书1995](https://www.mlit.go.jp/english/white-paper/unyu-whitepaper/1995/1995010101.html) | 事件相关实拍 · hanshin-1995 |
| 日本 | 1996-11-11 | 金融大爆炸改革启动 | [日本金融厅：金融改革主要步骤](https://www.fsa.go.jp/p_mof/english/big-bang/ebb6.htm) | 资料照片 · annual-jp-1996 |
| 日本 | 1997-11-24 | 山一证券退出与金融信任 | [日本银行1997财年政策决定](https://www2.boj.or.jp/archive/en/announcements/release_1998/giji97.htm) | 资料照片 · annual-jp-1997 |
| 日本 | 1998-04-01 | 新日本银行法正式施行 | [日本银行：历史概览](https://www.boj.or.jp/en/about/outline/history/index.htm) | 资料照片 · annual-jp-1998 |
| 日本 | 1999-02-12 | 短期利率走向零 | [日本银行当日决定](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_1999/k990212c.htm) | 资料照片 · annual-jp-1999 |
| 日本 | 2000-08-11 | 日本银行退出零利率安排 | [日本银行：2000年8月11日决定](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2000/k000811.htm) | 资料照片 · hayami |
| 日本 | 2001-03-19 | 从利率工具走向数量工具 | [日本银行：新市场操作程序](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2001/k010319a.htm) | 资料照片 · annual-jp-2001 |
| 日本 | 2002-05-31 | 世界杯首次来到亚洲 | [FIFA：2002年韩日世界杯](https://www.fifa.com/en/tournaments/mens/worldcup/2002) | 事件相关实拍 · foot02 |
| 日本 | 2003-05-17 | 理索纳获得公共资本支持 | [日本银行：理索纳银行声明](https://www.boj.or.jp/en/about/press/danwa/dan0305a.htm) | 资料照片 · annual-jp-2003 |
| 日本 | 2004-10-23 | 新潟地震再次检验基础设施 | [日本地震调查委员会：新潟中越地震](https://www.jishin.go.jp/main/chousa/04oct_niigata/index-e.htm) | 事件相关实拍 · quake04 |
| 日本 | 2005-03-25 | 爱知世博会开幕 | [国际展览局：2005年爱知世博会](https://apps.bie-paris.org/site/en/2005-aichi?layout=bieparis%3Aexpo&view=bieexpo) | 事件相关实拍 · expo05 |
| 日本 | 2006-03-09 | 数量宽松退出，利率仍保持低位 | [日本银行：货币市场操作框架调整](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2006/k060309.htm) | 资料照片 · fukui |
| 日本 | 2007-02-21 | 隔夜利率目标提高至0.5% | [日本银行：2007年2月21日决定](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2007/k070221.pdf) | 资料照片 · annual-jp-2007 |
| 日本 | 2008-10-31 | 海外危机穿过出口订单 | [日本银行货币政策决定](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2008/k081031.pdf) | 资料照片 · transport |
| 日本 | 2009-02-19 | 央行把支持延伸到企业债 | [日本银行：增强企业融资支持](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2009/k090219.pdf) | 资料照片 · port |
| 日本 | 2010-10-05 | 综合宽松与资产购买基金 | [日本银行：综合货币宽松](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2010/k101005.pdf) | 资料照片 · tokyoboj |
| 日本 | 2011-03-11 | 供应链在震灾中显形 | [日本银行增强宽松公告](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2011/k110314a.pdf) | 事件相关实拍 · tohoku-2011 |
| 日本 | 2012-02-14 | 物价稳定目标进入政策表达 | [日本银行：中长期物价稳定目标](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2012/k120214b.pdf) | 资料照片 · annual-jp-2012 |
| 日本 | 2013-04-04 | 数量与期限一起改变 | [日本银行量化质化宽松公告](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2013/k130404a.pdf) | 资料照片 · annual-jp-2013 |
| 日本 | 2014-04-01 | 税率改变消费的节奏 | [日本财政省消费税调整决定](https://www.mof.go.jp/english/policy/tax_policy/others/20131001cd.pdf) | 资料照片 · yen |
| 日本 | 2015-12-18 | 宽松框架增加补充措施 | [日本银行：补充量化质化宽松措施](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2015/k151218a.pdf) | 资料照片 · kuroda |
| 日本 | 2016-01-29 | 利率进入负数区间 | [日本银行负利率公告](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2016/k160129a.pdf) | 资料照片 · annual-jp-2016 |
| 日本 | 2017-05-20 | 愿景基金开启大规模科技投资 | [软银集团：愿景基金首次交割](https://www.softbank.jp/corp/d/group_news/press_20170520_01_en.pdf) | 资料照片 · softshop |
| 日本 | 2018-12-30 | CPTPP开始生效 | [日本外务省：CPTPP](https://www.mofa.go.jp/ecm/ep/page25e_000372.html) | 资料照片 · tpp |
| 日本 | 2019-10-01 | 消费税提高，部分商品保留低税率 | [日本财政省：2019年消费税调整](https://www.mof.go.jp/english/policy/tax_policy/consumption_tax/) | 资料照片 · jpretail |
| 日本 | 2020-03-16 | 经营现金流成为政策焦点 | [日本银行疫情应对公告](https://www.boj.or.jp/en/mopo/mpmdeci/state_2020/k200316b.pdf) | 资料照片 · jpxfloor |
| 日本 | 2021-07-23 | 东京奥运会在疫情条件下开幕 | [国际奥委会：东京2020奥运会](https://olympics.com/en/olympic-games/tokyo-2020) | 事件相关实拍 · olympics2 |
| 日本 | 2022-09-22 | 日元贬值引出外汇干预 | [三菱日联向SEC提交的当期报告](https://www.sec.gov/Archives/edgar/data/67088/000006708822000011/mufg-20220930_d2.htm) | 资料照片 · annual-jp-2022 |
| 日本 | 2023-07-28 | 收益率曲线控制增加灵活性 | [日本银行：更灵活的收益率曲线控制](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2023/k230728a.pdf) | 资料照片 · ueda |
| 日本 | 2024-03-19 | 结束负利率，重估资金成本 | [日本银行政策框架变更](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2024/k240319a.pdf) | 资料照片 · annual-jp-2024 |
| 日本 | 2025-12-19 | 年末再加息，目标达到0.75% | [日本银行：2025年12月19日决定](https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2025/k251219a.pdf) | 资料照片 · annual-jp-2025 |

## 图片清单

| 图片 ID | 拍摄日期 | 内容与作者 | 许可 | 原始出处 |
|---|---|---|---|---|
| reagan-tax-1986 | 1986-10-22 | 里根签署1986年税制改革法案 / President (1981-1989 : Reagan). White House Photographic Office. 1981-1989 | [Public domain](https://commons.wikimedia.org/wiki/File:President_Ronald_Reagan_Signing_The_Tax_Reform_Act_of_1986_with_Members_of_Congress_and_White_House_Staff_Present_on_The_South_Lawn_Dole_Moynihan_Kemp_Byrd_Regan_Rostenkowski_Thurmo_-_DPLA_-_0ee37d5f41724395407d4df0f7116853.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:President_Ronald_Reagan_Signing_The_Tax_Reform_Act_of_1986_with_Members_of_Congress_and_White_House_Staff_Present_on_The_South_Lawn_Dole_Moynihan_Kemp_Byrd_Regan_Rostenkowski_Thurmo_-_DPLA_-_0ee37d5f41724395407d4df0f7116853.jpg) |
| nyse-1963 | 1963-09-26 | 1963年纽约证券交易所交易大厅档案照片 / Thomas J. O'Halloran | [Public domain](https://commons.wikimedia.org/wiki/File:NY_stock_exchange_traders_floor_LC-U9-10548-6.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:NY_stock_exchange_traders_floor_LC-U9-10548-6.jpg) |
| trade | 1973-04 | 美国钢铁公司的厂区 / Paul Sequeira | [Public domain](https://commons.wikimedia.org/wiki/File:U.S._STEEL_PLANT_-_NARA_-_547097_(retouched).jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:U.S._STEEL_PLANT_-_NARA_-_547097_(retouched).jpg) |
| fedny | 1924 | 纽约联储的金库 / Sarah Estes | [Public domain](https://commons.wikimedia.org/wiki/File:New_York_Federal_Reserve_Bank_Vault.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:New_York_Federal_Reserve_Bank_Vault.jpg) |
| gulf | 1990-11-22 | 布什在沙特阿拉伯与驻军交谈 / Unknown authorUnknown author | [Public domain](https://commons.wikimedia.org/wiki/File:Bush_troops.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Bush_troops.jpg) |
| annual-us-1991 | 1965-04-23 | 万维网诞生地 CERN 的早期园区与质子同步加速器 / CERN | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [文件页](https://commons.wikimedia.org/wiki/File:Aerial_view_of_PS_at_CERN_in_1965.jpg) |
| greenspan | 1974-09-05 | 白宫通胀会议，格林斯潘与福特总统等人交谈 / Unknown authorUnknown author or not provided | [Public domain](https://commons.wikimedia.org/wiki/File:Senator_William_Proxmire,_Alan_Greenspan,_President_Gerald_R._Ford,_Representative_John_Rhodes,_and_Representative_Wright_Patman_at_a_Conference_on_Inflation_at_the_White_House_-_NARA_-_12082617.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Senator_William_Proxmire,_Alan_Greenspan,_President_Gerald_R._Ford,_Representative_John_Rhodes,_and_Representative_Wright_Patman_at_a_Conference_on_Inflation_at_the_White_House_-_NARA_-_12082617.jpg) |
| nafta | 1992-10-07 | 1992 年北美自贸协定草签仪式 / David Valdez | [Public domain](https://commons.wikimedia.org/wiki/File:President_Bush,_Canadian_Prime_Minister_Brian_Mulroney_and_Mexican_President_Carlos_Salinas_participate_in_the..._-_NARA_-_186460.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:President_Bush,_Canadian_Prime_Minister_Brian_Mulroney_and_Mexican_President_Carlos_Salinas_participate_in_the..._-_NARA_-_186460.jpg) |
| annual-us-1994 | 1993-01-28 | 克林顿、戈尔与格林斯潘在白宫讨论经济 / White House Photograph Office, Clinton Administration | [Public domain](https://commons.wikimedia.org/wiki/File:President_Bill_Clinton_and_Vice_President_Al_Gore_meeting_with_Chair_of_the_Federal_Reserve_Alan_Greenspan_and_others_in_the_Oval_Office_of_the_White_House_(25).jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:President_Bill_Clinton_and_Vice_President_Al_Gore_meeting_with_Chair_of_the_Federal_Reserve_Alan_Greenspan_and_others_in_the_Oval_Office_of_the_White_House_(25).jpg) |
| fed-1937 | 1937-10-20 | 1937年美联储总部建筑档案照片 / Federalreserve | [Public domain](https://commons.wikimedia.org/wiki/File:US_Federal_Reserve_Eccles_Building_1937.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:US_Federal_Reserve_Eccles_Building_1937.jpg) |
| annual-us-1996 | 1987 | 提出“非理性繁荣”之问的格林斯潘 / Craigterkowitz | [CC0](https://creativecommons.org/publicdomain/zero/1.0/deed.en) | [文件页](https://commons.wikimedia.org/wiki/File:Alan_Greenspan,_Federal_Reserve_chairman._Photo_by_Craig_Terkowitz.jpg) |
| annual-us-1997 | 1993 | 1993 年曼谷河岸的建筑与船只，摄影者留存的危机前影像 / Nick Kenrick from wirral, UK | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件页](https://commons.wikimedia.org/wiki/File:Bangkok_series_.._1993_(14386296639).jpg) |
| annual-us-1998 | 1992-08-14 | 从世贸中心俯瞰纽约金融区与东河 / Fanghong | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [文件页](https://commons.wikimedia.org/wiki/File:NYEastRiver_From_WTC.jpg) |
| treasury | 1999-04-26 | 美国财政部长罗伯特·鲁宾在记者会上 / 美国财政部 Office of Public Affairs | [Public domain](https://commons.wikimedia.org/wiki/File:Pr4262ls-treasury-rubin.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Pr4262ls-treasury-rubin.jpg) |
| annual-us-2000 | 1998-06-01 | 互联网热潮中的美国 COMDEX 春季计算机展 / atramos | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件页](https://commons.wikimedia.org/wiki/File:COMDEX_Spring_1998_-_S006i002.jpg) |
| sept11 | 2001-09-11 | 纽约港巡逻船驶向曼哈顿下城 / US Army Corps of Engineers from USA | [Public domain](https://commons.wikimedia.org/wiki/File:USACE_Patrol_Boat_Hocking_heads_toward_lower_Manhattan_on_9-11.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:USACE_Patrol_Boat_Hocking_heads_toward_lower_Manhattan_on_9-11.jpg) |
| annual-us-2002 | 2002-07-30 | 《萨班斯—奥克斯利法案》签署前，布什与提案议员会面 / The Bush White House | [Public domain](https://commons.wikimedia.org/wiki/File:President_George_W._Bush_meets_with_Senator_Paul_Sarbanes_and_Secretary_of_Labor_Elaine_Chao.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:President_George_W._Bush_meets_with_Senator_Paul_Sarbanes_and_Secretary_of_Labor_Elaine_Chao.jpg) |
| annual-us-2003 | 1992-12 | 纽约布鲁克林海门住宅区航拍，家庭按揭是利率传导的一环 / U.S. Army Corps of Engineers（摄影者未署名） | [Public domain](https://commons.wikimedia.org/wiki/File:Sea_Gate_aerial_view.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Sea_Gate_aerial_view.jpg) |
| annual-us-2004 | 2000 | 纽约曼哈顿下城金融区与世贸双塔 / 小林 良規 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件页](https://commons.wikimedia.org/wiki/File:View_of_the_Lower_Manhattan_skyline_including_the_World_Trade_Center_twin_towers_07.jpg) |
| katrina-2005 | 2005-08-28 | 飓风观测机拍摄的卡特里娜飓风风眼 / NOAA | [Public domain](https://commons.wikimedia.org/wiki/File:Hurricane_Katrina_Eye_viewed_from_Hurricane_Hunter.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Hurricane_Katrina_Eye_viewed_from_Hurricane_Hunter.jpg) |
| fed06 | 2006-02-06 | 伯南克宣誓就任美联储主席 / White House photo by Kimberlee Hewitt | [Public domain](https://commons.wikimedia.org/wiki/File:Ben_Bernanke_sworn_in_to_the_Federal_Reserve_Post.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Ben_Bernanke_sworn_in_to_the_Federal_Reserve_Post.jpg) |
| subprime | 2007-09-14 | 2007 年 9 月，英国北岩银行网点外排队的储户 / Alex Gunningham from London, Perfidious Albion (UK plc) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件页](https://commons.wikimedia.org/wiki/File:Northern_Rock_Customers,_September_14,_2007.jpg) |
| history-2008 | 2008-09-15 | 2008 年 9 月 15 日，雷曼兄弟申请破产。照片记录了当天的纽约总部。 / Robert Scoble | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件页](https://commons.wikimedia.org/wiki/File:Lehman_Brothers-20080915.jpg) |
| annual-us-2009 | 2009-04-10 | 金融危机期间，奥巴马与美联储主席伯南克在白宫会谈 / Pete Souza, official White House photographer | [Public domain](https://commons.wikimedia.org/wiki/File:President_Barack_Obama_meets_with_Federal_Reserve_Chairman_Ben_Bernanke_4-10-09.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:President_Barack_Obama_meets_with_Federal_Reserve_Chairman_Ben_Bernanke_4-10-09.jpg) |
| dodd-frank-2010 | 2010-07-21 | 奥巴马签署多德弗兰克金融改革法案 / Nancy Pelosi from San Francisco, CA | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件页](https://commons.wikimedia.org/wiki/File:President_Obama_Signs_the_Dodd-Frank_Wall_Street_Reform_and_Consumer_Protection_Act_(4816864266).jpg) |
| capitol | 2011-07-03 | 奥巴马与众议院议长博纳商议债务上限 / Pete Souza | [Public domain](https://commons.wikimedia.org/wiki/File:President_Obama_%26_John_Boehner_debt_ceiling_negotiations.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:President_Obama_%26_John_Boehner_debt_ceiling_negotiations.jpg) |
| annual-us-2012 | 2008 | 美联储主席伯南克的官方肖像 / United States Federal Reserve | [Public domain](https://commons.wikimedia.org/wiki/File:Ben_Bernanke_official_portrait.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Ben_Bernanke_official_portrait.jpg) |
| fed13 | 2013-06-19 | 美联储主席伯南克在记者会上 / Federalreserve | [Public domain](https://commons.wikimedia.org/wiki/File:Bernanke_Briefing_2013_(9088486134)_(cropped).jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Bernanke_Briefing_2013_(9088486134)_(cropped).jpg) |
| shale | 2012-01-30 | 巴肯油田勘探取出的岩芯 / Joshua Doubek | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [文件页](https://commons.wikimedia.org/wiki/File:Pulling_the_Bakken_Core_out_of_the_core_barrell.JPG) |
| yellen | 2015-12-16 | 美联储主席耶伦在议息会议后的记者会上 / Federalreserve | [Public domain](https://commons.wikimedia.org/wiki/File:Janet_Yellen_(23712797651).jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Janet_Yellen_(23712797651).jpg) |
| history-2016 | 2016-06-21 | 2016 年 6 月英国公投前，伦敦街头同时出现支持留欧和脱欧的海报。 / Philip Stevens | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件页](https://commons.wikimedia.org/wiki/File:Vote_Leave_and_Vote_Remain_posters_in_Pimlico,_June_2016.jpg) |
| tax17 | 2017-12-20 | 白宫庆祝国会通过税改法案 / The White House from Washington, DC | [Public domain](https://commons.wikimedia.org/wiki/File:President_Donald_J._Trump,_Vice_President_Mike_Pence,_and_Republican_Legislators_celebrate_the_passage_of_the_Tax_Cuts_Act.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:President_Donald_J._Trump,_Vice_President_Mike_Pence,_and_Republican_Legislators_celebrate_the_passage_of_the_Tax_Cuts_Act.jpg) |
| annual-us-2018 | 2013-05-19 | 宾夕法尼亚州克莱尔顿焦化厂，钢铁供应链的一个环节 / Roy Luck | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件页](https://commons.wikimedia.org/wiki/File:US_Steel_Clairton_Works,_Clairton_PA_(8900609120).jpg) |
| annual-us-2019 | 2007-07-06 | 纽约联储位于自由街的总部 / Dmadeo | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [文件页](https://commons.wikimedia.org/wiki/File:Federal-reserve-33-liberty.jpg) |
| history-2020 | 2020-03-21 | 2020 年 3 月 21 日，疫情初期的纽约曼哈顿第三大道与第九十街路口，交通明显减少。 / Deans Charbal | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件页](https://commons.wikimedia.org/wiki/File:Empty_3rd_Avenue_@_90th_Street_in_Yorkville,_Manhattan,_looking_north,_at_the_beginning_of_COVID-19_on_March_21,_2020.jpg) |
| federal | 2019-04-23 | 美联储理事会在华盛顿开会 / Federalreserve | [Public domain](https://commons.wikimedia.org/wiki/File:Federal_Reserve_Governors_meeting_April_2019_(47679887231).jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Federal_Reserve_Governors_meeting_April_2019_(47679887231).jpg) |
| powell22 | 2022-05-23 | 鲍威尔宣誓连任美联储主席 / Federalreserve | [Public domain](https://commons.wikimedia.org/wiki/File:NZ78609_(52094516026).jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:NZ78609_(52094516026).jpg) |
| svb | 2023-04-01 | 硅谷银行门洛帕克网点 / King of Hearts | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件页](https://commons.wikimedia.org/wiki/File:SVB_Kleiner_Perkins_Menlo_Park_April_2023.jpg) |
| techbuilding | 2008-04-19 | 英伟达在加州圣克拉拉的总部 / Coolcaesar at English Wikipedia | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [文件页](https://commons.wikimedia.org/wiki/File:Nvidiaheadquarters.jpg) |
| annual-us-2025 | 2025-04-02 | 白宫公布新一轮关税方案时，特朗普展示税率表 / The White House | [Public domain](https://commons.wikimedia.org/wiki/File:Trump_showing_a_chart_with_reciprocal_tariffs.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Trump_showing_a_chart_with_reciprocal_tariffs.jpg) |
| annual-jp-1986 | 1986-05-04 | 东京峰会期间，中曾根康弘迎接来访的里根 / 摄影者未署名（美国联邦政府档案） | [Public domain](https://commons.wikimedia.org/wiki/File:Nakasone_and_Reagan_reviewing_troops_at_arrival_ceremony_at_Palace_in_Tokyo,_Japan_May_4,_1986.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Nakasone_and_Reagan_reviewing_troops_at_arrival_ceremony_at_Palace_in_Tokyo,_Japan_May_4,_1986.jpg) |
| boj84 | 1984 | 日本银行东京总行 / retouch: Qurren (talk). | [Attribution](https://commons.wikimedia.org/wiki/File:Bank_of_Japan_Head_Office_1984.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Bank_of_Japan_Head_Office_1984.jpg) |
| tokyo-1985 | 1985 | 1985年东京城市道路档案照片 / Provo rossi | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [文件页](https://commons.wikimedia.org/wiki/File:Tokyo_Metropolitan_Expressway,_1985.jpg) |
| grand | 1960 | 约 1960 年的东京证券交易所 / Unknown authorUnknown author | [Public domain](https://commons.wikimedia.org/wiki/File:Tokyo_Stock_Exchange_Building_circa_1960.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Tokyo_Stock_Exchange_Building_circa_1960.jpg) |
| tokyo-exchange-1950 | 1950-09-01 | 1950年东京证券交易所交易大厅档案照片 / US Army | [Public domain](https://commons.wikimedia.org/wiki/File:TokyoStockExchange1950.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:TokyoStockExchange1950.jpg) |
| annual-jp-1991 | 1989-08-10 | 第一届海部内阁成立后在日本首相官邸合影 / 首相官邸ホームページ | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [文件页](https://commons.wikimedia.org/wiki/File:Toshiki_Kaifu_Cabinet_19890810.jpg) |
| bojosaka | 1930 | 大阪中之岛与日本银行大阪分行 / Unknown authorUnknown author | [Public domain](https://commons.wikimedia.org/wiki/File:Nakanoshima_1930.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Nakanoshima_1930.jpg) |
| summit93 | 1993-07-09 | 东京七国峰会期间的合影 / 外務省 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [文件页](https://commons.wikimedia.org/wiki/File:19th_G7_summit_member_19930709.jpg) |
| kansai-1994 | 1994-09-05 | 关西机场开港次日的协和式飞机 / Spaceaero2 | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [文件页](https://commons.wikimedia.org/wiki/File:Concorde_1_94-9-5_kix_(cropped).jpg) |
| hanshin-1995 | 1995-01-17 | 阪神淡路大地震后的建筑与街道 / Akiyoshi Matsuoka (松岡明芳) | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [文件页](https://commons.wikimedia.org/wiki/File:Hanshin-Awaji_earthquake_1995_343.jpg) |
| annual-jp-1996 | 1996-04-17 | 日本首相桥本龙太郎与美国总统克林顿会面 / White House | [Public domain](https://commons.wikimedia.org/wiki/File:Clinton_Hashimoto_1996.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Clinton_Hashimoto_1996.jpg) |
| annual-jp-1997 | 1910 | 北海道拓殖银行东京分行旧影，该银行也在 1997 年金融危机中倒闭 / Tokyo, "The Liberal news agency" | [Public domain](https://commons.wikimedia.org/wiki/File:Hokkaido_colonial_bank_tokyo_brunch.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Hokkaido_colonial_bank_tokyo_brunch.jpg) |
| annual-jp-1998 | 1936-11-07 | 日本国会议事堂落成典礼，议事堂与参加典礼的人群 / Japanese House of Councillors | [Public domain](https://commons.wikimedia.org/wiki/File:Japanese_Diet_Hall_Dedication_Ceremony.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Japanese_Diet_Hall_Dedication_Ceremony.jpg) |
| annual-jp-1999 | 1999-06-18 | 科隆峰会期间，日本首相小渊惠三与美国总统克林顿会谈 / William Vasta | [Public domain](https://commons.wikimedia.org/wiki/File:Keizo_Obuchi_with_Bill_Clinton.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Keizo_Obuchi_with_Bill_Clinton.jpg) |
| hayami | 2000-09-24 | 日本银行行长速水优 / the International Monetary Fund | [Public domain](https://commons.wikimedia.org/wiki/File:Masaru_Hayami.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Masaru_Hayami.jpg) |
| annual-jp-2001 | 1937 | 从京桥眺望东京日本桥商业街 / 青海堂 | [Public domain](https://commons.wikimedia.org/wiki/File:Nihonbashi-Street_from_Kyobashi.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Nihonbashi-Street_from_Kyobashi.jpg) |
| foot02 | 2002-06-09 | 横滨国际综合竞技场的日本对俄罗斯世界杯比赛 / Fk | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件页](https://commons.wikimedia.org/wiki/File:020609JPN-RUS.jpg) |
| annual-jp-2003 | 2002 | 小泉纯一郎任日本首相期间的官方肖像（约 2002 年） / 内閣官房内閣広報室 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [文件页](https://commons.wikimedia.org/wiki/File:Junichiro_Koizumi_20010426.jpg) |
| quake04 | 2004-11-06 | 新潟县中越地震后长冈市开裂的道路 / Naoki Sato | [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0) | [文件页](https://commons.wikimedia.org/wiki/File:2004_Chuetsu_earthquake_Cracks_on_the_road,_Nagaoka_02.jpg) |
| expo05 | 2005-08-02 | 爱知世博会长久手会场的日本馆与大地之塔 / Genppy | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [文件页](https://commons.wikimedia.org/wiki/File:Japan_Pavilion_Nagakute_and_EARTH_TOWER_NAGOYA_CITY_in_Expo_2005.JPG) |
| fukui | 2006-09-16 | 日本银行行长福井俊彦 / the International Monetary Fund | [Public domain](https://commons.wikimedia.org/wiki/File:Toshihiko_Fukui.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Toshihiko_Fukui.jpg) |
| annual-jp-2007 | 2006-05-21 | 大阪证券交易所外景 / J o | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [文件页](https://commons.wikimedia.org/wiki/File:Osaka-Securities-Exchange-01.jpg) |
| transport | 2008-07-11 | 停靠横滨南本牧码头的集装箱船 / Yennen-Gas | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [文件页](https://commons.wikimedia.org/wiki/File:Maersk_container_ship_002.JPG) |
| port | 2005-04-14 | 横滨港大栈桥 / っ | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [文件页](https://commons.wikimedia.org/wiki/File:%C5%8Csanbashi_Port_of_Yokohama_April_14,_2005.jpg) |
| tokyoboj | 2010 | 日本银行总行 / Wiiii | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0) | [文件页](https://commons.wikimedia.org/wiki/File:Bank_of_Japan_2010.jpg) |
| tohoku-2011 | 2011-03-12 | 东日本大地震次日仙台附近的救援飞行 / U.S. Navy photo | [Public domain](https://commons.wikimedia.org/wiki/File:SH-60B_helicopter_flies_over_Sendai.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:SH-60B_helicopter_flies_over_Sendai.jpg) |
| annual-jp-2012 | 2012-10-11 | 日本银行行长白川方明 / US Government | [Public domain](https://commons.wikimedia.org/wiki/File:Masaaki_Shirakawa_2012.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Masaaki_Shirakawa_2012.jpg) |
| annual-jp-2013 | 2013-06 | 安倍晋三在伦敦介绍日本经济复苏政策 / Chatham House | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件页](https://commons.wikimedia.org/wiki/File:Shinzo_Abe,_Prime_Minister_of_Japan_(9092387608).jpg) |
| yen | 1952-10 | 东京鱼市场的商贩 / Australian Consolidated Press | [Public domain](https://commons.wikimedia.org/wiki/File:Tokyo_fish_markets_1952_SLNSW_FL9760343.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Tokyo_fish_markets_1952_SLNSW_FL9760343.jpg) |
| kuroda | 2011-01-21 | 黑田东彦在亚洲开发银行 / Asian Development Bank | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件页](https://commons.wikimedia.org/wiki/File:Haruhiko_Kuroda_at_ADB_Philippines_(crop).jpg) |
| annual-jp-2016 | 2006-05-05 | 大阪理索纳银行总部，负利率也改变商业银行的利差 / J o | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) | [文件页](https://commons.wikimedia.org/wiki/File:Resona-Bank-hq-01.jpg) |
| softshop | 2009-08-06 | 日本仙台七夕祭期间的一家软银门店 / neuropower | [Public domain](https://commons.wikimedia.org/wiki/File:Softbank_in_Sendai_%26_the_decorations_of_Sendai_Star_Festival.JPG#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:Softbank_in_Sendai_%26_the_decorations_of_Sendai_Star_Festival.JPG) |
| tpp | 2010-11-14 | 跨太平洋贸易协定谈判成员会面 / Gobierno de Chile | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0) | [文件页](https://commons.wikimedia.org/wiki/File:Leaders_of_TPP_member_states.jpg) |
| jpretail | 2018-10 | 2018 年 10 月，东京筑地市场 / Kakidai | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件页](https://commons.wikimedia.org/wiki/File:2018_Tsukiji_fish_market.jpg) |
| jpxfloor | 2018-10 | 东京证券交易所交易大厅 / Kakidai | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件页](https://commons.wikimedia.org/wiki/File:The_Tokyo_Stock_Exchange_-_main_room_2.jpg) |
| olympics2 | 2021-07-23 | 东京奥运开幕式上空的无人机表演 / Breno Barros | [CC BY 3.0 br](https://creativecommons.org/licenses/by/3.0/br/deed.en) | [文件页](https://commons.wikimedia.org/wiki/File:Drones_durante_a_abertura_das_Olimp%C3%ADadas_de_T%C3%B3quio.jpg) |
| annual-jp-2022 | 2011-03-22 | 日本流通的一千日元纸币 / Fer1997 | [Public domain](https://commons.wikimedia.org/wiki/File:1000_yen_banknote_2004.jpg#Licensing) | [文件页](https://commons.wikimedia.org/wiki/File:1000_yen_banknote_2004.jpg) |
| ueda | 2023-04-10 | 日本银行行长植田和男 / 内閣官房内閣広報室 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [文件页](https://commons.wikimedia.org/wiki/File:Kazuo_Ueda_20230410meeting01.jpg) |
| annual-jp-2024 | 2019-02-23 | 东京日本银行总部外景 / Suicasmo | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0) | [文件页](https://commons.wikimedia.org/wiki/File:Bank_of_Japan_20190223.jpg) |
| annual-jp-2025 | 2024-10-02 | 日本首相石破茂会见日本银行行长植田和男 / 内閣官房内閣広報室 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0) | [文件页](https://commons.wikimedia.org/wiki/File:Shigeru_Ishiba,_Kazuo_Ueda_20241002.jpg) |

## 制作检查与范围

已检查 80 条新闻与 80 条开年背景连续覆盖，80 张新闻卡的路径、原始文件页及 SHA-256 各自唯一；事件日期及照片拍摄年份均不晚于开局上一年末；图片文件、路径与全部 SHA-256 一致。初稿照片逐张目视，补充图片由其整理者目视并保留 Commons 元数据。财经内容通过原网页、政府 PDF 或原始公告核验；部分机构站点对本机批量请求返回 403，但可由浏览工具读取或通过其他官方资料交叉核验，不能把传输失败当作来源已不存在。

三个容易混淆的边界：日本 2025 头条采用 12 月 19 日宣布、12 月 22 日生效的 0.75% 利率；日本 2010 年 10 月 5 日是提出资产购买基金的政策安排；2014 油价背景引用当年 12 月报告，没有把 2015 年全年结果带进开局。

本文件记录内容制作与结构检查，独立内容审查由未编写本模块的审计者完成；新引擎审计单独记录，不用作者自检代替独立审计。
