import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateATR,
  analyzeMarketStructure,
  analyzeOrderBookDepth,
  synthesizeQuantSignal,
  evaluateAlerts,
  type Candle,
  type PriceAlert,
  type CryptoTicker,
} from './quant.ts';

test('calculateSMA computes accurate simple moving averages and leading nulls', () => {
  const prices = [10, 20, 30, 40, 50];
  const sma3 = calculateSMA(prices, 3);
  assert.deepEqual(sma3, [null, null, 20, 30, 40]);
});

test('calculateEMA computes accurate exponential moving averages', () => {
  const prices = [10, 12, 14, 16, 18, 20];
  const ema3 = calculateEMA(prices, 3);
  assert.equal(ema3[0], null);
  assert.equal(ema3[1], null);
  assert.equal(ema3[2], 12); // initial seed average of 10, 12, 14
  assert.ok((ema3[5] as number) > 17 && (ema3[5] as number) <= 20);
});

test('calculateRSI returns bounded 0-100 momentum values', () => {
  const uptrend = Array.from({ length: 25 }, (_, i) => 100 + i * 2);
  const rsiUp = calculateRSI(uptrend, 14);
  assert.equal(rsiUp, 100);

  const mixed = [100, 102, 101, 104, 103, 106, 104, 108, 107, 110, 108, 112, 111, 115, 113, 116];
  const rsiMixed = calculateRSI(mixed, 14);
  assert.ok(rsiMixed > 50 && rsiMixed < 90);
});

test('analyzeMarketStructure detects previous trend, current trend, and structure breaks', () => {
  // Construct 60 candles that start in a downtrend and then break upward (Bullish CHoCH)
  const candles: Candle[] = [];
  for (let i = 0; i < 60; i++) {
    const base = i < 30 ? 120 - i * 0.8 : 96 + (i - 30) * 1.4;
    candles.push({
      time: 1700000000000 + i * 3600000,
      open: base - 0.5,
      high: base + 1.5,
      low: base - 1.5,
      close: base + 0.8,
      volume: 1000 + i * 25,
      quoteVolume: (1000 + i * 25) * base,
    });
  }

  const report = analyzeMarketStructure(candles);
  assert.equal(report.previousTrend, 'DOWNTREND');
  assert.equal(report.currentTrend, 'UPTREND');
  assert.equal(report.structureState, 'CHOCH_BULLISH');
  assert.ok(report.atr > 0);
  assert.ok(report.sma20Current !== null);
  assert.ok(report.ema50Current !== null);
});

test('analyzeOrderBookDepth calculates bid/ask walls and imbalance percentage', () => {
  const bids: [string, string][] = [
    ['100.0', '50'], // $5,000
    ['99.5', '120'], // $11,940
  ];
  const asks: [string, string][] = [
    ['100.5', '20'], // $2,010
    ['101.0', '30'], // $3,030
  ];

  const depth = analyzeOrderBookDepth(bids, asks, 100);
  assert.equal(depth.bestBid, 100.0);
  assert.equal(depth.bestAsk, 100.5);
  assert.ok(depth.imbalancePercent > 30);
  assert.equal(depth.pressureState, 'STRONG_BUY_WALL');
  assert.equal(depth.majorBidWall.price, 99.5);
});

test('synthesizeQuantSignal produces complete risk/reward levels and rationale', () => {
  const candles: Candle[] = Array.from({ length: 60 }, (_, i) => {
    const p = 200 + i * 1.5;
    return {
      time: 1700000000000 + i * 3600000,
      open: p - 1,
      high: p + 2,
      low: p - 2,
      close: p + 1,
      volume: 5000,
      quoteVolume: 5000 * p,
    };
  });
  const depth = analyzeOrderBookDepth([['290', '100']], [['291', '20']], 290);
  const signal = synthesizeQuantSignal({
    symbol: 'SOLUSDT',
    price: 290,
    change24h: 8.4,
    candles,
    orderBook: depth,
  });

  assert.equal(signal.symbol, 'SOLUSDT');
  assert.equal(signal.direction, 'LONG');
  assert.ok(signal.takeProfit2 > signal.takeProfit1);
  assert.ok(signal.stopLoss < signal.entryZone.optimal);
  assert.ok(signal.riskRewardRatio > 1.2);
});

test('evaluateAlerts triggers matching percentage change and price alerts', () => {
  const alerts: PriceAlert[] = [
    {
      id: 'a1',
      symbol: 'BTCUSDT',
      condition: 'PCT_CHANGE_ABOVE',
      threshold: 5.0,
      createdAt: '2026-10-16T00:00:00Z',
      triggered: false,
    },
  ];
  const tickers: CryptoTicker[] = [
    {
      symbol: 'BTCUSDT',
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      lastPrice: 92400,
      priceChange: 5200,
      priceChangePercent: 6.12,
      highPrice: 93000,
      lowPrice: 87000,
      volume: 42000,
      quoteVolume: 3800000000,
      weightedAvgPrice: 90100,
      count: 950000,
      volatilityRatio: 6.89,
      volumeSpikeScore: 92,
    },
  ];

  const { updatedAlerts, newlyTriggered } = evaluateAlerts(alerts, tickers);
  assert.equal(updatedAlerts[0].triggered, true);
  assert.equal(newlyTriggered.length, 1);
  assert.equal(newlyTriggered[0].symbol, 'BTCUSDT');
});
