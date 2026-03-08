import React from 'react';
import { useI18n } from '../i18n';
import { SYMBOL_META } from './MarketSelector';

const OverviewChart = ({ symbol, candles }) => {
  const { t } = useI18n();

  if (!candles || candles.length === 0) {
    return <div className="flex items-center justify-center h-full text-gray-500">No data</div>;
  }

  const last = candles[candles.length - 1];
  const first = candles[0];
  const high24 = Math.max(...candles.map((c) => c.high));
  const low24 = Math.min(...candles.map((c) => c.low));
  const totalVol = candles.reduce((s, c) => s + c.volume, 0);
  const change = last.close - first.open;
  const changePct = ((change / first.open) * 100).toFixed(2);
  const isUp = change >= 0;
  const meta = SYMBOL_META[symbol] || {};

  // Simple sparkline SVG
  const prices = candles.map((c) => c.close);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;
  const w = 400;
  const h = 120;
  const points = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * w;
    const y = h - ((p - minP) / range) * h;
    return `${x},${y}`;
  }).join(' ');

  const f = (v) => v != null ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-';

  return (
    <div className="h-full flex flex-col p-4 overflow-y-auto">
      {/* Symbol header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">{meta.icon || '•'}</span>
        <div>
          <h2 className="text-xl font-bold text-white">{symbol}</h2>
          {meta.name && <span className="text-sm text-gray-400">{meta.name}</span>}
        </div>
        <div className="ml-auto text-right">
          <div className={`text-2xl font-bold font-mono ${isUp ? 'text-green-400' : 'text-red-400'}`}>
            {f(last.close)}
          </div>
          <span className={`text-sm px-2 py-0.5 rounded ${isUp ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
            {isUp ? '+' : ''}{changePct}%
          </span>
        </div>
      </div>

      {/* Sparkline chart */}
      <div className="bg-gray-800 rounded-lg p-3 mb-4">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: 120 }}>
          <defs>
            <linearGradient id={`grad-${symbol}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isUp ? '#26a69a' : '#ef5350'} stopOpacity="0.3" />
              <stop offset="100%" stopColor={isUp ? '#26a69a' : '#ef5350'} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points={`0,${h} ${points} ${w},${h}`}
            fill={`url(#grad-${symbol})`}
          />
          <polyline
            points={points}
            fill="none"
            stroke={isUp ? '#26a69a' : '#ef5350'}
            strokeWidth="2"
          />
        </svg>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: t('open'), value: f(first.open) },
          { label: t('high'), value: f(last.high) },
          { label: t('low'), value: f(last.low) },
          { label: t('close'), value: f(last.close) },
          { label: t('high24h'), value: f(high24) },
          { label: t('low24h'), value: f(low24) },
          { label: t('volume24h'), value: totalVol.toLocaleString() },
          { label: t('change24h'), value: `${isUp ? '+' : ''}${changePct}%`, color: isUp ? 'text-green-400' : 'text-red-400' },
        ].map((stat) => (
          <div key={stat.label} className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">{stat.label}</div>
            <div className={`text-sm font-semibold font-mono ${stat.color || 'text-white'}`}>{stat.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default OverviewChart;
