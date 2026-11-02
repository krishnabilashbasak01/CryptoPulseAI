/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search,
  Sparkles,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  Activity,
  Layers,
  History,
  Compass,
  ShieldCheck,
  Zap,
  X,
  Cpu,
  Bell,
  ChevronRight,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import {
  analyzeMarketStructure,
  analyzeOrderBookDepth,
  synthesizeQuantSignal,
  evaluateAlerts,
  type CryptoTicker,
  type Candle,
  type OrderBookAnalysis,
  type TradingSignal,
  type PriceAlert,
  type TriggeredAlertEvent,
} from './utils/quant';
import { getLatest4HFractalLevels, type FourHourFractalLevels, type FractalTradeSignal } from './utils/fractal';
import { CandleChart } from './components/CandleChart';
import { OrderBookPanel } from './components/OrderBookPanel';
import { AiSignalPanel } from './components/AiSignalPanel';
import { AlertsManager } from './components/AlertsManager';
import { FractalScannerPanel } from './components/FractalScannerPanel';
import { UnifiedSignalsPanel } from './components/UnifiedSignalsPanel';
import {
  SEED_UNIFIED_SIGNALS,
  syncAndMergeAllSignals,
  convertFractalSignalToUnified,
  convertTradingSignalToUnified,
  deleteSignalFromStorage,
  purgeInactiveSignalsFromStorage,
  clearAllSignalsStorage,
  evaluateSignalsAgainstMarketPrices,
  type UnifiedSignal,
} from './utils/signals';
import { ErrorBoundary } from './components/ErrorBoundary';

const INITIAL_ALERTS: PriceAlert[] = [
  {
    id: 'init-1',
    symbol: 'SOLUSDT',
    condition: 'PCT_CHANGE_ABOVE',
    threshold: 8.5,
    createdAt: new Date().toISOString(),
    triggered: false,
    note: 'High volume breakout watch',
  },
  {
    id: 'init-2',
    symbol: 'SUIUSDT',
    condition: 'VOLATILITY_ABOVE',
    threshold: 14.0,
    createdAt: new Date().toISOString(),
    triggered: false,
    note: 'Volatility expansion alert',
  },
  {
    id: 'init-3',
    symbol: 'BTCUSDT',
    condition: 'PCT_CHANGE_ABOVE',
    threshold: 4.0,
    createdAt: new Date().toISOString(),
    triggered: false,
    note: 'Momentum continuation',
  },
];

type ScannerFilterMode = 'ALL' | 'GAINERS' | 'HIGH_VOLATILITY' | 'PULLBACKS';
type SortField = 'quoteVolume' | 'priceChangePercent' | 'volatilityRatio' | 'volumeSpikeScore';

export default function App() {
  const [tickers, setTickers] = useState<CryptoTicker[]>([]);
  const [feedSource, setFeedSource] = useState<string>('binance-live');
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('SOLUSDT');
  const [interval, setIntervalState] = useState<string>('1h');

  // Scanner filter & sort state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<ScannerFilterMode>('ALL');
  const [minVolumeMillions, setMinVolumeMillions] = useState<number>(50);
  const [sortField, setSortField] = useState<SortField>('quoteVolume');
  const [sortDesc, setSortDesc] = useState<boolean>(true);

  // Selected coin detailed data
  const [candles, setCandles] = useState<Candle[]>([]);
  const [orderBook, setOrderBook] = useState<OrderBookAnalysis>(() =>
    analyzeOrderBookDepth([['214.5', '120']], [['214.7', '90']], 214.6)
  );
  const [aiSignal, setAiSignal] = useState<TradingSignal | null>(null);
  const [signalLoading, setSignalLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [kieModel, setKieModel] = useState<string>('gpt-5-2');
  const [aiConfirmModalOpen, setAiConfirmModalOpen] = useState<boolean>(false);

  // Terminal Navigation View State: Dedicated Workspaces
  type TerminalTab = 'TERMINAL' | 'FRACTAL' | 'AI_QUANT' | 'SIGNALS' | 'ALERTS';
  const [terminalTab, setTerminalTab] = useState<TerminalTab>('TERMINAL');

  // Unified Signals Ledger Hub State (Rule 6 + User Request: Separate all signals with strategy & AI decision)
  const [unifiedSignals, setUnifiedSignals] = useState<UnifiedSignal[]>(() => {
    return syncAndMergeAllSignals();
  });

  // Re-sync on storage change or mount
  useEffect(() => {
    const handleStorage = () => {
      setUnifiedSignals(syncAndMergeAllSignals(tickers));
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [tickers]);

  // Automated Real-Time Signal Lifecycle Tracking against live Binance market prices
  useEffect(() => {
    if (tickers.length === 0) return;
    setUnifiedSignals((prev) => {
      const { updatedSignals, hasChanges } = evaluateSignalsAgainstMarketPrices(prev, tickers);
      if (hasChanges) {
        try {
          localStorage.setItem('vp_unified_signals_ledger', JSON.stringify(updatedSignals));
        } catch {
          // ignore storage error
        }
        return updatedSignals;
      }
      return prev;
    });
  }, [tickers]);

  // Persistent storage for Unified Signals Ledger
  useEffect(() => {
    try {
      localStorage.setItem('vp_unified_signals_ledger', JSON.stringify(unifiedSignals));
    } catch {
      // ignore storage error
    }
  }, [unifiedSignals]);

  // Synchronized fractal signals list for FractalScannerPanel
  const fractalSignalsForPanel: FractalTradeSignal[] = useMemo(() => {
    return unifiedSignals
      .filter((s) => s.strategyId === 'WILLIAMS_FRACTAL_SWEEP')
      .map((s) => ({
        id: s.id,
        symbol: s.symbol,
        timestamp: s.timestamp,
        timeString: s.timeString,
        direction: s.direction as 'LONG' | 'SHORT',
        setupType:
          s.direction === 'LONG'
            ? '4H_LOW_SWEEP_BULLISH_ENGULF'
            : '4H_HIGH_SWEEP_BEARISH_ENGULF',
        timeframe: (s.timeframe.includes('1m') ? '1m' : '5m') as '5m' | '1m',
        fourHourLevel: s.entryPrice,
        fourHourLevelType: s.direction === 'LONG' ? '4H_SWING_LOW' : '4H_SWING_HIGH',
        entryPrice: s.entryPrice,
        stopLoss: s.stopLoss,
        riskAmount: s.riskAmount,
        riskPercent: s.riskPercent,
        tp1: s.tp1,
        tp2: s.tp2,
        tp3: s.tp3,
        tp1Ratio: 2.0,
        tp2Ratio: 3.0,
        tp3Ratio: 4.0,
        tp1Allocation: 0.5,
        tp2Allocation: 0.25,
        tp3Allocation: 0.25,
        strongnessScore: s.confidenceScore,
        strongnessTier: (s.strongnessTier === 'NEUTRAL' ? 'NONE' : s.strongnessTier) as any,
        strongnessFactors: s.keyFactors,
        status: s.status as any,
        exitPrice: s.exitPrice,
        realizedR: s.realizedR,
      }));
  }, [unifiedSignals]);

  // Williams Fractal Strategy States
  const [candles4H, setCandles4H] = useState<Candle[]>([]);
  const [candlesLTF, setCandlesLTF] = useState<Candle[]>([]);
  const [ltfInterval, setLtfInterval] = useState<'5m' | '1m'>('5m');

  // Alerts state
  const [alerts, setAlerts] = useState<PriceAlert[]>(INITIAL_ALERTS);
  const [triggeredFeed, setTriggeredFeed] = useState<TriggeredAlertEvent[]>([]);
  const [toastBanner, setToastBanner] = useState<string | null>(null);

  const requestLiveKieSignal = useCallback(
    async (params: {
      symbol: string;
      price: number;
      change24h: number;
      candles: Candle[];
      orderBook: OrderBookAnalysis | null;
      model: string;
      forceRefresh?: boolean;
      showToast?: boolean;
    }) => {
      setSignalLoading(true);
      setAiError(null);
      if (params.showToast) {
        setToastBanner(`Connecting to Kie.ai (${params.model}) for ${params.symbol}...`);
      }
      try {
        const res = await fetch('/api/ai-signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: params.symbol,
            price: params.price,
            change24h: params.change24h,
            candles: params.candles,
            orderBook: params.orderBook,
            kieModel: params.model,
            forceRefresh: params.forceRefresh ?? true,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const errMsg = errData.error || `Server responded with status ${res.status}`;
          setAiError(errMsg);
          setToastBanner(`Kie.ai notice: ${errMsg}`);
          return;
        }

        const data = await res.json();
        if (data.signal) {
          setAiSignal(data.signal);
          setAiError(null);

          // Automatically record live signal into Unified Signals Ledger
          const unified = convertTradingSignalToUnified(data.signal);
          setUnifiedSignals((prev) => [unified, ...prev.filter((s) => s.id !== unified.id)].slice(0, 50));

          const creditsStr = typeof data.signal.kieCredits === 'number' ? ` · ${data.signal.kieCredits} credits` : '';
          if (params.showToast) {
            setToastBanner(
              `✓ Kie.ai Signal (${data.signal.modelUsed}) for ${params.symbol}: ${data.signal.direction} (${data.signal.confidence}% confidence)${creditsStr}`
            );
          }
        } else {
          setAiError('No signal data returned from Kie.ai endpoint');
        }
      } catch (err: any) {
        const msg = err?.message || 'Failed to connect to Kie.ai server';
        setAiError(msg);
        setToastBanner(`Network error: ${msg}`);
      } finally {
        setSignalLoading(false);
      }
    },
    []
  );

  const fetchTickers = useCallback(async () => {
    try {
      const res = await fetch('/api/market/tickers');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.tickers) && data.tickers.length > 0) {
        setTickers(data.tickers);
        setFeedSource(data.source || 'binance-live');
        setLastUpdated(
          new Date(data.updatedAt || Date.now()).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })
        );
      }
    } catch (_err) {
      // Keep existing state on transient error
    }
  }, []);

  const fetchSelectedCoinDetails = useCallback(
    async (symbol: string, tf: string, autoSynthesizeSignal = false) => {
      try {
        const [klinesRes, depthRes] = await Promise.all([
          fetch(`/api/market/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(tf)}&limit=96`),
          fetch(`/api/market/depth?symbol=${encodeURIComponent(symbol)}&limit=20`),
        ]);

        let nextCandles: Candle[] = [];
        let nextOrderBook: OrderBookAnalysis | null = null;

        if (klinesRes.ok) {
          const kData = await klinesRes.json();
          if (Array.isArray(kData.candles)) {
            nextCandles = kData.candles;
            setCandles(nextCandles);
          }
        }

        const currentPrice =
          nextCandles[nextCandles.length - 1]?.close ??
          tickers.find((t) => t.symbol === symbol)?.lastPrice ??
          100;

        if (depthRes.ok) {
          const dData = await depthRes.json();
          if (Array.isArray(dData.bids) && Array.isArray(dData.asks)) {
            nextOrderBook = analyzeOrderBookDepth(dData.bids, dData.asks, currentPrice);
            setOrderBook(nextOrderBook);
          }
        }

        if (autoSynthesizeSignal && nextCandles.length > 0) {
          const matchedTicker = tickers.find((t) => t.symbol === symbol);
          const ob = nextOrderBook ?? analyzeOrderBookDepth([], [], currentPrice);
          const baseline = synthesizeQuantSignal({
            symbol,
            price: currentPrice,
            change24h: matchedTicker?.priceChangePercent ?? 4.5,
            candles: nextCandles,
            orderBook: ob,
            modelUsed: `Instant Quant Engine`,
          });
          setAiSignal(baseline);
        }
      } catch (_err) {
        // Keep existing state
      }
    },
    [tickers]
  );

  // Initial load & live polling (every 8s in normal browser, disabled continuous polling in headless if not needed)
  useEffect(() => {
    fetchTickers();
    const isHeadless =
      typeof navigator !== 'undefined' &&
      (navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent));
    if (isHeadless) return;

    const timer = window.setInterval(fetchTickers, 8000);
    return () => window.clearInterval(timer);
  }, [fetchTickers]);

  const fetchFractalCandles = useCallback(async (sym: string, ltf: '5m' | '1m') => {
    try {
      const [res4H, resLTF] = await Promise.all([
        fetch(`/api/market/klines?symbol=${encodeURIComponent(sym)}&interval=4h&limit=120`),
        fetch(`/api/market/klines?symbol=${encodeURIComponent(sym)}&interval=${encodeURIComponent(ltf)}&limit=120`),
      ]);
      if (res4H.ok) {
        const d4 = await res4H.json();
        if (Array.isArray(d4.candles)) setCandles4H(d4.candles);
      }
      if (resLTF.ok) {
        const dL = await resLTF.json();
        if (Array.isArray(dL.candles)) setCandlesLTF(dL.candles);
      }
    } catch {
      // ignore
    }
  }, []);

  // Load selected coin klines & depth whenever symbol or interval changes
  useEffect(() => {
    fetchSelectedCoinDetails(selectedSymbol, interval, true);
    fetchFractalCandles(selectedSymbol, ltfInterval);
  }, [selectedSymbol, interval, ltfInterval, fetchSelectedCoinDetails, fetchFractalCandles]);

  // Evaluate alerts whenever tickers update
  useEffect(() => {
    if (tickers.length === 0) return;
    setAlerts((prevAlerts) => {
      const { updatedAlerts, newlyTriggered } = evaluateAlerts(prevAlerts, tickers);
      if (newlyTriggered.length > 0) {
        setTriggeredFeed((prevFeed) => [...newlyTriggered, ...prevFeed].slice(0, 20));
        setToastBanner(newlyTriggered[0].message);
      }
      return updatedAlerts;
    });
  }, [tickers]);

  const selectedTicker: CryptoTicker = useMemo(() => {
    const found = tickers.find((t) => t.symbol === selectedSymbol);
    if (found) return found;
    return (
      tickers[0] ?? {
        symbol: selectedSymbol,
        baseAsset: selectedSymbol.replace(/USDT$/, ''),
        quoteAsset: 'USDT',
        lastPrice: candles[candles.length - 1]?.close ?? 214.65,
        priceChange: 19.2,
        priceChangePercent: 9.84,
        highPrice: 221.4,
        lowPrice: 198.2,
        volume: 9040000,
        quoteVolume: 1940000000,
        weightedAvgPrice: 210.5,
        count: 1185000,
        volatilityRatio: 11.2,
        volumeSpikeScore: 91,
      }
    );
  }, [tickers, selectedSymbol, candles]);

  const structure = useMemo(() => analyzeMarketStructure(candles), [candles]);

  const fourHourLevels: FourHourFractalLevels = useMemo(() => {
    return getLatest4HFractalLevels(candles4H, selectedSymbol, 2);
  }, [candles4H, selectedSymbol]);

  // Filtered and sorted high-volume assets
  const filteredTickers = useMemo(() => {
    const q = searchQuery.trim().toUpperCase();
    return tickers
      .filter((t) => {
        if (q && !t.symbol.includes(q) && !t.baseAsset.includes(q)) return false;
        if (t.quoteVolume < minVolumeMillions * 1_000_000) return false;
        if (filterMode === 'GAINERS' && t.priceChangePercent < 4.0) return false;
        if (filterMode === 'HIGH_VOLATILITY' && t.volatilityRatio < 8.0) return false;
        if (filterMode === 'PULLBACKS' && t.priceChangePercent >= 0) return false;
        return true;
      })
      .sort((a, b) => {
        const diff = a[sortField] - b[sortField];
        return sortDesc ? -diff : diff;
      });
  }, [tickers, searchQuery, minVolumeMillions, filterMode, sortField, sortDesc]);

  const handleGenerateAiSignal = async () => {
    setTerminalTab('AI_QUANT');
    await requestLiveKieSignal({
      symbol: selectedTicker.symbol,
      price: selectedTicker.lastPrice,
      change24h: selectedTicker.priceChangePercent,
      candles,
      orderBook: orderBook ?? analyzeOrderBookDepth([], [], selectedTicker.lastPrice),
      model: kieModel,
      forceRefresh: true,
      showToast: true,
    });
  };

  const handleTopGenerateAiSignal = () => {
    setAiConfirmModalOpen(true);
  };

  const handleAddAlert = (newAlert: Omit<PriceAlert, 'id' | 'createdAt' | 'triggered'>) => {
    const created: PriceAlert = {
      ...newAlert,
      id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      triggered: false,
    };
    setAlerts((prev) => [created, ...prev]);
    setToastBanner(`Alert created for ${created.symbol} (${created.condition} ${created.threshold})`);
  };

  const handleCreateAlertFromLevel = (
    symbol: string,
    targetPrice: number,
    condition: 'PRICE_ABOVE' | 'PRICE_BELOW',
    note: string
  ) => {
    handleAddAlert({
      symbol,
      condition,
      threshold: targetPrice,
      note,
    });
  };

  const handleDeleteSignal = (id: string) => {
    setUnifiedSignals((prev) => deleteSignalFromStorage(id, prev));
    setToastBanner('Signal removed from repository');
  };

  const handlePurgeInactive = () => {
    setUnifiedSignals((prev) => {
      const purged = purgeInactiveSignalsFromStorage(prev);
      const count = prev.length - purged.length;
      setToastBanner(`Purged ${count} inactive/historical setup${count === 1 ? '' : 's'} from repository`);
      return purged;
    });
  };

  const handleClearLedger = () => {
    clearAllSignalsStorage();
    setUnifiedSignals(syncAndMergeAllSignals());
    setToastBanner('Signals repository reset to default active setups');
  };

  const handleSortToggle = (field: SortField) => {
    if (sortField === field) {
      setSortDesc((v) => !v);
    } else {
      setSortField(field);
      setSortDesc(true);
    }
  };

  const formatPrice = (p: number | undefined | null) => {
    if (typeof p !== 'number' || isNaN(p)) return '0.00';
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(4);
    return p.toFixed(5);
  };

  const formatVolume = (v: number | undefined | null) => {
    if (typeof v !== 'number' || isNaN(v)) return '$0';
    if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    return `$${(v / 1_000).toFixed(0)}K`;
  };

  return (
    <div className="min-h-screen bg-[#0b101b] text-slate-100 flex flex-col">
      {/* Unified Top Navigation Header */}
      <header className="flex items-center justify-between gap-4 px-6 py-3 border-b border-slate-800 bg-[#0b101b]">
        <div className="flex items-center gap-3">
          <a
            href="#top"
            className="text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0 flex items-center gap-2"
          >
            <Activity className="w-5 h-5 text-sky-400" />
            <span>VeloceQuant</span>
          </a>
          <div className="hidden lg:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-800/60 text-[10px] font-mono text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Binance Spot Live</span>
          </div>
        </div>

        {/* Primary Workspace Navigation Tabs */}
        <nav
          aria-label="Primary Terminal Navigation"
          className="hidden md:flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800 text-xs font-medium"
        >
          <button
            type="button"
            onClick={() => setTerminalTab('TERMINAL')}
            className={`px-3.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              terminalTab === 'TERMINAL'
                ? 'bg-sky-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Market Terminal</span>
          </button>

          <button
            type="button"
            onClick={() => setTerminalTab('FRACTAL')}
            className={`px-3.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              terminalTab === 'FRACTAL'
                ? 'bg-sky-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Williams Fractal Strategy</span>
          </button>

          <button
            type="button"
            onClick={() => setTerminalTab('AI_QUANT')}
            className={`px-3.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              terminalTab === 'AI_QUANT'
                ? 'bg-sky-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
            <span>AI Signal & Quant Thesis</span>
          </button>

          <button
            type="button"
            onClick={() => setTerminalTab('SIGNALS')}
            className={`px-3.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              terminalTab === 'SIGNALS'
                ? 'bg-sky-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
            <span>Signals Hub & Ledger ({unifiedSignals.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setTerminalTab('ALERTS')}
            className={`px-3.5 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${
              terminalTab === 'ALERTS'
                ? 'bg-sky-600 text-white font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Bell className="w-3.5 h-3.5 text-emerald-400" />
            <span>Price Alerts ({alerts.filter((a) => !a.triggered).length})</span>
          </button>
        </nav>

        {/* Global AI Credit Status & Quick Execution Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div
            className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono border ${
              aiSignal?.kieLive
                ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                : 'bg-slate-900 border-slate-800 text-slate-300'
            }`}
            title="Current AI Signal Engine Status"
          >
            {aiSignal?.kieLive ? (
              <>
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <span>Kie.ai Live Connected</span>
              </>
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 text-sky-400" />
                <span>Instant Quant (0 Credits)</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleTopGenerateAiSignal}
            disabled={signalLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-md shadow-sky-950"
            title="Generate deep AI trading thesis and order book analysis using Kie.ai"
          >
            {signalLoading ? (
              <RefreshCw className="w-3.5 h-3.5 text-amber-300 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            )}
            <span>{signalLoading ? 'Calling Kie.ai...' : 'Run Kie.ai Thesis'}</span>
          </button>
        </div>
      </header>

      {/* Live Alert Notification Banner (if triggered) */}
      {toastBanner && (
        <div
          role="status"
          className="bg-slate-900 border-b border-slate-800 px-6 py-2 flex items-center justify-between text-xs font-mono"
        >
          <div className="flex items-center gap-2 text-slate-200">
            <Activity className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>{toastBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastBanner(null)}
            className="text-slate-400 hover:text-slate-200 font-sans text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Workspace Container */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Selected Asset Full-Width KPI Performance Strip */}
        <section
          aria-label="Selected Asset Performance Metrics"
          className="bg-[#111827] border border-slate-800 rounded-lg p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Selected High-Volume Asset</span>
                <span aria-hidden="true">·</span>
                <span>Feed: {feedSource === 'binance-live' ? 'Binance Spot REST API' : 'Binance Mirror Stream'}</span>
                {lastUpdated && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">Updated {lastUpdated}</span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-baseline gap-4 mt-1">
                <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                  {selectedTicker.baseAsset}/USDT
                </h1>
                <span className="text-2xl font-mono font-bold tabular-nums text-slate-100">
                  ${formatPrice(selectedTicker.lastPrice)}
                </span>
                <span
                  className={`text-sm font-mono font-semibold tabular-nums flex items-center gap-1 ${
                    (selectedTicker.priceChangePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {(selectedTicker.priceChangePercent ?? 0) >= 0 ? (
                    <TrendingUp className="w-4 h-4" />
                  ) : (
                    <TrendingDown className="w-4 h-4" />
                  )}
                  {(selectedTicker.priceChangePercent ?? 0) >= 0 ? '+' : ''}
                  {Number(selectedTicker.priceChangePercent ?? 0).toFixed(2)}% (24h)
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono tabular-nums text-slate-400">
              <span>24h High: <strong className="text-slate-200">${formatPrice(selectedTicker.highPrice)}</strong></span>
              <span aria-hidden="true">·</span>
              <span>24h Low: <strong className="text-slate-200">${formatPrice(selectedTicker.lowPrice)}</strong></span>
              <span aria-hidden="true">·</span>
              <span>VWAP: <strong className="text-slate-200">${formatPrice(selectedTicker.weightedAvgPrice)}</strong></span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 pt-4 font-mono tabular-nums">
            <div>
              <span className="text-xs font-sans text-slate-400 block">24h Quote Volume</span>
              <span className="text-sm font-semibold text-slate-100">
                {formatVolume(selectedTicker.quoteVolume)}
              </span>
              <span className="text-[11px] text-slate-400 block">
                {Number(selectedTicker.count ?? 0).toLocaleString()} trades
              </span>
            </div>

            <div>
              <span className="text-xs font-sans text-slate-400 block">Previous Trend</span>
              <span className="text-sm font-semibold text-slate-100">{structure.previousTrend}</span>
              <span className="text-[11px] text-slate-400 block">
                Now: {structure.currentTrend}
              </span>
            </div>

            <div>
              <span className="text-xs font-sans text-slate-400 block">Market Structure</span>
              <span
                className={`text-sm font-semibold ${
                  structure.structureState.includes('BULLISH')
                    ? 'text-emerald-400'
                    : structure.structureState.includes('BEARISH')
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }`}
              >
                {structure.structureState.replace('_', ' ')}
              </span>
              <span className="text-[11px] text-slate-400 block font-sans truncate">
                {structure.maAlignment.replace('_', ' ')}
              </span>
            </div>

            <div>
              <span className="text-xs font-sans text-slate-400 block">Current Volatility</span>
              <span className="text-sm font-semibold text-slate-100">
                {structure.volatilityRegime} ({structure.atrPercent}% ATR)
              </span>
              <span className="text-[11px] text-slate-400 block">
                24h Range: {selectedTicker.volatilityRatio}%
              </span>
            </div>

            <div>
              <span className="text-xs font-sans text-slate-400 block">Order Book Depth Skew</span>
              <span
                className={`text-sm font-semibold ${
                  orderBook.imbalancePercent > 5
                    ? 'text-emerald-400'
                    : orderBook.imbalancePercent < -5
                    ? 'text-rose-400'
                    : 'text-slate-200'
                }`}
              >
                {orderBook.imbalancePercent > 0 ? '+' : ''}
                {orderBook.imbalancePercent}% Imbalance
              </span>
              <span className="text-[11px] text-slate-400 block font-sans">
                {orderBook.pressureState.replace(/_/g, ' ')}
              </span>
            </div>

            <div>
              <span className="text-xs font-sans text-slate-400 block flex items-center gap-1.5">
                <span>Signal Engine</span>
                {aiSignal?.kieLive ? (
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/70 px-1.5 py-0.5 rounded border border-emerald-800 font-mono">
                    Kie.ai Live
                  </span>
                ) : (
                  <span className="text-[10px] text-sky-400 bg-sky-950/70 px-1.5 py-0.5 rounded border border-sky-800 font-mono">
                    Quant (0 Credits)
                  </span>
                )}
              </span>
              <span
                className={`text-sm font-semibold ${
                  aiSignal?.direction === 'LONG'
                    ? 'text-emerald-400'
                    : aiSignal?.direction === 'SHORT'
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }`}
              >
                {aiSignal
                  ? `${aiSignal.direction === 'NEUTRAL_WAIT' ? 'HOLD / RANGE' : aiSignal.direction} (${aiSignal.confidence}%)`
                  : 'Ready'}
              </span>
              <span className="text-[11px] text-slate-400 block font-mono">
                R:R 1:{aiSignal?.riskRewardRatio ?? '2.4'} · {aiSignal?.modelUsed ?? 'Local Engine'}
              </span>
            </div>
          </div>
        </section>

        {/* Workspace Views */}

        {/* Workspace View 2: Williams Fractal Strategy Suite */}
        {terminalTab === 'FRACTAL' && (
          <div className="space-y-5">
            <section id="fractal-chart-section">
              <CandleChart
                symbol={selectedTicker.symbol}
                interval={interval}
                onIntervalChange={setIntervalState}
                candles={candles}
                structure={structure}
                fourHourLevels={{
                  swingHigh: fourHourLevels.previousSwingHigh,
                  swingLow: fourHourLevels.previousSwingLow,
                }}
                activeSignalLevels={
                  aiSignal && aiSignal.symbol === selectedTicker.symbol
                    ? {
                        entry: aiSignal.entryZone.optimal,
                        stopLoss: aiSignal.stopLoss,
                        takeProfit1: aiSignal.takeProfit1,
                        takeProfit2: aiSignal.takeProfit2,
                      }
                    : null
                }
              />
            </section>

            <section id="fractal-strategy-section">
              <ErrorBoundary fallbackTitle="Williams Fractal Strategy Terminal">
                <FractalScannerPanel
                  selectedSymbol={selectedTicker.symbol}
                  tickers={tickers}
                  candles4H={candles4H}
                  candlesLTF={candlesLTF}
                  ltfInterval={ltfInterval}
                  onLtfIntervalChange={setLtfInterval}
                  onSelectSymbol={(sym) => setSelectedSymbol(sym)}
                  onAddAlert={handleAddAlert}
                  onRecordSignal={(fractalSig: FractalTradeSignal) => {
                    const unified = convertFractalSignalToUnified(fractalSig);
                    setUnifiedSignals((prev) => [unified, ...prev.filter((s) => s.id !== unified.id)].slice(0, 50));
                  }}
                  onNavigateToSignalsHub={() => setTerminalTab('SIGNALS')}
                  sharedSignalLedger={fractalSignalsForPanel}
                  isActive={terminalTab === 'FRACTAL'}
                />
              </ErrorBoundary>
            </section>
          </div>
        )}

        {/* Workspace View 1: Unified Market Terminal (Screener + Chart + Order Book) */}
        {terminalTab === 'TERMINAL' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column (5 cols on lg): High-Volume Crypto Screener */}
            <div className="lg:col-span-5 space-y-5">
              <section
                id="scanner-section"
                aria-label="High-Volume Crypto Scanner"
                className="bg-[#111827] border border-slate-800 rounded-lg p-5"
              >
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                      <Activity className="w-4 h-4 text-sky-400" />
                      <span>High-Volume Crypto Assets Screener</span>
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Click any asset to inspect chart, structure & order book (100% Free · 0 Credits)
                    </p>
                  </div>
                  <span className="text-xs font-mono text-slate-400 tabular-nums shrink-0">
                    {filteredTickers.length} Pairs
                  </span>
                </div>

                {/* Search & Minimum Volume Filter Controls */}
                <div className="mt-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        aria-label="Search crypto symbol"
                        placeholder="Filter coin (e.g. BTC, SOL, SUI, FET)..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-md text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    <div>
                      <label htmlFor="min-vol-select" className="sr-only">
                        Minimum 24h Volume
                      </label>
                      <select
                        id="min-vol-select"
                        aria-label="Minimum 24h Volume"
                        value={minVolumeMillions}
                        onChange={(e) => setMinVolumeMillions(Number(e.target.value))}
                        className="px-2.5 py-1.5 text-xs font-mono bg-slate-900 border border-slate-800 rounded-md text-slate-200 focus:outline-none focus:border-sky-500"
                      >
                        <option value={15}>Vol ≥ $15M</option>
                        <option value={50}>Vol ≥ $50M</option>
                        <option value={250}>Vol ≥ $250M</option>
                        <option value={500}>Vol ≥ $500M</option>
                        <option value={1000}>Vol ≥ $1B</option>
                      </select>
                    </div>
                  </div>

                  {/* Segmented Filter Tabs */}
                  <div
                    className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-md overflow-x-auto"
                    role="group"
                    aria-label="Market Momentum Filter"
                  >
                    {(
                      [
                        { id: 'ALL', label: 'All High Volume' },
                        { id: 'GAINERS', label: 'Breakouts (+4%)' },
                        { id: 'HIGH_VOLATILITY', label: 'High Volatility' },
                        { id: 'PULLBACKS', label: 'Pullbacks' },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setFilterMode(tab.id)}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                          filterMode === tab.id
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scanner Table */}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400">
                        <th className="py-2 pr-2 font-medium">Asset</th>
                        <th className="py-2 px-2 text-right font-medium">Last Price</th>
                        <th className="py-2 px-2 text-right font-medium">
                          <button
                            type="button"
                            onClick={() => handleSortToggle('priceChangePercent')}
                            className="inline-flex items-center gap-1 hover:text-slate-200 whitespace-nowrap"
                          >
                            <span>24h %</span>
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="py-2 px-2 text-right font-medium">
                          <button
                            type="button"
                            onClick={() => handleSortToggle('quoteVolume')}
                            className="inline-flex items-center gap-1 hover:text-slate-200 whitespace-nowrap"
                          >
                            <span>24h Vol</span>
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                        <th className="hidden sm:table-cell py-2 pl-2 text-right font-medium">
                          <button
                            type="button"
                            onClick={() => handleSortToggle('volatilityRatio')}
                            className="inline-flex items-center gap-1 hover:text-slate-200 whitespace-nowrap"
                          >
                            <span>Volat.</span>
                            <ArrowUpDown className="w-3 h-3" />
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 text-xs font-mono tabular-nums">
                      {filteredTickers.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 font-sans">
                            No assets match current filter criteria.{' '}
                            <button
                              type="button"
                              onClick={() => {
                                setSearchQuery('');
                                setFilterMode('ALL');
                                setMinVolumeMillions(15);
                              }}
                              className="text-sky-400 underline ml-1"
                            >
                              Reset filters
                            </button>
                          </td>
                        </tr>
                      ) : (
                        filteredTickers.map((t) => {
                          const isSelected = t.symbol === selectedSymbol;
                          const isPositive = t.priceChangePercent >= 0;
                          return (
                            <tr
                              key={t.symbol}
                              onClick={() => setSelectedSymbol(t.symbol)}
                              className={`transition-colors cursor-pointer ${
                                isSelected
                                  ? 'bg-sky-950/50 text-white'
                                  : 'hover:bg-slate-800/50 text-slate-300'
                              }`}
                            >
                              <td className="py-2.5 pr-2">
                                <button
                                  type="button"
                                  onClick={() => setSelectedSymbol(t.symbol)}
                                  className="text-left font-sans font-semibold text-slate-100 hover:text-sky-400 focus:outline-none whitespace-nowrap"
                                >
                                  {t.baseAsset}
                                  <span className="text-slate-500 font-normal">/USDT</span>
                                </button>
                              </td>
                              <td className="py-2.5 px-2 text-right text-slate-200">
                                ${formatPrice(t.lastPrice)}
                              </td>
                              <td
                                className={`py-2.5 px-2 text-right font-semibold ${
                                  isPositive ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {isPositive ? '+' : ''}
                                {t.priceChangePercent.toFixed(2)}%
                              </td>
                              <td className="py-2.5 px-2 text-right text-slate-300">
                                {formatVolume(t.quoteVolume)}
                              </td>
                              <td className="hidden sm:table-cell py-2.5 pl-2 text-right text-slate-400">
                                {t.volatilityRatio.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

            </div>

            {/* Right Column (7 cols on lg): Chart + Order Book Depth */}
            <div className="lg:col-span-7 space-y-5">
              <section id="chart-section">
                <CandleChart
                  symbol={selectedTicker.symbol}
                  interval={interval}
                  onIntervalChange={setIntervalState}
                  candles={candles}
                  structure={structure}
                  fourHourLevels={{
                    swingHigh: fourHourLevels.previousSwingHigh,
                    swingLow: fourHourLevels.previousSwingLow,
                  }}
                  activeSignalLevels={
                    aiSignal && aiSignal.symbol === selectedTicker.symbol
                      ? {
                          entry: aiSignal.entryZone.optimal,
                          stopLoss: aiSignal.stopLoss,
                          takeProfit1: aiSignal.takeProfit1,
                          takeProfit2: aiSignal.takeProfit2,
                        }
                      : null
                  }
                />
              </section>

              {/* AI Quant Quick Status Bar in Market Terminal */}
              <section id="ai-quick-status-section">
                <div className="bg-[#111827] border border-slate-800 rounded-lg p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-lg ${
                        signalLoading
                          ? 'bg-sky-950 text-sky-400 border border-sky-800 animate-pulse'
                          : aiSignal?.direction === 'LONG'
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/60'
                          : aiSignal?.direction === 'SHORT'
                          ? 'bg-rose-950/60 text-rose-400 border border-rose-800/60'
                          : 'bg-amber-950/60 text-amber-400 border border-amber-800/60'
                      }`}
                    >
                      {signalLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin text-amber-300" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-amber-300" />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-100">
                          {signalLoading
                            ? `Kie.ai Computing Neural Thesis (${kieModel})...`
                            : aiSignal
                            ? `${aiSignal.direction} (${aiSignal.confidence}%) · ${aiSignal.summaryHeadline}`
                            : 'AI Trading Signal'}
                        </span>
                        {aiSignal?.kieLive ? (
                          <span className="text-[10px] font-mono font-semibold text-emerald-300 bg-emerald-950/90 px-2 py-0.5 rounded border border-emerald-700 shadow-sm shadow-emerald-950">
                            Kie.ai Live Connected ({aiSignal.kieCredits ?? 0.33} credits)
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono text-sky-400 bg-sky-950/60 px-2 py-0.5 rounded border border-sky-800/60">
                            Instant Quant (0 Credits)
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">
                        {signalLoading
                          ? `Transmitting real-time 96-bar Binance klines and order book imbalance to Kie.ai...`
                          : aiSignal?.technicalThesis || 'Run Kie.ai Thesis for institutional multi-factor analysis'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setTerminalTab('AI_QUANT')}
                      className="text-xs font-semibold text-sky-400 hover:text-sky-300 flex items-center gap-1 px-3 py-1.5 rounded-md hover:bg-slate-800 transition-colors"
                    >
                      <span>{signalLoading ? 'View Live Progress' : 'View Full Thesis'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handleTopGenerateAiSignal}
                      disabled={signalLoading}
                      className="text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-60 px-3.5 py-1.5 rounded-md flex items-center gap-1.5 shadow-md shadow-sky-950 transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                      <span>{signalLoading ? 'Calling Kie.ai...' : 'Run Kie.ai'}</span>
                    </button>
                  </div>
                </div>
              </section>

              <section id="orderbook-section">
                <OrderBookPanel symbol={selectedTicker.symbol} orderBook={orderBook} />
              </section>
            </div>
          </div>
        )}

        {/* Workspace View 3: AI Signal & Deep Quantitative Thesis */}
        {terminalTab === 'AI_QUANT' && (
          <div className="space-y-5">
            <section id="ai-signal-section">
              <AiSignalPanel
                signal={aiSignal}
                loading={signalLoading}
                error={aiError}
                onDismissError={() => setAiError(null)}
                kieModel={kieModel}
                onKieModelChange={(nextModel) => {
                  setKieModel(nextModel);
                }}
                onGenerateSignal={handleGenerateAiSignal}
                onCreateAlertFromLevel={handleCreateAlertFromLevel}
              />
            </section>
          </div>
        )}

        {/* Workspace View 4: Unified Signals Hub & Strategy Ledger (Rule 6 + User Request) */}
        {terminalTab === 'SIGNALS' && (
          <div className="space-y-5">
            <section id="signals-ledger-section">
              <UnifiedSignalsPanel
                signals={unifiedSignals}
                selectedSymbol={selectedTicker.symbol}
                onSelectSymbol={setSelectedSymbol}
                onNavigateToTerminal={(sym) => {
                  setSelectedSymbol(sym);
                  setTerminalTab('TERMINAL');
                }}
                onNavigateToFractal={(sym) => {
                  setSelectedSymbol(sym);
                  setTerminalTab('FRACTAL');
                }}
                onNavigateToAiThesis={(sym) => {
                  setSelectedSymbol(sym);
                  setTerminalTab('AI_QUANT');
                }}
                onCreateAlert={(sym, price, cond, note) => {
                  handleCreateAlertFromLevel(sym, price, cond, note);
                }}
                onDeleteSignal={handleDeleteSignal}
                onPurgeInactive={handlePurgeInactive}
                onClearLedger={handleClearLedger}
              />
            </section>
          </div>
        )}

        {/* Workspace View 4: Centralized Price & Volatility Alerts */}
        {terminalTab === 'ALERTS' && (
          <div className="space-y-5">
            <section id="alerts-section">
              <AlertsManager
                tickers={tickers}
                selectedSymbol={selectedTicker.symbol}
                alerts={alerts}
                triggeredFeed={triggeredFeed}
                onAddAlert={handleAddAlert}
                onRemoveAlert={(id) => setAlerts((prev) => prev.filter((a) => a.id !== id))}
                onSelectSymbol={(sym) => setSelectedSymbol(sym)}
              />
            </section>
          </div>
        )}
      </main>

      {/* Global Kie.ai Manual Confirmation Modal */}
      {aiConfirmModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="bg-[#111827] border border-sky-500/50 rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl shadow-sky-950">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-sky-400 font-semibold text-sm">
                <Sparkles className="w-4 h-4" />
                <span>Confirm Kie.ai Live Execution</span>
              </div>
              <button
                type="button"
                onClick={() => setAiConfirmModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                <div>
                  <span className="text-slate-400 block text-[11px]">Selected Asset</span>
                  <span className="text-base font-bold font-mono text-white">
                    {selectedTicker.symbol}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[11px]">Current Price</span>
                  <span className="text-base font-bold font-mono text-emerald-400">
                    ${selectedTicker.lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                  </span>
                </div>
              </div>

              <div className="bg-amber-950/40 border border-amber-800/60 rounded-lg p-3 text-amber-200/90 leading-relaxed space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                  <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Kie.ai Credit Guard Active</span>
                </div>
                <p>
                  Executing this request calls the live Kie.ai LLM engine (<strong>{kieModel}</strong>) and burns external API credits (~0.09 to 0.27 credits).
                </p>
                <p className="text-slate-400 text-[11px]">
                  Tip: Zero-credit algorithmic signals, Williams Fractal Pine Script scanning, backtests, and full technical analysis are already active for free without spending credits.
                </p>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label htmlFor="modal-kie-model-select" className="text-slate-400 font-mono">
                  Target AI Model:
                </label>
                <select
                  id="modal-kie-model-select"
                  aria-label="Target AI Model"
                  value={kieModel}
                  onChange={(e) => setKieModel(e.target.value)}
                  className="px-2.5 py-1 text-xs font-mono bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-sky-500"
                >
                  <option value="gpt-5-2">kie.ai / gpt-5-2 (Fast & Economical)</option>
                  <option value="claude-haiku-4-5">kie.ai / claude-haiku-4-5</option>
                  <option value="claude-sonnet-4-5">kie.ai / claude-sonnet-4-5</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setAiConfirmModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors"
              >
                Cancel (Keep 0 Credits)
              </button>
              <button
                type="button"
                onClick={async () => {
                  setAiConfirmModalOpen(false);
                  setTerminalTab('AI_QUANT');
                  await handleGenerateAiSignal();
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 transition-colors flex items-center gap-1.5 shadow-lg shadow-sky-950"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>✓ Confirm & Run Kie.ai</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quiet Footer */}
      <footer className="mt-auto border-t border-slate-800/80 px-6 py-4 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-4">
        <span>VeloceQuant Crypto Analytics · Real-Time Market Structure & Order Book Depth</span>
        <span>Data integrated via Binance Spot API & Kie.ai Quantitative Signal Engine</span>
      </footer>
    </div>
  );
}
