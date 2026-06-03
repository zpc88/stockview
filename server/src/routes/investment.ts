import { Router, Response } from 'express';
import { prisma } from '../index';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { fetchStockQuote, estimateFundReturn } from '../services/stockApi';

const router = Router();

// 获取用户的所有投资记录（含实时涨跌计算）
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const investments = await prisma.investment.findMany({
      where: { userId: req.userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        tags: {
          include: { tag: true },
        },
      },
    });

    if (investments.length === 0) {
      return res.json([]);
    }

    // 自动同步投资记录到自选列表
    for (const inv of investments) {
      const watchlistExisting = await prisma.watchlist.findUnique({
        where: {
          userId_symbol: { userId: req.userId!, symbol: inv.symbol },
        },
      });

      if (!watchlistExisting) {
        await prisma.watchlist.create({
          data: {
            userId: req.userId!,
            symbol: inv.symbol,
            name: inv.name,
            type: inv.type,
          },
        });
      }
    }

    // 分离股票和基金投资
    const stockInvestments = investments.filter((i) => i.type === 'stock');
    const fundInvestments = investments.filter((i) => i.type === 'fund');

    // 获取股票实时行情
    const stockSymbols = stockInvestments.map((i) => i.symbol);
    const quotes = stockSymbols.length > 0 ? await fetchStockQuote(stockSymbols) : [];
    const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

    // 获取基金估算收益（并行请求）
    const fundEstimateMap = new Map<string, number>();
    if (fundInvestments.length > 0) {
      const fundResults = await Promise.allSettled(
        fundInvestments.map((inv) => estimateFundReturn(inv.symbol, inv.name))
      );
      fundResults.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          fundEstimateMap.set(fundInvestments[i].symbol, r.value.estimateChange);
        }
      });
    }

    // 计算涨跌后的值
    const result = investments.map((inv) => {
      const isFund = inv.type === 'fund';
      const changePercent = isFund
        ? (fundEstimateMap.get(inv.symbol) ?? 0)
        : (quoteMap.get(inv.symbol)?.changePercent ?? 0);
      const currentValue = inv.amount * (1 + changePercent / 100);
      const profit = currentValue - inv.amount;

      return {
        id: inv.id,
        symbol: inv.symbol,
        name: inv.name,
        type: inv.type,
        amount: inv.amount,
        currentPrice: isFund ? 0 : (quoteMap.get(inv.symbol)?.currentPrice ?? 0),
        changePercent: Math.round(changePercent * 100) / 100,
        currentValue: Math.round(currentValue * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        profitPercent: inv.amount > 0 ? Math.round((profit / inv.amount) * 10000) / 100 : 0,
        tags: inv.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
        updatedAt: inv.updatedAt,
      };
    });

    res.json(result);
  } catch (error) {
    console.error('Get investments error:', error);
    res.status(500).json({ error: '获取投资记录失败' });
  }
});

// 添加投资记录
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { symbol, name, type, amount } = req.body;

    if (!symbol || !name || !type || !amount) {
      return res.status(400).json({ error: '请填写所有字段' });
    }

    if (amount <= 0) {
      return res.status(400).json({ error: '金额必须大于0' });
    }

    // 检查是否已存在该股票/基金的投资记录
    const existing = await prisma.investment.findFirst({
      where: { userId: req.userId, symbol },
    });

    let investment;
    if (existing) {
      // 已存在则累加金额
      investment = await prisma.investment.update({
        where: { id: existing.id },
        data: { amount: existing.amount + amount },
      });
    } else {
      investment = await prisma.investment.create({
        data: {
          userId: req.userId!,
          symbol,
          name,
          type,
          amount,
        },
      });
    }

    // 同步到自选列表（如果不存在则添加）
    const watchlistExisting = await prisma.watchlist.findUnique({
      where: {
        userId_symbol: { userId: req.userId!, symbol },
      },
    });

    if (!watchlistExisting) {
      await prisma.watchlist.create({
        data: {
          userId: req.userId!,
          symbol,
          name,
          type,
        },
      });
    }

    // 保存快照
    await saveSnapshot(req.userId!);

    res.json(investment);
  } catch (error) {
    console.error('Add investment error:', error);
    res.status(500).json({ error: '添加投资记录失败' });
  }
});

// 获取投资历史快照 - 必须在 /:id 之前
router.get('/history', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, days } = req.query;

    let where: any = { userId: req.userId };

    if (startDate && endDate) {
      where.date = {
        gte: startDate as string,
        lte: endDate as string,
      };
    } else {
      // 默认最近 N 天
      const d = parseInt(days as string) || 30;
      const dates = await prisma.investmentSnapshot.findMany({
        where: { userId: req.userId },
        orderBy: { date: 'desc' },
        take: d,
        select: { date: true },
      });
      if (dates.length > 0) {
        where.date = {
          gte: dates[dates.length - 1].date,
          lte: dates[0].date,
        };
      }
    }

    const snapshots = await prisma.investmentSnapshot.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    res.json(snapshots);
  } catch (error) {
    console.error('Get investment history error:', error);
    res.status(500).json({ error: '获取投资历史失败' });
  }
});

// 手动创建快照 - 必须在 /:id 之前
router.post('/snapshot', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const snapshot = await saveSnapshot(req.userId!);
    res.json(snapshot);
  } catch (error) {
    console.error('Create snapshot error:', error);
    res.status(500).json({ error: '创建快照失败' });
  }
});

// 更新投资金额 - /:id 路由在后面
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '金额必须大于0' });
    }

    const investment = await prisma.investment.findFirst({
      where: { id: parseInt(id), userId: req.userId },
    });

    if (!investment) {
      return res.status(404).json({ error: '投资记录不存在' });
    }

    const updated = await prisma.investment.update({
      where: { id: parseInt(id) },
      data: { amount },
    });

    // 保存快照
    await saveSnapshot(req.userId!);

    res.json(updated);
  } catch (error) {
    console.error('Update investment error:', error);
    res.status(500).json({ error: '更新投资记录失败' });
  }
});

// 删除投资记录
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const investment = await prisma.investment.findFirst({
      where: { id: parseInt(id), userId: req.userId },
    });

    if (!investment) {
      return res.status(404).json({ error: '投资记录不存在' });
    }

    await prisma.investment.delete({ where: { id: parseInt(id) } });

    // 保存快照
    await saveSnapshot(req.userId!);

    res.json({ message: '已删除' });
  } catch (error) {
    console.error('Delete investment error:', error);
    res.status(500).json({ error: '删除投资记录失败' });
  }
});

// 保存投资快照的辅助函数
async function saveSnapshot(userId: number) {
  const today = new Date().toISOString().slice(0, 10);

  // 获取所有投资
  const investments = await prisma.investment.findMany({
    where: { userId },
  });

  if (investments.length === 0) {
    return null;
  }

  // 分离股票和基金
  const stockInvestments = investments.filter((i) => i.type === 'stock');
  const fundInvestments = investments.filter((i) => i.type === 'fund');

  // 获取股票实时行情
  const stockSymbols = stockInvestments.map((i) => i.symbol);
  const quotes = stockSymbols.length > 0 ? await fetchStockQuote(stockSymbols) : [];
  const quoteMap = new Map(quotes.map((q) => [q.symbol, q]));

  // 获取基金估算收益
  const fundEstimateMap = new Map<string, number>();
  if (fundInvestments.length > 0) {
    const fundResults = await Promise.allSettled(
      fundInvestments.map((inv) => estimateFundReturn(inv.symbol, inv.name))
    );
    fundResults.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        fundEstimateMap.set(fundInvestments[i].symbol, r.value.estimateChange);
      }
    });
  }

  // 计算每项投资的当前价值
  let totalAmount = 0;
  let totalValue = 0;
  const details = investments.map((inv) => {
    const isFund = inv.type === 'fund';
    const changePercent = isFund
      ? (fundEstimateMap.get(inv.symbol) ?? 0)
      : (quoteMap.get(inv.symbol)?.changePercent ?? 0);
    const currentValue = inv.amount * (1 + changePercent / 100);

    totalAmount += inv.amount;
    totalValue += currentValue;

    return {
      symbol: inv.symbol,
      name: inv.name,
      type: inv.type,
      amount: inv.amount,
      currentValue: Math.round(currentValue * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
    };
  });

  const profit = totalValue - totalAmount;
  const profitPercent = totalAmount > 0 ? (profit / totalAmount) * 100 : 0;

  // 保存或更新快照
  const snapshot = await prisma.investmentSnapshot.upsert({
    where: {
      userId_date: { userId, date: today },
    },
    update: {
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalValue: Math.round(totalValue * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      profitPercent: Math.round(profitPercent * 100) / 100,
      details: JSON.stringify(details),
    },
    create: {
      userId,
      date: today,
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalValue: Math.round(totalValue * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      profitPercent: Math.round(profitPercent * 100) / 100,
      details: JSON.stringify(details),
    },
  });

  return snapshot;
}

export default router;
