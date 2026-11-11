/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert';
import {
  extractLiquidityPools,
  checkLiquiditySweep,
  detectMarketStructureShift,
  detectFairValueGap,
  findLiveSsrSignal,
  scanSsrAssetStatus,
  runSsrBacktest,
  calculateSsrPositionSize,
} from './ssrStrategy';
import { Candle } from './quant';

function createMockCandles(count: number, basePrice = 100, step = 1, intervalMs = 300000): Candle[] {
  const candles: Candle[] = [];
  const baseTime = 1730000000000;
  for (let i = 0; i < count; i++) {
    const time = baseTime + i * intervalMs;
    const open = basePrice + i * step;
    const close = open + step * 0.5;
    const high = Math.max(open, close) + Math.abs(step) * 0.5;
    const low = Math.min(open, close) - Math.abs(step) * 0.5;
    candles.push({
      time,
      open,
      high,
      low,
      close,
      volume: 1000 + (i % 5) * 200,
      quoteVolume: 100000,
    });
  }
  return candles;
}

test('extractLiquidityPools detects prominent BSL and SSL swings on HTF', () => {
  const candles = createMockCandles(30, 100, 1, 3600000);
  // Inject a prominent swing high at index 10
  candles[10].high = 150;
  candles[10].close = 145;
  // Inject a prominent swing low at index 20
  candles[20].low = 80;
  candles[20].close = 85;

  const pools = extractLiquidityPools(candles, 3);
  assert.ok(pools.length >= 2, 'Should detect at least 2 pools');

  const bsl = pools.find((p) => p.type === 'BSL');
  assert.ok(bsl, 'Should find BSL pool');
  assert.strictEqual(bsl.price, 150);

  const ssl = pools.find((p) => p.type === 'SSL');
  assert.ok(ssl, 'Should find SSL pool');
  assert.strictEqual(ssl.price, 80);
});

test('checkLiquiditySweep strictly enforces rejection close back inside the level', () => {
  const pools = [
    {
      id: 'bsl-1',
      type: 'BSL' as const,
      price: 100,
      time: 1730000000000,
      timeString: '2026-01-01 10:00',
      timeframe: '1h' as const,
      swept: false,
    },
  ];

  // Case 1: Pierced 100 but closed at 102 (Open breakout continuation -> NOT a sweep rejection)
  const breakoutBars: Candle[] = [
    { time: 1730007100000, open: 95, high: 97, low: 94, close: 96, volume: 80, quoteVolume: 8000 },
    { time: 1730007200000, open: 98, high: 103, low: 97, close: 102, volume: 100, quoteVolume: 10000 },
  ];
  const sweep1 = checkLiquiditySweep(breakoutBars, pools, 1730007200000);
  assert.strictEqual(sweep1, null, 'Decisive close above BSL should NOT be flagged as sweep rejection');

  // Case 2: Pierced 100 to 103, but closed at 99.2 (True rejection wick -> Liquidity sweep confirmed!)
  const rejectionBars: Candle[] = [
    { time: 1730007100000, open: 95, high: 97, low: 94, close: 96, volume: 80, quoteVolume: 8000 },
    { time: 1730007200000, open: 98, high: 103, low: 97, close: 99.2, volume: 100, quoteVolume: 10000 },
  ];
  const sweep2 = checkLiquiditySweep(rejectionBars, pools, 1730007200000);
  assert.ok(sweep2, 'Rejection wick closing below BSL must be flagged as valid sweep');
  assert.strictEqual(sweep2.direction, 'SHORT');
  assert.strictEqual(sweep2.sweepExtreme, 103);
});

test('detectMarketStructureShift detects displacement break of opposing swing level', () => {
  const candles: Candle[] = [
    { time: 1000, open: 98, high: 99, low: 96, close: 97, volume: 50, quoteVolume: 5000 }, // Structural low = 96
    { time: 2000, open: 97, high: 103, low: 96.5, close: 98, volume: 80, quoteVolume: 8000 }, // Sweep bar (idx 1)
    { time: 3000, open: 98, high: 98.5, low: 94, close: 94.2, volume: 300, quoteVolume: 30000 }, // Displacement break below 96
  ];

  const mss = detectMarketStructureShift(candles, 1, 'SHORT', 5);
  assert.ok(mss, 'Should detect bearish MSS');
  assert.strictEqual(mss.direction, 'SHORT');
  assert.strictEqual(mss.brokenStructuralLevel, 96);
});

test('detectFairValueGap detects proximal and distal boundaries of 3-candle imbalance', () => {
  const candles: Candle[] = [
    { time: 1000, open: 100, high: 101, low: 98, close: 99, volume: 100, quoteVolume: 10000 }, // C1: low = 98
    { time: 2000, open: 98.8, high: 99, low: 92, close: 92.5, volume: 500, quoteVolume: 50000 }, // C2: Displacement
    { time: 3000, open: 92.5, high: 94, low: 91, close: 93, volume: 120, quoteVolume: 12000 }, // C3: high = 94
  ];

  // In bearish FVG: C1.low (98) > C3.high (94). Gap is 94 -> 98.
  // Proximal edge (entry on return up) = 94. Distal edge = 98.
  const fvg = detectFairValueGap(candles, 0, 1, 'SHORT');
  assert.ok(fvg, 'Should detect bearish FVG');
  assert.strictEqual(fvg.direction, 'SHORT');
  assert.strictEqual(fvg.proximalEdge, 94);
  assert.strictEqual(fvg.distalEdge, 98);
});

test('calculateSsrPositionSize correctly deducts taker fee cushion and isolates 1% risk', () => {
  const result = calculateSsrPositionSize(100, 98, 10000, 1.0, 0.0005);
  // Account equity = $10,000, 1% risk = $100 raw risk
  assert.strictEqual(result.rawRiskUsdt, 100);
  assert.strictEqual(result.stopDistancePercent, 2);
  // Estimated fee drag must be deducted
  assert.ok(result.estimatedFeeDragUsdt > 0, 'Should calculate fee drag');
  assert.ok(result.netRiskUsdt < 100, 'Net risk after fees must be lower than raw risk');
  assert.ok(result.positionQuantity > 0, 'Position quantity must be positive');
  assert.ok(result.recommendedLeverage >= 1 && result.recommendedLeverage <= 25);
});

test('runSsrBacktest outputs full institutional metrics and success evaluation', () => {
  const candlesHTF = createMockCandles(60, 100, 0.5, 3600000);
  // Inject swing points in HTF
  candlesHTF[15].high = 140;
  candlesHTF[35].low = 80;

  const candlesLTF = createMockCandles(200, 95, 0.2, 300000);
  // Inject a complete SSR cycle:
  // 1. Sweep BSL at 140
  candlesLTF[50].high = 141;
  candlesLTF[50].close = 138;
  // 2. MSS displacement
  candlesLTF[51].open = 138;
  candlesLTF[51].high = 138.5;
  candlesLTF[51].low = 130;
  candlesLTF[51].close = 131;
  // 3. FVG formation: C1 low=137, C2, C3 high=133 -> Proximal=133
  candlesLTF[49].low = 137;
  candlesLTF[52].high = 133;
  // 4. Return retracement
  candlesLTF[55].high = 133.5; // Fills limit at 133
  // 5. Subsequent drop to TP1 (1:2)
  candlesLTF[60].low = 110;

  const summary = runSsrBacktest({
    symbol: 'BTCUSDT',
    candlesHTF,
    candlesLTF,
    riskPerTradeUsdt: 100,
    accountEquityUsdt: 10000,
  });

  assert.ok(summary.id.startsWith('ssr-backtest-'));
  assert.strictEqual(summary.symbol, 'BTCUSDT');
  assert.ok(typeof summary.winRate === 'number');
  assert.ok(typeof summary.profitFactor === 'number');
  assert.ok(typeof summary.profitPercentEquity === 'number');
  assert.ok(summary.verdictTitle.length > 0);
  assert.ok(typeof summary.isStrategySuccess === 'boolean');
});

test('scanSsrAssetStatus classifies phase correctly across market regimes', () => {
  const candlesHTF = createMockCandles(40, 100, 1, 3600000);
  candlesHTF[15].high = 160;
  candlesHTF[15].close = 155;
  candlesHTF[25].low = 80;
  candlesHTF[25].close = 85;

  // Case 1: Inside Range (no recent sweep)
  const rangeCandles = createMockCandles(40, 110, 0.1, 300000);
  const statusRange = scanSsrAssetStatus(candlesHTF, rangeCandles, 'SOLUSDT', 100);
  assert.strictEqual(statusRange.symbol, 'SOLUSDT');
  assert.strictEqual(statusRange.phase, 'INSIDE_RANGE');
  assert.ok(statusRange.nearestBsl && statusRange.nearestBsl >= 160);
  assert.ok(statusRange.nearestSsl && statusRange.nearestSsl <= 80);

  // Case 2: Phase 1 Liquidity Sweep (BSL pierced and rejected, but no MSS displacement)
  const ltfBaseTime = 1730000000000 + 30 * 3600000;
  const sweepCandles: Candle[] = [];
  for (let i = 0; i < 40; i++) {
    const time = ltfBaseTime + i * 300000;
    sweepCandles.push({
      time,
      open: 155,
      high: 156,
      low: 154,
      close: 155,
      volume: 1000,
      quoteVolume: 155000,
    });
  }
  // Inject BSL sweep at recent bar (within last 8 bars: index 35)
  sweepCandles[35].high = 162; // sweeps 160
  sweepCandles[35].close = 158;
  sweepCandles[39].close = 157; // closed below 160
  const statusSweep = scanSsrAssetStatus(candlesHTF, sweepCandles, 'ETHUSDT', 100);
  assert.strictEqual(statusSweep.symbol, 'ETHUSDT');
  assert.ok(statusSweep.phase === 'PHASE_1_SWEEP' || statusSweep.phase === 'PHASE_2_MSS');
  assert.strictEqual(statusSweep.liquidityPoolType, 'BSL');
});
