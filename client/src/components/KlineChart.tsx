import { useState, useEffect, useRef } from 'react';
import { Radio, Spin, message, Space, Tag } from 'antd';
import { CloudOutlined, DatabaseOutlined } from '@ant-design/icons';
import * as echarts from 'echarts';
import { stockApi } from '../services/api';
import { KlineItem } from '../types';

interface Props {
  symbol: string;
}

export default function KlineChart({ symbol }: Props) {
  const [period, setPeriod] = useState('day');
  const [mode, setMode] = useState<'cache' | 'realtime'>('realtime');
  const [data, setData] = useState<KlineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<'cache' | 'realtime'>('realtime');
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await stockApi.getKline(symbol, period, mode);
        setData(result.data);
        setDataSource(result.source);
      } catch {
        message.error('获取K线数据失败');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [symbol, period, mode]);

  useEffect(() => {
    if (!chartRef.current || data.length === 0 || loading) return;

    const timer = setTimeout(() => {
      if (!chartRef.current) return;

      if (chartInstance.current) {
        chartInstance.current.dispose();
      }

      const chart = echarts.init(chartRef.current);
      chartInstance.current = chart;

      const option: echarts.EChartsOption = {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'cross' },
        },
        grid: [
          { left: '10%', right: '8%', top: '8%', height: '50%' },
          { left: '10%', right: '8%', top: '68%', height: '20%' },
        ],
        xAxis: [
          {
            type: 'category',
            data: data.map((d) => d.date),
            gridIndex: 0,
            axisLabel: { show: false },
          },
          {
            type: 'category',
            data: data.map((d) => d.date),
            gridIndex: 1,
            axisLabel: { fontSize: 10 },
          },
        ],
        yAxis: [
          { type: 'value', gridIndex: 0, scale: true },
          { type: 'value', gridIndex: 1, scale: true, splitNumber: 2 },
        ],
        dataZoom: [
          { type: 'inside', xAxisIndex: [0, 1], start: 60, end: 100 },
          { type: 'slider', xAxisIndex: [0, 1], start: 60, end: 100, top: '92%', height: 16 },
        ],
        series: [
          {
            name: 'K线',
            type: 'candlestick',
            data: data.map((d) => [d.open, d.close, d.low, d.high]),
            xAxisIndex: 0,
            yAxisIndex: 0,
            itemStyle: {
              color: '#ef232a',
              color0: '#14b143',
              borderColor: '#ef232a',
              borderColor0: '#14b143',
            },
          },
          {
            name: '成交量',
            type: 'bar',
            data: data.map((d) => ({
              value: d.volume,
              itemStyle: { color: d.close >= d.open ? '#ef232a' : '#14b143' },
            })),
            xAxisIndex: 1,
            yAxisIndex: 1,
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
  }, [data, loading]);

  useEffect(() => {
    return () => {
      chartInstance.current?.dispose();
      chartInstance.current = null;
    };
  }, []);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Radio.Group
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          size="small"
        >
          <Radio.Button value="day">日K</Radio.Button>
          <Radio.Button value="week">周K</Radio.Button>
          <Radio.Button value="month">月K</Radio.Button>
          <Radio.Button value="60min">60分钟</Radio.Button>
          <Radio.Button value="30min">30分钟</Radio.Button>
          <Radio.Button value="15min">15分钟</Radio.Button>
        </Radio.Group>

        <Space size={8}>
          <Radio.Group
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            size="small"
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="cache">
              <DatabaseOutlined /> 缓存数据
            </Radio.Button>
            <Radio.Button value="realtime">
              <CloudOutlined /> 实时数据
            </Radio.Button>
          </Radio.Group>
          <Tag color={dataSource === 'cache' ? 'blue' : 'green'} style={{ margin: 0 }}>
            {dataSource === 'cache' ? '来自缓存' : '来自API'}
          </Tag>
        </Space>
      </div>

      {loading ? (
        <div style={{ height: 400, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <Spin tip="加载K线数据..." />
        </div>
      ) : data.length === 0 ? (
        <div style={{ height: 400, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#999' }}>
          暂无K线数据
        </div>
      ) : (
        <div ref={chartRef} style={{ width: '100%', height: 450 }} />
      )}
    </div>
  );
}
