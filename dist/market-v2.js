/** Kenneth French 5 Industry Portfolios, 202002 CRSP archive, annual value-weighted returns.
 * Research portfolios, not investable ETFs. All rates below are percent before /100.
 * Mirror file SHA256: e5dd04abf70e747ff1a5173acd29039cf87425b984ca5ad144b85d50865842fb
 */
export const INDUSTRY_SOURCE = {
  title: 'Kenneth French · 五行业研究组合',
  url: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library/det_5_ind_port.html',
  archiveUrl: 'https://raw.githubusercontent.com/smartrus/kenneth-french-data-library/master/data/5_Industry_Portfolios.CSV',
  vintage: '202002 CRSP',
  sha256: 'e5dd04abf70e747ff1a5173acd29039cf87425b984ca5ad144b85d50865842fb',
  note: '采用公开存档的 2020-02 CRSP 固定版本，年度价值加权 HiTec / Cnsmr / Hlth，含分红。研究组合代理，不是 ETF，也不等同于 GICS 板块；原始存档链接另附。',
};
// [year, HiTec, Cnsmr, Hlth]; source annual Jan–Dec total returns, value weighted.
const INDUSTRY_ROWS = [
  [2007, 11.59, 2.12, 3.68], [2008, -40.78, -25.87, -17.27],
  [2009, 50.04, 30.63, 21.20], [2010, 16.84, 21.59, 4.70],
  [2011, 0.33, 9.04, 10.89], [2012, 16.68, 16.25, 20.38],
  [2013, 34.00, 32.98, 41.38], [2014, 14.57, 12.71, 24.49],
  [2015, 3.80, 6.76, 6.07], [2016, 13.79, 5.52, -4.47],
  [2017, 29.49, 18.66, 20.42], [2018, -1.01, -3.62, 4.22],
];
export const INDUSTRY_RETURNS = Object.fromEntries(INDUSTRY_ROWS.map(([year, tech, consumer, health]) =>
  [year, { tech: tech / 100, consumer: consumer / 100, health: health / 100 }]));

const fed = date => `https://www.federalreserve.gov/newsevents/pressreleases/monetary${date}a.htm`;
const policyRows = [
  ['2006-12-12', '5.25%', fed('20061212'), '利率按下暂停键', '美联储在 12 月维持 5.25% 利率：住房市场降温，经济仍被判断为温和扩张；核心通胀压力尚未完全消失。'],
  ['2007-12-11', '4.25%', fed('20071211'), '增长与物价，两道题', '12 月政策利率下调至 4.25%。声明同时提到住房调整、消费放缓与能源价格压力，政策正在权衡增长和通胀。'],
  ['2008-12-16', '0–0.25%', 'https://www.federalreserve.gov/newsevents/pressreleases/monetary20081216b.htm', '政策工具箱换了一页', '政策利率降至 0–0.25%，机构债与房贷证券购买已经宣布。信贷紧张仍在持续，政策措施与实体经济之间还隔着传导过程。'],
  ['2009-12-16', '0–0.25%', fed('20091216'), '修复中的低利率环境', '美联储维持零附近利率，并逐渐放慢机构债与房贷证券购买。家庭消费已有扩张迹象，但就业和信贷条件仍约束支出。'],
  ['2010-12-14', '0–0.25%', fed('20101214'), '购债计划继续，复苏仍慢', '美联储继续推进已宣布的 6,000 亿美元长期国债购买计划。经济恢复速度仍不足以明显降低失业率，住宅市场依旧疲弱。'],
  ['2011-12-13', '0–0.25%', fed('20111213'), '延长期限，而非新的答案', '美联储继续延长所持证券的平均期限，政策利率不变。美国经济温和扩张，全球金融市场压力仍是声明关注的问题。'],
  ['2012-12-12', '0–0.25%', fed('20121212'), '购债与就业门槛', '美联储公布每月 400 亿美元房贷证券、450 亿美元长期国债的购买安排，并将利率指引与就业和通胀条件联系起来。'],
  ['2013-12-18', '0–0.25%', fed('20131218'), '退出，先迈小步', '12 月声明宣布逐步放慢新增购债：房贷证券和长期国债分别降至每月 350 亿与 400 亿美元。短期政策利率仍留在零附近。'],
  ['2014-12-17', '0–0.25%', fed('20141217'), '新增购债结束，低利率仍在', '新增资产购买已于 10 月结束，到期本金继续再投资。12 月美联储表示对政策正常化保持耐心，同时观察就业和低于目标的通胀。'],
  ['2015-12-16', '0.25–0.50%', fed('20151216'), '第一次抬起利率', '12 月政策利率升至 0.25–0.50%。美联储认为就业改善，但通胀仍低于长期目标；以后如何调整仍取决于新数据。'],
  ['2016-12-14', '0.50–0.75%', fed('20161214'), '加息之后，分歧仍在', '12 月政策利率升至 0.50–0.75%。声明描述家庭支出温和增长、企业固定投资偏弱；不同经济部门的温度并不相同。'],
  ['2017-12-13', '1.25–1.50%', fed('20171213'), '就业强劲，通胀偏低', '美联储将利率升至 1.25–1.50%。就业与企业投资改善，而通胀仍低于 2% 目标；这些信息并不构成单一的市场方向。'],
];
// November unemployment as it was published that December, not later revised series.
const jobsRows = [
  ['2006-12-22', 4.5, 'https://www.bls.gov/news.release/archives/laus_12222006.pdf', '招工与生活，仍有温差', '11 月全美失业率为 4.5%。低失业率是总体指标，地区、职业和每个家庭的实际机会仍不一样。'],
  ['2007-12-10', 4.7, 'https://www.bls.gov/opub/ted/2007/dec/wk2/art01.htm', '就业数字暂时平稳', '11 月失业率连续第三个月为 4.7%。总量的平稳与金融市场的变化并存，招聘现场未必与证券市场同步。'],
  ['2008-12-05', 6.7, 'https://www.bls.gov/news.release/archives/empsit_12052008.htm', '招聘启事少了些', '11 月失业率升至 6.7%，当次报告的非农岗位减少 53.3 万。就业损失分布在多个行业，家庭对收入的感受开始改变。'],
  ['2009-12-04', 10.0, 'https://www.bls.gov/news.release/archives/empsit_12042009.htm', '就业市场里不同的步速', '11 月失业率为 10.0%，当次报告的非农岗位基本持平。建筑和制造业仍在减员，临时服务与医疗行业增加岗位。'],
  ['2010-12-03', 9.8, 'https://www.bls.gov/news.release/archives/empsit_12032010.htm', '复苏还没到每个人家里', '11 月失业率升至 9.8%。总体经济恢复与找工作人的体感存在落差，单个月份的数据也可能随后修订。'],
  ['2011-12-02', 8.6, 'https://www.bls.gov/news.release/archives/empsit_12022011.htm', '下降的失业率，变化的参与率', '11 月失业率降至 8.6%，劳动参与率也下降。一个百分比背后，既有就业变化，也有人暂时离开劳动力市场。'],
  ['2012-12-07', 7.7, 'https://www.bls.gov/news.release/archives/empsit_12072012.htm', '商店与医院都在招人', '11 月失业率降至 7.7%。当次报告显示，零售、专业和商业服务、医疗行业增加了岗位；长期失业仍占较大比重。'],
  ['2013-12-06', 7.0, 'https://www.bls.gov/news.release/archives/empsit_12062013.htm', '重回工作日的节奏', '11 月失业率降至 7.0%。岗位增加并不表示所有家庭同时恢复收入，工资、工时与行业分布仍影响日常预算。'],
  ['2014-12-05', 5.8, 'https://www.bls.gov/news.release/archives/empsit_12052014.htm', '更多岗位，新的谈判', '11 月失业率维持 5.8%。当次报告中就业增长较广，专业服务、零售、医疗和制造业均有增加；职业选择也在变化。'],
  ['2015-12-04', 5.0, 'https://www.bls.gov/news.release/archives/empsit_12042015.htm', '五个百分点的就业现场', '11 月失业率维持 5.0%，当次报告的平均时薪小幅增加。岗位数量、薪资和家庭承担的费用需要分别观察。'],
  ['2016-12-02', 4.6, 'https://www.bls.gov/news.release/archives/empsit_12022016.htm', '就业改善，行业分化', '11 月失业率降至 4.6%，专业和商业服务、医疗行业继续增加岗位。整体改善不代表每种职业的变化幅度相同。'],
  ['2017-12-08', 4.1, 'https://www.bls.gov/news.release/archives/empsit_12082017.htm', '紧一些的劳动力市场', '11 月失业率维持 4.1%，专业服务、制造和医疗增加岗位。更紧的劳动力市场与家庭具体的工资增长仍是两回事。'],
];
const industryRows = [
  ['2006-03-14', '科技 · 云计算', '服务器，也可以按需租', 'Amazon S3 开始向开发者提供在线存储。按用量付费带来新的经营方式，但客户需求、价格和长期利润尚需企业自己验证。', 'https://press.aboutamazon.com/2006/3/amazon-web-services-launches'],
  ['2007-09-10', '科技 · 智能手机', '口袋里的小屏幕', '首代 iPhone 已上市，苹果在 9 月宣布销量达到 100 万部。触屏、移动上网与运营商合约正在一起改变产品竞争。', 'https://www.apple.com/newsroom/2007/09/10Apple-Sells-One-Millionth-iPhone/'],
  ['2008-07-10', '科技 · 软件消费', '手机上多了一家商店', 'App Store 上线时有超过 500 款应用。软件开发者多了一条分发渠道，硬件、应用收费与免费服务开始争夺同一块屏幕。', 'https://www.apple.com/newsroom/2008/07/10iPhone-3G-on-Sale-Tomorrow/'],
  ['2009-09-15', '医疗 · 疫苗', '新流感推动医疗响应', 'FDA 批准了 H1N1 单价流感疫苗。审批、生产与公共卫生需求进入关注中心，产品获批仍不等于整个行业拥有相同的利润路径。', 'https://www.fda.gov/vaccines-blood-biologics/vaccines/influenza-h1n1-2009-monovalent-vaccines-questions-and-answers'],
  ['2010-01-27', '消费 · 电子设备', '电脑与手机之间', '苹果发布 iPad，起售价 499 美元。阅读、视频和应用有了新的设备入口；它会增加消费，还是替代原来的设备，仍是市场问题。', 'https://www.apple.com/uk/newsroom/2010/01/27Apple-Launches-iPad/'],
  ['2011-10-04', '科技 · 语音服务', '开始对手机说话', 'iPhone 4S 带来 Siri，iCloud 同期推出。语音与云端同步进入大众产品，功能演示、用户习惯与可持续收入仍需分别观察。', 'https://www.apple.com/uk/newsroom/2011/10/04Apple-Launches-iPhone-4S-iOS-5-iCloud/'],
  ['2012-09-12', '消费 · 移动网络', '换机理由，换了一种', 'iPhone 5 发布，支持 LTE 等高速无线技术。新网络、新设备与配件更迭提供了卖点，也让消费者重新衡量换机成本。', 'https://www.apple.com/newsroom/2012/09/12Apple-Introduces-iPhone-5/'],
  ['2013-12-06', '医疗 · 药物创新', '口服丙肝新药获批', 'FDA 批准 Sovaldi。治疗方案有了新选择，但研发成果、支付能力与市场覆盖是不同的问题；单个产品不代表整个医疗板块。', 'https://www.accessdata.fda.gov/drugsatfda_docs/nda/2013/204671Orig1s000Approv.pdf'],
  ['2014-10-16', '消费 · 移动支付', '收银台前，拿出手机', 'Apple Pay 宣布于 10 月在美国上线。银行、商户与手机厂商共同参与支付流程，便利性之外还取决于消费者和商家的接受程度。', 'https://www.apple.com/newsroom/2014/10/16Apple-Pay-Set-to-Transform-Mobile-Payments-Starting-October-20/'],
  ['2015-07-15', '消费 · 电商', '购物节不只在年末', '亚马逊举行首个 Prime Day。会员、折扣与配送能力成为零售竞争的一部分，促销带来的销量与盈利需要分开看。', 'https://press.aboutamazon.com/2015/7/amazon-announces-prime-day-update'],
  ['2016-11-17', '医疗 · 免疫治疗', '癌症治疗有了新进展', '2016 年 10 月，Keytruda 获批用于特定晚期肺癌患者的一线治疗。适应证受到条件限制，临床进展与商业结果不是同一件事。', 'https://www.cancer.gov/news-events/cancer-currents-blog/2016/fda-atezolizumab-pembrolizumab-lung'],
  ['2017-08-30', '医疗 · 细胞治疗', '细胞也成为治疗工具', 'FDA 批准首个在美国上市的 CAR-T 细胞疗法。它针对特定患者群体，新的生产、交付和支付问题也随之进入讨论。', 'https://www.fda.gov/media/107337/download'],
];

export function marketContext(year, priorStockReturn) {
  const index = year - 2007;
  const [policyDate, policyRate, policyUrl, policyTitle, policyText] = policyRows[index];
  const [jobsDate, jobRate, jobsUrl, jobsTitle, jobsText] = jobsRows[index];
  const [industryDate, industryTag, industryTitle, industryText, industryUrl] = industryRows[index];
  return {
    briefing: [
      { tag: '经济 · 政策', title: policyTitle, text: policyText, sourceUrl: policyUrl, asOf: policyDate, publishedAt: policyDate },
      { tag: industryTag, title: industryTitle, text: industryText, sourceUrl: industryUrl, asOf: industryDate, publishedAt: industryDate },
      { tag: '社会 · 就业', title: jobsTitle, text: jobsText, sourceUrl: jobsUrl, asOf: jobsDate, publishedAt: jobsDate },
    ],
    marketSignals: [
      { label: '政策利率', value: policyRate, context: '年初已公开的联邦基金目标利率；非游戏存款利率', sourceUrl: policyUrl, asOf: policyDate, publishedAt: policyDate },
      { label: `${year - 1} 年 11 月失业率`, value: `${jobRate.toFixed(1)}%`, context: `采用 ${jobsDate} 已发布口径，非事后修订值`, sourceUrl: jobsUrl, asOf: jobsDate, publishedAt: jobsDate },
      { label: `${year - 1} 年宽基回报`, value: `${priorStockReturn >= 0 ? '+' : ''}${priorStockReturn.toFixed(2)}%`, context: '标普 500 含分红；已结束年份的历史整理值', sourceUrl: 'https://pages.stern.nyu.edu/adamodar/New_Home_Page/datafile/histretSP.html', asOf: `${year - 1}-12-31`, observationEnd: `${year - 1}-12-31`, retrospective: true, sourceVintage: '2026-01' },
    ],
  };
}
