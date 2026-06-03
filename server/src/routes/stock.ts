import { Router, Request, Response } from 'express';
import { fetchStockQuote, searchStocks, fetchKlineData, getCachedKline, isCacheValid, fetchAndCacheKline, fetchFundHoldings, estimateFundReturn, getQuoteHistory, saveQuoteHistory, getFundEstimateHistory, fetchMarketStocks } from '../services/stockApi';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// 获取股票实时行情
router.get('/quote', authMiddleware, async (req: Request, res: Response) => {
  try {
    const symbols = (req.query.symbols as string) || '';
    if (!symbols) {
      return res.status(400).json({ error: '请提供股票代码' });
    }

    const symbolList = symbols.split(',').filter(Boolean);
    const quotes = await fetchStockQuote(symbolList);
    // 同步保存行情快照
    saveQuoteHistory(quotes).catch(() => {});
    res.json(quotes);
  } catch (error) {
    console.error('Fetch quote error:', error);
    res.status(500).json({ error: '获取行情数据失败' });
  }
});

// 搜索股票
router.get('/search', authMiddleware, async (req: Request, res: Response) => {
  try {
    const keyword = (req.query.keyword as string) || '';
    if (!keyword) {
      return res.json([]);
    }

    const results = await searchStocks(keyword);
    res.json(results);
  } catch (error) {
    console.error('Search stocks error:', error);
    res.status(500).json({ error: '搜索股票失败' });
  }
});

// 获取K线数据 - 支持 cache 和 realtime 模式
router.get('/kline', authMiddleware, async (req: Request, res: Response) => {
  try {
    const symbol = req.query.symbol as string;
    const period = (req.query.period as string) || 'day';
    const mode = (req.query.mode as string) || 'cache'; // cache | realtime

    if (!symbol) {
      return res.status(400).json({ error: '请提供股票代码' });
    }

    if (mode === 'realtime') {
      // 实时模式：直接从API获取并更新缓存
      const data = await fetchAndCacheKline(symbol, period);
      return res.json({ data, source: 'realtime' });
    }

    // 缓存模式：先检查缓存
    const valid = await isCacheValid(symbol, period);
    if (valid) {
      const cached = await getCachedKline(symbol, period);
      return res.json({ data: cached, source: 'cache' });
    }

    // 缓存过期，从API获取并更新
    const data = await fetchAndCacheKline(symbol, period);
    res.json({ data, source: 'realtime' });
  } catch (error) {
    console.error('Fetch kline error:', error);
    res.status(500).json({ error: '获取K线数据失败' });
  }
});

// 获取基金重仓股
router.get('/fund/holdings', authMiddleware, async (req: Request, res: Response) => {
  try {
    const symbol = req.query.symbol as string;
    const refresh = req.query.refresh === 'true';
    if (!symbol) {
      return res.status(400).json({ error: '请提供基金代码' });
    }
    // 支持强制刷新缓存
    if (refresh) {
      const { prisma } = await import('../index');
      await prisma.fundHoldingCache.deleteMany({ where: { fundSymbol: symbol } });
    }
    const holdings = await fetchFundHoldings(symbol);
    res.json(holdings);
  } catch (error) {
    console.error('Fetch fund holdings error:', error);
    res.status(500).json({ error: '获取基金持仓数据失败' });
  }
});

// 获取基金估算收益
router.get('/fund/estimate', authMiddleware, async (req: Request, res: Response) => {
  try {
    const symbol = req.query.symbol as string;
    const name = (req.query.name as string) || '';
    if (!symbol) {
      return res.status(400).json({ error: '请提供基金代码' });
    }
    const estimate = await estimateFundReturn(symbol, name);
    res.json(estimate);
  } catch (error) {
    console.error('Estimate fund return error:', error);
    res.status(500).json({ error: '计算基金估算收益失败' });
  }
});

// 获取行情历史
router.get('/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const symbol = req.query.symbol as string;
    const days = parseInt(req.query.days as string) || 30;
    if (!symbol) {
      return res.status(400).json({ error: '请提供股票代码' });
    }
    const history = await getQuoteHistory(symbol, days);
    res.json(history);
  } catch (error) {
    console.error('Get quote history error:', error);
    res.status(500).json({ error: '获取行情历史失败' });
  }
});

// 获取大盘指数
router.get('/indices', authMiddleware, async (_req: Request, res: Response) => {
  try {
    const indices = await fetchStockQuote(['sh000001', 'sz399001', 'sz399006']);
    res.json(indices);
  } catch (error) {
    console.error('Fetch indices error:', error);
    res.status(500).json({ error: '获取大盘指数失败' });
  }
});

// 获取基金估算收益历史
router.get('/fund/history', authMiddleware, async (req: Request, res: Response) => {
  try {
    const symbol = req.query.symbol as string;
    const days = parseInt(req.query.days as string) || 30;

    if (!symbol) {
      return res.status(400).json({ error: '请提供基金代码' });
    }

    const history = await getFundEstimateHistory(symbol, days);
    res.json(history);
  } catch (error) {
    console.error('Get fund estimate history error:', error);
    res.status(500).json({ error: '获取基金估算历史失败' });
  }
});

// 获取全市场A股行情
router.get('/market', authMiddleware, async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 50;
    const sortField = (req.query.sortField as string) || 'changePercent';
    const sortOrder = (req.query.sortOrder as string) || 'desc';
    const market = (req.query.market as string) || '';
    const search = (req.query.search as string) || '';

    const result = await fetchMarketStocks({
      page,
      pageSize,
      sortField,
      sortOrder,
      market,
      search,
    });

    res.json(result);
  } catch (error) {
    console.error('Get market stocks error:', error);
    res.status(500).json({ error: '获取市场行情失败' });
  }
});

export default router;
