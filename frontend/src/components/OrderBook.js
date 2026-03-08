import React, { useMemo } from 'react';
import { useI18n } from '../i18n';

function generateOrderBook(basePrice, depth = 20) {
  const asks = [];
  const bids = [];
  let seed = Math.floor(basePrice * 100);
  function rand() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }

  for (let i = 0; i < depth; i++) {
    const askPrice = basePrice * (1 + (i + 1) * 0.0005 + rand() * 0.0003);
    const bidPrice = basePrice * (1 - (i + 1) * 0.0005 - rand() * 0.0003);
    const askAmt = +(rand() * 5 + 0.1).toFixed(4);
    const bidAmt = +(rand() * 5 + 0.1).toFixed(4);
    asks.push({ price: +askPrice.toFixed(2), amount: askAmt, total: 0 });
    bids.push({ price: +bidPrice.toFixed(2), amount: bidAmt, total: 0 });
  }

  // Sort asks ascending, bids descending
  asks.sort((a, b) => a.price - b.price);
  bids.sort((a, b) => b.price - a.price);

  // Calculate running totals
  let runAsk = 0;
  asks.forEach((a) => { runAsk += a.amount; a.total = +runAsk.toFixed(4); });
  let runBid = 0;
  bids.forEach((b) => { runBid += b.amount; b.total = +runBid.toFixed(4); });

  return { asks, bids };
}

const OrderBook = ({ symbol, lastPrice }) => {
  const { t } = useI18n();

  const { asks, bids } = useMemo(() => generateOrderBook(lastPrice || 100), [lastPrice]);

  const maxAskTotal = asks.length > 0 ? asks[asks.length - 1].total : 1;
  const maxBidTotal = bids.length > 0 ? bids[bids.length - 1].total : 1;
  const spread = asks.length > 0 && bids.length > 0
    ? (asks[0].price - bids[0].price).toFixed(2)
    : '0';
  const spreadPct = asks.length > 0 && bids.length > 0
    ? ((asks[0].price - bids[0].price) / asks[0].price * 100).toFixed(3)
    : '0';

  const f = (v) => v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="h-full flex flex-col text-xs font-mono overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700">
        <span className="text-gray-400 font-sans font-medium text-sm">{t('orderBook')}</span>
        <span className="text-gray-500">{symbol}</span>
      </div>

      {/* Column headers */}
      <div className="flex px-3 py-1 text-gray-500 border-b border-gray-700 bg-gray-850">
        <span className="flex-1">{t('price')}</span>
        <span className="flex-1 text-right">{t('amount')}</span>
        <span className="flex-1 text-right">{t('total')}</span>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Asks (reversed so lowest ask is at bottom) */}
        <div className="flex-1 overflow-y-auto flex flex-col-reverse">
          {asks.map((ask, i) => (
            <div key={`ask-${i}`} className="flex px-3 py-0.5 relative">
              <div
                className="absolute right-0 top-0 bottom-0 bg-red-500 bg-opacity-10"
                style={{ width: `${(ask.total / maxAskTotal) * 100}%` }}
              />
              <span className="flex-1 text-red-400 relative z-10">{f(ask.price)}</span>
              <span className="flex-1 text-right text-gray-300 relative z-10">{ask.amount}</span>
              <span className="flex-1 text-right text-gray-500 relative z-10">{ask.total}</span>
            </div>
          ))}
        </div>

        {/* Spread */}
        <div className="flex items-center justify-center gap-2 py-1.5 bg-gray-800 border-y border-gray-700">
          <span className="text-gray-400">{t('spread')}:</span>
          <span className="text-white font-semibold">{spread}</span>
          <span className="text-gray-500">({spreadPct}%)</span>
        </div>

        {/* Bids */}
        <div className="flex-1 overflow-y-auto">
          {bids.map((bid, i) => (
            <div key={`bid-${i}`} className="flex px-3 py-0.5 relative">
              <div
                className="absolute right-0 top-0 bottom-0 bg-green-500 bg-opacity-10"
                style={{ width: `${(bid.total / maxBidTotal) * 100}%` }}
              />
              <span className="flex-1 text-green-400 relative z-10">{f(bid.price)}</span>
              <span className="flex-1 text-right text-gray-300 relative z-10">{bid.amount}</span>
              <span className="flex-1 text-right text-gray-500 relative z-10">{bid.total}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default OrderBook;
