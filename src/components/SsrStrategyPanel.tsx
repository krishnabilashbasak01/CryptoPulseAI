/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Sweep, Shift, and Return (SSR) — Institutional Trading Terminal
 * Implements 3-Phase SMC Order Flow Dynamics:
 *  - Phase 1: Liquidity Sweep (BSL / SSL) with Rejection Confirmation
 *  - Phase 2: Market Structure Shift (MSS) Displacement
 *  - Phase 3: Fair Value Gap (FVG) Proximal Retracement Entry
 *  - Invalidation: Strict Stop Loss at Sweep Extreme
 *  - Strategy Success Evaluation & Mathematical Expectancy Analysis
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Clock,
  Compass,
  DollarSign,
  History,
  Info,
  Layers,
  Play,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Zap,
  Percent,
  Calculator,
  ChevronRight,
  ExternalLink,
  Flame,
  AlertTriangle,
  RefreshCw,
  Radio,
  Search,
  Volume2,
  VolumeX,
  Eye,
  Check,
  Plus,
} from 'lucide-react';
import {
  runSsrBacktest,
  findLiveSsrSignal,
  scanSsrAssetStatus,
  calculateSsrPositionSize,
  formatSsrPrice,
  formatSsrTime,
  formatSsrDisplayDateTime,
  type SsrSignal,
  type SsrAssetScanResult,
  type SsrPhase,
  type SsrBacktestSummary,
  type SsrBacktestTrade,
  type SsrPositionSizingResult,
} from '../utils/ssrStrategy';
import { Candle, CryptoTicker } from '../utils/quant';

interface SsrStrategyPanelProps {
  selectedSymbol: string;
  tickers: CryptoTicker[];
  candlesHTF: Candle[]; // 1h or 4h
  candlesLTF: Candle[]; // 5m or 3m
  onSelectSymbol: (symbol: string) => void;
  onAddAlert?: (alert: any) => void;
  isActive: boolean;
}

export const SsrStrategyPanel: React.FC<SsrStrategyPanelProps> = ({
  selectedSymbol,
  tickers,
  candlesHTF,
  candlesLTF,
  onSelectSymbol,
  onAddAlert,
  isActive,
}) => {
  // Navigation Sub-Tabs
  const [activeTab, setActiveTab] = useState<'LIVE' | 'BACKTEST' | 'HISTORY' | 'FORWARD_LEDGER' | 'CALCULATOR'>('LIVE');

  // Timeframe Configuration
  const [timeframeLTF, setTimeframeLTF] = useState<'5m' | '3m' | '1m'>('5m');
  const [timeframeHTF, setTimeframeHTF] = useState<'1h' | '4h'>('1h');

  // Account & Risk Parameters (Default: $10,000 account, 1% risk = $100)
  const [accountEquity, setAccountEquity] = useState<number>(10000);
  const [riskPercent, setRiskPercent] = useState<number>(1.0);
  const riskAmountUsdt = useMemo(() => (accountEquity * riskPercent) / 100, [accountEquity, riskPercent]);

  // Backtest Controls
  const [dateRangePreset, setDateRangePreset] = useState<'24h' | '3d' | '7d' | '14d' | '30d' | 'custom'>('7d');
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [isBacktesting, setIsBacktesting] = useState<boolean>(false);
  const [backtestProgress, setBacktestProgress] = useState<number>(0);
  const [backtestStage, setBacktestStage] = useState<string>('');
  const [backtestResult, setBacktestResult] = useState<SsrBacktestSummary | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<SsrBacktestTrade | null>(null);

  // Stored Backtests Repository
  const [savedBacktests, setSavedBacktests] = useState<SsrBacktestSummary[]>(() => {
    try {
      const stored = localStorage.getItem('vp_ssr_saved_backtests');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Forward Live Signals Ledger (Paper Trading Log)
  const [forwardLedger, setForwardLedger] = useState<SsrSignal[]>(() => {
    try {
      const stored = localStorage.getItem('vp_ssr_forward_ledger');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Live Scanner & Continuous Auto-Scan Engine States
  const [scannerSignals, setScannerSignals] = useState<SsrSignal[]>([]);
  const [allAssetStatuses, setAllAssetStatuses] = useState<SsrAssetScanResult[]>([]);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [autoScanEnabled, setAutoScanEnabled] = useState<boolean>(true);
  const [scanIntervalSec, setScanIntervalSec] = useState<number>(10);
  const [countdown, setCountdown] = useState<number>(10);
  const [lastScanTime, setLastScanTime] = useState<number | null>(null);
  const [filterPhase, setFilterPhase] = useState<'ALL' | 'ACTIVE_SETUPS' | 'PHASE_3_FVG_RETURN' | 'PHASE_2_MSS' | 'PHASE_1_SWEEP' | 'INSIDE_RANGE'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [recentAlertBanner, setRecentAlertBanner] = useState<{
    message: string;
    symbol: string;
    phase: string;
    time: number;
  } | null>(null);

  // Position Sizing Calculator Inputs
  const [calcEntry, setCalcEntry] = useState<number>(0);
  const [calcSL, setCalcSL] = useState<number>(0);

  // Active Symbol Price
  const currentTicker = tickers.find((t) => t.symbol === selectedSymbol);
  const currentPrice = currentTicker?.lastPrice || (candlesLTF.length > 0 ? candlesLTF[candlesLTF.length - 1].close : 100);

  // Live SSR Candidate for current selected symbol
  const activeSignal: SsrSignal | null = useMemo(() => {
    if (candlesHTF.length < 15 || candlesLTF.length < 25) return null;
    return findLiveSsrSignal(candlesHTF, candlesLTF, selectedSymbol, riskAmountUsdt);
  }, [candlesHTF, candlesLTF, selectedSymbol, riskAmountUsdt]);

  // Selected Asset Comprehensive SMC Status
  const selectedAssetStatus: SsrAssetScanResult | null = useMemo(() => {
    const fromScan = allAssetStatuses.find((s) => s.symbol.toUpperCase() === selectedSymbol.toUpperCase());
    if (fromScan) return fromScan;
    if (candlesHTF.length >= 10 && candlesLTF.length >= 10) {
      return scanSsrAssetStatus(candlesHTF, candlesLTF, selectedSymbol, riskAmountUsdt);
    }
    return null;
  }, [allAssetStatuses, selectedSymbol, candlesHTF, candlesLTF, riskAmountUsdt]);

  // Web Audio Alert Chime for Phase 3 Detection
  const playAlertChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // Audio playback blocked or unavailable
    }
  }, []);

  // Sync calculator defaults with active signal
  useEffect(() => {
    if (activeSignal) {
      setCalcEntry(activeSignal.entryPrice);
      setCalcSL(activeSignal.stopLoss);
    } else if (currentPrice > 0 && calcEntry === 0) {
      setCalcEntry(currentPrice);
      setCalcSL(Number((currentPrice * 0.985).toFixed(2)));
    }
  }, [activeSignal, currentPrice]);

  // Save Backtest Runs to Storage
  const persistBacktest = useCallback((summary: SsrBacktestSummary) => {
    setSavedBacktests((prev) => {
      const updated = [summary, ...prev.filter((s) => s.id !== summary.id)].slice(0, 20);
      try {
        localStorage.setItem('vp_ssr_saved_backtests', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  }, []);

  // Save Forward Signals to Storage
  const persistSignal = useCallback((sig: SsrSignal) => {
    setForwardLedger((prev) => {
      const updated = [sig, ...prev.filter((s) => s.id !== sig.id)].slice(0, 50);
      try {
        localStorage.setItem('vp_ssr_forward_ledger', JSON.stringify(updated));
      } catch {
        // ignore
      }
      return updated;
    });
  }, []);

  // --------------------------------------------------------------------------
  // Multi-Coin Live Scanner Execution
  // --------------------------------------------------------------------------
  const runLiveScan = useCallback(async (isManual = false) => {
    setIsScanning(true);
    try {
      const url = `/api/ssr/scan?activeSymbol=${encodeURIComponent(selectedSymbol)}${isManual ? '&force=true' : ''}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        
        // Merge with live ticker prices/volumes
        if (Array.isArray(data.assetStatuses)) {
          const tickerMap = new Map<string, CryptoTicker>();
          tickers.forEach((t) => tickerMap.set(t.symbol.toUpperCase(), t));

          const decorated: SsrAssetScanResult[] = data.assetStatuses.map((st: SsrAssetScanResult) => {
            const t = tickerMap.get(st.symbol.toUpperCase());
            return {
              ...st,
              priceChangePercent24h: t?.priceChangePercent,
              quoteVolume24h: t?.quoteVolume,
              currentPrice: t?.lastPrice || st.currentPrice,
            };
          });

          setAllAssetStatuses(decorated);
        }

        if (Array.isArray(data.signals)) {
          setScannerSignals(data.signals);

          // If new Phase 3 signal detected, trigger banner & chime
          if (data.signals.length > 0) {
            const top = data.signals[0];
            setRecentAlertBanner({
              message: `${top.symbol} triggered Phase 3 ${top.direction} Limit Entry at $${top.entryPrice.toLocaleString()} (Tier ${top.confidenceTier})`,
              symbol: top.symbol,
              phase: 'PHASE_3_FVG_RETURN',
              time: Date.now(),
            });
            if (soundEnabled) {
              playAlertChime();
            }
          }

          // Automatically register high-conviction signals to forward ledger
          data.signals.forEach((sig: SsrSignal) => {
            if (sig.confidenceTier === 'A+') {
              persistSignal(sig);
            }
          });
        }

        setLastScanTime(Date.now());
      }
    } catch (err) {
      console.error('SSR live scan failed:', err);
    } finally {
      setIsScanning(false);
      setCountdown(scanIntervalSec);
    }
  }, [selectedSymbol, tickers, soundEnabled, playAlertChime, persistSignal, scanIntervalSec]);

  // Recurring Auto-Scan Countdown Loop
  useEffect(() => {
    if (!isActive) return;

    // Run initial scan immediately if no assets loaded yet
    if (allAssetStatuses.length === 0) {
      runLiveScan(false);
    }

    if (!autoScanEnabled) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          runLiveScan(false);
          return scanIntervalSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, autoScanEnabled, scanIntervalSec, allAssetStatuses.length, runLiveScan]);

  // Evaluate Forward Signals Against Live Market Prices
  useEffect(() => {
    if (tickers.length === 0 || forwardLedger.length === 0) return;

    let hasUpdates = false;
    const tickerMap = new Map<string, CryptoTicker>();
    tickers.forEach((t) => tickerMap.set(t.symbol.toUpperCase(), t));

    const updated = forwardLedger.map((sig) => {
      if (sig.status !== 'ACTIVE') return sig;
      const t = tickerMap.get(sig.symbol.toUpperCase());
      if (!t) return sig;

      const p = t.lastPrice;
      const high = t.highPrice;
      const low = t.lowPrice;

      if (sig.direction === 'LONG') {
        if (low <= sig.stopLoss) {
          hasUpdates = true;
          return {
            ...sig,
            status: 'STOPPED_OUT' as const,
            currentPrice: p,
            exitPrice: sig.stopLoss,
            realizedR: -1.0,
            exitTime: Date.now(),
            exitReason: 'Full Stop Loss',
          };
        }
        if (high >= sig.tp3) {
          hasUpdates = true;
          return {
            ...sig,
            status: 'HIT_TP3' as const,
            currentPrice: p,
            exitPrice: sig.tp3,
            realizedR: 2.75,
            exitTime: Date.now(),
            exitReason: 'TP3 Max Runner',
          };
        }
        if (high >= sig.tp2) {
          hasUpdates = true;
          return {
            ...sig,
            status: 'HIT_TP2' as const,
            currentPrice: p,
            exitPrice: sig.tp2,
            realizedR: 1.75,
            exitTime: Date.now(),
            exitReason: 'TP2 Target 1:3',
          };
        }
        if (high >= sig.tp1) {
          hasUpdates = true;
          return {
            ...sig,
            status: 'HIT_TP1' as const,
            currentPrice: p,
            exitPrice: sig.tp1,
            realizedR: 1.0,
            exitTime: Date.now(),
            exitReason: 'TP1 50% Scaled + BE Lock',
          };
        }
      } else {
        // SHORT
        if (high >= sig.stopLoss) {
          hasUpdates = true;
          return {
            ...sig,
            status: 'STOPPED_OUT' as const,
            currentPrice: p,
            exitPrice: sig.stopLoss,
            realizedR: -1.0,
            exitTime: Date.now(),
            exitReason: 'Full Stop Loss',
          };
        }
        if (low <= sig.tp3) {
          hasUpdates = true;
          return {
            ...sig,
            status: 'HIT_TP3' as const,
            currentPrice: p,
            exitPrice: sig.tp3,
            realizedR: 2.75,
            exitTime: Date.now(),
            exitReason: 'TP3 Max Runner',
          };
        }
        if (low <= sig.tp2) {
          hasUpdates = true;
          return {
            ...sig,
            status: 'HIT_TP2' as const,
            currentPrice: p,
            exitPrice: sig.tp2,
            realizedR: 1.75,
            exitTime: Date.now(),
            exitReason: 'TP2 Target 1:3',
          };
        }
        if (low <= sig.tp1) {
          hasUpdates = true;
          return {
            ...sig,
            status: 'HIT_TP1' as const,
            currentPrice: p,
            exitPrice: sig.tp1,
            realizedR: 1.0,
            exitTime: Date.now(),
            exitReason: 'TP1 50% Scaled + BE Lock',
          };
        }
      }

      return { ...sig, currentPrice: p };
    });

    if (hasUpdates) {
      setForwardLedger(updated);
      try {
        localStorage.setItem('vp_ssr_forward_ledger', JSON.stringify(updated));
      } catch {
        // ignore
      }
    }
  }, [tickers, forwardLedger]);

  // --------------------------------------------------------------------------
  // Backtest Execution
  // --------------------------------------------------------------------------
  const handleRunBacktest = async () => {
    setIsBacktesting(true);
    setBacktestProgress(15);
    setBacktestStage('Fetching multi-timeframe 1H & 5m datasets...');

    const timer = setInterval(() => {
      setBacktestProgress((prev) => {
        const next = Math.min(92, prev + Math.floor(Math.random() * 12) + 5);
        if (next >= 75) setBacktestStage('Evaluating FVG limit fills & tiered exits...');
        else if (next >= 45) setBacktestStage('Scanning BSL/SSL sweeps & MSS displacement...');
        return next;
      });
    }, 180);

    try {
      let summary: SsrBacktestSummary | null = null;

      // 1. Try server-side backtest API
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 28000);

        const res = await fetch('/api/ssr/backtest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            symbol: selectedSymbol,
            timeframeLTF,
            timeframeHTF,
            dateRangePreset,
            customStart,
            customEnd,
            riskPerTrade: riskAmountUsdt,
            accountEquity,
            maxHoldBars: 72,
          }),
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.backtest) {
            summary = data.backtest;
          }
        }
      } catch {
        // fallback to local execution below
      }

      // 2. Local fallback if server unreachable
      if (!summary) {
        setBacktestStage('Running local SSR institutional state machine...');
        const now = Date.now();
        let startTimeMs = now - 7 * 24 * 3600 * 1000;
        let endTimeMs = now;
        if (dateRangePreset === '24h') startTimeMs = now - 24 * 3600 * 1000;
        else if (dateRangePreset === '3d') startTimeMs = now - 3 * 24 * 3600 * 1000;
        else if (dateRangePreset === '14d') startTimeMs = now - 14 * 24 * 3600 * 1000;
        else if (dateRangePreset === '30d') startTimeMs = now - 30 * 24 * 3600 * 1000;
        else if (dateRangePreset === 'custom' && customStart && customEnd) {
          startTimeMs = new Date(customStart).getTime();
          endTimeMs = new Date(customEnd).getTime() + (24 * 3600 * 1000 - 1);
        }

        summary = runSsrBacktest({
          symbol: selectedSymbol,
          timeframeLTF,
          timeframeHTF,
          candlesHTF,
          candlesLTF,
          startTimeMs,
          endTimeMs,
          dateRangePreset,
          riskPerTradeUsdt: riskAmountUsdt,
          accountEquityUsdt: accountEquity,
          maxHoldBars: 72,
        });
      }

      clearInterval(timer);
      setBacktestProgress(100);
      setBacktestStage('Simulation complete! Analyzing statistical expectancy...');
      setBacktestResult(summary);
      setSelectedTrade(summary.trades[0] || null);
      persistBacktest(summary);
    } catch (err: any) {
      clearInterval(timer);
      setBacktestStage('Backtest encounter an issue. Please retry.');
    } finally {
      setIsBacktesting(false);
    }
  };

  // --------------------------------------------------------------------------
  // Position Sizing Computation
  // --------------------------------------------------------------------------
  const positionSizing: SsrPositionSizingResult = useMemo(() => {
    return calculateSsrPositionSize(calcEntry, calcSL, accountEquity, riskPercent, 0.0005);
  }, [calcEntry, calcSL, accountEquity, riskPercent]);

  return (
    <div className="space-y-6 text-slate-200">
      {/* ==================================================================== */}
      {/* 1. Header & Institutional Philosophy Banner                          */}
      {/* ==================================================================== */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[11px] font-mono font-semibold tracking-wide flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5" />
                <span>INSTITUTIONAL SMC ENGINE · 2026 EDITION</span>
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-mono">
                100% Free · 0 AI Credits
              </span>
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight mt-1.5 flex items-center gap-2">
              <span>Sweep, Shift, and Return (SSR) Trading System</span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Algorithmic exploitation of retail breakout traps. Captures institutional order flow shifts across Higher Timeframe Liquidity Pools, validates displacement market structure breaks, and enters precision limit orders at Fair Value Gap (FVG) proximal boundaries.
            </p>
          </div>

          {/* Asset & Capital Config Strip */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg">
            <div>
              <span className="text-[10px] uppercase font-mono text-slate-500 block">Selected Asset</span>
              <select
                value={selectedSymbol}
                onChange={(e) => onSelectSymbol(e.target.value)}
                className="bg-transparent text-sm font-bold text-white font-mono focus:outline-none cursor-pointer"
              >
                {tickers.map((t) => (
                  <option key={t.symbol} value={t.symbol} className="bg-slate-900 text-white">
                    {t.symbol} (${t.lastPrice.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            <div className="border-l border-slate-800 pl-3">
              <span className="text-[10px] uppercase font-mono text-slate-500 block">Equity Capital</span>
              <div className="flex items-center gap-1 text-sm font-bold font-mono text-slate-200">
                <span>$</span>
                <input
                  type="number"
                  value={accountEquity}
                  onChange={(e) => setAccountEquity(Math.max(100, Number(e.target.value)))}
                  className="w-20 bg-transparent text-slate-200 font-mono text-sm focus:outline-none"
                />
              </div>
            </div>

            <div className="border-l border-slate-800 pl-3">
              <span className="text-[10px] uppercase font-mono text-slate-500 block">Risk Per Trade</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-mono font-bold text-emerald-400">1.0%</span>
                <span className="text-[11px] text-slate-400 font-mono">(${riskAmountUsdt} USDT)</span>
              </div>
            </div>
          </div>
        </div>

        {/* The 3-Phase State Machine Stepper */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-4">
          <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800/80">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold text-indigo-300 font-mono flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-indigo-400" />
                <span>PHASE 1: LIQUIDITY SWEEP</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">{timeframeHTF.toUpperCase()} Swings</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal mt-1">
              Scans for price action piercing prior prominent swing high (BSL) or low (SSL) pools, but strictly failing to close beyond it (rejection wick).
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800/80">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold text-sky-300 font-mono flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-sky-400" />
                <span>PHASE 2: STRUCTURE SHIFT (MSS)</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">Displacement</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal mt-1">
              Price aggressively reverses with heavy volume displacement, decisively breaking the immediate opposing swing point (Change of Character).
            </p>
          </div>

          <div className="p-3 rounded-lg bg-slate-900/70 border border-slate-800/80">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold text-emerald-300 font-mono flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>PHASE 3: FVG RETURN & ENTRY</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">Proximal Edge</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal mt-1">
              Limit order placed at proximal edge of the Fair Value Gap imbalance. Stop loss placed strictly at the sweep extreme. Tiered exits at 1:2, 1:3, 1:4.
            </p>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. Navigation Sub-Tabs                                               */}
      {/* ==================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('LIVE')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold font-mono flex items-center gap-1.5 transition-colors ${
              activeTab === 'LIVE'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Live Scanner & Setups</span>
            {scannerSignals.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-indigo-400/20 text-indigo-300 text-[10px]">
                {scannerSignals.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('BACKTEST')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold font-mono flex items-center gap-1.5 transition-colors ${
              activeTab === 'BACKTEST'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Backtest Simulator & Success Analysis</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('FORWARD_LEDGER')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold font-mono flex items-center gap-1.5 transition-colors ${
              activeTab === 'FORWARD_LEDGER'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Forward Signal Ledger ({forwardLedger.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('HISTORY')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold font-mono flex items-center gap-1.5 transition-colors ${
              activeTab === 'HISTORY'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Stored Backtest Runs ({savedBacktests.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CALCULATOR')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold font-mono flex items-center gap-1.5 transition-colors ${
              activeTab === 'CALCULATOR'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Risk & Fee Calculator</span>
          </button>
        </div>

        {/* Continuous Auto-Scan Controller Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Auto-Scan Toggle Switch */}
          <button
            type="button"
            onClick={() => setAutoScanEnabled((prev) => !prev)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono font-semibold flex items-center gap-2 transition-all ${
              autoScanEnabled
                ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300 shadow-sm shadow-emerald-950'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300'
            }`}
          >
            <span className="relative flex h-2 w-2">
              {autoScanEnabled && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${autoScanEnabled ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
            </span>
            <span>{autoScanEnabled ? 'Auto-Scan ON' : 'Auto-Scan PAUSED'}</span>
          </button>

          {/* Countdown & Interval Selector */}
          {autoScanEnabled && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300">
              <Clock className="w-3 h-3 text-sky-400 animate-pulse" />
              <span>Auto-scan in: <strong className="text-white font-bold">{countdown}s</strong></span>
              <div className="flex items-center ml-1 pl-1.5 border-l border-slate-800 gap-1 text-[10px]">
                {[8, 10, 15, 30].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => {
                      setScanIntervalSec(sec);
                      setCountdown(sec);
                    }}
                    className={`px-1.5 py-0.5 rounded transition-colors ${
                      scanIntervalSec === sec
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sound Alert Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg border text-xs font-mono flex items-center gap-1.5 transition-colors ${
              soundEnabled
                ? 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
                : 'bg-slate-900/60 border-slate-800 text-slate-500'
            }`}
            title={soundEnabled ? 'Audio alerts enabled for Phase 3 setups' : 'Audio alerts muted'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
          </button>

          {/* Instant Manual Rescan Button */}
          <button
            type="button"
            onClick={() => runLiveScan(true)}
            disabled={isScanning}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono text-slate-300 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 text-indigo-400 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'Scanning All 20 Coins...' : 'Scan All Coins'}</span>
          </button>
        </div>
      </div>

      {/* Real-time Institutional Alert Banner */}
      {recentAlertBanner && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-xl p-3.5 flex items-center justify-between text-xs font-mono text-emerald-200">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="font-bold text-white uppercase tracking-wider">⚡ Institutional Alert:</span>
            <span>{recentAlertBanner.message}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onSelectSymbol(recentAlertBanner.symbol);
                setRecentAlertBanner(null);
              }}
              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold transition-colors"
            >
              Inspect Setup
            </button>
            <button
              type="button"
              onClick={() => setRecentAlertBanner(null)}
              className="text-slate-400 hover:text-white text-xs px-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. TAB 1: Live Scanner & Signal Execution Terminal                   */}
      {/* ==================================================================== */}
      {activeTab === 'LIVE' && (
        <div className="space-y-6">
          {/* Active Setup Card for Selected Asset */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wide">
                  Live Execution Watch · {selectedSymbol} ({timeframeHTF} Narrative + {timeframeLTF} Trigger)
                </span>
                <h3 className="text-base font-bold text-white flex items-center gap-2 mt-0.5">
                  <span>Current Status:</span>
                  {activeSignal ? (
                    <span className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold flex items-center gap-1.5 ${
                      activeSignal.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      {activeSignal.direction} SETUP READY (Phase 3 FVG Return)
                    </span>
                  ) : selectedAssetStatus?.phase === 'PHASE_2_MSS' ? (
                    <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                      Phase 2: MSS Displacement Confirmed ({selectedAssetStatus.direction})
                    </span>
                  ) : selectedAssetStatus?.phase === 'PHASE_1_SWEEP' ? (
                    <span className="px-2.5 py-0.5 rounded text-xs font-mono font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                      Phase 1: Liquidity Swept ({selectedAssetStatus.liquidityPoolType})
                    </span>
                  ) : (
                    <span className="text-slate-400 font-mono text-xs font-normal flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                      Surveillance Active · Inside Structural Range
                    </span>
                  )}
                </h3>
              </div>

              {activeSignal && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => persistSignal(activeSignal)}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Save to Forward Ledger</span>
                  </button>
                </div>
              )}
            </div>

            {/* Active Setup Metrics Grid */}
            {activeSignal ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {/* Left 8 cols: Signal Execution Specs */}
                <div className="lg:col-span-8 bg-slate-900/90 border border-slate-800 rounded-lg p-4 space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono tabular-nums">
                    <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800/80">
                      <span className="text-[10px] text-slate-500 block">ENTRY (FVG Proximal)</span>
                      <strong className="text-sm text-sky-400 font-bold">${activeSignal.entryPrice.toLocaleString()}</strong>
                    </div>

                    <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800/80">
                      <span className="text-[10px] text-slate-500 block">STOP LOSS (Sweep Extreme)</span>
                      <strong className="text-sm text-rose-400 font-bold">${activeSignal.stopLoss.toLocaleString()}</strong>
                      <span className="text-[10px] text-slate-500 block">({activeSignal.riskPercent}%)</span>
                    </div>

                    <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800/80">
                      <span className="text-[10px] text-slate-500 block">TP1 (1:2 R · 50% + BE)</span>
                      <strong className="text-sm text-emerald-400 font-bold">${activeSignal.tp1.toLocaleString()}</strong>
                      <span className="text-[10px] text-emerald-500 block">+2.0R</span>
                    </div>

                    <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800/80">
                      <span className="text-[10px] text-slate-500 block">TP3 (1:4 R · Runner)</span>
                      <strong className="text-sm text-emerald-300 font-bold">${activeSignal.tp3.toLocaleString()}</strong>
                      <span className="text-[10px] text-emerald-400 block">+4.0R</span>
                    </div>
                  </div>

                  {/* SMC Structural Attributes */}
                  <div className="p-3 rounded bg-slate-950/40 border border-slate-800/60 space-y-1.5 text-xs font-mono">
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Phase 1 Swept Level:</span>
                      <span className="text-slate-200 font-bold">${activeSignal.sweptLevel.toLocaleString()} ({activeSignal.liquidityPoolType})</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Phase 2 Market Structure Shift (MSS):</span>
                      <span className="text-slate-200 font-bold">${activeSignal.mssLevel.toLocaleString()} (Displacement Score: {activeSignal.displacementScore}x)</span>
                    </div>
                    <div className="flex items-center justify-between text-slate-400">
                      <span>Phase 3 Fair Value Gap (FVG):</span>
                      <span className="text-slate-200 font-bold">${activeSignal.fvgDistal.toLocaleString()} → ${activeSignal.fvgProximal.toLocaleString()} ({activeSignal.fvgSizePercent}% Imbalance)</span>
                    </div>
                  </div>

                  {/* Key Institutional Reasoning Bullet Points */}
                  <div className="space-y-1">
                    <span className="text-[11px] font-mono text-slate-400 font-semibold uppercase">Institutional Audit Trail:</span>
                    <ul className="space-y-1 text-xs text-slate-300 font-sans">
                      {activeSignal.keyFactors.map((f, idx) => (
                        <li key={idx} className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* Right 4 cols: Position Sizing Preview & Fee Drag */}
                <div className="lg:col-span-4 bg-slate-900/90 border border-slate-800 rounded-lg p-4 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <span className="font-bold text-slate-200">Execution Sizing</span>
                    <span className="text-[10px] text-emerald-400 font-bold">1% Equity Risk</span>
                  </div>

                  <div className="space-y-2 text-slate-400">
                    <div className="flex items-center justify-between">
                      <span>Raw Risk:</span>
                      <span className="text-slate-200 font-bold">${riskAmountUsdt} USDT</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Taker Fee Cushion:</span>
                      <span className="text-amber-400 font-bold">-${positionSizing.estimatedFeeDragUsdt} USDT (0.10%)</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-800/60 pt-1.5">
                      <span className="text-slate-300 font-bold">Net Risk Allocation:</span>
                      <span className="text-emerald-400 font-bold">${positionSizing.netRiskUsdt} USDT</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Position Quantity:</span>
                      <span className="text-slate-100 font-bold">{positionSizing.positionQuantity} {selectedSymbol.replace('USDT', '')}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Notional Exposure:</span>
                      <span className="text-slate-100 font-bold">${positionSizing.positionNotionalUsdt.toLocaleString()} USDT</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Recommended Leverage:</span>
                      <span className="text-sky-400 font-bold">{positionSizing.recommendedLeverage}x Isolated</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded bg-slate-950/80 border border-slate-800 text-[11px] text-slate-400">
                    <span className="text-slate-300 font-bold block mb-1">Exchange Race Condition Fix:</span>
                    Place Market/Limit Order first, wait 1s for Binance matching engine confirmation, then dispatch Stop-Loss bracket to prevent margin rejection errors.
                  </div>
                </div>
              </div>
            ) : selectedAssetStatus?.phase === 'PHASE_2_MSS' ? (
              <div className="p-5 bg-sky-950/20 border border-sky-500/30 rounded-lg space-y-3 font-mono">
                <div className="flex items-center justify-between pb-2 border-b border-sky-800/30">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-sky-400" />
                    <span className="text-sm font-bold text-white">Phase 2: Market Structure Shift (MSS) Active</span>
                  </div>
                  <span className="text-xs text-sky-300 px-2 py-0.5 rounded bg-sky-900/40">Direction: {selectedAssetStatus.direction}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  Institutional displacement broke the opposing structural level at <strong className="text-sky-300">${selectedAssetStatus.mssLevel}</strong> with <strong className="text-sky-300">{selectedAssetStatus.displacementRatio}x</strong> average range. Price is now consolidating. The limit entry will arm automatically when price retraces into the FVG Proximal edge.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                  <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Swept HTF Pool:</span>
                    <strong className="text-white">${selectedAssetStatus.sweptLevel} ({selectedAssetStatus.liquidityPoolType})</strong>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Structural Break (MSS):</span>
                    <strong className="text-sky-400">${selectedAssetStatus.mssLevel}</strong>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Invalidation Stop Extreme:</span>
                    <strong className="text-rose-400">${selectedAssetStatus.sweepExtreme}</strong>
                  </div>
                </div>
              </div>
            ) : selectedAssetStatus?.phase === 'PHASE_1_SWEEP' ? (
              <div className="p-5 bg-purple-950/20 border border-purple-500/30 rounded-lg space-y-3 font-mono">
                <div className="flex items-center justify-between pb-2 border-b border-purple-800/30">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-bold text-white">Phase 1: Liquidity Pool Swept</span>
                  </div>
                  <span className="text-xs text-purple-300 px-2 py-0.5 rounded bg-purple-900/40">{selectedAssetStatus.liquidityPoolType} Pool</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  Price pierced the prominent {selectedAssetStatus.liquidityPoolType} liquidity pool at <strong className="text-purple-300">${selectedAssetStatus.sweptLevel}</strong> and formed a decisive rejection wick back inside at <strong className="text-purple-300">${selectedAssetStatus.sweepExtreme}</strong>. The SMC engine is monitoring 5m bars for institutional MSS displacement to trigger Phase 2.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-xs">
                  <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Swept Pool Level:</span>
                    <strong className="text-white">${selectedAssetStatus.sweptLevel}</strong>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Rejection Extreme Wick:</span>
                    <strong className="text-purple-400">${selectedAssetStatus.sweepExtreme}</strong>
                  </div>
                  <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
                    <span className="text-[10px] text-slate-400 block">Pending Confirmation:</span>
                    <strong className="text-amber-400">MSS Displacement Bar</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 bg-slate-900/40 border border-slate-800 rounded-lg space-y-3 font-mono">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-semibold text-slate-200">{selectedSymbol} Structural Surveillance</span>
                  </div>
                  <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    Auto-Scanning 20 Binance markets in background · Next tick in {countdown}s
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed font-sans">
                  Price is currently inside its structural trading range between higher-timeframe swing points. The institutional engine requires a decisive BSL/SSL liquidity sweep with a rejection wick before executing the 3-phase sequence.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                  <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Overhead Buy-Side Liquidity (BSL):</span>
                      <strong className="text-slate-200 text-sm font-bold">
                        {selectedAssetStatus?.nearestBsl ? `$${selectedAssetStatus.nearestBsl.toLocaleString()}` : 'Surveilling...'}
                      </strong>
                    </div>
                    {typeof selectedAssetStatus?.distToBslPct === 'number' && (
                      <span className="text-rose-400 font-bold text-xs">+{selectedAssetStatus.distToBslPct}% away</span>
                    )}
                  </div>
                  <div className="p-2.5 rounded bg-slate-950/60 border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Below Sell-Side Liquidity (SSL):</span>
                      <strong className="text-slate-200 text-sm font-bold">
                        {selectedAssetStatus?.nearestSsl ? `$${selectedAssetStatus.nearestSsl.toLocaleString()}` : 'Surveilling...'}
                      </strong>
                    </div>
                    {typeof selectedAssetStatus?.distToSslPct === 'number' && (
                      <span className="text-emerald-400 font-bold text-xs">-{selectedAssetStatus.distToSslPct}% away</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Multi-Asset Live Scanner Table */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-indigo-400" />
                  <span>Binance Spot/Futures Multi-Coin SSR Scanner (All Assets)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Continuous automated background surveillance across top high-volume pairs. Tracks Phase 1 sweeps, Phase 2 displacement, and Phase 3 FVG triggers.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-slate-400">
                  {allAssetStatuses.length} Pairs Monitored
                </span>
                {lastScanTime && (
                  <span className="text-[10px] font-mono text-slate-500">
                    Updated: {new Date(lastScanTime).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </div>

            {/* Quick Filter Tabs & Search Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setFilterPhase('ALL')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    filterPhase === 'ALL'
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  All ({allAssetStatuses.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPhase('ACTIVE_SETUPS')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    filterPhase === 'ACTIVE_SETUPS'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  Active Setups ({allAssetStatuses.filter((s) => s.phase !== 'INSIDE_RANGE').length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPhase('PHASE_3_FVG_RETURN')}
                  className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1.5 ${
                    filterPhase === 'PHASE_3_FVG_RETURN'
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'bg-slate-900 text-emerald-400 hover:text-emerald-300 border border-slate-800'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Phase 3 ({allAssetStatuses.filter((s) => s.phase === 'PHASE_3_FVG_RETURN').length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPhase('PHASE_2_MSS')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    filterPhase === 'PHASE_2_MSS'
                      ? 'bg-sky-600 text-white font-bold'
                      : 'bg-slate-900 text-sky-400 hover:text-sky-300 border border-slate-800'
                  }`}
                >
                  Phase 2 MSS ({allAssetStatuses.filter((s) => s.phase === 'PHASE_2_MSS').length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPhase('PHASE_1_SWEEP')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    filterPhase === 'PHASE_1_SWEEP'
                      ? 'bg-purple-600 text-white font-bold'
                      : 'bg-slate-900 text-purple-400 hover:text-purple-300 border border-slate-800'
                  }`}
                >
                  Phase 1 Sweep ({allAssetStatuses.filter((s) => s.phase === 'PHASE_1_SWEEP').length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterPhase('INSIDE_RANGE')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    filterPhase === 'INSIDE_RANGE'
                      ? 'bg-slate-700 text-white font-bold'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
                  }`}
                >
                  Inside Range ({allAssetStatuses.filter((s) => s.phase === 'INSIDE_RANGE').length})
                </button>
              </div>

              {/* Symbol Search Input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter coins (BTC, SOL, DOGE)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-slate-900 border border-slate-800 rounded text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-56"
                />
              </div>
            </div>

            {/* Matrix Table */}
            {allAssetStatuses.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">Asset & 24h Vol</th>
                      <th className="py-2.5 px-3">Price</th>
                      <th className="py-2.5 px-3">Phase Status</th>
                      <th className="py-2.5 px-3">Direction</th>
                      <th className="py-2.5 px-3">Swept Pool / Range</th>
                      <th className="py-2.5 px-3">MSS / Structural Shift</th>
                      <th className="py-2.5 px-3">Limit Entry (FVG)</th>
                      <th className="py-2.5 px-3">Stop Loss</th>
                      <th className="py-2.5 px-3">Quality / Tier</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 tabular-nums">
                    {allAssetStatuses
                      .filter((st) => {
                        if (searchQuery.trim()) {
                          const q = searchQuery.trim().toUpperCase();
                          if (!st.symbol.toUpperCase().includes(q)) return false;
                        }
                        if (filterPhase === 'ALL') return true;
                        if (filterPhase === 'ACTIVE_SETUPS') {
                          return st.phase !== 'INSIDE_RANGE';
                        }
                        return st.phase === filterPhase;
                      })
                      .map((st) => (
                        <tr
                          key={st.symbol}
                          className={`hover:bg-slate-800/40 transition-colors ${
                            st.symbol === selectedSymbol ? 'bg-indigo-950/20' : ''
                          } ${
                            st.phase === 'PHASE_3_FVG_RETURN' ? 'bg-emerald-950/10' : ''
                          }`}
                        >
                          <td className="py-3 px-3 font-bold text-white">
                            <div className="flex items-center gap-1.5">
                              <span>{st.symbol}</span>
                              {st.symbol === selectedSymbol && (
                                <span className="px-1.5 py-0.2 bg-indigo-500/20 text-indigo-400 rounded text-[9px] font-sans">
                                  Active
                                </span>
                              )}
                            </div>
                            {typeof st.quoteVolume24h === 'number' && st.quoteVolume24h > 0 && (
                              <span className="text-[10px] text-slate-500 block font-normal font-sans">
                                ${(st.quoteVolume24h / 1_000_000).toFixed(1)}M 24h vol
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-bold text-slate-200">
                              ${st.currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                            </span>
                            {typeof st.priceChangePercent24h === 'number' && (
                              <span className={`block text-[10px] font-semibold ${
                                st.priceChangePercent24h >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}>
                                {st.priceChangePercent24h >= 0 ? '+' : ''}{st.priceChangePercent24h.toFixed(2)}%
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {st.phase === 'PHASE_3_FVG_RETURN' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 w-fit">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                Phase 3: FVG Retrace
                              </span>
                            ) : st.phase === 'PHASE_2_MSS' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center gap-1.5 w-fit">
                                <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                                Phase 2: MSS Shift
                              </span>
                            ) : st.phase === 'PHASE_1_SWEEP' ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1.5 w-fit">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                                Phase 1: Swept
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700/60 flex items-center gap-1.5 w-fit">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                                Inside Range
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {st.direction ? (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                st.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                              }`}>
                                {st.direction === 'LONG' ? '↑ LONG' : '↓ SHORT'}
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[11px]">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            {st.sweptLevel ? (
                              <div>
                                <span className="text-slate-200 font-bold">${st.sweptLevel.toLocaleString()}</span>
                                <span className="text-[10px] text-slate-400 block font-sans">({st.liquidityPoolType} Pool)</span>
                              </div>
                            ) : st.nearestBsl && st.nearestSsl ? (
                              <div className="text-[10px] text-slate-400 space-y-0.5">
                                <div>BSL: <span className="text-rose-400 font-semibold">${st.nearestBsl.toLocaleString()}</span></div>
                                <div>SSL: <span className="text-emerald-400 font-semibold">${st.nearestSsl.toLocaleString()}</span></div>
                              </div>
                            ) : (
                              <span className="text-slate-500 text-[11px]">Monitoring</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-slate-300">
                            {st.mssLevel ? (
                              <div>
                                <span className="text-sky-300 font-bold">${st.mssLevel.toLocaleString()}</span>
                                {typeof st.displacementRatio === 'number' && (
                                  <span className="text-[10px] text-slate-400 block font-sans">({st.displacementRatio}x vol)</span>
                                )}
                              </div>
                            ) : st.distToBslPct !== undefined ? (
                              <span className="text-[11px] text-slate-400">
                                +{st.distToBslPct}% / -{st.distToSslPct}%
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[11px]">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-bold">
                            {st.entryPrice ? (
                              <span className="text-sky-400">${st.entryPrice.toLocaleString()}</span>
                            ) : st.fvgProximal ? (
                              <span className="text-sky-300/80">${st.fvgProximal.toLocaleString()}</span>
                            ) : (
                              <span className="text-slate-500 font-normal">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3 font-bold">
                            {st.stopLoss ? (
                              <span className="text-rose-400">${st.stopLoss.toLocaleString()}</span>
                            ) : st.sweepExtreme ? (
                              <span className="text-rose-300/80">${st.sweepExtreme.toLocaleString()}</span>
                            ) : (
                              <span className="text-slate-500 font-normal">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            {st.confidenceTier ? (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-bold text-[10px]">
                                {st.confidenceScore}% (Tier {st.confidenceTier})
                              </span>
                            ) : st.phase === 'PHASE_2_MSS' ? (
                              <span className="px-1.5 py-0.5 rounded bg-sky-950/60 text-sky-400 text-[10px]">
                                Displaced
                              </span>
                            ) : st.phase === 'PHASE_1_SWEEP' ? (
                              <span className="px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-400 text-[10px]">
                                Swept
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[10px]">Surveillance</span>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                onSelectSymbol(st.symbol);
                                if (st.signal) persistSignal(st.signal);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              className={`px-2.5 py-1 rounded text-[11px] font-sans font-medium transition-colors ${
                                st.symbol === selectedSymbol
                                  ? 'bg-slate-800 text-slate-400 border border-slate-700'
                                  : 'bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200'
                              }`}
                            >
                              {st.symbol === selectedSymbol ? 'Active View' : 'Inspect & Trade'}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-slate-500 space-y-2">
                <RotateCcw className="w-5 h-5 text-indigo-400 animate-spin mx-auto" />
                <p>Loading multi-asset Binance order flow scanner...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. TAB 2: Historical Backtest Simulator & Success Analysis           */}
      {/* ==================================================================== */}
      {activeTab === 'BACKTEST' && (
        <div className="space-y-6">
          {/* Backtest Configuration Bar */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-400" />
                  <span>Historical Backtest Simulator: {selectedSymbol}</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Simulates strict 3-phase institutional execution with FVG limit fills, sweep-extreme stops, and tiered exits (1:2 50% + BE, 1:3 25%, 1:4 25%).
                </p>
              </div>

              <button
                type="button"
                onClick={handleRunBacktest}
                disabled={isBacktesting}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold transition-all shadow-md flex items-center gap-2 disabled:opacity-50"
              >
                <Play className={`w-3.5 h-3.5 ${isBacktesting ? 'animate-spin' : ''}`} />
                <span>{isBacktesting ? 'Simulating Trades...' : `Run SSR Backtest for ${selectedSymbol}`}</span>
              </button>
            </div>

            {/* Presets and Custom Date Range Selection */}
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
              <div className="flex items-center gap-2">
                <span className="text-slate-400">Date Range:</span>
                {(['24h', '3d', '7d', '14d', '30d'] as const).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDateRangePreset(preset)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      dateRangePreset === preset
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset.toUpperCase()}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setDateRangePreset('custom')}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    dateRangePreset === 'custom'
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Custom Range
                </button>
              </div>

              {dateRangePreset === 'custom' && (
                <div className="flex items-center gap-3 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 text-[11px]">From:</span>
                    <input
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="bg-transparent text-slate-200 text-xs focus:outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 text-[11px]">To:</span>
                    <input
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="bg-transparent text-slate-200 text-xs focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <span className="text-slate-400">Timeframes:</span>
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-400 font-bold text-[11px]">
                  HTF: {timeframeHTF.toUpperCase()}
                </span>
                <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-400 font-bold text-[11px]">
                  Trigger: {timeframeLTF.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Backtest Progress Bar */}
            {isBacktesting && (
              <div className="space-y-1.5 pt-2">
                <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                  <span>{backtestStage}</span>
                  <span className="font-bold text-indigo-400">{backtestProgress}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-sky-400 transition-all duration-200"
                    style={{ width: `${backtestProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Strategy Success Analysis & Statistical Expectancy Verdict */}
          {backtestResult && (
            <div className="space-y-6">
              {/* Prominent Success Verdict Banner */}
              <div className={`p-5 rounded-xl border shadow-lg ${
                backtestResult.successVerdict === 'PROVEN_PROFITABLE_EDGE'
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                  : backtestResult.successVerdict === 'MODERATE_VIABLE_EDGE'
                  ? 'bg-sky-950/40 border-sky-500/50 text-sky-200'
                  : backtestResult.successVerdict === 'MARGINAL_BREAKEVEN'
                  ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                  : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-current/20">
                  <div className="flex items-center gap-2.5">
                    {backtestResult.isStrategySuccess ? (
                      <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                    ) : (
                      <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0" />
                    )}
                    <div>
                      <h4 className="text-base font-bold tracking-tight">
                        {backtestResult.verdictTitle}
                      </h4>
                      <p className="text-xs opacity-90 mt-0.5">
                        {backtestResult.verdictDescription}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className="px-2.5 py-1 rounded bg-black/40 border border-current/30 font-bold">
                      Account ROI: {backtestResult.profitPercentEquity >= 0 ? '+' : ''}{backtestResult.profitPercentEquity}%
                    </span>
                    <span className="px-2.5 py-1 rounded bg-black/40 border border-current/30 font-bold">
                      Profit Factor: {backtestResult.profitFactor}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 pt-3 text-xs font-mono tabular-nums">
                  <div>
                    <span className="text-[10px] opacity-70 block">Win Rate</span>
                    <strong className="text-base font-bold">{backtestResult.winRate}%</strong>
                    <span className="text-[10px] block opacity-80">({backtestResult.winningTrades}W / {backtestResult.losingTrades}L)</span>
                  </div>

                  <div>
                    <span className="text-[10px] opacity-70 block">Net Strategy Return</span>
                    <strong className="text-base font-bold">{backtestResult.netProfitR >= 0 ? '+' : ''}{backtestResult.netProfitR} R</strong>
                    <span className="text-[10px] block opacity-80">${backtestResult.netProfitUsdt.toLocaleString()} USDT</span>
                  </div>

                  <div>
                    <span className="text-[10px] opacity-70 block">Net After Taker Fees</span>
                    <strong className="text-base font-bold">${backtestResult.netProfitAfterFeesUsdt.toLocaleString()}</strong>
                    <span className="text-[10px] block opacity-80">Fees: -${backtestResult.totalFeesPaidUsdt}</span>
                  </div>

                  <div>
                    <span className="text-[10px] opacity-70 block">Mathematical Expectancy</span>
                    <strong className="text-base font-bold">{backtestResult.expectancyR >= 0 ? '+' : ''}{backtestResult.expectancyR} R</strong>
                    <span className="text-[10px] block opacity-80">EV per executed trade</span>
                  </div>

                  <div>
                    <span className="text-[10px] opacity-70 block">Max Drawdown</span>
                    <strong className="text-base font-bold text-rose-400">-{backtestResult.maxDrawdownR} R</strong>
                    <span className="text-[10px] block text-rose-400/80">(-{backtestResult.maxDrawdownPercent}%)</span>
                  </div>

                  <div>
                    <span className="text-[10px] opacity-70 block">Tiered Exits Hit</span>
                    <strong className="text-base font-bold">TP1: {backtestResult.tp1HitRate}%</strong>
                    <span className="text-[10px] block opacity-80">TP2: {backtestResult.tp2HitRate}% · TP3: {backtestResult.tp3HitRate}%</span>
                  </div>
                </div>
              </div>

              {/* Forensic Classification: "Why Trades Failed" */}
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-3">
                <h4 className="text-xs font-bold text-slate-200 font-mono flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>Forensic Breakdown of Losing Trades ({backtestResult.losingTrades} Losses)</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[11px] text-slate-400 block font-sans">Runaway Trend Momentum</span>
                    <strong className="text-base font-bold text-slate-100">{backtestResult.failureClassification.TREND_MOMENTUM_RUNAWAY || 0} Trades</strong>
                    <p className="text-[10px] text-slate-500 font-sans mt-0.5">Heavy breakout blew past sweep extreme without respecting FVG.</p>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[11px] text-slate-400 block font-sans">Secondary Sweep / Stop Hunt</span>
                    <strong className="text-base font-bold text-slate-100">{backtestResult.failureClassification.SECONDARY_SWEEP_SL || 0} Trades</strong>
                    <p className="text-[10px] text-slate-500 font-sans mt-0.5">Price wicked beyond sweep high/low before intended reversal.</p>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[11px] text-slate-400 block font-sans">Time Horizon Expiration</span>
                    <strong className="text-base font-bold text-slate-100">{backtestResult.failureClassification.CHOPPY_TIME_EXPIRATION || 0} Trades</strong>
                    <p className="text-[10px] text-slate-500 font-sans mt-0.5">Closed at market after 72 bars without reaching expansion targets.</p>
                  </div>

                  <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <span className="text-[11px] text-slate-400 block font-sans">FVG Expansion Invalidation</span>
                    <strong className="text-base font-bold text-slate-100">{backtestResult.failureClassification.FVG_EXPANSION_INVALIDATION || 0} Trades</strong>
                    <p className="text-[10px] text-slate-500 font-sans mt-0.5">Imbalance zone failed to act as institutional support/resistance.</p>
                  </div>
                </div>
              </div>

              {/* Simulated Trade Execution Log Table */}
              <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <h4 className="text-xs font-bold text-white font-mono flex items-center gap-2">
                    <History className="w-4 h-4 text-indigo-400" />
                    <span>Simulated Execution Log ({backtestResult.trades.length} Trades Executed)</span>
                  </h4>
                  <div className="text-xs font-mono text-slate-400 flex items-center gap-3">
                    <span className="text-emerald-400 font-bold">Win: {backtestResult.winningTrades}</span>
                    <span className="text-rose-400 font-bold">Loss: {backtestResult.losingTrades}</span>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-96">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-900 text-slate-400 sticky top-0 uppercase text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Time</th>
                        <th className="py-2.5 px-3">Dir</th>
                        <th className="py-2.5 px-3">Entry (FVG)</th>
                        <th className="py-2.5 px-3">Stop Loss</th>
                        <th className="py-2.5 px-3">Exit Price</th>
                        <th className="py-2.5 px-3">Realized R</th>
                        <th className="py-2.5 px-3">Net USDT</th>
                        <th className="py-2.5 px-3">Fees</th>
                        <th className="py-2.5 px-3">Exit Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 tabular-nums">
                      {backtestResult.trades.map((t, idx) => (
                        <tr
                          key={t.id}
                          onClick={() => setSelectedTrade(t)}
                          className={`cursor-pointer transition-colors ${
                            selectedTrade?.id === t.id ? 'bg-indigo-950/40' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-2 px-3 text-slate-500">{idx + 1}</td>
                          <td className="py-2 px-3 text-slate-300">{t.entryTimeString}</td>
                          <td className="py-2 px-3">
                            <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              t.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                            }`}>
                              {t.direction}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-bold text-sky-400">${t.entryPrice.toLocaleString()}</td>
                          <td className="py-2 px-3 font-bold text-rose-400">${t.stopLoss.toLocaleString()}</td>
                          <td className="py-2 px-3 text-slate-300">${t.exitPrice.toLocaleString()}</td>
                          <td className="py-2 px-3 font-bold">
                            <span className={t.netRealizedR > 0 ? 'text-emerald-400' : t.netRealizedR < 0 ? 'text-rose-400' : 'text-slate-400'}>
                              {t.netRealizedR >= 0 ? '+' : ''}{t.netRealizedR} R
                            </span>
                          </td>
                          <td className="py-2 px-3 font-bold">
                            <span className={t.pnlUsdt > 0 ? 'text-emerald-400' : t.pnlUsdt < 0 ? 'text-rose-400' : 'text-slate-400'}>
                              {t.pnlUsdt >= 0 ? '+' : ''}${t.pnlUsdt.toLocaleString()}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-amber-400/80">-${t.estimatedFeesUsdt}</td>
                          <td className="py-2 px-3 text-slate-400 text-[11px]">{t.exitReason.replace(/_/g, ' ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 5. TAB 3: Forward Signal Ledger & Paper Trading Forward Tracker       */}
      {/* ==================================================================== */}
      {activeTab === 'FORWARD_LEDGER' && (
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-400" />
                <span>Forward Signal Ledger & Paper Trading Tracker</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Automatically monitors forward live signals against real Binance WebSocket/REST prices to verify out-of-sample edge.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setForwardLedger([]);
                localStorage.removeItem('vp_ssr_forward_ledger');
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-rose-400 font-mono transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Ledger</span>
            </button>
          </div>

          {forwardLedger.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Symbol</th>
                    <th className="py-2.5 px-3">Direction</th>
                    <th className="py-2.5 px-3">Limit Entry (FVG)</th>
                    <th className="py-2.5 px-3">Stop Loss</th>
                    <th className="py-2.5 px-3">TP1 (1:2)</th>
                    <th className="py-2.5 px-3">Current Market</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Realized PnL</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 tabular-nums">
                  {forwardLedger.map((sig) => (
                    <tr key={sig.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-3 text-slate-400">{sig.timeString}</td>
                      <td className="py-3 px-3 font-bold text-white">{sig.symbol}</td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          sig.direction === 'LONG' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                        }`}>
                          {sig.direction}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-sky-400">${sig.entryPrice.toLocaleString()}</td>
                      <td className="py-3 px-3 font-bold text-rose-400">${sig.stopLoss.toLocaleString()}</td>
                      <td className="py-3 px-3 font-bold text-emerald-400">${sig.tp1.toLocaleString()}</td>
                      <td className="py-3 px-3 font-bold text-slate-200">
                        ${sig.currentPrice ? sig.currentPrice.toLocaleString() : '—'}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          sig.status.startsWith('HIT')
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : sig.status === 'STOPPED_OUT'
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-indigo-500/20 text-indigo-300'
                        }`}>
                          {sig.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold">
                        {sig.realizedR !== undefined ? (
                          <span className={sig.realizedR > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {sig.realizedR >= 0 ? '+' : ''}{sig.realizedR} R
                          </span>
                        ) : (
                          <span className="text-slate-500">Live in play</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-500 space-y-2">
              <Sliders className="w-8 h-8 text-slate-600 mx-auto" />
              <p>No forward test signals recorded yet. Active signals from the scanner will be tracked here.</p>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 6. TAB 4: Stored Backtest Runs Repository                            */}
      {/* ==================================================================== */}
      {activeTab === 'HISTORY' && (
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>Stored Backtest Runs Repository ({savedBacktests.length} Saved Simulations)</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Compare past backtest configurations across different symbols, timeframes, and date presets.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setSavedBacktests([]);
                localStorage.removeItem('vp_ssr_saved_backtests');
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs text-rose-400 font-mono transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          </div>

          {savedBacktests.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {savedBacktests.map((b) => (
                <div
                  key={b.id}
                  onClick={() => {
                    setBacktestResult(b);
                    setActiveTab('BACKTEST');
                  }}
                  className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-indigo-500/60 cursor-pointer transition-all space-y-3 font-mono text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{b.symbol}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      b.isStrategySuccess ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                    }`}>
                      {b.isStrategySuccess ? 'SUCCESS' : 'FAILED'}
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400">
                    {b.startDate} → {b.endDate} ({b.dateRangePreset.toUpperCase()})
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/80 tabular-nums">
                    <div>
                      <span className="text-[10px] text-slate-500 block">Win Rate</span>
                      <strong className="text-slate-200">{b.winRate}%</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Net Return</span>
                      <strong className={b.netProfitR >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {b.netProfitR >= 0 ? '+' : ''}{b.netProfitR} R
                      </strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 block">Profit Factor</span>
                      <strong className="text-slate-200">{b.profitFactor}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-xs text-slate-500 space-y-2">
              <Layers className="w-8 h-8 text-slate-600 mx-auto" />
              <p>No saved backtest runs yet. Execute a backtest simulation to store results here.</p>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 7. TAB 5: Risk Sizing & Fee Calculator (From User Prompt)            */}
      {/* ==================================================================== */}
      {activeTab === 'CALCULATOR' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calculator className="w-4 h-4 text-indigo-400" />
                <span>Institutional Risk Sizing & Fee Slip Calculator</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Formula from prompt: Deducts 0.05% round-trip taker fees from raw risk to prevent fee slippage from destroying mathematical expectancy.
              </p>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Account Equity (USDT):</label>
                <input
                  type="number"
                  value={accountEquity}
                  onChange={(e) => setAccountEquity(Math.max(10, Number(e.target.value)))}
                  className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Risk Percentage (%):</label>
                <input
                  type="number"
                  step="0.1"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Math.max(0.1, Number(e.target.value)))}
                  className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 block mb-1">Limit Entry Price ($):</label>
                  <input
                    type="number"
                    step="any"
                    value={calcEntry}
                    onChange={(e) => setCalcEntry(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-slate-400 block mb-1">Stop Loss Price ($):</label>
                  <input
                    type="number"
                    step="any"
                    value={calcSL}
                    onChange={(e) => setCalcSL(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-800 rounded p-2 text-white font-mono"
                  />
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-900/90 border border-slate-800 space-y-2 tabular-nums">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Raw 1% Risk Allocation:</span>
                  <span className="font-bold text-slate-200">${positionSizing.rawRiskUsdt} USDT</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Taker Fee Deduction (0.10% Round-Trip):</span>
                  <span className="font-bold text-amber-400">-${positionSizing.estimatedFeeDragUsdt} USDT</span>
                </div>
                <div className="flex items-center justify-between text-slate-300 font-bold border-t border-slate-800 pt-1.5">
                  <span>Fee-Adjusted Net Risk:</span>
                  <span className="text-emerald-400">${positionSizing.netRiskUsdt} USDT</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>True Position Quantity:</span>
                  <span className="font-bold text-sky-400">{positionSizing.positionQuantity} Units</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Total Notional Value:</span>
                  <span className="font-bold text-slate-100">${positionSizing.positionNotionalUsdt.toLocaleString()} USDT</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Recommended Isolated Leverage:</span>
                  <span className="font-bold text-indigo-400">{positionSizing.recommendedLeverage}x</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Estimated Liquidation Price:</span>
                  <span className="font-bold text-rose-400">${positionSizing.liquidationPriceEst.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: CCXT Python Pipeline from User Prompt */}
          <div className="lg:col-span-6 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-3 font-mono text-xs">
            <div className="pb-3 border-b border-slate-800">
              <span className="text-[10px] uppercase text-indigo-400 font-bold block">Quantitative Execution Stack</span>
              <h4 className="text-sm font-bold text-white">Binance Futures CCXT Execution Script</h4>
            </div>

            <div className="p-3.5 rounded bg-slate-950/80 border border-slate-800 text-slate-300 space-y-2 text-[11px] leading-relaxed">
              <p className="text-amber-400 font-bold"># Fixes Price Precision & Exchange Race Conditions</p>
              <pre className="text-sky-300 overflow-x-auto p-2 bg-black/60 rounded">
{`# 1. Format prices to exchange precision rules
market = exchange.market("${selectedSymbol}")
entry_price = float(exchange.price_to_precision("${selectedSymbol}", ${calcEntry}))
sl_price = float(exchange.price_to_precision("${selectedSymbol}", ${calcSL}))
amount = float(exchange.amount_to_precision("${selectedSymbol}", ${positionSizing.positionQuantity}))

# 2. Place Limit Order at FVG Proximal Edge
order = exchange.create_order(
    symbol="${selectedSymbol}",
    type="LIMIT",
    side="${calcEntry > calcSL ? 'BUY' : 'SELL'}",
    amount=amount,
    price=entry_price
)

# 3. Prevent Race Condition: Wait for open position before dispatching SL
time.sleep(1)

# 4. Invalidation: Place Stop Loss at Sweep Extreme
exchange.create_order(
    symbol="${selectedSymbol}",
    type="STOP_MARKET",
    side="${calcEntry > calcSL ? 'SELL' : 'BUY'}",
    amount=amount,
    params={"stopPrice": sl_price, "reduceOnly": True}
)`}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
