# 时代侧记与收盘锐评

## 玩家读到什么

每个国家每年有一条时代侧记和一句收盘锐评。开年先读上一年已经发生的一件事，再看它怎样影响成本、需求、现金流或估值。新闻头条与侧记从两条线索观察同一个时期。例如金融危机时，报纸在讨论信用收缩，手机应用商店却刚刚开张。

结算页用真实的当期价格或含息回报写一句市场短评。美国 2015 年的标普价格指数和含息宽基连正负号都不同。日本 2016 年日经与 TOPIX 的方向相反。两种对照都可以回到同期行情查证。

## 时间与展示

- 1987–2026 共 80 个国别时期。10 年与 40 年路线共用相同的历史条目。
- `opening.knownBy` 是史实已可得的截止日。部分公司沿革只给出月份或年份，这些条目保守地取当月底或年底。资料包含当时的公告及发行方、政府部门与赛事组织者的原始档案。
- `opening.modelSignal` 是玩家在侧记末尾读到的机制句，去掉了品牌、人名、年份和行情数值。模型可获得该句来判断产业敞口。
- `settlement.text` 把单独编写的锐评和当期真实数据合成一句话。百分比从行情表按显示精度四舍五入，`returnKeys` 记录该条引用的资产或基准。2026 年采用截至 9 月 30 日的累计结果。
- 历史产业事件提供观察角度。行情点评中的板块比较读取完整板块回报，一家新闻当事企业的股价要另查个股。

实现见[时代侧记](../dist/era-notes.js)、[定向回归](../tests/era-notes.test.js)。行情定义见[投资年代记数据口径](ATLAS-DATA.md)。

## 逐年资料

下表年份是玩家开始做决定的年份，资料描述的事件均发生在此前一年。

| 开年 | 美国侧记及原始资料 | 日本侧记及原始资料 |
| --- | --- | --- |
| 1987 | 盒装软件走上交易所 · [微软 · 1986 年公司史](https://learn.microsoft.com/en-us/shows/history/history-of-microsoft-1986) | 招聘广告遇到平等就业新规 · [日本厚生劳动省 · 平等就业政策沿革](https://www.mhlw.go.jp/content/12601000/001078052.pdf) |
| 1988 | 冰箱要换一道配方 · [联合国环境规划署 · 臭氧保护年表](https://ozone.unep.org/ozone-timeline) | 国铁站牌换成 JR · [日本国土交通省 · 国铁改革记录](https://www.mlit.go.jp/tetudo/kaikaku/01.pdf) |
| 1989 | 一场旱灾，两张账单 · [美国农业部 · 玉米产业与 1988 年灾害援助](https://ers.usda.gov/sites/default/files/_laserfiche/publications/41785/50424_ages8947bpdf.pdf) | 棒球场加上了屋顶 · [东京巨蛋 · 场馆大事记](https://www.tokyo-dome.co.jp/en/dome/baseball/fan-information/history) |
| 1990 | 电脑芯片跨过百万关 · [英特尔 · i486 发布年表](https://timeline.intel.com/1989/meet-the-i486) | 掌机把客厅带上电车 · [任天堂 · 公司沿革](https://www.nintendo.co.jp/corporate/en/history/index.html) |
| 1991 | 生物研究立起长工期 · [美国国家人类基因组研究所 · 项目时间线](https://www.genome.gov/human-genome-project/timeline) | 大阪把园艺做成一届博览会 · [大阪市 · 花博纪念公园档案](https://parksgreenery.city.osaka.lg.jp/article/parks-tsurumiryokuchi/) |
| 1992 | 机箱上多了一枚贴纸 · [英特尔 · 芯片发展史](https://www.intel.com/content/dam/www/central-libraries/us/en/documents/semiconductors-and-intel-introduction.pdf) | 日本职业足球先搭起后台 · [J 联赛 · 法人设立记录](https://aboutj.jleague.jp/corporate/about_j/profile_j/) |
| 1993 | 显示器也有省电标签 · [美国环保署 · 能源之星早期电脑及显示器](https://www.energystar.gov/ia/products/downloads/CompMonitors_Highlights.pdf) | 希望号把商旅时间表改短了 · [JR 东海 · 希望号开行纪念资料](https://jr-central.co.jp/news/release/_pdf/000041851.pdf) |
| 1994 | 奔腾有了自己的名字 · [英特尔 · 芯片发展史](https://www.intel.com/content/dam/www/central-libraries/us/en/documents/semiconductors-and-intel-introduction.pdf) | 手机从模拟走向数字 · [NTT DOCOMO · 移动通信业务沿革](https://www.docomo.ne.jp/english/corporate/about/outline/history/index.html) |
| 1995 | 零件可以多过一道边境 · [美国贸易代表办公室 · 北美自贸协定](https://ustr.gov/about-us/policy-offices/press-office/ustr-archives/north-american-free-trade-agreement-nafta) | PlayStation 加入客厅争夺战 · [索尼互动娱乐 · PlayStation 沿革](https://sonyinteractive.com/en/our-company/expanded-company-timeline/) |
| 1996 | 书店的货架搬进网页 · [亚马逊 · 网上书店最初五年](https://press.aboutamazon.com/2000/7/amazon-com-celebrates-fifth-anniversary-timeline-illustrates-milestones-and-little-known-facts-about-leading-online-retailers-first-five-years) | 传呼机也可以买断了 · [NTT DOCOMO · 日本业务年表](https://www.docomo.ne.jp/corporate/about/history/) |
| 1997 | 电话线上的生意经 · [美国联邦通信委员会 · 1996 年电信法实施文件](https://docs.fcc.gov/public/attachments/FCC-96-242A1.pdf) | 新一代主机再争客厅 · [任天堂 · 公司沿革](https://www.nintendo.co.jp/corporate/en/history/index.html) |
| 1998 | 网上书店敲钟了 · [亚马逊 · IPO 公告](https://press.aboutamazon.com/1997/5/amazon-com-inc-announces-initial-public-offering-of-3-000-000-shares-of-common-stock) | 混合动力车开上价格牌 · [丰田 · 初代 Prius 发布](https://global.toyota/en/detail/7905316) |
| 1999 | 网上找信息成了一门生意 · [Google · 创立经过](https://about.google/company-info/our-story/) | 长野的雪场也有淡旺季 · [日本奥委会 · 长野冬奥会档案](https://www.joc.or.jp/games/olympic/nagano/) |
| 2000 | 跨国账本换了计价单位 · [欧洲央行 · 欧元现金更替与记账阶段](https://www.ecb.europa.eu/euro/changeover/2002/html/index.en.html) | 翻盖手机开始上网 · [NTT DOCOMO · 移动通信业务沿革](https://www.docomo.ne.jp/english/corporate/about/outline/history/index.html) |
| 2001 | 基因组工作草图公布 · [美国国家人类基因组研究所 · 工作草图公告](https://www.genome.gov/10001457/2000-release-working-draft-of-human-genome-sequence) | 游戏机还想坐上影音柜 · [PlayStation · PS2 上市档案](https://www.playstation.com/ja-jp/playstation-history/2000-ps2-psp/) |
| 2002 | 一千首歌装进口袋 · [苹果 · iPod 发布公告](https://www.apple.com/newsroom/2001/10/23Apple-Presents-iPod/) | 三代移动通信开始营业 · [NTT DOCOMO · 移动通信业务沿革](https://www.docomo.ne.jp/english/corporate/about/outline/history/index.html) |
| 2003 | 欧元从账本走进钱包 · [欧洲央行 · 欧元现金投放](https://www.ecb.europa.eu/euro/changeover/2002/html/index.en.html) | 日本通信股挂牌海外 · [NTT DOCOMO · 移动通信业务沿革](https://www.docomo.ne.jp/english/corporate/about/outline/history/index.html) |
| 2004 | 唱片开始按首卖 · [苹果 · 音乐商店原始公告](https://www.apple.com/newsroom/2003/04/28Apple-Launches-the-iTunes-Music-Store/) | 六本木把几门生意盖在一起 · [森大厦 · 六本木之丘项目档案](https://www.mori.co.jp/en/projects/roppongihills/) |
| 2005 | 搜索框也能上市 · [Google · 首次公开发行定价公告](https://googlepress.blogspot.com/2004/08/google-inc-prices-initial-public.html) | 掏手机也能付钱 · [NTT DOCOMO · 手机钱包与通信年表](https://www.docomo.ne.jp/english/corporate/ir/binary/pdf/library/annual/fy2011/p03_e.pdf) |
| 2006 | 包邮改成收年费 · [亚马逊 · 2005 年二季度公告](https://press.aboutamazon.com/2005/7/amazon-com-announces-record-free-cash-flow-fueled-by-lower-prices-and-free-shipping-for-customers) | 京都议定书正式生效 · [联合国气候变化框架公约 · 京都议定书](https://unfccc.int/process-and-meetings/the-kyoto-protocol) |
| 2007 | 服务器可以按小时租 · [AWS · EC2 测试公告](https://aws.amazon.com/about-aws/whats-new/2006/08/24/announcing-amazon-elastic-compute-cloud-amazon-ec2---beta/) | 客厅里的玩家站起来了 · [任天堂 · 公司沿革](https://www.nintendo.co.jp/corporate/en/history/index.html) |
| 2008 | 电话的主角换成屏幕 · [苹果 · 初代 iPhone 发布](https://www.apple.com/newsroom/2007/01/09Apple-Reinvents-the-Phone-with-iPhone/) | 邮局的储蓄业务换了招牌 · [日本邮政 · 邮政储蓄与邮储银行沿革](https://www.japanpost.jp/en/ir/library/disclosure/2009/pdf/05.pdf) |
| 2009 | 手机多了一间软件商店 · [苹果 · 应用商店首周末下载](https://www.apple.com/ie/newsroom/2008/07/14iPhone-App-Store-Downloads-Top-10-Million-in-First-Weekend/) | 八家区域运营商并入一家公司 · [NTT DOCOMO · 移动通信业务沿革](https://www.docomo.ne.jp/english/corporate/about/outline/history/index.html) |
| 2010 | 公共工程拿到新预算 · [美国政府出版局 · 公法 111-5](https://www.govinfo.gov/content/pkg/PLAW-111publ5/html/PLAW-111publ5.htm) | 混合动力车换到第三代 · [丰田 · 第三代 Prius 上市](https://global.toyota/en/detail/308252/) |
| 2011 | 医保改革签署成法 · [美国医保市场 · 法律文本及日期](https://www.healthcare.gov/where-can-i-read-the-affordable-care-act/) | 手机网络换上 LTE · [NTT DOCOMO · 移动通信业务沿革](https://www.docomo.ne.jp/english/corporate/about/outline/history/index.html) |
| 2012 | 平板也是一家店的入口 · [亚马逊 · Kindle 家族发布](https://press.aboutamazon.com/2011/9/introducing-the-all-new-kindle-family-four-new-kindles-four-amazing-price-points) | 女足冠军带火一块球场 · [国际足联 · 女足世界杯冠军记录](https://www.fifa.com/en/tournaments/womens/womensworldcup/articles/teams-most-titles-trophies) |
| 2013 | 年轻公司换了一条上市跑道 · [美国政府出版局 · JOBS 法案原文](https://www.govinfo.gov/content/pkg/PLAW-112publ106/html/PLAW-112publ106.htm) | 晴空塔开始卖观景票 · [东京晴空塔 · 开业大事记](https://www.tokyo-skytree.jp/about/timeline/) |
| 2014 | 丙肝口服新药过审 · [美国 FDA · Sovaldi 批准函](https://www.accessdata.fda.gov/drugsatfda_docs/nda/2013/204671Orig1s000Approv.pdf) | 东京拿到夏季奥运会举办权 · [日本奥委会 · 东京获选后的筹办记录](https://www.joc.or.jp/news/004447.html) |
| 2015 | 纽约钟声，为海外电商响 · [纽约证券交易所 · 上市新闻稿](https://www.nyse.com/publicdocs/nyse/listing/Aliaba_IPO_press_release_CHINA_%20CN%20_%20FINAL.pdf) | 氢燃料车开始在日本销售 · [丰田 · Mirai 发布](https://global.toyota/en/detail/4198334) |
| 2016 | 巴黎谈成气候协定 · [联合国气候变化框架公约 · 会议公告](https://unfccc.int/news/finale-cop21) | 坐新干线直达金泽 · [日本铁道建设机构 · 北陆新干线长野至金泽段](https://www.jrtt.go.jp/construction/achievement/hokuriku2.html) |
| 2017 | 一盘围棋出了体育版 · [Google DeepMind · 人机围棋对局档案](https://deepmind.google/research/alphago/) | 游戏把头戴显示器送进客厅 · [索尼互动娱乐 · PlayStation VR 发布](https://sonyinteractive.com/en/press-releases/2016/playstationvr-launches-october-2016-available-globally-at-44980-yen-399-usd-399-and-349/) |
| 2018 | 新的治疗方式拿到入场券 · [美国 FDA · 首次批准函](https://www.fda.gov/media/106989/download) | 掌机和电视用上同一台主机 · [任天堂 · Switch 发售公告](https://www.nintendo.co.jp/corporate/release/en/2017/170113.html) |
| 2019 | 网店遇到州销售税 · [美国最高法院 · Wayfair 判决及案卷](https://www.supremecourt.gov/docket/docketfiles/html/public/17-494.html) | 大阪再次赢得世博会主办权 · [大阪市 · 大阪关西世博会主办工作](https://www.city.osaka.lg.jp/keizaisenryaku/page/0000480537.html) |
| 2020 | 片库从电影院搬到客厅 · [迪士尼 · Disney+ 上线公告](https://thewaltdisneycompany.com/news/disney-launches-today-and-a-new-era-of-disney-entertainment-begins/) | 收银台多了无现金返还 · [日本经济产业省 · 商户返还计划说明](https://www.meti.go.jp/policy/mono_info_service/cashless/cashless_payment_promotion_program/kameiten_leaf.pdf) |
| 2021 | 疫苗供应链开始接单 · [美国 FDA · 疫苗授权时间线](https://www.fda.gov/news-events/press-announcements/fda-approves-first-covid-19-vaccine) | 富岳登上超算榜首 · [理化学研究所 · 富岳登顶公告](https://www.riken.jp/en/news_pubs/news/2020/20200623_1/index.html) |
| 2022 | 一颗芯片卡住一条线 · [美国商务部 · 半导体供应链调查原文](https://public-inspection.federalregister.gov/2021-20348.pdf) | 行政服务也要做数字化 · [日本数字厅 · 创立公告](https://www.digital.go.jp/en/news/uWAA9Dcp) |
| 2023 | ChatGPT 打开聊天窗口 · [OpenAI · ChatGPT 首次公开预览](https://openai.com/index/chatgpt/) | Rapidus 向两纳米迈步 · [IBM 与 Rapidus · 联合公告](https://newsroom.ibm.com/2022-12-12-IBM-and-Rapidus-Form-Strategic-Partnership-to-Build-Advanced-Semiconductor-Technology-and-Ecosystem-in-Japan) |
| 2024 | GPT-4 让算力变成账单 · [OpenAI · GPT-4 发布](https://openai.com/index/gpt-4-research/) | 广岛给下一代存储芯片排投资预算 · [广岛县 · 十二月议会报告](https://www.pref.hiroshima.lg.jp/site/summary/gikaisetumeiyoushi20231207.html) |
| 2025 | AI 服务器开始拼内存带宽 · [SK 海力士 · HBM3E 量产公告](https://news.skhynix.com/en/sk-hynix-begins-volume-production-of-industry-first-hbm3e/) | 家庭投资账户换了新规则 · [日本金融厅 · 新 NISA 制度](https://www.fsa.go.jp/policy/nisa2/know/) |
| 2026 | 海力士把 HBM4 推到量产起跑线 · [SK 海力士 · HBM4 开发与生产准备公告](https://news.skhynix.com/en/sk-hynix-completes-worlds-first-hbm4-development-and-readies-mass-production/) | 北海道的两纳米样管通电了 · [Rapidus · 两纳米晶体管试制公告](https://www.rapidus.inc/en/news_topics/information/rapidus-achieves-significant-milestone-at-its-state-of-the-art-foundry-with-prototyping-of-leading-edge-2nm-gaa-transistors/) |
