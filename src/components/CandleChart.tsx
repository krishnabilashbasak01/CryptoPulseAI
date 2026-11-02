import React, { useState, useMemo } from 'react';
import {
  calculateSMA,
  calculateEMA,
  type Candle,
  type MarketStructureReport,
} from '../utils/quant';
import { calculateWilliamsFractals, type WilliamsFractalPoint } from '../utils/fractal';

interface CandleChartProps {
  symbol: string;
  interval: string;
  onIntervalChange: (interval: string) => void;
  candles: Candle[];
  structure: MarketStructureReport;
  activeSignalLevels?: {
    entry: number;
    stopLoss: number;
    takeProfit1: number;
    takeProfit2?: number;
    takeProfit3?: number;
  } | null;
  fourHourLevels?: {
    swingHigh: number;
    swingLow: number;
  } | null;
}

const INTERVALS = [
  { id: '1m', label: '1M' },
  { id: '5m', label: '5M' },
  { id: '15m', label: '15M' },
  { id: '1h', label: '1H' },
  { id: '4h', label: '4H' },
  { id: '1d', label: '1D' },
];

export const CandleChart: React.FC<CandleChartProps> = ({
  symbol,
  interval,
  onIntervalChange,
  candles,
  structure,
  activeSignalLevels,
  fourHourLevels,
}) => {
  const [showSMA20, setShowSMA20] = useState(true);
  const [showEMA50, setShowEMA50] = useState(true);
  const [showEMA200, setShowEMA200] = useState(true);
  const [showStructure, setShowStructure] = useState(true);
  const [showSignalZones, setShowSignalZones] = useState(true);
  const [showFractals, setShowFractals] = useState(true);
  const [show4HLevels, setShow4HLevels] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const closes = useMemo(() => candles.map((c) => c.close), [candles]);
  const sma20 = useMemo(() => calculateSMA(closes, 20), [closes]);
  const ema50 = useMemo(() => calculateEMA(closes, 50), [closes]);
  const ema200 = useMemo(
    () => calculateEMA(closes, Math.min(100, Math.max(10, candles.length - 1))),
    [closes, candles.length]
  );

  const fractals = useMemo(() => calculateWilliamsFractals(candles, 2), [candles]);

  const formatPrice = (p: number | undefined | null) => {
    if (typeof p !== 'number' || isNaN(p)) return '0.00';
    if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1) return p.toFixed(4);
    return p.toFixed(5);
  };

  if (candles.length === 0) {
    return (
      <div className="bg-[#111827] border border-slate-800 rounded-lg p-6 h-[420px] flex items-center justify-center text-slate-400 text-sm">
        Loading historical price action and moving averages for {symbol}...
      </div>
    );
  }

  const width = 920;
  const height = 380;
  const padLeft = 16;
  const padRight = 76;
  const padTop = 20;
  const padBottom = 68; // lower area for volume + time axis
  const priceHeight = height - padTop - padBottom;
  const chartWidth = width - padLeft - padRight;

  // Determine vertical price bounds
  const allPrices: number[] = [];
  candles.forEach((c) => {
    allPrices.push(c.high, c.low);
  });
  if (show4HLevels && fourHourLevels) {
    allPrices.push(fourHourLevels.swingHigh, fourHourLevels.swingLow);
  }
  if (showSignalZones && activeSignalLevels) {
    allPrices.push(
      activeSignalLevels.entry,
      activeSignalLevels.stopLoss,
      activeSignalLevels.takeProfit1
    );
    if (activeSignalLevels.takeProfit2) allPrices.push(activeSignalLevels.takeProfit2);
    if (activeSignalLevels.takeProfit3) allPrices.push(activeSignalLevels.takeProfit3);
  }

  const rawMin = Math.min(...allPrices);
  const rawMax = Math.max(...allPrices);
  const rangePad = (rawMax - rawMin) * 0.08 || rawMax * 0.02;
  const minPrice = rawMin - rangePad;
  const maxPrice = rawMax + rangePad;
  const priceSpan = Math.max(0.000001, maxPrice - minPrice);

  const maxVol = Math.max(...candles.map((c) => c.quoteVolume), 1);

  const xForIndex = (i: number) =>
    padLeft + (i / Math.max(1, candles.length - 1)) * chartWidth;
  const yForPrice = (p: number) =>
    padTop + ((maxPrice - p) / priceSpan) * priceHeight;

  const buildPolyline = (series: (number | null)[]) => {
    const pts: string[] = [];
    series.forEach((val, idx) => {
      if (val !== null && val >= minPrice && val <= maxPrice) {
        pts.push(`${xForIndex(idx).toFixed(1)},${yForPrice(val).toFixed(1)}`);
      }
    });
    return pts.join(' ');
  };

  const sma20Points = showSMA20 ? buildPolyline(sma20) : '';
  const ema50Points = showEMA50 ? buildPolyline(ema50) : '';
  const ema200Points = showEMA200 ? buildPolyline(ema200) : '';

  const activeIdx = hoverIdx !== null && hoverIdx < candles.length ? hoverIdx : candles.length - 1;
  const activeCandle = candles[activeIdx];
  const activeSma20 = sma20[activeIdx];
  const activeEma50 = ema50[activeIdx];
  const activeEma200 = ema200[activeIdx];

  const candleWidth = Math.max(2.5, Math.min(9, (chartWidth / candles.length) * 0.68));

  const gridPrices = [0, 0.25, 0.5, 0.75, 1].map((t) => maxPrice - t * priceSpan);

  return (
    <div className="bg-[#111827] border border-slate-800 rounded-lg p-5">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-200">{symbol.replace('USDT', '/USDT')}</span>
            <span aria-hidden="true">·</span>
            <span>Historical Price & Structure</span>
            <span aria-hidden="true">·</span>
            <span>{structure.structureLabel}</span>
          </div>
          {/* OHLCV Readout */}
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs font-mono tabular-nums">
            <span className="text-slate-400">
              O <strong className="text-slate-200 font-normal">{formatPrice(activeCandle.open)}</strong>
            </span>
            <span className="text-slate-400">
              H <strong className="text-slate-200 font-normal">{formatPrice(activeCandle.high)}</strong>
            </span>
            <span className="text-slate-400">
              L <strong className="text-slate-200 font-normal">{formatPrice(activeCandle.low)}</strong>
            </span>
            <span className="text-slate-400">
              C{' '}
              <strong
                className={`font-semibold ${
                  activeCandle.close >= activeCandle.open ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {formatPrice(activeCandle.close)}
              </strong>
            </span>
            {activeSma20 !== null && (
              <span className="text-amber-400">SMA20: {formatPrice(activeSma20)}</span>
            )}
            {activeEma50 !== null && (
              <span className="text-sky-400">EMA50: {formatPrice(activeEma50)}</span>
            )}
            {activeEma200 !== null && (
              <span className="text-violet-400">EMA200: {formatPrice(activeEma200)}</span>
            )}
          </div>
        </div>

        {/* Interactive Timeframe & Overlay Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-md"
            role="group"
            aria-label="Chart Timeframe"
          >
            {INTERVALS.map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => onIntervalChange(tf.id)}
                className={`px-2.5 py-1 text-xs font-mono font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  interval === tf.id
                    ? 'bg-sky-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf.label}
              </button>
            ))}
          </div>

          <div
            className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-md"
            role="group"
            aria-label="Technical Overlays"
          >
            <button
              type="button"
              onClick={() => setShowSMA20((v) => !v)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                showSMA20 ? 'bg-amber-500/20 text-amber-300' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              SMA 20
            </button>
            <button
              type="button"
              onClick={() => setShowEMA50((v) => !v)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                showEMA50 ? 'bg-sky-500/20 text-sky-300' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              EMA 50
            </button>
            <button
              type="button"
              onClick={() => setShowEMA200((v) => !v)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                showEMA200
                  ? 'bg-violet-500/20 text-violet-300'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              EMA 200
            </button>
            <button
              type="button"
              onClick={() => setShowStructure((v) => !v)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                showStructure
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              BOS / CHoCH
            </button>
            <button
              type="button"
              onClick={() => setShowFractals((v) => !v)}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                showFractals
                  ? 'bg-teal-500/20 text-teal-300'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Fractals ▲▼
            </button>
            {fourHourLevels && (
              <button
                type="button"
                onClick={() => setShow4HLevels((v) => !v)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  show4HLevels
                    ? 'bg-rose-500/20 text-rose-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                4H High/Low
              </button>
            )}
            {activeSignalLevels && (
              <button
                type="button"
                onClick={() => setShowSignalZones((v) => !v)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  showSignalZones
                    ? 'bg-indigo-500/20 text-indigo-300'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                AI Targets
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Interactive SVG Chart Canvas */}
      <div className="relative mt-3 select-none">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[350px] overflow-visible"
          role="img"
          aria-label={`Historical candlestick and moving average chart for ${symbol}`}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Horizontal Price Grid Lines */}
          {gridPrices.map((gp, i) => {
            const y = yForPrice(gp);
            return (
              <g key={i}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#1e293b"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={width - padRight + 8}
                  y={y + 4}
                  fill="#64748b"
                  fontSize="10"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {formatPrice(gp)}
                </text>
              </g>
            );
          })}

          {/* Structure Support & Resistance Lines */}
          {showStructure && (
            <>
              <line
                x1={padLeft}
                y1={yForPrice(structure.lastSwingHigh)}
                x2={width - padRight}
                y2={yForPrice(structure.lastSwingHigh)}
                stroke="#f43f5e"
                strokeOpacity="0.45"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={padLeft + 6}
                y={yForPrice(structure.lastSwingHigh) - 5}
                fill="#fda4af"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                Swing High Resistance · {formatPrice(structure.lastSwingHigh)}
              </text>

              <line
                x1={padLeft}
                y1={yForPrice(structure.lastSwingLow)}
                x2={width - padRight}
                y2={yForPrice(structure.lastSwingLow)}
                stroke="#10b981"
                strokeOpacity="0.45"
                strokeDasharray="4 4"
                strokeWidth="1"
              />
              <text
                x={padLeft + 6}
                y={yForPrice(structure.lastSwingLow) + 12}
                fill="#6ee7b7"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                Swing Low Support · {formatPrice(structure.lastSwingLow)}
              </text>
            </>
          )}

          {/* 4H Previous Swing High and Low Reference Lines (Rule 1) */}
          {show4HLevels && fourHourLevels && (
            <>
              <line
                x1={padLeft}
                y1={yForPrice(fourHourLevels.swingHigh)}
                x2={width - padRight}
                y2={yForPrice(fourHourLevels.swingHigh)}
                stroke="#f43f5e"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
              <text
                x={padLeft + 6}
                y={yForPrice(fourHourLevels.swingHigh) - 6}
                fill="#fda4af"
                fontSize="10"
                fontWeight="bold"
                fontFamily="JetBrains Mono, monospace"
              >
                4H Fractal High · ${formatPrice(fourHourLevels.swingHigh)}
              </text>

              <line
                x1={padLeft}
                y1={yForPrice(fourHourLevels.swingLow)}
                x2={width - padRight}
                y2={yForPrice(fourHourLevels.swingLow)}
                stroke="#10b981"
                strokeWidth="1.5"
                strokeDasharray="6 4"
              />
              <text
                x={padLeft + 6}
                y={yForPrice(fourHourLevels.swingLow) + 14}
                fill="#6ee7b7"
                fontSize="10"
                fontWeight="bold"
                fontFamily="JetBrains Mono, monospace"
              >
                4H Fractal Low · ${formatPrice(fourHourLevels.swingLow)}
              </text>
            </>
          )}

          {/* Williams Fractal Triangle Markers (Pine Script v6 Algorithm) */}
          {showFractals &&
            fractals.map((f, i) => {
              const x = xForIndex(f.index);
              if (f.type === 'UP_FRACTAL') {
                const y = yForPrice(f.price) - 6;
                return (
                  <polygon
                    key={`frac-up-${i}`}
                    points={`${x},${y - 8} ${x - 5},${y} ${x + 5},${y}`}
                    fill="#009688"
                  >
                    <title>Williams UpFractal: ${formatPrice(f.price)}</title>
                  </polygon>
                );
              } else {
                const y = yForPrice(f.price) + 6;
                return (
                  <polygon
                    key={`frac-down-${i}`}
                    points={`${x},${y + 8} ${x - 5},${y} ${x + 5},${y}`}
                    fill="#F44336"
                  >
                    <title>Williams DownFractal: ${formatPrice(f.price)}</title>
                  </polygon>
                );
              }
            })}

          {/* Active AI Signal Target Lines */}
          {showSignalZones && activeSignalLevels && (
            <>
              <line
                x1={padLeft}
                y1={yForPrice(activeSignalLevels.takeProfit1)}
                x2={width - padRight}
                y2={yForPrice(activeSignalLevels.takeProfit1)}
                stroke="#10b981"
                strokeWidth="1.2"
              />
              <text
                x={width - padRight - 115}
                y={yForPrice(activeSignalLevels.takeProfit1) - 5}
                fill="#34d399"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                TP1 (1:2) {formatPrice(activeSignalLevels.takeProfit1)}
              </text>

              {activeSignalLevels.takeProfit2 && (
                <>
                  <line
                    x1={padLeft}
                    y1={yForPrice(activeSignalLevels.takeProfit2)}
                    x2={width - padRight}
                    y2={yForPrice(activeSignalLevels.takeProfit2)}
                    stroke="#059669"
                    strokeWidth="1"
                    strokeDasharray="4 2"
                  />
                  <text
                    x={width - padRight - 115}
                    y={yForPrice(activeSignalLevels.takeProfit2) - 5}
                    fill="#6ee7b7"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    TP2 (1:3) {formatPrice(activeSignalLevels.takeProfit2)}
                  </text>
                </>
              )}

              {activeSignalLevels.takeProfit3 && (
                <>
                  <line
                    x1={padLeft}
                    y1={yForPrice(activeSignalLevels.takeProfit3)}
                    x2={width - padRight}
                    y2={yForPrice(activeSignalLevels.takeProfit3)}
                    stroke="#047857"
                    strokeWidth="1"
                    strokeDasharray="4 2"
                  />
                  <text
                    x={width - padRight - 115}
                    y={yForPrice(activeSignalLevels.takeProfit3) - 5}
                    fill="#a7f3d0"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    TP3 (1:4) {formatPrice(activeSignalLevels.takeProfit3)}
                  </text>
                </>
              )}

              <line
                x1={padLeft}
                y1={yForPrice(activeSignalLevels.stopLoss)}
                x2={width - padRight}
                y2={yForPrice(activeSignalLevels.stopLoss)}
                stroke="#ef4444"
                strokeWidth="1.2"
              />
              <text
                x={width - padRight - 115}
                y={yForPrice(activeSignalLevels.stopLoss) - 5}
                fill="#f87171"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                SL {formatPrice(activeSignalLevels.stopLoss)}
              </text>
            </>
          )}

          {/* Volume Histogram in lower band */}
          {candles.map((c, idx) => {
            const x = xForIndex(idx);
            const volMaxH = 42;
            const barH = Math.max(2, (c.quoteVolume / maxVol) * volMaxH);
            const y = height - 22 - barH;
            const isBull = c.close >= c.open;
            return (
              <rect
                key={`vol-${c.time}`}
                x={x - candleWidth / 2}
                y={y}
                width={candleWidth}
                height={barH}
                fill={isBull ? '#10b981' : '#f43f5e'}
                fillOpacity="0.24"
              />
            );
          })}

          {/* Candlesticks */}
          {candles.map((c, idx) => {
            const x = xForIndex(idx);
            const yHigh = yForPrice(c.high);
            const yLow = yForPrice(c.low);
            const yOpen = yForPrice(c.open);
            const yClose = yForPrice(c.close);
            const bodyTop = Math.min(yOpen, yClose);
            const bodyHeight = Math.max(1.5, Math.abs(yClose - yOpen));
            const isBull = c.close >= c.open;
            const color = isBull ? '#10b981' : '#f43f5e';

            return (
              <g
                key={c.time}
                onMouseEnter={() => setHoverIdx(idx)}
                className="cursor-crosshair"
              >
                <line x1={x} y1={yHigh} x2={x} y2={yLow} stroke={color} strokeWidth="1.1" />
                <rect
                  x={x - candleWidth / 2}
                  y={bodyTop}
                  width={candleWidth}
                  height={bodyHeight}
                  fill={color}
                  rx="0.5"
                />
                {/* Invisible wider hit target for smooth hover */}
                <rect
                  x={x - chartWidth / candles.length / 2}
                  y={padTop}
                  width={chartWidth / candles.length}
                  height={height - padTop - 20}
                  fill="transparent"
                />
              </g>
            );
          })}

          {/* Moving Average Polylines */}
          {showEMA200 && ema200Points && (
            <polyline
              fill="none"
              stroke="#a78bfa"
              strokeWidth="1.6"
              points={ema200Points}
            />
          )}
          {showEMA50 && ema50Points && (
            <polyline
              fill="none"
              stroke="#38bdf8"
              strokeWidth="1.6"
              points={ema50Points}
            />
          )}
          {showSMA20 && sma20Points && (
            <polyline
              fill="none"
              stroke="#fbbf24"
              strokeWidth="1.8"
              points={sma20Points}
            />
          )}

          {/* Structure Break Markers (BOS / CHoCH) */}
          {showStructure &&
            structure.events.map((ev, i) => {
              const x = xForIndex(ev.index);
              const y = yForPrice(ev.price);
              const isBull = ev.type.includes('BULL') || ev.type === 'SWING_LOW';
              return (
                <g key={`${ev.type}-${i}`}>
                  <circle
                    cx={x}
                    cy={y}
                    r="3.5"
                    fill={isBull ? '#10b981' : '#f43f5e'}
                    stroke="#0b101b"
                    strokeWidth="1.5"
                  />
                  <text
                    x={Math.min(width - padRight - 48, Math.max(padLeft + 4, x - 18))}
                    y={isBull ? y - 8 : y + 14}
                    fill={isBull ? '#34d399' : '#fb7185'}
                    fontSize="10"
                    fontWeight="600"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {ev.label}
                  </text>
                </g>
              );
            })}

          {/* Hover Crosshair */}
          {hoverIdx !== null && hoverIdx < candles.length && (
            <line
              x1={xForIndex(hoverIdx)}
              y1={padTop}
              x2={xForIndex(hoverIdx)}
              y2={height - 22}
              stroke="#94a3b8"
              strokeDasharray="2 2"
              strokeWidth="1"
              pointerEvents="none"
            />
          )}

          {/* Time Axis Labels */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
            const idx = Math.min(candles.length - 1, Math.floor(pct * (candles.length - 1)));
            const c = candles[idx];
            if (!c) return null;
            const d = new Date(c.time);
            const label =
              interval === '1d'
                ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}`;
            return (
              <text
                key={i}
                x={xForIndex(idx)}
                y={height - 6}
                textAnchor="middle"
                fill="#64748b"
                fontSize="10"
                fontFamily="JetBrains Mono, monospace"
              >
                {label}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Structure & Moving Average Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 mt-2 border-t border-slate-800/80 text-xs">
        <div>
          <span className="text-slate-400">Trend Transition: </span>
          <span className="font-mono text-slate-200 font-medium">
            {structure.previousTrend} → {structure.currentTrend}
          </span>
          <p className="text-slate-400 mt-1 leading-relaxed">{structure.structureDescription}</p>
        </div>
        <div>
          <span className="text-slate-400">Moving Average Alignment: </span>
          <span className="font-mono text-slate-200 font-medium">
            {structure.maAlignment.replace('_', ' ')}
          </span>
          <p className="text-slate-400 mt-1 font-mono tabular-nums">
            SMA20: {structure.sma20Current ? formatPrice(structure.sma20Current) : '—'} · EMA50:{' '}
            {structure.ema50Current ? formatPrice(structure.ema50Current) : '—'}
          </p>
        </div>
        <div>
          <span className="text-slate-400">Current Volatility & RSI: </span>
          <span className="font-mono text-slate-200 font-medium">
            {structure.volatilityRegime} (ATR {structure.atrPercent}%)
          </span>
          <p className="text-slate-400 mt-1 font-mono tabular-nums">
            RSI(14): {structure.rsi14} · Sup: {formatPrice(structure.nearestSupport)} · Res:{' '}
            {formatPrice(structure.nearestResistance)}
          </p>
        </div>
      </div>
    </div>
  );
};
