# Stock Candlestick Chart Application

A full-stack web application for interactive stock analysis, featuring candlestick charts, multiple technical indicators, company information display, and customizable layouts.

## Features

- **Interactive Candlestick Chart**: Real-time rendering of stock data via Yahoo Finance (`yfinance`).
- **Technical Indicators**:
    - **Moving Averages**: SMA 20, 50, and 200 calculated on the fly.
    - **Bollinger Bands**: 20-period standard deviation bands centered around SMA 20.
    - **Oscillators**: RSI (14), Stochastic (14, 3, 3), and MACD (12, 26, 9) in separate synchronized panes.
- **Fibonacci Retracement Tool**: Precision-drawn retracement levels (0%, 23.6%, 38.2%, 50%, 61.8%, 100%) with color-coded zones.
- **Resizable Subplots**: Vertical layout using `Split.js` with draggable horizontal dividers.
- **Advanced Navigation**:
    - **Synchronized X-Axis**: Pan and zoom across all panels simultaneously.
    - **Smart Scaling**: Independent Y-axis scaling via `ALT + Scroll` over any specific panel.
- **Company Information Display**: Comprehensive company details including sector, industry, market cap, P/E ratio, earnings dates, and analyst recommendations.
- **Responsive Design**: Dark-themed UI that adapts to different screen sizes.

## Project Structure

- `app.py`: Flask backend serving the application and providing APIs to fetch historical stock data and company information from Yahoo Finance.
    - `/api/stock/<symbol>`: Returns 5 years of OHLCV data with indicators
    - `/api/stock_info/<symbol>`: Returns comprehensive company information (sector, industry, market cap, P/E ratio, earnings dates, recommendations, etc.)
- `index.html`: Main application interface, including the structure for Plotly.js charts and company information display section.
- `app.js`: Core frontend logic, implementing technical analysis calculations, chart rendering, event synchronization, Fibonacci tools, and company info loading with formatting helpers.
- `style.css`: Custom dark-theme styling, including layout management, Split.js gutter configurations, and responsive company info grid display.
- `requirements.txt`: Python dependencies for the backend.

## Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/tblock-zz/stocksInBrowser.git
   cd stocksInBrowser
   ```

2. **Create and activate a virtual environment**:
   ```bash
   # Create the virtual environment
   python -m venv .venv

   # Activate it (Linux/macOS)
   source .venv/bin/activate

   # Activate it (Windows)
   .venv\Scripts\activate
   ```

3. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
   *(Note: Requirements include `flask`, `flask-cors`, and `yfinance`)*

4. **Launch the server**:
   ```bash
   python app.py
   ```

5. **Access the application**:
   Open your browser and navigate to `http://127.0.0.1:5000`.

## Usage

- **Loading Data**: Enter a ticker symbol (e.g., `SPY`, `BTC-USD`) in the input field and click **Load Chart**.
- **Company Information**: After loading chart data, company information is automatically displayed below the charts with details like sector, industry, market cap, P/E ratio, earnings dates, and analyst recommendations.
- **Navigation**:
    - **Zoom**: Left-click and drag to draw a zoom box.
    - **Pan**: Right-click and drag (or select Pan from the modebar).
    - **Reset View**: Double-click anywhere on the chart.
- **Advanced Tools**:
    - **Fibonacci**: Hold `CTRL` (or `CMD`) and **Left-Click twice** on the price chart to set anchor points.
    - **Y-Axis Scale**: Hold `ALT` and **Scroll the Mouse Wheel** over a specific pane to enlarge or shrink its vertical range.
- **Customizing Layout**: Click and drag the horizontal divider lines between the charts to adjust their relative sizes.

## Architecture

### Backend
- **Framework**: Python Flask
- **Data Provider**: `yfinance` library fetching 5 years of historical OHLCV data.
- **Data Flow**: The backend serves as a proxy, fetching raw data from Yahoo Finance and providing a JSON API for the frontend.

### Frontend
- **Visualization**: Plotly.js for high-performance interactive charting.
- **Layout**: Split.js for responsive, draggable panel management.
- **Logic**: Vanilla JavaScript handles indicator mathematics (MACD, RSI, Stoch), event synchronization, and state management.

### Technical Layers
1. **Data Layer**: Fetches 5 years of history to ensure indicators like SMA 200 are fully calculated from the start of the visible 2-year window.
2. **Calculation Layer**: Client-side implementation of technical analysis algorithms.
3. **Sync Layer**: Propagates X-axis changes (pan/zoom/reset) across all subplots to keep indicators aligned with price.

### Company Information
- **Data Source**: Yahoo Finance via `yfinance` library
- **Displayed Fields**:
    - Basic Info: Sector, Industry, Website, Currency
    - Financial Metrics: Market Cap, Shares Outstanding, P/E Ratio (Trailing/Forward), EPS (TTM/Forward), Beta
    - Dividend Info: Dividend Rate, Dividend Yield, Dividend Payout Ratio, Ex-Dividend Date
    - Price Data: 52-Week High/Low, Average Volume, Current/Regular Market Price, Open, Previous Close, Day High/Low
    - Earnings: Earnings Date (next expected earnings report)
    - Analyst Ratings: Recommendation (Buy, Hold, Sell, etc.)
- **Formatting**: Smart number formatting with M/B/K suffixes for large numbers and date conversion from Unix timestamps.
