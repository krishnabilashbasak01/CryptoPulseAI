export interface Candle {
  time: number; // Unix timestamp in ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
}

export interface CryptoTicker {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  lastPrice: number;
  priceChange: number;
  priceChangePercent: number;
  highPrice: number;
  lowPrice: number;
  volume: number;
  quoteVolume: number; // 24h USDT volume
  weightedAvgPrice: number;
  count: number; // trade count
  volatilityRatio: number; // (high - low) / low * 100
  volumeSpikeScore: number; // relative liquidity velocity score
}

export interface StructureEvent {
  index: number;
  time: number;
  price: number;
  type: 'BOS_BULL' | 'BOS_BEAR' | 'CHOCH_BULL' | 'CHOCH_BEAR' | 'SWING_HIGH' | 'SWING_LOW';
  label: string;
}

export interface MarketStructureReport {
  previousTrend: 'UPTREND' | 'DOWNTREND' | 'RANGING';
  currentTrend: 'UPTREND' | 'DOWNTREND' | 'RANGING';
  structureState: 'BOS_BULLISH' | 'BOS_BEARISH' | 'CHOCH_BULLISH' | 'CHOCH_BEARISH' | 'CONSOLIDATION';
  structureLabel: string;
  structureDescription: string;
  lastSwingHigh: number;
  lastSwingLow: number;
  prevSwingHigh: number;
  prevSwingLow: number;
  nearestSupport: number;
  nearestResistance: number;
  maAlignment: 'BULLISH_STACK' | 'BEARISH_STACK' | 'MIXED_CROSS';
  sma20Current: number | null;
  ema50Current: number | null;
  ema200Current: number | null;
  rsi14: number;
  atr: number;
  atrPercent: number;
  volatilityRegime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME';
  events: StructureEvent[];
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  totalUsdt: number;
  cumulativeUsdt: number;
  depthPercent: number;
}

export interface OrderBookAnalysis {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  bestBid: number;
  bestAsk: number;
  spreadAbs: number;
  spreadPercent: number;
  totalBidUsdt: number;
  totalAskUsdt: number;
  imbalancePercent: number; // -100 (all asks) to +100 (all bids)
  pressureState: 'STRONG_BUY_WALL' | 'BUY_LEAN' | 'BALANCED' | 'SELL_LEAN' | 'STRONG_SELL_WALL';
  majorBidWall: { price: number; usdt: number };
  majorAskWall: { price: number; usdt: number };
}

export interface TradingSignal {
  symbol: string;
  timestamp: string;
  provider: 'Kie.ai Automated Engine' | 'Kie.ai + Gemini Hybrid' | 'Quantitative Technical Engine';
  modelUsed: string;
  kieTaskId?: string;
  kieCredits?: number;
  kieLive?: boolean;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL_WAIT';
  confidence: number; // 0 - 100
  entryZone: { min: number; max: number; optimal: number };
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskRewardRatio: number;
  InvalidationLevel: number;
  recommendedLeverage: string;
  summaryHeadline: string;
  technicalThesis: string;
  structureRationale: string;
  orderBookInsight: string;
  keyFactors: string[];
}

export interface PriceAlert {
  id: string;
  symbol: string;
  condition: 'PCT_CHANGE_ABOVE' | 'PCT_CHANGE_BELOW' | 'PRICE_ABOVE' | 'PRICE_BELOW' | 'VOLATILITY_ABOVE';
  threshold: number;
  createdAt: string;
  triggered: boolean;
  triggeredAt?: string;
  triggeredValue?: number;
  note?: string;
}

export interface TriggeredAlertEvent {
  id: string;
  alertId: string;
  symbol: string;
  message: string;
  timestamp: string;
  severity: 'BULLISH' | 'BEARISH' | 'VOLATILITY';
}

export function calculateSMA(values: number[], period: number): (number | null)[] {
  if (period <= 0) return values.map(() => null);
  const result: (number | null)[] = [];
  let windowSum = 0;
  for (let i = 0; i < values.length; i++) {
    windowSum += values[i];
    if (i >= period) {
      windowSum -= values[i - period];
    }
    if (i >= period - 1) {
      result.push(Number((windowSum / period).toFixed(6)));
    } else {
      result.push(null);
    }
  }
  return result;
}

export function calculateEMA(values: number[], period: number): (number | null)[] {
  if (period <= 0 || values.length === 0) return values.map(() => null);
  const result: (number | null)[] = [];
  const k = 2 / (period + 1);
  let ema: number | null = null;
  let sum = 0;

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      sum += values[i];
      result.push(null);
    } else if (i === period - 1) {
      sum += values[i];
      ema = sum / period;
      result.push(Number(ema.toFixed(6)));
    } else {
      ema = values[i] * k + (ema as number) * (1 - k);
      result.push(Number(ema.toFixed(6)));
    }
  }
  return result;
}

export function calculateRSI(closes: number[], period = 14): number {
  if (closes.length <= period) return 50;
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

export function calculateATR(
  candles: Candle[],
  period = 14
): { atr: number; atrPercent: number; volatilityRegime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME' } {
  if (candles.length === 0) {
    return { atr: 0, atrPercent: 0, volatilityRegime: 'LOW' };
  }
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (i === 0) {
      trs.push(c.high - c.low);
    } else {
      const prevClose = candles[i - 1].close;
      const tr = Math.max(
        c.high - c.low,
        Math.abs(c.high - prevClose),
        Math.abs(c.low - prevClose)
      );
      trs.push(tr);
    }
  }

  const slice = trs.slice(-Math.min(period, trs.length));
  const atr = slice.reduce((acc, v) => acc + v, 0) / slice.length;
  const lastClose = candles[candles.length - 1].close || 1;
  const atrPercent = Number(((atr / lastClose) * 100).toFixed(2));

  let volatilityRegime: 'LOW' | 'NORMAL' | 'HIGH' | 'EXTREME' = 'NORMAL';
  if (atrPercent < 0.8) volatilityRegime = 'LOW';
  else if (atrPercent < 2.2) volatilityRegime = 'NORMAL';
  else if (atrPercent < 4.5) volatilityRegime = 'HIGH';
  else volatilityRegime = 'EXTREME';

  return {
    atr: Number(atr.toFixed(6)),
    atrPercent,
    volatilityRegime,
  };
}

export function analyzeMarketStructure(candles: Candle[]): MarketStructureReport {
  if (candles.length < 10) {
    const fallbackPrice = candles[candles.length - 1]?.close ?? 100;
    return {
      previousTrend: 'RANGING',
      currentTrend: 'RANGING',
      structureState: 'CONSOLIDATION',
      structureLabel: 'Range Consolidation',
      structureDescription: 'Insufficient historical bars for multi-swing structure decomposition.',
      lastSwingHigh: fallbackPrice * 1.02,
      lastSwingLow: fallbackPrice * 0.98,
      prevSwingHigh: fallbackPrice * 1.02,
      prevSwingLow: fallbackPrice * 0.98,
      nearestSupport: fallbackPrice * 0.98,
      nearestResistance: fallbackPrice * 1.02,
      maAlignment: 'MIXED_CROSS',
      sma20Current: fallbackPrice,
      ema50Current: fallbackPrice,
      ema200Current: fallbackPrice,
      rsi14: 50,
      atr: fallbackPrice * 0.01,
      atrPercent: 1.0,
      volatilityRegime: 'NORMAL',
      events: [],
    };
  }

  const closes = candles.map((c) => c.close);
  const sma20Arr = calculateSMA(closes, 20);
  const ema50Arr = calculateEMA(closes, 50);
  const ema200Arr = calculateEMA(closes, Math.min(100, candles.length - 1));

  const lastIdx = candles.length - 1;
  const currentPrice = closes[lastIdx];
  const sma20Current = sma20Arr[lastIdx];
  const ema50Current = ema50Arr[lastIdx];
  const ema200Current = ema200Arr[lastIdx];

  // Detect 3-bar pivot swing highs and lows across the series
  const swingHighs: { index: number; price: number; time: number }[] = [];
  const swingLows: { index: number; price: number; time: number }[] = [];

  const lookback = 3;
  for (let i = lookback; i < candles.length - 2; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - lookback; j <= i + 2; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) swingHighs.push({ index: i, price: candles[i].high, time: candles[i].time });
    if (isLow) swingLows.push({ index: i, price: candles[i].low, time: candles[i].time });
  }

  // Fallback if smooth trend had fewer pivots
  const midIdx = Math.floor(candles.length / 2);
  const firstHalf = candles.slice(0, midIdx);
  const secondHalf = candles.slice(midIdx);

  const prevSwingHigh =
    swingHighs.length >= 2
      ? swingHighs[swingHighs.length - 2].price
      : Math.max(...firstHalf.map((c) => c.high));
  const lastSwingHigh =
    swingHighs.length >= 1
      ? swingHighs[swingHighs.length - 1].price
      : Math.max(...secondHalf.map((c) => c.high));

  const prevSwingLow =
    swingLows.length >= 2
      ? swingLows[swingLows.length - 2].price
      : Math.min(...firstHalf.map((c) => c.low));
  const lastSwingLow =
    swingLows.length >= 1
      ? swingLows[swingLows.length - 1].price
      : Math.min(...secondHalf.map((c) => c.low));

  // Determine previous trend from earlier half of candles
  const quarterIdx = Math.max(1, Math.floor(candles.length * 0.25));
  const threeQuarterIdx = Math.max(2, Math.floor(candles.length * 0.65));
  const earlyAvg =
    firstHalf.slice(0, quarterIdx).reduce((s, c) => s + c.close, 0) / quarterIdx;
  const midAvg =
    candles.slice(quarterIdx, threeQuarterIdx).reduce((s, c) => s + c.close, 0) /
    Math.max(1, threeQuarterIdx - quarterIdx);

  const earlyDeltaPct = ((midAvg - earlyAvg) / earlyAvg) * 100;
  let previousTrend: 'UPTREND' | 'DOWNTREND' | 'RANGING' = 'RANGING';
  if (earlyDeltaPct > 0.8) previousTrend = 'UPTREND';
  else if (earlyDeltaPct < -0.8) previousTrend = 'DOWNTREND';

  // Determine current trend & structure state (BOS vs CHoCH)
  let currentTrend: 'UPTREND' | 'DOWNTREND' | 'RANGING' = 'RANGING';
  let structureState: MarketStructureReport['structureState'] = 'CONSOLIDATION';
  let structureLabel = 'Range Equilibrium';
  let structureDescription = 'Price is rotating inside recent swing boundaries awaiting volume expansion.';

  const events: StructureEvent[] = [];

  if (swingHighs.length > 0) {
    const sh = swingHighs[swingHighs.length - 1];
    events.push({
      index: sh.index,
      time: sh.time,
      price: sh.price,
      type: 'SWING_HIGH',
      label: 'SH',
    });
  }
  if (swingLows.length > 0) {
    const sl = swingLows[swingLows.length - 1];
    events.push({
      index: sl.index,
      time: sl.time,
      price: sl.price,
      type: 'SWING_LOW',
      label: 'SL',
    });
  }

  if (currentPrice > lastSwingHigh || (lastSwingHigh > prevSwingHigh && currentPrice > prevSwingHigh)) {
    currentTrend = 'UPTREND';
    if (previousTrend === 'DOWNTREND') {
      structureState = 'CHOCH_BULLISH';
      structureLabel = 'Bullish CHoCH (Change of Character)';
      structureDescription =
        'Market shifted from prior bearish sequence by breaking above the lower-high pivot with momentum.';
      events.push({
        index: lastIdx,
        time: candles[lastIdx].time,
        price: lastSwingHigh,
        type: 'CHOCH_BULL',
        label: 'CHoCH ↑',
      });
    } else {
      structureState = 'BOS_BULLISH';
      structureLabel = 'Bullish BOS (Break of Structure)';
      structureDescription =
        'Continuation higher confirmed as price cleared the prior swing high resistance.';
      events.push({
        index: lastIdx,
        time: candles[lastIdx].time,
        price: lastSwingHigh,
        type: 'BOS_BULL',
        label: 'BOS ↑',
      });
    }
  } else if (currentPrice < lastSwingLow || (lastSwingLow < prevSwingLow && currentPrice < prevSwingLow)) {
    currentTrend = 'DOWNTREND';
    if (previousTrend === 'UPTREND') {
      structureState = 'CHOCH_BEARISH';
      structureLabel = 'Bearish CHoCH (Change of Character)';
      structureDescription =
        'Prior bullish structure invalidated after breaking below the higher-low demand zone.';
      events.push({
        index: lastIdx,
        time: candles[lastIdx].time,
        price: lastSwingLow,
        type: 'CHOCH_BEAR',
        label: 'CHoCH ↓',
      });
    } else {
      structureState = 'BOS_BEARISH';
      structureLabel = 'Bearish BOS (Break of Structure)';
      structureDescription =
        'Bearish trend continuation confirmed below key structural swing low support.';
      events.push({
        index: lastIdx,
        time: candles[lastIdx].time,
        price: lastSwingLow,
        type: 'BOS_BEAR',
        label: 'BOS ↓',
      });
    }
  } else if (sma20Current && ema50Current) {
    if (currentPrice > sma20Current && sma20Current > ema50Current) {
      currentTrend = 'UPTREND';
      structureState = previousTrend === 'DOWNTREND' ? 'CHOCH_BULLISH' : 'BOS_BULLISH';
      structureLabel =
        structureState === 'CHOCH_BULLISH' ? 'Bullish CHoCH (MA Reclaim)' : 'Bullish Structure Hold';
      structureDescription =
        'Price holds above ascending 20 SMA and 50 EMA dynamic support structure.';
    } else if (currentPrice < sma20Current && sma20Current < ema50Current) {
      currentTrend = 'DOWNTREND';
      structureState = previousTrend === 'UPTREND' ? 'CHOCH_BEARISH' : 'BOS_BEARISH';
      structureLabel =
        structureState === 'CHOCH_BEARISH' ? 'Bearish CHoCH (MA Breakdown)' : 'Bearish Structure Hold';
      structureDescription =
        'Price trades below descending 20 SMA and 50 EMA dynamic resistance.';
    }
  }

  let maAlignment: MarketStructureReport['maAlignment'] = 'MIXED_CROSS';
  if (
    sma20Current !== null &&
    ema50Current !== null &&
    ema200Current !== null
  ) {
    if (sma20Current > ema50Current && ema50Current >= ema200Current) {
      maAlignment = 'BULLISH_STACK';
    } else if (sma20Current < ema50Current && ema50Current <= ema200Current) {
      maAlignment = 'BEARISH_STACK';
    }
  }

  const nearestSupport = Math.min(lastSwingLow, prevSwingLow, currentPrice * 0.985);
  const nearestResistance = Math.max(lastSwingHigh, prevSwingHigh, currentPrice * 1.015);
  const rsi14 = calculateRSI(closes, 14);
  const { atr, atrPercent, volatilityRegime } = calculateATR(candles, 14);

  return {
    previousTrend,
    currentTrend,
    structureState,
    structureLabel,
    structureDescription,
    lastSwingHigh,
    lastSwingLow,
    prevSwingHigh,
    prevSwingLow,
    nearestSupport,
    nearestResistance,
    maAlignment,
    sma20Current,
    ema50Current,
    ema200Current,
    rsi14,
    atr,
    atrPercent,
    volatilityRegime,
    events,
  };
}

export function analyzeOrderBookDepth(
  rawBids: [string, string][],
  rawAsks: [string, string][],
  fallbackPrice = 100
): OrderBookAnalysis {
  const parsedBids = rawBids
    .slice(0, 15)
    .map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) }))
    .filter((x) => !Number.isNaN(x.price) && !Number.isNaN(x.quantity));

  const parsedAsks = rawAsks
    .slice(0, 15)
    .map(([p, q]) => ({ price: parseFloat(p), quantity: parseFloat(q) }))
    .filter((x) => !Number.isNaN(x.price) && !Number.isNaN(x.quantity));

  let cumBid = 0;
  let majorBidWall = { price: fallbackPrice * 0.995, usdt: 0 };
  const bidsTemp = parsedBids.map((b) => {
    const totalUsdt = b.price * b.quantity;
    cumBid += totalUsdt;
    if (totalUsdt > majorBidWall.usdt) {
      majorBidWall = { price: b.price, usdt: totalUsdt };
    }
    return { ...b, totalUsdt, cumulativeUsdt: cumBid, depthPercent: 0 };
  });

  let cumAsk = 0;
  let majorAskWall = { price: fallbackPrice * 1.005, usdt: 0 };
  const asksTemp = parsedAsks.map((a) => {
    const totalUsdt = a.price * a.quantity;
    cumAsk += totalUsdt;
    if (totalUsdt > majorAskWall.usdt) {
      majorAskWall = { price: a.price, usdt: totalUsdt };
    }
    return { ...a, totalUsdt, cumulativeUsdt: cumAsk, depthPercent: 0 };
  });

  const maxCumulative = Math.max(cumBid, cumAsk, 1);
  const bids: OrderBookLevel[] = bidsTemp.map((b) => ({
    ...b,
    depthPercent: Number(((b.cumulativeUsdt / maxCumulative) * 100).toFixed(1)),
  }));
  const asks: OrderBookLevel[] = asksTemp.map((a) => ({
    ...a,
    depthPercent: Number(((a.cumulativeUsdt / maxCumulative) * 100).toFixed(1)),
  }));

  const bestBid = bids[0]?.price ?? fallbackPrice * 0.9995;
  const bestAsk = asks[0]?.price ?? fallbackPrice * 1.0005;
  const spreadAbs = Math.max(0, bestAsk - bestBid);
  const spreadPercent = Number(((spreadAbs / ((bestAsk + bestBid) / 2 || 1)) * 100).toFixed(4));

  const totalLiquidity = cumBid + cumAsk || 1;
  const imbalancePercent = Number((((cumBid - cumAsk) / totalLiquidity) * 100).toFixed(1));

  let pressureState: OrderBookAnalysis['pressureState'] = 'BALANCED';
  if (imbalancePercent >= 25) pressureState = 'STRONG_BUY_WALL';
  else if (imbalancePercent >= 8) pressureState = 'BUY_LEAN';
  else if (imbalancePercent <= -25) pressureState = 'STRONG_SELL_WALL';
  else if (imbalancePercent <= -8) pressureState = 'SELL_LEAN';

  return {
    bids,
    asks,
    bestBid,
    bestAsk,
    spreadAbs,
    spreadPercent,
    totalBidUsdt: Math.round(cumBid),
    totalAskUsdt: Math.round(cumAsk),
    imbalancePercent,
    pressureState,
    majorBidWall: {
      price: majorBidWall.price,
      usdt: Math.round(majorBidWall.usdt),
    },
    majorAskWall: {
      price: majorAskWall.price,
      usdt: Math.round(majorAskWall.usdt),
    },
  };
}

export function synthesizeQuantSignal(params: {
  symbol: string;
  price: number;
  change24h: number;
  candles: Candle[];
  orderBook: OrderBookAnalysis;
  provider?: TradingSignal['provider'];
  modelUsed?: string;
}): TradingSignal {
  const { symbol, price, change24h, candles, orderBook } = params;
  const structure = analyzeMarketStructure(candles);

  let bullScore = 50;

  // Structure contribution
  if (structure.structureState === 'BOS_BULLISH') bullScore += 16;
  else if (structure.structureState === 'CHOCH_BULLISH') bullScore += 20;
  else if (structure.structureState === 'BOS_BEARISH') bullScore -= 16;
  else if (structure.structureState === 'CHOCH_BEARISH') bullScore -= 20;

  // MA stack contribution
  if (structure.maAlignment === 'BULLISH_STACK') bullScore += 12;
  else if (structure.maAlignment === 'BEARISH_STACK') bullScore -= 12;

  // Order book imbalance contribution
  if (orderBook.imbalancePercent > 15) bullScore += 10;
  else if (orderBook.imbalancePercent > 5) bullScore += 5;
  else if (orderBook.imbalancePercent < -15) bullScore -= 10;
  else if (orderBook.imbalancePercent < -5) bullScore -= 5;

  // RSI mean-reversion / momentum check
  if (structure.rsi14 > 54 && structure.rsi14 < 72) bullScore += 6;
  else if (structure.rsi14 >= 78) bullScore -= 8; // overbought exhaustion risk
  else if (structure.rsi14 < 46 && structure.rsi14 > 28) bullScore -= 6;
  else if (structure.rsi14 <= 22) bullScore += 8; // oversold bounce potential

  let direction: TradingSignal['direction'] = 'NEUTRAL_WAIT';
  if (bullScore >= 58) direction = 'LONG';
  else if (bullScore <= 42) direction = 'SHORT';

  const confidence = Math.min(94, Math.max(52, Math.round(Math.abs(bullScore - 50) * 1.45 + 54)));
  const atrOffset = Math.max(structure.atr, price * 0.012);

  let entryMin: number;
  let entryMax: number;
  let stopLoss: number;
  let takeProfit1: number;
  let takeProfit2: number;

  if (direction === 'LONG') {
    entryMin = price - atrOffset * 0.35;
    entryMax = price + atrOffset * 0.15;
    stopLoss = price - atrOffset * 1.45;
    takeProfit1 = price + atrOffset * 2.1;
    takeProfit2 = price + atrOffset * 3.6;
  } else if (direction === 'SHORT') {
    entryMin = price - atrOffset * 0.15;
    entryMax = price + atrOffset * 0.35;
    stopLoss = price + atrOffset * 1.45;
    takeProfit1 = price - atrOffset * 2.1;
    takeProfit2 = price - atrOffset * 3.6;
  } else {
    entryMin = price - atrOffset * 0.5;
    entryMax = price + atrOffset * 0.5;
    stopLoss = price - atrOffset * 1.5;
    takeProfit1 = price + atrOffset * 1.8;
    takeProfit2 = price + atrOffset * 3.0;
  }

  const risk = Math.abs(price - stopLoss) || price * 0.01;
  const reward = Math.abs(takeProfit2 - price);
  const riskRewardRatio = Number((reward / risk).toFixed(2));

  const formatP = (v: number) =>
    v >= 100 ? Number(v.toFixed(2)) : v >= 1 ? Number(v.toFixed(4)) : Number(v.toFixed(6));

  return {
    symbol,
    timestamp: new Date().toISOString(),
    provider: params.provider ?? 'Kie.ai Automated Engine',
    modelUsed: params.modelUsed ?? 'kie.ai / claude-haiku-4-5',
    direction,
    confidence,
    entryZone: {
      min: formatP(entryMin),
      max: formatP(entryMax),
      optimal: formatP(price),
    },
    stopLoss: formatP(stopLoss),
    takeProfit1: formatP(takeProfit1),
    takeProfit2: formatP(takeProfit2),
    riskRewardRatio,
    InvalidationLevel: formatP(stopLoss),
    recommendedLeverage: structure.volatilityRegime === 'EXTREME' ? '2x – 3x Isolated' : '3x – 5x Isolated',
    summaryHeadline: `${direction === 'NEUTRAL_WAIT' ? 'RANGE WATCH' : direction} Setup on ${symbol.replace('USDT', '/USDT')} (${structure.structureLabel})`,
    technicalThesis: `20 SMA (${formatP(structure.sma20Current ?? price)}) and 50 EMA (${formatP(structure.ema50Current ?? price)}) show ${structure.maAlignment.replace('_', ' ').toLowerCase()} alignment with 14-period RSI at ${structure.rsi14} and ATR volatility at ${structure.atrPercent}% (${structure.volatilityRegime}).`,
    structureRationale: `Previous trend was ${structure.previousTrend} and current structure exhibits ${structure.structureLabel}. Key swing support rests at ${formatP(structure.nearestSupport)} with overhead supply at ${formatP(structure.nearestResistance)}.`,
    orderBookInsight: `Order book imbalance is ${orderBook.imbalancePercent > 0 ? '+' : ''}${orderBook.imbalancePercent}% (${orderBook.pressureState.replace(/_/g, ' ')}). Major bid wall detected at ${formatP(orderBook.majorBidWall.price)} ($${orderBook.majorBidWall.usdt.toLocaleString()}) vs ask wall at ${formatP(orderBook.majorAskWall.price)} ($${orderBook.majorAskWall.usdt.toLocaleString()}).`,
    keyFactors: [
      `Structure State: ${structure.structureLabel} (Prev: ${structure.previousTrend} → Now: ${structure.currentTrend})`,
      `Moving Averages: ${structure.maAlignment.replace('_', ' ')} | RSI(14): ${structure.rsi14}`,
      `Volatility Regime: ${structure.volatilityRegime} (ATR ${structure.atrPercent}% | 24h Move ${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%)`,
      `Order Book Depth: ${orderBook.imbalancePercent > 0 ? '+' : ''}${orderBook.imbalancePercent}% net liquidity skew`,
    ],
  };
}

export function evaluateAlerts(
  alerts: PriceAlert[],
  tickers: CryptoTicker[]
): { updatedAlerts: PriceAlert[]; newlyTriggered: TriggeredAlertEvent[] } {
  const tickerMap = new Map(tickers.map((t) => [t.symbol, t]));
  const newlyTriggered: TriggeredAlertEvent[] = [];

  const updatedAlerts = alerts.map((alert) => {
    if (alert.triggered) return alert;
    const ticker = tickerMap.get(alert.symbol);
    if (!ticker) return alert;

    let hit = false;
    let currentValue = 0;
    let description = '';
    let severity: TriggeredAlertEvent['severity'] = 'VOLATILITY';

    if (alert.condition === 'PCT_CHANGE_ABOVE') {
      currentValue = ticker.priceChangePercent;
      hit = currentValue >= alert.threshold;
      severity = 'BULLISH';
      description = `${alert.symbol} 24h gain reached +${currentValue.toFixed(2)}% (threshold: +${alert.threshold}%)`;
    } else if (alert.condition === 'PCT_CHANGE_BELOW') {
      currentValue = ticker.priceChangePercent;
      hit = currentValue <= alert.threshold;
      severity = 'BEARISH';
      description = `${alert.symbol} 24h drop reached ${currentValue.toFixed(2)}% (threshold: ${alert.threshold}%)`;
    } else if (alert.condition === 'PRICE_ABOVE') {
      currentValue = ticker.lastPrice;
      hit = currentValue >= alert.threshold;
      severity = 'BULLISH';
      description = `${alert.symbol} broke above target price $${currentValue.toLocaleString()} (target: $${alert.threshold.toLocaleString()})`;
    } else if (alert.condition === 'PRICE_BELOW') {
      currentValue = ticker.lastPrice;
      hit = currentValue <= alert.threshold;
      severity = 'BEARISH';
      description = `${alert.symbol} dropped below target price $${currentValue.toLocaleString()} (target: $${alert.threshold.toLocaleString()})`;
    } else if (alert.condition === 'VOLATILITY_ABOVE') {
      currentValue = ticker.volatilityRatio;
      hit = currentValue >= alert.threshold;
      severity = 'VOLATILITY';
      description = `${alert.symbol} intraday volatility expanded to ${currentValue.toFixed(2)}% (threshold: ${alert.threshold}%)`;
    }

    if (hit) {
      const nowIso = new Date().toISOString();
      newlyTriggered.push({
        id: `evt-${alert.id}-${Date.now()}`,
        alertId: alert.id,
        symbol: alert.symbol,
        message: description,
        timestamp: nowIso,
        severity,
      });
      return {
        ...alert,
        triggered: true,
        triggeredAt: nowIso,
        triggeredValue: currentValue,
      };
    }

    return alert;
  });

  return { updatedAlerts, newlyTriggered };
}
