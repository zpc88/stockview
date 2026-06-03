import { Server, Socket } from 'socket.io';
import { fetchStockQuote, saveQuoteHistory, StockQuote } from './stockApi';

const POLL_INTERVAL = 5000; // 5秒轮询一次

// 存储每个用户订阅的股票列表
const userSubscriptions = new Map<string, Set<string>>();

// 防止轮询重叠
let isPolling = false;

// 获取当前北京时间的分钟数
function getBeijingTimeMinutes(): number {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const bjHour = (utcHour + 8) % 24;
  return bjHour * 60 + utcMin;
}

// 判断当前是否在周末
function isWeekend(): boolean {
  // 使用北京时间判断周末
  const now = new Date();
  const utcHour = now.getUTCHours();
  const bjHour = (utcHour + 8) % 24;
  // 如果北京时间是周一凌晨但UTC还是周日，需要特殊处理
  const bjDay = now.getUTCDay();
  // 简化处理：UTC周日且北京时间已过8点 = 周一
  if (bjDay === 0 && bjHour >= 8) return false; // 周一凌晨
  if (bjDay === 6 && bjHour < 8) return false; // 还是周五
  return bjDay === 0 || bjDay === 6;
}

// 判断A股是否在交易时间
function isAShareMarketHours(): boolean {
  if (isWeekend()) return false;
  const bjTime = getBeijingTimeMinutes();
  // 9:15 - 15:05（留5分钟缓冲）
  return bjTime >= 9 * 60 + 15 && bjTime <= 15 * 60 + 5;
}

// 判断美股是否在交易时间（美东 9:30-16:00，北京时间 21:30-04:00 夏令时 / 22:30-05:00 冬令时）
// 简化处理：使用北京时间 21:30-05:00 覆盖夏令时和冬令时
function isUSMarketHours(): boolean {
  const now = new Date();
  const utcHour = now.getUTCHours();
  const bjHour = (utcHour + 8) % 24;
  const bjMin = now.getUTCMinutes();
  const bjTime = bjHour * 60 + bjMin;

  // 周末不交易（美股周末美东时间，对应北京时间周六凌晨-周一凌晨）
  const utcDay = now.getUTCDay();
  // 美股周五晚-周六凌晨交易，周六白天-周日晚不交易
  // 简化：北京时间周一凌晨5点前算周五夜盘，周日21点后算周一夜盘
  if (utcDay === 6) return false; // UTC周六 = 北京周六白天-周日凌晨，不交易
  if (utcDay === 0 && bjHour < 21) return false; // UTC周日白天 = 北京周日，不交易
  if (utcDay === 5 && bjHour >= 5) return false; // 北京周五白天，不交易（美股还没开）

  // 交易时间：北京时间 21:30 - 次日 05:00
  if (bjTime >= 21 * 60 + 30) return true; // 21:30 之后
  if (bjTime <= 5 * 60) return true; // 05:00 之前
  return false;
}

// 判断港股是否在交易时间（北京时间 9:30-16:00）
function isHKMarketHours(): boolean {
  if (isWeekend()) return false;
  const bjTime = getBeijingTimeMinutes();
  return bjTime >= 9 * 60 + 30 && bjTime <= 16 * 60;
}

// 判断是否有任何市场在交易时间
function hasActiveMarket(): boolean {
  return isAShareMarketHours() || isUSMarketHours() || isHKMarketHours();
}

// 按市场前缀分组符号
function groupSymbolsByMarket(symbols: string[]): { a: string[]; us: string[]; hk: string[] } {
  const result = { a: [] as string[], us: [] as string[], hk: [] as string[] };
  for (const s of symbols) {
    if (s.startsWith('us_')) result.us.push(s);
    else if (s.startsWith('hk_')) result.hk.push(s);
    else result.a.push(s);
  }
  return result;
}

export function setupWebSocket(io: Server) {
  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);
    userSubscriptions.set(socket.id, new Set());

    // 用户订阅股票行情
    socket.on('subscribe', async (data: { symbols: string[] }) => {
      const symbols = new Set(data.symbols);
      userSubscriptions.set(socket.id, symbols);
      console.log(`Client ${socket.id} subscribed to: ${data.symbols.join(',')}`);

      // 立即推送一次数据
      if (symbols.size > 0) {
        const quotes = await fetchStockQuote(Array.from(symbols));
        socket.emit('quotes', quotes);
      }
    });

    // 用户取消订阅
    socket.on('unsubscribe', () => {
      userSubscriptions.set(socket.id, new Set());
    });

    socket.on('disconnect', () => {
      userSubscriptions.delete(socket.id);
      console.log(`Client disconnected: ${socket.id}`);
    });
  });

  // 定时轮询并推送
  setInterval(async () => {
    // 没有任何市场在交易时间则跳过
    if (!hasActiveMarket()) return;

    // 防止轮询重叠
    if (isPolling) return;
    isPolling = true;

    // 收集所有需要查询的股票代码（去重）
    const allSymbols = new Set<string>();
    for (const symbols of userSubscriptions.values()) {
      for (const s of symbols) {
        allSymbols.add(s);
      }
    }

    if (allSymbols.size === 0) {
      isPolling = false;
      return;
    }

    // 按市场分组，只请求当前活跃市场的符号
    const grouped = groupSymbolsByMarket(Array.from(allSymbols));
    const activeSymbols: string[] = [];
    if (isAShareMarketHours()) activeSymbols.push(...grouped.a);
    if (isUSMarketHours()) activeSymbols.push(...grouped.us);
    if (isHKMarketHours()) activeSymbols.push(...grouped.hk);

    if (activeSymbols.length === 0) {
      isPolling = false;
      return;
    }

    try {
      const quotes = await fetchStockQuote(activeSymbols);

      // 保存行情快照（不阻塞推送）
      saveQuoteHistory(quotes).catch((err) => {
        console.error('Save quote history error:', err);
      });

      // 每个客户端只推送其订阅的股票数据
      for (const [socketId, symbols] of userSubscriptions.entries()) {
        const socket = io.sockets.sockets.get(socketId);
        if (socket && symbols.size > 0) {
          const filtered = quotes.filter((q) => symbols.has(q.symbol));
          if (filtered.length > 0) {
            socket.emit('quotes', filtered);
          }
        }
      }
    } catch (error) {
      console.error('WebSocket poll error:', error);
    } finally {
      isPolling = false;
    }
  }, POLL_INTERVAL);
}
