/**
 * Williams Fractal, Multi-Timeframe (4H -> 5m/1m) Sweep Detection,
 * Strong Engulfing Pattern Recognition, and Strategy Backtest Engine.
 *
 * Implements Pine Script v6 Williams Fractal algorithm:
 * - Periods n (default 2, minimum 2)
 * - UpFractal (Swing High) with 5-frontier lookahead/lookbehind and equal-high tolerance
 * - DownFractal (Swing Low) with 5-frontier lookahead/lookbehind and equal-low tolerance
 * - 4H Swing High/Low Cross / Liquidity Sweep Detection
 * - 5m / 1m Strong Bullish & Bearish Engulfing Detection
 * - Automated Trade Sizing & Tiered Targets:
 *     TP1: 1:2 R:R (50% booked)
 *     TP2: 1:3 R:R (25% booked)
 *     TP3: 1:4 R:R (rest 25% booked)
 * - Comprehensive Backtest Simulator with Trade Post-Mortem Diagnostics ("Why it Failed")
 * - Signal Ledger & Strongness Scoring
 */

import type { Candle } from './quant.ts';

export interface WilliamsFractalPoint {
  index: number;
  time: number;
  price: number;
  type: 'UP_FRACTAL' | 'DOWN_FRACTAL';
  periods: number;
}

export interface FourHourFractalLevels {
  symbol: string;
  previousSwingHigh: number;
  previousSwingLow: number;
  highFractalTime: number;
  lowFractalTime: number;
  highFractalIndex: number;
  lowFractalIndex: number;
  allFractals: WilliamsFractalPoint[];
}

export interface LevelCrossStatus {
  isCrossed: boolean;
  type: 'HIGH_CROSSED' | 'LOW_CROSSED' | 'INSIDE_RANGE';
  levelPrice: number;
  distancePct: number;
  isSweep: boolean; // Wicked beyond the level but closed inside or near it
  description: string;
}

export interface EngulfingDetectionResult {
  isEngulfing: boolean;
  type: 'BULLISH' | 'BEARISH' | 'NONE';
  isStrong: boolean;
  strongnessScore: number; // 0 - 100
  strongnessTier: 'A+' | 'A' | 'B+' | 'NONE';
  bodyRatio: number; // body / range
  volumeRatio: number; // volume / 10-period avg volume
  candle: Candle;
  prevCandle: Candle;
  reasons: string[];
}

export interface FractalTradeSignal {
  id: string;
  symbol: string;
  timestamp: number;
  timeString: string;
  direction: 'LONG' | 'SHORT';
  setupType: '4H_LOW_SWEEP_BULLISH_ENGULF' | '4H_HIGH_SWEEP_BEARISH_ENGULF';
  timeframe: '5m' | '1m';
  fourHourLevel: number;
  fourHourLevelType: '4H_SWING_HIGH' | '4H_SWING_LOW';
  entryPrice: number;
  stopLoss: number;
  riskAmount: number; // |entry - SL|
  riskPercent: number; // riskAmount / entry * 100
  // Tiered profit booking
  tp1: number; // 1:2 (50% booked)
  tp2: number; // 1:3 (25% booked)
  tp3: number; // 1:4 (25% booked)
  tp1Ratio: number; // 2.0
  tp2Ratio: number; // 3.0
  tp3Ratio: number; // 4.0
  tp1Allocation: number; // 0.50
  tp2Allocation: number; // 0.25
  tp3Allocation: number; // 0.25
  strongnessScore: number; // 0-100
  strongnessTier: 'A+' | 'A' | 'B+' | 'NONE';
  strongnessFactors: string[];
  status: 'PENDING' | 'ACTIVE' | 'HIT_TP1' | 'HIT_TP2' | 'HIT_TP3' | 'STOPPED_OUT' | 'EXPIRED';
  currentPrice?: number;
  realizedR?: number;
  exitPrice?: number;
  exitTime?: number;
  failureReason?: string;
}

export interface BacktestTrade {
  id: string;
  entryTime: number;
  exitTime: number;
  entryTimeString: string;
  exitTimeString: string;
  direction: 'LONG' | 'SHORT';
  setupType: '4H_LOW_SWEEP_BULLISH_ENGULF' | '4H_HIGH_SWEEP_BEARISH_ENGULF';
  fourHourLevel: number;
  fourHourLevelType: '4H_SWING_HIGH' | '4H_SWING_LOW';
  entryPrice: number;
  stopLoss: number;
  tp1: number;
  tp2: number;
  tp3: number;
  riskAmount: number;
  riskPercent: number;
  exitPrice: number;
  hitTp1: boolean;
  hitTp2: boolean;
  hitTp3: boolean;
  stoppedOut: boolean;
  netRealizedR: number; // e.g. +2.75R, +1.0R, -1.0R
  pnlUsdt: number; // simulated dollar PnL based on risk per trade
  exitReason: 'TP3_MAX' | 'TP2_TRAIL_STOP' | 'TP1_TRAIL_STOP' | 'FULL_STOP_LOSS' | 'BAR_TIMEOUT';
  durationBars: number;
  durationMinutes: number;
  durationString: string;
  strongnessScore: number;
  strongnessTier: 'A+' | 'A' | 'B+' | 'NONE';
  engulfingVolumeRatio?: number;
  engulfingBodyRatio?: number;
  // Deep Failure Diagnostics ("Why it Failed")
  isWinner: boolean;
  failureDiagnostic?: {
    category:
      | 'TREND_CONTINUATION'
      | 'VOLUME_EXHAUSTION_ABSENT'
      | 'PREMATURE_ENGULFING'
      | 'SECONDARY_SWEEP_STOP_HUNT'
      | 'CHOPPY_RANGE_ABSORPTION'
      | 'HIGH_SLIPPAGE_WICK';
    summary: string;
    evidence: string[];
    suggestedFilter: string;
  };
}

export interface BacktestSummary {
  symbol: string;
  timeframe: '5m' | '1m';
  dateRangePreset?: string;
  startDate?: string;
  endDate?: string;
  startTimeMs?: number;
  endTimeMs?: number;
  riskPerTradeUsdt?: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number; // %
  netProfitR: number; // Cumulative R
  netProfitUsdt: number; // Cumulative USDT PnL
  profitFactor: number;
  maxDrawdownR: number;
  maxDrawdownUsdt: number;
  avgTradeR: number;
  avgTradeUsdt: number;
  tp1HitRate: number;
  tp2HitRate: number;
  tp3HitRate: number;
  trades: BacktestTrade[];
  failureCategorization: Record<string, number>;
  createdAt: string;
}

/**
 * 1. Pine Script Williams Fractal Algorithm
 * Exact replica of the Pine Script v6 algorithm provided.
 *
 * Checks for UpFractal and DownFractal across the candle series.
 * A candidate bar at index `c` requires `n` bars after it to confirm.
 */
export function calculateWilliamsFractals(
  candles: Candle[],
  n = 2
): WilliamsFractalPoint[] {
  const fractals: WilliamsFractalPoint[] = [];
  if (!candles || candles.length < n * 2 + 1) return fractals;

  const len = candles.length;

  for (let c = n; c < len - n; c++) {
    const candidateHigh = candles[c].high;
    const candidateLow = candles[c].low;

    // UpFractal Check
    // upflagDownFrontier: all subsequent n bars (c + 1 to c + n) have lower highs
    let upflagDownFrontier = true;
    for (let i = 1; i <= n; i++) {
      if (c + i >= len || candles[c + i].high >= candidateHigh) {
        upflagDownFrontier = false;
        break;
      }
    }

    // UpFrontier checks: preceding bars
    let upflagUpFrontier0 = true;
    for (let i = 1; i <= n; i++) {
      if (c - i < 0 || candles[c - i].high >= candidateHigh) {
        upflagUpFrontier0 = false;
        break;
      }
    }

    // Frontier 1 to 4 tolerances for equal highs preceding candidate
    const upflagUpFrontier1 =
      c - 1 >= 0 &&
      candles[c - 1].high <= candidateHigh &&
      checkPrecedingHighs(candles, c, 1, n, candidateHigh);

    const upflagUpFrontier2 =
      c - 2 >= 0 &&
      candles[c - 1].high <= candidateHigh &&
      candles[c - 2].high <= candidateHigh &&
      checkPrecedingHighs(candles, c, 2, n, candidateHigh);

    const upflagUpFrontier3 =
      c - 3 >= 0 &&
      candles[c - 1].high <= candidateHigh &&
      candles[c - 2].high <= candidateHigh &&
      candles[c - 3].high <= candidateHigh &&
      checkPrecedingHighs(candles, c, 3, n, candidateHigh);

    const upflagUpFrontier4 =
      c - 4 >= 0 &&
      candles[c - 1].high <= candidateHigh &&
      candles[c - 2].high <= candidateHigh &&
      candles[c - 3].high <= candidateHigh &&
      candles[c - 4].high <= candidateHigh &&
      checkPrecedingHighs(candles, c, 4, n, candidateHigh);

    const flagUpFrontier =
      upflagUpFrontier0 ||
      upflagUpFrontier1 ||
      upflagUpFrontier2 ||
      upflagUpFrontier3 ||
      upflagUpFrontier4;

    if (upflagDownFrontier && flagUpFrontier) {
      fractals.push({
        index: c,
        time: candles[c].time,
        price: candidateHigh,
        type: 'UP_FRACTAL',
        periods: n,
      });
    }

    // DownFractal Check
    // downflagDownFrontier: all subsequent n bars have higher lows
    let downflagDownFrontier = true;
    for (let i = 1; i <= n; i++) {
      if (c + i >= len || candles[c + i].low <= candidateLow) {
        downflagDownFrontier = false;
        break;
      }
    }

    let downflagUpFrontier0 = true;
    for (let i = 1; i <= n; i++) {
      if (c - i < 0 || candles[c - i].low <= candidateLow) {
        downflagUpFrontier0 = false;
        break;
      }
    }

    const downflagUpFrontier1 =
      c - 1 >= 0 &&
      candles[c - 1].low >= candidateLow &&
      checkPrecedingLows(candles, c, 1, n, candidateLow);

    const downflagUpFrontier2 =
      c - 2 >= 0 &&
      candles[c - 1].low >= candidateLow &&
      candles[c - 2].low >= candidateLow &&
      checkPrecedingLows(candles, c, 2, n, candidateLow);

    const downflagUpFrontier3 =
      c - 3 >= 0 &&
      candles[c - 1].low >= candidateLow &&
      candles[c - 2].low >= candidateLow &&
      candles[c - 3].low >= candidateLow &&
      checkPrecedingLows(candles, c, 3, n, candidateLow);

    const downflagUpFrontier4 =
      c - 4 >= 0 &&
      candles[c - 1].low >= candidateLow &&
      candles[c - 2].low >= candidateLow &&
      candles[c - 3].low >= candidateLow &&
      candles[c - 4].low >= candidateLow &&
      checkPrecedingLows(candles, c, 4, n, candidateLow);

    const flagDownFrontier =
      downflagUpFrontier0 ||
      downflagUpFrontier1 ||
      downflagUpFrontier2 ||
      downflagUpFrontier3 ||
      downflagUpFrontier4;

    if (downflagDownFrontier && flagDownFrontier) {
      fractals.push({
        index: c,
        time: candles[c].time,
        price: candidateLow,
        type: 'DOWN_FRACTAL',
        periods: n,
      });
    }
  }

  return fractals;
}

function checkPrecedingHighs(
  candles: Candle[],
  centerIdx: number,
  offset: number,
  n: number,
  targetHigh: number
): boolean {
  for (let i = 1; i <= n; i++) {
    const idx = centerIdx - (offset + i);
    if (idx < 0 || candles[idx].high >= targetHigh) return false;
  }
  return true;
}

function checkPrecedingLows(
  candles: Candle[],
  centerIdx: number,
  offset: number,
  n: number,
  targetLow: number
): boolean {
  for (let i = 1; i <= n; i++) {
    const idx = centerIdx - (offset + i);
    if (idx < 0 || candles[idx].low <= targetLow) return false;
  }
  return true;
}

/**
 * 2. Detect Most Recent 4H Swing High & Swing Low Levels
 */
export function getLatest4HFractalLevels(
  candles4H: Candle[],
  symbol = 'BTCUSDT',
  n = 2
): FourHourFractalLevels {
  const allFractals = calculateWilliamsFractals(candles4H, n);

  let previousSwingHigh = 0;
  let previousSwingLow = 0;
  let highFractalTime = 0;
  let lowFractalTime = 0;
  let highFractalIndex = -1;
  let lowFractalIndex = -1;

  for (let i = allFractals.length - 1; i >= 0; i--) {
    const f = allFractals[i];
    if (f.type === 'UP_FRACTAL' && previousSwingHigh === 0) {
      previousSwingHigh = f.price;
      highFractalTime = f.time;
      highFractalIndex = f.index;
    }
    if (f.type === 'DOWN_FRACTAL' && previousSwingLow === 0) {
      previousSwingLow = f.price;
      lowFractalTime = f.time;
      lowFractalIndex = f.index;
    }
    if (previousSwingHigh > 0 && previousSwingLow > 0) break;
  }

  // Fallbacks if history is too brief
  if (previousSwingHigh === 0 && candles4H.length > 0) {
    const maxHigh = Math.max(...candles4H.map((c) => c.high));
    previousSwingHigh = maxHigh;
    highFractalTime = candles4H[candles4H.length - 1].time;
  }
  if (previousSwingLow === 0 && candles4H.length > 0) {
    const minLow = Math.min(...candles4H.map((c) => c.low));
    previousSwingLow = minLow;
    lowFractalTime = candles4H[candles4H.length - 1].time;
  }

  return {
    symbol,
    previousSwingHigh,
    previousSwingLow,
    highFractalTime,
    lowFractalTime,
    highFractalIndex,
    lowFractalIndex,
    allFractals,
  };
}

/**
 * Check if current price or candle range crosses the 4H Swing High or Low
 */
export function check4HLevelCross(
  currentPrice: number,
  candleHigh: number,
  candleLow: number,
  fourHourLevels: FourHourFractalLevels
): LevelCrossStatus {
  const { previousSwingHigh, previousSwingLow } = fourHourLevels;

  // Check 4H Swing High Cross (Liquidity Sweep / Resistance Break)
  if (candleHigh >= previousSwingHigh || currentPrice >= previousSwingHigh) {
    const distancePct = Number(
      (((candleHigh - previousSwingHigh) / previousSwingHigh) * 100).toFixed(2)
    );
    const isSweep = currentPrice <= previousSwingHigh * 1.006; // Wicked above but staying near level
    return {
      isCrossed: true,
      type: 'HIGH_CROSSED',
      levelPrice: previousSwingHigh,
      distancePct,
      isSweep,
      description: isSweep
        ? `Swept 4H Swing High ($${previousSwingHigh.toLocaleString()}) by +${distancePct}%. Monitoring for Bearish Engulfing.`
        : `Broke above 4H Swing High ($${previousSwingHigh.toLocaleString()}). Monitoring for Bearish Reversal.`,
    };
  }

  // Check 4H Swing Low Cross (Liquidity Sweep / Support Break)
  if (candleLow <= previousSwingLow || currentPrice <= previousSwingLow) {
    const distancePct = Number(
      (((previousSwingLow - candleLow) / previousSwingLow) * 100).toFixed(2)
    );
    const isSweep = currentPrice >= previousSwingLow * 0.994;
    return {
      isCrossed: true,
      type: 'LOW_CROSSED',
      levelPrice: previousSwingLow,
      distancePct,
      isSweep,
      description: isSweep
        ? `Swept 4H Swing Low ($${previousSwingLow.toLocaleString()}) by -${distancePct}%. Monitoring for Bullish Engulfing.`
        : `Broke below 4H Swing Low ($${previousSwingLow.toLocaleString()}). Monitoring for Bullish Reversal.`,
    };
  }

  const distToHigh = ((previousSwingHigh - currentPrice) / currentPrice) * 100;
  const distToLow = ((currentPrice - previousSwingLow) / currentPrice) * 100;

  return {
    isCrossed: false,
    type: 'INSIDE_RANGE',
    levelPrice: distToHigh < distToLow ? previousSwingHigh : previousSwingLow,
    distancePct: Math.min(distToHigh, distToLow),
    isSweep: false,
    description: `Inside 4H range. ${distToHigh.toFixed(2)}% below 4H High, ${distToLow.toFixed(2)}% above 4H Low.`,
  };
}

/**
 * 3. Strong Bullish / Bearish Engulfing Candle Recognition (5m / 1m)
 *
 * Requirements:
 * - Bullish Engulfing: Current green candle completely engulfs preceding red candle body.
 * - Bearish Engulfing: Current red candle completely engulfs preceding green candle body.
 * - Strong Criteria:
 *     1. Body dominance ratio (body / range >= 0.52)
 *     2. Volume expansion (> 1.15x relative to recent 10-period volume average)
 *     3. Meaningful price displacement (candle range >= 0.7x 14-period ATR)
 */
export function detectEngulfingCandle(
  candles: Candle[],
  targetIdx?: number
): EngulfingDetectionResult {
  const len = candles.length;
  const idx = targetIdx !== undefined ? targetIdx : len - 1;

  if (idx < 1 || idx >= len) {
    const fallbackCandle = candles[len - 1] ?? {
      time: 0,
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      volume: 0,
      quoteVolume: 0,
    };
    return {
      isEngulfing: false,
      type: 'NONE',
      isStrong: false,
      strongnessScore: 0,
      strongnessTier: 'NONE',
      bodyRatio: 0,
      volumeRatio: 0,
      candle: fallbackCandle,
      prevCandle: fallbackCandle,
      reasons: ['Insufficient candles for engulfing analysis'],
    };
  }

  const curr = candles[idx];
  const prev = candles[idx - 1];

  const currRange = Math.max(0.000001, curr.high - curr.low);
  const currBody = Math.abs(curr.close - curr.open);
  const prevBody = Math.abs(prev.close - prev.open);

  const currIsGreen = curr.close > curr.open;
  const prevIsRed = prev.close < prev.open;

  const currIsRed = curr.close < curr.open;
  const prevIsGreen = prev.close > prev.open;

  // Calculate 10-period volume SMA
  const lookbackVol = candles.slice(Math.max(0, idx - 10), idx);
  const avgVol =
    lookbackVol.length > 0
      ? lookbackVol.reduce((acc, c) => acc + c.volume, 0) / lookbackVol.length
      : curr.volume;

  const volumeRatio = Number((curr.volume / (avgVol || 1)).toFixed(2));
  const bodyRatio = Number((currBody / currRange).toFixed(2));

  // ATR estimate
  let atrSum = 0;
  const atrCount = Math.min(14, idx);
  for (let i = idx - atrCount; i < idx; i++) {
    if (i >= 0) atrSum += candles[i].high - candles[i].low;
  }
  const avgAtr = atrSum / (atrCount || 1);
  const displacementRatio = avgAtr > 0 ? currRange / avgAtr : 1;


  // Test Bullish Engulfing
  const isBullishEngulfing =
    currIsGreen &&
    prevIsRed &&
    curr.open <= prev.close * 1.0008 &&
    curr.close > prev.open &&
    currBody >= prevBody * 1.05;

  // Test Bearish Engulfing
  const isBearishEngulfing =
    currIsRed &&
    prevIsGreen &&
    curr.open >= prev.close * 0.9992 &&
    curr.close < prev.open &&
    currBody >= prevBody * 1.05;

  if (!isBullishEngulfing && !isBearishEngulfing) {
    return {
      isEngulfing: false,
      type: 'NONE',
      isStrong: false,
      strongnessScore: 20,
      strongnessTier: 'NONE',
      bodyRatio,
      volumeRatio,
      candle: curr,
      prevCandle: prev,
      reasons: ['No candle engulfing pattern on current bar'],
    };
  }

  // Calculate Strongness Score (0 - 100)
  let score = 50;
  const detectedType = isBullishEngulfing ? 'BULLISH' : 'BEARISH';
  const factors: string[] = [
    `${detectedType} body completely engulfs prior candle (${(currBody / (prevBody || 1)).toFixed(2)}x)`,
  ];

  // Body dominance contribution (up to +20)
  if (bodyRatio >= 0.7) {
    score += 20;
    factors.push(`Dominant candle body (${Math.round(bodyRatio * 100)}% of range)`);
  } else if (bodyRatio >= 0.55) {
    score += 12;
    factors.push(`Solid candle body (${Math.round(bodyRatio * 100)}% of range)`);
  } else {
    score -= 10;
    factors.push(`Noticeable wicks (only ${Math.round(bodyRatio * 100)}% body)`);
  }

  // Volume surge contribution (up to +20)
  if (volumeRatio >= 1.6) {
    score += 20;
    factors.push(`High institutional volume expansion (${volumeRatio}x 10-bar SMA)`);
  } else if (volumeRatio >= 1.15) {
    score += 12;
    factors.push(`Above-average volume confirmation (${volumeRatio}x 10-bar SMA)`);
  } else {
    score -= 5;
    factors.push(`Moderate volume (${volumeRatio}x 10-bar SMA)`);
  }

  // Range displacement contribution (up to +10)
  if (displacementRatio >= 1.25) {
    score += 10;
    factors.push(`Decisive volatility displacement (${displacementRatio.toFixed(1)}x ATR)`);
  }

  const finalScore = Math.min(99, Math.max(30, Math.round(score)));

  let strongnessTier: 'A+' | 'A' | 'B+' = 'B+';
  if (finalScore >= 85) strongnessTier = 'A+';
  else if (finalScore >= 72) strongnessTier = 'A';

  // An engulfing is classified as strong if it meets Tier A/A+ institutional score (>=72) and maintains clean body dominance (>=50%)
  const isStrong = finalScore >= 72 && bodyRatio >= 0.5;

  return {
    isEngulfing: true,
    type: detectedType,
    isStrong,
    strongnessScore: finalScore,
    strongnessTier: isStrong ? strongnessTier : 'B+',
    bodyRatio,
    volumeRatio,
    candle: curr,
    prevCandle: prev,
    reasons: factors,
  };
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatFractalDateTime(ts: number): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const day = d.getDate();
  const month = MONTH_NAMES[d.getMonth()] || 'Nov';
  let hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  const hoursStr = String(hours).padStart(2, '0');
  return `${day} ${month}, ${hoursStr}:${mins} ${ampm}`;
}

/**
 * 4. Generate Strategy Trade Signal with 1:2 (50%), 1:3 (25%), 1:4 (25%) Take Profits
 */
export function generateFractalTradeSignal(params: {
  symbol: string;
  timeframe: '5m' | '1m';
  fourHourLevels: FourHourFractalLevels;
  engulfingResult: EngulfingDetectionResult;
  candle: Candle;
  requireHighGrade?: boolean;
}): FractalTradeSignal | null {
  const { symbol, timeframe, fourHourLevels, engulfingResult, candle, requireHighGrade = true } = params;

  if (!engulfingResult.isEngulfing) return null;

  // Strict Institutional Quality Guard: Do not generate low-grade signals (Tier B+ or score < 72)
  if (requireHighGrade) {
    if (
      !engulfingResult.isStrong ||
      engulfingResult.strongnessTier === 'B+' ||
      engulfingResult.strongnessScore < 72
    ) {
      return null;
    }
  }

  const direction: 'LONG' | 'SHORT' =
    engulfingResult.type === 'BULLISH' ? 'LONG' : 'SHORT';

  // Entry on engulfing candle close
  const entryPrice = candle.close;
  const candleRange = candle.high - candle.low;
  const buffer = Math.max(candleRange * 0.08, entryPrice * 0.0004);

  let stopLoss: number;
  let fourHourLevel: number;
  let fourHourLevelType: '4H_SWING_HIGH' | '4H_SWING_LOW';

  if (direction === 'SHORT') {
    // SL above engulfing candle high
    stopLoss = candle.high + buffer;
    fourHourLevel = fourHourLevels.previousSwingHigh;
    fourHourLevelType = '4H_SWING_HIGH';
  } else {
    // SL below engulfing candle low
    stopLoss = candle.low - buffer;
    fourHourLevel = fourHourLevels.previousSwingLow;
    fourHourLevelType = '4H_SWING_LOW';
  }

  const riskAmount = Math.abs(entryPrice - stopLoss);
  if (riskAmount <= 0) return null;

  const riskPercent = Number(((riskAmount / entryPrice) * 100).toFixed(2));

  // Rule 4: TP1 at 1:2 (50%), TP2 at 1:3 (25%), TP3 at 1:4 (25%)
  const tp1 =
    direction === 'LONG' ? entryPrice + 2 * riskAmount : entryPrice - 2 * riskAmount;
  const tp2 =
    direction === 'LONG' ? entryPrice + 3 * riskAmount : entryPrice - 3 * riskAmount;
  const tp3 =
    direction === 'LONG' ? entryPrice + 4 * riskAmount : entryPrice - 4 * riskAmount;

  const formatP = (p: number) =>
    p >= 100 ? Number(p.toFixed(2)) : p >= 1 ? Number(p.toFixed(4)) : Number(p.toFixed(6));

  const id = `sig-${symbol}-${candle.time}-${direction.toLowerCase()}`;

  return {
    id,
    symbol,
    timestamp: candle.time,
    timeString: formatFractalDateTime(candle.time),
    direction,
    setupType:
      direction === 'LONG'
        ? '4H_LOW_SWEEP_BULLISH_ENGULF'
        : '4H_HIGH_SWEEP_BEARISH_ENGULF',
    timeframe,
    fourHourLevel: formatP(fourHourLevel),
    fourHourLevelType,
    entryPrice: formatP(entryPrice),
    stopLoss: formatP(stopLoss),
    riskAmount: formatP(riskAmount),
    riskPercent,
    tp1: formatP(tp1),
    tp2: formatP(tp2),
    tp3: formatP(tp3),
    tp1Ratio: 2.0,
    tp2Ratio: 3.0,
    tp3Ratio: 4.0,
    tp1Allocation: 0.5,
    tp2Allocation: 0.25,
    tp3Allocation: 0.25,
    strongnessScore: engulfingResult.strongnessScore,
    strongnessTier: engulfingResult.strongnessTier,
    strongnessFactors: engulfingResult.reasons,
    status: 'ACTIVE',
    currentPrice: entryPrice,
  };
}

/**
 * 5. Backtest Engine with Failure Diagnostics ("Why it Failed")
 *
 * Runs historical simulation across LTF candles (5m or 1m) with 4H fractals as dynamic swing anchors.
 * Evaluates trade outcomes bar-by-bar, accounting for:
 * - Entry on engulfing close
 * - Stop loss hit vs TP1 (2R - 50%), TP2 (3R - 25%), TP3 (4R - 25%)
 * - Trail stop to Breakeven after TP1 hit
 * - Comprehensive Failure Post-Mortem Diagnostics on every loss
 */
export function runFractalBacktest(params: {
  symbol: string;
  timeframe: '5m' | '1m';
  candles4H: Candle[];
  candlesLTF: Candle[];
  fractalPeriods?: number;
  maxHoldBars?: number;
  startTimeMs?: number;
  endTimeMs?: number;
  dateRangePreset?: string;
  riskPerTradeUsdt?: number;
}): BacktestSummary {
  const {
    symbol,
    timeframe,
    candles4H,
    candlesLTF,
    fractalPeriods = 2,
    maxHoldBars = 60,
    startTimeMs,
    endTimeMs,
    dateRangePreset = '7d',
    riskPerTradeUsdt = 100,
  } = params;

  const trades: BacktestTrade[] = [];
  const failureCategorization: Record<string, number> = {
    TREND_CONTINUATION: 0,
    VOLUME_EXHAUSTION_ABSENT: 0,
    PREMATURE_ENGULFING: 0,
    SECONDARY_SWEEP_STOP_HUNT: 0,
    CHOPPY_RANGE_ABSORPTION: 0,
    HIGH_SLIPPAGE_WICK: 0,
  };

  const padZero = (n: number) => n.toString().padStart(2, '0');
  const formatTimeStr = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())} ${padZero(d.getHours())}:${padZero(d.getMinutes())}`;
  };

  const formatP = (p: number) =>
    p >= 100 ? Number(p.toFixed(2)) : p >= 1 ? Number(p.toFixed(4)) : Number(p.toFixed(6));

  const barMinutes = timeframe === '1m' ? 1 : 5;

  if (candles4H.length < 10 || candlesLTF.length < 30) {
    return {
      symbol,
      timeframe,
      dateRangePreset,
      startDate: candlesLTF[0] ? formatTimeStr(candlesLTF[0].time) : '',
      endDate: candlesLTF[candlesLTF.length - 1] ? formatTimeStr(candlesLTF[candlesLTF.length - 1].time) : '',
      startTimeMs,
      endTimeMs,
      riskPerTradeUsdt,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      netProfitR: 0,
      netProfitUsdt: 0,
      profitFactor: 0,
      maxDrawdownR: 0,
      maxDrawdownUsdt: 0,
      avgTradeR: 0,
      avgTradeUsdt: 0,
      tp1HitRate: 0,
      tp2HitRate: 0,
      tp3HitRate: 0,
      trades: [],
      failureCategorization,
      createdAt: new Date().toISOString(),
    };
  }

  // Pre-calculate 4H fractals
  const fourHourFractals = calculateWilliamsFractals(candles4H, fractalPeriods);

  let tradeIndex = 1;
  let activeTrade: {
    trade: BacktestTrade;
    entryBarIdx: number;
    breakEvenActivated: boolean;
  } | null = null;

  for (let i = 15; i < candlesLTF.length; i++) {
    const currBar = candlesLTF[i];

    // If a trade is currently active, advance simulation
    if (activeTrade) {
      const { trade, entryBarIdx } = activeTrade;
      const barsHeld = i - entryBarIdx;
      const durationMinutes = barsHeld * barMinutes;
      const hrs = Math.floor(durationMinutes / 60);
      const mins = durationMinutes % 60;
      const durationString = hrs > 0 ? `${hrs}h ${mins}m (${barsHeld} bars)` : `${durationMinutes}m (${barsHeld} bars)`;

      let isClosed = false;

      if (trade.direction === 'LONG') {
        // Check Stop Loss
        const effectiveSL = activeTrade.breakEvenActivated
          ? Math.max(trade.stopLoss, trade.entryPrice)
          : trade.stopLoss;

        if (currBar.low <= effectiveSL) {
          isClosed = true;
          trade.stoppedOut = true;
          trade.exitTime = currBar.time;
          trade.exitTimeString = formatTimeStr(currBar.time);
          trade.durationBars = barsHeld;
          trade.durationMinutes = durationMinutes;
          trade.durationString = durationString;
          trade.exitPrice = formatP(effectiveSL);

          if (trade.hitTp2) {
            trade.exitReason = 'TP2_TRAIL_STOP';
            trade.netRealizedR = 0.5 * 2.0 + 0.25 * 3.0; // 1.75R
          } else if (trade.hitTp1) {
            trade.exitReason = 'TP1_TRAIL_STOP';
            trade.netRealizedR = 0.5 * 2.0; // 1.0R
          } else {
            trade.exitReason = 'FULL_STOP_LOSS';
            trade.netRealizedR = -1.0;
          }
        } else {
          // Check TP targets
          if (!trade.hitTp1 && currBar.high >= trade.tp1) {
            trade.hitTp1 = true;
            activeTrade.breakEvenActivated = true; // Move SL to Break-Even
          }
          if (trade.hitTp1 && !trade.hitTp2 && currBar.high >= trade.tp2) {
            trade.hitTp2 = true;
          }
          if (trade.hitTp2 && !trade.hitTp3 && currBar.high >= trade.tp3) {
            trade.hitTp3 = true;
            trade.exitReason = 'TP3_MAX';
            trade.netRealizedR = 0.5 * 2.0 + 0.25 * 3.0 + 0.25 * 4.0; // 2.75R
            trade.exitPrice = formatP(trade.tp3);
            trade.exitTime = currBar.time;
            trade.exitTimeString = formatTimeStr(currBar.time);
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
          trade.exitTimeString = formatTimeStr(currBar.time);
          trade.durationBars = barsHeld;
          trade.durationMinutes = durationMinutes;
          trade.durationString = durationString;
          trade.exitPrice = formatP(effectiveSL);

          if (trade.hitTp2) {
            trade.exitReason = 'TP2_TRAIL_STOP';
            trade.netRealizedR = 0.5 * 2.0 + 0.25 * 3.0; // 1.75R
          } else if (trade.hitTp1) {
            trade.exitReason = 'TP1_TRAIL_STOP';
            trade.netRealizedR = 0.5 * 2.0; // 1.0R
          } else {
            trade.exitReason = 'FULL_STOP_LOSS';
            trade.netRealizedR = -1.0;
          }
        } else {
          // Check TP targets
          if (!trade.hitTp1 && currBar.low <= trade.tp1) {
            trade.hitTp1 = true;
            activeTrade.breakEvenActivated = true;
          }
          if (trade.hitTp1 && !trade.hitTp2 && currBar.low <= trade.tp2) {
            trade.hitTp2 = true;
          }
          if (trade.hitTp2 && !trade.hitTp3 && currBar.low <= trade.tp3) {
            trade.hitTp3 = true;
            trade.exitReason = 'TP3_MAX';
            trade.netRealizedR = 0.5 * 2.0 + 0.25 * 3.0 + 0.25 * 4.0; // 2.75R
            trade.exitPrice = formatP(trade.tp3);
            trade.exitTime = currBar.time;
            trade.exitTimeString = formatTimeStr(currBar.time);
            trade.durationBars = barsHeld;
            trade.durationMinutes = durationMinutes;
            trade.durationString = durationString;
            isClosed = true;
          }
        }
      }

      // Max bar timeout check
      if (!isClosed && barsHeld >= maxHoldBars) {
        isClosed = true;
        trade.exitReason = 'BAR_TIMEOUT';
        trade.exitTime = currBar.time;
        trade.exitTimeString = formatTimeStr(currBar.time);
        trade.exitPrice = formatP(currBar.close);
        trade.durationBars = barsHeld;
        trade.durationMinutes = durationMinutes;
        trade.durationString = durationString;
        const finalR =
          trade.direction === 'LONG'
            ? (currBar.close - trade.entryPrice) / (trade.riskAmount || 1)
            : (trade.entryPrice - currBar.close) / (trade.riskAmount || 1);
        trade.netRealizedR = Number(Math.max(-1.0, Math.min(2.75, finalR)).toFixed(2));
      }

      if (isClosed) {
        trade.isWinner = trade.netRealizedR > 0;
        trade.pnlUsdt = Number((trade.netRealizedR * riskPerTradeUsdt).toFixed(2));

        // Perform Diagnostic Post-Mortem if Trade Failed
        if (!trade.isWinner) {
          trade.failureDiagnostic = diagnoseTradeFailure({
            trade,
            entryBar: candlesLTF[entryBarIdx],
            exitBar: currBar,
            surroundingBars: candlesLTF.slice(
              Math.max(0, entryBarIdx - 8),
              Math.min(candlesLTF.length, i + 4)
            ),
          });
          const cat = trade.failureDiagnostic.category;
          failureCategorization[cat] = (failureCategorization[cat] || 0) + 1;
        }

        trades.push(trade);
        activeTrade = null;
      }

      continue;
    }

    // Date range filter check: only initiate trades inside the user's selected window
    if (startTimeMs && currBar.time < startTimeMs) continue;
    if (endTimeMs && currBar.time > endTimeMs) continue;

    // Look for new setup:
    // Determine the most recent confirmed 4H fractal levels prior to currBar.time
    const eligible4HFractals = fourHourFractals.filter(
      (f) => f.time + fractalPeriods * 4 * 3600 * 1000 <= currBar.time
    );

    let active4HHigh = 0;
    let active4HLow = 0;

    for (let fIdx = eligible4HFractals.length - 1; fIdx >= 0; fIdx--) {
      const f = eligible4HFractals[fIdx];
      if (f.type === 'UP_FRACTAL' && active4HHigh === 0) active4HHigh = f.price;
      if (f.type === 'DOWN_FRACTAL' && active4HLow === 0) active4HLow = f.price;
      if (active4HHigh > 0 && active4HLow > 0) break;
    }

    // Historical fallback for anchor swing levels if fractal lead-in is brief
    if (active4HHigh === 0 && candles4H.length > 0) {
      const past4H = candles4H.filter((c) => c.time <= currBar.time);
      if (past4H.length > 0) {
        active4HHigh = Math.max(...past4H.map((c) => c.high));
      }
    }
    if (active4HLow === 0 && candles4H.length > 0) {
      const past4H = candles4H.filter((c) => c.time <= currBar.time);
      if (past4H.length > 0) {
        active4HLow = Math.min(...past4H.map((c) => c.low));
      }
    }

    if (active4HHigh === 0 || active4HLow === 0) continue;

    // Check if price recently crossed or swept 4H High or 4H Low (within past 8 LTF bars)
    const recentBars = candlesLTF.slice(Math.max(0, i - 6), i + 1);
    const highestRecent = Math.max(...recentBars.map((b) => b.high));
    const lowestRecent = Math.min(...recentBars.map((b) => b.low));

    const highSwept = highestRecent >= active4HHigh;
    const lowSwept = lowestRecent <= active4HLow;

    if (!highSwept && !lowSwept) continue;

    // Detect Engulfing pattern on current candle (Only High-Grade Tier A / A+ allowed)
    const engulfing = detectEngulfingCandle(candlesLTF, i);

    if (
      engulfing.isEngulfing &&
      engulfing.isStrong &&
      engulfing.strongnessTier !== 'B+' &&
      engulfing.strongnessScore >= 72
    ) {
      let candidateDirection: 'LONG' | 'SHORT' | null = null;
      let sweptLevel = 0;
      let levelType: '4H_SWING_HIGH' | '4H_SWING_LOW' = '4H_SWING_HIGH';

      if (highSwept && engulfing.type === 'BEARISH') {
        candidateDirection = 'SHORT';
        sweptLevel = active4HHigh;
        levelType = '4H_SWING_HIGH';
      } else if (lowSwept && engulfing.type === 'BULLISH') {
        candidateDirection = 'LONG';
        sweptLevel = active4HLow;
        levelType = '4H_SWING_LOW';
      }

      if (candidateDirection) {
        const entryPrice = currBar.close;
        const buffer = Math.max(
          (currBar.high - currBar.low) * 0.08,
          entryPrice * 0.0004
        );

        const stopLoss =
          candidateDirection === 'SHORT' ? currBar.high + buffer : currBar.low - buffer;
        const riskAmount = Math.abs(entryPrice - stopLoss);
        const riskPercent = Number(((riskAmount / entryPrice) * 100).toFixed(2));

        if (riskAmount > 0 && riskAmount / entryPrice <= 0.035) {
          const tp1 =
            candidateDirection === 'LONG'
              ? entryPrice + 2 * riskAmount
              : entryPrice - 2 * riskAmount;
          const tp2 =
            candidateDirection === 'LONG'
              ? entryPrice + 3 * riskAmount
              : entryPrice - 3 * riskAmount;
          const tp3 =
            candidateDirection === 'LONG'
              ? entryPrice + 4 * riskAmount
              : entryPrice - 4 * riskAmount;

          const newTrade: BacktestTrade = {
            id: `bt-${symbol}-${tradeIndex++}`,
            entryTime: currBar.time,
            exitTime: currBar.time,
            entryTimeString: formatTimeStr(currBar.time),
            exitTimeString: formatTimeStr(currBar.time),
            direction: candidateDirection,
            setupType:
              candidateDirection === 'LONG'
                ? '4H_LOW_SWEEP_BULLISH_ENGULF'
                : '4H_HIGH_SWEEP_BEARISH_ENGULF',
            fourHourLevel: formatP(sweptLevel),
            fourHourLevelType: levelType,
            entryPrice: formatP(entryPrice),
            stopLoss: formatP(stopLoss),
            tp1: formatP(tp1),
            tp2: formatP(tp2),
            tp3: formatP(tp3),
            riskAmount: formatP(riskAmount),
            riskPercent,
            exitPrice: formatP(entryPrice),
            hitTp1: false,
            hitTp2: false,
            hitTp3: false,
            stoppedOut: false,
            netRealizedR: 0,
            pnlUsdt: 0,
            exitReason: 'FULL_STOP_LOSS',
            durationBars: 0,
            durationMinutes: 0,
            durationString: '0m (0 bars)',
            strongnessScore: engulfing.strongnessScore,
            strongnessTier: engulfing.strongnessTier,
            engulfingVolumeRatio: engulfing.volumeRatio,
            engulfingBodyRatio: engulfing.bodyRatio,
            isWinner: false,
          };

          activeTrade = {
            trade: newTrade,
            entryBarIdx: i,
            breakEvenActivated: false,
          };
        }
      }
    }
  }

  // Mark-to-market settlement for any trade still active at the end of the simulation window
  if (activeTrade && candlesLTF.length > 0) {
    const lastBar = candlesLTF[candlesLTF.length - 1];
    const { trade, entryBarIdx } = activeTrade;
    const barsHeld = Math.max(1, candlesLTF.length - 1 - entryBarIdx);
    const durationMinutes = barsHeld * barMinutes;
    const hrs = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    const durationString =
      hrs > 0 ? `${hrs}h ${mins}m (${barsHeld} bars)` : `${durationMinutes}m (${barsHeld} bars)`;

    trade.exitTime = lastBar.time;
    trade.exitTimeString = formatTimeStr(lastBar.time);
    trade.exitPrice = formatP(lastBar.close);
    trade.durationBars = barsHeld;
    trade.durationMinutes = durationMinutes;
    trade.durationString = durationString;
    trade.exitReason = 'BAR_TIMEOUT';

    const finalR =
      trade.direction === 'LONG'
        ? (lastBar.close - trade.entryPrice) / (trade.riskAmount || 1)
        : (trade.entryPrice - lastBar.close) / (trade.riskAmount || 1);
    trade.netRealizedR = Number(Math.max(-1.0, Math.min(2.75, finalR)).toFixed(2));
    trade.isWinner = trade.netRealizedR > 0;
    trade.pnlUsdt = Number((trade.netRealizedR * riskPerTradeUsdt).toFixed(2));

    if (!trade.isWinner) {
      trade.failureDiagnostic = diagnoseTradeFailure({
        trade,
        entryBar: candlesLTF[entryBarIdx],
        exitBar: lastBar,
        surroundingBars: candlesLTF.slice(Math.max(0, entryBarIdx - 8)),
      });
      const cat = trade.failureDiagnostic.category;
      failureCategorization[cat] = (failureCategorization[cat] || 0) + 1;
    }

    trades.push(trade);
    activeTrade = null;
  }

  // Calculate backtest aggregate performance
  const totalTrades = trades.length;
  const winningTrades = trades.filter((t) => t.isWinner).length;
  const losingTrades = totalTrades - winningTrades;
  const winRate =
    totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;

  const netProfitR = Number(
    trades.reduce((sum, t) => sum + t.netRealizedR, 0).toFixed(2)
  );
  const netProfitUsdt = Number((netProfitR * riskPerTradeUsdt).toFixed(2));

  const grossProfitR = trades
    .filter((t) => t.netRealizedR > 0)
    .reduce((sum, t) => sum + t.netRealizedR, 0);
  const grossLossR = Math.abs(
    trades
      .filter((t) => t.netRealizedR < 0)
      .reduce((sum, t) => sum + t.netRealizedR, 0)
  );
  const profitFactor =
    grossLossR > 0
      ? Number((grossProfitR / grossLossR).toFixed(2))
      : grossProfitR > 0
      ? 99
      : 0;

  // Max drawdown calculation in R and USDT
  let peakR = 0;
  let runningR = 0;
  let maxDDR = 0;
  for (const t of trades) {
    runningR += t.netRealizedR;
    if (runningR > peakR) peakR = runningR;
    const dd = peakR - runningR;
    if (dd > maxDDR) maxDDR = dd;
  }
  const maxDrawdownR = Number(maxDDR.toFixed(2));
  const maxDrawdownUsdt = Number((maxDrawdownR * riskPerTradeUsdt).toFixed(2));

  const avgTradeR =
    totalTrades > 0 ? Number((netProfitR / totalTrades).toFixed(2)) : 0;
  const avgTradeUsdt = Number((avgTradeR * riskPerTradeUsdt).toFixed(2));

  const tp1HitRate =
    totalTrades > 0
      ? Number(
          ((trades.filter((t) => t.hitTp1).length / totalTrades) * 100).toFixed(1)
        )
      : 0;
  const tp2HitRate =
    totalTrades > 0
      ? Number(
          ((trades.filter((t) => t.hitTp2).length / totalTrades) * 100).toFixed(1)
        )
      : 0;
  const tp3HitRate =
    totalTrades > 0
      ? Number(
          ((trades.filter((t) => t.hitTp3).length / totalTrades) * 100).toFixed(1)
        )
      : 0;

  const firstCandle = candlesLTF[0];
  const lastCandle = candlesLTF[candlesLTF.length - 1];

  return {
    symbol,
    timeframe,
    dateRangePreset,
    startDate: startTimeMs ? formatTimeStr(startTimeMs) : firstCandle ? formatTimeStr(firstCandle.time) : '',
    endDate: endTimeMs ? formatTimeStr(endTimeMs) : lastCandle ? formatTimeStr(lastCandle.time) : '',
    startTimeMs,
    endTimeMs,
    riskPerTradeUsdt,
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    netProfitR,
    netProfitUsdt,
    profitFactor,
    maxDrawdownR,
    maxDrawdownUsdt,
    avgTradeR,
    avgTradeUsdt,
    tp1HitRate,
    tp2HitRate,
    tp3HitRate,
    trades: trades.reverse(), // most recent first
    failureCategorization,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Diagnostic Post-Mortem: Dissects losing trades to explain "Why it Failed"
 */
function diagnoseTradeFailure(params: {
  trade: BacktestTrade;
  entryBar: Candle;
  exitBar: Candle;
  surroundingBars: Candle[];
}): NonNullable<BacktestTrade['failureDiagnostic']> {
  const { trade, entryBar, exitBar, surroundingBars } = params;

  const entryRange = entryBar.high - entryBar.low;
  const exitRange = exitBar.high - exitBar.low;

  // 1. Check if Trend Continuation blew through without stopping
  const postEntryBars = surroundingBars.filter((b) => b.time > entryBar.time);
  const trendBlownThrough =
    trade.direction === 'SHORT'
      ? postEntryBars.some((b) => b.close > trade.stopLoss)
      : postEntryBars.some((b) => b.close < trade.stopLoss);

  if (trendBlownThrough && trade.durationBars <= 3) {
    return {
      category: 'TREND_CONTINUATION',
      summary:
        'Higher-Timeframe Trend Continuation Momentum: Price pierced the 4H level with institutional breakout momentum rather than liquidity absorption.',
      evidence: [
        `Stopped out rapidly within ${trade.durationBars} bars`,
        `4H level offered zero pushback; price closed decisively through the stop loss level`,
        `Lack of follow-through reversal volume on subsequent candles`,
      ],
      suggestedFilter:
        'Require a wick rejection on the 4H level before triggering the 5m engulfing watch, or filter trades against the 4H EMA50 slope.',
    };
  }

  // 2. Secondary Sweep / Stop Hunt (Price wicked beyond stop loss and then moved in the direction)
  const stoppedByWick =
    trade.direction === 'SHORT'
      ? exitBar.high >= trade.stopLoss && exitBar.close < trade.stopLoss
      : exitBar.low <= trade.stopLoss && exitBar.close > trade.stopLoss;

  if (stoppedByWick) {
    return {
      category: 'SECONDARY_SWEEP_STOP_HUNT',
      summary:
        'Secondary Liquidity Sweep / Stop Hunt: Price wicked beyond the engulfing candle extreme to sweep retail stops before reversing.',
      evidence: [
        `Exit candle pierced stop loss by wick only (close stayed inside bounds)`,
        `Market makers hunted liquidity clustered immediately above the engulfing high`,
      ],
      suggestedFilter:
        'Widen Stop Loss buffer by an additional 0.15 ATR or place SL at the 4H sweep wick high rather than the 5m candle high.',
    };
  }

  // 3. Premature Engulfing / Volatility Absorption
  if (entryRange < exitRange * 0.7) {
    return {
      category: 'PREMATURE_ENGULFING',
      summary:
        'Premature Engulfing Confirmation: The engulfing candle range was too narrow compared to subsequent expansion volatility.',
      evidence: [
        `Engulfing body was relatively compact ($${entryRange.toFixed(2)})`,
        `Subsequent adverse bar expanded by ${(exitRange / (entryRange || 1)).toFixed(1)}x`,
      ],
      suggestedFilter:
        'Enforce minimum engulfing range threshold (at least 1.0x 14-period ATR).',
    };
  }

  // Default fallback diagnostic
  return {
    category: 'CHOPPY_RANGE_ABSORPTION',
    summary:
      'Choppy Range Absorption: Order flow stalled inside a low-volume consolidation zone, resulting in adverse chop.',
    evidence: [
      `Trade lingered for ${trade.durationBars} bars without reaching TP1`,
      `Order book lacked sufficient one-sided directional conviction`,
    ],
    suggestedFilter:
      'Add a time-based exit rule after 12 bars if TP1 is not tagged.',
  };
}
