import React, { useState } from 'react';
import type { OrderBookAnalysis } from '../utils/quant';

interface OrderBookPanelProps {
  symbol: string;
  orderBook: OrderBookAnalysis;
}

export const OrderBookPanel: React.FC<OrderBookPanelProps> = ({ symbol, orderBook }) => {
  const [viewMode, setViewMode] = useState<'COMBINED' | 'BIDS' | 'ASKS'>('COMBINED');

  const formatPrice = (p: number) => {
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(4);
    return p.toFixed(5);
  };

  const formatUsdt = (val: number) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(2)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
    return `$${val.toFixed(0)}`;
  };

  const formatQty = (q: number) => {
    if (q >= 100) return q.toFixed(2);
    if (q >= 1) return q.toFixed(3);
    if (q >= 0.01) return q.toFixed(4);
    return q.toFixed(5);
  };

  const bidRatio = Math.max(
    5,
    Math.min(
      95,
      Math.round(
        (orderBook.totalBidUsdt / Math.max(1, orderBook.totalBidUsdt + orderBook.totalAskUsdt)) * 100
      )
    )
  );
  const askRatio = 100 - bidRatio;

  const visibleBids = viewMode === 'ASKS' ? [] : orderBook.bids.slice(0, viewMode === 'BIDS' ? 12 : 8);
  const visibleAsks = viewMode === 'BIDS' ? [] : orderBook.asks.slice(0, viewMode === 'ASKS' ? 12 : 8);

  return (
    <div className="bg-[#111827] border border-slate-800 rounded-lg p-5">
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-800/80">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Order Book Depth & Liquidity</h2>
          <p className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
            {symbol.replace('USDT', '/USDT')} · Spread {orderBook.spreadPercent}%
          </p>
        </div>

        <div
          className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-md"
          role="group"
          aria-label="Order book depth filter"
        >
          {(['COMBINED', 'BIDS', 'ASKS'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`px-2 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                viewMode === mode
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode === 'COMBINED' ? 'Book' : mode === 'BIDS' ? 'Bids' : 'Asks'}
            </button>
          ))}
        </div>
      </div>

      {/* Bid / Ask Imbalance Bar */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs font-mono tabular-nums mb-1.5">
          <span className="text-emerald-400">
            Bids {bidRatio}% ({formatUsdt(orderBook.totalBidUsdt)})
          </span>
          <span className="text-slate-400">{orderBook.pressureState.replace(/_/g, ' ')}</span>
          <span className="text-rose-400">
            Asks {askRatio}% ({formatUsdt(orderBook.totalAskUsdt)})
          </span>
        </div>
        <div className="h-2 w-full bg-slate-900 rounded overflow-hidden flex">
          <div
            className="h-full bg-emerald-500/80 transition-opacity duration-150"
            style={{ width: `${bidRatio}%` }}
          />
          <div
            className="h-full bg-rose-500/80 transition-opacity duration-150"
            style={{ width: `${askRatio}%` }}
          />
        </div>
      </div>

      {/* Column Headers */}
      <div className="grid grid-cols-3 text-xs text-slate-400 pt-3 pb-1.5 border-b border-slate-800/60 font-mono">
        <span>Price (USDT)</span>
        <span className="text-right">Size ({symbol.replace('USDT', '')})</span>
        <span className="text-right">Cumulative</span>
      </div>

      {/* Asks (Sell Liquidity) */}
      {visibleAsks.length > 0 && (
        <div className="divide-y divide-slate-800/30">
          {[...visibleAsks].reverse().map((ask, idx) => (
            <div
              key={`ask-${idx}-${ask.price}`}
              className="relative grid grid-cols-3 items-center py-1 text-xs font-mono tabular-nums overflow-hidden"
            >
              <div
                className="absolute right-0 top-0 bottom-0 bg-rose-500/12 pointer-events-none"
                style={{ width: `${ask.depthPercent}%` }}
              />
              <span className="relative text-rose-400">{formatPrice(ask.price)}</span>
              <span className="relative text-right text-slate-300">{formatQty(ask.quantity)}</span>
              <span className="relative text-right text-slate-400">
                {formatUsdt(ask.cumulativeUsdt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Mid-Market Spread Divider */}
      <div className="my-2 py-1.5 px-3 bg-slate-900/90 border border-slate-800/80 rounded flex items-center justify-between text-xs font-mono tabular-nums">
        <span className="text-slate-300">
          Best Bid: <strong className="text-emerald-400">{formatPrice(orderBook.bestBid)}</strong>
        </span>
        <span className="text-slate-400">·</span>
        <span className="text-slate-300">
          Best Ask: <strong className="text-rose-400">{formatPrice(orderBook.bestAsk)}</strong>
        </span>
      </div>

      {/* Bids (Buy Liquidity) */}
      {visibleBids.length > 0 && (
        <div className="divide-y divide-slate-800/30">
          {visibleBids.map((bid, idx) => (
            <div
              key={`bid-${idx}-${bid.price}`}
              className="relative grid grid-cols-3 items-center py-1 text-xs font-mono tabular-nums overflow-hidden"
            >
              <div
                className="absolute right-0 top-0 bottom-0 bg-emerald-500/12 pointer-events-none"
                style={{ width: `${bid.depthPercent}%` }}
              />
              <span className="relative text-emerald-400">{formatPrice(bid.price)}</span>
              <span className="relative text-right text-slate-300">{formatQty(bid.quantity)}</span>
              <span className="relative text-right text-slate-400">
                {formatUsdt(bid.cumulativeUsdt)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Major Liquidity Walls Summary */}
      <div className="mt-3 pt-3 border-t border-slate-800/80 grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
        <div>
          <span className="text-slate-400 block font-sans">Major Bid Support Wall</span>
          <span className="text-emerald-400 font-semibold">
            {formatPrice(orderBook.majorBidWall.price)} ({formatUsdt(orderBook.majorBidWall.usdt)})
          </span>
        </div>
        <div className="text-right">
          <span className="text-slate-400 block font-sans">Major Ask Supply Wall</span>
          <span className="text-rose-400 font-semibold">
            {formatPrice(orderBook.majorAskWall.price)} ({formatUsdt(orderBook.majorAskWall.usdt)})
          </span>
        </div>
      </div>
    </div>
  );
};
