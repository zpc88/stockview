import { useState, useEffect, useRef } from 'react';
import { Spin, Table, Typography, Space, message, Statistic, Row, Col, Card, Modal, Button, Segmented, Select, Tag } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined, ReloadOutlined, LineChartOutlined, HistoryOutlined } from '@ant-design/icons';
import { stockApi } from '../services/api';
import { FundEstimate, StockContribution, FundEstimateHistory } from '../types';
import KlineChart from './KlineChart';
import * as echarts from 'echarts';

const { Text, Title } = Typography;

interface Props {
  symbol: string;
  name: string;
}

type TabKey = 'detail' | 'history';

export default function FundDetail({ symbol, name }: Props) {
  const [data, setData] = useState<FundEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [klineSymbol, setKlineSymbol] = useState<string | null>(null);
  const [klineName, setKlineName] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('detail');

  // 历史数据
  const [historyData, setHistoryData] = useState<FundEstimateHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyDays, setHistoryDays] = useState(30);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const result = await stockApi.getFundEstimate(symbol, name);
      setData(result);
    } catch {
      message.error('获取基金数据失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const result = await stockApi.getFundEstimateHistory(symbol, historyDays);
      setHistoryData(result);
    } catch {
      message.error('获取历史数据失败');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [symbol]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, historyDays]);

  // 绘制历史收益折线图
  useEffect(() => {
    if (activeTab !== 'history' || !chartRef.current || historyData.length === 0) return;

    const timer = setTimeout(() => {
      if (!chartRef.current) return;

      if (chartInstance.current) {
        chartInstance.current.dispose();
      }

      const chart = echarts.init(chartRef.current);
      chartInstance.current = chart;

      const sortedData = [...historyData].reverse();
      const dates = sortedData.map((d) => d.date);
      const changes = sortedData.map((d) => d.estimateChange);

      const option: echarts.EChartsOption = {
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            const data = params[0];
            const item = sortedData[data.dataIndex];
            const details = JSON.parse(item.stockContributions || '[]');
            let html = `<div style="font-weight:bold;margin-bottom:8px">${item.date}</div>`;
            html += `<div>估算涨跌: <span style="color:${item.estimateChange >= 0 ? '#cf1322' : '#3f8600'};font-weight:bold">${item.estimateChange >= 0 ? '+' : ''}${item.estimateChange}%</span></div>`;
            html += `<div>重仓股数量: ${item.holdingsCount}只</div>`;
            if (details.length > 0) {
              html += '<div style="margin-top:8px;border-top:1px solid #eee;padding-top:8px">';
              details.slice(0, 5).forEach((d: any) => {
                html += `<div>${d.name}: ${d.stockChange >= 0 ? '+' : ''}${d.stockChange}% (贡献${d.contribution >= 0 ? '+' : ''}${d.contribution}%)</div>`;
              });
              if (details.length > 5) html += `<div>...等${details.length}只</div>`;
              html += '</div>';
            }
            return html;
          },
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          top: '20px',
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
        yAxis: {
          type: 'value',
          name: '涨跌幅 (%)',
          axisLabel: {
            formatter: '{value}%',
          },
        },
        series: [
          {
            name: '估算涨跌',
            type: 'line',
            data: changes,
            smooth: true,
            lineStyle: { width: 3 },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(22,119,255,0.3)' },
                { offset: 1, color: 'rgba(22,119,255,0.05)' },
              ]),
            },
            itemStyle: {
              color: (params: any) => {
                return params.value >= 0 ? '#cf1322' : '#3f8600';
              },
            },
            markLine: {
              data: [{ yAxis: 0 }],
              lineStyle: { color: '#999', type: 'dashed' },
            },
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
  }, [historyData, activeTab]);

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <Spin tip="加载基金持仓数据..." />
      </div>
    );
  }

  if (!data || data.holdings.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
        未找到该基金的持仓数据
      </div>
    );
  }

  const isUp = data.estimateChange >= 0;
  const color = isUp ? '#cf1322' : '#3f8600';

  // 格式化符号显示（去掉 us_/hk_ 前缀，显示原始代码）
  const formatSymbolDisplay = (symbol: string) => {
    if (symbol.startsWith('us_')) return symbol.substring(3).toUpperCase();
    if (symbol.startsWith('hk_')) return symbol.substring(3);
    return symbol.toUpperCase();
  };

  // 判断是否为美股/港股持仓
  const isForeignStock = (symbol: string) => symbol.startsWith('us_') || symbol.startsWith('hk_');

  const columns = [
    {
      title: '股票名称',
      dataIndex: 'name',
      render: (name: string, record: StockContribution) => (
        <div>
          <Text strong>{name}</Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatSymbolDisplay(record.symbol)}
            {record.symbol.startsWith('us_') && <Tag color="blue" style={{ marginLeft: 4, fontSize: 10 }}>美股</Tag>}
            {record.symbol.startsWith('hk_') && <Tag color="volcano" style={{ marginLeft: 4, fontSize: 10 }}>港股</Tag>}
          </Text>
        </div>
      ),
    },
    {
      title: '持仓占比',
      dataIndex: 'ratio',
      width: 100,
      sorter: (a: StockContribution, b: StockContribution) => a.ratio - b.ratio,
      render: (ratio: number) => <Text>{ratio.toFixed(2)}%</Text>,
    },
    {
      title: '今日涨跌',
      dataIndex: 'stockChange',
      width: 120,
      sorter: (a: StockContribution, b: StockContribution) => a.stockChange - b.stockChange,
      render: (change: number) => {
        const c = change >= 0 ? '#cf1322' : '#3f8600';
        return (
          <Text style={{ color: c }}>
            {change >= 0 ? '+' : ''}{change.toFixed(2)}%
          </Text>
        );
      },
    },
    {
      title: '收益贡献',
      dataIndex: 'contribution',
      width: 120,
      defaultSortOrder: 'descend' as const,
      sorter: (a: StockContribution, b: StockContribution) => a.contribution - b.contribution,
      render: (val: number) => {
        const c = val >= 0 ? '#cf1322' : '#3f8600';
        return (
          <Space>
            {val >= 0 ? <ArrowUpOutlined style={{ color: c }} /> : <ArrowDownOutlined style={{ color: c }} />}
            <Text style={{ color: c, fontWeight: 'bold' }}>
              {val >= 0 ? '+' : ''}{val.toFixed(4)}%
            </Text>
          </Space>
        );
      },
    },
    {
      title: '操作',
      width: 100,
      render: (_: any, record: StockContribution) => (
        <Button
          type="link"
          size="small"
          icon={<LineChartOutlined />}
          onClick={() => {
            setKlineSymbol(record.symbol);
            setKlineName(record.name);
          }}
        >
          K线
        </Button>
      ),
    },
  ];

  // 历史记录表格列
  const historyColumns = [
    { title: '日期', dataIndex: 'date', width: 120 },
    {
      title: '估算涨跌',
      dataIndex: 'estimateChange',
      width: 120,
      render: (val: number) => {
        const c = val >= 0 ? '#cf1322' : '#3f8600';
        return <Text style={{ color: c, fontWeight: 'bold' }}>{val >= 0 ? '+' : ''}{val}%</Text>;
      },
    },
    { title: '重仓股数', dataIndex: 'holdingsCount', width: 100 },
    {
      title: '前三大贡献',
      dataIndex: 'stockContributions',
      render: (val: string) => {
        const details = JSON.parse(val || '[]');
        return (
          <div style={{ fontSize: 12 }}>
            {details.slice(0, 3).map((d: any, i: number) => (
              <div key={i}>
                {d.name}: {d.stockChange >= 0 ? '+' : ''}{d.stockChange}%
              </div>
            ))}
          </div>
        );
      },
    },
  ];

  return (
    <div>
      {/* Tab 切换 */}
      <Segmented
        value={activeTab}
        onChange={(val) => setActiveTab(val as TabKey)}
        options={[
          { value: 'detail', label: '当前归因' },
          { value: 'history', label: '历史走势' },
        ]}
        style={{ marginBottom: 16 }}
      />

      {/* 当前归因 */}
      {activeTab === 'detail' && (
        <>
          {/* 估算收益概览 */}
          <Card style={{ marginBottom: 16, background: isUp ? '#fff1f0' : '#f6ffed' }}>
            <Row gutter={24} align="middle">
              <Col span={8}>
                <Statistic
                  title="今日估算涨跌"
                  value={data.estimateChange}
                  precision={2}
                  suffix="%"
                  valueStyle={{ color, fontSize: 28 }}
                  prefix={isUp ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                />
              </Col>
              <Col span={8}>
                <div style={{ textAlign: 'center' }}>
                  <Text type="secondary">重仓股数量</Text>
                  <div style={{ fontSize: 24, fontWeight: 'bold', marginTop: 4 }}>
                    {data.holdings.length} 只
                  </div>
                </div>
              </Col>
              <Col span={8}>
                <div style={{ textAlign: 'right' }}>
                  <Text type="secondary">数据更新时间</Text>
                  <div style={{ marginTop: 4 }}>{data.updateTime}</div>
                  <a onClick={fetchData} style={{ fontSize: 12 }}>
                    <ReloadOutlined /> 刷新
                  </a>
                </div>
              </Col>
            </Row>
          </Card>

          {/* 重仓股收益归因表 */}
          <Title level={5}>重仓股收益归因</Title>
          <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            收益贡献 = 持仓占比 x 股票涨跌幅（数据基于最新季报持仓，仅供参考）
          </Text>
          <Table
            columns={columns}
            dataSource={data.stockContributions}
            rowKey="symbol"
            size="small"
            pagination={false}
          />
        </>
      )}

      {/* 历史走势 */}
      {activeTab === 'history' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Select
              value={historyDays}
              onChange={(val) => setHistoryDays(val)}
              options={[
                { label: '最近7天', value: 7 },
                { label: '最近30天', value: 30 },
                { label: '最近90天', value: 90 },
                { label: '最近180天', value: 180 },
              ]}
              style={{ width: 120 }}
            />
            <Button icon={<ReloadOutlined />} onClick={fetchHistory} loading={historyLoading}>
              刷新
            </Button>
          </div>

          {historyLoading ? (
            <div style={{ height: 300, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <Spin tip="加载历史数据..." />
            </div>
          ) : historyData.length === 0 ? (
            <div style={{ height: 300, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#999' }}>
              <div style={{ textAlign: 'center' }}>
                <HistoryOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                <div>暂无历史数据</div>
                <div style={{ fontSize: 12, marginTop: 8 }}>每天首次查看时会自动记录</div>
              </div>
            </div>
          ) : (
            <>
              <div ref={chartRef} style={{ width: '100%', height: 300 }} />
              <div style={{ marginTop: 24 }}>
                <Title level={5}>历史记录</Title>
                <Table
                  columns={historyColumns}
                  dataSource={[...historyData].reverse()}
                  rowKey="id"
                  size="small"
                  pagination={{ pageSize: 10 }}
                />
              </div>
            </>
          )}
        </>
      )}

      {/* K线图弹窗 */}
      <Modal
        title={`${klineName} (${klineSymbol ? formatSymbolDisplay(klineSymbol) : ''}) K线图`}
        open={!!klineSymbol}
        onCancel={() => setKlineSymbol(null)}
        footer={null}
        width={900}
        destroyOnClose
      >
        {klineSymbol && <KlineChart symbol={klineSymbol} />}
      </Modal>
    </div>
  );
}
