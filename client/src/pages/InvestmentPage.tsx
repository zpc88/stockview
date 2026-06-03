import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Typography,
  Button,
  Input,
  InputNumber,
  message,
  Card,
  Modal,
  Table,
  Space,
  Tag,
  Statistic,
  Row,
  Col,
  Select,
  Popconfirm,
  Segmented,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  DollarOutlined,
  LineChartOutlined,
  TableOutlined,
  ReloadOutlined,
  PieChartOutlined,
  TagsOutlined,
} from '@ant-design/icons';
import { investmentApi, InvestmentRecord, InvestmentSnapshot, watchlistApi, stockApi, tagApi } from '../services/api';
import { WatchlistItem, SearchResult, TagWithCount } from '../types';
import * as echarts from 'echarts';
import { sanitizeInput, stripTags } from '../utils/sanitize';

const { Title, Text } = Typography;

type ViewMode = 'table' | 'chart';

export default function InvestmentPage() {
  const [investments, setInvestments] = useState<InvestmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<InvestmentRecord | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);

  // 视图模式
  const [viewMode, setViewMode] = useState<ViewMode>('table');

  // 历史数据
  const [historyData, setHistoryData] = useState<InvestmentSnapshot[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDays, setHistoryDays] = useState<number>(30);
  const lineChartRef = useRef<HTMLDivElement>(null);
  const lineChartInstance = useRef<echarts.ECharts | null>(null);
  const pieChartRef = useRef<HTMLDivElement>(null);
  const pieChartInstance = useRef<echarts.ECharts | null>(null);

  // 添加表单状态
  const [addType, setAddType] = useState<'stock' | 'fund' | 'us_stock' | 'hk_stock'>('stock');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<SearchResult | null>(null);
  const [addAmount, setAddAmount] = useState<number>(0);
  const [adding, setAdding] = useState(false);

  // 自选股列表
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);

  // 标签
  const [allTags, setAllTags] = useState<TagWithCount[]>([]);
  const [tagModalRecord, setTagModalRecord] = useState<InvestmentRecord | null>(null);

  const loadInvestments = useCallback(async () => {
    try {
      const data = await investmentApi.getAll();
      setInvestments(data);
      // 自动保存快照
      await investmentApi.createSnapshot().catch(() => {});
    } catch {
      message.error('获取投资记录失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadWatchlist = useCallback(async () => {
    try {
      const data = await watchlistApi.getAll();
      setWatchlist(data);
    } catch {
      console.error('Failed to load watchlist');
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

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const data = await investmentApi.getHistory({ days: historyDays });
      setHistoryData(data);
    } catch {
      message.error('获取历史数据失败');
    } finally {
      setHistoryLoading(false);
    }
  }, [historyDays]);

  useEffect(() => {
    loadInvestments();
    loadWatchlist();
    loadTags();
  }, [loadInvestments, loadWatchlist, loadTags]);

  useEffect(() => {
    if (viewMode === 'chart') {
      loadHistory();
    }
  }, [viewMode, loadHistory]);

  // 汇总统计
  const summary = useMemo(() => {
    const totalAmount = investments.reduce((sum, i) => sum + i.amount, 0);
    const totalCurrentValue = investments.reduce((sum, i) => sum + i.currentValue, 0);
    const totalProfit = totalCurrentValue - totalAmount;
    const totalProfitPercent = totalAmount > 0 ? (totalProfit / totalAmount) * 100 : 0;

    return {
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalCurrentValue: Math.round(totalCurrentValue * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      totalProfitPercent: Math.round(totalProfitPercent * 100) / 100,
    };
  }, [investments]);

  // 绘制当日盈亏饼图
  useEffect(() => {
    if (!pieChartRef.current || investments.length === 0) return;

    const timer = setTimeout(() => {
      if (!pieChartRef.current) return;

      if (pieChartInstance.current) {
        pieChartInstance.current.dispose();
      }

      const chart = echarts.init(pieChartRef.current);
      pieChartInstance.current = chart;

      const profitData = investments.map((inv) => ({
        name: inv.name,
        value: Math.abs(inv.profit),
        profit: inv.profit,
        profitPercent: inv.profitPercent,
        isUp: inv.profit >= 0,
      }));

      // 分离盈利和亏损
      const profitItems = profitData.filter((d) => d.isUp);
      const lossItems = profitData.filter((d) => !d.isUp);

      const option: echarts.EChartsOption = {
        tooltip: {
          trigger: 'item',
          formatter: (params: any) => {
            const data = params.data;
            const color = data.isUp ? '#cf1322' : '#3f8600';
            return `<div style="font-weight:bold">${data.name}</div>
                    <div style="color:${color}">盈亏: ${data.profit >= 0 ? '+' : ''}¥${data.profit.toLocaleString()}</div>
                    <div style="color:${color}">收益率: ${data.profitPercent >= 0 ? '+' : ''}${data.profitPercent}%</div>`;
          },
        },
        legend: {
          orient: 'vertical',
          right: 10,
          top: 'center',
          type: 'scroll',
        },
        series: [
          {
            name: '盈亏分布',
            type: 'pie',
            radius: ['40%', '70%'],
            center: ['40%', '50%'],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 6,
              borderColor: '#fff',
              borderWidth: 2,
            },
            label: {
              show: false,
            },
            emphasis: {
              label: {
                show: true,
                fontSize: 14,
                fontWeight: 'bold',
              },
            },
            labelLine: {
              show: false,
            },
            data: [
              ...profitItems.map((item) => ({
                ...item,
                itemStyle: { color: '#cf1322' },
              })),
              ...lossItems.map((item) => ({
                ...item,
                itemStyle: { color: '#3f8600' },
              })),
            ],
          },
        ],
      };

      chart.setOption(option);

      const handleResize = () => chart.resize();
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [investments]);

  // 绘制历史折线图
  useEffect(() => {
    if (viewMode !== 'chart' || !lineChartRef.current || historyData.length === 0) return;

    const timer = setTimeout(() => {
      if (!lineChartRef.current) return;

      if (lineChartInstance.current) {
        lineChartInstance.current.dispose();
      }

      const chart = echarts.init(lineChartRef.current);
      lineChartInstance.current = chart;

      const sortedData = [...historyData].reverse();
      const dates = sortedData.map((d) => d.date);
      const totalValues = sortedData.map((d) => d.totalValue);
      const totalAmounts = sortedData.map((d) => d.totalAmount);
      const profits = sortedData.map((d) => d.profit);

      const option: echarts.EChartsOption = {
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            const data = params[0];
            const snapshot = sortedData[data.dataIndex];
            const details = JSON.parse(snapshot.details || '[]');
            let html = `<div style="font-weight:bold;margin-bottom:8px">${snapshot.date}</div>`;
            html += `<div>总投入: ¥${snapshot.totalAmount.toLocaleString()}</div>`;
            html += `<div>总市值: ¥${snapshot.totalValue.toLocaleString()}</div>`;
            html += `<div style="color:${snapshot.profit >= 0 ? '#cf1322' : '#3f8600'}">盈亏: ${snapshot.profit >= 0 ? '+' : ''}¥${snapshot.profit.toLocaleString()} (${snapshot.profitPercent >= 0 ? '+' : ''}${snapshot.profitPercent}%)</div>`;
            if (details.length > 0) {
              html += '<div style="margin-top:8px;border-top:1px solid #eee;padding-top:8px">';
              details.forEach((d: any) => {
                html += `<div>${d.name}: ¥${d.currentValue.toLocaleString()}</div>`;
              });
              html += '</div>';
            }
            return html;
          },
        },
        legend: {
          data: ['总市值', '总投入', '盈亏'],
          top: 0,
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          top: '40px',
          containLabel: true,
        },
        xAxis: {
          type: 'category',
          data: dates,
          axisLabel: {
            rotate: 45,
            fontSize: 10,
          },
        },
        yAxis: [
          {
            type: 'value',
            name: '金额 (¥)',
            axisLabel: {
              formatter: (val: number) => {
                if (val >= 10000) return (val / 10000).toFixed(1) + '万';
                return val.toString();
              },
            },
          },
        ],
        series: [
          {
            name: '总市值',
            type: 'line',
            data: totalValues,
            smooth: true,
            lineStyle: { width: 3 },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(22,119,255,0.3)' },
                { offset: 1, color: 'rgba(22,119,255,0.05)' },
              ]),
            },
            itemStyle: { color: '#1677ff' },
          },
          {
            name: '总投入',
            type: 'line',
            data: totalAmounts,
            lineStyle: { width: 2, type: 'dashed' },
            itemStyle: { color: '#999' },
          },
          {
            name: '盈亏',
            type: 'bar',
            data: profits,
            itemStyle: {
              color: (params: any) => {
                return params.value >= 0 ? '#cf1322' : '#3f8600';
              },
            },
            yAxisIndex: 0,
          },
        ],
      };

      chart.setOption(option);

      const handleResize = () => chart.resize();
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [historyData, viewMode]);

  useEffect(() => {
    return () => {
      lineChartInstance.current?.dispose();
      lineChartInstance.current = null;
      pieChartInstance.current?.dispose();
      pieChartInstance.current = null;
    };
  }, []);

  const handleSearch = async (keyword: string) => {
    if (!keyword.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await stockApi.search(keyword);
      setSearchResults(Array.isArray(results) ? results.filter((r) => r.type === addType) : []);
    } catch {
      message.error('搜索失败');
    } finally {
      setSearching(false);
    }
  };

  const handleSelectFromWatchlist = (item: WatchlistItem) => {
    setSelectedItem({ symbol: item.symbol, name: item.name, type: item.type });
    setSearchKeyword(item.name);
    setSearchResults([]);
  };

  const handleAdd = async () => {
    if (!selectedItem) {
      message.error('请选择股票或基金');
      return;
    }
    if (!addAmount || addAmount <= 0) {
      message.error('请输入有效金额');
      return;
    }

    setAdding(true);
    try {
      await investmentApi.add({
        symbol: selectedItem.symbol,
        name: selectedItem.name,
        type: selectedItem.type,
        amount: addAmount,
      });
      message.success('添加成功');
      setShowAddModal(false);
      resetAddForm();
      loadInvestments();
    } catch (error: any) {
      message.error(error.response?.data?.error || '添加失败');
    } finally {
      setAdding(false);
    }
  };

  const resetAddForm = () => {
    setSearchKeyword('');
    setSearchResults([]);
    setSelectedItem(null);
    setAddAmount(0);
  };

  const handleEdit = (record: InvestmentRecord) => {
    setEditingRecord(record);
    setEditAmount(record.amount);
    setShowEditModal(true);
  };

  const handleUpdate = async () => {
    if (!editingRecord || !editAmount || editAmount <= 0) {
      message.error('请输入有效金额');
      return;
    }

    try {
      await investmentApi.update(editingRecord.id, editAmount);
      message.success('更新成功');
      setShowEditModal(false);
      setEditingRecord(null);
      loadInvestments();
    } catch (error: any) {
      message.error(error.response?.data?.error || '更新失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await investmentApi.delete(id);
      message.success('已删除');
      loadInvestments();
    } catch {
      message.error('删除失败');
    }
  };

  const isUp = summary.totalProfit >= 0;
  const profitColor = isUp ? '#cf1322' : '#3f8600';

  const filteredWatchlist = watchlist.filter((w) => {
    if (addType === 'stock') return w.type === 'stock';
    if (addType === 'fund') return w.type === 'fund';
    if (addType === 'us_stock') return w.type === 'us_stock';
    if (addType === 'hk_stock') return w.type === 'hk_stock';
    return false;
  });

  // 标签操作
  const handleAddInvestmentTag = async (tagId: number) => {
    if (!tagModalRecord) return;
    try {
      await tagApi.addToInvestment(tagModalRecord.id, tagId);
      message.success('标签已添加');
      await loadInvestments();
      setTagModalRecord(null);
    } catch (error: any) {
      message.error(error.response?.data?.error || '添加标签失败');
    }
  };

  const handleRemoveInvestmentTag = async (investmentId: number, tagId: number) => {
    try {
      await tagApi.removeFromInvestment(investmentId, tagId);
      message.success('标签已移除');
      await loadInvestments();
    } catch {
      message.error('移除标签失败');
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      render: (name: string, record: InvestmentRecord) => (
        <div>
          <Text strong>{name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {record.symbol.startsWith('us_') ? record.symbol.substring(3).toUpperCase() : record.symbol.startsWith('hk_') ? record.symbol.substring(3) : record.symbol.toUpperCase()}
            {' · '}
            {record.type === 'stock' ? 'A股' : record.type === 'fund' ? '基金' : record.type === 'us_stock' ? '美股' : record.type === 'hk_stock' ? '港股' : record.type}
          </Text>
        </div>
      ),
    },
    {
      title: '标签',
      dataIndex: 'tags',
      width: 180,
      render: (tags: InvestmentRecord['tags'], record: InvestmentRecord) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
          {tags && tags.map((t) => (
            <Tag
              key={t.id}
              color={t.color}
              closable
              onClose={(e) => {
                e.stopPropagation();
                handleRemoveInvestmentTag(record.id, t.id);
              }}
              style={{ fontSize: 11, lineHeight: '18px', margin: 0 }}
            >
              {t.name}
            </Tag>
          ))}
          <Button
            type="text"
            size="small"
            icon={<TagsOutlined />}
            onClick={() => setTagModalRecord(record)}
            style={{ padding: '0 4px' }}
          />
        </div>
      ),
    },
    {
      title: '投入金额',
      dataIndex: 'amount',
      width: 120,
      render: (amount: number) => <Text>¥{amount.toLocaleString()}</Text>,
    },
    {
      title: '当前涨跌',
      dataIndex: 'changePercent',
      width: 100,
      render: (changePercent: number) => {
        const color = changePercent >= 0 ? '#cf1322' : '#3f8600';
        return (
          <Text style={{ color }}>
            {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
          </Text>
        );
      },
    },
    {
      title: '当前价值',
      dataIndex: 'currentValue',
      width: 120,
      render: (currentValue: number) => <Text strong>¥{currentValue.toLocaleString()}</Text>,
    },
    {
      title: '盈亏',
      dataIndex: 'profit',
      width: 140,
      sorter: (a: InvestmentRecord, b: InvestmentRecord) => a.profit - b.profit,
      render: (profit: number, record: InvestmentRecord) => {
        const color = profit >= 0 ? '#cf1322' : '#3f8600';
        return (
          <Space>
            {profit >= 0 ? <ArrowUpOutlined style={{ color }} /> : <ArrowDownOutlined style={{ color }} />}
            <div>
              <Text style={{ color, fontWeight: 'bold' }}>
                {profit >= 0 ? '+' : ''}¥{profit.toLocaleString()}
              </Text>
              <br />
              <Text style={{ color, fontSize: 12 }}>
                {record.profitPercent >= 0 ? '+' : ''}{record.profitPercent}%
              </Text>
            </div>
          </Space>
        );
      },
    },
    {
      title: '操作',
      width: 120,
      render: (_: any, record: InvestmentRecord) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="确定删除此记录?"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 历史记录表格列
  const historyColumns = [
    { title: '日期', dataIndex: 'date', width: 120 },
    {
      title: '总投入',
      dataIndex: 'totalAmount',
      width: 120,
      render: (val: number) => `¥${val.toLocaleString()}`,
    },
    {
      title: '总市值',
      dataIndex: 'totalValue',
      width: 120,
      render: (val: number) => `¥${val.toLocaleString()}`,
    },
    {
      title: '盈亏',
      dataIndex: 'profit',
      width: 120,
      render: (val: number) => {
        const color = val >= 0 ? '#cf1322' : '#3f8600';
        return <Text style={{ color }}>{val >= 0 ? '+' : ''}¥{val.toLocaleString()}</Text>;
      },
    },
    {
      title: '收益率',
      dataIndex: 'profitPercent',
      width: 100,
      render: (val: number) => {
        const color = val >= 0 ? '#cf1322' : '#3f8600';
        return <Text style={{ color }}>{val >= 0 ? '+' : ''}{val}%</Text>;
      },
    },
  ];

  return (
    <div>
      {/* 汇总卡片 */}
      <Card style={{ marginBottom: 16, background: isUp ? '#fff1f0' : '#f6ffed' }}>
        <Row gutter={24} align="middle">
          <Col span={6}>
            <Statistic
              title="投入总额"
              value={summary.totalAmount}
              precision={2}
              prefix="¥"
              valueStyle={{ fontSize: 24 }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="当前价值"
              value={summary.totalCurrentValue}
              precision={2}
              prefix="¥"
              valueStyle={{ fontSize: 24 }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="总盈亏"
              value={summary.totalProfit}
              precision={2}
              prefix={isUp ? '+' : ''}
              suffix="¥"
              valueStyle={{ color: profitColor, fontSize: 24, fontWeight: 'bold' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="收益率"
              value={summary.totalProfitPercent}
              precision={2}
              prefix={isUp ? '+' : ''}
              suffix="%"
              valueStyle={{ color: profitColor, fontSize: 24, fontWeight: 'bold' }}
            />
          </Col>
        </Row>
      </Card>

      {/* 标题和操作栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Space>
          <Title level={4} style={{ margin: 0 }}>
            <DollarOutlined /> 投资组合
          </Title>
          <Segmented
            value={viewMode}
            onChange={(val) => setViewMode(val as ViewMode)}
            options={[
              {
                value: 'table',
                icon: <TableOutlined />,
                label: '列表',
              },
              {
                value: 'chart',
                icon: <LineChartOutlined />,
                label: '历史走势',
              },
            ]}
          />
        </Space>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={loadInvestments}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setShowAddModal(true)}>
            添加投资
          </Button>
        </Space>
      </div>

      {/* 列表视图 */}
      {viewMode === 'table' && (
        <Row gutter={16}>
          {/* 左侧：盈亏饼图 */}
          <Col span={8}>
            <Card title={<><PieChartOutlined /> 当日盈亏分布</>} size="small">
              {investments.length === 0 ? (
                <div style={{ height: 300, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#999' }}>
                  暂无投资数据
                </div>
              ) : (
                <div ref={pieChartRef} style={{ width: '100%', height: 300 }} />
              )}
            </Card>
          </Col>
          {/* 右侧：投资列表 */}
          <Col span={16}>
            <Table
              columns={columns}
              dataSource={investments}
              rowKey="id"
              loading={loading}
              pagination={false}
              locale={{ emptyText: '暂无投资记录，点击上方按钮添加' }}
              size="small"
            />
          </Col>
        </Row>
      )}

      {/* 图表视图 */}
      {viewMode === 'chart' && (
        <Card>
          {/* 时间选择 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Space>
              <Select
                value={historyDays}
                onChange={(val) => setHistoryDays(val)}
                options={[
                  { label: '最近7天', value: 7 },
                  { label: '最近30天', value: 30 },
                  { label: '最近90天', value: 90 },
                  { label: '最近180天', value: 180 },
                  { label: '最近365天', value: 365 },
                ]}
                style={{ width: 120 }}
              />
            </Space>
            <Button icon={<ReloadOutlined />} onClick={loadHistory} loading={historyLoading}>
              刷新
            </Button>
          </div>

          {/* 图表 */}
          {historyLoading ? (
            <div style={{ height: 400, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Spin tip="加载历史数据..." />
            </div>
          ) : historyData.length === 0 ? (
            <div style={{ height: 400, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#999' }}>
              <div style={{ textAlign: 'center' }}>
                <LineChartOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                <div>暂无历史数据</div>
                <div style={{ fontSize: 12, marginTop: 8 }}>系统会在每次查看时自动记录</div>
              </div>
            </div>
          ) : (
            <div ref={lineChartRef} style={{ width: '100%', height: 400 }} />
          )}

          {/* 历史记录表格 */}
          {historyData.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <Title level={5}>历史记录</Title>
              <Table
                size="small"
                pagination={{ pageSize: 10 }}
                dataSource={[...historyData].reverse()}
                rowKey="id"
                columns={historyColumns}
              />
            </div>
          )}
        </Card>
      )}

      {/* 添加投资弹窗 */}
      <Modal
        title="添加投资记录"
        open={showAddModal}
        onCancel={() => {
          setShowAddModal(false);
          resetAddForm();
        }}
        onOk={handleAdd}
        confirmLoading={adding}
        okText="添加"
        cancelText="取消"
        width={600}
      >
        <div style={{ marginBottom: 16 }}>
          <Text strong>类型：</Text>
          <Select
            value={addType}
            onChange={(val) => {
              setAddType(val);
              setSearchKeyword('');
              setSearchResults([]);
              setSelectedItem(null);
            }}
            options={[
              { label: 'A股', value: 'stock' },
              { label: '基金', value: 'fund' },
              { label: '美股', value: 'us_stock' },
              { label: '港股', value: 'hk_stock' },
            ]}
            style={{ marginLeft: 8, width: 100 }}
          />
        </div>

        {/* 快捷选择 */}
        {filteredWatchlist.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Text type="secondary">从自选{addType === 'stock' ? 'A股' : addType === 'fund' ? '基金' : addType === 'us_stock' ? '美股' : '港股'}中选择：</Text>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
              {filteredWatchlist.map((item) => (
                <Tag
                  key={item.symbol}
                  style={{ cursor: 'pointer' }}
                  color={selectedItem?.symbol === item.symbol ? 'blue' : 'default'}
                  onClick={() => handleSelectFromWatchlist(item)}
                >
                  {item.name}
                </Tag>
              ))}
            </div>
          </div>
        )}

        {/* 搜索 */}
        <div style={{ marginBottom: 16 }}>
          <Text strong>搜索{addType === 'stock' ? 'A股' : addType === 'fund' ? '基金' : addType === 'us_stock' ? '美股' : '港股'}：</Text>
          <Space.Compact style={{ width: '100%', marginTop: 8 }}>
            <Input
              placeholder={`输入${addType === 'stock' ? 'A股' : addType === 'fund' ? '基金' : addType === 'us_stock' ? '美股' : '港股'}代码/名称`}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(stripTags(e.target.value))}
              onPressEnter={() => handleSearch(searchKeyword)}
              maxLength={30}
            />
            <Button loading={searching} onClick={() => handleSearch(searchKeyword)}>
              搜索
            </Button>
          </Space.Compact>
          {searchResults.length > 0 && (
            <div style={{ marginTop: 8, border: '1px solid #d9d9d9', borderRadius: 6, maxHeight: 200, overflow: 'auto' }}>
              {searchResults.map((item) => (
                <div
                  key={item.symbol}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    background: selectedItem?.symbol === item.symbol ? '#e6f4ff' : 'transparent',
                    borderBottom: '1px solid #f0f0f0',
                  }}
                  onClick={() => {
                    setSelectedItem(item);
                    setSearchKeyword(item.name);
                    setSearchResults([]);
                  }}
                >
                  <Text>{item.name}</Text>
                  <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{item.symbol.toUpperCase()}</Text>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 已选择 */}
        {selectedItem && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f' }}>
            <Text>已选择：{selectedItem.name} ({selectedItem.symbol.toUpperCase()})</Text>
          </div>
        )}

        {/* 金额输入 */}
        <div>
          <Text strong>投入金额 (¥)：</Text>
          <InputNumber
            value={addAmount}
            onChange={(val) => setAddAmount(val || 0)}
            min={0.01}
            max={999999999}
            precision={2}
            placeholder="请输入金额"
            style={{ width: '100%', marginTop: 8 }}
            addonBefore="¥"
          />
        </div>
      </Modal>

      {/* 编辑金额弹窗 */}
      <Modal
        title={`修改金额 - ${editingRecord?.name}`}
        open={showEditModal}
        onCancel={() => {
          setShowEditModal(false);
          setEditingRecord(null);
        }}
        onOk={handleUpdate}
        okText="更新"
        cancelText="取消"
      >
        <div>
          <Text>当前投入金额：¥{editingRecord?.amount.toLocaleString()}</Text>
          <div style={{ marginTop: 16 }}>
            <Text strong>新金额 (¥)：</Text>
            <InputNumber
              value={editAmount}
              onChange={(val) => setEditAmount(val || 0)}
              min={0.01}
              max={999999999}
              precision={2}
              style={{ width: '100%', marginTop: 8 }}
              addonBefore="¥"
            />
          </div>
        </div>
      </Modal>

      {/* 标签管理弹窗 */}
      <Modal
        title={`管理标签 - ${tagModalRecord?.name}`}
        open={!!tagModalRecord}
        onCancel={() => setTagModalRecord(null)}
        footer={null}
        width={400}
      >
        {tagModalRecord && (
          <div>
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary">当前标签：</Text>
              <div style={{ marginTop: 8 }}>
                {tagModalRecord.tags && tagModalRecord.tags.length > 0 ? (
                  tagModalRecord.tags.map((t) => (
                    <Tag
                      key={t.id}
                      color={t.color}
                      closable
                      onClose={() => handleRemoveInvestmentTag(tagModalRecord.id, t.id)}
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
                  .filter((t) => !tagModalRecord.tags?.some((et) => et.id === t.id))
                  .map((t) => (
                    <Tag
                      key={t.id}
                      color={t.color}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handleAddInvestmentTag(t.id)}
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
