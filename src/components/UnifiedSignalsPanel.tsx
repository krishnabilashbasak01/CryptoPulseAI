/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Sparkles,
  Layers,
  Activity,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Search,
  Filter,
  Clock,
  SlidersHorizontal,
  BellPlus,
  ExternalLink,
  X,
  ChevronRight,
  Info,
  ShieldCheck,
  AlertTriangle,
  Trash2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Calculator,
  Copy,
  Check,
  DollarSign,
  Sliders,
} from 'lucide-react';
import {
  parseSignalTimestamp,
  formatSignalDateTime,
  calculatePositionSizeAndRisk,
  type UnifiedSignal,
  type SignalStrategyId,
} from '../utils/signals';

interface UnifiedSignalsPanelProps {
  signals: UnifiedSignal[];
  selectedSymbol: string;
  onSelectSymbol: (symbol: string) => void;
  onNavigateToTerminal: (symbol: string) => void;
  onNavigateToFractal: (symbol: string) => void;
  onNavigateToAiThesis: (symbol: string) => void;
  onCreateAlert: (symbol: string, price: number, condition: 'PRICE_ABOVE' | 'PRICE_BELOW', note: string) => void;
  onDeleteSignal?: (id: string) => void;
  onPurgeInactive?: () => void;
  onClearLedger?: () => void;
}

export const UnifiedSignalsPanel: React.FC<UnifiedSignalsPanelProps> = ({
  signals,
  selectedSymbol,
  onSelectSymbol,
  onNavigateToTerminal,
  onNavigateToFractal,
  onNavigateToAiThesis,
  onCreateAlert,
  onDeleteSignal,
  onPurgeInactive,
  onClearLedger,
}) => {
  // Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [aiFilter, setAiFilter] = useState<'ALL' | 'AI_ONLY' | 'ALGO_ONLY'>('ALL');
  const [strategyFilter, setStrategyFilter] = useState<'ALL' | SignalStrategyId>('ALL');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'LONG' | 'SHORT'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'WINNERS' | 'STOPPED_OUT' | 'EXPIRED'>('ALL');
  // Strength filter & Sort Order (User request: "show strongness of signal and old to new signal")
  const [strengthFilter, setStrengthFilter] = useState<'ALL' | 'A_PLUS' | 'A_AND_ABOVE' | 'B_PLUS'>('ALL');
  const [sortBy, setSortBy] = useState<'TIME_ASC' | 'TIME_DESC' | 'STRENGTH_DESC' | 'STRENGTH_ASC'>('TIME_ASC');
  const [viewMode, setViewMode] = useState<'CARDS' | 'TABLE'>('TABLE');

  // Modal inspection state
  const [inspectedSignal, setInspectedSignal] = useState<UnifiedSignal | null>(null);

  // Position Size & Leverage Risk Calculator State
  const [calcLossAmount, setCalcLossAmount] = useState<number>(50);
  const [calcLeverage, setCalcLeverage] = useState<number>(10);
  const [calcCustomEntry, setCalcCustomEntry] = useState<number | null>(null);
  const [calcCustomSL, setCalcCustomSL] = useState<number | null>(null);
  const [showCustomOverrides, setShowCustomOverrides] = useState<boolean>(false);
  const [copiedOrder, setCopiedOrder] = useState<boolean>(false);

  // Handler to open signal in audit modal & reset calculator overrides
  const handleOpenSignal = (sig: UnifiedSignal) => {
    setInspectedSignal(sig);
    setCalcCustomEntry(null);
    setCalcCustomSL(null);
    setShowCustomOverrides(false);
    setCopiedOrder(false);
  };

  // Position Sizing and Risk Math calculation for inspected signal
  const calcResult = useMemo(() => {
    if (!inspectedSignal) return null;
    const entryPrice = calcCustomEntry ?? inspectedSignal.entryPrice;
    const stopLoss = calcCustomSL ?? inspectedSignal.stopLoss;
    return calculatePositionSizeAndRisk({
      direction: inspectedSignal.direction,
      entryPrice,
      stopLoss,
      lossAmount: calcLossAmount,
      leverage: calcLeverage,
      tp1: inspectedSignal.tp1,
      tp2: inspectedSignal.tp2,
      tp3: inspectedSignal.tp3,
    });
  }, [inspectedSignal, calcCustomEntry, calcCustomSL, calcLossAmount, calcLeverage]);

  // Statistics & KPI calculations
  const stats = useMemo(() => {
    const total = signals.length;
    const aiDecided = signals.filter((s) => s.aiUsed);
    const algoDecided = signals.filter((s) => !s.aiUsed);
    const activeList = signals.filter((s) => s.status === 'ACTIVE');
    const winners = signals.filter((s) => s.status === 'HIT_TP1' || s.status === 'HIT_TP2' || s.status === 'HIT_TP3');
    const stoppedList = signals.filter((s) => s.status === 'STOPPED_OUT');
    const expiredList = signals.filter((s) => s.status === 'EXPIRED');
    const highConvictionList = signals.filter((s) => s.strongnessTier === 'A+');
    const closed = signals.filter((s) => s.status !== 'ACTIVE' && s.status !== 'PENDING');
    const winRate = closed.length > 0 ? (winners.length / closed.length) * 100 : 0;
    const totalCreditsSpent = aiDecided.reduce((acc, s) => acc + (s.aiCreditsConsumed || 0), 0);

    return {
      total,
      aiCount: aiDecided.length,
      algoCount: algoDecided.length,
      activeCount: activeList.length,
      inactiveCount: closed.length,
      winnersCount: winners.length,
      stoppedCount: stoppedList.length,
      expiredCount: expiredList.length,
      highConvictionCount: highConvictionList.length,
      winRate: winRate.toFixed(1),
      totalCreditsSpent: totalCreditsSpent.toFixed(2),
    };
  }, [signals]);

  // Filtered & Chronologically Sorted signals list
  const filteredSignals = useMemo(() => {
    const query = searchQuery.trim().toUpperCase();
    const result = signals.filter((sig) => {
      // 1. Text Search
      if (query && !sig.symbol.includes(query) && !sig.strategyName.toUpperCase().includes(query)) {
        return false;
      }
      // 2. AI Decision Filter (User request: "ai used or not for signal digitions making")
      if (aiFilter === 'AI_ONLY' && !sig.aiUsed) return false;
      if (aiFilter === 'ALGO_ONLY' && sig.aiUsed) return false;

      // 3. Strategy Filter (User request: "with stratagy used")
      if (strategyFilter !== 'ALL' && sig.strategyId !== strategyFilter) return false;

      // 4. Direction Filter
      if (directionFilter !== 'ALL' && sig.direction !== directionFilter) return false;

      // 5. Status Filter
      if (statusFilter === 'ACTIVE' && sig.status !== 'ACTIVE' && sig.status !== 'PENDING') return false;
      if (statusFilter === 'WINNERS' && sig.status !== 'HIT_TP1' && sig.status !== 'HIT_TP2' && sig.status !== 'HIT_TP3') {
        return false;
      }
      if (statusFilter === 'STOPPED_OUT' && sig.status !== 'STOPPED_OUT') return false;
      if (statusFilter === 'EXPIRED' && sig.status !== 'EXPIRED' && sig.status !== 'STOPPED_OUT') return false;

      // 6. Signal Strongness Tier Filter (User request: "show strongness of signal")
      if (strengthFilter === 'A_PLUS' && sig.strongnessTier !== 'A+') return false;
      if (strengthFilter === 'A_AND_ABOVE' && sig.strongnessTier !== 'A+' && sig.strongnessTier !== 'A') return false;
      if (strengthFilter === 'B_PLUS' && sig.strongnessTier !== 'B+') return false;

      return true;
    });

    // Chronological & Strongness Sorting (User request: "old to new signal")
    return [...result].sort((a, b) => {
      if (sortBy === 'TIME_ASC') {
        // Chronological: Oldest setups first → newest setups
        return parseSignalTimestamp(a) - parseSignalTimestamp(b);
      }
      if (sortBy === 'TIME_DESC') {
        // Reverse chronological: Newest setups first → oldest
        return parseSignalTimestamp(b) - parseSignalTimestamp(a);
      }
      if (sortBy === 'STRENGTH_DESC') {
        // Highest conviction strength score first (e.g. 99% → 57%)
        if (b.confidenceScore !== a.confidenceScore) {
          return b.confidenceScore - a.confidenceScore;
        }
        return parseSignalTimestamp(b) - parseSignalTimestamp(a);
      }
      if (sortBy === 'STRENGTH_ASC') {
        // Lowest conviction strength first
        if (a.confidenceScore !== b.confidenceScore) {
          return a.confidenceScore - b.confidenceScore;
        }
        return parseSignalTimestamp(a) - parseSignalTimestamp(b);
      }
      return 0;
    });
  }, [signals, searchQuery, aiFilter, strategyFilter, directionFilter, statusFilter, strengthFilter, sortBy]);

  const formatPrice = (p: number | undefined | null) => {
    if (typeof p !== 'number' || isNaN(p)) return '0.00';
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(4);
    return p.toFixed(5);
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Top Header Card */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-sky-950 text-sky-400 border border-sky-800/80">
                Rule 6 & Signal Ledger Hub
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-400 font-mono">Centralized Signal & Decision Repository</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-sky-400" />
                <span>Unified Signal Ledger & Decision Center</span>
              </h2>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Quality Guard: Tier A & A+ Only
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 max-w-3xl leading-relaxed">
              Every signal generated across the platform is separated and tracked in this unified ledger. Filter and audit by <strong>Strategy Used</strong> and full transparency into whether <strong>AI was used or not</strong> for signal decision making. Low-grade signals (&lt;72%) are strictly filtered.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {onPurgeInactive && stats.inactiveCount > 0 && (
              <button
                type="button"
                onClick={onPurgeInactive}
                className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium text-amber-300 hover:text-amber-200 bg-amber-950/70 hover:bg-amber-900 border border-amber-800/80 transition-colors flex items-center gap-1.5 shadow-sm"
                title="Remove historical closed/inactive setups from ledger"
              >
                <Trash2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Purge Inactive ({stats.inactiveCount})</span>
              </button>
            )}
            {onClearLedger && signals.length > 0 && (
              <button
                type="button"
                onClick={onClearLedger}
                className="px-3 py-1.5 rounded-lg text-xs font-mono text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 hover:border-slate-700 transition-colors"
              >
                Clear History
              </button>
            )}
            <div className="flex items-center rounded-lg bg-slate-900 p-0.5 border border-slate-800">
              <button
                type="button"
                onClick={() => setViewMode('CARDS')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'CARDS'
                    ? 'bg-sky-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Cards View
              </button>
              <button
                type="button"
                onClick={() => setViewMode('TABLE')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === 'TABLE'
                    ? 'bg-sky-600 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Table Ledger
              </button>
            </div>
          </div>
        </div>

        {/* Top KPI Metrics Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 font-mono">
          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
            <span className="text-xs font-sans text-slate-400 block">Total Signals</span>
            <span className="text-xl font-bold text-white mt-0.5 block">{stats.total}</span>
            <span className="text-[11px] text-emerald-400 block mt-0.5 font-semibold">
              {stats.activeCount} Live Active
            </span>
          </div>

          <div className="bg-slate-900/90 border border-purple-800/50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-sans text-purple-300 block">AI Decisions</span>
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            </div>
            <span className="text-xl font-bold text-purple-300 mt-0.5 block">{stats.aiCount}</span>
            <span className="text-[11px] text-purple-400/90 block mt-0.5">
              {stats.totalCreditsSpent} Kie.ai Credits Used
            </span>
          </div>

          <div className="bg-slate-900/90 border border-sky-800/50 rounded-lg p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-sans text-sky-300 block">Algorithmic Math</span>
              <Zap className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <span className="text-xl font-bold text-sky-300 mt-0.5 block">{stats.algoCount}</span>
            <span className="text-[11px] text-emerald-400 block mt-0.5">100% Free · 0 AI Credits</span>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-3">
            <span className="text-xs font-sans text-slate-400 block">Closed Win Rate</span>
            <span className="text-xl font-bold text-emerald-400 mt-0.5 block">{stats.winRate}%</span>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              {stats.winnersCount} Targets Hit · {stats.stoppedCount} Stopped
            </span>
          </div>
        </div>
      </div>

      {/* Filter Toolbar (AI Decision + Strategy Used + Search) */}
      <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* AI Decision Filter (Core User Request) */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-slate-300 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span>AI Decision:</span>
            </span>
            <button
              type="button"
              onClick={() => setAiFilter('ALL')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                aiFilter === 'ALL'
                  ? 'bg-sky-600 text-white font-semibold'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              All Signals ({stats.total})
            </button>
            <button
              type="button"
              onClick={() => setAiFilter('AI_ONLY')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                aiFilter === 'AI_ONLY'
                  ? 'bg-purple-600 text-white font-semibold shadow-md shadow-purple-950'
                  : 'bg-slate-900 text-purple-300 hover:text-purple-200 border border-purple-900/50'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>🤖 AI Decisions Only ({stats.aiCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setAiFilter('ALGO_ONLY')}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
                aiFilter === 'ALGO_ONLY'
                  ? 'bg-emerald-600 text-white font-semibold shadow-md shadow-emerald-950'
                  : 'bg-slate-900 text-emerald-300 hover:text-emerald-200 border border-emerald-900/50'
              }`}
            >
              <Zap className="w-3 h-3 text-sky-300" />
              <span>⚙️ Pure Algorithmic / 0 Credits ({stats.algoCount})</span>
            </button>
          </div>

          {/* Search by Symbol */}
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by symbol (e.g. BTC)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1 text-xs font-mono bg-slate-900 border border-slate-700 rounded-md text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
            />
          </div>
        </div>

        {/* Secondary Strategy & Direction Filter Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80 text-xs">
          {/* Strategy Used Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-mono">Strategy:</span>
            <select
              value={strategyFilter}
              onChange={(e) => setStrategyFilter(e.target.value as any)}
              className="px-2.5 py-1 text-xs font-mono bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">All Strategies (Fractal, Kie.ai, Quant)</option>
              <option value="WILLIAMS_FRACTAL_SWEEP">⚡ Williams Fractal 4H Sweep + Reversal</option>
              <option value="KIE_AI_THESIS">🤖 Institutional Kie.ai Quantitative Thesis</option>
              <option value="QUANT_STRUCTURE_DEPTH">📊 Market Structure & Order Book Depth</option>
            </select>

            <span className="text-slate-400 font-mono ml-2">Direction:</span>
            <div className="inline-flex rounded-md bg-slate-900 p-0.5 border border-slate-800 font-mono text-[11px]">
              <button
                type="button"
                onClick={() => setDirectionFilter('ALL')}
                className={`px-2 py-0.5 rounded ${directionFilter === 'ALL' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
              >
                ALL
              </button>
              <button
                type="button"
                onClick={() => setDirectionFilter('LONG')}
                className={`px-2 py-0.5 rounded ${directionFilter === 'LONG' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}
              >
                LONG
              </button>
              <button
                type="button"
                onClick={() => setDirectionFilter('SHORT')}
                className={`px-2 py-0.5 rounded ${directionFilter === 'SHORT' ? 'bg-rose-600 text-white' : 'text-slate-400'}`}
              >
                SHORT
              </button>
            </div>
          </div>

          {/* Strength & Status Filters */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Signal Strength Filter (User Request: "show strongness of signal") */}
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <span className="text-slate-400">Strength:</span>
              <select
                value={strengthFilter}
                onChange={(e) => setStrengthFilter(e.target.value as any)}
                className="px-2.5 py-1 text-xs font-mono bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="ALL">All Strengths ({signals.length})</option>
                <option value="A_PLUS">⭐ Tier A+ High Conviction (85%+)</option>
                <option value="A_AND_ABOVE">🛡️ Tier A & Above (72%+)</option>
                <option value="B_PLUS">Tier B+ Moderate (50-70%) [Filtered]</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 font-mono text-xs">
              <span className="text-slate-400">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-2.5 py-1 text-xs font-mono bg-slate-900 border border-slate-700 rounded-md text-slate-200 focus:outline-none focus:border-sky-500"
              >
                <option value="ALL">All Statuses ({signals.length})</option>
                <option value="ACTIVE">Active / In Play ({stats.activeCount})</option>
                <option value="WINNERS">Targets Hit ({stats.winnersCount})</option>
                <option value="STOPPED_OUT">Stopped Out ({stats.stoppedCount})</option>
                <option value="EXPIRED">Expired / Inactive ({stats.inactiveCount})</option>
              </select>
            </div>
          </div>
        </div>

        {/* Third Row: Chronological Ordering & Conviction Sort (User Request: "old to new signal") */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2.5 border-t border-slate-800/60 text-xs font-mono">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              <span className="font-sans font-semibold text-slate-200">Timeline Order:</span>
            </span>
            <div className="inline-flex rounded-md bg-slate-900 p-0.5 border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setSortBy('TIME_ASC')}
                className={`px-3 py-1 rounded transition-all flex items-center gap-1.5 ${
                  sortBy === 'TIME_ASC'
                    ? 'bg-sky-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Sort chronologically: Oldest historical setups first → newest"
              >
                <ArrowUp className="w-3 h-3 text-sky-300" />
                <span>Old → New (Earliest First)</span>
              </button>
              <button
                type="button"
                onClick={() => setSortBy('TIME_DESC')}
                className={`px-3 py-1 rounded transition-all flex items-center gap-1.5 ${
                  sortBy === 'TIME_DESC'
                    ? 'bg-sky-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Sort reverse chronologically: Newest live setups first → oldest"
              >
                <ArrowDown className="w-3 h-3 text-sky-300" />
                <span>New → Old (Latest First)</span>
              </button>
              <button
                type="button"
                onClick={() => setSortBy('STRENGTH_DESC')}
                className={`px-3 py-1 rounded transition-all flex items-center gap-1.5 ${
                  sortBy === 'STRENGTH_DESC'
                    ? 'bg-amber-600 text-white font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Sort by highest conviction: Tier A+ (99%) down to Tier B+"
              >
                <Sparkles className="w-3 h-3 text-amber-300" />
                <span>Strongest Conviction</span>
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 font-sans">
            Showing <strong className="text-white font-mono">{filteredSignals.length}</strong> setups
            {sortBy === 'TIME_ASC' && ' · Chronological (Oldest First)'}
            {sortBy === 'TIME_DESC' && ' · Reverse Chronological (Newest First)'}
            {sortBy === 'STRENGTH_DESC' && ' · Ranked by Highest Conviction'}
          </div>
        </div>
      </div>

      {/* Signals Content View */}
      {filteredSignals.length === 0 ? (
        <div className="bg-[#111827] border border-slate-800 rounded-xl p-12 text-center space-y-3">
          <Activity className="w-10 h-10 text-slate-600 mx-auto" />
          <h3 className="text-base font-semibold text-slate-200">No signals match current filter criteria</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Try adjusting your AI Decision filter, Strategy selection, or search query.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setAiFilter('ALL');
              setStrategyFilter('ALL');
              setDirectionFilter('ALL');
              setStatusFilter('ALL');
            }}
            className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-md transition-colors"
          >
            Reset All Filters
          </button>
        </div>
      ) : viewMode === 'CARDS' ? (
        /* CARDS VIEW: Rich Cards with Strategy & AI Decision Details */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSignals.map((sig) => {
            const isLong = sig.direction === 'LONG';
            const isAi = sig.aiUsed;

            return (
              <div
                key={sig.id}
                className={`bg-[#111827] border rounded-xl p-4.5 space-y-3.5 transition-all duration-200 hover:border-slate-700 ${
                  isAi
                    ? 'border-purple-800/60 shadow-lg shadow-purple-950/20'
                    : 'border-slate-800 shadow-md shadow-slate-950/30'
                }`}
              >
                {/* Header: Coin, Direction, Time & AI Status Pill */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-white font-mono tracking-tight">
                        {sig.symbol}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold font-mono ${
                          isLong
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-600/40'
                            : sig.direction === 'SHORT'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-600/40'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-600/40'
                        }`}
                      >
                        {isLong ? (
                          <TrendingUp className="w-3.5 h-3.5" />
                        ) : sig.direction === 'SHORT' ? (
                          <TrendingDown className="w-3.5 h-3.5" />
                        ) : (
                          <Minus className="w-3.5 h-3.5" />
                        )}
                        <span>{sig.direction}</span>
                      </span>

                      {/* Quality / Strongness Tier Badge */}
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          sig.strongnessTier === 'A+'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-600/50 shadow-sm shadow-amber-950/40'
                            : sig.strongnessTier === 'A'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-600/50'
                            : 'bg-indigo-500/20 text-indigo-300 border border-indigo-600/40'
                        }`}
                      >
                        {sig.strongnessTier === 'A+' && <Sparkles className="w-2.5 h-2.5 text-amber-300" />}
                        {sig.strongnessTier === 'A' && <ShieldCheck className="w-2.5 h-2.5 text-sky-400" />}
                        <span>Strength: Tier {sig.strongnessTier} ({sig.confidenceScore}%)</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono mt-1">
                      <Clock className="w-3 h-3 text-sky-400" />
                      <span className="text-slate-300 font-semibold">{formatSignalDateTime(sig)}</span>
                      <span>·</span>
                      <span>Timeframe: {sig.timeframe}</span>
                    </div>
                  </div>

                  {/* AI Decision Pill (Primary User Requirement) */}
                  <div className="text-right shrink-0">
                    {isAi ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-purple-950/80 text-purple-200 border border-purple-700/80 shadow-sm shadow-purple-950">
                        <Sparkles className="w-3 h-3 text-amber-300" />
                        <span>AI Decision: YES</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                        <Zap className="w-3 h-3 text-sky-400" />
                        <span>AI Decision: NO</span>
                      </span>
                    )}
                    <span className="block text-[10px] font-mono text-slate-400 mt-0.5">
                      {isAi
                        ? `${sig.aiModel} (${sig.aiCreditsConsumed} cr)`
                        : 'Pure Algorithmic (0 cr)'}
                    </span>
                  </div>
                </div>

                {/* Strategy Used Badge & Description (User Request: "with stratagy used") */}
                <div className="bg-slate-900/90 rounded-lg p-2.5 border border-slate-800/90 text-xs space-y-1">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      {sig.strategyId === 'WILLIAMS_FRACTAL_SWEEP' ? (
                        <Layers className="w-3.5 h-3.5 text-amber-400" />
                      ) : sig.strategyId === 'KIE_AI_THESIS' ? (
                        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                      ) : (
                        <Activity className="w-3.5 h-3.5 text-sky-400" />
                      )}
                      <span>Strategy: {sig.strategyName}</span>
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                      {sig.strategyCode}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed line-clamp-2">
                    {sig.rulesSummary}
                  </p>
                </div>

                {/* Execution Targets: Entry, SL, TP1, TP2, TP3 */}
                <div className="grid grid-cols-4 gap-2 text-xs font-mono py-1 border-y border-slate-800/80">
                  <div>
                    <span className="text-[10px] text-slate-500 block font-sans">Entry</span>
                    <span className="font-semibold text-slate-200">${formatPrice(sig.entryPrice)}</span>
                    {typeof sig.currentPrice === 'number' && (
                      <span className="text-[10px] text-slate-400 block font-mono">
                        Now: ${formatPrice(sig.currentPrice)}
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-rose-400/80 block font-sans">Stop Loss</span>
                    <span className="font-semibold text-rose-400">${formatPrice(sig.stopLoss)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-400/80 block font-sans">TP1 (1:2 50%)</span>
                    <span className="font-semibold text-emerald-400">${formatPrice(sig.tp1)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-sky-400/80 block font-sans">TP2 (1:3 25%)</span>
                    <span className="font-semibold text-sky-400">${formatPrice(sig.tp2)}</span>
                  </div>
                </div>

                {/* AI Decision Explanation Note */}
                <div className="text-[11px] leading-relaxed text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800/60">
                  <strong className="text-slate-300 block font-mono text-[10px]">
                    {isAi ? '🤖 AI Decision Trail:' : '⚙️ Algorithmic Execution Rules:'}
                  </strong>
                  <span>{sig.aiDecisionExplanation}</span>
                </div>

                {/* Bottom Actions Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        sig.status === 'HIT_TP1' || sig.status === 'HIT_TP2' || sig.status === 'HIT_TP3'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-600/40'
                          : sig.status === 'STOPPED_OUT'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-600/40'
                          : sig.status === 'EXPIRED'
                          ? 'bg-slate-800 text-slate-400 border border-slate-700'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-600/40'
                      }`}
                    >
                      {sig.status === 'ACTIVE' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      )}
                      {sig.status === 'HIT_TP1'
                        ? 'HIT TP1 (+1.0R Realized)'
                        : sig.status === 'HIT_TP2'
                        ? 'HIT TP2 (+2.25R Realized)'
                        : sig.status === 'HIT_TP3'
                        ? 'HIT TP3 (+4.0R Realized)'
                        : sig.status === 'STOPPED_OUT'
                        ? 'STOPPED OUT (-1.0R)'
                        : sig.status === 'EXPIRED'
                        ? 'EXPIRED / INVALIDATED'
                        : 'ACTIVE IN PLAY'}
                    </span>
                    {typeof sig.pnlPercent === 'number' && (
                      <span
                        className={`text-[11px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          sig.pnlPercent >= 0
                            ? 'text-emerald-300 bg-emerald-950/60 border border-emerald-800/60'
                            : 'text-rose-300 bg-rose-950/60 border border-rose-800/60'
                        }`}
                      >
                        {sig.pnlPercent >= 0 ? `+${sig.pnlPercent}%` : `${sig.pnlPercent}%`}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenSignal(sig)}
                      className="px-2.5 py-1 rounded text-xs font-medium text-sky-300 hover:text-white bg-sky-950/80 hover:bg-sky-900 border border-sky-800/80 transition-colors flex items-center gap-1"
                      title="Open Position Size & Risk Calculator"
                    >
                      <Calculator className="w-3 h-3 text-sky-400" />
                      <span>Calc Size</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenSignal(sig)}
                      className="px-2.5 py-1 rounded text-xs font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors flex items-center gap-1"
                    >
                      <Info className="w-3 h-3" />
                      <span>Audit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectSymbol(sig.symbol);
                        onNavigateToTerminal(sig.symbol);
                      }}
                      className="px-2.5 py-1 rounded text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 transition-colors flex items-center gap-1"
                    >
                      <span>Open in Chart</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                    {onDeleteSignal && (
                      <button
                        type="button"
                        onClick={() => onDeleteSignal(sig.id)}
                        className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors ml-0.5"
                        title="Delete signal permanently"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE LEDGER VIEW: High-Density Institutional Table */
        <div className="bg-[#111827] border border-slate-800 rounded-xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400 font-sans">
                <tr>
                  <th
                    className="py-3 px-3 cursor-pointer select-none hover:text-sky-300 transition-colors"
                    onClick={() => setSortBy(sortBy === 'TIME_ASC' ? 'TIME_DESC' : 'TIME_ASC')}
                    title="Click to toggle Old to New / New to Old"
                  >
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-sky-400" />
                      <span>Date & Time</span>
                      {sortBy === 'TIME_ASC' ? (
                        <span className="inline-flex items-center text-sky-400 text-[10px] font-mono font-bold bg-sky-950 px-1 py-0.2 rounded border border-sky-800">
                          Old→New ↑
                        </span>
                      ) : sortBy === 'TIME_DESC' ? (
                        <span className="inline-flex items-center text-sky-400 text-[10px] font-mono font-bold bg-sky-950 px-1 py-0.2 rounded border border-sky-800">
                          New→Old ↓
                        </span>
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-600" />
                      )}
                    </div>
                  </th>
                  <th className="py-3 px-3">Asset</th>
                  <th className="py-3 px-3">Strategy Used</th>
                  <th className="py-3 px-3">AI Decision</th>
                  {/* Signal Strength Column (User Request: "show strongness of signal") */}
                  <th
                    className="py-3 px-3 cursor-pointer select-none hover:text-amber-300 transition-colors"
                    onClick={() => setSortBy(sortBy === 'STRENGTH_DESC' ? 'STRENGTH_ASC' : 'STRENGTH_DESC')}
                    title="Click to sort by Signal Strength"
                  >
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-amber-400" />
                      <span>Signal Strength</span>
                      {sortBy === 'STRENGTH_DESC' ? (
                        <span className="inline-flex items-center text-amber-300 text-[10px] font-mono font-bold bg-amber-950 px-1 py-0.2 rounded border border-amber-800">
                          High ↓
                        </span>
                      ) : sortBy === 'STRENGTH_ASC' ? (
                        <span className="inline-flex items-center text-amber-300 text-[10px] font-mono font-bold bg-amber-950 px-1 py-0.2 rounded border border-amber-800">
                          Low ↑
                        </span>
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-600" />
                      )}
                    </div>
                  </th>
                  <th className="py-3 px-3">Direction</th>
                  <th className="py-3 px-3 text-right">Entry</th>
                  <th className="py-3 px-3 text-right">Stop Loss</th>
                  <th className="py-3 px-3 text-right">TP1 (1:2)</th>
                  <th className="py-3 px-3 text-right">TP2 (1:3)</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 tabular-nums">
                {filteredSignals.map((sig) => {
                  const isLong = sig.direction === 'LONG';
                  const isAi = sig.aiUsed;

                  return (
                    <tr
                      key={sig.id}
                      className="hover:bg-slate-800/40 transition-colors text-slate-200"
                    >
                      <td className="py-2.5 px-3 text-slate-300 text-[11px] font-mono whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                          <span>{formatSignalDateTime(sig)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white font-sans">{sig.symbol}</td>
                      <td className="py-2.5 px-3 font-sans">
                        <div className="flex items-center gap-1.5">
                          {sig.strategyId === 'WILLIAMS_FRACTAL_SWEEP' ? (
                            <Layers className="w-3 h-3 text-amber-400" />
                          ) : sig.strategyId === 'KIE_AI_THESIS' ? (
                            <Sparkles className="w-3 h-3 text-purple-400" />
                          ) : (
                            <Activity className="w-3 h-3 text-sky-400" />
                          )}
                          <span className="font-semibold text-slate-200">{sig.strategyName}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 block">{sig.strategyCode}</span>
                      </td>
                      <td className="py-2.5 px-3">
                        {isAi ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-950 text-purple-300 border border-purple-800">
                            <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                            <span>YES ({sig.aiCreditsConsumed} cr)</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                            <Zap className="w-2.5 h-2.5 text-sky-400" />
                            <span>NO (0 Credits)</span>
                          </span>
                        )}
                      </td>
                      {/* Signal Strength & Conviction Meter (User Request: "show strongness of signal") */}
                      <td className="py-2.5 px-3">
                        <div className="space-y-1 min-w-[110px]">
                          <div className="flex items-center justify-between gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                                sig.strongnessTier === 'A+'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm shadow-amber-950/30'
                                  : sig.strongnessTier === 'A'
                                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/50'
                                  : sig.strongnessTier === 'B+'
                                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                                  : 'bg-slate-800 text-slate-400 border border-slate-700'
                              }`}
                            >
                              {sig.strongnessTier === 'A+' && (
                                <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                              )}
                              {sig.strongnessTier === 'A' && (
                                <ShieldCheck className="w-2.5 h-2.5 text-sky-400" />
                              )}
                              <span>Tier {sig.strongnessTier}</span>
                            </span>
                            <span className="text-[11px] font-mono font-bold text-slate-100">
                              {sig.confidenceScore}%
                            </span>
                          </div>
                          {/* Visual Strength Progress Meter */}
                          <div className="w-full bg-slate-800/90 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                sig.confidenceScore >= 85
                                  ? 'bg-gradient-to-r from-amber-400 to-emerald-400'
                                  : sig.confidenceScore >= 70
                                  ? 'bg-sky-400'
                                  : 'bg-indigo-400'
                              }`}
                              style={{
                                width: `${Math.min(100, Math.max(12, sig.confidenceScore))}%`,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold ${
                            isLong
                              ? 'text-emerald-400 bg-emerald-500/10'
                              : 'text-rose-400 bg-rose-500/10'
                          }`}
                        >
                          {sig.direction}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <div className="font-semibold text-slate-200">${formatPrice(sig.entryPrice)}</div>
                        {typeof sig.currentPrice === 'number' && (
                          <div className="text-[10px] text-slate-400">
                            Now: ${formatPrice(sig.currentPrice)}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-400 font-semibold font-mono">
                        ${formatPrice(sig.stopLoss)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold font-mono">
                        ${formatPrice(sig.tp1)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-sky-400 font-semibold font-mono">
                        ${formatPrice(sig.tp2)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                              sig.status === 'HIT_TP1' || sig.status === 'HIT_TP2' || sig.status === 'HIT_TP3'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-600/40'
                                : sig.status === 'STOPPED_OUT'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-600/40'
                                : sig.status === 'EXPIRED'
                                ? 'bg-slate-800 text-slate-400 border border-slate-700'
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-600/40'
                            }`}
                            title={sig.failureReason || sig.status}
                          >
                            {sig.status === 'ACTIVE' && (
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            )}
                            {sig.status === 'ACTIVE'
                              ? 'ACTIVE'
                              : sig.status === 'HIT_TP1'
                              ? 'HIT TP1 (+1.0R)'
                              : sig.status === 'HIT_TP2'
                              ? 'HIT TP2 (+2.25R)'
                              : sig.status === 'HIT_TP3'
                              ? 'HIT TP3 (+4.0R)'
                              : sig.status === 'STOPPED_OUT'
                              ? 'STOPPED (-1.0R)'
                              : sig.status === 'EXPIRED'
                              ? 'EXPIRED'
                              : sig.status}
                          </span>
                          {typeof sig.pnlPercent === 'number' && (
                            <span
                              className={`text-[10px] font-mono font-semibold ${
                                sig.pnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {sig.pnlPercent >= 0 ? `+${sig.pnlPercent}%` : `${sig.pnlPercent}%`}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenSignal(sig)}
                            className="px-2 py-0.5 bg-sky-950/80 hover:bg-sky-900 text-sky-300 border border-sky-800/80 rounded text-[10px] font-mono font-medium transition-colors flex items-center gap-1 shadow-sm"
                            title="Open Position Size & Leverage Calculator"
                          >
                            <Calculator className="w-3.5 h-3.5 text-sky-400" />
                            <span className="hidden xl:inline">Calc</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenSignal(sig)}
                            className="p-1 hover:text-sky-400 transition-colors"
                            title="Audit Decision"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectSymbol(sig.symbol);
                              onNavigateToTerminal(sig.symbol);
                            }}
                            className="p-1 hover:text-emerald-400 transition-colors"
                            title="Open in Chart"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                          {onDeleteSignal && (
                            <button
                              type="button"
                              onClick={() => onDeleteSignal(sig.id)}
                              className="p-1 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded transition-colors"
                              title="Delete signal permanently"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deep Signal Decision Audit Modal */}
      {inspectedSignal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="bg-[#111827] border border-sky-500/50 rounded-xl max-w-3xl w-full p-5 space-y-4 shadow-2xl shadow-sky-950 overflow-y-auto max-h-[92vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-white font-mono">
                    {inspectedSignal.symbol} Signal Audit
                  </span>
                  <span className="text-xs text-slate-400 font-mono">({inspectedSignal.id})</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono mt-1">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  <span>Date & Time: <strong className="text-slate-200">{formatSignalDateTime(inspectedSignal)}</strong></span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectedSignal(null)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Decision Engine Transparency Banner */}
            <div
              className={`p-4 rounded-xl border space-y-2 ${
                inspectedSignal.aiUsed
                  ? 'bg-purple-950/40 border-purple-700/80 text-purple-200'
                  : 'bg-emerald-950/40 border-emerald-700/80 text-emerald-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold flex items-center gap-1.5">
                  {inspectedSignal.aiUsed ? (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span>AI Decision Engine: ACTIVE</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 text-sky-300" />
                      <span>Deterministic Algorithmic Engine: 100% Free Math</span>
                    </>
                  )}
                </span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-black/40">
                  {inspectedSignal.aiCreditsConsumed > 0
                    ? `${inspectedSignal.aiCreditsConsumed} Kie.ai Credits`
                    : '0 Credits Consumed'}
                </span>
              </div>
              <p className="text-xs leading-relaxed text-slate-300">
                {inspectedSignal.aiDecisionExplanation}
              </p>
              {inspectedSignal.aiTaskId && (
                <div className="text-[11px] font-mono text-slate-400 pt-1">
                  Kie.ai Engine Task ID: <code>{inspectedSignal.aiTaskId}</code>
                </div>
              )}
            </div>

            {/* Strategy Architecture Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-200 font-semibold">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>Strategy Applied: {inspectedSignal.strategyName}</span>
                </span>
                <span className="font-mono text-slate-400">Timeframe: {inspectedSignal.timeframe}</span>
              </div>
              <p className="text-slate-400 leading-relaxed">
                {inspectedSignal.strategyDescription}
              </p>
              <div className="text-slate-300 bg-slate-950 p-2.5 rounded border border-slate-800 font-mono text-[11px]">
                <strong>Rule Trigger:</strong> {inspectedSignal.rulesSummary}
              </div>
            </div>

            {/* Trade Lifecycle & Outcome Status */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-sky-400" />
                  <span>Execution Lifecycle & Verification</span>
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold font-mono ${
                    inspectedSignal.status === 'HIT_TP1' ||
                    inspectedSignal.status === 'HIT_TP2' ||
                    inspectedSignal.status === 'HIT_TP3'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-600/50'
                      : inspectedSignal.status === 'STOPPED_OUT'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-600/50'
                      : inspectedSignal.status === 'ACTIVE'
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-600/50'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {inspectedSignal.status === 'ACTIVE' && (
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                  )}
                  {inspectedSignal.status === 'ACTIVE'
                    ? 'LIVE IN PLAY (ACTIVE)'
                    : inspectedSignal.status === 'HIT_TP1'
                    ? 'TARGET 1 HIT (+1.0R)'
                    : inspectedSignal.status === 'HIT_TP2'
                    ? 'TARGET 2 HIT (+2.25R)'
                    : inspectedSignal.status === 'HIT_TP3'
                    ? 'TARGET 3 HIT (+4.0R)'
                    : inspectedSignal.status === 'STOPPED_OUT'
                    ? 'STOPPED OUT (-1.0R)'
                    : inspectedSignal.status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1 font-mono text-[11px]">
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Realized / Live PnL</span>
                  <span
                    className={`font-bold ${
                      (inspectedSignal.pnlPercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {(inspectedSignal.pnlPercent ?? 0) >= 0
                      ? `+${inspectedSignal.pnlPercent}%`
                      : `${inspectedSignal.pnlPercent}%`}
                  </span>
                </div>
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">R-Multiple Return</span>
                  <span
                    className={`font-bold ${
                      typeof inspectedSignal.realizedR === 'number'
                        ? inspectedSignal.realizedR > 0
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                        : 'text-slate-300'
                    }`}
                  >
                    {typeof inspectedSignal.realizedR === 'number'
                      ? inspectedSignal.realizedR > 0
                        ? `+${inspectedSignal.realizedR}R`
                        : `${inspectedSignal.realizedR}R`
                      : 'In Play'}
                  </span>
                </div>
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Current Market Price</span>
                  <span className="font-bold text-white">
                    {typeof inspectedSignal.currentPrice === 'number'
                      ? `$${formatPrice(inspectedSignal.currentPrice)}`
                      : `$${formatPrice(inspectedSignal.entryPrice)}`}
                  </span>
                </div>
              </div>

              {inspectedSignal.failureReason && (
                <div className="text-rose-300 bg-rose-950/40 p-2.5 rounded border border-rose-800/60 font-mono text-[11px]">
                  <strong>Exit Reason:</strong> {inspectedSignal.failureReason}
                </div>
              )}
            </div>

            {/* Tiered Profit Structure (Rule 4) */}
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-3.5 space-y-2 text-xs font-mono">
              <div className="text-slate-200 font-semibold font-sans">
                Tiered Execution & Profit Booking Matrix
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-slate-500 block text-[10px]">Entry Price</span>
                  <span className="text-white font-bold">${formatPrice(inspectedSignal.entryPrice)}</span>
                </div>
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-rose-400 block text-[10px]">Stop Loss</span>
                  <span className="text-rose-400 font-bold">${formatPrice(inspectedSignal.stopLoss)}</span>
                </div>
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-emerald-400 block text-[10px]">TP1 (1:2) · 50% Book</span>
                  <span className="text-emerald-400 font-bold">${formatPrice(inspectedSignal.tp1)}</span>
                </div>
                <div className="bg-slate-950 p-2 rounded border border-slate-800">
                  <span className="text-sky-400 block text-[10px]">TP2 (1:3) · 25% Book</span>
                  <span className="text-sky-400 font-bold">${formatPrice(inspectedSignal.tp2)}</span>
                </div>
              </div>
            </div>

            {/* Futures Position Sizing & Leverage Risk Calculator (User Request) */}
            <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border border-sky-500/50 rounded-xl p-4 space-y-3.5 shadow-xl shadow-sky-950/40">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/40">
                    <Calculator className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-white flex items-center gap-2 font-sans">
                      <span>Futures Position &amp; Risk Calculator</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-950 text-sky-300 border border-sky-700/60 font-semibold">
                        Fixed-Risk Sizing
                      </span>
                    </span>
                    <span className="text-[11px] text-slate-400 block font-sans">
                      Set your fixed dollar loss &amp; leverage — quantity, margin, liquidation, and target profits calculate in real time.
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowCustomOverrides(!showCustomOverrides)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono rounded border border-slate-700 transition-colors flex items-center gap-1.5"
                >
                  <Sliders className="w-3 h-3 text-sky-400" />
                  <span>{showCustomOverrides ? 'Hide Level Tweaks' : 'Adjust Entry / SL'}</span>
                </button>
              </div>

              {/* Optional Custom Entry / SL Overrides Accordion */}
              {showCustomOverrides && (
                <div className="bg-slate-950/90 rounded-lg p-3 border border-slate-800 space-y-2 text-xs font-mono animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-slate-300">
                    <span className="font-semibold text-sky-300">Fine-Tune Order Levels</span>
                    {(calcCustomEntry !== null || calcCustomSL !== null) && (
                      <button
                        type="button"
                        onClick={() => {
                          setCalcCustomEntry(null);
                          setCalcCustomSL(null);
                        }}
                        className="text-[10px] text-amber-400 hover:underline"
                      >
                        Reset to Signal Defaults
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">
                        Entry Price ($)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={calcCustomEntry ?? inspectedSignal.entryPrice}
                        onChange={(e) => setCalcCustomEntry(Number(e.target.value) || null)}
                        className="w-full px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-slate-100 text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">
                        Stop Loss ($)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={calcCustomSL ?? inspectedSignal.stopLoss}
                        onChange={(e) => setCalcCustomSL(Number(e.target.value) || null)}
                        className="w-full px-2.5 py-1 bg-slate-900 border border-slate-700 rounded text-slate-100 text-xs focus:outline-none focus:border-sky-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Input Row 1: Max Loss Amount ($) and Leverage (x) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Input 1: Fixed Max Loss Amount ($) */}
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-200 flex items-center gap-1 font-sans">
                      <DollarSign className="w-3.5 h-3.5 text-rose-400" />
                      <span>Max Loss Amount (Risk in USDT)</span>
                    </label>
                    <span className="text-[10px] font-mono text-rose-400 font-bold bg-rose-950/60 px-1.5 py-0.5 rounded border border-rose-900/60">
                      Capped at -${calcLossAmount.toFixed(0)}
                    </span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm">
                      $
                    </span>
                    <input
                      type="number"
                      min={1}
                      step={5}
                      value={calcLossAmount}
                      onChange={(e) => setCalcLossAmount(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full pl-7 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-md text-sm font-mono text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                      placeholder="e.g. 50"
                    />
                  </div>
                  {/* Quick Preset Buttons */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[10px] text-slate-500 font-mono">Risk:</span>
                    {[10, 25, 50, 100, 200, 500].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setCalcLossAmount(amt)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${
                          calcLossAmount === amt
                            ? 'bg-rose-500/30 text-rose-300 border border-rose-500/60 font-bold'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800'
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Input 2: Leverage Multiplier (x) */}
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-200 flex items-center gap-1 font-sans">
                      <Sliders className="w-3.5 h-3.5 text-amber-400" />
                      <span>Futures Leverage Multiplier</span>
                    </label>
                    <span className="text-[10px] font-mono text-amber-300 font-bold bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-900/60">
                      {calcLeverage}x Leverage
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="range"
                      min={1}
                      max={50}
                      step={1}
                      value={calcLeverage}
                      onChange={(e) => setCalcLeverage(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                      className="w-full accent-sky-500 cursor-pointer"
                    />
                    <div className="relative w-20 shrink-0">
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={calcLeverage}
                        onChange={(e) => setCalcLeverage(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                        className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs font-mono text-white text-center focus:outline-none focus:border-sky-500"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-[10px] font-mono pointer-events-none">
                        x
                      </span>
                    </div>
                  </div>
                  {/* Quick Leverage Preset Chips */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[10px] text-slate-500 font-mono">Lev:</span>
                    {[2, 5, 10, 20, 30, 50].map((lev) => (
                      <button
                        key={lev}
                        type="button"
                        onClick={() => setCalcLeverage(lev)}
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium transition-colors ${
                          calcLeverage === lev
                            ? 'bg-amber-500/30 text-amber-300 border border-amber-500/60 font-bold'
                            : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800'
                        }`}
                      >
                        {lev}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Calculated Outputs ("rest of all calculate") */}
              {calcResult && (
                <div className="space-y-3 pt-1">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                    {/* Output 1: Position Quantity in Tokens */}
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-0.5">
                      <span className="text-slate-400 block text-[10px] font-sans">
                        Position Size ({inspectedSignal.symbol.replace('USDT', '')})
                      </span>
                      <div className="text-base font-bold text-white font-mono tracking-tight">
                        {calcResult.positionQuantity.toLocaleString('en-US', { maximumFractionDigits: 4 })}
                      </div>
                      <span className="text-[10px] text-slate-500 block truncate">
                        Notional: ${calcResult.positionValueUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* Output 2: Required Margin */}
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-0.5">
                      <span className="text-sky-400 block text-[10px] font-sans">
                        Required Margin ({calcLeverage}x)
                      </span>
                      <div className="text-base font-bold text-sky-300 font-mono tracking-tight">
                        ${calcResult.requiredMargin.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                      <span className="text-[10px] text-slate-500 block">
                        Wallet Capital Needed
                      </span>
                    </div>

                    {/* Output 3: Stop Loss Loss & Distance */}
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-0.5">
                      <span className="text-rose-400 block text-[10px] font-sans">
                        Stop Loss Max Risk
                      </span>
                      <div className="text-base font-bold text-rose-400 font-mono tracking-tight">
                        -${calcLossAmount.toFixed(2)}
                      </div>
                      <span className="text-[10px] text-rose-400/90 block">
                        {calcResult.roeAtStopLossPercent}% ROE ({calcResult.priceDistanceSLPercent}% move)
                      </span>
                    </div>

                    {/* Output 4: Estimated Liquidation Price & Safety Guard */}
                    <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 space-y-0.5">
                      <span className="text-amber-400 block text-[10px] font-sans">
                        Est. Liquidation Price
                      </span>
                      <div className="text-base font-bold text-amber-300 font-mono tracking-tight">
                        ${formatPrice(calcResult.estimatedLiquidationPrice)}
                      </div>
                      <div>
                        {calcResult.isLiquidationSafe ? (
                          <span className="text-[10px] text-emerald-400 font-semibold inline-flex items-center gap-1 font-sans">
                            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>Safe (Beyond SL)</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-rose-400 font-bold inline-flex items-center gap-1 font-sans">
                            <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0 animate-pulse" />
                            <span>Liq before SL!</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Liquidation Danger Alert Banner if Leverage too high */}
                  {!calcResult.isLiquidationSafe && (
                    <div className="bg-rose-950/60 border border-rose-700/80 rounded-lg p-2.5 text-xs text-rose-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div className="leading-snug">
                        <strong>Excessive Leverage Warning:</strong> At {calcLeverage}x, your liquidation price ($
                        {formatPrice(calcResult.estimatedLiquidationPrice)}) will trigger <em>before</em> your Stop Loss ($
                        {formatPrice(calcCustomSL ?? inspectedSignal.stopLoss)})! Reduce leverage to{' '}
                        <strong className="text-amber-300">{calcResult.maxLeverageBeforeLiquidation}x or lower</strong> so your stop loss safely protects your capital.
                      </div>
                    </div>
                  )}

                  {/* Target Profits & Returns Breakdown */}
                  <div className="bg-slate-950/90 rounded-lg p-3 border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-semibold font-sans">
                      <span className="flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Estimated Profit at Target Levels</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        Risk:Reward from -${calcLossAmount.toFixed(0)} risk
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-xs">
                      {/* TP1 */}
                      <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 flex items-center justify-between sm:flex-col sm:items-start sm:gap-1">
                        <div>
                          <span className="text-[11px] text-emerald-400 font-bold block">
                            Target 1 ({inspectedSignal.tp1 ? `$${formatPrice(inspectedSignal.tp1)}` : '1:2'})
                          </span>
                          <span className="text-[10px] text-slate-400 block font-sans">
                            {calcResult.tp1RMultiple}R Multiplier · 50% Book
                          </span>
                        </div>
                        <div className="text-right sm:text-left">
                          <span className="text-sm font-bold text-emerald-400 block">
                            +${calcResult.tp1GainUSD.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-emerald-400/90 block font-bold">
                            +{calcResult.tp1RoePercent}% ROE
                          </span>
                        </div>
                      </div>

                      {/* TP2 */}
                      <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 flex items-center justify-between sm:flex-col sm:items-start sm:gap-1">
                        <div>
                          <span className="text-[11px] text-sky-400 font-bold block">
                            Target 2 ({inspectedSignal.tp2 ? `$${formatPrice(inspectedSignal.tp2)}` : '1:3'})
                          </span>
                          <span className="text-[10px] text-slate-400 block font-sans">
                            {calcResult.tp2RMultiple}R Multiplier · 25% Book
                          </span>
                        </div>
                        <div className="text-right sm:text-left">
                          <span className="text-sm font-bold text-sky-300 block">
                            +${calcResult.tp2GainUSD.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-sky-400/90 block font-bold">
                            +{calcResult.tp2RoePercent}% ROE
                          </span>
                        </div>
                      </div>

                      {/* TP3 */}
                      <div className="bg-slate-900/80 p-2.5 rounded border border-slate-800 flex items-center justify-between sm:flex-col sm:items-start sm:gap-1">
                        <div>
                          <span className="text-[11px] text-indigo-400 font-bold block">
                            Target 3 ({inspectedSignal.tp3 ? `$${formatPrice(inspectedSignal.tp3)}` : '1:4'})
                          </span>
                          <span className="text-[10px] text-slate-400 block font-sans">
                            {calcResult.tp3RMultiple}R Multiplier · 25% Book
                          </span>
                        </div>
                        <div className="text-right sm:text-left">
                          <span className="text-sm font-bold text-indigo-300 block">
                            +${calcResult.tp3GainUSD.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-indigo-400/90 block font-bold">
                            +{calcResult.tp3RoePercent}% ROE
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* One-Click Copy Order Parameters Button */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-mono text-slate-400 border-t border-slate-800/80">
                    <span className="truncate max-w-full sm:max-w-[70%]">
                      <strong>Order:</strong> {inspectedSignal.direction} {calcResult.positionQuantity} {inspectedSignal.symbol} @ $
                      {formatPrice(calcCustomEntry ?? inspectedSignal.entryPrice)} | SL: $
                      {formatPrice(calcCustomSL ?? inspectedSignal.stopLoss)} | Margin: ${calcResult.requiredMargin} ({calcLeverage}x)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const orderStr = `${inspectedSignal.symbol} ${inspectedSignal.direction} | Qty: ${calcResult.positionQuantity} | Entry: $${formatPrice(calcCustomEntry ?? inspectedSignal.entryPrice)} | SL: $${formatPrice(calcCustomSL ?? inspectedSignal.stopLoss)} | TP1: $${formatPrice(inspectedSignal.tp1)} | Margin: $${calcResult.requiredMargin} USDT (${calcLeverage}x) | Max Risk: $${calcLossAmount.toFixed(0)}`;
                        navigator.clipboard.writeText(orderStr);
                        setCopiedOrder(true);
                        setTimeout(() => setCopiedOrder(false), 2000);
                      }}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors ml-auto"
                    >
                      {copiedOrder ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-semibold font-sans">Order Parameters Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-sky-400" />
                          <span className="font-sans">Copy Order Parameters</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => {
                  onCreateAlert(
                    inspectedSignal.symbol,
                    inspectedSignal.tp1,
                    inspectedSignal.direction === 'LONG' ? 'PRICE_ABOVE' : 'PRICE_BELOW',
                    `Alert at TP1 for ${inspectedSignal.symbol}`
                  );
                  setInspectedSignal(null);
                }}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
              >
                <BellPlus className="w-3.5 h-3.5 text-emerald-400" />
                <span>Set Alert at TP1</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInspectedSignal(null)}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onSelectSymbol(inspectedSignal.symbol);
                    onNavigateToTerminal(inspectedSignal.symbol);
                    setInspectedSignal(null);
                  }}
                  className="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <span>Open in Market Terminal</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
