/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert';
import {
  convertFractalSignalToUnified,
  convertTradingSignalToUnified,
  SEED_UNIFIED_SIGNALS,
  getSignalDedupKey,
  deleteSignalFromStorage,
  purgeInactiveSignalsFromStorage,
  parseSignalTimestamp,
  evaluateSignalsAgainstMarketPrices,
  calculatePositionSizeAndRisk,
  isHighGradeSignal,
  syncAndMergeAllSignals,
  formatSignalDateTime,
  type UnifiedSignal,
} from './signals';
import type { FractalTradeSignal } from './fractal';
import type { TradingSignal } from './quant';

test('convertFractalSignalToUnified sets aiUsed=false and identifies Williams Fractal strategy', () => {
  const mockFractalSig: FractalTradeSignal = {
    id: 'test-fractal-1',
    symbol: 'SOLUSDT',
    timestamp: Date.now(),
    timeString: '10:15:00',
    direction: 'LONG',
    setupType: '4H_LOW_SWEEP_BULLISH_ENGULF',
    timeframe: '5m',
    fourHourLevel: 210.5,
    fourHourLevelType: '4H_SWING_LOW',
    entryPrice: 212.0,
    stopLoss: 209.5,
    riskAmount: 2.5,
    riskPercent: 1.18,
    tp1: 217.0,
    tp2: 219.5,
    tp3: 222.0,
    tp1Ratio: 2.0,
    tp2Ratio: 3.0,
    tp3Ratio: 4.0,
    tp1Allocation: 0.5,
    tp2Allocation: 0.25,
    tp3Allocation: 0.25,
    strongnessScore: 90,
    strongnessTier: 'A+',
    strongnessFactors: ['4H Level Swept', 'Bullish Engulfing'],
    status: 'ACTIVE',
  };

  const unified = convertFractalSignalToUnified(mockFractalSig);

  assert.strictEqual(unified.strategyId, 'WILLIAMS_FRACTAL_SWEEP');
  assert.strictEqual(unified.strategyName, 'Williams Fractal 4H Sweep + Reversal');
  assert.strictEqual(unified.aiUsed, false, 'Williams Fractal strategy must be flagged as NO AI');
  assert.strictEqual(unified.aiCreditsConsumed, 0, 'Algorithmic strategy consumes 0 credits');
  assert.strictEqual(unified.entryPrice, 212.0);
  assert.strictEqual(unified.tp1, 217.0);
  assert.strictEqual(unified.tp2, 219.5);
  assert.strictEqual(unified.tp3, 222.0);
});

test('convertTradingSignalToUnified distinguishes between Kie.ai Live and Algorithmic Quant baseline', () => {
  const kieLiveSignal: TradingSignal = {
    symbol: 'BTCUSDT',
    timestamp: new Date().toISOString(),
    provider: 'Kie.ai Automated Engine',
    modelUsed: 'kie.ai / gpt-5.2',
    kieTaskId: 'chatcmpl-test-123',
    kieCredits: 0.33,
    kieLive: true,
    direction: 'LONG',
    confidence: 84,
    entryZone: { min: 91000, max: 91500, optimal: 91250 },
    stopLoss: 89800,
    takeProfit1: 93500,
    takeProfit2: 95000,
    riskRewardRatio: 2.45,
    InvalidationLevel: 89800,
    recommendedLeverage: '3x - 5x',
    summaryHeadline: 'Bullish Continuation with High Bid Wall',
    technicalThesis: 'Moving averages aligned.',
    structureRationale: 'BOS Bullish intact.',
    orderBookInsight: 'Strong bid wall below.',
    keyFactors: ['Factor 1', 'Factor 2'],
  };

  const unifiedKie = convertTradingSignalToUnified(kieLiveSignal);
  assert.strictEqual(unifiedKie.strategyId, 'KIE_AI_THESIS');
  assert.strictEqual(unifiedKie.aiUsed, true, 'Kie.ai live signal must be flagged as AI Used: YES');
  assert.strictEqual(unifiedKie.aiCreditsConsumed, 0.33);
  assert.strictEqual(unifiedKie.aiModel, 'kie.ai / gpt-5.2');
  assert.strictEqual(unifiedKie.aiTaskId, 'chatcmpl-test-123');

  const quantBaselineSignal: TradingSignal = {
    ...kieLiveSignal,
    provider: 'Quantitative Technical Engine',
    modelUsed: 'Instant Quant Engine',
    kieLive: false,
    kieCredits: undefined,
  };

  const unifiedQuant = convertTradingSignalToUnified(quantBaselineSignal);
  assert.strictEqual(unifiedQuant.strategyId, 'QUANT_STRUCTURE_DEPTH');
  assert.strictEqual(unifiedQuant.aiUsed, false, 'Instant Quant signal must be flagged as AI Used: NO');
  assert.strictEqual(unifiedQuant.aiCreditsConsumed, 0);
});

test('SEED_UNIFIED_SIGNALS contains both AI-decided and Non-AI algorithmic signals', () => {
  assert.ok(SEED_UNIFIED_SIGNALS.length >= 5);
  const aiDecided = SEED_UNIFIED_SIGNALS.filter((s) => s.aiUsed);
  const algoDecided = SEED_UNIFIED_SIGNALS.filter((s) => !s.aiUsed);

  assert.ok(aiDecided.length > 0, 'Seed list must contain AI-decided signals');
  assert.ok(algoDecided.length > 0, 'Seed list must contain Non-AI algorithmic signals');

  // Verify exact signals from user's screenshot are included in Centralized Repository
  const lsk = SEED_UNIFIED_SIGNALS.find((s) => s.symbol === 'LSKUSDT');
  assert.ok(lsk, 'LSKUSDT from user screenshot must be present');
  assert.strictEqual(lsk.entryPrice, 0.2936);
  assert.strictEqual(lsk.direction, 'SHORT');
  assert.strictEqual(lsk.aiUsed, false, 'LSKUSDT is a pure algorithmic setup (0 credits)');

  const sol = SEED_UNIFIED_SIGNALS.filter((s) => s.symbol === 'SOLUSDT');
  assert.ok(sol.length >= 1, 'High-grade SOLUSDT setup must be present');

  // Verify strict institutional quality standard: no low-grade (Tier B+ or <72%) signals allowed in seed list
  const lowGradeSeeds = SEED_UNIFIED_SIGNALS.filter(
    (s) => s.strongnessTier === 'B+' || (s.confidenceScore ?? 0) < 72
  );
  assert.strictEqual(
    lowGradeSeeds.length,
    0,
    'SEED_UNIFIED_SIGNALS must not contain any low-grade (Tier B+) signals'
  );
});

test('getSignalDedupKey collapses identical setups regardless of synthetic or internal ID differences', () => {
  const sigA = {
    symbol: 'LSKUSDT',
    direction: 'LONG',
    entryPrice: 0.949,
    strategyId: 'WILLIAMS_FRACTAL_SWEEP',
  };
  const sigB = {
    symbol: 'lskusdt ',
    direction: 'long',
    entryPrice: 0.9490001,
    strategyId: 'WILLIAMS_FRACTAL_SWEEP',
  };
  assert.strictEqual(getSignalDedupKey(sigA), getSignalDedupKey(sigB));
});

test('convertFractalSignalToUnified updates historical/stale setups from ACTIVE to STOPPED_OUT', () => {
  const staleHistoricalSig: FractalTradeSignal = {
    id: 'historical-sol',
    symbol: 'SOLUSDT',
    timestamp: Date.now() - 48 * 3600 * 1000, // 48h old
    timeString: '21 Oct, 10:00 pm',
    direction: 'SHORT',
    setupType: '4H_HIGH_SWEEP_BEARISH_ENGULF',
    timeframe: '5m',
    fourHourLevel: 108.6,
    fourHourLevelType: '4H_SWING_HIGH',
    entryPrice: 108.41,
    stopLoss: 108.6,
    riskAmount: 0.19,
    riskPercent: 0.18,
    tp1: 108.02,
    tp2: 107.83,
    tp3: 107.64,
    tp1Ratio: 2.0,
    tp2Ratio: 3.0,
    tp3Ratio: 4.0,
    tp1Allocation: 0.5,
    tp2Allocation: 0.25,
    tp3Allocation: 0.25,
    strongnessScore: 60,
    strongnessTier: 'B+',
    strongnessFactors: [],
    status: 'ACTIVE', // Incorrect historical state
  };

  const unified = convertFractalSignalToUnified(staleHistoricalSig);
  assert.strictEqual(unified.status, 'STOPPED_OUT', 'Stale 5m signals older than 24h must be STOPPED_OUT');
  assert.strictEqual(unified.realizedR, -1.0);
  assert.strictEqual(unified.exitPrice, 108.6);
});

test('deleteSignalFromStorage and purgeInactiveSignalsFromStorage remove targeted signals', () => {
  const mockSignals: UnifiedSignal[] = [
    { ...SEED_UNIFIED_SIGNALS[0], id: 'active-1', status: 'ACTIVE' },
    { ...SEED_UNIFIED_SIGNALS[1], id: 'stopped-1', status: 'STOPPED_OUT' },
    { ...SEED_UNIFIED_SIGNALS[2], id: 'stopped-2', status: 'STOPPED_OUT' },
  ];

  const afterDelete = deleteSignalFromStorage('stopped-1', mockSignals);
  assert.strictEqual(afterDelete.length, 2);
  assert.ok(!afterDelete.some((s) => s.id === 'stopped-1'));

  const afterPurge = purgeInactiveSignalsFromStorage(mockSignals);
  assert.strictEqual(afterPurge.length, 1);
  assert.strictEqual(afterPurge[0].id, 'active-1');
  assert.strictEqual(afterPurge[0].status, 'ACTIVE');
});

test('parseSignalTimestamp resolves dates correctly and sorts Old to New', () => {
  const sigOld1 = { timeString: '21 Oct, 09:10 pm' };
  const sigOld2 = { timeString: '21 Oct, 10:00 pm' };
  const sigRecent1 = { timeString: '31 Oct, 09:55 pm' };
  const sigRecent2 = { timeString: '11:29:11 pm' };

  const tOld1 = parseSignalTimestamp(sigOld1);
  const tOld2 = parseSignalTimestamp(sigOld2);
  const tRecent1 = parseSignalTimestamp(sigRecent1);
  const tRecent2 = parseSignalTimestamp(sigRecent2);

  // 21 Oct 09:10 pm < 21 Oct 10:00 pm < 31 Oct 09:55 pm < 31 Oct 11:29:11 pm
  assert.ok(tOld1 < tOld2, '21 Oct 09:10 pm must be earlier than 21 Oct 10:00 pm');
  assert.ok(tOld2 < tRecent1, '21 Oct setups must be earlier than 31 Oct setups');
  assert.ok(tRecent1 < tRecent2, '09:55 pm must be earlier than 11:29:11 pm');

  const unsorted = [sigRecent2, sigOld2, sigRecent1, sigOld1];
  const sortedOldToNew = [...unsorted].sort((a, b) => parseSignalTimestamp(a) - parseSignalTimestamp(b));

  assert.strictEqual(sortedOldToNew[0].timeString, '21 Oct, 09:10 pm');
  assert.strictEqual(sortedOldToNew[1].timeString, '21 Oct, 10:00 pm');
  assert.strictEqual(sortedOldToNew[2].timeString, '31 Oct, 09:55 pm');
  assert.strictEqual(sortedOldToNew[3].timeString, '11:29:11 pm');
});

test('evaluateSignalsAgainstMarketPrices transitions ACTIVE signals to STOPPED_OUT or HIT_TP based on live market prices', () => {
  const liveSignals: UnifiedSignal[] = [
    {
      ...SEED_UNIFIED_SIGNALS[0],
      id: 'test-sol-short',
      symbol: 'SOLUSDT',
      direction: 'SHORT',
      entryPrice: 215.2,
      stopLoss: 219.1,
      tp1: 207.4,
      tp2: 203.5,
      tp3: 199.6,
      status: 'ACTIVE',
    },
    {
      ...SEED_UNIFIED_SIGNALS[0],
      id: 'test-btc-long',
      symbol: 'BTCUSDT',
      direction: 'LONG',
      entryPrice: 91480,
      stopLoss: 89888.25,
      tp1: 93785.3,
      tp2: 95431.94,
      tp3: 97100,
      status: 'ACTIVE',
    },
    {
      ...SEED_UNIFIED_SIGNALS[0],
      id: 'test-sol-live',
      symbol: 'SOLUSDT',
      direction: 'SHORT',
      entryPrice: 95.39,
      stopLoss: 96.5,
      tp1: 93.17,
      tp2: 92.06,
      tp3: 90.95,
      status: 'ACTIVE',
    },
  ];

  const marketTickers = [
    { symbol: 'SOLUSDT', lastPrice: 95.36, highPrice: 96.44, lowPrice: 95.23 },
    { symbol: 'BTCUSDT', lastPrice: 77972.19, highPrice: 78068, lowPrice: 77262.72 },
  ];

  const { updatedSignals, hasChanges } = evaluateSignalsAgainstMarketPrices(liveSignals, marketTickers);
  assert.strictEqual(hasChanges, true);

  // SOL short from 215.20 dropped to 95.36 -> Hit TP3 / targets hit
  const solHistorical = updatedSignals.find((s) => s.id === 'test-sol-short')!;
  assert.strictEqual(solHistorical.status, 'HIT_TP3');
  assert.strictEqual(solHistorical.realizedR, 4.0);

  // BTC long from 91,480 dropped to 77,972 (below stop loss 89,888.25) -> Stopped Out
  const btcSetup = updatedSignals.find((s) => s.id === 'test-btc-long')!;
  assert.strictEqual(btcSetup.status, 'STOPPED_OUT');
  assert.strictEqual(btcSetup.realizedR, -1.0);

  // Fresh SOL short from 95.39 at market 95.36 (between SL 96.50 and TP1 93.17) -> Stays ACTIVE
  const solLive = updatedSignals.find((s) => s.id === 'test-sol-live')!;
  assert.strictEqual(solLive.status, 'ACTIVE');
});

test('LSKUSDT and SOLUSDT setups from screenshots evaluate to true TradingView outcomes', () => {
  const lskSeed = SEED_UNIFIED_SIGNALS.find((s) => s.symbol === 'LSKUSDT')!;
  assert.strictEqual(lskSeed.status, 'HIT_TP2', 'LSKUSDT must be HIT_TP2, matching the +22.62% win');
  assert.strictEqual(lskSeed.realizedR, 2.25);
  assert.strictEqual(lskSeed.exitPrice, 0.225184);

  // Verify SOL live active setup at market price 95.70 stays ACTIVE
  const solSeed = SEED_UNIFIED_SIGNALS.find((s) => s.id === 'live-active-solusdt')!;
  const { updatedSignals } = evaluateSignalsAgainstMarketPrices([solSeed], [
    { symbol: 'SOLUSDT', lastPrice: 95.70, highPrice: 96.58, lowPrice: 95.20 }
  ]);
  const solResult = updatedSignals[0];
  assert.strictEqual(solResult.status, 'ACTIVE', 'SOLUSDT at 95.70 with SL 96.50 must remain ACTIVE');
});

test('evaluateSignalsAgainstMarketPrices and healUnifiedSignal heal corrupted signals from localStorage', () => {
  // Simulate corrupt LSK signal saved in localStorage as STOPPED_OUT
  const corruptLsk: UnifiedSignal = {
    ...SEED_UNIFIED_SIGNALS[1],
    id: 'fractal-lskusdt-screenshot-1',
    symbol: 'LSKUSDT',
    direction: 'SHORT',
    entryPrice: 0.2936,
    stopLoss: 0.316416,
    tp1: 0.247968,
    tp2: 0.225184,
    status: 'STOPPED_OUT',
    failureReason: 'Hit Stop Loss at $0.31642 (24h High $0.3189)',
    currentPrice: 0.2272,
    pnlPercent: 22.62,
  };

  // Simulate corrupt SOL signal saved in localStorage as STOPPED_OUT
  const corruptSol: UnifiedSignal = {
    ...SEED_UNIFIED_SIGNALS[0],
    id: 'live-active-solusdt',
    symbol: 'SOLUSDT',
    direction: 'SHORT',
    entryPrice: 95.39,
    stopLoss: 96.5,
    status: 'STOPPED_OUT',
    failureReason: 'Hit Stop Loss at $96.5000 (Market rose to $95.7000)',
    currentPrice: 95.70,
    pnlPercent: -0.32,
  };

  const { updatedSignals } = evaluateSignalsAgainstMarketPrices(
    [corruptLsk, corruptSol],
    [
      { symbol: 'LSKUSDT', lastPrice: 0.2272 },
      { symbol: 'SOLUSDT', lastPrice: 95.70 },
    ]
  );

  const healedLsk = updatedSignals.find((s) => s.symbol === 'LSKUSDT')!;
  assert.strictEqual(healedLsk.status, 'HIT_TP2', 'Corrupt LSK stopped out must be healed to HIT_TP2');
  assert.strictEqual(healedLsk.realizedR, 2.25);

  const healedSol = updatedSignals.find((s) => s.symbol === 'SOLUSDT')!;
  assert.strictEqual(healedSol.status, 'ACTIVE', 'Corrupt SOL stopped out must be healed to ACTIVE');
  assert.strictEqual(healedSol.failureReason, undefined);
});

test('calculatePositionSizeAndRisk calculates exact position quantity, margin, liquidation, and target gains', () => {
  // Test case matching user's SOLUSDT Short setup from screenshot:
  // Entry: $95.39, SL: $96.50, TP1: $93.17, TP2: $92.06
  // Loss amount: $50 fixed loss, Leverage: 10x
  const solCalc = calculatePositionSizeAndRisk({
    direction: 'SHORT',
    entryPrice: 95.39,
    stopLoss: 96.50,
    lossAmount: 50,
    leverage: 10,
    tp1: 93.17,
    tp2: 92.06,
  });

  assert.strictEqual(solCalc.priceDistanceSL, 1.11, 'SL distance should be $1.11 per SOL');
  assert.strictEqual(solCalc.priceDistanceSLPercent, 1.164, 'SL percent should be 1.164%');
  // 50 / 1.11 = 45.045
  assert.ok(Math.abs(solCalc.positionQuantity - 45.045) < 0.01, 'Quantity should be ~45.045 SOL');
  // Value: 45.045 * 95.39 = $4296.84
  assert.ok(Math.abs(solCalc.positionValueUSD - 4296.84) < 1.0, 'Position value should be ~$4,296.84');
  // Margin at 10x = $429.68
  assert.ok(Math.abs(solCalc.requiredMargin - 429.68) < 0.5, 'Margin should be ~$429.68');
  // Loss at SL should be exactly 50 dollar loss
  assert.strictEqual(solCalc.isLiquidationSafe, true, 'At 10x, liquidation should be well above SL 96.50');
  // Target gains:
  // TP1: 45.045 * 2.22 = $100 (2.0R)
  assert.ok(Math.abs(solCalc.tp1GainUSD - 100.0) < 0.5, 'TP1 gain should be ~$100.00');
  assert.strictEqual(solCalc.tp1RMultiple, 2.0);
  // TP2: 45.045 * 3.33 = $150 (3.0R)
  assert.ok(Math.abs(solCalc.tp2GainUSD - 150.0) < 0.5, 'TP2 gain should be ~$150.00');
  assert.strictEqual(solCalc.tp2RMultiple, 3.0);
});

test('calculatePositionSizeAndRisk warns when leverage causes liquidation before stop loss', () => {
  // If leverage is 100x on 1.16% SL, liquidation price is closer than Stop Loss!
  const dangerousCalc = calculatePositionSizeAndRisk({
    direction: 'SHORT',
    entryPrice: 95.39,
    stopLoss: 96.50,
    lossAmount: 50,
    leverage: 100,
  });

  assert.strictEqual(dangerousCalc.isLiquidationSafe, false, '100x leverage on 1.16% SL must trigger liquidation warning');
  assert.ok(dangerousCalc.maxLeverageBeforeLiquidation < 90, 'Max safe leverage should be ~85x');
});

test('isHighGradeSignal only accepts Tier A / A+ (score >= 72) and rejects Tier B+ or score < 72', () => {
  assert.strictEqual(
    isHighGradeSignal({ strongnessTier: 'A+', confidenceScore: 90 }),
    true,
    'Tier A+ (90%) must be accepted'
  );
  assert.strictEqual(
    isHighGradeSignal({ strongnessTier: 'A', confidenceScore: 78 }),
    true,
    'Tier A (78%) must be accepted'
  );
  assert.strictEqual(
    isHighGradeSignal({ strongnessTier: 'B+', confidenceScore: 65 }),
    false,
    'Tier B+ (65%) must be rejected'
  );
  assert.strictEqual(
    isHighGradeSignal({ strongnessTier: 'B+', confidenceScore: 57 }),
    false,
    'Tier B+ (57%) must be rejected'
  );
  assert.strictEqual(
    isHighGradeSignal({ strongnessTier: 'A', confidenceScore: 68 }),
    false,
    'Score < 72 must be rejected even if tier was A'
  );
});

test('syncAndMergeAllSignals strictly purges low-grade Tier B+ setups and maintains high-grade repository', () => {
  const merged = syncAndMergeAllSignals();
  assert.ok(merged.length > 0, 'Merged signals list should not be empty');

  // Verify that not a single signal in the returned list is Tier B+ or below 72%
  const lowGradePresent = merged.filter(
    (s) => s.strongnessTier === 'B+' || (s.confidenceScore ?? 0) < 72
  );
  assert.strictEqual(
    lowGradePresent.length,
    0,
    'No low-grade (Tier B+ / <72%) signals may be surfaced in the repository'
  );

  // All signals must be Tier A or Tier A+
  for (const s of merged) {
    assert.ok(
      s.strongnessTier === 'A' || s.strongnessTier === 'A+',
      `Signal ${s.id} (${s.symbol}) must be Tier A or A+, got: ${s.strongnessTier}`
    );
    assert.ok(
      (s.confidenceScore ?? 0) >= 72,
      `Signal ${s.id} (${s.symbol}) must have score >= 72%, got: ${s.confidenceScore}`
    );
  }
});

test('formatSignalDateTime produces both Date and Time across all signal input types', () => {
  // Test with time-only strings from screenshot:
  const dt1 = formatSignalDateTime({ timeString: '11:29:11 pm' });
  assert.ok(dt1.includes('pm'), 'Must contain am/pm');
  assert.ok(/\d{1,2}\s+[A-Za-z]{3},\s*\d{2}:\d{2}\s*pm/.test(dt1), `Must match "D MMM, hh:mm pm", got: ${dt1}`);

  const dt2 = formatSignalDateTime({ timeString: '10:27 pm' });
  assert.ok(/\d{1,2}\s+[A-Za-z]{3},\s*10:27\s*pm/.test(dt2), `Must format 10:27 pm with date, got: ${dt2}`);

  // Test with existing date string:
  const dt3 = formatSignalDateTime({ timeString: '31 Oct, 09:55 pm' });
  assert.strictEqual(dt3, '31 Oct, 09:55 pm');

  // Test with numeric timestamp:
  const fixedTs = new Date(2026, 10, 1, 18, 59).getTime(); // 1 Nov 2026 18:59
  const dt4 = formatSignalDateTime(fixedTs);
  assert.strictEqual(dt4, '1 Nov, 06:59 pm');

  // Test with UnifiedSignal object:
  const sigObj: Partial<UnifiedSignal> = {
    timestamp: fixedTs,
    timeString: '18:59:00',
  };
  assert.strictEqual(formatSignalDateTime(sigObj), '1 Nov, 06:59 pm');
});





