# CryptoPulse-AI (VeloceQuant) ⚡📈

An institutional-grade crypto quantitative trading terminal and algorithmic scanner featuring real-time market structure analysis, multi-timeframe Williams Fractal liquidity sweep detection, animated 3D agent telemetry, and historical backtesting with post-mortem failure diagnostics.

---

## 🚀 Key Features

- **Williams Fractal 4H Sweep & 5m Engulfing Engine**:
  - Pine Script v6 Williams Fractal algorithm ($n=2$ / 5-bar classic).
  - Detects 4H swing liquidity sweeps and confirms entries with high-displacement 5m engulfing candles.
  - Strict institutional quality gate filtering out low-grade Tier B+ signals (only Tier A and A+ setups).
  - Multi-tier take-profit allocation: TP1 1:2 (50% + breakeven lock), TP2 1:3 (25%), TP3 1:4 (25%).

- **Historical Backtest Simulator with Forensic Post-Mortems**:
  - Multi-window simulation: **24H**, **3D**, **7D**, **14D**, **30D**, and custom date ranges.
  - Live progress telemetry HUD with 4-stage pipeline checklist.
  - "If Failed, Why it Failed" automated failure mode classification (Trend Continuation, Secondary Sweep, Premature Engulfing, Choppy Range Absorption, Volume Deficit, High Slippage).
  - Mark-to-market trade settlement and trade-by-trade ledger with timestamps.

- **Real-Time Market Terminal & Depth Analytics**:
  - Live Binance Spot REST API integration with real-time candlestick charts.
  - Bid/Ask order book depth skew, wall visualization, and volume imbalance.
  - Break of Structure (BOS) and Change of Character (CHoCH) detection.

- **Interactive Position Sizing & Leverage Calculator**:
  - Calculates contracts, position margin, estimated liquidation price, and profit targets.
  - Real-time warnings when leverage pushes liquidation closer than stop loss.

- **Interactive 3D Quant Agent Face**:
  - Canvas-rendered 3D holographic agent with dynamic eye-tracking, scanning sweeps, and status pulses.

- **Hybrid AI Signal Engine**:
  - Dual integration with Kie.ai API and Google Gemini API for macroeconomic thesis synthesis, order book forensics, and quantitative strategy rationale.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS, Motion, Lucide Icons, Vite
- **Backend**: Node.js, Express, TSX, Binance Live Spot API
- **Testing**: Node.js Native Test Runner (`node --test`) with 30 comprehensive unit tests

---

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [Git](https://git-scm.com/)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/<your-username>/CryptoPulse-AI.git
   cd CryptoPulse-AI
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure Environment Variables**:
   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Add your API keys (optional for live AI synthesis; algorithmic quant baseline works out of the box):
   ```env
   PORT=3000
   GEMINI_API_KEY=your_gemini_api_key_here
   KIE_API_KEY=your_kie_api_key_here
   ```

4. **Start the Application**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

5. **Run Unit Tests**:
   ```bash
   node --import tsx --test src/utils/*.test.ts
   ```

6. **Production Build**:
   ```bash
   npm run build
   ```

---

## 📄 License

MIT License. Designed for quantitative algorithmic crypto research.
