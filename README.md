# StockView - 实时行情看板

A股实时行情看板，支持股票/基金自选、K线图、投资组合管理、基金重仓股归因分析等功能。

## 功能特性

- **实时行情** — 通过 WebSocket 每 5 秒推送沪深指数及自选股最新报价
- **自选股管理** — 搜索添加股票/基金到自选，支持标签分类
- **K线图表** — 基于 ECharts 的日/周/月 K线图，支持多种技术指标
- **基金重仓归因** — 展示基金前十大重仓股，按持仓比例估算当日收益贡献
- **投资组合** — 记录投入金额，每日自动快照，追踪持仓市值与盈亏
- **全市场行情** — 浏览全部A股实时数据
- **用户系统** — JWT 认证，角色权限（管理员/普通用户），管理员可管理所有用户
- **标签系统** — 自定义标签对自选股和投资记录进行分类管理

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 18 + TypeScript + Vite + Ant Design + ECharts |
| 状态管理 | Zustand |
| 后端 | Express + TypeScript + Socket.IO |
| 数据库 | SQLite (Prisma ORM) |
| 认证 | JWT (access token 15min + refresh token 7d) |
| 安全 | Helmet / express-rate-limit / 输入过滤 |

## 项目结构

```
stockview/
├── client/                    # 前端
│   ├── src/
│   │   ├── components/        # 通用组件 (StockCard, KlineChart, FundDetail...)
│   │   ├── pages/             # 页面 (Dashboard, StockPage, FundPage, InvestmentPage...)
│   │   ├── services/          # API 客户端 & Socket.IO
│   │   ├── stores/            # Zustand 状态管理
│   │   └── utils/             # 工具函数
│   ├── vite.config.ts
│   └── package.json
├── server/                    # 后端
│   ├── src/
│   │   ├── routes/            # API 路由 (auth, stock, watchlist, investment, tag, user)
│   │   ├── services/          # 业务逻辑 (stockApi, websocket)
│   │   ├── middleware/        # 中间件 (auth, rateLimit, sanitize)
│   │   └── index.ts           # 入口
│   ├── prisma/
│   │   ├── schema.prisma      # 数据库模型定义
│   │   └── seed.ts            # 种子数据
│   ├── .env                   # 环境变量
│   └── package.json
└── package.json               # 根配置 (monorepo)
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装

```bash
git clone <repo-url>
cd stockview

# 安装所有依赖（根、server、client）
npm install
```

### 配置

编辑 `server/.env`：

```env
DATABASE_URL="file:./stockview.db"
JWT_SECRET="your-jwt-secret"
JWT_REFRESH_SECRET="your-refresh-secret"
PORT=3001
```

### 初始化数据库

```bash
cd server
npx prisma generate      # 生成 Prisma Client
npx prisma db push       # 创建数据库表
npx tsx prisma/seed.ts   # 可选：导入种子数据
```

种子数据包含：
- 管理员账号：`admin` / `admin123`
- 演示账号：`demo` / `user123`（预置贵州茅台、五粮液、平安银行三只自选股）

### 启动开发服务器

```bash
# 回到项目根目录
cd ..

# 同时启动前后端
npm run dev
```

- 前端：http://localhost:5173
- 后端：http://localhost:3001
- 前端自动代理 `/api` 请求到后端

## 生产部署

### 构建

```bash
# 构建前端
cd client && npm run build   # 输出到 client/dist/

# 编译后端
cd ../server && npm run build # 输出到 server/dist/
```

### 运行

```bash
cd server
node dist/index.js
```

### Nginx 反向代理（推荐）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        root /path/to/stockview/client/dist;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /socket.io/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### PM2 进程守护

```bash
npm install -g pm2
cd server
pm2 start dist/index.js --name stockview
pm2 save
pm2 startup
```

## 可用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 同时启动前后端开发服务器 |
| `npm run dev:server` | 仅启动后端 (tsx watch 热重载) |
| `npm run dev:client` | 仅启动前端 (Vite dev server) |
| `npm run build` | 构建前端生产包 |

| 命令 (server/) | 说明 |
|---|---|
| `npm run build` | TypeScript 编译 |
| `npm start` | 运行编译后的后端 |
| `npm run db:push` | 同步数据库 schema |
| `npm run db:generate` | 生成 Prisma Client |
| `npm run db:seed` | 导入种子数据 |
| `npm run db:studio` | 打开 Prisma Studio 数据库管理界面 |

## 数据源

行情数据来自以下公开 API：

- **新浪财经** — 实时行情报价
- **东方财富** — 股票/基金搜索、K线数据、基金重仓股、全市场行情

## 数据库模型

| 模型 | 说明 |
|---|---|
| User | 用户账号（角色：ADMIN / USER） |
| Watchlist | 自选股/基金 |
| KlineCache | K线数据缓存 |
| QuoteHistory | 每日行情快照 |
| FundHoldingCache | 基金重仓股缓存 |
| Investment | 投资记录 |
| InvestmentSnapshot | 投资组合每日快照 |
| FundEstimateHistory | 基金估算收益历史 |
| Tag / WatchlistTag / InvestmentTag | 标签系统 |

## License

Private
