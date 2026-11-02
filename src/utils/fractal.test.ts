import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateWilliamsFractals,
  getLatest4HFractalLevels,
  check4HLevelCross,
  detectEngulfingCandle,
  generateFractalTradeSignal,
  runFractalBacktest,
  type FourHourFractalLevels,
} from './fractal.ts';
import type { Candle } from './quant.ts';

function createMockCandles(
  count: number,
  basePrice = 100,
  stepMs = 3600000
): Candle[] {
  const candles: Candle[] = [];
  let price = basePrice;
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const open = price;
    const close = price + (i % 2 === 0 ? 1.5 : -1.2);
    const high = Math.max(open, close) + 0.8;
    const low = Math.min(open, close) - 0.8;
    candles.push({
      time: now - (count - i) * stepMs,
      open,
      high,
      low,
      close,
      volume: 1000 + i * 50,
      quoteVolume: 100000,
    });
    price = close;
  }
  return candles;
}

test('calculateWilliamsFractals detects confirmed Swing High and Swing Low with n=2', () => {
  // Create a 7-bar sequence where candle 3 is a prominent peak (UpFractal)
  // and candle 5 is a prominent trough (DownFractal)
  const candles: Candle[] = [
    { time: 1000, open: 100, high: 102, low: 99, close: 101, volume: 100, quoteVolume: 1000 },
    { time: 2000, open: 101, high: 104, low: 100, close: 103, volume: 120, quoteVolume: 1000 },
    { time: 3000, open: 103, high: 110, low: 102, close: 108, volume: 300, quoteVolume: 1000 }, // Peak (UpFractal)
    { time: 4000, open: 108, high: 105, low: 101, close: 102, volume: 150, quoteVolume: 1000 },
    { time: 5000, open: 102, high: 103, low: 90, close: 91, volume: 400, quoteVolume: 1000 },   // Trough (DownFractal)
    { time: 6000, open: 91, high: 95, low: 91, close: 94, volume: 200, quoteVolume: 1000 },
    { time: 7000, open: 94, high: 97, low: 93, close: 96, volume: 180, quoteVolume: 1000 },
  ];

  const fractals = calculateWilliamsFractals(candles, 2);
  const upFractals = fractals.filter((f) => f.type === 'UP_FRACTAL');
  const downFractals = fractals.filter((f) => f.type === 'DOWN_FRACTAL');

  assert.ok(upFractals.length >= 1, 'Should detect at least 1 UpFractal');
  assert.equal(upFractals[0].price, 110, 'Peak price should match 110');
  assert.equal(upFractals[0].index, 2, 'Peak index should be 2');

  assert.ok(downFractals.length >= 1, 'Should detect at least 1 DownFractal');
  assert.equal(downFractals[0].price, 90, 'Trough price should match 90');
  assert.equal(downFractals[0].index, 4, 'Trough index should be 4');
});

test('getLatest4HFractalLevels extracts most recent 4H levels', () => {
  const mock4H = createMockCandles(30, 200, 4 * 3600 * 1000);
  // Inject explicit peak and trough
  mock4H[10].high = 250;
  mock4H[11].high = 230;
  mock4H[12].high = 225;
  mock4H[9].high = 235;
  mock4H[8].high = 230;

  mock4H[20].low = 160;
  mock4H[21].low = 175;
  mock4H[22].low = 180;
  mock4H[19].low = 170;
  mock4H[18].low = 175;

  const levels = getLatest4HFractalLevels(mock4H, 'SOLUSDT', 2);
  assert.ok(levels.previousSwingHigh > 0, 'Previous 4H Swing High must be positive');
  assert.ok(levels.previousSwingLow > 0, 'Previous 4H Swing Low must be positive');
  assert.ok(levels.previousSwingHigh > levels.previousSwingLow, 'High must exceed Low');
});

test('check4HLevelCross detects liquidity sweeps and inside-range states', () => {
  const levels: FourHourFractalLevels = {
    symbol: 'BTCUSDT',
    previousSwingHigh: 95000,
    previousSwingLow: 90000,
    highFractalTime: 1000,
    lowFractalTime: 2000,
    highFractalIndex: 5,
    lowFractalIndex: 12,
    allFractals: [],
  };

  // 1. High Sweep: price pushes to 95200 (above 95000) but trades around 95100
  const sweepHigh = check4HLevelCross(95100, 95300, 94800, levels);
  assert.equal(sweepHigh.isCrossed, true);
  assert.equal(sweepHigh.type, 'HIGH_CROSSED');

  // 2. Low Sweep: price pushes to 89800 (below 90000)
  const sweepLow = check4HLevelCross(89950, 90200, 89700, levels);
  assert.equal(sweepLow.isCrossed, true);
  assert.equal(sweepLow.type, 'LOW_CROSSED');

  // 3. Inside Range: price trades at 92500
  const insideRange = check4HLevelCross(92500, 93000, 92000, levels);
  assert.equal(insideRange.isCrossed, false);
  assert.equal(insideRange.type, 'INSIDE_RANGE');
});

test('detectEngulfingCandle correctly identifies strong Bullish and Bearish engulfing patterns', () => {
  // Test Bearish Engulfing
  const bearishSeries: Candle[] = [
    { time: 1000, open: 100, high: 101, low: 99.8, close: 100.8, volume: 1000, quoteVolume: 100000 }, // Green
    { time: 2000, open: 101.2, high: 101.4, low: 98.5, close: 98.7, volume: 2200, quoteVolume: 200000 }, // Strong Red
  ];

  const bearResult = detectEngulfingCandle(bearishSeries, 1);
  assert.equal(bearResult.isEngulfing, true);
  assert.equal(bearResult.type, 'BEARISH');
  assert.ok(bearResult.strongnessScore >= 70, 'Should receive high strongness score');
  assert.ok(bearResult.isStrong, 'Should be marked strong');

  // Test Bullish Engulfing
  const bullishSeries: Candle[] = [
    { time: 1000, open: 100, high: 100.2, low: 98.5, close: 98.8, volume: 1000, quoteVolume: 100000 }, // Red
    { time: 2000, open: 98.6, high: 101.5, low: 98.4, close: 101.2, volume: 2400, quoteVolume: 240000 }, // Strong Green
  ];

  const bullResult = detectEngulfingCandle(bullishSeries, 1);
  assert.equal(bullResult.isEngulfing, true);
  assert.equal(bullResult.type, 'BULLISH');
  assert.ok(bullResult.strongnessScore >= 70);
  assert.ok(bullResult.isStrong);
});

test('generateFractalTradeSignal calculates exact 1:2 (50%), 1:3 (25%), 1:4 (25%) tiered targets', () => {
  const levels: FourHourFractalLevels = {
    symbol: 'ETHUSDT',
    previousSwingHigh: 2800,
    previousSwingLow: 2600,
    highFractalTime: 1000,
    lowFractalTime: 2000,
    highFractalIndex: 1,
    lowFractalIndex: 2,
    allFractals: [],
  };

  const candle: Candle = {
    time: 5000,
    open: 2805,
    high: 2810,
    low: 2770,
    close: 2775,
    volume: 5000,
    quoteVolume: 1000000,
  };

  const engulfingResult = {
    isEngulfing: true,
    type: 'BEARISH' as const,
    isStrong: true,
    strongnessScore: 88,
    strongnessTier: 'A+' as const,
    bodyRatio: 0.75,
    volumeRatio: 1.8,
    candle,
    prevCandle: candle,
    reasons: ['Strong volume', 'Dominant body'],
  };

  const signal = generateFractalTradeSignal({
    symbol: 'ETHUSDT',
    timeframe: '5m',
    fourHourLevels: levels,
    engulfingResult,
    candle,
  });

  assert.ok(signal !== null, 'Signal should not be null');
  assert.equal(signal.direction, 'SHORT');
  assert.equal(signal.entryPrice, 2775);
  assert.ok(signal.stopLoss > 2810, 'SL must be above candle high');

  const risk = signal.stopLoss - signal.entryPrice;
  // Verify Rule 4 tiered Take Profit math
  assert.equal(signal.tp1, Number((2775 - 2 * risk).toFixed(2)));
  assert.equal(signal.tp2, Number((2775 - 3 * risk).toFixed(2)));
  assert.equal(signal.tp3, Number((2775 - 4 * risk).toFixed(2)));
  assert.equal(signal.tp1Allocation, 0.5, 'TP1 must book 50%');
  assert.equal(signal.tp2Allocation, 0.25, 'TP2 must book 25%');
  assert.equal(signal.tp3Allocation, 0.25, 'TP3 must book 25%');
});

test('generateFractalTradeSignal strictly rejects low-grade signals (Tier B+ or score < 72)', () => {
  const levels: FourHourFractalLevels = {
    symbol: 'SOLUSDT',
    previousSwingHigh: 108.6,
    previousSwingLow: 95.0,
    highFractalTime: 1000,
    lowFractalTime: 2000,
    highFractalIndex: 1,
    lowFractalIndex: 2,
    allFractals: [],
  };

  const candle: Candle = {
    time: 5000,
    open: 108.5,
    high: 108.65,
    low: 108.2,
    close: 108.25,
    volume: 500,
    quoteVolume: 50000,
  };

  const lowGradeEngulfing = {
    isEngulfing: true,
    type: 'BEARISH' as const,
    isStrong: false,
    strongnessScore: 57,
    strongnessTier: 'B+' as const,
    bodyRatio: 0.45,
    volumeRatio: 0.9,
    candle,
    prevCandle: candle,
    reasons: ['Weak candle body', 'Low volume ratio'],
  };

  const rejectedSignal = generateFractalTradeSignal({
    symbol: 'SOLUSDT',
    timeframe: '5m',
    fourHourLevels: levels,
    engulfingResult: lowGradeEngulfing,
    candle,
  });

  assert.strictEqual(rejectedSignal, null, 'Low-grade Tier B+ signal must return null');
});

test('runFractalBacktest simulates strategy and provides Failure Diagnostics on losses', () => {
  const mock4H = createMockCandles(40, 100, 4 * 3600 * 1000);
  const mock5m = createMockCandles(120, 100, 5 * 60 * 1000);

  // Set up 4H high and 5m sweep
  mock4H[10].high = 115;
  mock4H[11].high = 110;
  mock4H[12].high = 108;
  mock4H[9].high = 109;
  mock4H[8].high = 107;

  // 5m sweep of 115 around candle 50
  mock5m[50].high = 115.5;
  mock5m[51].open = 115.4;
  mock5m[51].high = 115.6;
  mock5m[51].low = 112.0;
  mock5m[51].close = 112.2;
  mock5m[51].volume = 4000;

  const result = runFractalBacktest({
    symbol: 'BTCUSDT',
    timeframe: '5m',
    candles4H: mock4H,
    candlesLTF: mock5m,
  });

  assert.ok(typeof result.totalTrades === 'number', 'totalTrades should be numeric');
  assert.ok(typeof result.winRate === 'number', 'winRate should be numeric');
  assert.ok(typeof result.profitFactor === 'number', 'profitFactor should be numeric');
  assert.ok(result.failureCategorization !== undefined, 'Failure categorization must exist');

  // If there are losing trades, verify diagnostic post-mortem structure
  const losingTrades = result.trades.filter((t) => !t.isWinner);
  if (losingTrades.length > 0) {
    assert.ok(losingTrades[0].failureDiagnostic !== undefined);
    assert.ok(losingTrades[0].failureDiagnostic.category.length > 0);
    assert.ok(losingTrades[0].failureDiagnostic.summary.length > 0);
  }
});

test('runFractalBacktest honors dateRange bounds and includes detailed timestamps and dollar PnL in execution log', () => {
  const mock4H = createMockCandles(40, 100, 4 * 3600 * 1000);
  const mock5m = createMockCandles(150, 100, 5 * 60 * 1000);

  // Setup 4H high and sweep in mock5m
  mock4H[10].high = 115;
  mock4H[11].high = 110;
  mock4H[12].high = 108;
  mock4H[9].high = 109;
  mock4H[8].high = 107;

  mock5m[50].high = 115.5;
  mock5m[51].open = 115.4;
  mock5m[51].high = 115.6;
  mock5m[51].low = 112.0;
  mock5m[51].close = 112.2;
  mock5m[51].volume = 4000;

  const startTimeMs = mock5m[30].time;
  const endTimeMs = mock5m[100].time;

  const result = runFractalBacktest({
    symbol: 'ETHUSDT',
    timeframe: '5m',
    candles4H: mock4H,
    candlesLTF: mock5m,
    startTimeMs,
    endTimeMs,
    dateRangePreset: '7d',
    riskPerTradeUsdt: 250,
  });

  assert.ok(result.startDate !== undefined, 'startDate should be populated');
  assert.ok(result.endDate !== undefined, 'endDate should be populated');
  assert.equal(result.riskPerTradeUsdt, 250);

  if (result.trades.length > 0) {
    const trade = result.trades[0];
    assert.ok(trade.entryTimeString.length > 0, 'entryTimeString must be present');
    assert.ok(trade.exitTimeString.length > 0, 'exitTimeString must be present');
    assert.ok(trade.durationString.length > 0, 'durationString must be present');
    assert.ok(typeof trade.durationMinutes === 'number', 'durationMinutes must be numeric');
    assert.ok(typeof trade.exitPrice === 'number', 'exitPrice must be numeric');
    assert.ok(typeof trade.pnlUsdt === 'number', 'pnlUsdt must be numeric');
    assert.equal(trade.pnlUsdt, Number((trade.netRealizedR * 250).toFixed(2)));
  }
});
