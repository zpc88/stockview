import { useState, useEffect } from 'react';
import { Card, Typography, Button, Space, Tooltip, Spin, Divider, Tag } from 'antd';
import { DeleteOutlined, LineChartOutlined, ArrowUpOutlined, ArrowDownOutlined, FundOutlined, DollarOutlined, TagsOutlined, PlusOutlined } from '@ant-design/icons';
import { StockQuote, WatchlistItem, FundEstimate } from '../types';
import { stockApi } from '../services/api';

const { Text, Title } = Typography;

interface Props {
  item: WatchlistItem;
  quote?: StockQuote;
  investmentAmount?: number;
  investmentProfit?: number;
  investmentProfitPercent?: number;
  onRemove: () => void;
  onChart: () => void;
  onFundDetail?: () => void;
  onTagManage?: () => void;
  onRemoveTag?: (tagId: number) => void;
  onAddInvestment?: () => void;
}

export default function StockCard({
  item,
  quote,
  investmentAmount,
  investmentProfit,
  investmentProfitPercent,
  onRemove,
  onChart,
  onFundDetail,
  onTagManage,
  onRemoveTag,
  onAddInvestment,
}: Props) {
  const [fundEstimate, setFundEstimate] = useState<FundEstimate | null>(null);
  const [fundLoading, setFundLoading] = useState(false);

  // 基金类型自动获取估算收益
  useEffect(() => {
    if (item.type !== 'fund') return;

    const fetchEstimate = async () => {
      console.log('[StockCard] Fetching fund estimate for:', item.symbol, item.name);
      setFundLoading(true);
      try {
        const result = await stockApi.getFundEstimate(item.symbol, item.name);
        console.log('[StockCard] Fund estimate result:', result?.fundName, result?.estimateChange, 'holdings:', result?.holdings?.length);
        setFundEstimate(result);
      } catch (err) {
        console.error('[StockCard] Failed to fetch fund estimate:', err);
      } finally {
        setFundLoading(false);
      }
    };

    fetchEstimate();
    // 每60秒刷新一次
    const timer = setInterval(fetchEstimate, 60000);
    return () => clearInterval(timer);
  }, [item.symbol, item.name, item.type]);

  const isStock = item.type === 'stock' || item.type === 'us_stock' || item.type === 'hk_stock';

  // 股票用实时行情，基金用估算收益
  const displayChange = isStock
    ? (quote?.changePercent ?? 0)
    : (fundEstimate?.estimateChange ?? 0);

  const isUp = displayChange >= 0;
  const color = isUp ? '#cf1322' : '#3f8600';
  const bgColor = isUp ? '#fff1f0' : '#f6ffed';

  const hasInvestment = investmentAmount && investmentAmount > 0;
  const investProfitUp = (investmentProfit ?? 0) >= 0;

  const tagButton = onTagManage ? (
    <Tooltip title="管理标签" key="tag">
      <Button type="text" icon={<TagsOutlined />} onClick={onTagManage}>
        标签
      </Button>
    </Tooltip>
  ) : null;

  const actions = isStock
    ? [
        <Tooltip title="查看K线" key="chart">
          <Button type="text" icon={<LineChartOutlined />} onClick={onChart}>
            K线图
          </Button>
        </Tooltip>,
        tagButton,
        <Tooltip title="从自选中移除" key="delete">
          <Button type="text" danger icon={<DeleteOutlined />} onClick={onRemove}>
            移除
          </Button>
        </Tooltip>,
      ]
    : [
        <Tooltip title="查看重仓股收益归因" key="fund">
          <Button type="text" icon={<FundOutlined />} onClick={onFundDetail}>
            重仓归因
          </Button>
        </Tooltip>,
        tagButton,
        <Tooltip title="从自选中移除" key="delete">
          <Button type="text" danger icon={<DeleteOutlined />} onClick={onRemove}>
            移除
          </Button>
        </Tooltip>,
      ];

  return (
    <Card
      hoverable
      style={{
        borderRadius: 8,
        borderLeft: `4px solid ${color}`,
        background: bgColor,
      }}
      styles={{ body: { padding: '12px 16px' } }}
      actions={actions}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <Title level={5} style={{ margin: 0, marginBottom: 4 }}>
            {item.name}
          </Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {item.type === 'us_stock' ? item.symbol.substring(3).toUpperCase() : item.type === 'hk_stock' ? item.symbol.substring(3) : item.symbol.toUpperCase()}
            {' · '}
            {item.type === 'stock' ? 'A股' : item.type === 'fund' ? '基金' : item.type === 'us_stock' ? '美股' : item.type === 'hk_stock' ? '港股' : item.type}
          </Text>
          {item.tags && item.tags.length > 0 && (
            <div style={{ marginTop: 4 }}>
              {item.tags.map((t) => (
                <Tag
                  key={t.id}
                  color={t.color}
                  closable={!!onRemoveTag}
                  onClose={(e) => {
                    e.stopPropagation();
                    onRemoveTag?.(t.id);
                  }}
                  style={{ fontSize: 11, lineHeight: '18px', marginBottom: 2 }}
                >
                  {t.name}
                </Tag>
              ))}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          {isStock ? (
            // 股票：显示实时价格
            quote ? (
              <>
                <div style={{ fontSize: 24, fontWeight: 'bold', color, lineHeight: 1.2 }}>
                  {quote.currentPrice.toFixed(2)}
                </div>
                <Space size={4}>
                  {isUp ? <ArrowUpOutlined style={{ color }} /> : <ArrowDownOutlined style={{ color }} />}
                  <Text style={{ color, fontSize: 14 }}>
                    {isUp ? '+' : ''}{quote.change.toFixed(2)} ({isUp ? '+' : ''}{quote.changePercent.toFixed(2)}%)
                  </Text>
                </Space>
              </>
            ) : (
              <Text type="secondary">加载中...</Text>
            )
          ) : (
            // 基金：显示估算涨跌
            fundLoading ? (
              <Spin size="small" />
            ) : fundEstimate ? (
              <>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>今日估算</div>
                <div style={{ fontSize: 24, fontWeight: 'bold', color, lineHeight: 1.2 }}>
                  {isUp ? '+' : ''}{fundEstimate.estimateChange.toFixed(2)}%
                </div>
                <Space size={4}>
                  {isUp ? <ArrowUpOutlined style={{ color }} /> : <ArrowDownOutlined style={{ color }} />}
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {fundEstimate.holdings.length}只重仓 · {fundEstimate.updateTime}
                  </Text>
                </Space>
              </>
            ) : (
              <Text type="secondary">暂无持仓数据</Text>
            )
          )}
        </div>
      </div>

      {/* 股票：显示行情详情 */}
      {isStock && quote && (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12 }}>
          <div>
            <Text type="secondary">开盘</Text>
            <div>{quote.open.toFixed(2)}</div>
          </div>
          <div>
            <Text type="secondary">最高</Text>
            <div style={{ color: '#cf1322' }}>{quote.high.toFixed(2)}</div>
          </div>
          <div>
            <Text type="secondary">最低</Text>
            <div style={{ color: '#3f8600' }}>{quote.low.toFixed(2)}</div>
          </div>
          <div>
            <Text type="secondary">昨收</Text>
            <div>{quote.close.toFixed(2)}</div>
          </div>
          <div>
            <Text type="secondary">成交量</Text>
            <div>{quote.volume >= 10000 ? `${(quote.volume / 10000).toFixed(1)}万手` : `${quote.volume}手`}</div>
          </div>
          <div>
            <Text type="secondary">成交额</Text>
            <div>{quote.amount >= 10000 ? `${(quote.amount / 10000).toFixed(1)}亿` : `${quote.amount}万`}</div>
          </div>
        </div>
      )}

      {/* 基金：显示前3大重仓股 */}
      {!isStock && fundEstimate && fundEstimate.stockContributions.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12 }}>
          <Text type="secondary">前三大重仓:</Text>
          <div style={{ marginTop: 4 }}>
            {fundEstimate.stockContributions.slice(0, 3).map((s) => {
              const sColor = s.stockChange >= 0 ? '#cf1322' : '#3f8600';
              return (
                <div key={s.symbol} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span>{s.name} ({s.ratio.toFixed(1)}%)</span>
                  <span style={{ color: sColor }}>
                    {s.stockChange >= 0 ? '+' : ''}{s.stockChange.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 投资信息 */}
      <Divider style={{ margin: '8px 0' }} />
      {hasInvestment ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space size={4}>
            <DollarOutlined style={{ color: '#1677ff' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>投资金额:</Text>
            <Text strong style={{ fontSize: 14 }}>¥{investmentAmount?.toLocaleString()}</Text>
          </Space>
          {investmentProfit !== undefined && (
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>盈亏:</Text>
              <Text style={{ color: investProfitUp ? '#cf1322' : '#3f8600', fontWeight: 'bold', fontSize: 14 }}>
                {investProfitUp ? '+' : ''}¥{investmentProfit?.toLocaleString()}
              </Text>
              <Text style={{ color: investProfitUp ? '#cf1322' : '#3f8600', fontSize: 12 }}>
                ({investmentProfitPercent && investmentProfitPercent >= 0 ? '+' : ''}{investmentProfitPercent}%)
              </Text>
            </Space>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            <DollarOutlined style={{ marginRight: 4 }} />未记录投资
          </Text>
          {onAddInvestment && (
            <Button type="link" size="small" icon={<PlusOutlined />} onClick={onAddInvestment} style={{ padding: 0 }}>
              记录投资
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
