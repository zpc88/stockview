import { Router, Response } from 'express';
import { prisma } from '../index';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// 获取用户的自选股列表
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const watchlist = await prisma.watchlist.findMany({
      where: { userId: req.userId },
      orderBy: { id: 'asc' },
      include: {
        tags: {
          include: { tag: true },
        },
      },
    });

    const result = watchlist.map((item) => ({
      ...item,
      tags: item.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    }));

    res.json(result);
  } catch (error) {
    console.error('Get watchlist error:', error);
    res.status(500).json({ error: '获取自选股失败' });
  }
});

// 添加自选股
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { symbol, name, type } = req.body;

    if (!symbol || !name) {
      return res.status(400).json({ error: '请提供股票代码和名称' });
    }

    const existing = await prisma.watchlist.findUnique({
      where: { userId_symbol: { userId: req.userId!, symbol } },
    });

    if (existing) {
      return res.status(400).json({ error: '该股票已在自选列表中' });
    }

    const item = await prisma.watchlist.create({
      data: {
        userId: req.userId!,
        symbol,
        name,
        type: type || 'stock',
      },
    });

    res.json(item);
  } catch (error) {
    console.error('Add to watchlist error:', error);
    res.status(500).json({ error: '添加自选股失败' });
  }
});

// 删除自选股
router.delete('/:symbol', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const symbol = req.params.symbol as string;

    await prisma.watchlist.deleteMany({
      where: { userId: req.userId!, symbol },
    });

    res.json({ message: '已从自选列表移除' });
  } catch (error) {
    console.error('Remove from watchlist error:', error);
    res.status(500).json({ error: '删除自选股失败' });
  }
});

export default router;
