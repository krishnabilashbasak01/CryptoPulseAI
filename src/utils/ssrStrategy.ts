/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Sweep, Shift, and Return (SSR) — Institutional Crypto Trading Engine
 * Based on Institutional Order Flow Dynamics & Smart Money Concepts (SMC)
 * 
 * 3-Phase Algorithmic Pipeline:
 *  - Phase 1: Liquidity Sweep (BSL / SSL) with Rejection Confirmation
 *  - Phase 2: Market Structure Shift (MSS) with Displacement
 *  - Phase 3: Fair Value Gap (FVG) Proximal Edge Limit Entry on Retracement ("Return")
 *  - Invalidation: Strict Stop Loss at the Sweep Extreme Wick
 *  - Management: Tiered Exits 1:2 (50% + BE move), 1:3 (25%), 1:4 (25% runner)
 */

import { Candle } from './quant';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type SsrDirection = 'LONG' | 'SHORT';
export type SsrPhase = 'PHASE_1_SWEEP' | 'PHASE_2_MSS' | 'PHASE_3_FVG_RETURN' | 'COMPLETED_TRIGGER' | 'INSIDE_RANGE';

export interface LiquidityPool {
  id: string;
  type: 'BSL' | 'SSL'; // Buy-Side Liquidity (Swing High) or Sell-Side Liquidity (Swing Low)
  price: number;
  time: number;
  timeString: string;
  timeframe: '1h' | '4h';
  swept: boolean;
  sweepTime?: number;
  sweepExtreme?: number;
}

export interface MarketStructureShift {
  time: number;
  timeString: string;
  direction: SsrDirection;
  brokenStructuralLevel: number;
  displacementBarIdx: number;
  displacementRatio: number; // Body size vs average ATR
}

export interface FairValueGap {
  id: string;
  direction: SsrDirection;
  time: number;
  timeString: string;
  proximalEdge: number; // Entry trigger level (closer to current price)
  distalEdge: number;   // Deepest boundary of the gap
  gapSizePercent: number;
  filled: boolean;
  fillTime?: number;
}

export interface SsrSignal {
  id: string;
  symbol: string;
  time: number;
  timeString: string;
  direction: SsrDirection;
  phase: SsrPhase;
  phaseDescription: string;
  
  // Phase 1: Sweep Details
  liquidityPoolType: 'BSL' | 'SSL';
  sweptLevel: number;
  sweepExtreme: number;
  
  // Phase 2: MSS Details
  mssLevel: number;
  mssTime: number;
  displacementScore: number;
  
  // Phase 3: FVG Details
  fvgProximal: number;
  fvgDistal: number;
  fvgSizePercent: number;
  
  // Execution & Targets
  entryPrice: number;
  stopLoss: number;
  riskAmount: number;
  riskPercent: number;
  tp1: number; // 1:2 R (50% scale-out + BE)
  tp2: number; // 1:3 R (25% scale-out)
  tp3: number; // 1:4 R (25% runner exit)
  riskRewardRatio: number;
  
  // Institutional Confidence Score & Filters
  confidenceScore: number;
  confidenceTier: 'A+' | 'A' | 'B+';
  keyFactors: string[];
  
  // Lifecycle for live ledger
  status: 'ACTIVE' | 'HIT_TP1' | 'HIT_TP2' | 'HIT_TP3' | 'STOPPED_OUT' | 'CANCELLED';
  currentPrice?: number;
  pnlPercent?: number;
  realizedR?: number;
  exitPrice?: number;
  exitTime?: number;
  exitReason?: string;
}

export interface SsrAssetScanResult {
  symbol: string;
  phase: SsrPhase;
  phaseLabel: string;
  direction?: SsrDirection;
  currentPrice: number;
  priceChangePercent24h?: number;
  quoteVolume24h?: number;
  
  // Phase 1 info
  liquidityPoolType?: 'BSL' | 'SSL';
  sweptLevel?: number;
  sweepExtreme?: number;
  sweepTime?: number;
  sweepTimeString?: string;
  sweepBarsAgo?: number;

  // Phase 2 info
  mssLevel?: number;
  displacementRatio?: number;
  mssTime?: number;

  // Phase 3 info
  fvgProximal?: number;
  fvgDistal?: number;
  fvgSizePercent?: number;
  entryPrice?: number;
  stopLoss?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  riskPercent?: number;
  confidenceScore?: number;
  confidenceTier?: 'A+' | 'A' | 'B+';

  // Inside Range context
  nearestBsl?: number;
  distToBslPct?: number;
  nearestSsl?: number;
  distToSslPct?: number;

  // Full signal if in Phase 3
  signal?: SsrSignal;

  statusMessage: string;
  lastUpdated: number;
}

export interface SsrBacktestTrade {
  id: string;
  entryTime: number;
  exitTime: number;
  entryTimeString: string;
  exitTimeString: string;
  direction: SsrDirection;
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  exitPrice: number;
  riskAmount: number;
  riskPercent: number;
  
  // Setup Details
  sweptLevel: number;
  sweepExtreme: number;
  mssLevel: number;
  fvgProximal: number;
  fvgDistal: number;
  
  // Outcome
  hitTp1: boolean;
  hitTp2: boolean;
  hitTp3: boolean;
  stoppedOut: boolean;
  exitReason: 'TP1_TRAIL_STOP' | 'TP2_TRAIL_STOP' | 'TP3_MAX' | 'FULL_STOP_LOSS' | 'BAR_TIMEOUT';
  netRealizedR: number;
  pnlUsdt: number;
  durationBars: number;
  durationMinutes: number;
  durationString: string;
  isWinner: boolean;
  
  // Fees (0.05% round-trip taker fee)
  estimatedFeesUsdt: number;
  netPnlAfterFeesUsdt: number;
  
  // Forensic Diagnostic
  failureCategory?: 'TREND_MOMENTUM_RUNAWAY' | 'FVG_EXPANSION_INVALIDATION' | 'SECONDARY_SWEEP_SL' | 'CHOPPY_TIME_EXPIRATION';
  forensicDiagnosis?: string;
}

export type SsrSuccessVerdict = 
  | 'PROVEN_PROFITABLE_EDGE' 
  | 'MODERATE_VIABLE_EDGE' 
  | 'MARGINAL_BREAKEVEN' 
  | 'NEGATIVE_EXPECTANCY';

export interface SsrBacktestSummary {
  id: string;
  symbol: string;
  timeframeLTF: '5m' | '3m' | '1m';
  timeframeHTF: '1h' | '4h';
  dateRangePreset: string;
  startDate: string;
  endDate: string;
  startTimeMs: number;
  endTimeMs: number;
  riskPerTradeUsdt: number;
  accountEquityUsdt: number;
  
  // Core Statistics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number; // %
  
  // Expectancy & Returns
  netProfitR: number;
  netProfitUsdt: number;
  profitPercentEquity: number; // % gained on account equity (1% risk model)
  netProfitAfterFeesUsdt: number;
  totalFeesPaidUsdt: number;
  
  // Advanced Risk Metrics
  profitFactor: number;
  expectancyR: number; // Mathematical Expectancy (EV) per trade
  maxDrawdownR: number;
  maxDrawdownUsdt: number;
  maxDrawdownPercent: number;
  avgTradeR: number;
  avgTradeUsdt: number;
  avgDurationBars: number;
  
  // Target Hits
  tp1HitRate: number; // %
  tp2HitRate: number; // %
  tp3HitRate: number; // %
  
  // Success Evaluation
  successVerdict: SsrSuccessVerdict;
  verdictTitle: string;
  verdictDescription: string;
  isStrategySuccess: boolean;
  
  // Forensic Classification
  failureClassification: Record<string, number>;
  trades: SsrBacktestTrade[];
  candlesCountHTF: number;
  candlesCountLTF: number;
  createdAt: string;
}

// ============================================================================
// Helper Utilities
// ============================================================================

export function formatSsrPrice(p: number): number {
  if (p >= 1000) return Number(p.toFixed(2));
  if (p >= 1) return Number(p.toFixed(4));
  return Number(p.toFixed(6));
}

export function formatSsrTime(ts: number): string {
  const d = new Date(ts);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function formatSsrDisplayDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

// ============================================================================
// 1. Phase 1: Higher Timeframe Liquidity Pools & Sweeps
// ============================================================================

/**
 * Extracts prominent Swing Highs (Buy-Side Liquidity) and Swing Lows (Sell-Side Liquidity)
 * on 1H or 4H candles using standard institutional pivot periods (n=3 or n=4).
 */
export function extractLiquidityPools(candlesHTF: Candle[], period = 3): LiquidityPool[] {
  const pools: LiquidityPool[] = [];
  if (candlesHTF.length < period * 2 + 1) return pools;

  for (let i = period; i < candlesHTF.length - period; i++) {
    const candidate = candlesHTF[i];
    let isHigh = true;
    let isLow = true;

    for (let offset = 1; offset <= period; offset++) {
      if (candlesHTF[i - offset].high >= candidate.high || candlesHTF[i + offset].high >= candidate.high) {
        isHigh = false;
      }
      if (candlesHTF[i - offset].low <= candidate.low || candlesHTF[i + offset].low <= candidate.low) {
        isLow = false;
      }
    }

    if (isHigh) {
      pools.push({
        id: `bsl-${candidate.time}`,
        type: 'BSL',
        price: candidate.high,
        time: candidate.time,
        timeString: formatSsrTime(candidate.time),
        timeframe: '1h',
        swept: false,
      });
    }

    if (isLow) {
      pools.push({
        id: `ssl-${candidate.time}`,
        type: 'SSL',
        price: candidate.low,
        time: candidate.time,
        timeString: formatSsrTime(candidate.time),
        timeframe: '1h',
        swept: false,
      });
    }
  }

  return pools;
}

/**
 * Checks if price on the lower timeframe (LTF) swept an existing HTF liquidity pool
 * with a decisive rejection wick (pierced beyond the level, but closed back inside).
 */
export function checkLiquiditySweep(
  recentBars: Candle[],
  pools: LiquidityPool[],
  currentTime: number
): { sweptPool: LiquidityPool; direction: SsrDirection; sweepExtreme: number; sweepBarIdx: number } | null {
  if (recentBars.length < 1) return null;
  const currentBar = recentBars[recentBars.length - 1];

  // Eligible pools must have formed before the recent sweep window
  const eligiblePools = pools.filter((p) => p.time < currentTime - 60 * 60 * 1000);

  // Check recent 6 bars for the sweep peak
  for (let i = Math.max(0, recentBars.length - 8); i < recentBars.length; i++) {
    const bar = recentBars[i];

    for (const pool of eligiblePools) {
      // 1. Bearish Setup: Buy-Side Liquidity (BSL) Swept
      if (pool.type === 'BSL') {
        if (bar.high > pool.price) {
          // Strict rejection rule: Current or sweep bar must close back BELOW the BSL level
          if (currentBar.close < pool.price) {
            const highestWick = Math.max(...recentBars.slice(i).map((b) => b.high));
            return {
              sweptPool: pool,
              direction: 'SHORT',
              sweepExtreme: highestWick,
              sweepBarIdx: i,
            };
          }
        }
      }

      // 2. Bullish Setup: Sell-Side Liquidity (SSL) Swept
      if (pool.type === 'SSL') {
        if (bar.low < pool.price) {
          // Strict rejection rule: Current or sweep bar must close back ABOVE the SSL level
          if (currentBar.close > pool.price) {
            const lowestWick = Math.min(...recentBars.slice(i).map((b) => b.low));
            return {
              sweptPool: pool,
              direction: 'LONG',
              sweepExtreme: lowestWick,
              sweepBarIdx: i,
            };
          }
        }
      }
    }
  }

  return null;
}

// ============================================================================
// 2. Phase 2: Market Structure Shift (MSS) with Displacement
// ============================================================================

/**
 * Evaluates whether following the sweep, price aggressively reverses and breaks
 * the immediate opposing structural swing point with institutional displacement.
 */
export function detectMarketStructureShift(
  candlesLTF: Candle[],
  sweepBarIdx: number,
  direction: SsrDirection,
  maxBarsToShift = 12
): MarketStructureShift | null {
  const startIndex = Math.max(0, sweepBarIdx - 4);
  const endIndex = Math.min(candlesLTF.length - 1, sweepBarIdx + maxBarsToShift);
  if (endIndex <= sweepBarIdx) return null;

  // Average candle range for displacement comparison
  const priorBars = candlesLTF.slice(Math.max(0, sweepBarIdx - 15), sweepBarIdx);
  const avgRange = priorBars.length > 0 
    ? priorBars.reduce((acc, b) => acc + Math.abs(b.high - b.low), 0) / priorBars.length 
    : 1;

  if (direction === 'SHORT') {
    // For a SHORT: Find the structural swing low formed prior to the sweep peak
    const preSweepBars = candlesLTF.slice(startIndex, sweepBarIdx + 1);
    if (preSweepBars.length === 0) return null;
    const structuralLow = Math.min(...preSweepBars.map((b) => b.low));

    // Look for aggressive displacement close BELOW this structural low
    for (let i = sweepBarIdx + 1; i <= endIndex; i++) {
      const bar = candlesLTF[i];
      if (bar.close < structuralLow) {
        const bodySize = Math.abs(bar.open - bar.close);
        const displacementRatio = Number((bodySize / avgRange).toFixed(2));
        if (displacementRatio >= 1.15) {
          return {
            time: bar.time,
            timeString: formatSsrTime(bar.time),
            direction: 'SHORT',
            brokenStructuralLevel: structuralLow,
            displacementBarIdx: i,
            displacementRatio,
          };
        }
      }
    }
  } else {
    // For a LONG: Find the structural swing high formed prior to the sweep trough
    const preSweepBars = candlesLTF.slice(startIndex, sweepBarIdx + 1);
    if (preSweepBars.length === 0) return null;
    const structuralHigh = Math.max(...preSweepBars.map((b) => b.high));

    // Look for aggressive displacement close ABOVE this structural high
    for (let i = sweepBarIdx + 1; i <= endIndex; i++) {
      const bar = candlesLTF[i];
      if (bar.close > structuralHigh) {
        const bodySize = Math.abs(bar.open - bar.close);
        const displacementRatio = Number((bodySize / avgRange).toFixed(2));
        if (displacementRatio >= 1.15) {
          return {
            time: bar.time,
            timeString: formatSsrTime(bar.time),
            direction: 'LONG',
            brokenStructuralLevel: structuralHigh,
            displacementBarIdx: i,
            displacementRatio,
          };
        }
      }
    }
  }

  return null;
}

// ============================================================================
// 3. Phase 3: Fair Value Gap (FVG) Imbalance Detection
// ============================================================================

/**
 * Detects the 3-candle Fair Value Gap (FVG) imbalance formed during the displacement leg.
 * Identifies the exact Proximal Edge (Limit Order entry) and Distal Edge (Backstop).
 */
export function detectFairValueGap(
  candlesLTF: Candle[],
  sweepBarIdx: number,
  displacementBarIdx: number,
  direction: SsrDirection
): FairValueGap | null {
  const start = Math.max(1, sweepBarIdx);
  const end = Math.min(candlesLTF.length - 2, displacementBarIdx + 1);

  for (let i = start; i <= end; i++) {
    const c1 = candlesLTF[i - 1]; // Candle 1
    const c2 = candlesLTF[i];     // Candle 2 (Displacement impulse)
    const c3 = candlesLTF[i + 1]; // Candle 3

    if (direction === 'SHORT') {
      // Bearish FVG: Gap between Candle 1 Low and Candle 3 High
      // C1.low > C3.high
      if (c1.low > c3.high) {
        const gapSize = c1.low - c3.high;
        const gapSizePercent = Number(((gapSize / c2.close) * 100).toFixed(3));
        if (gapSizePercent >= 0.04) {
          return {
            id: `fvg-bearish-${c2.time}`,
            direction: 'SHORT',
            time: c2.time,
            timeString: formatSsrTime(c2.time),
            proximalEdge: formatSsrPrice(c3.high), // Price returns UP to tap proximal edge
            distalEdge: formatSsrPrice(c1.low),     // Top boundary of imbalance
            gapSizePercent,
            filled: false,
          };
        }
      }
    } else {
      // Bullish FVG: Gap between Candle 1 High and Candle 3 Low
      // C3.low > C1.high
      if (c3.low > c1.high) {
        const gapSize = c3.low - c1.high;
        const gapSizePercent = Number(((gapSize / c2.close) * 100).toFixed(3));
        if (gapSizePercent >= 0.04) {
          return {
            id: `fvg-bullish-${c2.time}`,
            direction: 'LONG',
            time: c2.time,
            timeString: formatSsrTime(c2.time),
            proximalEdge: formatSsrPrice(c3.low),  // Price returns DOWN to tap proximal edge
            distalEdge: formatSsrPrice(c1.high),    // Bottom boundary of imbalance
            gapSizePercent,
            filled: false,
          };
        }
      }
    }
  }

  return null;
}

// ============================================================================
// 4. Live SSR Signal Finder
// ============================================================================

export function findLiveSsrSignal(
  candlesHTF: Candle[],
  candlesLTF: Candle[],
  symbol: string,
  riskUsdt = 100
): SsrSignal | null {
  if (candlesHTF.length < 20 || candlesLTF.length < 25) return null;

  const pools = extractLiquidityPools(candlesHTF, 3);
  if (pools.length === 0) return null;

  const currentBar = candlesLTF[candlesLTF.length - 1];
  const currentTime = currentBar.time;

  // 1. Phase 1 Sweep Check
  const startSlice = Math.max(0, candlesLTF.length - 14);
  const sweep = checkLiquiditySweep(candlesLTF.slice(startSlice), pools, currentTime);
  if (!sweep) return null;

  const { sweptPool, direction, sweepExtreme, sweepBarIdx } = sweep;
  const absSweepBarIdx = startSlice + sweepBarIdx;

  // 2. Phase 2 MSS Check
  const mss = detectMarketStructureShift(candlesLTF, absSweepBarIdx, direction, 12);
  if (!mss) return null;

  // 3. Phase 3 FVG Check
  const fvg = detectFairValueGap(candlesLTF, absSweepBarIdx, mss.displacementBarIdx, direction);
  if (!fvg) return null;

  // Entry at FVG Proximal Edge
  const entryPrice = fvg.proximalEdge;
  const spreadBuffer = Math.max(Math.abs(currentBar.high - currentBar.low) * 0.15, entryPrice * 0.0006);

  // Invalidation: Strict Stop Loss at Sweep Extreme Wick
  const stopLoss = direction === 'SHORT' ? sweepExtreme + spreadBuffer : sweepExtreme - spreadBuffer;
  const riskAmount = Math.abs(entryPrice - stopLoss);
  if (riskAmount <= 0) return null;
  const riskPercent = Number(((riskAmount / entryPrice) * 100).toFixed(2));

  // Risk cap: Maximum 3.5% stop distance on crypto futures
  if (riskPercent > 3.8 || riskPercent < 0.1) return null;

  // Tiered Exits: 1:2 (50% + BE), 1:3 (25%), 1:4 (25%)
  const tp1 = formatSsrPrice(direction === 'LONG' ? entryPrice + 2.0 * riskAmount : entryPrice - 2.0 * riskAmount);
  const tp2 = formatSsrPrice(direction === 'LONG' ? entryPrice + 3.0 * riskAmount : entryPrice - 3.0 * riskAmount);
  const tp3 = formatSsrPrice(direction === 'LONG' ? entryPrice + 4.0 * riskAmount : entryPrice - 4.0 * riskAmount);

  // Score evaluation
  let confidenceScore = 80;
  if (mss.displacementRatio >= 1.5) confidenceScore += 8;
  if (fvg.gapSizePercent >= 0.1) confidenceScore += 6;
  if (riskPercent <= 1.5) confidenceScore += 4;
  confidenceScore = Math.min(99, confidenceScore);

  const confidenceTier: 'A+' | 'A' | 'B+' = confidenceScore >= 90 ? 'A+' : confidenceScore >= 80 ? 'A' : 'B+';

  return {
    id: `ssr-${symbol}-${currentTime}`,
    symbol,
    time: currentTime,
    timeString: formatSsrTime(currentTime),
    direction,
    phase: 'PHASE_3_FVG_RETURN',
    phaseDescription: `Phase 3 Active: Price retracing into ${direction === 'LONG' ? 'Bullish' : 'Bearish'} FVG ($${entryPrice}) after ${sweptPool.type} sweep & MSS shift`,
    liquidityPoolType: sweptPool.type,
    sweptLevel: sweptPool.price,
    sweepExtreme: formatSsrPrice(sweepExtreme),
    mssLevel: formatSsrPrice(mss.brokenStructuralLevel),
    mssTime: mss.time,
    displacementScore: mss.displacementRatio,
    fvgProximal: fvg.proximalEdge,
    fvgDistal: fvg.distalEdge,
    fvgSizePercent: fvg.gapSizePercent,
    entryPrice: formatSsrPrice(entryPrice),
    stopLoss: formatSsrPrice(stopLoss),
    riskAmount: formatSsrPrice(riskAmount),
    riskPercent,
    tp1,
    tp2,
    tp3,
    riskRewardRatio: 2.0,
    confidenceScore,
    confidenceTier,
    keyFactors: [
      `Phase 1: Decisive ${sweptPool.type} liquidity sweep at $${sweptPool.price} with rejection wick`,
      `Phase 2: Confirmed MSS displacement breaking structural point at $${formatSsrPrice(mss.brokenStructuralLevel)}`,
      `Phase 3: Clean Fair Value Gap ($${fvg.distalEdge} → $${fvg.proximalEdge}) ready for limit execution`,
      `Tiered Risk/Reward: 1:2 (50% book + BE lock), 1:3, and 1:4 max runner`,
    ],
    status: 'ACTIVE',
    currentPrice: currentBar.close,
    pnlPercent: 0.0,
  };
}

/**
 * Scans an individual asset across all 3 SSR phases:
 * - Phase 3: FVG Proximal Retracement (Ready for execution)
 * - Phase 2: MSS Displacement (Displacement confirmed, awaiting retracement)
 * - Phase 1: Liquidity Swept (BSL/SSL swept with rejection wick, awaiting MSS)
 * - Inside Range: Monitoring distance to nearest BSL and SSL pools
 */
export function scanSsrAssetStatus(
  candlesHTF: Candle[],
  candlesLTF: Candle[],
  symbol: string,
  riskUsdt = 100
): SsrAssetScanResult {
  const now = Date.now();
  if (candlesHTF.length < 10 || candlesLTF.length < 10) {
    const fallbackPrice = candlesLTF.length > 0 ? candlesLTF[candlesLTF.length - 1].close : 0;
    return {
      symbol,
      phase: 'INSIDE_RANGE',
      phaseLabel: 'Insufficient Candles',
      currentPrice: fallbackPrice,
      statusMessage: 'Accumulating price bars...',
      lastUpdated: now,
    };
  }

  const currentBar = candlesLTF[candlesLTF.length - 1];
  const currentPrice = currentBar.close;
  const currentTime = currentBar.time;

  // Extract HTF Liquidity Pools
  const pools = extractLiquidityPools(candlesHTF, 3);
  const bslPools = pools.filter((p) => p.type === 'BSL').sort((a, b) => a.price - b.price);
  const sslPools = pools.filter((p) => p.type === 'SSL').sort((a, b) => b.price - a.price);

  const nearestBsl = bslPools.find((p) => p.price >= currentPrice) || bslPools[bslPools.length - 1];
  const nearestSsl = sslPools.find((p) => p.price <= currentPrice) || sslPools[0];

  const distToBslPct = nearestBsl ? Number((((nearestBsl.price - currentPrice) / currentPrice) * 100).toFixed(2)) : undefined;
  const distToSslPct = nearestSsl ? Number((((currentPrice - nearestSsl.price) / currentPrice) * 100).toFixed(2)) : undefined;

  // 1. First check if a live Phase 3 trigger exists
  const liveSignal = findLiveSsrSignal(candlesHTF, candlesLTF, symbol, riskUsdt);
  if (liveSignal) {
    return {
      symbol,
      phase: 'PHASE_3_FVG_RETURN',
      phaseLabel: 'Phase 3: FVG Retracement Entry',
      direction: liveSignal.direction,
      currentPrice,
      liquidityPoolType: liveSignal.liquidityPoolType,
      sweptLevel: liveSignal.sweptLevel,
      sweepExtreme: liveSignal.sweepExtreme,
      mssLevel: liveSignal.mssLevel,
      displacementRatio: liveSignal.displacementScore,
      fvgProximal: liveSignal.fvgProximal,
      fvgDistal: liveSignal.fvgDistal,
      fvgSizePercent: liveSignal.fvgSizePercent,
      entryPrice: liveSignal.entryPrice,
      stopLoss: liveSignal.stopLoss,
      tp1: liveSignal.tp1,
      tp2: liveSignal.tp2,
      tp3: liveSignal.tp3,
      riskPercent: liveSignal.riskPercent,
      confidenceScore: liveSignal.confidenceScore,
      confidenceTier: liveSignal.confidenceTier,
      signal: liveSignal,
      statusMessage: `Phase 3 Active Limit Trigger: Proximal FVG at $${liveSignal.entryPrice.toLocaleString()}, SL at $${liveSignal.stopLoss.toLocaleString()} (${liveSignal.riskPercent}% risk).`,
      lastUpdated: now,
    };
  }

  // 2. Check for recent sweep (last 16 bars)
  const startSlice = Math.max(0, candlesLTF.length - 16);
  const sweep = checkLiquiditySweep(candlesLTF.slice(startSlice), pools, currentTime);

  if (!sweep) {
    let msg = 'Inside structural range. Monitoring nearest liquidity pools.';
    if (nearestBsl && nearestSsl) {
      msg = `Inside Range: BSL overhead at $${nearestBsl.price.toLocaleString()} (+${distToBslPct}%), SSL below at $${nearestSsl.price.toLocaleString()} (-${distToSslPct}%)`;
    }
    return {
      symbol,
      phase: 'INSIDE_RANGE',
      phaseLabel: 'Inside Range',
      currentPrice,
      nearestBsl: nearestBsl?.price,
      distToBslPct,
      nearestSsl: nearestSsl?.price,
      distToSslPct,
      statusMessage: msg,
      lastUpdated: now,
    };
  }

  const { sweptPool, direction, sweepExtreme, sweepBarIdx } = sweep;
  const absSweepBarIdx = startSlice + sweepBarIdx;
  const sweepBarsAgo = Math.max(0, candlesLTF.length - 1 - absSweepBarIdx);

  // 3. Check for MSS displacement
  const mss = detectMarketStructureShift(candlesLTF, absSweepBarIdx, direction, 14);

  if (!mss) {
    return {
      symbol,
      phase: 'PHASE_1_SWEEP',
      phaseLabel: 'Phase 1: Liquidity Swept',
      direction,
      currentPrice,
      liquidityPoolType: sweptPool.type,
      sweptLevel: sweptPool.price,
      sweepExtreme: formatSsrPrice(sweepExtreme),
      sweepTime: candlesLTF[absSweepBarIdx].time,
      sweepTimeString: formatSsrTime(candlesLTF[absSweepBarIdx].time),
      sweepBarsAgo,
      statusMessage: `Phase 1 Confirmed: ${sweptPool.type} pool swept at $${sweptPool.price.toLocaleString()} with rejection wick. Monitoring for aggressive MSS displacement.`,
      lastUpdated: now,
    };
  }

  // 4. MSS confirmed -> Phase 2 (checking for FVG presence)
  const fvg = detectFairValueGap(candlesLTF, absSweepBarIdx, mss.displacementBarIdx, direction);

  return {
    symbol,
    phase: 'PHASE_2_MSS',
    phaseLabel: 'Phase 2: MSS Displacement',
    direction,
    currentPrice,
    liquidityPoolType: sweptPool.type,
    sweptLevel: sweptPool.price,
    sweepExtreme: formatSsrPrice(sweepExtreme),
    sweepBarsAgo,
    mssLevel: formatSsrPrice(mss.brokenStructuralLevel),
    displacementRatio: mss.displacementRatio,
    mssTime: mss.time,
    fvgProximal: fvg ? fvg.proximalEdge : undefined,
    fvgDistal: fvg ? fvg.distalEdge : undefined,
    fvgSizePercent: fvg ? fvg.gapSizePercent : undefined,
    statusMessage: fvg 
      ? `Phase 2 Confirmed: MSS displacement broke structural level at $${formatSsrPrice(mss.brokenStructuralLevel)}. FVG formed ($${fvg.proximalEdge}). Awaiting limit touch.`
      : `Phase 2 Confirmed: MSS displacement broke structural level at $${formatSsrPrice(mss.brokenStructuralLevel)} (${mss.displacementRatio}x vol). Awaiting clean FVG imbalance.`,
    lastUpdated: now,
  };
}

// ============================================================================
// 5. Historical Backtest Simulator & Success Evaluation
// ============================================================================

export interface SsrBacktestOptions {
  symbol: string;
  timeframeLTF?: '5m' | '3m' | '1m';
  timeframeHTF?: '1h' | '4h';
  candlesHTF: Candle[];
  candlesLTF: Candle[];
  startTimeMs?: number;
  endTimeMs?: number;
  dateRangePreset?: string;
  riskPerTradeUsdt?: number;
  accountEquityUsdt?: number;
  maxHoldBars?: number;
  takerFeeRate?: number; // default 0.05% (0.0005)
}

/**
 * Runs historical backtest simulation of the Sweep, Shift, and Return (SSR) strategy.
 * Accurately tracks limit order fills on FVG retracements, stop losses, and tiered exits.
 */
export function runSsrBacktest(options: SsrBacktestOptions): SsrBacktestSummary {
  const {
    symbol,
    timeframeLTF = '5m',
    timeframeHTF = '1h',
    candlesHTF,
    candlesLTF,
    startTimeMs,
    endTimeMs,
    dateRangePreset = '7d',
    riskPerTradeUsdt = 100,
    accountEquityUsdt = 10000,
    maxHoldBars = 72,
    takerFeeRate = 0.0005,
  } = options;

  const barMinutes = timeframeLTF === '1m' ? 1 : timeframeLTF === '3m' ? 3 : 5;

  if (candlesHTF.length < 15 || candlesLTF.length < 40) {
    return createEmptySsrSummary(options);
  }

  // Pre-calculate HTF Liquidity Pools
  const pools = extractLiquidityPools(candlesHTF, 3);
  const trades: SsrBacktestTrade[] = [];
  const failureClassification: Record<string, number> = {
    TREND_MOMENTUM_RUNAWAY: 0,
    FVG_EXPANSION_INVALIDATION: 0,
    SECONDARY_SWEEP_SL: 0,
    CHOPPY_TIME_EXPIRATION: 0,
  };

  let activeTrade: {
    trade: SsrBacktestTrade;
    entryBarIdx: number;
    breakEvenActivated: boolean;
  } | null = null;

  // Track pending limit orders waiting for FVG return
  let pendingOrder: {
    direction: SsrDirection;
    entryPrice: number;
    stopLoss: number;
    tp1: number;
    tp2: number;
    tp3: number;
    riskAmount: number;
    riskPercent: number;
    sweptLevel: number;
    sweepExtreme: number;
    mssLevel: number;
    fvgProximal: number;
    fvgDistal: number;
    orderPlacedBarIdx: number;
  } | null = null;

  for (let i = 20; i < candlesLTF.length; i++) {
    const currBar = candlesLTF[i];

    // ------------------------------------------------------------------------
    // A. Manage Active Trade
    // ------------------------------------------------------------------------
    if (activeTrade) {
      const { trade, entryBarIdx } = activeTrade;
      const barsHeld = i - entryBarIdx;
      const durationMinutes = barsHeld * barMinutes;
      const hrs = Math.floor(durationMinutes / 60);
      const mins = durationMinutes % 60;
      const durationString = hrs > 0 ? `${hrs}h ${mins}m (${barsHeld} bars)` : `${durationMinutes}m (${barsHeld} bars)`;
      let isClosed = false;

      if (trade.direction === 'LONG') {
        const effectiveSL = activeTrade.breakEvenActivated
          ? Math.max(trade.stopLoss, trade.entryPrice)
          : trade.stopLoss;

        // Check Stop Loss
        if (currBar.low <= effectiveSL) {
          isClosed = true;
          trade.stoppedOut = true;
          trade.exitTime = currBar.time;
          trade.exitTimeString = formatSsrTime(currBar.time);
          trade.exitPrice = formatSsrPrice(effectiveSL);
          trade.durationBars = barsHeld;
          trade.durationMinutes = durationMinutes;
          trade.durationString = durationString;

          if (trade.hitTp2) {
            trade.exitReason = 'TP2_TRAIL_STOP';
            trade.netRealizedR = 0.5 * 2.0 + 0.25 * 3.0; // 1.75R
          } else if (trade.hitTp1) {
            trade.exitReason = 'TP1_TRAIL_STOP';
            trade.netRealizedR = 0.5 * 2.0; // 1.0R
          } else {
            trade.exitReason = 'FULL_STOP_LOSS';
            trade.netRealizedR = -1.0;
            // Classify failure mode
            if (currBar.low < trade.stopLoss * 0.985) {
              failureClassification.TREND_MOMENTUM_RUNAWAY++;
              trade.failureCategory = 'TREND_MOMENTUM_RUNAWAY';
              trade.forensicDiagnosis = 'Heavy momentum runaway trend breached sweep extreme without respecting FVG support.';
            } else {
              failureClassification.SECONDARY_SWEEP_SL++;
              trade.failureCategory = 'SECONDARY_SWEEP_SL';
              trade.forensicDiagnosis = 'Secondary liquidity hunt wicked just below initial sweep low before reversing.';
            }
          }
        } else {
          // Check Take-Profit Targets
          if (!trade.hitTp1 && currBar.high >= trade.tp1) {
            trade.hitTp1 = true;
            activeTrade.breakEvenActivated = true; // Move Stop to Breakeven
          }
          if (trade.hitTp1 && !trade.hitTp2 && currBar.high >= trade.tp2) {
            trade.hitTp2 = true;
          }
          if (trade.hitTp2 && !trade.hitTp3 && currBar.high >= trade.tp3) {
            trade.hitTp3 = true;
            trade.exitReason = 'TP3_MAX';
            trade.netRealizedR = 0.5 * 2.0 + 0.25 * 3.0 + 0.25 * 4.0; // 2.75R
            trade.exitPrice = formatSsrPrice(trade.tp3);
            trade.exitTime = currBar.time;
            trade.exitTimeString = formatSsrTime(currBar.time);
            trade.durationBars = barsHeld;
            trade.durationMinutes = durationMinutes;
            trade.durationString = durationString;
            isClosed = true;
          }
        }
      } else {
        // SHORT Trade
        const effectiveSL = activeTrade.breakEvenActivated
          ? Math.min(trade.stopLoss, trade.entryPrice)
          : trade.stopLoss;

        if (currBar.high >= effectiveSL) {
          isClosed = true;
          trade.stoppedOut = true;
          trade.exitTime = currBar.time;
          trade.exitTimeString = formatSsrTime(currBar.time);
          trade.exitPrice = formatSsrPrice(effectiveSL);
          trade.durationBars = barsHeld;
          trade.durationMinutes = durationMinutes;
          trade.durationString = durationString;

          if (trade.hitTp2) {
            trade.exitReason = 'TP2_TRAIL_STOP';
            trade.netRealizedR = 0.5 * 2.0 + 0.25 * 3.0; // 1.75R
          } else if (trade.hitTp1) {
            trade.exitReason = 'TP1_TRAIL_STOP';
            trade.netRealizedR = 0.5 * 2.0; // 1.0R
          } else {
            trade.exitReason = 'FULL_STOP_LOSS';
            trade.netRealizedR = -1.0;
            if (currBar.high > trade.stopLoss * 1.015) {
              failureClassification.TREND_MOMENTUM_RUNAWAY++;
              trade.failureCategory = 'TREND_MOMENTUM_RUNAWAY';
              trade.forensicDiagnosis = 'Upward momentum runaway trend blew past BSL sweep extreme.';
            } else {
              failureClassification.SECONDARY_SWEEP_SL++;
              trade.failureCategory = 'SECONDARY_SWEEP_SL';
              trade.forensicDiagnosis = 'Secondary stop hunt tagged sweep extreme before downward reversal.';
            }
          }
        } else {
          // Check Take-Profit Targets
          if (!trade.hitTp1 && currBar.low <= trade.tp1) {
            trade.hitTp1 = true;
            activeTrade.breakEvenActivated = true; // Move Stop to Breakeven
          }
          if (trade.hitTp1 && !trade.hitTp2 && currBar.low <= trade.tp2) {
            trade.hitTp2 = true;
          }
          if (trade.hitTp2 && !trade.hitTp3 && currBar.low <= trade.tp3) {
            trade.hitTp3 = true;
            trade.exitReason = 'TP3_MAX';
            trade.netRealizedR = 0.5 * 2.0 + 0.25 * 3.0 + 0.25 * 4.0; // 2.75R
            trade.exitPrice = formatSsrPrice(trade.tp3);
            trade.exitTime = currBar.time;
            trade.exitTimeString = formatSsrTime(currBar.time);
            trade.durationBars = barsHeld;
            trade.durationMinutes = durationMinutes;
            trade.durationString = durationString;
            isClosed = true;
          }
        }
      }

      // Max bar timeout check (close at market if held too long)
      if (!isClosed && barsHeld >= maxHoldBars) {
        isClosed = true;
        trade.exitReason = 'BAR_TIMEOUT';
        trade.exitTime = currBar.time;
        trade.exitTimeString = formatSsrTime(currBar.time);
        trade.exitPrice = formatSsrPrice(currBar.close);
        trade.durationBars = barsHeld;
        trade.durationMinutes = durationMinutes;
        trade.durationString = durationString;
        const rawR = trade.direction === 'LONG'
          ? (currBar.close - trade.entryPrice) / (trade.riskAmount || 1)
          : (trade.entryPrice - currBar.close) / (trade.riskAmount || 1);
        trade.netRealizedR = Number(Math.max(-1.0, Math.min(2.75, rawR)).toFixed(2));
        if (trade.netRealizedR <= 0) {
          failureClassification.CHOPPY_TIME_EXPIRATION++;
          trade.failureCategory = 'CHOPPY_TIME_EXPIRATION';
          trade.forensicDiagnosis = 'Time horizon expired in choppy consolidation without reaching expansion targets.';
        }
      }

      if (isClosed) {
        trade.isWinner = trade.netRealizedR > 0;
        trade.pnlUsdt = Number((trade.netRealizedR * riskPerTradeUsdt).toFixed(2));

        // Taker fee calculation: 2 legs (entry + exit)
        const positionNotionalUsdt = (riskPerTradeUsdt / (trade.riskPercent / 100));
        const estimatedFeesUsdt = Number((positionNotionalUsdt * takerFeeRate * 2).toFixed(2));
        trade.estimatedFeesUsdt = estimatedFeesUsdt;
        trade.netPnlAfterFeesUsdt = Number((trade.pnlUsdt - estimatedFeesUsdt).toFixed(2));

        trades.push(trade);
        activeTrade = null;
      }

      continue;
    }

    // ------------------------------------------------------------------------
    // B. Check Pending Limit Order for FVG "Return" Fill
    // ------------------------------------------------------------------------
    if (pendingOrder) {
      const barsWaiting = i - pendingOrder.orderPlacedBarIdx;

      // Limit order expired after 18 bars without retracement
      if (barsWaiting > 18) {
        pendingOrder = null;
      } else {
        let isFilled = false;
        if (pendingOrder.direction === 'LONG' && currBar.low <= pendingOrder.entryPrice) {
          isFilled = true;
        } else if (pendingOrder.direction === 'SHORT' && currBar.high >= pendingOrder.entryPrice) {
          isFilled = true;
        }

        if (isFilled) {
          const newTrade: SsrBacktestTrade = {
            id: `ssr-trade-${trades.length + 1}`,
            entryTime: currBar.time,
            exitTime: currBar.time,
            entryTimeString: formatSsrTime(currBar.time),
            exitTimeString: formatSsrTime(currBar.time),
            direction: pendingOrder.direction,
            entryPrice: pendingOrder.entryPrice,
            stopLoss: pendingOrder.stopLoss,
            tp1: pendingOrder.tp1,
            tp2: pendingOrder.tp2,
            tp3: pendingOrder.tp3,
            riskAmount: pendingOrder.riskAmount,
            riskPercent: pendingOrder.riskPercent,
            sweptLevel: pendingOrder.sweptLevel,
            sweepExtreme: pendingOrder.sweepExtreme,
            mssLevel: pendingOrder.mssLevel,
            fvgProximal: pendingOrder.fvgProximal,
            fvgDistal: pendingOrder.fvgDistal,
            exitPrice: pendingOrder.entryPrice,
            hitTp1: false,
            hitTp2: false,
            hitTp3: false,
            stoppedOut: false,
            exitReason: 'FULL_STOP_LOSS',
            netRealizedR: 0,
            pnlUsdt: 0,
            estimatedFeesUsdt: 0,
            netPnlAfterFeesUsdt: 0,
            durationBars: 0,
            durationMinutes: 0,
            durationString: '0m',
            isWinner: false,
          };

          activeTrade = {
            trade: newTrade,
            entryBarIdx: i,
            breakEvenActivated: false,
          };
          pendingOrder = null;
          continue;
        }
      }
    }

    // ------------------------------------------------------------------------
    // C. Search for New SSR Setup inside the Requested Window
    // ------------------------------------------------------------------------
    if (startTimeMs && currBar.time < startTimeMs) continue;
    if (endTimeMs && currBar.time > endTimeMs) continue;

    // Phase 1 Sweep
    const startSlice = Math.max(0, i - 12);
    const sweep = checkLiquiditySweep(candlesLTF.slice(startSlice, i + 1), pools, currBar.time);
    if (!sweep) continue;

    const { sweptPool, direction, sweepExtreme, sweepBarIdx } = sweep;
    const absSweepBarIdx = startSlice + sweepBarIdx;

    // Phase 2 MSS
    const mss = detectMarketStructureShift(candlesLTF, absSweepBarIdx, direction, 12);
    if (!mss) continue;

    // Phase 3 FVG
    const fvg = detectFairValueGap(candlesLTF, absSweepBarIdx, mss.displacementBarIdx, direction);
    if (!fvg) continue;

    const entryPrice = fvg.proximalEdge;
    const spreadBuffer = Math.max(Math.abs(currBar.high - currBar.low) * 0.15, entryPrice * 0.0006);
    const stopLoss = direction === 'SHORT' ? sweepExtreme + spreadBuffer : sweepExtreme - spreadBuffer;
    const riskAmount = Math.abs(entryPrice - stopLoss);
    if (riskAmount <= 0) continue;
    const riskPercent = Number(((riskAmount / entryPrice) * 100).toFixed(2));
    if (riskPercent > 3.8 || riskPercent < 0.1) continue;

    const tp1 = formatSsrPrice(direction === 'LONG' ? entryPrice + 2.0 * riskAmount : entryPrice - 2.0 * riskAmount);
    const tp2 = formatSsrPrice(direction === 'LONG' ? entryPrice + 3.0 * riskAmount : entryPrice - 3.0 * riskAmount);
    const tp3 = formatSsrPrice(direction === 'LONG' ? entryPrice + 4.0 * riskAmount : entryPrice - 4.0 * riskAmount);

    // Arm the Limit Order for Phase 3 "Return"
    pendingOrder = {
      direction,
      entryPrice: formatSsrPrice(entryPrice),
      stopLoss: formatSsrPrice(stopLoss),
      tp1,
      tp2,
      tp3,
      riskAmount: formatSsrPrice(riskAmount),
      riskPercent,
      sweptLevel: sweptPool.price,
      sweepExtreme: formatSsrPrice(sweepExtreme),
      mssLevel: formatSsrPrice(mss.brokenStructuralLevel),
      fvgProximal: fvg.proximalEdge,
      fvgDistal: fvg.distalEdge,
      orderPlacedBarIdx: i,
    };
  }

  // ------------------------------------------------------------------------
  // Settlement for any trade still active at window boundary
  // ------------------------------------------------------------------------
  if (activeTrade && candlesLTF.length > 0) {
    const lastBar = candlesLTF[candlesLTF.length - 1];
    const { trade, entryBarIdx } = activeTrade;
    const barsHeld = Math.max(1, candlesLTF.length - 1 - entryBarIdx);
    const durationMinutes = barsHeld * barMinutes;
    trade.exitTime = lastBar.time;
    trade.exitTimeString = formatSsrTime(lastBar.time);
    trade.exitPrice = formatSsrPrice(lastBar.close);
    trade.durationBars = barsHeld;
    trade.durationMinutes = durationMinutes;
    trade.durationString = `${durationMinutes}m (${barsHeld} bars)`;
    trade.exitReason = 'BAR_TIMEOUT';

    const rawR = trade.direction === 'LONG'
      ? (lastBar.close - trade.entryPrice) / (trade.riskAmount || 1)
      : (trade.entryPrice - lastBar.close) / (trade.riskAmount || 1);
    trade.netRealizedR = Number(Math.max(-1.0, Math.min(2.75, rawR)).toFixed(2));
    trade.isWinner = trade.netRealizedR > 0;
    trade.pnlUsdt = Number((trade.netRealizedR * riskPerTradeUsdt).toFixed(2));
    trades.push(trade);
    activeTrade = null;
  }

  // ------------------------------------------------------------------------
  // Compile Performance Analytics & Strategy Success Verdict
  // ------------------------------------------------------------------------
  const totalTrades = trades.length;
  const winningTrades = trades.filter((t) => t.isWinner).length;
  const losingTrades = trades.filter((t) => !t.isWinner && t.netRealizedR < 0).length;
  const breakevenTrades = trades.filter((t) => t.netRealizedR === 0).length;
  const winRate = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;

  const netProfitR = Number(trades.reduce((acc, t) => acc + t.netRealizedR, 0).toFixed(2));
  const netProfitUsdt = Number((netProfitR * riskPerTradeUsdt).toFixed(2));
  
  // Total fees paid across all executed trades
  const totalFeesPaidUsdt = Number(trades.reduce((acc, t) => acc + (t.estimatedFeesUsdt || 0), 0).toFixed(2));
  const netProfitAfterFeesUsdt = Number((netProfitUsdt - totalFeesPaidUsdt).toFixed(2));

  // Profit % on total account equity (based on 1% equity risk per trade model)
  const profitPercentEquity = Number(((netProfitAfterFeesUsdt / accountEquityUsdt) * 100).toFixed(2));

  // Profit Factor = Gross Wins / Gross Losses
  const grossWinR = trades.filter((t) => t.netRealizedR > 0).reduce((acc, t) => acc + t.netRealizedR, 0);
  const grossLossR = Math.abs(trades.filter((t) => t.netRealizedR < 0).reduce((acc, t) => acc + t.netRealizedR, 0));
  const profitFactor = grossLossR > 0 ? Number((grossWinR / grossLossR).toFixed(2)) : grossWinR > 0 ? 99.0 : 0.0;

  // Mathematical Expectancy (EV) per trade in R: E = (W * R_win) - (L * 1.0)
  const avgWinR = winningTrades > 0 ? grossWinR / winningTrades : 0;
  const winFraction = totalTrades > 0 ? winningTrades / totalTrades : 0;
  const lossFraction = totalTrades > 0 ? losingTrades / totalTrades : 0;
  const expectancyR = Number(((winFraction * avgWinR) - (lossFraction * 1.0)).toFixed(2));

  // Max Drawdown Calculation
  let peakR = 0;
  let runningR = 0;
  let maxDdR = 0;
  for (const t of trades) {
    runningR += t.netRealizedR;
    if (runningR > peakR) peakR = runningR;
    const dd = peakR - runningR;
    if (dd > maxDdR) maxDdR = dd;
  }
  const maxDrawdownR = Number(maxDdR.toFixed(2));
  const maxDrawdownUsdt = Number((maxDrawdownR * riskPerTradeUsdt).toFixed(2));
  const maxDrawdownPercent = Number(((maxDrawdownUsdt / accountEquityUsdt) * 100).toFixed(2));

  const avgTradeR = totalTrades > 0 ? Number((netProfitR / totalTrades).toFixed(2)) : 0;
  const avgTradeUsdt = Number((avgTradeR * riskPerTradeUsdt).toFixed(2));
  const avgDurationBars = totalTrades > 0 ? Math.round(trades.reduce((acc, t) => acc + t.durationBars, 0) / totalTrades) : 0;

  const tp1HitRate = totalTrades > 0 ? Number(((trades.filter((t) => t.hitTp1).length / totalTrades) * 100).toFixed(1)) : 0;
  const tp2HitRate = totalTrades > 0 ? Number(((trades.filter((t) => t.hitTp2).length / totalTrades) * 100).toFixed(1)) : 0;
  const tp3HitRate = totalTrades > 0 ? Number(((trades.filter((t) => t.hitTp3).length / totalTrades) * 100).toFixed(1)) : 0;

  // ------------------------------------------------------------------------
  // Automated Strategy Success Verdict
  // ------------------------------------------------------------------------
  let successVerdict: SsrSuccessVerdict;
  let verdictTitle: string;
  let verdictDescription: string;
  let isStrategySuccess = false;

  if (expectancyR >= 0.25 && profitFactor >= 1.35 && netProfitR > 0) {
    successVerdict = 'PROVEN_PROFITABLE_EDGE';
    verdictTitle = 'SUCCESS: Proven Institutional Edge';
    verdictDescription = `The SSR framework generated strong positive mathematical expectancy (+${expectancyR}R / trade) with a ${profitFactor} profit factor and +${profitPercentEquity}% equity growth.`;
    isStrategySuccess = true;
  } else if (expectancyR >= 0.05 && profitFactor >= 1.10 && netProfitR > 0) {
    successVerdict = 'MODERATE_VIABLE_EDGE';
    verdictTitle = 'VIABLE: Moderate Quantitative Edge';
    verdictDescription = `The system produced net positive alpha (+${netProfitR}R), but profit factor (${profitFactor}) indicates vulnerability during tight consolidating market regimes.`;
    isStrategySuccess = true;
  } else if (expectancyR >= -0.10 && profitFactor >= 0.90) {
    successVerdict = 'MARGINAL_BREAKEVEN';
    verdictTitle = 'NEUTRAL: Breakeven Invalidation';
    verdictDescription = `The system hovered near breakeven (${netProfitR}R). Slippage and exchange taker fees will degrade performance in live futures execution.`;
    isStrategySuccess = false;
  } else {
    successVerdict = 'NEGATIVE_EXPECTANCY';
    verdictTitle = 'FAILED: Negative Expectancy';
    verdictDescription = `The system failed to overcome adverse momentum runs (${netProfitR}R, PF ${profitFactor}). Runaway trends breached FVG levels before target completion.`;
    isStrategySuccess = false;
  }

  const firstCandle = candlesLTF[0];
  const lastCandle = candlesLTF[candlesLTF.length - 1];

  return {
    id: `ssr-backtest-${symbol}-${Date.now()}`,
    symbol,
    timeframeLTF,
    timeframeHTF,
    dateRangePreset,
    startDate: firstCandle ? formatSsrTime(firstCandle.time) : '',
    endDate: lastCandle ? formatSsrTime(lastCandle.time) : '',
    startTimeMs: startTimeMs || (firstCandle ? firstCandle.time : 0),
    endTimeMs: endTimeMs || (lastCandle ? lastCandle.time : Date.now()),
    riskPerTradeUsdt,
    accountEquityUsdt,
    totalTrades,
    winningTrades,
    losingTrades,
    breakevenTrades,
    winRate,
    netProfitR,
    netProfitUsdt,
    profitPercentEquity,
    netProfitAfterFeesUsdt,
    totalFeesPaidUsdt,
    profitFactor,
    expectancyR,
    maxDrawdownR,
    maxDrawdownUsdt,
    maxDrawdownPercent,
    avgTradeR,
    avgTradeUsdt,
    avgDurationBars,
    tp1HitRate,
    tp2HitRate,
    tp3HitRate,
    successVerdict,
    verdictTitle,
    verdictDescription,
    isStrategySuccess,
    failureClassification,
    trades: trades.reverse(), // newest first
    candlesCountHTF: candlesHTF.length,
    candlesCountLTF: candlesLTF.length,
    createdAt: new Date().toISOString(),
  };
}

function createEmptySsrSummary(options: SsrBacktestOptions): SsrBacktestSummary {
  return {
    id: `ssr-empty-${Date.now()}`,
    symbol: options.symbol,
    timeframeLTF: options.timeframeLTF || '5m',
    timeframeHTF: options.timeframeHTF || '1h',
    dateRangePreset: options.dateRangePreset || '7d',
    startDate: '',
    endDate: '',
    startTimeMs: options.startTimeMs || 0,
    endTimeMs: options.endTimeMs || Date.now(),
    riskPerTradeUsdt: options.riskPerTradeUsdt || 100,
    accountEquityUsdt: options.accountEquityUsdt || 10000,
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    breakevenTrades: 0,
    winRate: 0,
    netProfitR: 0,
    netProfitUsdt: 0,
    profitPercentEquity: 0,
    netProfitAfterFeesUsdt: 0,
    totalFeesPaidUsdt: 0,
    profitFactor: 0,
    expectancyR: 0,
    maxDrawdownR: 0,
    maxDrawdownUsdt: 0,
    maxDrawdownPercent: 0,
    avgTradeR: 0,
    avgTradeUsdt: 0,
    avgDurationBars: 0,
    tp1HitRate: 0,
    tp2HitRate: 0,
    tp3HitRate: 0,
    successVerdict: 'MARGINAL_BREAKEVEN',
    verdictTitle: 'Insufficient Historical Data',
    verdictDescription: 'Not enough higher and lower timeframe candle series available to simulate the SSR model.',
    isStrategySuccess: false,
    failureClassification: {},
    trades: [],
    candlesCountHTF: options.candlesHTF.length,
    candlesCountLTF: options.candlesLTF.length,
    createdAt: new Date().toISOString(),
  };
}

// ============================================================================
// 6. Risk Sizing & Fee Calculation (Institutional CCXT Standard)
// ============================================================================

export interface SsrPositionSizingResult {
  entryPrice: number;
  stopLoss: number;
  stopDistancePercent: number;
  accountEquity: number;
  riskPercent: number;
  rawRiskUsdt: number;
  estimatedFeeDragUsdt: number;
  netRiskUsdt: number;
  positionQuantity: number;
  positionNotionalUsdt: number;
  recommendedLeverage: number;
  liquidationPriceEst: number;
  isLeverageSafe: boolean;
}

export function calculateSsrPositionSize(
  entryPrice: number,
  stopLoss: number,
  accountEquityUsdt = 10000,
  riskPercent = 1.0,
  takerFeeRate = 0.0005
): SsrPositionSizingResult {
  const rawRiskUsdt = accountEquityUsdt * (riskPercent / 100);
  const stopDistance = Math.abs(entryPrice - stopLoss);
  const stopDistancePercent = Number(((stopDistance / entryPrice) * 100).toFixed(3));

  if (stopDistance <= 0) {
    return {
      entryPrice,
      stopLoss,
      stopDistancePercent: 0,
      accountEquity: accountEquityUsdt,
      riskPercent,
      rawRiskUsdt,
      estimatedFeeDragUsdt: 0,
      netRiskUsdt: rawRiskUsdt,
      positionQuantity: 0,
      positionNotionalUsdt: 0,
      recommendedLeverage: 1,
      liquidationPriceEst: stopLoss,
      isLeverageSafe: true,
    };
  }

  // Initial raw contract notional
  let notional = (rawRiskUsdt / (stopDistancePercent / 100));

  // Taker fee deduction (0.05% entry + 0.05% exit = 0.10% round-trip)
  // Deduct estimated fee so total loss if stopped out strictly equals rawRiskUsdt!
  const roundTripFeeRate = takerFeeRate * 2;
  const estimatedFeeDragUsdt = Number((notional * roundTripFeeRate).toFixed(2));
  const netRiskUsdt = Math.max(1, rawRiskUsdt - estimatedFeeDragUsdt);

  // Recalculate true contract size after fee deduction
  notional = (netRiskUsdt / (stopDistancePercent / 100));
  const positionQuantity = Number((notional / entryPrice).toFixed(4));
  const positionNotionalUsdt = Number(notional.toFixed(2));

  // Leverage calculation: Position Notional / Margin Allocated
  // If isolated margin allocation = rawRiskUsdt:
  const recommendedLeverage = Math.min(25, Math.max(1, Math.round(100 / (stopDistancePercent * 1.5))));
  const isLeverageSafe = recommendedLeverage <= 20;

  const isLong = entryPrice > stopLoss;
  const liquidationPriceEst = isLong 
    ? entryPrice * (1 - 1 / recommendedLeverage * 0.9) 
    : entryPrice * (1 + 1 / recommendedLeverage * 0.9);

  return {
    entryPrice,
    stopLoss,
    stopDistancePercent,
    accountEquity: accountEquityUsdt,
    riskPercent,
    rawRiskUsdt,
    estimatedFeeDragUsdt,
    netRiskUsdt,
    positionQuantity,
    positionNotionalUsdt,
    recommendedLeverage,
    liquidationPriceEst: formatSsrPrice(liquidationPriceEst),
    isLeverageSafe,
  };
}
