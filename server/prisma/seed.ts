import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminPassword = await bcrypt.hash('admin123', 10);
  const userPassword = await bcrypt.hash('user123', 10);

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: adminPassword,
      nickname: '管理员',
      role: 'ADMIN',
    },
  });

  await prisma.user.upsert({
    where: { username: 'demo' },
    update: {},
    create: {
      username: 'demo',
      password: userPassword,
      nickname: '演示用户',
      role: 'USER',
      watchlist: {
        create: [
          { symbol: 'sh600519', name: '贵州茅台', type: 'stock' },
          { symbol: 'sz000858', name: '五粮液', type: 'stock' },
          { symbol: 'sh601318', name: '中国平安', type: 'stock' },
        ],
      },
    },
  });

  console.log('Seed data created successfully');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
