import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../index';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth';
import { isValidUsername, isValidNickname } from '../middleware/sanitize';

const router = Router();

// 获取所有用户 (仅管理员)
router.get('/', authMiddleware, adminMiddleware, async (_req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, nickname: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: '获取用户列表失败' });
  }
});

// 创建用户 (仅管理员)
router.post('/', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { username, password, nickname, role } = req.body;

    if (!username || !password || !nickname) {
      return res.status(400).json({ error: '请填写所有字段' });
    }

    if (!isValidUsername(username)) {
      return res.status(400).json({ error: '用户名需3-20个字符，只允许字母、数字、中文、下划线' });
    }

    if (password.length < 6 || password.length > 50) {
      return res.status(400).json({ error: '密码长度需6-50个字符' });
    }

    if (!isValidNickname(nickname)) {
      return res.status(400).json({ error: '昵称需1-20个字符，不允许特殊字符' });
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ error: '用户名已存在' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        nickname,
        role: ['ADMIN', 'USER'].includes(role) ? role : 'USER',
      },
      select: { id: true, username: true, nickname: true, role: true, createdAt: true },
    });

    res.json(user);
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: '创建用户失败' });
  }
});

// 更新用户角色 (仅管理员)
router.put('/:id/role', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { role } = req.body;

    if (!['ADMIN', 'USER'].includes(role)) {
      return res.status(400).json({ error: '无效的角色' });
    }

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { role },
      select: { id: true, username: true, nickname: true, role: true },
    });

    res.json(user);
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ error: '更新用户角色失败' });
  }
});

// 更新用户信息 (仅管理员: 可改用户名、昵称)
router.put('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { username, nickname } = req.body;

    if (!username && !nickname) {
      return res.status(400).json({ error: '请提供要修改的内容' });
    }

    const existing = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!existing) {
      return res.status(404).json({ error: '用户不存在' });
    }

    if (username) {
      if (!isValidUsername(username)) {
        return res.status(400).json({ error: '用户名需3-20个字符，只允许字母、数字、中文、下划线' });
      }
      const duplicate = await prisma.user.findFirst({
        where: { username, id: { not: parseInt(id) } },
      });
      if (duplicate) {
        return res.status(400).json({ error: '用户名已存在' });
      }
    }

    if (nickname && !isValidNickname(nickname)) {
      return res.status(400).json({ error: '昵称需1-20个字符，不允许特殊字符' });
    }

    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        ...(username && { username }),
        ...(nickname && { nickname }),
      },
      select: { id: true, username: true, nickname: true, role: true, createdAt: true },
    });

    res.json(user);
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: '更新用户信息失败' });
  }
});

// 管理员重置用户密码
router.put('/:id/password', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度至少6个字符' });
    }

    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: parseInt(id) },
      data: { password: hashedPassword },
    });

    res.json({ message: '密码已重置' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: '重置密码失败' });
  }
});

// 删除用户 (仅管理员)
router.delete('/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    await prisma.user.delete({ where: { id: parseInt(id) } });
    res.json({ message: '用户已删除' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: '删除用户失败' });
  }
});

export default router;
