export interface User {
  id: number;
  username: string;
  nickname: string;
  role: 'ADMIN' | 'USER';
  createdAt?: string;
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
  close: number;
  volume: number;
  amount: number;
  date: string;
  time: string;
}

export interface TagInfo {
  id: number;
  name: string;
  color: string;
}

export interface WatchlistItem {
  id: number;
  userId: number;
  symbol: string;
  name: string;
  type: 'stock' | 'fund' | 'us_stock' | 'hk_stock';
  tags?: TagInfo[];
}

export interface SearchResult {
  symbol: string;
  name: string;
  type: 'stock' | 'fund' | 'us_stock' | 'hk_stock' | string;
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

export interface FundHolding {
  stockCode: string;
  stockName: string;
  symbol: string;
  ratio: number;
  shares: number;
  marketValue: number;
}

export interface StockContribution {
  symbol: string;
  name: string;
  ratio: number;
  stockChange: number;
  contribution: number;
}

export interface FundEstimate {
  fundSymbol: string;
  fundName: string;
  estimateChange: number;
  holdings: FundHolding[];
  stockContributions: StockContribution[];
  updateTime: string;
}

export interface FundEstimateHistory {
  id: number;
  fundSymbol: string;
  fundName: string;
  date: string;
  estimateChange: number;
  holdingsCount: number;
  stockContributions: string;
  createdAt: string;
}

export interface TagWithCount {
  id: number;
  name: string;
  color: string;
  createdAt: string;
  watchlistCount: number;
  investmentCount: number;
}

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
