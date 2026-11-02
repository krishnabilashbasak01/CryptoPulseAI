import React, { useState, useEffect, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Compass,
  Crosshair,
  DollarSign,
  Download,
  ExternalLink,
  Flame,
  HelpCircle,
  History,
  Info,
  Layers,
  Maximize2,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Timer,
  TrendingDown,
  TrendingUp,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import type { Candle, CryptoTicker, PriceAlert } from '../utils/quant';
import {
  calculateWilliamsFractals,
  getLatest4HFractalLevels,
  check4HLevelCross,
  detectEngulfingCandle,
  generateFractalTradeSignal,
  runFractalBacktest,
  type FourHourFractalLevels,
  type FractalTradeSignal,
  type BacktestSummary,
  type BacktestTrade,
  type LevelCrossStatus,
  type EngulfingDetectionResult,
} from '../utils/fractal';
import { formatSignalDateTime } from '../utils/signals';
import { FractalAgentFace3D } from './FractalAgentFace3D';

interface FractalScannerPanelProps {
  selectedSymbol: string;
  tickers: CryptoTicker[];
  candles4H: Candle[];
  candlesLTF: Candle[]; // 5m or 1m candles
  ltfInterval: '5m' | '1m';
  onLtfIntervalChange: (interval: '5m' | '1m') => void;
  onSelectSymbol: (symbol: string) => void;
  onAddAlert: (alert: Omit<PriceAlert, 'id' | 'createdAt' | 'triggered'>) => void;
  onRecordSignal?: (sig: FractalTradeSignal) => void;
  onNavigateToSignalsHub?: () => void;
  sharedSignalLedger?: FractalTradeSignal[];
  isActive?: boolean;
}

export const FractalScannerPanel: React.FC<FractalScannerPanelProps> = ({
  selectedSymbol,
  tickers,
  candles4H,
  candlesLTF,
  ltfInterval,
  onLtfIntervalChange,
  onSelectSymbol,
  onAddAlert,
  onRecordSignal,
  onNavigateToSignalsHub,
  sharedSignalLedger,
  isActive = true,
}) => {
  // Strategy settings
  const [fractalPeriods, setFractalPeriods] = useState<number>(2);
  const [activeTab, setActiveTab] = useState<'SCANNER' | 'BACKTEST' | 'LEDGER'>('SCANNER');

  // Scanner Multi-Coin State
  const [scannerItems, setScannerItems] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // Backtest State
  const [backtestResult, setBacktestResult] = useState<BacktestSummary | null>(null);
  const [isBacktesting, setIsBacktesting] = useState<boolean>(false);
  const [backtestProgress, setBacktestProgress] = useState<number>(0);
  const [backtestStage, setBacktestStage] = useState<string>('');
  const [backtestError, setBacktestError] = useState<string | null>(null);
  const [backtestCompletedNotice, setBacktestCompletedNotice] = useState<string | null>(null);
  const [selectedFailedTrade, setSelectedFailedTrade] = useState<BacktestTrade | null>(null);
  const [inspectedTrade, setInspectedTrade] = useState<BacktestTrade | null>(null);

  // Date Range and Backtest Settings
  const [dateRangePreset, setDateRangePreset] = useState<'24h' | '3d' | '7d' | '14d' | '30d' | 'custom'>('7d');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [riskPerTrade, setRiskPerTrade] = useState<number>(100);

  const [savedBacktests, setSavedBacktests] = useState<BacktestSummary[]>(() => {
    try {
      const saved = localStorage.getItem('vp_saved_fractal_backtests');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Signal Ledger State: prioritize shared synchronized signals from App.tsx
  const [localSignalLedger, setLocalSignalLedger] = useState<FractalTradeSignal[]>(() => {
    try {
      const saved = localStorage.getItem('vp_fractal_signal_ledger');
      if (!saved) return [];
      const parsed: FractalTradeSignal[] = JSON.parse(saved);
      // Strictly purge low-grade signals (Tier B+ or score < 72)
      const highGradeOnly = Array.isArray(parsed)
        ? parsed.filter(
            (s) => s.strongnessTier !== 'B+' && (s.strongnessScore ?? 0) >= 72
          )
        : [];
      if (highGradeOnly.length !== parsed.length) {
        localStorage.setItem('vp_fractal_signal_ledger', JSON.stringify(highGradeOnly));
      }
      return highGradeOnly;
    } catch {
      return [];
    }
  });

  const signalLedger =
    sharedSignalLedger && sharedSignalLedger.length > 0 ? sharedSignalLedger : localSignalLedger;

  // 1. Calculate 4H Fractal Levels for selected coin
  const fourHourLevels: FourHourFractalLevels = useMemo(() => {
    return getLatest4HFractalLevels(candles4H, selectedSymbol, fractalPeriods);
  }, [candles4H, selectedSymbol, fractalPeriods]);

  // Current price from latest LTF candle or ticker
  const currentPrice = useMemo(() => {
    if (candlesLTF.length > 0) return candlesLTF[candlesLTF.length - 1].close;
    const t = tickers.find((x) => x.symbol === selectedSymbol);
    return t?.lastPrice ?? 100;
  }, [candlesLTF, tickers, selectedSymbol]);

  // 2. Check 4H Level Cross / Sweep
  const levelCrossStatus: LevelCrossStatus = useMemo(() => {
    const latestBar = candlesLTF[candlesLTF.length - 1] ?? {
      high: currentPrice,
      low: currentPrice,
    };
    return check4HLevelCross(currentPrice, latestBar.high, latestBar.low, fourHourLevels);
  }, [currentPrice, candlesLTF, fourHourLevels]);

  // 3. Detect Engulfing on LTF
  const engulfingResult: EngulfingDetectionResult = useMemo(() => {
    return detectEngulfingCandle(candlesLTF, candlesLTF.length - 1);
  }, [candlesLTF]);

  // 4. Live Signal Candidate (Guarded: High-Grade Tier A & A+ Only)
  const activeSignalCandidate: FractalTradeSignal | null = useMemo(() => {
    if (!candlesLTF.length) return null;
    const latestBar = candlesLTF[candlesLTF.length - 1];

    // Trigger condition: Level is crossed AND matching engulfing occurs
    if (
      (levelCrossStatus.type === 'HIGH_CROSSED' && engulfingResult.type === 'BEARISH') ||
      (levelCrossStatus.type === 'LOW_CROSSED' && engulfingResult.type === 'BULLISH')
    ) {
      // STRICT QUALITY GUARD: User requested "don't generate low graded signal"
      // Filter out Tier B+ and any score < 72%
      if (
        !engulfingResult.isStrong ||
        engulfingResult.strongnessTier === 'B+' ||
        engulfingResult.strongnessScore < 72
      ) {
        return null;
      }

      return generateFractalTradeSignal({
        symbol: selectedSymbol,
        timeframe: ltfInterval,
        fourHourLevels,
        engulfingResult,
        candle: latestBar,
      });
    }
    return null;
  }, [candlesLTF, levelCrossStatus, engulfingResult, selectedSymbol, ltfInterval, fourHourLevels]);

  // Auto-record new unique signals to Signal Ledger
  useEffect(() => {
    if (activeSignalCandidate) {
      if (onRecordSignal) {
        onRecordSignal(activeSignalCandidate);
      }
      setLocalSignalLedger((prev) => {
        if (prev.some((s) => s.id === activeSignalCandidate.id)) return prev;
        const updated = [activeSignalCandidate, ...prev].slice(0, 50);
        try {
          localStorage.setItem('vp_fractal_signal_ledger', JSON.stringify(updated));
        } catch {
          // ignore storage error
        }
        return updated;
      });
    }
  }, [activeSignalCandidate, onRecordSignal]);

  // Fetch Multi-Coin 4H Fractal Scan
  const fetchFractalScan = async () => {
    setIsScanning(true);
    try {
      const res = await fetch('/api/strategy/fractal-scan');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) {
          setScannerItems(data.items);
        }
      }
    } catch {
      // Keep existing state
    } finally {
      setIsScanning(false);
    }
  };

  useEffect(() => {
    if (!isActive) return;
    fetchFractalScan();
    const timer = setInterval(fetchFractalScan, 25000);
    return () => clearInterval(timer);
  }, [isActive]);

  // Helper to ensure every property in a backtest report is defined, valid and safe
  const sanitizeBacktestSummary = (raw: any, risk: number): BacktestSummary => {
    const riskAmount = Number(risk) || 100;
    const netR = typeof raw?.netProfitR === 'number' ? raw.netProfitR : 0;
    const maxDdR = typeof raw?.maxDrawdownR === 'number' ? raw.maxDrawdownR : 0;
    const avgR = typeof raw?.avgTradeR === 'number' ? raw.avgTradeR : 0;

    const trades: BacktestTrade[] = Array.isArray(raw?.trades)
      ? raw.trades.map((t: any, idx: number) => {
          const entryTime = t.entryTime || Date.now() - (idx + 1) * 3600000;
          const exitTime = t.exitTime || entryTime + 1800000;
          const netRealizedR = typeof t.netRealizedR === 'number' ? t.netRealizedR : 0;
          const pnlUsdt =
            typeof t.pnlUsdt === 'number' ? t.pnlUsdt : Number((netRealizedR * riskAmount).toFixed(2));
          const durationMinutes =
            typeof t.durationMinutes === 'number'
              ? t.durationMinutes
              : t.durationBars
              ? t.durationBars * (ltfInterval === '1m' ? 1 : 5)
              : 30;
          const hrs = Math.floor(durationMinutes / 60);
          const mins = durationMinutes % 60;
          const durationString =
            t.durationString ||
            (hrs > 0
              ? `${hrs}h ${mins}m (${t.durationBars ?? 6} bars)`
              : `${durationMinutes}m (${t.durationBars ?? 6} bars)`);

          return {
            ...t,
            id: t.id || `trade-${idx + 1}`,
            entryTime,
            exitTime,
            entryTimeString:
              t.entryTimeString ||
              new Date(entryTime).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
            exitTimeString:
              t.exitTimeString ||
              new Date(exitTime).toLocaleString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
            durationBars: t.durationBars ?? 6,
            durationMinutes,
            durationString,
            direction: t.direction || 'LONG',
            fourHourLevel: typeof t.fourHourLevel === 'number' ? t.fourHourLevel : (t.entryPrice || 0),
            fourHourLevelType: t.fourHourLevelType || '4H_SWING_HIGH',
            entryPrice: typeof t.entryPrice === 'number' ? t.entryPrice : 0,
            stopLoss: typeof t.stopLoss === 'number' ? t.stopLoss : 0,
            tp1: typeof t.tp1 === 'number' ? t.tp1 : 0,
            tp2: typeof t.tp2 === 'number' ? t.tp2 : 0,
            tp3: typeof t.tp3 === 'number' ? t.tp3 : 0,
            exitPrice: typeof t.exitPrice === 'number' ? t.exitPrice : (t.entryPrice || 0),
            netRealizedR,
            pnlUsdt,
            exitReason: t.exitReason || (netRealizedR > 0 ? 'TP1_TRAIL_STOP' : 'FULL_STOP_LOSS'),
            strongnessScore: typeof t.strongnessScore === 'number' ? t.strongnessScore : 75,
            strongnessTier: t.strongnessTier || 'A',
            isWinner: typeof t.isWinner === 'boolean' ? t.isWinner : netRealizedR > 0,
          };
        })
      : [];

    return {
      symbol: raw?.symbol || selectedSymbol,
      timeframe: raw?.timeframe || ltfInterval,
      totalTrades: typeof raw?.totalTrades === 'number' ? raw.totalTrades : trades.length,
      winningTrades:
        typeof raw?.winningTrades === 'number'
          ? raw.winningTrades
          : trades.filter((t) => t.isWinner).length,
      losingTrades:
        typeof raw?.losingTrades === 'number'
          ? raw.losingTrades
          : trades.filter((t) => !t.isWinner).length,
      winRate:
        typeof raw?.winRate === 'number'
          ? raw.winRate
          : trades.length > 0
          ? Math.round((trades.filter((t) => t.isWinner).length / trades.length) * 100)
          : 0,
      netProfitR: netR,
      netProfitUsdt:
        typeof raw?.netProfitUsdt === 'number' ? raw.netProfitUsdt : Number((netR * riskAmount).toFixed(2)),
      profitFactor: typeof raw?.profitFactor === 'number' ? raw.profitFactor : 1.0,
      maxDrawdownR: maxDdR,
      maxDrawdownUsdt:
        typeof raw?.maxDrawdownUsdt === 'number'
          ? raw.maxDrawdownUsdt
          : Number((maxDdR * riskAmount).toFixed(2)),
      avgTradeR: avgR,
      avgTradeUsdt:
        typeof raw?.avgTradeUsdt === 'number' ? raw.avgTradeUsdt : Number((avgR * riskAmount).toFixed(2)),
      tp1HitRate: typeof raw?.tp1HitRate === 'number' ? raw.tp1HitRate : 0,
      tp2HitRate: typeof raw?.tp2HitRate === 'number' ? raw.tp2HitRate : 0,
      tp3HitRate: typeof raw?.tp3HitRate === 'number' ? raw.tp3HitRate : 0,
      trades,
      failureCategorization: raw?.failureCategorization || {},
      dateRangePreset: raw?.dateRangePreset || dateRangePreset,
      startDate: raw?.startDate || (trades[0]?.entryTimeString ?? 'Recent'),
      endDate: raw?.endDate || (trades[trades.length - 1]?.exitTimeString ?? 'Current'),
      createdAt: raw?.createdAt || new Date().toISOString(),
    };
  };

  // Run Strategy Backtest (Rule 5 with Date Range Selection & Real-Time Progress Tracking)
  const handleRunBacktest = async () => {
    setIsBacktesting(true);
    setBacktestProgress(15);
    setBacktestStage('Fetching multi-timeframe candle datasets (4H & 5m)...');
    setBacktestError(null);
    setBacktestCompletedNotice(null);

    let progressTimer: NodeJS.Timeout | null = null;
    let currentPct = 15;
    progressTimer = setInterval(() => {
      currentPct = Math.min(92, currentPct + Math.floor(Math.random() * 8) + 4);
      setBacktestProgress(currentPct);
      if (currentPct >= 75) {
        setBacktestStage('Simulating tiered exits (1:2, 1:3, 1:4) & running failure post-mortems...');
      } else if (currentPct >= 45) {
        setBacktestStage('Scanning 4H swing high/low liquidity sweeps & 5m engulfing confirmations...');
      } else {
        setBacktestStage('Processing multi-timeframe price action bars...');
      }
    }, 160);

    try {
      let rawReport: any = null;

      // 1. Attempt API server backtest with timeout protection
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const res = await fetch('/api/strategy/backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            symbol: selectedSymbol,
            timeframe: ltfInterval,
            fractalPeriods,
            maxHoldBars: 60,
            dateRangePreset,
            customStart,
            customEnd,
            riskPerTrade,
          }),
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.backtest) {
            rawReport = data.backtest;
          }
        }
      } catch {
        // Fallback to local calculation below
      }

      // 2. Fallback to local execution if server fetch failed or timed out
      if (!rawReport) {
        setBacktestStage('Executing local algorithmic backtest simulation...');
        const now = Date.now();
        let startTimeMs = now - 7 * 24 * 3600 * 1000;
        let endTimeMs = now;
        if (dateRangePreset === '24h') startTimeMs = now - 24 * 3600 * 1000;
        else if (dateRangePreset === '3d') startTimeMs = now - 3 * 24 * 3600 * 1000;
        else if (dateRangePreset === '7d') startTimeMs = now - 7 * 24 * 3600 * 1000;
        else if (dateRangePreset === '14d') startTimeMs = now - 14 * 24 * 3600 * 1000;
        else if (dateRangePreset === '30d') startTimeMs = now - 30 * 24 * 3600 * 1000;
        else if (dateRangePreset === 'custom' && customStart && customEnd) {
          startTimeMs = new Date(customStart).getTime();
          endTimeMs = new Date(customEnd).getTime() + (24 * 3600 * 1000 - 1);
        }

        rawReport = runFractalBacktest({
          symbol: selectedSymbol,
          timeframe: ltfInterval,
          candles4H,
          candlesLTF,
          fractalPeriods,
          startTimeMs,
          endTimeMs,
          dateRangePreset,
          riskPerTradeUsdt: riskPerTrade,
        });
      }

      // 3. Mark 100% complete
      if (progressTimer) clearInterval(progressTimer);
      setBacktestProgress(100);
      setBacktestStage('Simulation complete! Compiling diagnostics and win rate...');

      const sanitized = sanitizeBacktestSummary(rawReport, riskPerTrade);
      setBacktestResult(sanitized);
      const firstFailed = sanitized.trades.find((t: BacktestTrade) => !t.isWinner);
      setSelectedFailedTrade(firstFailed ?? null);
      setInspectedTrade(sanitized.trades[0] ?? null);

      setSavedBacktests((prev) => {
        const next = [sanitized, ...prev.filter((b) => b.symbol !== selectedSymbol || b.timeframe !== ltfInterval)].slice(0, 10);
        try {
          localStorage.setItem('vp_saved_fractal_backtests', JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });

      setBacktestCompletedNotice(
        `Backtest completed successfully: ${sanitized.totalTrades} trade${sanitized.totalTrades === 1 ? '' : 's'} simulated (${sanitized.winRate}% win rate, ${sanitized.netProfitR >= 0 ? '+' : ''}${sanitized.netProfitR}R)`
      );

      // Brief delay so user sees 100% completion
      await new Promise((resolve) => setTimeout(resolve, 350));
    } catch (err: any) {
      if (progressTimer) clearInterval(progressTimer);
      setBacktestError(err?.message || 'Backtest simulation encountered an unexpected error.');
    } finally {
      if (progressTimer) clearInterval(progressTimer);
      setIsBacktesting(false);
    }
  };

  const formatPrice = (p: number | undefined | null) => {
    if (typeof p !== 'number' || isNaN(p)) return '0.00';
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(4);
    return p.toFixed(6);
  };

  return (
    <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-5">
      {/* Top Header & Strategy Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-200">Williams Fractal Strategy Suite</span>
            <span aria-hidden="true">·</span>
            <span className="text-sky-400 font-mono">Pine Script v6 Algorithm (n={fractalPeriods})</span>
            <span aria-hidden="true">·</span>
            <span className="text-slate-300">4H Liquidity Sweep + {ltfInterval} Engulfing Confirmation</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 text-emerald-400 font-medium bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60 font-mono text-[11px]">
              <Zap className="w-3 h-3 text-emerald-400" />
              <span>0 AI Credits Used · Algorithmic Math</span>
            </span>
          </div>
          <h2 className="text-base font-bold text-slate-100 mt-1 flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            <span>4H Fractal Sweep & Multi-Timeframe Execution Terminal</span>
          </h2>
        </div>

        {/* View / Tab Selector */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('SCANNER')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                activeTab === 'SCANNER'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Live Scanner & Signals
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('BACKTEST')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'BACKTEST'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Backtest & Diagnostics</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('LEDGER')}
              className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === 'LEDGER'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Signal Ledger ({signalLedger.length})</span>
            </button>
          </div>

          {/* Timeframe & Fractal Parameter Selector */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-md p-0.5 text-xs font-mono">
              <button
                type="button"
                onClick={() => onLtfIntervalChange('5m')}
                className={`px-2.5 py-1 rounded ${
                  ltfInterval === '5m' ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400'
                }`}
              >
                5m Trigger
              </button>
              <button
                type="button"
                onClick={() => onLtfIntervalChange('1m')}
                className={`px-2.5 py-1 rounded ${
                  ltfInterval === '1m' ? 'bg-slate-700 text-white font-semibold' : 'text-slate-400'
                }`}
              >
                1m Trigger
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
              <label htmlFor="fractal-n-select" className="sr-only">
                Pine Script Fractal Periods n
              </label>
              <span>n=</span>
              <select
                id="fractal-n-select"
                aria-label="Pine Script Fractal Periods n"
                value={fractalPeriods}
                onChange={(e) => setFractalPeriods(Number(e.target.value))}
                className="bg-slate-900 border border-slate-700 text-slate-200 text-xs px-2 py-1 rounded"
              >
                <option value={2}>2 (5-Bar Classic)</option>
                <option value={3}>3 (7-Bar Wide)</option>
                <option value={4}>4 (9-Bar Major)</option>
                <option value={5}>5 (11-Bar Macro)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* TAB 1: LIVE SCANNER & REAL-TIME STRATEGY EXECUTION */}
      {activeTab === 'SCANNER' && (
        <div className="space-y-5">
          {/* Rule 1 & Rule 2: 4H Fractal Levels + Live 3D AI Sweep Agent Hub */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            {/* Left 7 Columns: 4H Swing High & Swing Low Frontier Cards */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 4H Swing High Card */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-md shadow-slate-950/40">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-rose-400 font-semibold flex items-center gap-1">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                        4H Previous Swing High
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        {fourHourLevels.highFractalTime
                          ? new Date(fourHourLevels.highFractalTime).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'Confirmed'}
                      </span>
                    </div>
                    <div className="text-2xl font-bold font-mono text-slate-100 mt-1">
                      ${formatPrice(fourHourLevels.previousSwingHigh)}
                    </div>
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <span>
                      {currentPrice > fourHourLevels.previousSwingHigh ? (
                        <strong className="text-rose-400 font-bold">
                          Swept (+
                          {(
                            ((currentPrice - fourHourLevels.previousSwingHigh) /
                              fourHourLevels.previousSwingHigh) *
                            100
                          ).toFixed(2)}
                          %)
                        </strong>
                      ) : (
                        <span>
                          {(
                            ((fourHourLevels.previousSwingHigh - currentPrice) / currentPrice) *
                            100
                          ).toFixed(2)}
                          % away
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onAddAlert({
                          symbol: selectedSymbol,
                          condition: 'PRICE_ABOVE',
                          threshold: fourHourLevels.previousSwingHigh,
                          note: `4H Swing High Sweep Watch ($${fourHourLevels.previousSwingHigh})`,
                        })
                      }
                      className="text-sky-400 hover:text-sky-300 underline font-sans text-xs"
                    >
                      + Set Alert
                    </button>
                  </div>
                </div>

                {/* 4H Swing Low Card */}
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-col justify-between shadow-md shadow-slate-950/40">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-emerald-400 font-semibold flex items-center gap-1">
                        <ArrowDownRight className="w-3.5 h-3.5" />
                        4H Previous Swing Low
                      </span>
                      <span className="text-[11px] font-mono text-slate-500">
                        {fourHourLevels.lowFractalTime
                          ? new Date(fourHourLevels.lowFractalTime).toLocaleDateString([], {
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'Confirmed'}
                      </span>
                    </div>
                    <div className="text-2xl font-bold font-mono text-slate-100 mt-1">
                      ${formatPrice(fourHourLevels.previousSwingLow)}
                    </div>
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between">
                    <span>
                      {currentPrice < fourHourLevels.previousSwingLow ? (
                        <strong className="text-emerald-400 font-bold">
                          Swept (-
                          {(
                            ((fourHourLevels.previousSwingLow - currentPrice) /
                              fourHourLevels.previousSwingLow) *
                            100
                          ).toFixed(2)}
                          %)
                        </strong>
                      ) : (
                        <span>
                          {(
                            ((currentPrice - fourHourLevels.previousSwingLow) / currentPrice) *
                            100
                          ).toFixed(2)}
                          % away
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onAddAlert({
                          symbol: selectedSymbol,
                          condition: 'PRICE_BELOW',
                          threshold: fourHourLevels.previousSwingLow,
                          note: `4H Swing Low Sweep Watch ($${fourHourLevels.previousSwingLow})`,
                        })
                      }
                      className="text-sky-400 hover:text-sky-300 underline font-sans text-xs"
                    >
                      + Set Alert
                    </button>
                  </div>
                </div>
              </div>

              {/* Sweep Frontier Telemetry Card */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-300">
                  <span className="font-semibold text-slate-200 flex items-center gap-1.5 font-sans">
                    <Activity className="w-4 h-4 text-sky-400" />
                    <span>Real-Time Sweep Frontier Diagnostics</span>
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                      levelCrossStatus.isCrossed
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-600/50 animate-pulse'
                        : 'bg-sky-500/10 text-sky-300 border border-sky-500/30'
                    }`}
                  >
                    {levelCrossStatus.isCrossed ? 'FRONTIER BREACHED' : 'INSIDE 4H BOUNDARY'}
                  </span>
                </div>

                <div className="text-slate-300 text-[11px] leading-relaxed">
                  {levelCrossStatus.description}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px] font-sans">Current Price</span>
                    <span className="text-white font-bold">${formatPrice(currentPrice)}</span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800">
                    <span className="text-slate-500 block text-[10px] font-sans">4H Channel Range</span>
                    <span className="text-slate-200 font-bold">
                      ${formatPrice(fourHourLevels.previousSwingHigh - fourHourLevels.previousSwingLow)}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-2 rounded border border-slate-800 col-span-2 sm:col-span-1">
                    <span className="text-slate-500 block text-[10px] font-sans">Engulfing Watch</span>
                    <span
                      className={`font-bold ${
                        engulfingResult.isEngulfing ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {engulfingResult.isEngulfing ? `${engulfingResult.type} PRINTED` : 'STANDBY (NO ENGULF)'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 5 Columns: 3D Animated Williams Fractal Agent Face */}
            <div className="lg:col-span-5 flex flex-col">
              <FractalAgentFace3D
                isCrossed={levelCrossStatus.isCrossed}
                crossType={levelCrossStatus.type}
                levelDescription={levelCrossStatus.description}
                selectedSymbol={selectedSymbol}
                timeframe={ltfInterval}
              />
            </div>
          </div>

          {/* Rule 3 & Rule 4: Real-time Engulfing Detection & Strategy Signal Setup */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left 5 Cols: Lower Timeframe Engulfing Recognition Monitor (Rule 3) */}
            <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5 text-sky-400" />
                  <span>{ltfInterval} Engulfing Pattern Recognition</span>
                </h3>
                <span
                  className={`text-[11px] font-mono px-2 py-0.5 rounded font-semibold ${
                    engulfingResult.isEngulfing
                      ? engulfingResult.type === 'BULLISH'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/20 text-rose-400'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {engulfingResult.isEngulfing
                    ? `${engulfingResult.type} ENGULFING`
                    : 'NO ENGULFING'}
                </span>
              </div>

              {/* Engulfing Metrics */}
              <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
                <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/60">
                  <span className="text-slate-400 block text-[11px]">Body-to-Range Ratio</span>
                  <span className="text-sm font-bold text-slate-100">
                    {Math.round(engulfingResult.bodyRatio * 100)}%
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {engulfingResult.bodyRatio >= 0.55 ? 'Strong body' : 'Indecisive / wick'}
                  </span>
                </div>

                <div className="bg-slate-950/60 p-2.5 rounded border border-slate-800/60">
                  <span className="text-slate-400 block text-[11px]">Volume Surge</span>
                  <span className="text-sm font-bold text-sky-400">
                    {engulfingResult.volumeRatio}x
                  </span>
                  <span className="text-[10px] text-slate-500 block">vs 10-bar SMA volume</span>
                </div>
              </div>

              {/* Strongness Score & Analysis Factors */}
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Signal Strongness Score:</span>
                  <span
                    className={`font-mono font-bold ${
                      engulfingResult.strongnessScore >= 80
                        ? 'text-emerald-400'
                        : engulfingResult.strongnessScore >= 65
                        ? 'text-sky-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {engulfingResult.strongnessScore} / 100 ({engulfingResult.strongnessTier})
                  </span>
                </div>
                <div className="space-y-1 pt-1">
                  {engulfingResult.reasons.map((r, i) => (
                    <div
                      key={i}
                      className="text-[11px] text-slate-300 flex items-start gap-1.5 leading-tight"
                    >
                      <span className="text-sky-400 shrink-0">›</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right 7 Cols: Strategy Trade Execution Blueprint (Rule 4) */}
            <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Rule 4 Automated Trade Blueprint</span>
                  </h3>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/60 font-mono">
                    0 Credits
                  </span>
                  {activeSignalCandidate && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        activeSignalCandidate.direction === 'LONG'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      LIVE {activeSignalCandidate.direction} SETUP
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-mono text-slate-400">
                  Tiered Book: 50% @ 2R · 25% @ 3R · 25% @ 4R
                </span>
              </div>

              {/* Execution Levels Grid */}
              {activeSignalCandidate ? (
                <div className="space-y-3 font-mono tabular-nums">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-950/70 p-2.5 rounded border border-slate-800">
                      <span className="text-[11px] text-slate-400 block font-sans">
                        Entry (Engulfing Close)
                      </span>
                      <span className="text-sm font-bold text-slate-100">
                        ${formatPrice(activeSignalCandidate.entryPrice)}
                      </span>
                    </div>

                    <div className="bg-slate-950/70 p-2.5 rounded border border-slate-800">
                      <span className="text-[11px] text-slate-400 block font-sans">
                        Stop Loss ({activeSignalCandidate.direction === 'SHORT' ? 'Above High' : 'Below Low'})
                      </span>
                      <span className="text-sm font-bold text-rose-400">
                        ${formatPrice(activeSignalCandidate.stopLoss)}
                      </span>
                      <span className="text-[10px] text-rose-500 block">
                        -{activeSignalCandidate.riskPercent}% Risk
                      </span>
                    </div>

                    <div className="bg-slate-950/70 p-2.5 rounded border border-slate-800">
                      <span className="text-[11px] text-slate-400 block font-sans">
                        TP 1 (1:2 · Book 50%)
                      </span>
                      <span className="text-sm font-bold text-emerald-400">
                        ${formatPrice(activeSignalCandidate.tp1)}
                      </span>
                      <span className="text-[10px] text-emerald-500 block">50% Position</span>
                    </div>

                    <div className="bg-slate-950/70 p-2.5 rounded border border-slate-800">
                      <span className="text-[11px] text-slate-400 block font-sans">
                        TP 2 & TP 3 (1:3 & 1:4)
                      </span>
                      <span className="text-xs font-bold text-emerald-300 block">
                        TP2: ${formatPrice(activeSignalCandidate.tp2)} (25%)
                      </span>
                      <span className="text-xs font-bold text-emerald-300 block">
                        TP3: ${formatPrice(activeSignalCandidate.tp3)} (25%)
                      </span>
                    </div>
                  </div>

                  {/* Combined Risk/Reward & One-Click Alert Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs">
                    <div className="text-slate-300">
                      Weighted Strategy R:R:{' '}
                      <strong className="text-sky-400 font-mono">1 : 2.75</strong> (50%×2R +
                      25%×3R + 25%×4R)
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onAddAlert({
                            symbol: selectedSymbol,
                            condition:
                              activeSignalCandidate.direction === 'LONG'
                                ? 'PRICE_ABOVE'
                                : 'PRICE_BELOW',
                            threshold: activeSignalCandidate.tp1,
                            note: `TP1 (1:2 - 50% Book) for ${selectedSymbol} ${activeSignalCandidate.direction}`,
                          })
                        }
                        className="px-3 py-1 bg-emerald-700/80 hover:bg-emerald-600 text-white rounded text-xs transition-colors"
                      >
                        + Alert TP1
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          onAddAlert({
                            symbol: selectedSymbol,
                            condition:
                              activeSignalCandidate.direction === 'LONG'
                                ? 'PRICE_BELOW'
                                : 'PRICE_ABOVE',
                            threshold: activeSignalCandidate.stopLoss,
                            note: `SL Guard for ${selectedSymbol} ${activeSignalCandidate.direction}`,
                          })
                        }
                        className="px-3 py-1 bg-rose-700/80 hover:bg-rose-600 text-white rounded text-xs transition-colors"
                      >
                        + Alert SL
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 font-sans space-y-2">
                  {levelCrossStatus.isCrossed &&
                  ((levelCrossStatus.type === 'HIGH_CROSSED' && engulfingResult.type === 'BEARISH') ||
                    (levelCrossStatus.type === 'LOW_CROSSED' && engulfingResult.type === 'BULLISH')) &&
                  (!engulfingResult.isStrong ||
                    engulfingResult.strongnessTier === 'B+' ||
                    engulfingResult.strongnessScore < 72) ? (
                    <div className="inline-block p-3 rounded-lg bg-amber-950/40 border border-amber-600/40 text-amber-200 max-w-lg">
                      <div className="flex items-center justify-center gap-1.5 font-semibold text-xs text-amber-300 mb-1">
                        <ShieldAlert className="w-4 h-4 text-amber-400" />
                        <span>Institutional Quality Guard: Low-Grade Setup Suppressed</span>
                      </div>
                      <p className="text-[11px] text-amber-200/90">
                        4H Level sweep detected with {engulfingResult.type} engulfing, but pattern quality is{' '}
                        <strong className="text-amber-100 font-mono">
                          Tier {engulfingResult.strongnessTier} ({engulfingResult.strongnessScore}%)
                        </strong>
                        . Per user instruction, low-grade signals are not generated. Only Tier A (72%+) & A+ (85%+) setups are authorized.
                      </p>
                    </div>
                  ) : (
                    <p>
                      {levelCrossStatus.isCrossed
                        ? `4H Level was swept! Waiting for a strong ${
                            levelCrossStatus.type === 'HIGH_CROSSED' ? 'Bearish' : 'Bullish'
                          } engulfing candle on the ${ltfInterval} chart to generate entry, SL, and tiered targets.`
                        : `Price has not yet crossed or swept the 4H Swing High ($${formatPrice(
                            fourHourLevels.previousSwingHigh
                          )}) or Low ($${formatPrice(
                            fourHourLevels.previousSwingLow
                          )}). The AI Agent is in Standby mode.`}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-500">
                    Once price sweeps 4H High/Low and a high-grade engulfing candle (Tier A/A+) closes, Rule 4 parameters will calculate automatically.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Multi-Coin 4H Fractal & Agent Sweep Scanner Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  <span>Market-Wide 4H Fractal Sweep & Agent Watch Scanner</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Live screening of high-volume crypto pairs for 4H swing sweeps and active 5m reversal setups
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                  <Zap className="w-3 h-3 text-emerald-400" />
                  <span>0 AI Credits · Algorithmic Scanner</span>
                </span>
                <button
                  type="button"
                  onClick={fetchFractalScan}
                  disabled={isScanning}
                  className="flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-mono disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isScanning ? 'animate-spin' : ''}`} />
                  <span>Refresh Scanner</span>
                </button>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                    <th className="py-2 pr-3 font-medium">Asset</th>
                    <th className="py-2 px-3 text-right font-medium">Current Price</th>
                    <th className="py-2 px-3 text-right font-medium">4H Swing High</th>
                    <th className="py-2 px-3 text-right font-medium">4H Swing Low</th>
                    <th className="py-2 px-3 text-center font-medium">Agent Status</th>
                    <th className="py-2 pl-3 text-right font-medium">5m Engulfing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {scannerItems.map((item) => {
                    const isSelected = item.symbol === selectedSymbol;
                    const isCrossed = item.agentActive;
                    return (
                      <tr
                        key={item.symbol}
                        onClick={() => onSelectSymbol(item.symbol)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-sky-950/60 text-white'
                            : 'hover:bg-slate-800/40 text-slate-300'
                        }`}
                      >
                        <td className="py-2.5 pr-3 font-sans font-semibold">
                          <button
                            type="button"
                            onClick={() => onSelectSymbol(item.symbol)}
                            className="hover:text-sky-400 text-left"
                          >
                            {item.baseAsset}
                            <span className="text-slate-500 font-normal">/USDT</span>
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-100 font-bold">
                          ${formatPrice(item.currentPrice)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="text-slate-300">${formatPrice(item.fourHourHigh)}</span>
                          <span className="text-[10px] text-slate-500 block">
                            {item.distToHighPct > 0 ? `${item.distToHighPct}% away` : 'Swept!'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <span className="text-slate-300">${formatPrice(item.fourHourLow)}</span>
                          <span className="text-[10px] text-slate-500 block">
                            {item.distToLowPct > 0 ? `${item.distToLowPct}% away` : 'Swept!'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                              isCrossed
                                ? 'bg-emerald-500/20 text-emerald-300 animate-pulse'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {isCrossed ? 'AGENT ACTIVE' : 'STANDBY'}
                          </span>
                        </td>
                        <td className="py-2.5 pl-3 text-right">
                          {item.engulfing?.isEngulfing ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                item.engulfing.type === 'BULLISH'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {item.engulfing.type} ({item.engulfing.strongnessScore}%)
                            </span>
                          ) : (
                            <span className="text-slate-500">None</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STRATEGY BACKTEST ENGINE & FAILURE DIAGNOSTICS (Rule 5) */}
      {activeTab === 'BACKTEST' && (
        <div className="space-y-5">
          {/* Backtest Header & Configuration Toolbar */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-lg space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                  <History className="w-4 h-4 text-sky-400" />
                  <span>Historical Backtest Simulator: {selectedSymbol} ({ltfInterval})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Evaluates 4H Fractal High/Low Sweeps followed by {ltfInterval} Engulfing candles. Simulates 1:2 (50%), 1:3 (25%), 1:4 (25%) tiered exits with Break-Even trailing.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="hidden md:inline-flex items-center gap-1 text-emerald-400 font-mono text-[11px] bg-emerald-950/40 px-2.5 py-1.5 rounded border border-emerald-800/40">
                  <Zap className="w-3 h-3 text-emerald-400" />
                  <span>100% Free · 0 AI Credits (Historical Math)</span>
                </span>
                <button
                  type="button"
                  onClick={handleRunBacktest}
                  disabled={isBacktesting}
                  className="flex items-center gap-2 px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-75 text-white font-medium text-xs rounded-md transition-colors shadow-lg shadow-sky-950"
                >
                  {isBacktesting ? (
                    <RefreshCw className="w-4 h-4 animate-spin text-sky-200" />
                  ) : (
                    <Play className="w-4 h-4 fill-current" />
                  )}
                  <span>
                    {isBacktesting
                      ? `Running Backtest (${backtestProgress}%)...`
                      : `Run Backtest for ${selectedSymbol}`}
                  </span>
                </button>
              </div>
            </div>

            {/* Date Range Selection & Risk Input */}
            <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
              {/* Date Presets */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-sky-400" />
                  <span>Date Range:</span>
                </span>
                {(['24h', '3d', '7d', '14d', '30d', 'custom'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDateRangePreset(preset)}
                    className={`px-2.5 py-1 rounded text-xs font-mono transition-colors ${
                      dateRangePreset === preset
                        ? 'bg-sky-600 text-white font-bold'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {preset === 'custom' ? 'Custom Date' : preset.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Custom Date Pickers if 'custom' is active */}
              {dateRangePreset === 'custom' && (
                <div className="flex items-center gap-2 font-mono">
                  <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                    <span className="text-[11px] text-slate-500">From:</span>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="bg-transparent text-slate-200 text-xs focus:outline-none"
                    />
                  </div>
                  <span className="text-slate-600">→</span>
                  <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded border border-slate-800">
                    <span className="text-[11px] text-slate-500">To:</span>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="bg-transparent text-slate-200 text-xs focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Risk Per Trade ($) */}
              <div className="flex items-center gap-2 font-mono">
                <span className="text-slate-400 text-[11px] flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Risk / Trade ($):</span>
                </span>
                <input
                  type="number"
                  min="10"
                  max="50000"
                  step="10"
                  value={riskPerTrade}
                  onChange={(e) => setRiskPerTrade(Math.max(1, Number(e.target.value) || 100))}
                  className="w-20 bg-slate-950 text-slate-100 px-2.5 py-1 rounded border border-slate-800 text-xs text-right font-bold focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Live Backtest Progress Tracker & Telemetry HUD */}
            {isBacktesting && (
              <div className="pt-3 border-t border-slate-800/80 space-y-2.5 bg-slate-950/70 p-3.5 rounded-lg border border-sky-500/40 animate-in fade-in duration-200">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <div className="flex items-center gap-2 text-sky-300">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-sky-400 shrink-0" />
                    <span className="font-semibold">{backtestStage || 'Running Quantitative Backtest...'}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-slate-400">Backtest Progress:</span>
                    <span className="text-sm font-bold text-sky-400 font-mono bg-sky-950/80 px-2 py-0.5 rounded border border-sky-800/60">
                      {backtestProgress}%
                    </span>
                  </div>
                </div>

                {/* Animated Progress Bar */}
                <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800 p-0.5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-400 transition-all duration-200 shadow-sm shadow-sky-500/50"
                    style={{ width: `${Math.min(100, Math.max(8, backtestProgress))}%` }}
                  />
                </div>

                {/* 4-Step Pipeline Indicator */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] font-mono">
                  <div className={`flex items-center gap-1.5 ${backtestProgress >= 25 ? 'text-emerald-400 font-semibold' : 'text-slate-500'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${backtestProgress >= 25 ? 'text-emerald-400' : 'text-slate-600'}`} />
                    <span>1. Klines Data</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${backtestProgress >= 50 ? 'text-emerald-400 font-semibold' : backtestProgress >= 25 ? 'text-sky-300 font-semibold' : 'text-slate-500'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${backtestProgress >= 50 ? 'text-emerald-400' : backtestProgress >= 25 ? 'text-sky-400 animate-pulse' : 'text-slate-600'}`} />
                    <span>2. 4H Fractals</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${backtestProgress >= 80 ? 'text-emerald-400 font-semibold' : backtestProgress >= 50 ? 'text-sky-300 font-semibold' : 'text-slate-500'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${backtestProgress >= 80 ? 'text-emerald-400' : backtestProgress >= 50 ? 'text-sky-400 animate-pulse' : 'text-slate-600'}`} />
                    <span>3. Tiered Exits</span>
                  </div>
                  <div className={`flex items-center gap-1.5 ${backtestProgress >= 100 ? 'text-emerald-400 font-semibold' : backtestProgress >= 80 ? 'text-sky-300 font-semibold' : 'text-slate-500'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${backtestProgress >= 100 ? 'text-emerald-400' : backtestProgress >= 80 ? 'text-sky-400 animate-pulse' : 'text-slate-600'}`} />
                    <span>4. Forensics</span>
                  </div>
                </div>
              </div>
            )}

            {/* Completion Notice Toast */}
            {backtestCompletedNotice && !isBacktesting && (
              <div className="pt-2">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-600/40 text-emerald-200 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{backtestCompletedNotice}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBacktestCompletedNotice(null)}
                    className="text-emerald-400 hover:text-emerald-100 font-bold ml-2 text-xs"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Error Notification */}
            {backtestError && !isBacktesting && (
              <div className="pt-2">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs font-mono">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{backtestError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBacktestError(null)}
                    className="text-rose-400 hover:text-rose-200 font-bold ml-2 text-xs"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* Zero Trades Context Guidance */}
            {backtestResult && backtestResult.totalTrades === 0 && !isBacktesting && (
              <div className="p-3.5 rounded-lg border border-sky-500/30 bg-sky-950/20 text-sky-200 text-xs space-y-2">
                <div className="flex items-center gap-2 font-semibold text-sky-300">
                  <Info className="w-4 h-4 text-sky-400 shrink-0" />
                  <span>No Tier A/A+ Setups Formed in this {dateRangePreset.toUpperCase()} Window</span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  During this {dateRangePreset === '24h' ? '24-hour' : dateRangePreset} period, {selectedSymbol} traded mostly inside its 4H fractal range without sweeping high-timeframe liquidity. High-grade Williams Fractal swing setups require a confirmed 4H High/Low sweep followed by a Tier A engulfing candle.
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-[11px] text-slate-400 font-sans">Run a broader multi-day window:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setDateRangePreset('7d');
                      setTimeout(handleRunBacktest, 50);
                    }}
                    className="px-2.5 py-1 bg-sky-600/30 hover:bg-sky-600/50 border border-sky-500/40 text-sky-200 rounded text-[11px] font-sans font-medium transition-colors"
                  >
                    Run 7D Backtest
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDateRangePreset('30d');
                      setTimeout(handleRunBacktest, 50);
                    }}
                    className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 rounded text-[11px] font-sans font-medium transition-colors"
                  >
                    Run 30D Backtest
                  </button>
                </div>
              </div>
            )}

            {/* Backtest Metadata Banner */}
            {backtestResult && (
              <div className="pt-2 flex flex-wrap items-center justify-between gap-3 text-xs font-mono border-t border-slate-800/60 text-slate-400">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  <span>Simulated Window:</span>
                  <strong className="text-slate-200">{backtestResult.startDate || 'Recent'}</strong>
                  <span>→</span>
                  <strong className="text-slate-200">{backtestResult.endDate || 'Current'}</strong>
                  <span className="text-slate-500">
                    ({backtestResult.totalTrades ?? 0} Executions · {backtestResult.timeframe || ltfInterval})
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span>
                    Risk: <strong className="text-slate-200">${riskPerTrade} / trade</strong>
                  </span>
                  <span>
                    Net Profit:{' '}
                    <strong
                      className={
                        (backtestResult.netProfitUsdt ?? 0) >= 0
                          ? 'text-emerald-400 font-bold'
                          : 'text-rose-400 font-bold'
                      }
                    >
                      {(backtestResult.netProfitUsdt ?? 0) >= 0 ? '+' : ''}$
                      {Number(backtestResult.netProfitUsdt ?? 0).toLocaleString()} USDT (
                      {(backtestResult.netProfitR ?? 0) >= 0 ? '+' : ''}
                      {backtestResult.netProfitR ?? 0} R)
                    </strong>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Backtest Results KPI Strip */}
          {backtestResult && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono tabular-nums">
              <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                <span className="text-[11px] font-sans text-slate-400 block">Win Rate</span>
                <span
                  className={`text-xl font-bold ${
                    (backtestResult.winRate ?? 0) >= 50 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {backtestResult.winRate ?? 0}%
                </span>
                <span className="text-[10px] text-slate-500 block">
                  {backtestResult.winningTrades ?? 0}W / {backtestResult.losingTrades ?? 0}L ({backtestResult.totalTrades ?? 0} Trades)
                </span>
              </div>

              <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                <span className="text-[11px] font-sans text-slate-400 block">Net Strategy Return</span>
                <span
                  className={`text-xl font-bold ${
                    (backtestResult.netProfitR ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {(backtestResult.netProfitR ?? 0) >= 0 ? '+' : ''}
                  {backtestResult.netProfitR ?? 0} R
                </span>
                <span
                  className={`text-[10px] block ${
                    (backtestResult.netProfitUsdt ?? 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'
                  }`}
                >
                  {(backtestResult.netProfitUsdt ?? 0) >= 0 ? '+' : ''}$
                  {Number(backtestResult.netProfitUsdt ?? 0).toLocaleString()} USDT
                </span>
              </div>

              <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                <span className="text-[11px] font-sans text-slate-400 block">Profit Factor</span>
                <span className="text-xl font-bold text-sky-400">
                  {backtestResult.profitFactor ?? 0}
                </span>
                <span className="text-[10px] text-slate-500 block">Gross Win / Gross Loss</span>
              </div>

              <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                <span className="text-[11px] font-sans text-slate-400 block">Max Drawdown</span>
                <span className="text-xl font-bold text-rose-400">
                  -{backtestResult.maxDrawdownR ?? 0} R
                </span>
                <span className="text-[10px] text-rose-500/80 block">
                  -${Math.abs(Number(backtestResult.maxDrawdownUsdt ?? 0)).toLocaleString()} USDT
                </span>
              </div>

              <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                <span className="text-[11px] font-sans text-slate-400 block">TP1 Hit Rate (1:2)</span>
                <span className="text-xl font-bold text-emerald-400">
                  {backtestResult.tp1HitRate ?? 0}%
                </span>
                <span className="text-[10px] text-slate-500 block">50% Booked → BE Lock</span>
              </div>

              <div className="bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                <span className="text-[11px] font-sans text-slate-400 block">TP3 Runner Hit (1:4)</span>
                <span className="text-xl font-bold text-emerald-300">
                  {backtestResult.tp3HitRate ?? 0}%
                </span>
                <span className="text-[10px] text-slate-500 block">Full Strategy Max Targets</span>
              </div>
            </div>
          )}

          {/* Rule 5 Deep Diagnostics: "If Failed, Why it Failed" Forensic Panel */}
          {backtestResult && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Failure Category Aggregator */}
              <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <span>Failure Mode Classification ("Why it Failed")</span>
                </h4>
                <p className="text-[11px] text-slate-400">
                  Automated post-mortem diagnostic breakdown for all {backtestResult.losingTrades ?? 0} losing trades in this backtest dataset:
                </p>

                <div className="space-y-2 pt-1 font-mono text-xs">
                  {Object.entries(backtestResult.failureCategorization || {}).map(([cat, count]) => {
                    const labels: Record<string, string> = {
                      TREND_CONTINUATION: 'Trend Momentum Continuation',
                      SECONDARY_SWEEP_STOP_HUNT: 'Secondary Sweep / Stop Hunt',
                      PREMATURE_ENGULFING: 'Premature Engulfing Size',
                      CHOPPY_RANGE_ABSORPTION: 'Choppy Range Absorption',
                      VOLUME_EXHAUSTION_ABSENT: 'Volume Exhaustion Deficit',
                      HIGH_SLIPPAGE_WICK: 'High Slippage Re-Test',
                    };
                    const pct =
                      backtestResult.losingTrades > 0
                        ? Math.round((count / backtestResult.losingTrades) * 100)
                        : 0;

                    return (
                      <div
                        key={cat}
                        className="bg-slate-950/70 p-2.5 rounded border border-slate-800/80 flex items-center justify-between"
                      >
                        <span className="text-slate-300 font-sans text-xs">
                          {labels[cat] ?? cat}
                        </span>
                        <div className="text-right">
                          <strong className="text-rose-400">{count} Trades</strong>{' '}
                          <span className="text-slate-500 text-[11px]">({pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Individual Failed Trade Post-Mortem Card */}
              <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
                <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <HelpCircle className="w-3.5 h-3.5 text-sky-400" />
                  <span>Individual Trade Forensic Post-Mortem</span>
                </h4>

                {selectedFailedTrade && selectedFailedTrade.failureDiagnostic ? (
                  <div className="space-y-3 text-xs">
                    <div className="bg-rose-950/20 border border-rose-800/40 rounded p-3 text-rose-200">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono font-bold text-rose-400 uppercase tracking-wide">
                          {selectedFailedTrade.failureDiagnostic.category.replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {selectedFailedTrade.entryTimeString}
                        </span>
                      </div>
                      <p className="font-sans leading-relaxed">
                        {selectedFailedTrade.failureDiagnostic.summary}
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold text-slate-300">
                        Diagnostic Evidence:
                      </span>
                      <ul className="list-disc pl-4 space-y-1 text-slate-400 text-[11px]">
                        {selectedFailedTrade.failureDiagnostic.evidence.map((ev, i) => (
                          <li key={i}>{ev}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                      <span className="text-[11px] font-semibold text-sky-400 block font-sans">
                        Suggested Optimization Filter:
                      </span>
                      <p className="text-[11px] text-slate-300 font-sans mt-0.5">
                        {selectedFailedTrade.failureDiagnostic.suggestedFilter}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    Select any losing trade from the backtest table below to inspect its forensic failure diagnosis.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Trade Log Table with Time Show & More Details */}
          {backtestResult && backtestResult.trades.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800">
                <div>
                  <h4 className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                    <History className="w-3.5 h-3.5 text-sky-400" />
                    <span>Simulated Execution Log ({backtestResult.trades.length} Executed Trades)</span>
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Click any trade row to view full timestamp chronology, 4H level swept, engulfing metrics, and forensic diagnostics.
                  </p>
                </div>
                <div className="text-xs font-mono text-slate-400 flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span>Win: {backtestResult.winningTrades}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                    <span>Loss: {backtestResult.losingTrades}</span>
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono tabular-nums whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] text-slate-400 bg-slate-950/60">
                      <th className="py-2.5 px-3 font-medium">#</th>
                      <th className="py-2.5 px-3 font-medium">Time (Entry → Exit)</th>
                      <th className="py-2.5 px-3 font-medium">Duration</th>
                      <th className="py-2.5 px-3 font-medium">Direction & 4H Sweep</th>
                      <th className="py-2.5 px-3 text-right font-medium">Entry</th>
                      <th className="py-2.5 px-3 text-right font-medium">Stop Loss</th>
                      <th className="py-2.5 px-3 text-right font-medium">TP Targets</th>
                      <th className="py-2.5 px-3 text-right font-medium">Exit Price & Reason</th>
                      <th className="py-2.5 px-3 text-center font-medium">Strongness</th>
                      <th className="py-2.5 px-3 text-right font-medium">Realized Return</th>
                      <th className="py-2.5 px-3 text-center font-medium">Forensic</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {backtestResult.trades.map((t, idx) => {
                      const isSelected = inspectedTrade?.id === t.id;

                      return (
                        <tr
                          key={t.id}
                          onClick={() => {
                            setInspectedTrade(t);
                            if (!t.isWinner) setSelectedFailedTrade(t);
                          }}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-sky-950/70 text-white border-l-2 border-sky-400'
                              : 'hover:bg-slate-800/50 text-slate-300'
                          }`}
                        >
                          {/* Trade # */}
                          <td className="py-2.5 px-3 text-slate-500 text-[11px]">
                            {idx + 1}
                          </td>

                          {/* Time: Entry -> Exit */}
                          <td className="py-2.5 px-3">
                            <div className="text-slate-200 font-semibold text-[11px]">
                              {t.entryTimeString}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              → {t.exitTimeString}
                            </div>
                          </td>

                          {/* Duration */}
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-300 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
                              <Timer className="w-3 h-3 text-slate-400" />
                              <span>{t.durationString}</span>
                            </span>
                          </td>

                          {/* Direction & 4H Sweep */}
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  t.direction === 'LONG'
                                    ? 'bg-emerald-500/20 text-emerald-400'
                                    : 'bg-rose-500/20 text-rose-400'
                                }`}
                              >
                                {t.direction}
                              </span>
                              <span className="text-[11px] text-slate-300 font-sans">
                                {t.fourHourLevelType === '4H_SWING_HIGH' ? 'High' : 'Low'} Sweep ($
                                {formatPrice(t.fourHourLevel)})
                              </span>
                            </div>
                          </td>

                          {/* Entry Price */}
                          <td className="py-2.5 px-3 text-right text-slate-100 font-bold">
                            ${formatPrice(t.entryPrice)}
                          </td>

                          {/* Stop Loss */}
                          <td className="py-2.5 px-3 text-right">
                            <div className="text-rose-400 font-medium">
                              ${formatPrice(t.stopLoss)}
                            </div>
                            <div className="text-[10px] text-rose-500/80">
                              -{t.riskPercent}%
                            </div>
                          </td>

                          {/* TP Targets */}
                          <td className="py-2.5 px-3 text-right">
                            <div className="text-[11px] text-emerald-400">
                              TP1: ${formatPrice(t.tp1)}{' '}
                              {t.hitTp1 && <span className="text-[10px]">✓</span>}
                            </div>
                            <div className="text-[10px] text-emerald-500">
                              TP2: ${formatPrice(t.tp2)} {t.hitTp2 ? '✓' : ''} · TP3: ${formatPrice(t.tp3)} {t.hitTp3 ? '✓' : ''}
                            </div>
                          </td>

                          {/* Exit Price & Reason */}
                          <td className="py-2.5 px-3 text-right">
                            <div className="text-slate-100 font-semibold">
                              ${formatPrice(t.exitPrice)}
                            </div>
                            <div>
                              <span
                                className={`text-[10px] font-sans px-1.5 py-0.5 rounded ${
                                  t.exitReason === 'TP3_MAX'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : t.exitReason === 'TP2_TRAIL_STOP'
                                    ? 'bg-teal-500/20 text-teal-300'
                                    : t.exitReason === 'TP1_TRAIL_STOP'
                                    ? 'bg-sky-500/20 text-sky-300'
                                    : t.exitReason === 'FULL_STOP_LOSS'
                                    ? 'bg-rose-500/20 text-rose-400'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {t.exitReason.replace(/_/g, ' ')}
                              </span>
                            </div>
                          </td>

                          {/* Strongness Score */}
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                t.strongnessScore >= 80
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : t.strongnessScore >= 68
                                  ? 'bg-sky-500/20 text-sky-400'
                                  : 'bg-amber-500/20 text-amber-400'
                              }`}
                            >
                              {t.strongnessScore}% ({t.strongnessTier})
                            </span>
                          </td>

                          {/* Realized Return */}
                          <td className="py-2.5 px-3 text-right">
                            <div
                              className={`font-bold ${
                                t.netRealizedR > 0
                                  ? 'text-emerald-400'
                                  : t.netRealizedR === 0
                                  ? 'text-slate-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {t.netRealizedR > 0 ? '+' : ''}
                              {t.netRealizedR} R
                            </div>
                            <div
                              className={`text-[10px] ${
                                t.pnlUsdt > 0
                                  ? 'text-emerald-500'
                                  : t.pnlUsdt === 0
                                  ? 'text-slate-500'
                                  : 'text-rose-500'
                              }`}
                            >
                              {t.pnlUsdt > 0 ? '+' : ''}${t.pnlUsdt}
                            </div>
                          </td>

                          {/* Action Button */}
                          <td className="py-2.5 px-3 text-center">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setInspectedTrade(t);
                                if (!t.isWinner) setSelectedFailedTrade(t);
                              }}
                              className={`px-2 py-1 rounded text-[10px] font-sans transition-colors ${
                                isSelected
                                  ? 'bg-sky-600 text-white'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                              }`}
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Inspected Trade Forensic & Execution Roadmap Detail Drawer */}
          {inspectedTrade && (
            <div className="bg-slate-900 border border-slate-700/80 rounded-lg p-4 space-y-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-bold font-mono ${
                      inspectedTrade.direction === 'LONG'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-rose-500/20 text-rose-400'
                    }`}
                  >
                    {inspectedTrade.direction}
                  </span>
                  <h4 className="text-sm font-semibold text-slate-100 font-sans">
                    Trade Inspection: {inspectedTrade.id}
                  </h4>
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                      inspectedTrade.isWinner
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300'
                    }`}
                  >
                    {inspectedTrade.isWinner ? 'WINNING TRADE' : 'LOSING / STOPPED TRADE'}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-slate-400">
                    Duration: <strong className="text-slate-200">{inspectedTrade.durationString}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setInspectedTrade(null)}
                    className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Forensic Execution Step-by-Step Matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 text-xs font-mono tabular-nums">
                {/* Entry */}
                <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans">1. Entry Fill</span>
                  <span className="text-sm font-bold text-slate-100">
                    ${formatPrice(inspectedTrade.entryPrice)}
                  </span>
                  <span className="text-[10px] text-slate-400 block truncate">
                    {inspectedTrade.entryTimeString}
                  </span>
                </div>

                {/* Stop Loss */}
                <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans">2. Stop Loss</span>
                  <span className="text-sm font-bold text-rose-400">
                    ${formatPrice(inspectedTrade.stopLoss)}
                  </span>
                  <span className="text-[10px] text-rose-500 block">
                    -{inspectedTrade.riskPercent}% Risk (${riskPerTrade})
                  </span>
                </div>

                {/* TP1 */}
                <div
                  className={`p-2.5 rounded border ${
                    inspectedTrade.hitTp1
                      ? 'bg-emerald-950/30 border-emerald-700/60'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 uppercase font-sans">3. TP1 (1:2)</span>
                    <span
                      className={`text-[10px] font-bold ${
                        inspectedTrade.hitTp1 ? 'text-emerald-400' : 'text-slate-600'
                      }`}
                    >
                      {inspectedTrade.hitTp1 ? 'HIT ✓' : 'MISSED'}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-emerald-400">
                    ${formatPrice(inspectedTrade.tp1)}
                  </span>
                  <span className="text-[10px] text-slate-400 block">50% Booked → SL to BE</span>
                </div>

                {/* TP2 */}
                <div
                  className={`p-2.5 rounded border ${
                    inspectedTrade.hitTp2
                      ? 'bg-emerald-950/30 border-emerald-700/60'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 uppercase font-sans">4. TP2 (1:3)</span>
                    <span
                      className={`text-[10px] font-bold ${
                        inspectedTrade.hitTp2 ? 'text-emerald-400' : 'text-slate-600'
                      }`}
                    >
                      {inspectedTrade.hitTp2 ? 'HIT ✓' : 'MISSED'}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-emerald-300">
                    ${formatPrice(inspectedTrade.tp2)}
                  </span>
                  <span className="text-[10px] text-slate-400 block">25% Booked</span>
                </div>

                {/* TP3 */}
                <div
                  className={`p-2.5 rounded border ${
                    inspectedTrade.hitTp3
                      ? 'bg-emerald-950/30 border-emerald-700/60'
                      : 'bg-slate-950 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 uppercase font-sans">5. TP3 (1:4)</span>
                    <span
                      className={`text-[10px] font-bold ${
                        inspectedTrade.hitTp3 ? 'text-emerald-400' : 'text-slate-600'
                      }`}
                    >
                      {inspectedTrade.hitTp3 ? 'HIT ✓' : 'MISSED'}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-emerald-300">
                    ${formatPrice(inspectedTrade.tp3)}
                  </span>
                  <span className="text-[10px] text-slate-400 block">25% Runner Target</span>
                </div>

                {/* Final Exit */}
                <div className="bg-slate-950 p-2.5 rounded border border-slate-800">
                  <span className="text-[10px] text-slate-500 block uppercase font-sans">6. Final Realized</span>
                  <span
                    className={`text-sm font-bold ${
                      inspectedTrade.netRealizedR >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {inspectedTrade.netRealizedR >= 0 ? '+' : ''}
                    {inspectedTrade.netRealizedR} R
                  </span>
                  <span
                    className={`text-[10px] block font-bold ${
                      inspectedTrade.pnlUsdt >= 0 ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {inspectedTrade.pnlUsdt >= 0 ? '+' : ''}${inspectedTrade.pnlUsdt} USDT
                  </span>
                </div>
              </div>

              {/* Setup Diagnostics & Failure Post-Mortem */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                {/* Left: Setup & Execution Quality Audit */}
                <div className="bg-slate-950/70 p-3.5 rounded border border-slate-800 space-y-2">
                  <span className="text-[11px] font-semibold text-slate-300 block">
                    Setup & Confirmation Quality
                  </span>
                  <div className="space-y-1.5 text-slate-400 text-xs">
                    <div className="flex justify-between">
                      <span>4H Level Swept:</span>
                      <strong className="text-slate-200 font-mono">
                        {inspectedTrade.fourHourLevelType === '4H_SWING_HIGH' ? 'Swing High' : 'Swing Low'} ($
                        {formatPrice(inspectedTrade.fourHourLevel)})
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Engulfing Volume Surge:</span>
                      <strong className="text-sky-400 font-mono">
                        {inspectedTrade.engulfingVolumeRatio ?? 1.5}x 10-bar SMA
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Engulfing Body Ratio:</span>
                      <strong className="text-slate-200 font-mono">
                        {Math.round((inspectedTrade.engulfingBodyRatio ?? 0.6) * 100)}%
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Signal Strongness Score:</span>
                      <strong className="text-emerald-400 font-mono">
                        {inspectedTrade.strongnessScore}% ({inspectedTrade.strongnessTier})
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Exit Trigger:</span>
                      <strong className="text-slate-200 font-mono">
                        {inspectedTrade.exitReason.replace(/_/g, ' ')} @ ${formatPrice(inspectedTrade.exitPrice)}
                      </strong>
                    </div>
                  </div>
                </div>

                {/* Right: Post-Mortem (Why it Failed) OR Success Summary */}
                <div className="bg-slate-950/70 p-3.5 rounded border border-slate-800 space-y-2">
                  {inspectedTrade.failureDiagnostic ? (
                    <>
                      <div className="flex items-center gap-1.5 text-rose-400 font-semibold text-xs">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        <span>Why it Failed: {inspectedTrade.failureDiagnostic.category.replace(/_/g, ' ')}</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed text-[11px]">
                        {inspectedTrade.failureDiagnostic.summary}
                      </p>
                      <div className="text-[11px] space-y-1 pt-1">
                        <span className="text-slate-400 font-medium">Diagnostic Evidence:</span>
                        <ul className="list-disc pl-4 text-slate-400 text-[10px] space-y-0.5">
                          {inspectedTrade.failureDiagnostic.evidence.map((ev, i) => (
                            <li key={i}>{ev}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="pt-1.5 border-t border-slate-800/80">
                        <span className="text-[10px] text-sky-400 block font-semibold">Suggested Filter:</span>
                        <p className="text-[10px] text-slate-400 mt-0.5">
                          {inspectedTrade.failureDiagnostic.suggestedFilter}
                        </p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-1.5 text-emerald-400 font-semibold text-xs">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Execution Success Breakdown</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed text-[11px]">
                        Reversal confirmed off the 4H sweep with strong institutional absorption. The position
                        reached TP1, moved stop loss to Break-Even, and locked profit without triggering initial stop loss.
                      </p>
                      <div className="text-[11px] space-y-1 pt-1 font-mono text-slate-400">
                        <div>• Trailing Defense: Break-Even safety armed after TP1 (1:2) fill</div>
                        <div>• Weighted R:R: 1 : 2.75 realized across scaled target brackets</div>
                        <div>• Total Duration: {inspectedTrade.durationString} in active trend</div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SIGNAL LEDGER & STRONGENESS SCORING (Rule 6) */}
      {activeTab === 'LEDGER' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-sky-400" />
                <span>Strategy Signal Ledger & Execution History</span>
              </h3>
              <p className="text-[11px] text-slate-400">
                Persistent audit log of all generated 4H sweep setups, signal strongness scores, and tiered target outcomes
              </p>
            </div>

            <div className="flex items-center gap-3">
              {onNavigateToSignalsHub && (
                <button
                  type="button"
                  onClick={onNavigateToSignalsHub}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-purple-200 bg-purple-950/80 hover:bg-purple-900 border border-purple-700/80 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>View in Centralized Signals Hub</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setLocalSignalLedger([]);
                  try {
                    localStorage.removeItem('vp_fractal_signal_ledger');
                  } catch {
                    // ignore
                  }
                }}
                className="text-xs text-slate-500 hover:text-slate-300 underline font-mono"
              >
                Clear Ledger
              </button>
            </div>
          </div>

          {signalLedger.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 font-sans">
              No trade signals have been logged yet. As the AI Agent detects 4H liquidity sweeps and lower timeframe engulfing candles, they will appear here automatically.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400">
                    <th className="py-2 pr-2 font-medium">Date & Time</th>
                    <th className="py-2 px-2 font-medium">Asset</th>
                    <th className="py-2 px-2 font-medium">Setup Type</th>
                    <th className="py-2 px-2 text-right font-medium">Entry</th>
                    <th className="py-2 px-2 text-right font-medium">Stop Loss</th>
                    <th className="py-2 px-2 text-right font-medium">TP1 (50%)</th>
                    <th className="py-2 px-2 text-center font-medium">Strongness</th>
                    <th className="py-2 pl-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {signalLedger.map((sig) => (
                    <tr key={sig.id} className="hover:bg-slate-800/30 text-slate-300">
                      <td className="py-2.5 pr-2 text-slate-300 text-[11px] whitespace-nowrap">
                        {formatSignalDateTime(sig)}
                      </td>
                      <td className="py-2.5 px-2 font-sans font-semibold text-slate-100">
                        {sig.symbol}
                      </td>
                      <td className="py-2.5 px-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            sig.direction === 'LONG'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {sig.direction} ({sig.timeframe})
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-right text-slate-100 font-bold">
                        ${formatPrice(sig.entryPrice)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-rose-400">
                        ${formatPrice(sig.stopLoss)}
                      </td>
                      <td className="py-2.5 px-2 text-right text-emerald-400">
                        ${formatPrice(sig.tp1)}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            sig.strongnessScore >= 80
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : sig.strongnessScore >= 68
                              ? 'bg-sky-500/20 text-sky-400'
                              : 'bg-amber-500/20 text-amber-400'
                          }`}
                        >
                          {sig.strongnessScore}% ({sig.strongnessTier})
                        </span>
                      </td>
                      <td className="py-2.5 pl-2 text-right">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400">
                          <CheckCircle2 className="w-3 h-3 text-sky-400" />
                          <span>{sig.status}</span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
