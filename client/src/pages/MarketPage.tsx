import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Typography, Input, Table, Space, Select, Button, message, Tag, Modal,
} from 'antd';
import {
  SearchOutlined, ReloadOutlined, BarChartOutlined, PlusOutlined, LineChartOutlined,
} from '@ant-design/icons';
import { stockApi, watchlistApi } from '../services/api';
import { MarketStock } from '../types';
import KlineChart from '../components/KlineChart';
import { stripTags } from '../utils/sanitize';

const { Title, Text } = Typography;

const marketOptions = [
  { label: '全部', value: '' },
  { label: '沪市主板', value: 'sh' },
  { label: '深市主板', value: 'sz' },
  { label: '创业板', value: 'cyb' },
  { label: '科创板', value: 'kcb' },
];

const sortOptions = [
  { label: '涨跌幅', value: 'changePercent' },
  { label: '成交量', value: 'volume' },
  { label: '成交额', value: 'amount' },
  { label: '总市值', value: 'totalMarketCap' },
  { label: '换手率', value: 'turnoverRate' },
  { label: '市盈率', value: 'pe' },
];

function formatAmount(val: number): string {
  if (val >= 100000000) return (val / 100000000).toFixed(2) + '亿';
  if (val >= 10000) return (val / 10000).toFixed(1) + '万';
  return val.toLocaleString();
}

function formatMarketCap(val: number): string {
  if (val >= 1000000000000) return (val / 1000000000000).toFixed(1) + '万亿';
  if (val >= 100000000) return (val / 100000000).toFixed(1) + '亿';
  if (val >= 10000) return (val / 10000).toFixed(0) + '万';
  return val.toLocaleString();
}

export default function MarketPage() {
  const [stocks, setStocks] = useState<MarketStock[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [searchText, setSearchText] = useState('');
  const [market, setMarket] = useState('');
  const [sortField, setSortField] = useState('changePercent');
  const [sortOrder, setSortOrder] = useState('desc');
  const [chartSymbol, setChartSymbol] = useState<string | null>(null);
  const [chartName, setChartName] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await stockApi.getMarketStocks({
        page,
        pageSize,
        sortField,
        sortOrder,
        market,
        search: searchText,
      });
      setStocks(result.list);
      setTotal(result.total);
    } catch {
      message.error('获取市场行情失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sortField, sortOrder, market, searchText]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 自动刷新（每30秒）
  useEffect(() => {
    const timer = setInterval(loadData, 30000);
    return () => clearInterval(timer);
  }, [loadData]);

  const handleSearch = (value: string) => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setSearchText(value);
      setPage(1);
    }, 300);
  };

  const handleAddWatchlist = async (record: MarketStock) => {
    try {
      await watchlistApi.add(record.symbol, record.name, 'stock');
      message.success(`已添加 ${record.name} 到自选`);
    } catch (error: any) {
      if (error.response?.data?.error?.includes('已在自选')) {
        message.info(`${record.name} 已在自选列表中`);
      } else {
        message.error('添加失败');
      }
    }
  };

  const handleTableChange = (pagination: any, _filters: any, sorter: any) => {
    setPage(pagination.current);
    setPageSize(pagination.pageSize);
    if (sorter.field) {
      setSortField(sorter.field);
      setSortOrder(sorter.order === 'ascend' ? 'asc' : 'desc');
    }
  };

  const getMarketLabel = (code: string) => {
    if (code.startsWith('688')) return '科创';
    if (code.startsWith('300') || code.startsWith('301')) return '创业';
    if (code.startsWith('6')) return '沪市';
    return '深市';
  };

  const getMarketColor = (code: string) => {
    if (code.startsWith('688')) return '#722ed1';
    if (code.startsWith('300') || code.startsWith('301')) return '#fa8c16';
    if (code.startsWith('6')) return '#1677ff';
    return '#52c41a';
  };

  const columns = [
    {
      title: '代码',
      dataIndex: 'code',
      width: 90,
      fixed: 'left' as const,
      render: (code: string) => (
        <Text copyable={{ text: code }} style={{ fontFamily: 'monospace' }}>
          {code}
        </Text>
      ),
    },
    {
      title: '名称',
      dataIndex: 'name',
      width: 130,
      fixed: 'left' as const,
      render: (name: string, record: MarketStock) => (
        <Space>
          <Tag color={getMarketColor(record.code)} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', margin: 0 }}>
            {getMarketLabel(record.code)}
          </Tag>
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: '最新价',
      dataIndex: 'currentPrice',
      width: 90,
      sorter: true,
      render: (val: number, record: MarketStock) => {
        const color = record.changePercent >= 0 ? '#cf1322' : '#3f8600';
        return <Text style={{ color, fontWeight: 'bold' }}>{val.toFixed(2)}</Text>;
      },
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      width: 100,
      sorter: true,
      defaultSortOrder: 'descend' as const,
      render: (val: number) => {
        const color = val >= 0 ? '#cf1322' : '#3f8600';
        return (
          <Text style={{ color, fontWeight: 'bold' }}>
            {val >= 0 ? '+' : ''}{val.toFixed(2)}%
          </Text>
        );
      },
    },
    {
      title: '涨跌额',
      dataIndex: 'change',
      width: 90,
      render: (val: number) => {
        const color = val >= 0 ? '#cf1322' : '#3f8600';
        return <Text style={{ color }}>{val >= 0 ? '+' : ''}{val.toFixed(2)}</Text>;
      },
    },
    {
      title: '成交量',
      dataIndex: 'volume',
      width: 100,
      sorter: true,
      render: (val: number) => <Text>{formatAmount(val)}</Text>,
    },
    {
      title: '成交额',
      dataIndex: 'amount',
      width: 100,
      sorter: true,
      render: (val: number) => <Text>{formatAmount(val)}</Text>,
    },
    {
      title: '振幅',
      dataIndex: 'amplitude',
      width: 80,
      sorter: true,
      render: (val: number) => <Text>{val.toFixed(2)}%</Text>,
    },
    {
      title: '换手率',
      dataIndex: 'turnoverRate',
      width: 80,
      sorter: true,
      render: (val: number) => <Text>{val.toFixed(2)}%</Text>,
    },
    {
      title: '市盈率',
      dataIndex: 'pe',
      width: 80,
      sorter: true,
      render: (val: number) => <Text>{val > 0 ? val.toFixed(1) : '-'}</Text>,
    },
    {
      title: '总市值',
      dataIndex: 'totalMarketCap',
      width: 100,
      sorter: true,
      render: (val: number) => <Text>{formatMarketCap(val)}</Text>,
    },
    {
      title: '操作',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, record: MarketStock) => (
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<PlusOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              handleAddWatchlist(record);
            }}
          >
            自选
          </Button>
          <Button
            type="text"
            size="small"
            icon={<LineChartOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              setChartSymbol(record.symbol);
              setChartName(record.name);
            }}
          />
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>
          <BarChartOutlined /> 全市场行情
        </Title>
        <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>
          刷新
        </Button>
      </div>

      {/* 筛选栏 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <Input
          placeholder="搜索股票代码/名称"
          prefix={<SearchOutlined />}
          onChange={(e) => handleSearch(stripTags(e.target.value))}
          allowClear
          style={{ width: 240 }}
          maxLength={30}
        />
        <Select
          value={market}
          onChange={(val) => { setMarket(val); setPage(1); }}
          options={marketOptions}
          style={{ width: 120 }}
        />
        <Select
          value={sortField}
          onChange={(val) => { setSortField(val); setPage(1); }}
          options={sortOptions}
          style={{ width: 120 }}
        />
        <Select
          value={sortOrder}
          onChange={(val) => { setSortOrder(val); setPage(1); }}
          options={[
            { label: '降序', value: 'desc' },
            { label: '升序', value: 'asc' },
          ]}
          style={{ width: 90 }}
        />
      </div>

      {/* 表格 */}
      <Table
        columns={columns}
        dataSource={stocks}
        rowKey="symbol"
        loading={loading}
        onChange={handleTableChange}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['20', '50', '100', '200'],
          showTotal: (t) => `共 ${t} 只`,
        }}
        scroll={{ x: 1300 }}
        size="small"
        onRow={(record) => ({
          style: { cursor: 'pointer' },
          onClick: () => {
            setChartSymbol(record.symbol);
            setChartName(record.name);
          },
        })}
      />

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
    </div>
  );
}
