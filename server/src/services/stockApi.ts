import fetch from 'node-fetch';
import { prisma } from '../index';

const FETCH_TIMEOUT = 10000; // 10秒超时

function fetchWithTimeout(url: string, options: any = {}): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export interface StockQuote {
  symbol: string;
  name: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  close: number; // 昨收
  volume: number; // 成交量(手)
  amount: number; // 成交额(万)
  date: string;
  time: string;
}

export interface KlineItem {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
}

// 解析新浪A股行情数据
function parseSinaQuote(raw: string, symbol: string): StockQuote | null {
  // 格式: var hq_str_sh600519="贵州茅台,1800.00,1795.00,..."
  const match = raw.match(/="([^"]*)"/);
  if (!match || !match[1]) return null;

  const parts = match[1].split(',');
  if (parts.length < 32) return null;

  const name = parts[0];
  const open = parseFloat(parts[1]);
  const close = parseFloat(parts[2]); // 昨收
  let currentPrice = parseFloat(parts[3]);
  const high = parseFloat(parts[4]);
  const low = parseFloat(parts[5]);
  const volume = parseFloat(parts[8]); // 成交量(股)
  const amount = parseFloat(parts[9]); // 成交额(元)

  // 未开盘或停牌时 currentPrice 为 0，用昨收价代替
  if (currentPrice === 0 && close > 0) {
    currentPrice = close;
  }

  const change = currentPrice - close;
  const changePercent = close > 0 ? (change / close) * 100 : 0;

  return {
    symbol,
    name,
    currentPrice,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    open,
    high,
    low,
    close,
    volume: Math.round(volume / 100), // 转为手
    amount: Math.round(amount / 10000), // 转为万
    date: parts[30],
    time: parts[31],
  };
}

// 解析新浪美股行情数据 (gb_ 前缀)
// 已验证的可靠字段:
//   [0]=name, [1]=current_price, [3]=timestamp, [5]=prev_close,
//   [6]=open, [7]=low, [8]=high, [10]=volume, [11]=turnover,
//   [21]=after_hours_price
// 注意: [2]和[4]字段含义不一致，不使用，改为自行计算涨跌
function parseSinaUSQuote(raw: string, symbol: string): StockQuote | null {
  const match = raw.match(/="([^"]*)"/);
  if (!match || !match[1]) return null;

  const parts = match[1].split(',');
  if (parts.length < 10) return null;

  const name = parts[0];
  const currentPrice = parseFloat(parts[1]) || 0; // 当前价
  const close = parseFloat(parts[5]) || 0; // 昨收
  const open = parseFloat(parts[6]) || 0; // 开盘
  const low = parseFloat(parts[7]) || 0; // 最低
  const high = parseFloat(parts[8]) || 0; // 最高
  const volume = parseFloat(parts[10]) || 0; // 成交量(股)
  const amount = parseFloat(parts[11]) || 0; // 成交额(美元)

  // 盘后数据
  const afterHoursPrice = parseFloat(parts[21]) || 0;

  // 使用盘后价格（如果有且当前无交易），都没有则用昨收
  const finalPrice = currentPrice || afterHoursPrice || close;

  // 自行计算涨跌额和涨跌幅（基于昨收）
  const change = close > 0 ? finalPrice - close : 0;
  const changePercent = close > 0 ? (change / close) * 100 : 0;

  // 提取日期 (从 timestamp 字段 [3] 中提取，格式: "2026-06-02 16:11:12")
  const timestamp = parts[3] || '';
  const dateMatch = timestamp.match(/(\d{4}-\d{2}-\d{2})/);
  const timeMatch = timestamp.match(/(\d{2}:\d{2}:\d{2})/);
  const dateStr = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);
  const timeStr = timeMatch ? timeMatch[1] : '';

  return {
    symbol,
    name,
    currentPrice: finalPrice,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    open,
    high,
    low,
    close,
    volume: Math.round(volume / 100), // 转为手
    amount: Math.round(amount / 10000), // 转为万
    date: dateStr,
    time: timeStr,
  };
}

// 解析新浪港股行情数据 (hk 前缀)
// 字段布局: [1]=name(英文), [2]=open, [3]=prev_close, [4]=high, [5]=low,
//   [6]=current, [7]=change, [8]=change_pct, [9]=high_52w, [10]=low_52w,
//   [11]=volume(股), [12]=turnover(港元), [17]=pe, [19]=market_cap
function parseSinaHKQuote(raw: string, symbol: string): StockQuote | null {
  const match = raw.match(/="([^"]*)"/);
  if (!match || !match[1]) return null;

  const parts = match[1].split(',');
  if (parts.length < 13) return null;

  const name = parts[1] || parts[0]; // 英文名，回退到中文名
  const open = parseFloat(parts[2]) || 0;
  const close = parseFloat(parts[3]) || 0; // 昨收
  const high = parseFloat(parts[4]) || 0;
  const low = parseFloat(parts[5]) || 0;
  let currentPrice = parseFloat(parts[6]) || 0;
  let change = parseFloat(parts[7]) || 0;
  let changePercent = parseFloat(parts[8]) || 0;

  // 未开盘或停牌时 currentPrice 为 0，用昨收价代替
  if (currentPrice === 0 && close > 0) {
    currentPrice = close;
    change = 0;
    changePercent = 0;
  }
  const volume = parseFloat(parts[11]) || 0; // 成交量(股)
  const amount = parseFloat(parts[12]) || 0; // 成交额(港元)

  const now = new Date();
  const dateStr = parts[17] || now.toISOString().slice(0, 10);
  const timeStr = parts[18] || '';

  return {
    symbol,
    name,
    currentPrice,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    open,
    high,
    low,
    close,
    volume: Math.round(volume / 100), // 转为手
    amount: Math.round(amount / 10000), // 转为万
    date: dateStr,
    time: timeStr,
  };
}

// 判断符号所属市场
function getSymbolMarket(symbol: string): 'a' | 'us' | 'hk' {
  if (symbol.startsWith('us_')) return 'us';
  if (symbol.startsWith('hk_')) return 'hk';
  return 'a';
}

// 将内部符号转换为新浪行情符号
function toSinaSymbol(symbol: string): string {
  if (symbol.startsWith('us_')) {
    // us_AAPL -> gb_aapl
    return `gb_${symbol.substring(3).toLowerCase()}`;
  }
  if (symbol.startsWith('hk_')) {
    // hk_00700 -> hk00700
    return `hk${symbol.substring(3)}`;
  }
  // A股: sh/sz 前缀
  if (symbol.startsWith('sh') || symbol.startsWith('sz')) return symbol;
  if (symbol.startsWith('6') || symbol.startsWith('5')) return `sh${symbol}`;
  return `sz${symbol}`;
}

// 将新浪符号转回内部符号
function fromSinaSymbol(sina: string): string {
  if (sina.startsWith('gb_')) return `us_${sina.substring(3).toUpperCase()}`;
  if (sina.startsWith('hk')) return `hk_${sina.substring(2)}`;
  return sina; // sh/sz 保持不变
}

// 获取实时行情
export async function fetchStockQuote(symbols: string[]): Promise<StockQuote[]> {
  try {
    const sinaSymbols = symbols.map((s) => toSinaSymbol(s));
    const url = `https://hq.sinajs.cn/list=${sinaSymbols.join(',')}`;

    const response = await fetchWithTimeout(url, {
      headers: {
        Referer: 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const text = await response.text();
    const lines = text.trim().split('\n');

    // 建立 sina符号 -> 内部符号 的映射
    const sinaToInternal = new Map<string, string>();
    for (const s of symbols) {
      sinaToInternal.set(toSinaSymbol(s), s);
    }

    const results: StockQuote[] = [];
    for (const line of lines) {
      // 从响应行中提取新浪符号: var hq_str_sh600519="..."
      const symbolMatch = line.match(/hq_str_([^=]+)="/);
      if (!symbolMatch) continue;

      const sinaSym = symbolMatch[1];
      const internalSym = sinaToInternal.get(sinaSym) || fromSinaSymbol(sinaSym);
      const market = getSymbolMarket(internalSym);

      let quote: StockQuote | null = null;
      if (market === 'us') {
        quote = parseSinaUSQuote(line, internalSym);
      } else if (market === 'hk') {
        quote = parseSinaHKQuote(line, internalSym);
      } else {
        quote = parseSinaQuote(line, internalSym);
      }
      if (quote) {
        results.push(quote);
      }
    }

    return results;
  } catch (error) {
    console.error('Fetch stock quote error:', error);
    return [];
  }
}

// 保存行情快照到数据库（每日每只股票一条，盘中实时更新）
export async function saveQuoteHistory(quotes: StockQuote[]): Promise<void> {
  if (quotes.length === 0) return;

  try {
    const validQuotes = quotes.filter((q) => q.date && q.currentPrice !== 0);
    console.log(`[saveQuoteHistory] 收到${quotes.length}条行情, 有效${validQuotes.length}条`);
    await Promise.all(
      validQuotes.map((q) =>
        prisma.quoteHistory.upsert({
          where: {
            symbol_date: { symbol: q.symbol, date: q.date },
          },
          update: {
            name: q.name,
            close: q.currentPrice,
            high: { set: Math.max(q.high, q.currentPrice) },
            low: { set: Math.min(q.low, q.currentPrice) },
            change: q.change,
            changePercent: q.changePercent,
            volume: q.volume,
            amount: q.amount,
            updatedAt: new Date(),
          },
          create: {
            symbol: q.symbol,
            name: q.name,
            date: q.date,
            open: q.open,
            high: q.high,
            low: q.low,
            close: q.currentPrice,
            prevClose: q.close,
            change: q.change,
            changePercent: q.changePercent,
            volume: q.volume,
            amount: q.amount,
          },
        })
      )
    );
    console.log(`[saveQuoteHistory] 写入成功: ${validQuotes.length}条`);
  } catch (error) {
    console.error('[saveQuoteHistory] 写入失败:', error);
  }
}

// 查询行情历史
export async function getQuoteHistory(symbol: string, days: number = 30) {
  return prisma.quoteHistory.findMany({
    where: { symbol },
    orderBy: { date: 'desc' },
    take: days,
  });
}

// 搜索股票/基金/美股/港股 (使用东方财富接口)
export async function searchStocks(keyword: string): Promise<{ symbol: string; name: string; type: string }[]> {
  try {
    // 并行搜索A股、基金、美股、港股
    const [stockResults, fundResults, usResults, hkResults] = await Promise.all([
      searchStocksAPI(keyword),
      searchFundsAPI(keyword),
      searchUSStocksAPI(keyword),
      searchHKStocksAPI(keyword),
    ]);

    // 收集已有的基金代码，用于过滤美股/港股搜索中的误匹配
    const fundCodes = new Set<string>();
    for (const item of fundResults) {
      const code = item.symbol.replace(/^(sh|sz)/, '');
      fundCodes.add(code);
    }

    // 合并结果，去重（A股 > 基金 > 美股 > 港股）
    const seen = new Map<string, { symbol: string; name: string; type: string }>();
    for (const item of stockResults) {
      seen.set(item.symbol, item);
    }
    for (const item of fundResults) {
      if (!seen.has(item.symbol)) {
        seen.set(item.symbol, item);
      }
    }
    // 美股结果中排除已知基金代码
    for (const item of usResults) {
      const code = item.symbol.replace(/^us_/, '');
      if (!fundCodes.has(code) && !seen.has(item.symbol)) {
        seen.set(item.symbol, item);
      }
    }
    // 港股结果中排除已知基金代码
    for (const item of hkResults) {
      const code = item.symbol.replace(/^hk_/, '');
      if (!fundCodes.has(code) && !seen.has(item.symbol)) {
        seen.set(item.symbol, item);
      }
    }
    return Array.from(seen.values());
  } catch (error) {
    console.error('Search stocks error:', error);
    return [];
  }
}

// 股票搜索（东方财富行情搜索API）
async function searchStocksAPI(keyword: string): Promise<{ symbol: string; name: string; type: string }[]> {
  try {
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=20`;
    const response = await fetchWithTimeout(url);
    const data = (await response.json()) as {
      QuotationCodeTable?: {
        Data?: Array<{
          Code: string;
          Name: string;
          MktNum: string;
          SecurityTypeName: string;
        }>;
      };
    };

    if (!data.QuotationCodeTable?.Data) return [];

    const seen = new Set<string>();
    return data.QuotationCodeTable.Data
      .filter((item) => {
        const key = `${item.Code}_${item.Name}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((item) => ({
        symbol: item.MktNum === '1' ? `sh${item.Code}` : `sz${item.Code}`,
        name: item.Name,
        type: item.SecurityTypeName.includes('基金') ? 'fund' : 'stock',
      }));
  } catch {
    return [];
  }
}

// 基金搜索（东方财富基金搜索API，支持ETF等关键词）
async function searchFundsAPI(keyword: string): Promise<{ symbol: string; name: string; type: string }[]> {
  try {
    const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(keyword)}`;
    const response = await fetchWithTimeout(url);
    const data = (await response.json()) as {
      Datas?: Array<{
        CODE: string;
        NAME: string;
      }>;
    };

    if (!data.Datas) return [];

    return data.Datas.slice(0, 10).map((item) => {
      const code = item.CODE;
      const market = code.startsWith('6') ? 'sh' : 'sz';
      return {
        symbol: `${market}${code}`,
        name: item.NAME,
        type: 'fund' as const, // 基金搜索API返回的都是基金
      };
    });
  } catch {
    return [];
  }
}

// 美股搜索（东方财富搜索API，type=14）
async function searchUSStocksAPI(keyword: string): Promise<{ symbol: string; name: string; type: string }[]> {
  try {
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=10`;
    const response = await fetchWithTimeout(url);
    const data = (await response.json()) as {
      QuotationCodeTable?: {
        Data?: Array<{
          Code: string;
          Name: string;
          MktNum: string;
          SecurityTypeName: string;
        }>;
      };
    };

    if (!data.QuotationCodeTable?.Data) return [];

    return data.QuotationCodeTable.Data
      .filter((item) => {
        // 只保留股票，过滤掉ETF等
        const name = item.SecurityTypeName || '';
        return !name.includes('ETF') && !name.includes('指数');
      })
      .map((item) => ({
        symbol: `us_${item.Code}`, // us_AAPL
        name: item.Name,
        type: 'us_stock' as const,
      }));
  } catch {
    return [];
  }
}

// 港股搜索（东方财富搜索API，type=3）
async function searchHKStocksAPI(keyword: string): Promise<{ symbol: string; name: string; type: string }[]> {
  try {
    const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=3&token=D43BF722C8E33BDC906FB84D85E326E8&count=10`;
    const response = await fetchWithTimeout(url);
    const data = (await response.json()) as {
      QuotationCodeTable?: {
        Data?: Array<{
          Code: string;
          Name: string;
          MktNum: string;
          SecurityTypeName: string;
        }>;
      };
    };

    if (!data.QuotationCodeTable?.Data) return [];

    return data.QuotationCodeTable.Data
      .filter((item) => {
        const name = item.SecurityTypeName || '';
        return !name.includes('ETF') && !name.includes('指数');
      })
      .map((item) => ({
        symbol: `hk_${item.Code}`, // hk_00700
        name: item.Name,
        type: 'hk_stock' as const,
      }));
  } catch {
    return [];
  }
}

// 获取K线数据 — 东方财富为主，腾讯为备选
export async function fetchKlineData(symbol: string, period: string = 'day'): Promise<KlineItem[]> {
  // 优先尝试东方财富
  const emData = await fetchKlineFromEastmoney(symbol, period);
  if (emData.length > 0) return emData;

  // 东方财富失败，尝试腾讯
  console.log(`[fetchKlineData] ${symbol} 东方财富失败，切换腾讯API`);
  const txData = await fetchKlineFromTencent(symbol, period);
  if (txData.length > 0) return txData;

  console.warn(`[fetchKlineData] ${symbol} ${period} 所有数据源均失败`);
  return [];
}

// 东方财富K线接口
async function fetchKlineFromEastmoney(symbol: string, period: string): Promise<KlineItem[]> {
  try {
    let secid: string;
    if (symbol.startsWith('us_')) {
      const code = symbol.substring(3);
      secid = `105.${code}`;
    } else if (symbol.startsWith('hk_')) {
      const code = symbol.substring(3);
      secid = `100.${code}`;
    } else {
      const code = symbol.replace(/^(sh|sz)/, '');
      secid = symbol.startsWith('sh') ? `1.${code}` : `0.${code}`;
    }

    const kltMap: Record<string, string> = {
      day: '101', week: '102', month: '103',
      '5min': '5', '15min': '15', '30min': '30', '60min': '60',
    };

    const klt = kltMap[period] || '101';
    const url = `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53,f54,f55,f56,f57&klt=${klt}&fqt=1&end=20500101&lmt=120`;

    const response = await fetchWithTimeout(url);
    const data = (await response.json()) as { data?: { klines?: string[] } };

    if (!data.data?.klines) return [];

    return data.data.klines.map((line) => {
      const parts = line.split(',');
      return {
        date: parts[0],
        open: parseFloat(parts[1]),
        close: parseFloat(parts[2]),
        high: parseFloat(parts[3]),
        low: parseFloat(parts[4]),
        volume: parseFloat(parts[5]),
        amount: parseFloat(parts[6]),
      };
    });
  } catch (error) {
    console.error(`[fetchKlineFromEastmoney] ${symbol} ${period} 失败:`, (error as Error).message);
    return [];
  }
}

// 腾讯K线接口（备选）
async function fetchKlineFromTencent(symbol: string, period: string): Promise<KlineItem[]> {
  try {
    // 转换内部符号为腾讯格式
    let txSymbol: string;
    if (symbol.startsWith('us_')) {
      // 美股需要 .OQ 后缀（NASDAQ）
      txSymbol = `us${symbol.substring(3)}.OQ`;
    } else if (symbol.startsWith('hk_')) {
      txSymbol = `hk${symbol.substring(3)}`;
    } else {
      // A股: sh/sz 前缀，腾讯格式一致
      txSymbol = symbol;
    }

    // 腾讯只支持 day/week/month，分钟级别暂不支持
    const periodMap: Record<string, string> = {
      day: 'day', week: 'week', month: 'month',
    };
    const txPeriod = periodMap[period];
    if (!txPeriod) {
      console.warn(`[fetchKlineFromTencent] 不支持 ${period} 周期`);
      return [];
    }

    const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${txSymbol},${txPeriod},,,120,qfq`;
    console.log(`[fetchKlineFromTencent] 请求: ${url}`);

    const response = await fetchWithTimeout(url);
    const data = (await response.json()) as Record<string, any>;

    // 响应格式: { data: { "sh600519": { "qfqday": [...], "day": [...] } } }
    const stockData = data.data?.[txSymbol];
    if (!stockData) {
      console.warn(`[fetchKlineFromTencent] ${txSymbol} 无数据, keys:`, Object.keys(data.data || {}));
      return [];
    }

    // 优先取前复权数据
    const klineKey = `qfq${txPeriod}`;
    const klines = stockData[klineKey] || stockData[txPeriod];
    if (!klines || !Array.isArray(klines)) {
      console.warn(`[fetchKlineFromTencent] ${txSymbol} 无kline数组, keys:`, Object.keys(stockData));
      return [];
    }

    // 腾讯格式: [date, open, close, high, low, volume, ?extra]
    const result: KlineItem[] = klines.map((item: any[]) => ({
      date: item[0],
      open: parseFloat(item[1]),
      close: parseFloat(item[2]),
      high: parseFloat(item[3]),
      low: parseFloat(item[4]),
      volume: parseFloat(item[5]) || 0,
      amount: 0, // 腾讯接口不提供成交额
    }));

    console.log(`[fetchKlineFromTencent] ${symbol} 成功: ${result.length}条, 首条=${result[0]?.date}, 末条=${result[result.length - 1]?.date}`);
    return result;
  } catch (error) {
    console.error(`[fetchKlineFromTencent] ${symbol} ${period} 失败:`, (error as Error).message);
    return [];
  }
}

// K线数据缓存过期时间(毫秒)
const CACHE_TTL: Record<string, number> = {
  day: 12 * 60 * 60 * 1000,    // 日K: 12小时
  week: 3 * 24 * 60 * 60 * 1000, // 周K: 3天
  month: 7 * 24 * 60 * 60 * 1000, // 月K: 7天
  '60min': 60 * 60 * 1000,      // 60分钟: 1小时
  '30min': 30 * 60 * 1000,      // 30分钟: 30分钟
  '15min': 15 * 60 * 1000,      // 15分钟: 15分钟
  '5min': 5 * 60 * 1000,        // 5分钟: 5分钟
};

// 获取缓存的K线数据
export async function getCachedKline(symbol: string, period: string = 'day'): Promise<KlineItem[]> {
  const cached = await prisma.klineCache.findMany({
    where: { symbol, period },
    orderBy: { date: 'asc' },
  });

  return cached.map((c) => ({
    date: c.date,
    open: c.open,
    close: c.close,
    high: c.high,
    low: c.low,
    volume: c.volume,
    amount: c.amount,
  }));
}

// 检查缓存是否有效
export async function isCacheValid(symbol: string, period: string): Promise<boolean> {
  const latest = await prisma.klineCache.findFirst({
    where: { symbol, period },
    orderBy: { updatedAt: 'desc' },
    select: { updatedAt: true },
  });

  if (!latest) return false;

  const ttl = CACHE_TTL[period] || CACHE_TTL.day;
  return Date.now() - latest.updatedAt.getTime() < ttl;
}

// 从API获取并更新缓存
export async function fetchAndCacheKline(symbol: string, period: string = 'day'): Promise<KlineItem[]> {
  console.log(`[fetchAndCacheKline] 开始: symbol=${symbol}, period=${period}`);
  const data = await fetchKlineData(symbol, period);

  if (data.length === 0) {
    console.warn(`[fetchAndCacheKline] ${symbol} 获取到0条数据，跳过缓存写入`);
    return data;
  }

  console.log(`[fetchAndCacheKline] ${symbol} 获取到${data.length}条数据，开始写入缓存...`);

  try {
    // 并行写入缓存
    await Promise.all(
      data.map((item) =>
        prisma.klineCache.upsert({
          where: {
            symbol_period_date: { symbol, period, date: item.date },
          },
          update: {
            open: item.open,
            close: item.close,
            high: item.high,
            low: item.low,
            volume: item.volume,
            amount: item.amount,
          },
          create: {
            symbol,
            period,
            date: item.date,
            open: item.open,
            close: item.close,
            high: item.high,
            low: item.low,
            volume: item.volume,
            amount: item.amount,
          },
        })
      )
    );
    console.log(`[fetchAndCacheKline] ${symbol} 缓存写入成功: ${data.length}条`);
  } catch (error) {
    console.error(`[fetchAndCacheKline] ${symbol} 缓存写入失败:`, error);
  }

  return data;
}

// ========== 基金重仓股相关 ==========

export interface FundHolding {
  stockCode: string;    // 股票代码
  stockName: string;    // 股票名称
  symbol: string;       // 带市场前缀 sh/sz
  ratio: number;        // 占基金净值比例 (%)
  shares: number;       // 持股数 (万股)
  marketValue: number;  // 持仓市值 (万元)
}

export interface FundEstimate {
  fundSymbol: string;
  fundName: string;
  estimateChange: number;       // 估算涨跌幅 (%)
  holdings: FundHolding[];
  stockContributions: Array<{
    symbol: string;
    name: string;
    ratio: number;
    stockChange: number;       // 股票涨跌幅 (%)
    contribution: number;      // 对基金收益贡献 (%)
  }>;
  updateTime: string;
}

// 获取基金代码 (去掉 sh/sz/us_/hk_ 前缀)
function getFundCode(symbol: string): string {
  return symbol.replace(/^(sh|sz|us_|hk_)/, '');
}

// 从数据库获取缓存的基金持仓
async function getCachedFundHoldings(fundSymbol: string): Promise<FundHolding[] | null> {
  const cached = await prisma.fundHoldingCache.findMany({
    where: { fundSymbol },
    orderBy: { updatedAt: 'desc' },
    take: 1,
  });

  if (cached.length === 0) return null;

  // 检查缓存是否过期（7天）
  const updatedAt = cached[0].updatedAt.getTime();
  const ttl = 7 * 24 * 60 * 60 * 1000;
  if (Date.now() - updatedAt > ttl) return null;

  // 获取该基金所有缓存持仓
  const allCached = await prisma.fundHoldingCache.findMany({
    where: { fundSymbol },
  });

  // 空缓存视为缓存未命中（可能是之前解析失败时缓存的）
  if (allCached.length === 0) return null;

  return allCached.map((c) => ({
    stockCode: c.stockCode,
    stockName: c.stockName,
    symbol: c.symbol,
    ratio: c.ratio,
    shares: c.shares,
    marketValue: c.marketValue,
  }));
}

// 保存基金持仓到缓存
async function saveFundHoldings(fundSymbol: string, holdings: FundHolding[]): Promise<void> {
  if (holdings.length === 0) return;

  // 按 stockCode 去重，保留第一个
  const seen = new Set<string>();
  const unique = holdings.filter((h) => {
    if (seen.has(h.stockCode)) return false;
    seen.add(h.stockCode);
    return true;
  });

  // 清除旧缓存
  await prisma.fundHoldingCache.deleteMany({ where: { fundSymbol } });

  // 并行写入新缓存
  const reportDate = new Date().toISOString().slice(0, 7); // YYYY-MM
  await Promise.all(
    unique.map((h) =>
      prisma.fundHoldingCache.create({
        data: {
          fundSymbol,
          stockCode: h.stockCode,
          stockName: h.stockName,
          symbol: h.symbol,
          ratio: h.ratio,
          shares: h.shares,
          marketValue: h.marketValue,
          reportDate,
        },
      })
    )
  );
}

// 获取基金重仓股数据（优先读缓存）
export async function fetchFundHoldings(symbol: string): Promise<FundHolding[]> {
  // 先查缓存
  const cached = await getCachedFundHoldings(symbol);
  if (cached && cached.length > 0) {
    return cached;
  }

  try {
    const fundCode = getFundCode(symbol);
    // 东方财富基金持仓接口
    const url = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${fundCode}&topline=10&year=&month=&rt=0.${Date.now()}`;

    const response = await fetchWithTimeout(url, {
      headers: {
        Referer: 'https://fund.eastmoney.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const html = await response.text();

    // 只取第一个表格（最新季度）的数据
    const firstTbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    const tableHtml = firstTbody ? firstTbody[1] : html;
    console.log(`[fetchFundHoldings] tableHtml length: ${tableHtml.length}, first 200: ${tableHtml.substring(0, 200)}`);

    const holdings: FundHolding[] = [];

    // 先用简单正则提取所有<tr>
    // QDII基金持仓代码可能是字母（如AAPL）或数字（如600519）
    const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
    let rowMatch;
    let rowCount = 0;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const row = rowMatch[1];
      rowCount++;
      // 在每行中提取数据 — 支持纯数字代码(A股)和字母代码(美股/港股)
      const codeMatch = row.match(/<a[^>]*>([0-9]{6})<\/a>/) || row.match(/<a[^>]*>([A-Z][A-Z0-9_.]{0,9})<\/a>/);
      const nameMatch = row.match(/<a[^>]*>([^<]{2,})<\/a>/g);
      const ratioMatch = row.match(/([0-9.]+)%/);
      if (codeMatch && ratioMatch && nameMatch && nameMatch.length >= 2) {
        const code = codeMatch[1];
        const name = nameMatch[1].replace(/<[^>]*>/g, '').trim();
        const ratio = parseFloat(ratioMatch[1]);
        // 提取持股数和市值 - 在ratio之后的两个数字
        const afterRatio = row.substring(row.indexOf(ratioMatch[0]) + ratioMatch[0].length);
        const nums = afterRatio.match(/([0-9.,]+)/g);
        const shares = nums && nums[0] ? parseFloat(nums[0].replace(/,/g, '')) : 0;
        const marketValue = nums && nums[1] ? parseFloat(nums[1].replace(/,/g, '')) : 0;

        if (code && name && !isNaN(ratio)) {
          // 判断市场：纯数字6位=A股，字母=美股，5位数字=港股
          let symbol: string;
          if (/^[0-9]{6}$/.test(code)) {
            // A股代码 — 保持原有格式 sh600519
            const market = code.startsWith('6') || code.startsWith('5') ? 'sh' : 'sz';
            symbol = `${market}${code}`;
          } else if (/^[A-Z][A-Z0-9_.]{0,9}$/.test(code)) {
            // 美股代码 (AAPL, MSFT等)
            symbol = `us_${code}`;
          } else {
            // 港股或其他
            symbol = `hk_${code}`;
          }
          holdings.push({
            stockCode: code,
            stockName: name,
            symbol,
            ratio,
            shares,
            marketValue,
          });
        }
      }
    }
    console.log(`[fetchFundHoldings] ${symbol}: ${rowCount} rows, parsed ${holdings.length} holdings`);

    // 如果持仓为空，可能是联接基金，尝试查找目标ETF
    if (holdings.length === 0) {
      console.log(`[fetchFundHoldings] ${symbol}: 0 holdings, trying feeder fund ETF lookup`);
      const etfHoldings = await findFeederFundETFHoldings(symbol);
      if (etfHoldings.length > 0) {
        await saveFundHoldings(symbol, etfHoldings);
        return etfHoldings;
      }
      // 备用JSON接口
      const jsonHoldings = await fetchFundHoldingsJSON(fundCode);
      if (jsonHoldings.length > 0) {
        await saveFundHoldings(symbol, jsonHoldings);
      }
      return jsonHoldings;
    }

    // 保存到缓存
    await saveFundHoldings(symbol, holdings);
    return holdings;
  } catch (error) {
    console.error('Fetch fund holdings error:', error);
    return [];
  }
}

// 联接基金：查找目标ETF并获取其持仓
async function findFeederFundETFHoldings(symbol: string): Promise<FundHolding[]> {
  try {
    // 从 watchlist 获取基金名称
    const item = await prisma.watchlist.findFirst({ where: { symbol } });
    const fundName = item?.name || '';
    console.log(`[findFeederETF] ${symbol} name: ${fundName}`);

    // 从名称中提取ETF关键词
    // "广发电力ETF联接C" -> 搜索 "电力ETF"
    const keywords: string[] = [];
    // 去掉 "联接ABC" 后缀得到 "广发电力ETF"
    const withoutLink = fundName.replace(/联接[ABC]?$/, '');
    // 提取ETF前面的关键词部分用于搜索
    const etfIdx = withoutLink.indexOf('ETF');
    if (etfIdx > 0) {
      const sectorPart = withoutLink.substring(2, etfIdx); // "电力" (去掉2字公司名)
      if (sectorPart) {
        keywords.push(sectorPart + 'ETF'); // "电力ETF"
      }
    }
    keywords.push(withoutLink); // "广发电力ETF"

    for (const keyword of keywords) {
      console.log(`[findFeederETF] searching: ${keyword}`);
      const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(keyword)}&type=14&token=D43BF722C8E33BDC906FB84D85E326E8&count=20`;
      const response = await fetchWithTimeout(url);
      const data = (await response.json()) as {
        QuotationCodeTable?: { Data?: Array<{ Code: string; Name: string; MktNum: string }> };
      };

      const items = data.QuotationCodeTable?.Data || [];
      // 找到名称中包含"ETF"但不含"联接"的基金（目标ETF）
      // 优先匹配同一公司（如 "广发电力ETF联接C" -> "电力ETF广发"）
      const company = fundName.substring(0, 2); // "广发"
      const etf = items.find((i) =>
        i.Name.includes('ETF') && !i.Name.includes('联接') && i.Name.includes(company)
      ) || items.find((i) =>
        i.Name.includes('ETF') && !i.Name.includes('联接')
      );
      if (etf) {
        const etfSymbol = etf.MktNum === '1' ? `sh${etf.Code}` : `sz${etf.Code}`;
        console.log(`[findFeederETF] found target ETF: ${etfSymbol} ${etf.Name}`);
        // 递归获取ETF的持仓
        return fetchETFHoldingsDirect(etf.Code, etfSymbol);
      }
    }

    console.log(`[findFeederETF] no target ETF found for ${symbol}`);
    return [];
  } catch (error) {
    console.error('Find feeder fund ETF error:', error);
    return [];
  }
}

// 直接获取ETF的持仓数据
async function fetchETFHoldingsDirect(etfCode: string, etfSymbol: string): Promise<FundHolding[]> {
  try {
    const url = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${etfCode}&topline=10&year=&month=&rt=0.${Date.now()}`;
    const response = await fetchWithTimeout(url, {
      headers: {
        Referer: 'https://fund.eastmoney.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    const html = await response.text();

    const firstTbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    const tableHtml = firstTbody ? firstTbody[1] : html;

    const holdings: FundHolding[] = [];
    const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const row = rowMatch[1];
      // 支持纯数字代码(A股)和字母代码(美股/港股)
      const codeMatch = row.match(/<a[^>]*>([0-9]{6})<\/a>/) || row.match(/<a[^>]*>([A-Z][A-Z0-9_.]{0,9})<\/a>/);
      const nameMatch = row.match(/<a[^>]*>([^<]{2,})<\/a>/g);
      const ratioMatch = row.match(/([0-9.]+)%/);
      if (codeMatch && ratioMatch && nameMatch && nameMatch.length >= 2) {
        const code = codeMatch[1];
        const name = nameMatch[1].replace(/<[^>]*>/g, '').trim();
        const ratio = parseFloat(ratioMatch[1]);
        const afterRatio = row.substring(row.indexOf(ratioMatch[0]) + ratioMatch[0].length);
        const nums = afterRatio.match(/([0-9.,]+)/g);
        const shares = nums && nums[0] ? parseFloat(nums[0].replace(/,/g, '')) : 0;
        const marketValue = nums && nums[1] ? parseFloat(nums[1].replace(/,/g, '')) : 0;

        if (code && name && !isNaN(ratio)) {
          let symbol: string;
          if (/^[0-9]{6}$/.test(code)) {
            const market = code.startsWith('6') || code.startsWith('5') ? 'sh' : 'sz';
            symbol = `${market}${code}`;
          } else if (/^[A-Z][A-Z0-9_.]{0,9}$/.test(code)) {
            symbol = `us_${code}`;
          } else {
            symbol = `hk_${code}`;
          }
          holdings.push({ stockCode: code, stockName: name, symbol, ratio, shares, marketValue });
        }
      }
    }
    console.log(`[fetchETFHoldingsDirect] ${etfSymbol} (${etfCode}): ${holdings.length} holdings`);
    return holdings;
  } catch (error) {
    console.error('Fetch ETF holdings direct error:', error);
    return [];
  }
}

// 备用: 通过天天基金 JSON 接口获取持仓
async function fetchFundHoldingsJSON(fundCode: string): Promise<FundHolding[]> {
  try {
    const url = `https://fund.eastmoney.com/f10/F10DataApi.aspx?type=InverstPosition&code=${fundCode}&date=&lt=1`;

    const response = await fetchWithTimeout(url, {
      headers: {
        Referer: 'https://fund.eastmoney.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const text = await response.text();

    // 从返回的 JS 变量中提取 HTML
    const htmlMatch = text.match(/content:"(.*?)"/s);
    if (!htmlMatch) return [];

    const html = htmlMatch[1].replace(/\\"/g, '"').replace(/\\\//g, '/');

    const holdings: FundHolding[] = [];
    // 支持纯数字代码(A股)和字母代码(美股/港股)
    const rowRegex = /<td[^>]*>\s*<a[^>]*>([0-9A-Z][A-Z0-9_.]{0,9})<\/a>\s*<\/td>\s*<td[^>]*>\s*<a[^>]*>([^<]*)<\/a>\s*<\/td>.*?<td[^>]*>\s*([0-9.]+)%\s*<\/td>\s*<td[^>]*>\s*([0-9.,]+)\s*<\/td>\s*<td[^>]*>\s*([0-9.,]+)\s*<\/td>/gs;

    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const code = match[1];
      const name = match[2].trim();
      const ratio = parseFloat(match[3]);
      const shares = parseFloat(match[4].replace(/,/g, ''));
      const marketValue = parseFloat(match[5].replace(/,/g, ''));

      if (code && name && !isNaN(ratio)) {
        let symbol: string;
        if (/^[0-9]{6}$/.test(code)) {
          const market = code.startsWith('6') || code.startsWith('5') ? 'sh' : 'sz';
          symbol = `${market}${code}`;
        } else if (/^[A-Z][A-Z0-9_.]{0,9}$/.test(code)) {
          symbol = `us_${code}`;
        } else {
          symbol = `hk_${code}`;
        }
        holdings.push({
          stockCode: code,
          stockName: name,
          symbol,
          ratio,
          shares,
          marketValue,
        });
      }
    }

    return holdings;
  } catch (error) {
    console.error('Fetch fund holdings JSON error:', error);
    return [];
  }
}

// 计算基金估算收益
export async function estimateFundReturn(symbol: string, fundName: string): Promise<FundEstimate> {
  // 1. 获取重仓股
  const holdings = await fetchFundHoldings(symbol);

  if (holdings.length === 0) {
    return {
      fundSymbol: symbol,
      fundName,
      estimateChange: 0,
      holdings: [],
      stockContributions: [],
      updateTime: new Date().toLocaleTimeString('zh-CN'),
    };
  }

  // 2. 获取重仓股的实时行情
  const stockSymbols = holdings.map((h) => h.symbol);
  const quotes = await fetchStockQuote(stockSymbols);

  // 3. 计算每只股票的贡献
  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  // 计算重仓股总占比（季报中的前N大重仓股占基金净值比例之和）
  const totalRatio = holdings.reduce((sum, h) => sum + h.ratio, 0);

  // 计算重仓股的加权涨跌幅
  let weightedChange = 0;
  const stockContributions = holdings.map((h) => {
    const quote = quoteMap.get(h.symbol);
    const stockChange = quote?.changePercent ?? 0;
    const contribution = (h.ratio / 100) * stockChange;
    weightedChange += contribution;

    return {
      symbol: h.symbol,
      name: h.stockName,
      ratio: h.ratio,
      stockChange: Math.round(stockChange * 100) / 100,
      contribution: Math.round(contribution * 10000) / 10000,
    };
  });

  // 4. 归一化处理：将重仓股贡献外推到基金整体
  //
  // 原理：前N大重仓股占基金净值的 totalRatio%，剩余部分(100-totalRatio)%是
  // 其他股票、债券、现金等。假设其他持仓与重仓股涨跌趋势相似（对于偏股型基金
  // 这是合理近似），则基金整体涨跌 ≈ weightedChange / (totalRatio/100)。
  //
  // 对于 totalRatio 过低（<30%）的情况，说明重仓股数据不具代表性，
  // 不做外推，直接返回加权值（更保守准确）。
  let estimateChange: number;
  if (totalRatio >= 30) {
    // 外推到基金整体
    estimateChange = weightedChange / (totalRatio / 100);
  } else {
    // 重仓股占比太低，不做外推
    estimateChange = weightedChange;
  }

  console.log(`[estimateFundReturn] ${symbol}: 前${holdings.length}大重仓占比${totalRatio.toFixed(1)}%, 加权涨跌=${weightedChange.toFixed(4)}%, 归一化后=${estimateChange.toFixed(2)}%`);

  const result: FundEstimate = {
    fundSymbol: symbol,
    fundName,
    estimateChange: Math.round(estimateChange * 100) / 100,
    holdings,
    stockContributions,
    updateTime: new Date().toLocaleTimeString('zh-CN'),
  };

  // 5. 保存到历史记录
  await saveFundEstimateHistory(symbol, fundName, result).catch((err) => {
    console.error('Save fund estimate history error:', err);
  });

  return result;
}

// 保存基金估算收益历史记录
async function saveFundEstimateHistory(fundSymbol: string, fundName: string, estimate: FundEstimate): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  await prisma.fundEstimateHistory.upsert({
    where: {
      fundSymbol_date: { fundSymbol, date: today },
    },
    update: {
      fundName,
      estimateChange: estimate.estimateChange,
      holdingsCount: estimate.holdings.length,
      stockContributions: JSON.stringify(estimate.stockContributions),
    },
    create: {
      fundSymbol,
      fundName,
      date: today,
      estimateChange: estimate.estimateChange,
      holdingsCount: estimate.holdings.length,
      stockContributions: JSON.stringify(estimate.stockContributions),
    },
  });
}

// 获取基金估算收益历史记录
export async function getFundEstimateHistory(fundSymbol: string, days: number = 30) {
  return prisma.fundEstimateHistory.findMany({
    where: { fundSymbol },
    orderBy: { date: 'desc' },
    take: days,
  });
}

// ========== 全市场股票行情 ==========

export interface MarketStock {
  symbol: string;
  code: string;
  name: string;
  currentPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  amount: number;
  amplitude: number;
  turnoverRate: number;
  pe: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  totalMarketCap: number;
  circulatingMarketCap: number;
}

export interface MarketResult {
  list: MarketStock[];
  total: number;
  page: number;
  pageSize: number;
}

// 获取全市场行情 (A股/美股/港股)
export async function fetchMarketStocks(options: {
  page?: number;
  pageSize?: number;
  sortField?: string;
  sortOrder?: string;
  market?: string;
  search?: string;
}): Promise<MarketResult> {
  const {
    page = 1,
    pageSize = 50,
    sortField = 'f3',
    sortOrder = 'desc',
    market = '',
    search = '',
  } = options;

  // 市场筛选: fs 参数
  // A股: m:0+t:6=深主板, m:0+t:80=创业板, m:1+t:2=沪主板, m:1+t:23=科创板
  // 美股: m:105=NASDAQ, m:106=NYSE, m:107=AMEX
  // 港股: m:100
  let fs = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23';
  if (market === 'sh') fs = 'm:1+t:2,m:1+t:23';
  if (market === 'sz') fs = 'm:0+t:6,m:0+t:80';
  if (market === 'cyb') fs = 'm:0+t:80';
  if (market === 'kcb') fs = 'm:1+t:23';
  if (market === 'us') fs = 'm:105+t:3,m:106+t:3,m:107+t:3';
  if (market === 'us_nasdaq') fs = 'm:105+t:3';
  if (market === 'us_nyse') fs = 'm:106+t:3';
  if (market === 'hk') fs = 'm:100+t:6,m:100+t:80';

  // 排序字段映射
  const fidMap: Record<string, string> = {
    changePercent: 'f3',
    currentPrice: 'f2',
    volume: 'f5',
    amount: 'f6',
    amplitude: 'f7',
    turnoverRate: 'f8',
    pe: 'f9',
    totalMarketCap: 'f20',
  };
  const fid = fidMap[sortField] || 'f3';
  const po = sortOrder === 'asc' ? 0 : 1; // 0=升序 1=降序

  try {
    const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=${po}&np=1&fltt=2&invt=2&fid=${fid}&fs=${encodeURIComponent(fs)}&fields=f2,f3,f4,f5,f6,f7,f8,f9,f12,f13,f14,f15,f16,f17,f18,f20,f21`;

    const response = await fetchWithTimeout(url, {
      headers: {
        Referer: 'https://quote.eastmoney.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const data = (await response.json()) as {
      data?: {
        total?: number;
        diff?: Array<Record<string, any>>;
      };
    };

    if (!data.data?.diff) {
      return { list: [], total: 0, page, pageSize };
    }

    let items = data.data.diff.map((item: any) => {
      const code = String(item.f12 || '');
      const mkt = item.f13; // 0=深 1=沪 105=NASDAQ 106=NYSE 107=AMEX 100=港股
      let symbol: string;
      if (mkt === 105 || mkt === 106 || mkt === 107) {
        symbol = `us_${code}`;
      } else if (mkt === 100) {
        symbol = `hk_${code}`;
      } else {
        symbol = mkt === 1 ? `sh${code}` : `sz${code}`;
      }

      return {
        symbol,
        code,
        name: item.f14 || '',
        currentPrice: item.f2 ?? 0,
        change: item.f4 ?? 0,
        changePercent: item.f3 ?? 0,
        volume: item.f5 ?? 0,
        amount: item.f6 ?? 0,
        amplitude: item.f7 ?? 0,
        turnoverRate: item.f8 ?? 0,
        pe: item.f9 ?? 0,
        high: item.f15 ?? 0,
        low: item.f16 ?? 0,
        open: item.f17 ?? 0,
        prevClose: item.f18 ?? 0,
        totalMarketCap: item.f20 ?? 0,
        circulatingMarketCap: item.f21 ?? 0,
      };
    });

    // 搜索过滤（前端搜索在服务端做，避免加载全量数据）
    if (search) {
      const s = search.toLowerCase();
      items = items.filter(
        (item) =>
          item.name.toLowerCase().includes(s) ||
          item.code.toLowerCase().includes(s)
      );
    }

    return {
      list: items,
      total: data.data.total || 0,
      page,
      pageSize,
    };
  } catch (error) {
    console.error('Fetch market stocks error:', error);
    return { list: [], total: 0, page, pageSize };
  }
}
