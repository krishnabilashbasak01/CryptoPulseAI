import React, { useState } from 'react';
import { Bell, Trash2, Plus } from 'lucide-react';
import type { CryptoTicker, PriceAlert, TriggeredAlertEvent } from '../utils/quant';

interface AlertsManagerProps {
  tickers: CryptoTicker[];
  selectedSymbol: string;
  alerts: PriceAlert[];
  triggeredFeed: TriggeredAlertEvent[];
  onAddAlert: (alert: Omit<PriceAlert, 'id' | 'createdAt' | 'triggered'>) => void;
  onRemoveAlert: (id: string) => void;
  onSelectSymbol: (symbol: string) => void;
}

export const AlertsManager: React.FC<AlertsManagerProps> = ({
  tickers,
  selectedSymbol,
  alerts,
  triggeredFeed,
  onAddAlert,
  onRemoveAlert,
  onSelectSymbol,
}) => {
  const [symbol, setSymbol] = useState(selectedSymbol);
  const [condition, setCondition] = useState<PriceAlert['condition']>('PCT_CHANGE_ABOVE');
  const [threshold, setThreshold] = useState<string>('8.0');
  const [formError, setFormError] = useState<string | null>(null);

  // Sync default symbol when user clicks quick-alert or keep user choice
  const activeTicker = tickers.find((t) => t.symbol === symbol) || tickers[0];

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    const numericThreshold = parseFloat(threshold);
    if (Number.isNaN(numericThreshold)) {
      setFormError('Please enter a valid numeric threshold.');
      return;
    }
    setFormError(null);
    onAddAlert({
      symbol,
      condition,
      threshold: numericThreshold,
      note: 'User custom alert',
    });
  };

  // Automatic Significant 24h Percentage Change Movers (>= 7% or <= -3%)
  const significantMovers = tickers
    .filter((t) => Math.abs(t.priceChangePercent) >= 6.0 || t.volatilityRatio >= 9.0)
    .slice(0, 6);

  const formatConditionLabel = (c: PriceAlert['condition'], val: number) => {
    switch (c) {
      case 'PCT_CHANGE_ABOVE':
        return `24h Change ≥ +${val}%`;
      case 'PCT_CHANGE_BELOW':
        return `24h Change ≤ ${val}%`;
      case 'PRICE_ABOVE':
        return `Price ≥ $${val.toLocaleString()}`;
      case 'PRICE_BELOW':
        return `Price ≤ $${val.toLocaleString()}`;
      case 'VOLATILITY_ABOVE':
        return `Volatility ≥ ${val}%`;
    }
  };

  return (
    <div className="bg-[#111827] border border-slate-800 rounded-lg p-5">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
        <div>
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <Bell className="w-4 h-4 text-sky-400" />
            <span>Percentage Change & Volatility Alerts</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time monitoring for significant % surges, structure breakouts, and price thresholds
          </p>
        </div>
        <span className="text-xs font-mono text-slate-400 tabular-nums whitespace-nowrap shrink-0">
          {alerts.filter((a) => !a.triggered).length} Active · {alerts.filter((a) => a.triggered).length} Triggered
        </span>
      </div>

      {/* Auto-Detected Significant Percentage Change Movers */}
      <div className="mt-3 pb-3 border-b border-slate-800/80">
        <div className="text-xs font-medium text-slate-300 mb-2">
          Live Significant Percentage & Volatility Movers
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {significantMovers.map((m) => {
            const isUp = m.priceChangePercent >= 0;
            return (
              <button
                key={m.symbol}
                type="button"
                onClick={() => onSelectSymbol(m.symbol)}
                className="text-left p-2 rounded bg-slate-900/90 hover:bg-slate-800 border border-slate-800 transition-colors"
              >
                <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                  <span className="font-semibold text-slate-200">{m.baseAsset}/USDT</span>
                  <span className={isUp ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                    {isUp ? '+' : ''}
                    {m.priceChangePercent.toFixed(2)}%
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-400 mt-0.5 tabular-nums">
                  Vol Range: {m.volatilityRatio}% · ${(m.quoteVolume / 1e6).toFixed(0)}M
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Add Custom Alert Form */}
      <form onSubmit={handleCreate} className="mt-3 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <div>
            <label htmlFor="alert-symbol-select" className="block text-[11px] text-slate-400 mb-1">
              Asset Pair
            </label>
            <select
              id="alert-symbol-select"
              value={symbol}
              onChange={(e) => {
                const nextSym = e.target.value;
                setSymbol(nextSym);
                const found = tickers.find((t) => t.symbol === nextSym);
                if (found && (condition === 'PRICE_ABOVE' || condition === 'PRICE_BELOW')) {
                  setThreshold((found.lastPrice * 1.02).toFixed(2));
                }
              }}
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-sky-500"
            >
              {tickers.map((t) => (
                <option key={t.symbol} value={t.symbol}>
                  {t.symbol}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="alert-condition-select" className="block text-[11px] text-slate-400 mb-1">
              Trigger Condition
            </label>
            <select
              id="alert-condition-select"
              value={condition}
              onChange={(e) => {
                const nextCond = e.target.value as PriceAlert['condition'];
                setCondition(nextCond);
                if (nextCond === 'PCT_CHANGE_ABOVE') setThreshold('8.0');
                else if (nextCond === 'PCT_CHANGE_BELOW') setThreshold('-5.0');
                else if (nextCond === 'VOLATILITY_ABOVE') setThreshold('10.0');
                else if (activeTicker) {
                  setThreshold(
                    (
                      activeTicker.lastPrice *
                      (nextCond === 'PRICE_ABOVE' ? 1.02 : 0.98)
                    ).toPrecision(5)
                  );
                }
              }}
              className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-sky-500"
            >
              <option value="PCT_CHANGE_ABOVE">24h % Gain Above (+%)</option>
              <option value="PCT_CHANGE_BELOW">24h % Drop Below (-%)</option>
              <option value="VOLATILITY_ABOVE">Intraday Volatility Range Above (%)</option>
              <option value="PRICE_ABOVE">Price Breaks Above (USDT)</option>
              <option value="PRICE_BELOW">Price Drops Below (USDT)</option>
            </select>
          </div>

          <div>
            <label htmlFor="alert-threshold-input" className="block text-[11px] text-slate-400 mb-1">
              Threshold
            </label>
            <div className="flex items-center gap-1.5">
              <input
                id="alert-threshold-input"
                type="number"
                step="any"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-sky-500"
              />
              <button
                type="submit"
                aria-label="Create Alert"
                className="px-2.5 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </div>
        </div>
        {formError && <p className="text-xs text-rose-400 mt-1.5">{formError}</p>}
      </form>

      {/* Active & Triggered Alert Rules List */}
      <div className="mt-4 divide-y divide-slate-800/60 max-h-48 overflow-y-auto">
        {alerts.length === 0 ? (
          <p className="text-xs text-slate-500 py-3">
            No custom alert rules configured. Add a threshold above to monitor percentage spikes or price targets.
          </p>
        ) : (
          alerts.map((a) => (
            <div
              key={a.id}
              className="py-2 flex items-center justify-between gap-2 text-xs font-mono tabular-nums"
            >
              <div>
                <button
                  type="button"
                  onClick={() => onSelectSymbol(a.symbol)}
                  className="font-semibold text-slate-200 hover:text-sky-400 transition-colors"
                >
                  {a.symbol}
                </button>
                <span className="text-slate-500 mx-1.5">·</span>
                <span className="text-slate-300">{formatConditionLabel(a.condition, a.threshold)}</span>
                <span className="text-slate-500 mx-1.5">·</span>
                <span className={a.triggered ? 'text-emerald-400' : 'text-amber-400'}>
                  {a.triggered ? 'Triggered' : 'Monitoring'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRemoveAlert(a.id)}
                aria-label={`Delete alert for ${a.symbol}`}
                className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Recent Triggered Log */}
      {triggeredFeed.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800/80">
          <div className="text-xs font-medium text-slate-300 mb-1.5">Recent Triggered Notifications</div>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {triggeredFeed.slice(0, 4).map((ev) => (
              <div
                key={ev.id}
                className="text-xs font-mono text-slate-300 bg-slate-900/80 px-2.5 py-1.5 rounded flex items-center justify-between gap-2"
              >
                <span>{ev.message}</span>
                <span className="text-slate-500 text-[10px] shrink-0">
                  {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
