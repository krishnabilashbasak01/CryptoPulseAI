import React, { useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  BellPlus,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  AlertTriangle,
  CheckCircle2,
  X,
  Clock,
} from 'lucide-react';
import type { TradingSignal } from '../utils/quant';
import { formatSignalDateTime } from '../utils/signals';

interface AiSignalPanelProps {
  signal: TradingSignal | null;
  loading: boolean;
  error?: string | null;
  onDismissError?: () => void;
  kieModel: string;
  onKieModelChange: (model: string) => void;
  onGenerateSignal: () => void;
  onCreateAlertFromLevel: (
    symbol: string,
    targetPrice: number,
    condition: 'PRICE_ABOVE' | 'PRICE_BELOW',
    note: string
  ) => void;
}

export const AiSignalPanel: React.FC<AiSignalPanelProps> = ({
  signal,
  loading,
  error,
  onDismissError,
  kieModel,
  onKieModelChange,
  onGenerateSignal,
  onCreateAlertFromLevel,
}) => {
  const [accountBalance, setAccountBalance] = useState<number>(10000);
  const [riskPercent, setRiskPercent] = useState<number>(1.5);
  const [confirmRequested, setConfirmRequested] = useState<boolean>(false);

  const formatPrice = (p: number | undefined | null) => {
    if (typeof p !== 'number' || isNaN(p)) return '0.00';
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(4);
    return p.toFixed(5);
  };

  if (!signal) {
    return (
      <div className="bg-[#111827] border border-slate-800 rounded-lg p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Kie.ai Automated Trading Signal</h2>
          <button
            type="button"
            onClick={() => setConfirmRequested(true)}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium bg-sky-600 hover:bg-sky-500 text-white rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {loading ? 'Calling Kie.ai API...' : 'Generate AI Signal'}
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          Select an asset and click Generate AI Signal to compute automated trade entry, stop loss, take profit targets, and order book execution insights via Kie.ai.
        </p>
      </div>
    );
  }

  // Position size & Risk calculator math
  const entry = signal.entryZone.optimal;
  const stopDist = Math.max(entry * 0.002, Math.abs(entry - signal.stopLoss));
  const dollarRisk = (accountBalance * riskPercent) / 100;
  const positionUnits = dollarRisk / stopDist;
  const positionNotionalUsdt = positionUnits * entry;
  const expectedProfitTp1 = positionUnits * Math.abs(signal.takeProfit1 - entry);
  const expectedProfitTp2 = positionUnits * Math.abs(signal.takeProfit2 - entry);

  const DirectionIcon =
    signal.direction === 'LONG'
      ? TrendingUp
      : signal.direction === 'SHORT'
      ? TrendingDown
      : Minus;

  const directionColor =
    signal.direction === 'LONG'
      ? 'text-emerald-400'
      : signal.direction === 'SHORT'
      ? 'text-rose-400'
      : 'text-amber-400';

  return (
    <div
      className={`bg-[#111827] border rounded-lg p-5 space-y-4 transition-all duration-300 ${
        signal.kieLive ? 'border-emerald-700/60 shadow-lg shadow-emerald-950/30' : 'border-slate-800'
      }`}
    >
      {/* Live Active Processing Banner */}
      {loading && (
        <div className="bg-sky-950/80 border border-sky-500/80 rounded-xl p-4.5 space-y-3 shadow-xl shadow-sky-950/60 animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="relative flex items-center justify-center p-2 rounded-lg bg-sky-900/60 border border-sky-600/60">
                <Sparkles className="w-5 h-5 text-amber-300 animate-spin" />
              </div>
              <div>
                <span className="text-sm font-bold text-sky-100 flex items-center gap-2">
                  <span>Kie.ai Neural Reasoning Engine In Flight</span>
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                </span>
                <span className="block text-xs text-slate-300 font-mono mt-0.5">
                  Target: <strong className="text-white">{signal.symbol}</strong> · Model:{' '}
                  <strong className="text-sky-300">{kieModel}</strong> · Endpoint: api.kie.ai
                </span>
              </div>
            </div>
            <span className="px-3 py-1 text-xs font-mono font-semibold bg-sky-900/90 text-sky-200 border border-sky-600 rounded-md">
              Computing Live Thesis (~4–8s)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono pt-2 border-t border-sky-800/80">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Binance 96 Klines Formatted</span>
            </div>
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Order Book Walls & Imbalance Sent</span>
            </div>
            <div className="flex items-center gap-2 text-sky-300 font-semibold animate-pulse">
              <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
              <span>Synthesizing Institutional Thesis...</span>
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && !loading && (
        <div className="bg-rose-950/80 border border-rose-600/90 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 text-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            <div>
              <span className="font-bold text-rose-200 block text-sm">Kie.ai Execution Notice</span>
              <p className="text-slate-200 mt-0.5">{error}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onGenerateSignal}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-md text-xs font-bold transition-colors shadow-sm"
            >
              Retry Kie.ai Request
            </button>
            {onDismissError && (
              <button
                type="button"
                onClick={onDismissError}
                className="p-1.5 text-slate-400 hover:text-slate-200 rounded-md hover:bg-slate-800 transition-colors"
                title="Dismiss error"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Manual Confirmation Prompt Dialog */}
      {confirmRequested && (
        <div className="bg-sky-950/70 border border-sky-600 rounded-xl p-4.5 space-y-3 animate-in fade-in duration-200 shadow-xl shadow-sky-950/50">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-200 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span>Confirm Kie.ai Execution ({kieModel})</span>
            </span>
            <span className="text-[11px] font-mono text-amber-300 bg-amber-950/70 px-2 py-0.5 rounded border border-amber-800">
              Consumes Kie.ai API Credits (~0.1 to 0.33)
            </span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            Send real-time Binance snapshot of <strong className="text-white">{signal.symbol}</strong> ($
            <strong className="text-white">{formatPrice(entry)}</strong>) to Kie.ai for deep AI thesis, order book analysis, and structural reasoning?
          </p>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => {
                setConfirmRequested(false);
                onGenerateSignal();
              }}
              className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md shadow-sky-950"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>✓ Confirm & Run Kie.ai</span>
            </button>
            <button
              type="button"
              onClick={() => setConfirmRequested(false)}
              className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Header & Credit Conservation Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-slate-800/80">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-100">Quantitative AI Trading Signal</span>
            <span aria-hidden="true">·</span>
            {signal.kieLive ? (
              <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold bg-emerald-950/80 px-2.5 py-0.5 rounded border border-emerald-700 shadow-sm shadow-emerald-950">
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>Kie.ai Live Connected</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-sky-400 font-medium bg-sky-950/50 px-2 py-0.5 rounded border border-sky-800/60">
                <Zap className="w-3 h-3" />
                <span>Instant Quant Engine (0 Credits Used)</span>
              </span>
            )}
            <span aria-hidden="true">·</span>
            <span className="font-mono text-slate-300">{signal.modelUsed}</span>
            {typeof signal.kieCredits === 'number' && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                  Credits Used: {signal.kieCredits}
                </span>
              </>
            )}
            {signal.timestamp && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1 text-slate-300 font-mono text-[11px]">
                  <Clock className="w-3 h-3 text-sky-400" />
                  <span>{formatSignalDateTime(signal.timestamp)}</span>
                </span>
              </>
            )}
          </div>
          <h3 className="text-base font-semibold text-slate-100 mt-1.5 flex items-center gap-2">
            <DirectionIcon className={`w-4 h-4 ${directionColor}`} />
            <span>{signal.summaryHeadline}</span>
          </h3>
        </div>

        {/* Model Selector & Action Button */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Model Selector */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="kie-model-select" className="text-[11px] text-slate-400 font-mono">
              Model:
            </label>
            <select
              id="kie-model-select"
              aria-label="Kie.ai Model"
              value={kieModel}
              onChange={(e) => onKieModelChange(e.target.value)}
              className="px-2.5 py-1 text-xs font-mono bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="gpt-5-2">gpt-5-2 (Fast & Economical)</option>
              <option value="claude-haiku-4-5">claude-haiku-4-5</option>
              <option value="claude-sonnet-4-5">claude-sonnet-4-5</option>
            </select>
          </div>

          {/* Manual Run / Refresh Button */}
          <button
            type="button"
            onClick={() => setConfirmRequested(true)}
            disabled={loading}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 shadow-sm ${
              loading
                ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                : signal.kieLive
                ? 'bg-emerald-900/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-700/80 shadow-emerald-950'
                : 'bg-sky-600 hover:bg-sky-500 text-white shadow-sky-950'
            }`}
          >
            {loading ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            )}
            <span>
              {loading
                ? 'Calling Kie.ai...'
                : signal.kieLive
                ? 'Refresh Kie.ai Thesis'
                : `Run Kie.ai AI (${kieModel})`}
            </span>
          </button>
        </div>
      </div>

      {/* Primary Execution Levels Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 py-4 border-b border-slate-800/80 font-mono tabular-nums">
        <div>
          <span className="text-xs font-sans text-slate-400 block">Signal Bias & Conf.</span>
          <span className={`text-sm font-bold ${directionColor}`}>
            {signal.direction === 'NEUTRAL_WAIT' ? 'HOLD / RANGE' : signal.direction} · {signal.confidence}%
          </span>
        </div>
        <div>
          <span className="text-xs font-sans text-slate-400 block">Optimal Entry Zone</span>
          <span className="text-sm font-semibold text-slate-100">
            ${formatPrice(signal.entryZone.min)} – ${formatPrice(signal.entryZone.max)}
          </span>
        </div>
        <div>
          <span className="text-xs font-sans text-slate-400 block">Take Profit 1 / 2</span>
          <span className="text-sm font-semibold text-emerald-400">
            ${formatPrice(signal.takeProfit1)} / ${formatPrice(signal.takeProfit2)}
          </span>
        </div>
        <div>
          <span className="text-xs font-sans text-slate-400 block">Stop Loss (Invalidation)</span>
          <span className="text-sm font-semibold text-rose-400">
            ${formatPrice(signal.stopLoss)}
          </span>
        </div>
        <div>
          <span className="text-xs font-sans text-slate-400 block">Risk / Reward Ratio</span>
          <span className="text-sm font-semibold text-sky-400">
            1 : {signal.riskRewardRatio} ({signal.recommendedLeverage})
          </span>
        </div>
      </div>

      {/* AI Narrative Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-4 border-b border-slate-800/80 text-xs leading-relaxed">
        <div>
          <h4 className="font-semibold text-slate-200 mb-1">Technical & Moving Average Thesis</h4>
          <p className="text-slate-400">{signal.technicalThesis}</p>
        </div>
        <div>
          <h4 className="font-semibold text-slate-200 mb-1">Market Structure Shift</h4>
          <p className="text-slate-400">{signal.structureRationale}</p>
        </div>
        <div>
          <h4 className="font-semibold text-slate-200 mb-1">Order Book Depth Execution</h4>
          <p className="text-slate-400">{signal.orderBookInsight}</p>
        </div>
      </div>

      {/* Interactive Position Size & Trade Possibility Simulator */}
      <div className="pt-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label
              htmlFor="account-balance-input"
              className="block text-xs text-slate-400 mb-1"
            >
              Account Equity (USDT)
            </label>
            <input
              id="account-balance-input"
              type="number"
              min={100}
              step={500}
              value={accountBalance}
              onChange={(e) => setAccountBalance(Math.max(100, Number(e.target.value) || 0))}
              className="w-32 px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label
              htmlFor="risk-pct-input"
              className="block text-xs text-slate-400 mb-1"
            >
              Risk Per Trade (%)
            </label>
            <input
              id="risk-pct-input"
              type="number"
              min={0.25}
              max={10}
              step={0.25}
              value={riskPercent}
              onChange={(e) =>
                setRiskPercent(Math.min(20, Math.max(0.1, Number(e.target.value) || 0.5)))
              }
              className="w-24 px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-700 rounded text-slate-100 focus:outline-none focus:border-sky-500"
            />
          </div>

          <div className="text-xs font-mono tabular-nums space-y-0.5">
            <div className="text-slate-400">
              Position Size:{' '}
              <strong className="text-slate-100">
                ${Math.round(positionNotionalUsdt).toLocaleString()}
              </strong>{' '}
              ({positionUnits.toFixed(3)} {signal.symbol.replace('USDT', '')})
            </div>
            <div className="text-slate-400">
              Risk: <strong className="text-rose-400">-${dollarRisk.toFixed(0)}</strong> · Est. TP1:{' '}
              <strong className="text-emerald-400">+${expectedProfitTp1.toFixed(0)}</strong> · Est. TP2:{' '}
              <strong className="text-emerald-400">+${expectedProfitTp2.toFixed(0)}</strong>
            </div>
          </div>
        </div>

        {/* One-Click Alert Creation from AI Levels */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              onCreateAlertFromLevel(
                signal.symbol,
                signal.takeProfit1,
                signal.takeProfit1 >= entry ? 'PRICE_ABOVE' : 'PRICE_BELOW',
                `AI TP1 Target (${signal.direction})`
              )
            }
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <BellPlus className="w-3.5 h-3.5 text-emerald-400" />
            <span>Alert at AI TP1</span>
          </button>

          <button
            type="button"
            onClick={() =>
              onCreateAlertFromLevel(
                signal.symbol,
                signal.stopLoss,
                signal.stopLoss <= entry ? 'PRICE_BELOW' : 'PRICE_ABOVE',
                `AI Stop-Loss Guard (${signal.direction})`
              )
            }
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            <BellPlus className="w-3.5 h-3.5 text-rose-400" />
            <span>Alert at Stop Loss</span>
          </button>
        </div>
      </div>
    </div>
  );
};
