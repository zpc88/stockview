import { useState, useEffect, useCallback } from 'react';
import { Typography, Button, Input, Spin, message, Space, Card, Modal, List, Tag, Select } from 'antd';
import { PlusOutlined, StockOutlined, DollarOutlined, SearchOutlined, TagsOutlined } from '@ant-design/icons';
import { watchlistApi, stockApi, investmentApi, tagApi, InvestmentRecord } from '../services/api';
import { socketService } from '../services/socket';
import { WatchlistItem, StockQuote, SearchResult, TagInfo, TagWithCount } from '../types';
import StockCard from '../components/StockCard';
import KlineChart from '../components/KlineChart';
import { sanitizeInput, stripTags } from '../utils/sanitize';

const { Title, Text } = Typography;

export default function StockPage() {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [investments, setInvestments] = useState<InvestmentRecord[]>([]);
  const [quotes, setQuotes] = useState<Map<string, StockQuote>>(new Map());
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const [chartName, setChartName] = useState('');
  const [loading, setLoading] = useState(true);

  // 标签和搜索
  const [allTags, setAllTags] = useState<TagWithCount[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterTagId, setFilterTagId] = useState<number | null>(null);
  const [tagModalItem, setTagModalItem] = useState<WatchlistItem | null>(null);

  const loadWatchlist = useCallback(async () => {
    try {
      const data = await watchlistApi.getAll();
      const stockList = data.filter((d) => d.type === 'stock');
      setWatchlist(stockList);
      return data;
    } catch {
      message.error('加载自选股失败');
      return [];
    }
  }, []);

  const loadInvestments = useCallback(async () => {
    try {
      const data = await investmentApi.getAll();
      setInvestments(data.filter((d) => d.type === 'stock'));
    } catch {
      console.error('Failed to load investments');
    }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      const data = await tagApi.getAll();
      setAllTags(data);
    } catch {
      console.error('Failed to load tags');
    }
  }, []);

  // 获取股票的投资信息
  const getInvestmentInfo = (symbol: string) => {
    return investments.find((i) => i.symbol === symbol);
  };

  // 初始化
  useEffect(() => {
    const init = async () => {
      // 并行加载所有数据
      const [data] = await Promise.all([
        loadWatchlist(),
        loadInvestments(),
        loadTags(),
      ]);
      setLoading(false);

      const stockSymbols = data.filter((d) => d.type === 'stock').map((d) => d.symbol);
      if (stockSymbols.length > 0) {
        // 先注册监听，再订阅，确保不丢失初始推送
        socketService.onQuotes('stockPage', (newQuotes) => {
          setQuotes((prev) => {
            const next = new Map(prev);
            newQuotes.forEach((q) => next.set(q.symbol, q));
            return next;
          });
        });

        socketService.connect();
        socketService.subscribe(stockSymbols);
        // WebSocket subscribe 服务端会立即推送一次数据，无需额外 REST 请求
      }
    };

    init();

    return () => {
      socketService.offQuotes('stockPage');
      socketService.disconnect();
    };
  }, [loadWatchlist, loadInvestments, loadTags]);

  const handleSearch = async (keyword: string) => {
    if (!keyword.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await stockApi.search(keyword);
      setSearchResults(Array.isArray(results) ? results.filter((r) => r.type === 'stock') : []);
    } catch {
      message.error('搜索失败');
    } finally {
      setSearching(false);
    }
  };

  const handleAddStock = async (item: SearchResult) => {
    try {
      await watchlistApi.add(item.symbol, item.name, 'stock');
      message.success(`已添加 ${item.name}`);
      const data = await loadWatchlist();

      const stockSymbols = data.filter((d) => d.type === 'stock').map((d) => d.symbol);
      if (stockSymbols.length > 0) {
        socketService.connect();
        socketService.subscribe(stockSymbols);
      }

      setShowSearchModal(false);
      setSearchKeyword('');
      setSearchResults([]);
    } catch (error: any) {
      message.error(error.response?.data?.error || '添加失败');
    }
  };

  const handleRemoveStock = async (symbol: string) => {
    try {
      await watchlistApi.remove(symbol);
      message.success('已移除');
      await loadWatchlist();
    } catch {
      message.error('删除失败');
    }
  };

  const handleOpenChart = (symbol: string, name: string) => {
    setChartSymbol(symbol);
    setChartName(name);
  };

  // 标签操作
  const handleAddTag = async (tagId: number) => {
    if (!tagModalItem) return;
    try {
      await tagApi.addToWatchlist(tagModalItem.id, tagId);
      message.success('标签已添加');
      await loadWatchlist();
      setTagModalItem(null);
    } catch (error: any) {
      message.error(error.response?.data?.error || '添加标签失败');
    }
  };

  const handleRemoveTag = async (watchlistId: number, tagId: number) => {
    try {
      await tagApi.removeFromWatchlist(watchlistId, tagId);
      message.success('标签已移除');
      await loadWatchlist();
    } catch {
      message.error('移除标签失败');
    }
  };

  // 过滤列表
  const filteredWatchlist = watchlist.filter((item) => {
    const matchName = !searchText || item.name.includes(searchText) || item.symbol.toLowerCase().includes(searchText.toLowerCase());
    const matchTag = filterTagId === null || (item.tags && item.tags.some((t) => t.id === filterTagId));
    return matchName && matchTag;
  });

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>
            <StockOutlined /> 自选股票 ({watchlist.length})
          </Title>
          {investments.length > 0 && (
            <Tag color="blue" icon={<DollarOutlined />}>
              已投资 {investments.length} 只
            </Tag>
          )}
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowSearchModal(true)}>
          添加股票
        </Button>
      </div>

      {/* 搜索和筛选 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Input
          placeholder="搜索名称或代码"
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(stripTags(e.target.value))}
          allowClear
          style={{ width: 240 }}
          maxLength={30}
        />
        <Select
          placeholder="按标签筛选"
          value={filterTagId}
          onChange={(val) => setFilterTagId(val)}
          allowClear
          style={{ width: 160 }}
          options={allTags.map((t) => ({
            label: <Tag color={t.color}>{t.name}</Tag>,
            value: t.id,
          }))}
        />
      </div>

      {filteredWatchlist.length === 0 ? (
        <Card style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📈</div>
          <Title level={5} type="secondary">暂无自选股票</Title>
          <Text type="secondary">点击上方"添加股票"按钮搜索添加</Text>
        </Card>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 16,
          }}
        >
          {filteredWatchlist.map((item) => {
            const quote = quotes.get(item.symbol);
            const investmentInfo = getInvestmentInfo(item.symbol);
            return (
              <StockCard
                key={item.symbol}
                item={item}
                quote={quote}
                investmentAmount={investmentInfo?.amount}
                investmentProfit={investmentInfo?.profit}
                investmentProfitPercent={investmentInfo?.profitPercent}
                onRemove={() => handleRemoveStock(item.symbol)}
                onChart={() => handleOpenChart(item.symbol, item.name)}
                onTagManage={() => setTagModalItem(item)}
                onRemoveTag={(tagId) => handleRemoveTag(item.id, tagId)}
              />
            );
          })}
        </div>
      )}

      {/* 搜索弹窗 */}
      <Modal
        title="搜索添加股票"
        open={showSearchModal}
        onCancel={() => {
          setShowSearchModal(false);
          setSearchResults([]);
          setSearchKeyword('');
        }}
        footer={null}
        width={520}
      >
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input
            placeholder="输入股票代码/名称，如: 贵州茅台、600519"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(stripTags(e.target.value))}
            onPressEnter={() => handleSearch(searchKeyword)}
            size="large"
            maxLength={30}
          />
          <Button type="primary" size="large" loading={searching} onClick={() => handleSearch(searchKeyword)}>
            搜索
          </Button>
        </Space.Compact>
        <List
          bordered
          loading={searching}
          dataSource={searchResults}
          locale={{ emptyText: searchKeyword ? '未找到匹配结果' : '请输入关键词搜索' }}
          style={{ maxHeight: 400, overflow: 'auto' }}
          renderItem={(item) => (
            <List.Item
              actions={[
                <Button
                  type="primary"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => handleAddStock(item)}
                >
                  添加
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={
                  <span>
                    {item.name}
                    <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                      {item.symbol.toUpperCase()}
                    </Text>
                  </span>
                }
              />
            </List.Item>
          )}
        />
      </Modal>

      {/* K线图弹窗 */}
      <Modal
        title={`${chartName} (${chartSymbol?.toUpperCase()})`}
        open={!!chartSymbol}
        onCancel={() => setChartSymbol(null)}
        footer={null}
        width={900}
        destroyOnClose
      >
        {chartSymbol && <KlineChart symbol={chartSymbol} />}
      </Modal>

      {/* 标签管理弹窗 */}
      <Modal
        title={`管理标签 - ${tagModalItem?.name}`}
        open={!!tagModalItem}
        onCancel={() => setTagModalItem(null)}
        footer={null}
        width={400}
      >
        {tagModalItem && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary">当前标签：</Text>
              <div style={{ marginTop: 8 }}>
                {tagModalItem.tags && tagModalItem.tags.length > 0 ? (
                  tagModalItem.tags.map((t) => (
                    <Tag
                      key={t.id}
                      color={t.color}
                      closable
                      onClose={() => handleRemoveTag(tagModalItem.id, t.id)}
                      style={{ marginBottom: 4 }}
                    >
                      {t.name}
                    </Tag>
                  ))
                ) : (
                  <Text type="secondary">暂无标签</Text>
                )}
              </div>
            </div>
            <div>
              <Text type="secondary">添加标签：</Text>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {allTags
                  .filter((t) => !tagModalItem.tags?.some((et) => et.id === t.id))
                  .map((t) => (
                    <Tag
                      key={t.id}
                      color={t.color}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleAddTag(t.id)}
                    >
                      + {t.name}
                    </Tag>
                  ))}
                {allTags.length === 0 && <Text type="secondary">暂无标签，请先在标签页面创建</Text>}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
