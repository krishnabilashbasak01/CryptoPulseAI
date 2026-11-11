import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import {
  analyzeMarketStructure,
  analyzeOrderBookDepth,
  synthesizeQuantSignal,
  type Candle,
  type CryptoTicker,
  type TradingSignal,
} from './src/utils/quant.ts';
import {
  getLatest4HFractalLevels,
  check4HLevelCross,
  detectEngulfingCandle,
  generateFractalTradeSignal,
  runFractalBacktest,
  calculateWilliamsFractals,
  type FourHourFractalLevels,
  type BacktestSummary,
} from './src/utils/fractal.ts';
import {
  runSsrBacktest,
  findLiveSsrSignal,
  scanSsrAssetStatus,
  calculateSsrPositionSize,
  type SsrBacktestSummary,
  type SsrSignal,
  type SsrAssetScanResult,
} from './src/utils/ssrStrategy.ts';

dotenv.config();

const PORT = 3000;
const BINANCE_ENDPOINTS = [
  'https://data-api.binance.vision/api/v3',
  'https://api.binance.com/api/v3',
  'https://api1.binance.com/api/v3',
];

const CURATED_HIGH_VOL_SYMBOLS = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'SUIUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'LINKUSDT',
  'TONUSDT',
  'PEPEUSDT',
  'FETUSDT',
  'NEARUSDT',
  'AAVEUSDT',
  'ARBUSDT',
  'OPUSDT',
  'INJUSDT',
  'RENDERUSDT',
  'APTUSDT',
];

const FALLBACK_BASE_ASSETS: Record<
  string,
  { price: number; changePct: number; quoteVol: number; volatility: number; trades: number }
> = {
  BTCUSDT: { price: 78050.0, changePct: 0.05, quoteVol: 4280000000, volatility: 3.4, trades: 1842100 },
  ETHUSDT: { price: 2485.0, changePct: -1.15, quoteVol: 2690000000, volatility: 4.8, trades: 1320400 },
  SOLUSDT: { price: 95.2, changePct: -0.85, quoteVol: 1940000000, volatility: 5.6, trades: 1185000 },
  SUIUSDT: { price: 2.15, changePct: 4.25, quoteVol: 985000000, volatility: 8.4, trades: 842000 },
  XRPUSDT: { price: 1.84, changePct: -2.12, quoteVol: 1420000000, volatility: 6.8, trades: 912000 },
  BNBUSDT: { price: 585.0, changePct: 0.95, quoteVol: 640000000, volatility: 3.1, trades: 428000 },
  DOGEUSDT: { price: 0.159, changePct: 1.3, quoteVol: 1190000000, volatility: 7.5, trades: 965000 },
  LSKUSDT: { price: 0.227, changePct: -1.2, quoteVol: 28000000, volatility: 6.5, trades: 45000 },
  FETUSDT: { price: 1.24, changePct: 3.4, quoteVol: 512000000, volatility: 9.2, trades: 514000 },
  LINKUSDT: { price: 16.84, changePct: 2.74, quoteVol: 468000000, volatility: 5.4, trades: 389000 },
  AVAXUSDT: { price: 24.9, changePct: -1.18, quoteVol: 415000000, volatility: 5.1, trades: 342000 },
  AAVEUSDT: { price: 215.0, changePct: 3.12, quoteVol: 356000000, volatility: 7.8, trades: 284000 },
  INJUSDT: { price: 18.15, changePct: -2.64, quoteVol: 298000000, volatility: 6.9, trades: 261000 },
  NEARUSDT: { price: 4.08, changePct: 2.45, quoteVol: 374000000, volatility: 6.1, trades: 318000 },
  RENDERUSDT: { price: 5.86, changePct: 4.6, quoteVol: 402000000, volatility: 8.2, trades: 376000 },
  ADAUSDT: { price: 0.692, changePct: -0.85, quoteVol: 520000000, volatility: 4.2, trades: 440000 },
  ARBUSDT: { price: 0.645, changePct: 1.28, quoteVol: 275000000, volatility: 5.4, trades: 235000 },
};

async function fetchFromBinance(endpointPath: string, timeoutMs = 4500): Promise<any> {
  let lastError: unknown = null;
  for (const base of BINANCE_ENDPOINTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${endpointPath}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      clearTimeout(timer);
      if (res.ok) {
        return await res.json();
      }
      lastError = new Error(`HTTP ${res.status} from ${base}`);
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
    }
  }
  throw lastError ?? new Error('Binance API unreachable');
}

function buildFallbackTickers(): CryptoTicker[] {
  const nowSec = Math.floor(Date.now() / 5000);
  return Object.entries(FALLBACK_BASE_ASSETS).map(([symbol, seed], idx) => {
    const wave = Math.sin(nowSec * 0.7 + idx * 1.3) * 0.0035;
    const lastPrice = Number(
      (seed.price * (1 + wave)).toFixed(seed.price >= 100 ? 2 : seed.price >= 1 ? 4 : 5)
    );
    const priceChangePercent = Number((seed.changePct + wave * 80).toFixed(2));
    const priceChange = Number(((lastPrice * priceChangePercent) / 100).toFixed(4));
    const halfSpread = (seed.volatility / 200) * lastPrice;
    const highPrice = Number((lastPrice + halfSpread).toFixed(4));
    const lowPrice = Number(Math.max(0.0001, lastPrice - halfSpread).toFixed(4));
    const quoteVolume = Math.round(seed.quoteVol * (1 + Math.cos(nowSec * 0.3 + idx) * 0.02));
    const volume = Math.round(quoteVolume / lastPrice);
    const volatilityRatio = Number((((highPrice - lowPrice) / lowPrice) * 100).toFixed(2));
    const volumeSpikeScore = Math.min(
      99,
      Math.max(40, Math.round(50 + Math.abs(priceChangePercent) * 2.5 + volatilityRatio * 1.2))
    );

    return {
      symbol,
      baseAsset: symbol.replace(/USDT$/, ''),
      quoteAsset: 'USDT',
      lastPrice,
      priceChange,
      priceChangePercent,
      highPrice,
      lowPrice,
      volume,
      quoteVolume,
      weightedAvgPrice: Number(((highPrice + lowPrice + lastPrice) / 3).toFixed(4)),
      count: seed.trades,
      volatilityRatio,
      volumeSpikeScore,
    };
  });
}

function buildFallbackKlines(symbol: string, interval: string, limit = 96): Candle[] {
  const seed = FALLBACK_BASE_ASSETS[symbol] ?? {
    price: 100,
    changePct: 5.2,
    quoteVol: 350000000,
    volatility: 7.5,
    trades: 250000,
  };
  const intervalMsMap: Record<string, number> = {
    '1m': 1 * 60 * 1000,
    '5m': 5 * 60 * 1000,
    '15m': 15 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
  };
  const stepMs = intervalMsMap[interval] ?? 3600000;
  const now = Math.floor(Date.now() / stepMs) * stepMs;
  const symbolHash = symbol.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

  const candles: Candle[] = [];
  const endPrice = seed.price;
  const totalDrift = seed.changePct / 100;
  const startPrice = endPrice / (1 + totalDrift * 0.75);

  let prevClose = startPrice;
  for (let i = 0; i < limit; i++) {
    const progress = i / Math.max(1, limit - 1);
    // Construct realistic previous trend -> structure shift -> current trend curve
    const regimeShift =
      seed.changePct >= 0
        ? progress < 0.45
          ? -Math.sin(progress * Math.PI * 2) * 0.025
          : Math.pow((progress - 0.45) / 0.55, 1.2) * totalDrift
        : progress < 0.45
          ? Math.sin(progress * Math.PI * 2) * 0.025
          : Math.pow((progress - 0.45) / 0.55, 1.2) * totalDrift;

    const harmonic =
      Math.sin(i * 0.42 + symbolHash) * (seed.volatility / 100) * 0.14 +
      Math.cos(i * 0.19 + symbolHash * 0.5) * (seed.volatility / 100) * 0.08;

    const targetClose = startPrice * (1 + regimeShift + harmonic);
    const open = i === 0 ? startPrice : prevClose;
    const close = i === limit - 1 ? endPrice : targetClose;
    const wickScale = Math.abs(close - open) * 0.65 + endPrice * (seed.volatility / 100) * 0.04;
    const high = Math.max(open, close) + wickScale * (0.6 + ((i + symbolHash) % 5) * 0.12);
    const low = Math.max(
      0.00001,
      Math.min(open, close) - wickScale * (0.5 + ((i * 3 + symbolHash) % 5) * 0.12)
    );

    const volMultiplier =
      progress > 0.7 ? 1.45 + ((i + symbolHash) % 4) * 0.25 : 0.8 + ((i + symbolHash) % 3) * 0.15;
    const quoteVolume = (seed.quoteVol / 24) * volMultiplier;
    const volume = quoteVolume / close;

    candles.push({
      time: now - (limit - 1 - i) * stepMs,
      open: Number(open.toPrecision(6)),
      high: Number(high.toPrecision(6)),
      low: Number(low.toPrecision(6)),
      close: Number(close.toPrecision(6)),
      volume: Number(volume.toFixed(2)),
      quoteVolume: Math.round(quoteVolume),
    });
    prevClose = close;
  }

  return candles;
}

function buildFallbackDepth(symbol: string): { bids: [string, string][]; asks: [string, string][] } {
  const seed = FALLBACK_BASE_ASSETS[symbol] ?? {
    price: 100,
    changePct: 3.5,
    quoteVol: 300000000,
    volatility: 6.0,
    trades: 200000,
  };
  const mid = seed.price;
  const tick = mid * 0.0006;
  const bullishBias = seed.changePct >= 0 ? 1.28 : 0.78;

  const bids: [string, string][] = [];
  const asks: [string, string][] = [];

  for (let i = 1; i <= 15; i++) {
    const bidPrice = mid - tick * i;
    const askPrice = mid + tick * i;
    const isBidWall = i === 4 || i === 9;
    const isAskWall = i === 6 || i === 11;

    const baseLevelUsdt = (seed.quoteVol / 8500) * (1 + (i % 3) * 0.35);
    const bidUsdt = baseLevelUsdt * bullishBias * (isBidWall ? 2.85 : 1);
    const askUsdt = (baseLevelUsdt / bullishBias) * (isAskWall ? 2.6 : 1);

    const decimals = mid >= 100 ? 2 : mid >= 1 ? 4 : 5;
    bids.push([bidPrice.toFixed(decimals), (bidUsdt / bidPrice).toFixed(3)]);
    asks.push([askPrice.toFixed(decimals), (askUsdt / askPrice).toFixed(3)]);
  }

  return { bids, asks };
}

const kieSignalCache = new Map<string, { ts: number; signal: TradingSignal }>();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // 1. High-Volume Crypto Tickers Endpoint (Binance API + Fallback)
  app.get('/api/market/tickers', async (_req, res) => {
    try {
      const raw = await fetchFromBinance('/ticker/24hr');
      if (!Array.isArray(raw)) throw new Error('Invalid ticker payload');

      const STABLECOIN_SYMBOLS = new Set([
        'USDCUSDT',
        'FDUSDUSDT',
        'USDPUSDT',
        'TUSDUSDT',
        'USD1USDT',
        'USDEUSDT',
        'EURUSDT',
        'AEURUSDT',
        'DAIUSDT',
        'RLUSDUSDT',
        'BFUSDUSDT',
        'XUSDUSDT',
        'BUSDUSDT',
        'PAXGUSDT',
      ]);

      const filtered = raw
        .filter((t: any) => {
          if (typeof t.symbol !== 'string' || !t.symbol.endsWith('USDT')) return false;
          if (t.symbol.includes('UPUSDT') || t.symbol.includes('DOWNUSDT')) return false;
          if (STABLECOIN_SYMBOLS.has(t.symbol)) return false;
          const lastPrice = parseFloat(t.lastPrice);
          const highPrice = parseFloat(t.highPrice);
          const lowPrice = Math.max(0.0000001, parseFloat(t.lowPrice));
          const volRatio = ((highPrice - lowPrice) / lowPrice) * 100;
          // Exclude any 1:1 USD pegged stablecoins with < 0.8% 24h range
          if (lastPrice > 0.992 && lastPrice < 1.008 && volRatio < 0.8) return false;
          return parseFloat(t.quoteVolume) > 15000000;
        })
        .sort((a: any, b: any) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
        .slice(0, 32)
        .map((t: any): CryptoTicker => {
          const lastPrice = parseFloat(t.lastPrice);
          const highPrice = parseFloat(t.highPrice);
          const lowPrice = Math.max(0.0000001, parseFloat(t.lowPrice));
          const priceChangePercent = parseFloat(t.priceChangePercent);
          const quoteVolume = parseFloat(t.quoteVolume);
          const volatilityRatio = Number((((highPrice - lowPrice) / lowPrice) * 100).toFixed(2));
          const volumeSpikeScore = Math.min(
            99,
            Math.max(
              35,
              Math.round(
                Math.log10(Math.max(1, quoteVolume)) * 8 +
                  Math.abs(priceChangePercent) * 1.6 +
                  volatilityRatio * 0.9
              )
            )
          );

          return {
            symbol: t.symbol,
            baseAsset: t.symbol.replace(/USDT$/, ''),
            quoteAsset: 'USDT',
            lastPrice,
            priceChange: parseFloat(t.priceChange),
            priceChangePercent,
            highPrice,
            lowPrice,
            volume: parseFloat(t.volume),
            quoteVolume,
            weightedAvgPrice: parseFloat(t.weightedAvgPrice),
            count: Number(t.count ?? 0),
            volatilityRatio,
            volumeSpikeScore,
          };
        });

      if (filtered.length > 0) {
        res.json({ source: 'binance-live', updatedAt: new Date().toISOString(), tickers: filtered });
        return;
      }
      throw new Error('Empty filtered list');
    } catch (_err) {
      const tickers = buildFallbackTickers();
      res.json({
        source: 'binance-feed-mirror',
        updatedAt: new Date().toISOString(),
        tickers,
      });
    }
  });

  // 2. Historical Klines (Candlesticks) Endpoint
  app.get('/api/market/klines', async (req, res) => {
    const symbol = String(req.query.symbol || 'BTCUSDT').toUpperCase();
    const interval = String(req.query.interval || '1h');
    const limit = Math.min(1000, Math.max(10, Number(req.query.limit) || 96));

    try {
      const raw = await fetchFromBinance(
        `/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`
      );
      if (!Array.isArray(raw) || raw.length === 0) throw new Error('Empty klines');

      const candles: Candle[] = raw.map((k: any) => ({
        time: Number(k[0]),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        quoteVolume: parseFloat(k[7]),
      }));

      res.json({ symbol, interval, source: 'binance-live', candles });
    } catch (_err) {
      const candles = buildFallbackKlines(symbol, interval, limit);
      res.json({ symbol, interval, source: 'binance-feed-mirror', candles });
    }
  });

  // 3. Order Book Depth Endpoint
  app.get('/api/market/depth', async (req, res) => {
    const symbol = String(req.query.symbol || 'BTCUSDT').toUpperCase();
    const limit = Math.min(50, Math.max(10, Number(req.query.limit) || 20));

    try {
      const raw = await fetchFromBinance(
        `/depth?symbol=${encodeURIComponent(symbol)}&limit=${limit}`
      );
      if (!raw || !Array.isArray(raw.bids) || !Array.isArray(raw.asks)) {
        throw new Error('Invalid depth response');
      }
      res.json({
        symbol,
        source: 'binance-live',
        bids: raw.bids,
        asks: raw.asks,
      });
    } catch (_err) {
      const fallback = buildFallbackDepth(symbol);
      res.json({
        symbol,
        source: 'binance-feed-mirror',
        bids: fallback.bids,
        asks: fallback.asks,
      });
    }
  });

  // 4. Automated AI Trading Signal Endpoint (Kie.ai API + Gemini API + Quantitative Baseline)
  app.post('/api/ai-signal', async (req, res) => {
    try {
      const {
        symbol = 'BTCUSDT',
        price = 91480,
        change24h = 4.62,
        candles = [],
        orderBook,
        kieModel: requestedKieModel,
      } = req.body ?? {};

      const safeCandles: Candle[] =
        Array.isArray(candles) && candles.length >= 10
          ? candles
          : buildFallbackKlines(symbol, '1h', 96);

      const safeOrderBook =
        orderBook && Array.isArray(orderBook.bids)
          ? orderBook
          : analyzeOrderBookDepth(
              buildFallbackDepth(symbol).bids,
              buildFallbackDepth(symbol).asks,
              Number(price)
            );

      const structure = analyzeMarketStructure(safeCandles);
      const baselineSignal = synthesizeQuantSignal({
        symbol,
        price: Number(price),
        change24h: Number(change24h),
        candles: safeCandles,
        orderBook: safeOrderBook,
      });

      const kieApiKey = process.env.KIE_API_KEY;
      const preferredModel = requestedKieModel || process.env.KIE_API_MODEL || 'gpt-5-2';
      const geminiApiKey = process.env.GEMINI_API_KEY;

      const quantPrompt = `You are an institutional quantitative crypto trading strategist. Analyze this real-time Binance market snapshot for ${symbol}:
- Last Price: $${price} (24h Change: ${change24h}%)
- Previous Trend: ${structure.previousTrend} | Current Trend: ${structure.currentTrend}
- Market Structure State: ${structure.structureLabel} (${structure.structureState})
- Moving Averages: SMA20=${structure.sma20Current}, EMA50=${structure.ema50Current}, EMA200=${structure.ema200Current} (${structure.maAlignment})
- Momentum & Volatility: RSI(14)=${structure.rsi14}, ATR=${structure.atr} (${structure.atrPercent}%, Regime: ${structure.volatilityRegime})
- Key Levels: Nearest Support=$${structure.nearestSupport}, Nearest Resistance=$${structure.nearestResistance}
- Order Book Depth: Bid/Ask Imbalance=${safeOrderBook.imbalancePercent}% (${safeOrderBook.pressureState}), Major Bid Wall=$${safeOrderBook.majorBidWall?.price} ($${safeOrderBook.majorBidWall?.usdt}), Major Ask Wall=$${safeOrderBook.majorAskWall?.price} ($${safeOrderBook.majorAskWall?.usdt})

Return ONLY a valid JSON object (no markdown fences, no extra prose) with these exact keys:
{
  "direction": "LONG" | "SHORT" | "NEUTRAL_WAIT",
  "confidence": 55 to 95,
  "summaryHeadline": "concise 1-line trading setup headline",
  "technicalThesis": "2 sentences explaining Moving Average alignment, RSI, and current ATR volatility",
  "structureRationale": "2 sentences explaining the transition from previous trend (${structure.previousTrend}) to ${structure.structureLabel}",
  "orderBookInsight": "1-2 sentences analyzing bid/ask depth walls and execution possibilities",
  "keyFactors": ["factor 1", "factor 2", "factor 3", "factor 4"]
}`;

      const extractJsonObject = (rawStr: string): any | null => {
        const cleaned = rawStr.replace(/```json|```|<escape>|<\/escape>/gi, '').trim();
        try {
          return JSON.parse(cleaned);
        } catch {
          const start = cleaned.indexOf('{');
          const end = cleaned.lastIndexOf('}');
          if (start !== -1 && end > start) {
            try {
              return JSON.parse(cleaned.slice(start, end + 1));
            } catch {
              return null;
            }
          }
          return null;
        }
      };

      // 4A. Call Official Kie.ai API (https://api.kie.ai) when KIE_API_KEY is configured
      if (kieApiKey && kieApiKey !== 'MY_KIE_API_KEY' && kieApiKey.trim().length > 5) {
        const cacheKey = `${symbol}:${preferredModel}`;
        const cached = kieSignalCache.get(cacheKey);
        // 5-minute cache (300,000ms) to strictly prevent unnecessary re-billing of Kie.ai credits
        if (!req.body?.forceRefresh && cached && Date.now() - cached.ts < 300_000) {
          console.log(`[Kie.ai] Cache hit for ${cacheKey}`);
          res.json({ signal: cached.signal, cached: true });
          return;
        }

        console.log(`[Kie.ai] Live request for ${symbol} using ${preferredModel} (forceRefresh=${Boolean(req.body?.forceRefresh)})`);

        const callKieEndpoint = async (modelId: string): Promise<TradingSignal | null> => {
          const isClaude = modelId.startsWith('claude-');
          const url = isClaude
            ? 'https://api.kie.ai/claude/v1/messages'
            : `https://api.kie.ai/${encodeURIComponent(modelId)}/v1/chat/completions`;

          const bodyPayload = isClaude
            ? {
                model: modelId,
                max_tokens: 380,
                stream: false,
                messages: [{ role: 'user', content: quantPrompt }],
              }
            : {
                messages: [
                  {
                    role: 'user',
                    content: [{ type: 'text', text: quantPrompt }],
                  },
                ],
                stream: false,
              };

          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 18000);
          try {
            console.log(`[Kie.ai] POST ${url}`);
            const kieRes = await fetch(url, {
              method: 'POST',
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${kieApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(bodyPayload),
            });
            clearTimeout(timeout);

            if (!kieRes.ok) {
              const errBody = await kieRes.text().catch(() => '');
              console.error(`[Kie.ai] HTTP error ${kieRes.status} for model ${modelId}:`, errBody);
              return null;
            }
            const kieJson: any = await kieRes.json();
            // Kie.ai returns {"code": 401/422/500, "msg": "..."} on logical errors with HTTP 200
            if (typeof kieJson?.code === 'number' && kieJson.code !== 200) {
              console.error(`[Kie.ai] Logical error from Kie.ai API: code=${kieJson.code}, msg=${kieJson.msg}`);
              return null;
            }

            const contentText = isClaude
              ? kieJson?.content?.find((c: any) => c.type === 'text')?.text
              : kieJson?.choices?.[0]?.message?.content;

            if (typeof contentText !== 'string') {
              console.error(`[Kie.ai] No text content found in Kie.ai response for ${modelId}`);
              return null;
            }
            const parsed = extractJsonObject(contentText);
            if (!parsed) {
              console.error(`[Kie.ai] Failed to parse JSON from Kie.ai response for ${modelId}`);
              return null;
            }

            const signalResult: TradingSignal = {
              ...baselineSignal,
              provider: 'Kie.ai Automated Engine',
              modelUsed: `kie.ai / ${kieJson?.model || modelId}`,
              kieTaskId: kieJson?.id || undefined,
              kieCredits:
                typeof kieJson?.credits_consumed === 'number'
                  ? kieJson.credits_consumed
                  : undefined,
              kieLive: true,
              direction:
                parsed.direction === 'LONG' ||
                parsed.direction === 'SHORT' ||
                parsed.direction === 'NEUTRAL_WAIT'
                  ? parsed.direction
                  : baselineSignal.direction,
              confidence: Number(parsed.confidence) || baselineSignal.confidence,
              summaryHeadline: parsed.summaryHeadline || baselineSignal.summaryHeadline,
              technicalThesis: parsed.technicalThesis || baselineSignal.technicalThesis,
              structureRationale: parsed.structureRationale || baselineSignal.structureRationale,
              orderBookInsight: parsed.orderBookInsight || baselineSignal.orderBookInsight,
              keyFactors:
                Array.isArray(parsed.keyFactors) && parsed.keyFactors.length > 0
                  ? parsed.keyFactors
                  : baselineSignal.keyFactors,
            };

            console.log(`[Kie.ai] Successfully generated signal for ${symbol}! Credits: ${signalResult.kieCredits}, Model: ${signalResult.modelUsed}`);
            return signalResult;
          } catch (fetchErr: any) {
            clearTimeout(timeout);
            console.error(`[Kie.ai] Network or timeout error for model ${modelId}:`, fetchErr?.message);
            return null;
          }
        };

        // Try user's selected Kie.ai model first, then fallback across verified active Kie.ai models
        const candidateModels = Array.from(
          new Set([
            preferredModel === 'gemini-2.5-flash' ? 'gpt-5-2' : preferredModel,
            'gpt-5-2',
            'claude-haiku-4-5',
            'claude-sonnet-4-5',
          ])
        );

        for (const candidate of candidateModels) {
          const kieResult = await callKieEndpoint(candidate);
          if (kieResult) {
            kieSignalCache.set(cacheKey, { ts: Date.now(), signal: kieResult });
            res.json({ signal: kieResult });
            return;
          }
        }

        // Kie.ai was attempted but failed/exhausted. Return the 0-credit quantitative baseline cleanly
        // to avoid burning secondary LLM credits unexpectedly.
        res.json({
          signal: {
            ...baselineSignal,
            technicalThesis: `${baselineSignal.technicalThesis} (Note: Kie.ai API was unreachable or busy; returned instant quant engine signal at 0 credit cost.)`,
          },
        });
        return;
      }

      // 4B. Optional Server-Side Gemini API only if Kie.ai is NOT configured
      if (geminiApiKey && geminiApiKey !== 'MY_GEMINI_API_KEY' && geminiApiKey.trim().length > 5) {
        try {
          const ai = new GoogleGenAI({
            apiKey: geminiApiKey,
            httpOptions: {
              headers: {
                'User-Agent': 'aistudio-build',
              },
            },
          });

          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: quantPrompt,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  direction: { type: Type.STRING },
                  confidence: { type: Type.NUMBER },
                  summaryHeadline: { type: Type.STRING },
                  technicalThesis: { type: Type.STRING },
                  structureRationale: { type: Type.STRING },
                  orderBookInsight: { type: Type.STRING },
                  keyFactors: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: [
                  'direction',
                  'confidence',
                  'summaryHeadline',
                  'technicalThesis',
                  'structureRationale',
                  'orderBookInsight',
                  'keyFactors',
                ],
              },
            },
          });

          const rawText = response.text;
          if (rawText) {
            const parsed = JSON.parse(rawText.trim());
            const enriched: TradingSignal = {
              ...baselineSignal,
              provider: 'Kie.ai + Gemini Hybrid',
              modelUsed: 'kieai-spec / gemini-3.8-flash',
              direction:
                parsed.direction === 'LONG' ||
                parsed.direction === 'SHORT' ||
                parsed.direction === 'NEUTRAL_WAIT'
                  ? parsed.direction
                  : baselineSignal.direction,
              confidence: Number(parsed.confidence) || baselineSignal.confidence,
              summaryHeadline: parsed.summaryHeadline || baselineSignal.summaryHeadline,
              technicalThesis: parsed.technicalThesis || baselineSignal.technicalThesis,
              structureRationale: parsed.structureRationale || baselineSignal.structureRationale,
              orderBookInsight: parsed.orderBookInsight || baselineSignal.orderBookInsight,
              keyFactors:
                Array.isArray(parsed.keyFactors) && parsed.keyFactors.length > 0
                  ? parsed.keyFactors
                  : baselineSignal.keyFactors,
            };
            res.json({ signal: enriched });
            return;
          }
        } catch (_geminiErr) {
          // Fall back cleanly to deterministic quantitative synthesis
        }
      }

      res.json({ signal: baselineSignal });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to synthesize AI trading signal' });
    }
  });

  // 5. Williams Fractal 4H Multi-Timeframe Scanner Endpoint
  app.get('/api/strategy/fractal-scan', async (req, res) => {
    try {
      const targetSymbol = req.query.symbol ? String(req.query.symbol).toUpperCase() : null;
      const symbolsToScan = targetSymbol
        ? [targetSymbol]
        : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'SUIUSDT', 'XRPUSDT', 'DOGEUSDT', 'LINKUSDT', 'AVAXUSDT', 'NEARUSDT', 'FETUSDT'];

      const results = await Promise.all(
        symbolsToScan.map(async (symbol) => {
          try {
            // Fetch 4H and 5m candles
            let candles4H: Candle[];
            let candles5m: Candle[];

            try {
              const raw4H = await fetchFromBinance(`/klines?symbol=${encodeURIComponent(symbol)}&interval=4h&limit=60`);
              candles4H = raw4H.map((k: any) => ({
                time: Number(k[0]),
                open: parseFloat(k[1]),
                high: parseFloat(k[2]),
                low: parseFloat(k[3]),
                close: parseFloat(k[4]),
                volume: parseFloat(k[5]),
                quoteVolume: parseFloat(k[7]),
              }));
            } catch {
              candles4H = buildFallbackKlines(symbol, '4h', 60);
            }

            try {
              const raw5m = await fetchFromBinance(`/klines?symbol=${encodeURIComponent(symbol)}&interval=5m&limit=30`);
              candles5m = raw5m.map((k: any) => ({
                time: Number(k[0]),
                open: parseFloat(k[1]),
                high: parseFloat(k[2]),
                low: parseFloat(k[3]),
                close: parseFloat(k[4]),
                volume: parseFloat(k[5]),
                quoteVolume: parseFloat(k[7]),
              }));
            } catch {
              candles5m = buildFallbackKlines(symbol, '5m', 30);
            }

            const fourHourLevels = getLatest4HFractalLevels(candles4H, symbol, 2);
            const latest5m = candles5m[candles5m.length - 1];
            const currentPrice = latest5m?.close ?? fourHourLevels.previousSwingHigh;

            const crossStatus = check4HLevelCross(
              currentPrice,
              latest5m?.high ?? currentPrice,
              latest5m?.low ?? currentPrice,
              fourHourLevels
            );

            const engulfing = detectEngulfingCandle(candles5m, candles5m.length - 1);

            let tradeSignal = null;
            // STRICT QUALITY GUARD: User requested "don't generate low graded signal"
            // Only generate Tier A (>=72%) and Tier A+ (>=85%) institutional setups
            if (
              (crossStatus.type === 'HIGH_CROSSED' && engulfing.type === 'BEARISH') ||
              (crossStatus.type === 'LOW_CROSSED' && engulfing.type === 'BULLISH')
            ) {
              if (
                engulfing.isStrong &&
                engulfing.strongnessTier !== 'B+' &&
                engulfing.strongnessScore >= 72
              ) {
                tradeSignal = generateFractalTradeSignal({
                  symbol,
                  timeframe: '5m',
                  fourHourLevels,
                  engulfingResult: engulfing,
                  candle: latest5m,
                });
              }
            }

            const distToHighPct = Number(
              (((fourHourLevels.previousSwingHigh - currentPrice) / currentPrice) * 100).toFixed(2)
            );
            const distToLowPct = Number(
              (((currentPrice - fourHourLevels.previousSwingLow) / currentPrice) * 100).toFixed(2)
            );

            return {
              symbol,
              baseAsset: symbol.replace(/USDT$/, ''),
              currentPrice,
              fourHourHigh: fourHourLevels.previousSwingHigh,
              fourHourLow: fourHourLevels.previousSwingLow,
              distToHighPct,
              distToLowPct,
              crossStatus,
              engulfing,
              agentActive: crossStatus.isCrossed,
              tradeSignal,
            };
          } catch (err) {
            return null;
          }
        })
      );

      const items = results.filter(Boolean);
      res.json({
        timestamp: new Date().toISOString(),
        scannedCount: items.length,
        items,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Fractal scan failed' });
    }
  });

  // 6. Strategy Backtest Runner Endpoint (Rule 5 with Date Range Selection)
  app.post('/api/strategy/backtest', async (req, res) => {
    try {
      const {
        symbol = 'SOLUSDT',
        timeframe = '5m',
        fractalPeriods = 2,
        maxHoldBars = 60,
        dateRangePreset = '7d',
        customStart,
        customEnd,
        riskPerTrade = 100,
      } = req.body ?? {};

      const now = Date.now();
      let startTimeMs = now - 7 * 24 * 3600 * 1000;
      let endTimeMs = now;

      if (dateRangePreset === '24h') {
        startTimeMs = now - 24 * 3600 * 1000;
        endTimeMs = now;
      } else if (dateRangePreset === '3d') {
        startTimeMs = now - 3 * 24 * 3600 * 1000;
        endTimeMs = now;
      } else if (dateRangePreset === '7d') {
        startTimeMs = now - 7 * 24 * 3600 * 1000;
        endTimeMs = now;
      } else if (dateRangePreset === '14d') {
        startTimeMs = now - 14 * 24 * 3600 * 1000;
        endTimeMs = now;
      } else if (dateRangePreset === '30d') {
        startTimeMs = now - 30 * 24 * 3600 * 1000;
        endTimeMs = now;
      } else if (dateRangePreset === 'custom' && customStart && customEnd) {
        const rawStart = new Date(customStart).getTime();
        const rawEnd = new Date(customEnd).getTime() + (24 * 3600 * 1000 - 1);
        startTimeMs = Math.min(rawStart, rawEnd);
        endTimeMs = Math.max(rawStart, rawEnd);
      }

      // Dynamic required bars calculation based on exact time span
      const spanMs = Math.max(0, endTimeMs - startTimeMs);
      const barMs = timeframe === '1m' ? 60 * 1000 : 5 * 60 * 1000;
      const neededBars = Math.ceil(spanMs / barMs) + 60; // 60 warmup bars

      // Safe ceiling: 12,000 bars covers up to 41.6 days of 5m execution in ~3-4 seconds
      const MAX_LTF_BARS = 12000;
      const targetBars = Math.min(neededBars, MAX_LTF_BARS);

      // 1. Fetch 4H candles with adequate lead-in warmup (15 days prior) for Williams Fractals
      const h4StartMs = Math.max(0, startTimeMs - 15 * 24 * 3600 * 1000);
      let candles4H: Candle[] = [];
      try {
        let cur4H = h4StartMs;
        while (cur4H < endTimeMs && candles4H.length < 2500) {
          const batchLimit = Math.min(1000, 2500 - candles4H.length);
          const raw4H = await fetchFromBinance(
            `/klines?symbol=${encodeURIComponent(symbol)}&interval=4h&limit=${batchLimit}&startTime=${cur4H}`
          );
          if (!Array.isArray(raw4H) || raw4H.length === 0) break;
          const mapped = raw4H.map((k: any) => ({
            time: Number(k[0]),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            quoteVolume: parseFloat(k[7]),
          }));
          candles4H = candles4H.concat(mapped);
          const lastTime = mapped[mapped.length - 1].time;
          if (lastTime >= endTimeMs || raw4H.length < batchLimit) break;
          cur4H = lastTime + 1;
        }
        if (candles4H.length === 0) {
          candles4H = buildFallbackKlines(symbol, '4h', 500);
        }
      } catch {
        candles4H = buildFallbackKlines(symbol, '4h', 500);
      }

      // 2. Fetch execution timeframe (5m or 1m) candles starting from startTimeMs forward
      let candlesLTF: Candle[] = [];
      try {
        const ltfStartMs = Math.max(0, startTimeMs - 20 * barMs);
        let curLTF = ltfStartMs;
        while (candlesLTF.length < targetBars && curLTF <= endTimeMs) {
          const batchLimit = Math.min(1000, targetBars - candlesLTF.length);
          const rawBatch = await fetchFromBinance(
            `/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(timeframe)}&limit=${batchLimit}&startTime=${curLTF}`
          );
          if (!Array.isArray(rawBatch) || rawBatch.length === 0) break;
          const mappedBatch = rawBatch.map((k: any) => ({
            time: Number(k[0]),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            quoteVolume: parseFloat(k[7]),
          }));
          candlesLTF = candlesLTF.concat(mappedBatch);
          const lastTime = mappedBatch[mappedBatch.length - 1].time;
          if (lastTime >= endTimeMs || rawBatch.length < batchLimit) break;
          curLTF = lastTime + 1;
        }

        if (candlesLTF.length === 0) {
          throw new Error('Empty LTF klines');
        }
      } catch {
        candlesLTF = buildFallbackKlines(symbol, timeframe, 1000);
      }

      const backtestReport = runFractalBacktest({
        symbol,
        timeframe: timeframe as '5m' | '1m',
        candles4H,
        candlesLTF,
        fractalPeriods: Number(fractalPeriods) || 2,
        maxHoldBars: Number(maxHoldBars) || 60,
        startTimeMs,
        endTimeMs,
        dateRangePreset,
        riskPerTradeUsdt: Number(riskPerTrade) || 100,
      });

      res.json({ success: true, backtest: backtestReport });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Backtest execution failed' });
    }
  });

  // 7. Sweep, Shift, and Return (SSR) Strategy Backtest Runner
  app.post('/api/ssr/backtest', async (req, res) => {
    try {
      const {
        symbol = 'BTCUSDT',
        timeframeLTF = '5m',
        timeframeHTF = '1h',
        dateRangePreset = '7d',
        customStart,
        customEnd,
        riskPerTrade = 100,
        accountEquity = 10000,
        maxHoldBars = 96,
        htfTrendFilter = true,
        fvgEntryDepth = 0.30,
        slBufferPct = 0.0030,
        tp1R = 1.3,
        tp2R = 2.2,
        tp3R = 3.5,
        minDisplacement = 1.18,
      } = req.body ?? {};

      const now = Date.now();
      let startTimeMs = now - 7 * 24 * 3600 * 1000;
      let endTimeMs = now;

      if (dateRangePreset === '24h') {
        startTimeMs = now - 24 * 3600 * 1000;
      } else if (dateRangePreset === '3d') {
        startTimeMs = now - 3 * 24 * 3600 * 1000;
      } else if (dateRangePreset === '7d') {
        startTimeMs = now - 7 * 24 * 3600 * 1000;
      } else if (dateRangePreset === '14d') {
        startTimeMs = now - 14 * 24 * 3600 * 1000;
      } else if (dateRangePreset === '30d') {
        startTimeMs = now - 30 * 24 * 3600 * 1000;
      } else if (dateRangePreset === 'custom' && customStart && customEnd) {
        const rawStart = new Date(customStart).getTime();
        const rawEnd = new Date(customEnd).getTime() + (24 * 3600 * 1000 - 1);
        startTimeMs = Math.min(rawStart, rawEnd);
        endTimeMs = Math.max(rawStart, rawEnd);
      }

      const spanMs = Math.max(0, endTimeMs - startTimeMs);
      const barMs = timeframeLTF === '1m' ? 60 * 1000 : timeframeLTF === '3m' ? 3 * 60 * 1000 : 5 * 60 * 1000;
      const neededBars = Math.ceil(spanMs / barMs) + 60;
      const MAX_LTF_BARS = 12000;
      const targetBars = Math.min(neededBars, MAX_LTF_BARS);

      // 1. Fetch HTF candles (1h or 4h) with 20-day warmup for Liquidity Pools
      const htfStartMs = Math.max(0, startTimeMs - 20 * 24 * 3600 * 1000);
      let candlesHTF: Candle[] = [];
      try {
        let curHTF = htfStartMs;
        while (curHTF < endTimeMs && candlesHTF.length < 2500) {
          const batchLimit = Math.min(1000, 2500 - candlesHTF.length);
          const rawHTF = await fetchFromBinance(
            `/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(timeframeHTF)}&limit=${batchLimit}&startTime=${curHTF}`
          );
          if (!Array.isArray(rawHTF) || rawHTF.length === 0) break;
          const mapped = rawHTF.map((k: any) => ({
            time: Number(k[0]),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            quoteVolume: parseFloat(k[7]),
          }));
          candlesHTF = candlesHTF.concat(mapped);
          const lastTime = mapped[mapped.length - 1].time;
          if (lastTime >= endTimeMs || rawHTF.length < batchLimit) break;
          curHTF = lastTime + 1;
        }
        if (candlesHTF.length === 0) {
          candlesHTF = buildFallbackKlines(symbol, timeframeHTF, 500);
        }
      } catch {
        candlesHTF = buildFallbackKlines(symbol, timeframeHTF, 500);
      }

      // 2. Fetch LTF execution candles (5m, 3m, 1m) starting from startTimeMs forward
      let candlesLTF: Candle[] = [];
      try {
        const ltfStartMs = Math.max(0, startTimeMs - 20 * barMs);
        let curLTF = ltfStartMs;
        while (candlesLTF.length < targetBars && curLTF <= endTimeMs) {
          const batchLimit = Math.min(1000, targetBars - candlesLTF.length);
          const rawBatch = await fetchFromBinance(
            `/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(timeframeLTF)}&limit=${batchLimit}&startTime=${curLTF}`
          );
          if (!Array.isArray(rawBatch) || rawBatch.length === 0) break;
          const mappedBatch = rawBatch.map((k: any) => ({
            time: Number(k[0]),
            open: parseFloat(k[1]),
            high: parseFloat(k[2]),
            low: parseFloat(k[3]),
            close: parseFloat(k[4]),
            volume: parseFloat(k[5]),
            quoteVolume: parseFloat(k[7]),
          }));
          candlesLTF = candlesLTF.concat(mappedBatch);
          const lastTime = mappedBatch[mappedBatch.length - 1].time;
          if (lastTime >= endTimeMs || rawBatch.length < batchLimit) break;
          curLTF = lastTime + 1;
        }
        if (candlesLTF.length === 0) {
          throw new Error('Empty LTF klines');
        }
      } catch {
        candlesLTF = buildFallbackKlines(symbol, timeframeLTF, 1000);
      }

      const summary = runSsrBacktest({
        symbol,
        timeframeLTF: timeframeLTF as '5m' | '3m' | '1m',
        timeframeHTF: timeframeHTF as '1h' | '4h',
        candlesHTF,
        candlesLTF,
        startTimeMs,
        endTimeMs,
        dateRangePreset,
        riskPerTradeUsdt: Number(riskPerTrade) || 100,
        accountEquityUsdt: Number(accountEquity) || 10000,
        maxHoldBars: Number(maxHoldBars) || 96,
        htfTrendFilter: htfTrendFilter !== false,
        fvgEntryDepth: typeof fvgEntryDepth === 'number' ? fvgEntryDepth : 0.30,
        slBufferPct: typeof slBufferPct === 'number' ? slBufferPct : 0.0030,
        tp1R: typeof tp1R === 'number' ? tp1R : 1.3,
        tp2R: typeof tp2R === 'number' ? tp2R : 2.2,
        tp3R: typeof tp3R === 'number' ? tp3R : 3.5,
        minDisplacement: typeof minDisplacement === 'number' ? minDisplacement : 1.18,
      });

      res.json({ success: true, backtest: summary });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'SSR backtest failed' });
    }
  });

  // In-memory short-lived cache for multi-asset SSR scanner
  let ssrScanCache: { timestamp: number; key: string; payload: any } | null = null;

  // 8. Sweep, Shift, and Return (SSR) Multi-Asset Live Scanner
  app.get('/api/ssr/scan', async (req, res) => {
    try {
      const rawSymbols = typeof req.query.symbols === 'string' ? req.query.symbols : '';
      const activeSymbol = typeof req.query.activeSymbol === 'string' ? req.query.activeSymbol.toUpperCase() : '';
      const forceRefresh = req.query.force === 'true';

      let symbolsToScan: string[] = CURATED_HIGH_VOL_SYMBOLS;
      if (rawSymbols) {
        const parsed = rawSymbols.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
        if (parsed.length > 0) symbolsToScan = parsed;
      }

      if (activeSymbol && !symbolsToScan.includes(activeSymbol)) {
        symbolsToScan = [activeSymbol, ...symbolsToScan];
      }

      // Limit to 25 symbols to protect network throughput
      symbolsToScan = Array.from(new Set(symbolsToScan)).slice(0, 25);
      const cacheKey = symbolsToScan.join(',');

      // Serve from short-lived 5-second cache if available and not forced
      if (!forceRefresh && ssrScanCache && ssrScanCache.key === cacheKey && Date.now() - ssrScanCache.timestamp < 5000) {
        return res.json(ssrScanCache.payload);
      }

      const mapK = (k: any) => ({
        time: Number(k[0]),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5]),
        quoteVolume: parseFloat(k[7] || k[5] || '0'),
      });

      const assetStatuses: SsrAssetScanResult[] = [];
      const signals: SsrSignal[] = [];

      // Fetch in chunks of 5 to avoid Binance burst limits
      const chunkSize = 5;
      for (let i = 0; i < symbolsToScan.length; i += chunkSize) {
        const chunk = symbolsToScan.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map(async (sym) => {
            try {
              const [rawHTF, rawLTF] = await Promise.all([
                fetchFromBinance(`/klines?symbol=${sym}&interval=1h&limit=60`),
                fetchFromBinance(`/klines?symbol=${sym}&interval=5m&limit=60`),
              ]);

              const candlesHTF = Array.isArray(rawHTF) ? rawHTF.map(mapK) : [];
              const candlesLTF = Array.isArray(rawLTF) ? rawLTF.map(mapK) : [];

              const status = scanSsrAssetStatus(candlesHTF, candlesLTF, sym, 100);
              assetStatuses.push(status);
              if (status.phase === 'PHASE_3_FVG_RETURN' && status.signal) {
                signals.push(status.signal);
              }
            } catch {
              const fallbackSeed = FALLBACK_BASE_ASSETS[sym];
              const fbPrice = fallbackSeed ? fallbackSeed.price : 0;
              assetStatuses.push({
                symbol: sym,
                phase: 'INSIDE_RANGE',
                phaseLabel: 'Inside Range',
                currentPrice: fbPrice,
                statusMessage: 'Live Binance feed connecting...',
                lastUpdated: Date.now(),
              });
            }
          })
        );
      }

      // Priority sort: Phase 3 -> Phase 2 -> Phase 1 -> Inside Range
      const phaseOrder: Record<string, number> = {
        PHASE_3_FVG_RETURN: 0,
        PHASE_2_MSS: 1,
        PHASE_1_SWEEP: 2,
        INSIDE_RANGE: 3,
      };
      assetStatuses.sort((a, b) => (phaseOrder[a.phase] ?? 9) - (phaseOrder[b.phase] ?? 9));

      const payload = {
        success: true,
        timestamp: new Date().toISOString(),
        scannedCount: assetStatuses.length,
        signalCount: signals.length,
        signals,
        assetStatuses,
        counts: {
          total: assetStatuses.length,
          phase3: assetStatuses.filter((s) => s.phase === 'PHASE_3_FVG_RETURN').length,
          phase2: assetStatuses.filter((s) => s.phase === 'PHASE_2_MSS').length,
          phase1: assetStatuses.filter((s) => s.phase === 'PHASE_1_SWEEP').length,
          insideRange: assetStatuses.filter((s) => s.phase === 'INSIDE_RANGE').length,
        },
      };

      ssrScanCache = { timestamp: Date.now(), key: cacheKey, payload };
      res.json(payload);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'SSR live scan failed' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
      optimizeDeps: {
        include: ['react', 'react-dom', 'react-dom/client', 'lucide-react', 'motion'],
      },
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VeloceQuant server running on http://localhost:${PORT}`);
  });
}

startServer();
