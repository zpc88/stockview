import axios from 'axios';
import { User, StockQuote, WatchlistItem, SearchResult, KlineItem, FundHolding, FundEstimate, FundEstimateHistory, TagInfo, TagWithCount, MarketStock } from '../types';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
});

// 请求拦截器 - 自动添加token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器 - 处理401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken && !error.config._retry) {
        error.config._retry = true;
        try {
          const res = await axios.post('/api/auth/refresh', { refreshToken });
          const { accessToken, refreshToken: newRefresh } = res.data;
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', newRefresh);
          error.config.headers.Authorization = `Bearer ${accessToken}`;
          return api(error.config);
        } catch {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: async (username: string, password: string) => {
    const res = await api.post('/auth/login', { username, password });
    return res.data as { user: User; accessToken: string; refreshToken: string };
  },
  register: async (username: string, password: string, nickname: string) => {
    const res = await api.post('/auth/register', { username, password, nickname });
    return res.data as { user: User; accessToken: string; refreshToken: string };
  },
  me: async (token: string) => {
    const res = await axios.get('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    return res.data as User;
  },
  changePassword: async (oldPassword: string, newPassword: string) => {
    const res = await api.put('/auth/password', { oldPassword, newPassword });
    return res.data;
  },
  refresh: async (refreshToken: string) => {
    const res = await axios.post('/api/auth/refresh', { refreshToken });
    return res.data as { accessToken: string; refreshToken: string };
  },
};

// Stock API
export const stockApi = {
  getQuote: async (symbols: string[]) => {
    const res = await api.get('/stocks/quote', { params: { symbols: symbols.join(',') } });
    return res.data as StockQuote[];
  },
  search: async (keyword: string) => {
    const res = await api.get('/stocks/search', { params: { keyword } });
    return res.data as SearchResult[];
  },
  getKline: async (symbol: string, period: string = 'day', mode: string = 'cache') => {
    const res = await api.get('/stocks/kline', { params: { symbol, period, mode } });
    return res.data as { data: KlineItem[]; source: 'cache' | 'realtime' };
  },
  getIndices: async () => {
    const res = await api.get('/stocks/indices');
    return res.data as StockQuote[];
  },
  getMarketStocks: async (params: {
    page?: number;
    pageSize?: number;
    sortField?: string;
    sortOrder?: string;
    market?: string;
    search?: string;
  }) => {
    const res = await api.get('/stocks/market', { params });
    return res.data as {
      list: MarketStock[];
      total: number;
      page: number;
      pageSize: number;
    };
  },
  getFundHoldings: async (symbol: string) => {
    const res = await api.get('/stocks/fund/holdings', { params: { symbol } });
    return res.data as FundHolding[];
  },
  getFundEstimate: async (symbol: string, name: string) => {
    const res = await api.get('/stocks/fund/estimate', { params: { symbol, name } });
    return res.data as FundEstimate;
  },
  getFundEstimateHistory: async (symbol: string, days?: number) => {
    const res = await api.get('/stocks/fund/history', { params: { symbol, days } });
    return res.data as FundEstimateHistory[];
  },
};

// Watchlist API
export const watchlistApi = {
  getAll: async () => {
    const res = await api.get('/watchlist');
    return res.data as WatchlistItem[];
  },
  add: async (symbol: string, name: string, type: string) => {
    const res = await api.post('/watchlist', { symbol, name, type });
    return res.data as WatchlistItem;
  },
  remove: async (symbol: string) => {
    const res = await api.delete(`/watchlist/${symbol}`);
    return res.data;
  },
};

// User API (admin)
export const userApi = {
  getAll: async () => {
    const res = await api.get('/users');
    return res.data as User[];
  },
  create: async (data: { username: string; password: string; nickname: string; role: string }) => {
    const res = await api.post('/users', data);
    return res.data as User;
  },
  updateRole: async (id: number, role: string) => {
    const res = await api.put(`/users/${id}/role`, { role });
    return res.data as User;
  },
  update: async (id: number, data: { username?: string; nickname?: string }) => {
    const res = await api.put(`/users/${id}`, data);
    return res.data as User;
  },
  resetPassword: async (id: number, newPassword: string) => {
    const res = await api.put(`/users/${id}/password`, { newPassword });
    return res.data;
  },
  delete: async (id: number) => {
    const res = await api.delete(`/users/${id}`);
    return res.data;
  },
};

// Investment API
export interface InvestmentRecord {
  id: number;
  symbol: string;
  name: string;
  type: 'stock' | 'fund' | 'us_stock' | 'hk_stock';
  amount: number;
  currentPrice: number;
  changePercent: number;
  currentValue: number;
  profit: number;
  profitPercent: number;
  tags?: TagInfo[];
  updatedAt: string;
}

export interface InvestmentSnapshot {
  id: number;
  userId: number;
  date: string;
  totalAmount: number;
  totalValue: number;
  profit: number;
  profitPercent: number;
  details: string;
}

export const investmentApi = {
  getAll: async () => {
    const res = await api.get('/investments');
    return res.data as InvestmentRecord[];
  },
  add: async (data: { symbol: string; name: string; type: 'stock' | 'fund' | 'us_stock' | 'hk_stock' | string; amount: number }) => {
    const res = await api.post('/investments', data);
    return res.data;
  },
  update: async (id: number, amount: number) => {
    const res = await api.put(`/investments/${id}`, { amount });
    return res.data;
  },
  delete: async (id: number) => {
    const res = await api.delete(`/investments/${id}`);
    return res.data;
  },
  getHistory: async (params?: { startDate?: string; endDate?: string; days?: number }) => {
    const res = await api.get('/investments/history', { params });
    return res.data as InvestmentSnapshot[];
  },
  createSnapshot: async () => {
    const res = await api.post('/investments/snapshot');
    return res.data;
  },
};

// Tag API
export const tagApi = {
  getAll: async () => {
    const res = await api.get('/tags');
    return res.data as TagWithCount[];
  },
  create: async (name: string, color?: string) => {
    const res = await api.post('/tags', { name, color });
    return res.data;
  },
  update: async (id: number, data: { name?: string; color?: string }) => {
    const res = await api.put(`/tags/${id}`, data);
    return res.data;
  },
  delete: async (id: number) => {
    const res = await api.delete(`/tags/${id}`);
    return res.data;
  },
  addToWatchlist: async (watchlistId: number, tagId: number) => {
    const res = await api.post('/tags/watchlist', { watchlistId, tagId });
    return res.data;
  },
  removeFromWatchlist: async (watchlistId: number, tagId: number) => {
    const res = await api.delete('/tags/watchlist', { data: { watchlistId, tagId } });
    return res.data;
  },
  addToInvestment: async (investmentId: number, tagId: number) => {
    const res = await api.post('/tags/investment', { investmentId, tagId });
    return res.data;
  },
  removeFromInvestment: async (investmentId: number, tagId: number) => {
    const res = await api.delete('/tags/investment', { data: { investmentId, tagId } });
    return res.data;
  },
};
