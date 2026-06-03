import { useState, useEffect } from 'react';
import { Card, Typography, Space, Spin } from 'antd';
import { ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import { stockApi } from '../services/api';
import { socketService } from '../services/socket';
import { StockQuote } from '../types';

const { Text } = Typography;

const INDEX_NAMES: Record<string, string> = {
  sh000001: '上证指数',
  sz399001: '深证成指',
  sz399006: '创业板指',
};

export default function IndexBar() {
  const [indices, setIndices] = useState<StockQuote[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchIndices = async () => {
      try {
        const data = await stockApi.getIndices();
        setIndices(data);
      } catch {
        console.error('Failed to fetch indices');
      } finally {
        setLoading(false);
      }
    };

    fetchIndices();

    // 每30秒刷新大盘数据
    const timer = setInterval(fetchIndices, 30000);
    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return <Spin style={{ marginBottom: 16 }} />;
  }

  return (
    <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
      {indices.map((idx) => {
        const isUp = idx.change >= 0;
        const color = isUp ? '#cf1322' : '#3f8600';
        const name = INDEX_NAMES[idx.symbol] || idx.name;

        return (
          <Card
            key={idx.symbol}
            size="small"
            style={{
              flex: 1,
              minWidth: 200,
              borderLeft: `3px solid ${color}`,
              background: isUp ? '#fff1f0' : '#f6ffed',
            }}
            styles={{ body: { padding: '8px 12px' } }}
          >
            <Text strong style={{ fontSize: 13 }}>{name}</Text>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4 }}>
              <Text style={{ fontSize: 20, fontWeight: 'bold', color }}>
                {idx.currentPrice.toFixed(2)}
              </Text>
              <Space size={4}>
                {isUp ? <ArrowUpOutlined style={{ color, fontSize: 12 }} /> : <ArrowDownOutlined style={{ color, fontSize: 12 }} />}
                <Text style={{ color, fontSize: 13 }}>
                  {isUp ? '+' : ''}{idx.change.toFixed(2)} ({isUp ? '+' : ''}{idx.changePercent.toFixed(2)}%)
                </Text>
              </Space>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
