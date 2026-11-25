import { OPENING_OBSERVATIONS } from './opening-observations.js';

const fed = 'https://data.bis.org/topics/CBPOL/BIS,WS_CBPOL,1.0/M.US';
const boj = 'https://data.bis.org/topics/CBPOL/BIS,WS_CBPOL,1.0/M.JP';

const sources = {
  'us-overnight': {
    label: '隔夜利率', basis: '此前一个月的银行间隔夜拆借利率均值，反映市场实际资金成本。', url: 'https://fred.stlouisfed.org/series/IRSTCI01USM156N'
  },
  'jp-overnight': {
    label: '隔夜利率', basis: '本期以银行间隔夜拆借成交利率的月均值衡量短端资金成本。', url: 'https://fred.stlouisfed.org/series/IRSTCI01JPM156N'
  },
  'us-target': {
    label: '政策利率', basis: '年末联邦基金目标利率。', url: fed
  },
  'us-midpoint': {
    label: '政策利率', basis: '年末联邦基金目标区间的中点。', url: fed
  },
  'jp-discount': {
    label: '官方贴现率', basis: '日本银行年末的官方贴现率。', url: 'https://www.boj.or.jp/en/statistics/boj/other/discount/discount.htm'
  },
  'jp-call': {
    label: '政策利率', basis: '日本银行年末对无担保隔夜拆借利率设定的操作目标。', url: boj
  },
  'jp-midpoint': {
    label: '政策利率', basis: '日本银行年末无担保隔夜拆借利率目标区间的中点。', url: boj
  },
  'jp-reserve': {
    label: '政策利率', basis: '日本银行对金融机构政策利率余额适用的年末利率。', url: boj
  },
  'us-cpi': {
    label: 'CPI 同比', basis: '全美城市消费者的全项目消费价格指数，按未经季调的同月指数计算一年涨幅。', url: 'https://data.bls.gov/timeseries/CUUR0000SA0', timing: 'release'
  },
  'jp-cpi': {
    label: 'CPI 同比', basis: '日本全国综合消费价格指数的同比涨幅，沿用该期公布的基准。', url: 'https://www.stat.go.jp/data/cpi/sokuhou/tsuki/pdf/zenkoku.pdf'
  },
  'us-ruc': {
    label: '失业率', basis: '经季调的民间失业率。取费城联储第四季度实时档案中当时最新的一个月。', url: 'https://www.philadelphiafed.org/surveys-and-data/real-time-data-research/ruc', timing: 'archive'
  },
  'us-employment': {
    label: '失业率', basis: '美国劳工统计局当月就业报告发布的经季调民间失业率。', timing: 'release'
  },
  'jp-raw': {
    label: '失业率', basis: '日本劳动力调查全国男女合计的未季调失业率。取十月历史原数，供玩家查阅。', url: 'https://www.e-stat.go.jp/en/stat-search/file-download?statInfId=000031831358&fileKind=0', timing: 'compiled'
  },
  'jp-labor-pdf': {
    label: '失业率', basis: '日本总务省统计局当月劳动力调查公布的全国经季调完全失业率。', timing: 'release'
  },
  'jp-jil': {
    label: '失业率', basis: '日本劳动政策研究研修机构当期摘录的全国经季调完全失业率，原发布方为总务省统计局。', timing: 'release'
  },
  'jp-fx': {
    label: '美元兑日元', basis: '纽约市场午间一美元可兑换的日元数。数值上升表示日元走弱。'
  }
};

function vintageNote(timing, date) {
  if (timing === 'release') return date + ' 公布。';
  if (timing === 'archive') return '实时档案的信息截点为 ' + date + '。';
  if (timing === 'compiled') return '月报在上年年底前已公布，数值取自后来的历史汇编。';
  return '截至 ' + date + ' 已知。';
}

function recordsFor(country, openingYear) {
  const rows = Object.hasOwn(OPENING_OBSERVATIONS, country) && OPENING_OBSERVATIONS[country][openingYear];
  if (!Array.isArray(rows)) throw new RangeError('超出开年宏观数据的国家或年份范围。');
  return rows;
}

function reading(key, [source, observed, availableBy, value, releaseUrl, dateBound]) {
  const { label, basis, url, timing } = sources[source];
  const isQuote = key === 'fx';
  return {
    key, label, value, unit: isQuote ? '日元' : '%', period: observed.slice(0, 7), availableBy,
    ...(isQuote && { observationDate: observed }),
    basis: isQuote ? observed + ' 报价。' + basis : basis,
    sourceUrl: releaseUrl || url, vintage: vintageNote(dateBound ? 'by' : timing, availableBy),
    decisionSafe: timing !== 'compiled'
  };
}

export function getOpeningIndicators(country, openingYear) {
  const [rate, cpi, third] = recordsFor(country, openingYear);
  return [reading('rate', rate), reading('cpi', cpi), reading(third[0] === 'jp-fx' ? 'fx' : 'unemployment', third)];
}

export function getHistoricalEmployment(country, openingYear) {
  const archived = recordsFor(country, openingYear)[3];
  return archived ? reading('unemployment', archived) : null;
}
