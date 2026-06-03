import { Router, Response } from 'express';
import { prisma } from '../index';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// 获取用户的所有标签
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const tags = await prisma.tag.findMany({
      where: { userId: req.userId },
      orderBy: { id: 'asc' },
      include: {
        _count: {
          select: {
            watchlistTags: true,
            investmentTags: true,
          },
        },
      },
    });

    const result = tags.map((t) => ({
      id: t.id,
      name: t.name,
      color: t.color,
      createdAt: t.createdAt,
      watchlistCount: t._count.watchlistTags,
      investmentCount: t._count.investmentTags,
    }));

    res.json(result);
  } catch (error) {
    console.error('Get tags error:', error);
    res.status(500).json({ error: '获取标签失败' });
  }
});

// 创建标签
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, color } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: '标签名称不能为空' });
    }

    const existing = await prisma.tag.findUnique({
      where: {
        userId_name: { userId: req.userId!, name: name.trim() },
      },
    });

    if (existing) {
      return res.status(400).json({ error: '标签已存在' });
    }

    const tag = await prisma.tag.create({
      data: {
        userId: req.userId!,
        name: name.trim(),
        color: color || '#1677ff',
      },
    });

    res.json(tag);
  } catch (error) {
    console.error('Create tag error:', error);
    res.status(500).json({ error: '创建标签失败' });
  }
});

// 更新标签
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;

    const tag = await prisma.tag.findFirst({
      where: { id: parseInt(id), userId: req.userId },
    });

    if (!tag) {
      return res.status(404).json({ error: '标签不存在' });
    }

    if (name && name.trim() !== tag.name) {
      const duplicate = await prisma.tag.findUnique({
        where: {
          userId_name: { userId: req.userId!, name: name.trim() },
        },
      });
      if (duplicate) {
        return res.status(400).json({ error: '标签名称已存在' });
      }
    }

    const updated = await prisma.tag.update({
      where: { id: parseInt(id) },
      data: {
        ...(name && { name: name.trim() }),
        ...(color && { color }),
      },
    });

    res.json(updated);
  } catch (error) {
    console.error('Update tag error:', error);
    res.status(500).json({ error: '更新标签失败' });
  }
});

// 删除标签
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const tag = await prisma.tag.findFirst({
      where: { id: parseInt(id), userId: req.userId },
    });

    if (!tag) {
      return res.status(404).json({ error: '标签不存在' });
    }

    await prisma.tag.delete({ where: { id: parseInt(id) } });

    res.json({ message: '已删除' });
  } catch (error) {
    console.error('Delete tag error:', error);
    res.status(500).json({ error: '删除标签失败' });
  }
});

// 给自选股/基金打标签
router.post('/watchlist', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { watchlistId, tagId } = req.body;

    if (!watchlistId || !tagId) {
      return res.status(400).json({ error: '参数不完整' });
    }

    // 验证权限
    const watchlist = await prisma.watchlist.findFirst({
      where: { id: watchlistId, userId: req.userId },
    });
    if (!watchlist) {
      return res.status(404).json({ error: '自选记录不存在' });
    }

    const tag = await prisma.tag.findFirst({
      where: { id: tagId, userId: req.userId },
    });
    if (!tag) {
      return res.status(404).json({ error: '标签不存在' });
    }

    const existing = await prisma.watchlistTag.findUnique({
      where: { watchlistId_tagId: { watchlistId, tagId } },
    });

    if (existing) {
      return res.status(400).json({ error: '已添加该标签' });
    }

    await prisma.watchlistTag.create({
      data: { watchlistId, tagId },
    });

    res.json({ message: '标签已添加' });
  } catch (error) {
    console.error('Add watchlist tag error:', error);
    res.status(500).json({ error: '添加标签失败' });
  }
});

// 移除自选股/基金标签
router.delete('/watchlist', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { watchlistId, tagId } = req.body;

    await prisma.watchlistTag.deleteMany({
      where: {
        watchlistId,
        tagId,
        watchlist: { userId: req.userId },
      },
    });

    res.json({ message: '标签已移除' });
  } catch (error) {
    console.error('Remove watchlist tag error:', error);
    res.status(500).json({ error: '移除标签失败' });
  }
});

// 给投资记录打标签
router.post('/investment', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { investmentId, tagId } = req.body;

    if (!investmentId || !tagId) {
      return res.status(400).json({ error: '参数不完整' });
    }

    const investment = await prisma.investment.findFirst({
      where: { id: investmentId, userId: req.userId },
    });
    if (!investment) {
      return res.status(404).json({ error: '投资记录不存在' });
    }

    const tag = await prisma.tag.findFirst({
      where: { id: tagId, userId: req.userId },
    });
    if (!tag) {
      return res.status(404).json({ error: '标签不存在' });
    }

    const existing = await prisma.investmentTag.findUnique({
      where: { investmentId_tagId: { investmentId, tagId } },
    });

    if (existing) {
      return res.status(400).json({ error: '已添加该标签' });
    }

    await prisma.investmentTag.create({
      data: { investmentId, tagId },
    });

    res.json({ message: '标签已添加' });
  } catch (error) {
    console.error('Add investment tag error:', error);
    res.status(500).json({ error: '添加标签失败' });
  }
});

// 移除投资记录标签
router.delete('/investment', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { investmentId, tagId } = req.body;

    await prisma.investmentTag.deleteMany({
      where: {
        investmentId,
        tagId,
        investment: { userId: req.userId },
      },
    });

    res.json({ message: '标签已移除' });
  } catch (error) {
    console.error('Remove investment tag error:', error);
    res.status(500).json({ error: '移除标签失败' });
  }
});

export default router;
