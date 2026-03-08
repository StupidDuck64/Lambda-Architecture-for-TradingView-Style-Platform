import React, { useMemo } from 'react';
import { useI18n } from '../i18n';

function generateRecentTrades(basePrice, count = 50) {
  const trades = [];
  let seed = Math.floor(basePrice * 37);
  function rand() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }

  const now = Math.floor(Date.now() / 1000);
  let price = basePrice;

  for (let i = 0; i < count; i++) {
    const side = rand() > 0.5 ? 'buy' : 'sell';
    const change = (rand() - 0.5) * basePrice * 0.002;
    price = Math.max(price + change, 1);
    const amount = +(rand() * 3 + 0.001).toFixed(4);
    const time = now - (count - i) * (Math.floor(rand() * 30) + 5);

    trades.push({
      time,
      price: +price.toFixed(2),
      amount,
      side,
      total: +(price * amount).toFixed(2),
    });
  }

  return trades.reverse(); // newest first
}

const RecentTrades = ({ symbol, lastPrice }) => {
  const { t } = useI18n();

  const trades = useMemo(() => generateRecentTrades(lastPrice || 100), [lastPrice]);

  const formatTime = (ts) => {
    const d = new Date(ts * 1000);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  const f = (v) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="h-full flex flex-col text-xs font-mono overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-gray-400 font-sans font-medium text-sm">{t('recentTrades')}</span>
        <span className="text-gray-500">{symbol}</span>
      </div>

      {/* Column headers */}
      <div className="flex px-3 py-1 text-gray-500 border-b border-gray-700">
        <span className="w-20">{t('time')}</span>
        <span className="flex-1">{t('price')}</span>
        <span className="flex-1 text-right">{t('amount')}</span>
        <span className="w-12 text-right">{t('side')}</span>
      </div>

      {/* Trade list */}
      <div className="flex-1 overflow-y-auto">
        {trades.map((trade, i) => (
          <div key={i} className="flex px-3 py-0.5 hover:bg-gray-800 transition-colors">
            <span className="w-20 text-gray-500">{formatTime(trade.time)}</span>
            <span className={`flex-1 ${trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
              {f(trade.price)}
            </span>
            <span className="flex-1 text-right text-gray-300">{trade.amount}</span>
            <span className={`w-12 text-right font-sans ${trade.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
              {t(trade.side)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentTrades;
