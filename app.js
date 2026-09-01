document.addEventListener('DOMContentLoaded', function() {
    const tickerInput = document.getElementById('tickerInput');
    const loadBtn = document.getElementById('loadBtn');
    const errorMsg = document.getElementById('errorMsg');
    const chartPrice = document.getElementById('chartPrice');
    const chartRSI = document.getElementById('chartRSI');
    const chartStoch = document.getElementById('chartStoch');
    const chartMACD = document.getElementById('chartMACD');
    
    // Company Info elements
    const companyInfoWrapper = document.getElementById('companyInfoWrapper');
    const companyName = document.getElementById('companyName');
    const companyDetails = document.getElementById('companyDetails');
    const companySummary = document.getElementById('companySummary');
    const fearGreedSection = document.getElementById('fearGreedSection');
    const fearGreedBar = document.getElementById('fearGreedBar');
    const fearGreedValue = document.getElementById('fearGreedValue');
    const fearGreedLabel = document.getElementById('fearGreedLabel');
    const fearGreedDate = document.getElementById('fearGreedDate');
    const tickerDropdown = document.getElementById('tickerDropdown');

    let splitInstance = null;
    let mouseDownPoint = null;
    let isWeekly = false;
    let weeklyData = null;
    // Cached 5-year daily data from the originally loaded symbol
    let cachedDailyData = null;
    let originalSymbol = null;
    // Cached extended daily data (10y+) for better SMA visibility when switching back to daily
    let cachedExtendedDailyData = null;
    // History period to fetch when in weekly mode (default: 10y for better SMA 200 visibility)
    let weeklyHistoryPeriod = '10y';
    // Ticker search state
    let searchAbortController = null;
    let searchDebounceTimer = null;

    // Set default symbol and auto-load
    tickerInput.value = 'SPY';
    fetchAndRender('SPY', '5y');

    // Event listeners
    loadBtn.addEventListener('click', () => {
        const symbol = tickerInput.value.trim().toUpperCase();
        if (symbol) {
            // Reset cache when user explicitly loads a new symbol
            cachedDailyData = null;
            originalSymbol = null;
            fetchAndRender(symbol, '5y');
        }
    });

    tickerInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const symbol = tickerInput.value.trim().toUpperCase();
            if (symbol) {
                // Reset cache when user explicitly loads a new symbol
                cachedDailyData = null;
                originalSymbol = null;
                fetchAndRender(symbol, '5y');
            }
        }
    });

    tickerInput.addEventListener('input', () => {
        const query = tickerInput.value.trim();
        
        if (query.length < 2) {
            tickerDropdown.style.display = 'none';
            return;
        }
        
        // Cancel previous search
        if (searchAbortController) {
            searchAbortController.abort();
        }
        
        // Debounce
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            searchTicker(query);
        }, 300);
    });

    tickerInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            tickerDropdown.style.display = 'none';
        }
    });

    document.addEventListener('click', (e) => {
        if (!tickerInput.contains(e.target) && !tickerDropdown.contains(e.target)) {
            tickerDropdown.style.display = 'none';
        }
    });

    const weeklyToggleBtn = document.getElementById('weeklyToggle');
    weeklyToggleBtn.addEventListener('click', () => {
        isWeekly = !isWeekly;
        weeklyToggleBtn.textContent = isWeekly ? 'Daily' : 'Weekly';
        weeklyToggleBtn.classList.toggle('active', isWeekly);
        if (isWeekly) {
            // Fetch longer history for better SMA 200 visibility in weekly mode
            const symbol = tickerInput.value.trim().toUpperCase();
            fetchAndRender(symbol, weeklyHistoryPeriod);
        } else {
            // Switch back to daily — use cached data (prefer extended 10y for better SMA visibility)
            const currentSymbol = tickerInput.value.trim().toUpperCase();
            const dailyData = cachedExtendedDailyData || cachedDailyData;
            if (currentSymbol === originalSymbol && dailyData) {
                renderChart(dailyData, currentSymbol);
            } else {
                fetchAndRender(currentSymbol, '5y');
            }
        }
    });

    async function fetchAndRender(symbol, period) {
        errorMsg.textContent = '';
        
        try {
            // Append timestamp to prevent browser caching
            const response = await fetch(`/api/stock/${symbol}?t=${Date.now()}&period=${period}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to fetch stock data');
            }

            if (data.length === 0) {
                throw new Error('No data found for this symbol');
            }

            // Initialize Split.js on first load
            if (!splitInstance) {
                splitInstance = Split(['#chartPrice', '#chartRSI', '#chartStoch', '#chartMACD'], {
                    direction: 'vertical',
                    sizes: [55, 15, 10, 20],
                    minSize: 50,
                    gutterSize: 6,
                    cursor: 'row-resize',
                    onDrag: () => {
                        Plotly.Plots.resize(chartPrice);
                        Plotly.Plots.resize(chartRSI);
                        Plotly.Plots.resize(chartStoch);
                        Plotly.Plots.resize(chartMACD);
                    }
                });
            }

            // Cache the 5-year daily data from the originally loaded symbol
            if (!originalSymbol) {
                cachedDailyData = data;
                originalSymbol = symbol;
            }
            // Cache extended daily data when fetching more history for weekly mode
            if (period !== '5y') {
                cachedExtendedDailyData = data;
            }
            
            weeklyData = aggregateToWeekly(data);
            
            renderChart(isWeekly ? weeklyData : data, symbol);
            
            // Load company info
            loadCompanyInfo(symbol);
            loadFearAndGreed();

        } catch (error) {
            errorMsg.textContent = `Error: ${error.message}`;
            chartPrice.innerHTML = '';
            chartRSI.innerHTML = '';
            chartStoch.innerHTML = '';
            chartMACD.innerHTML = '';
            companyInfoWrapper.style.display = 'none';
        }
    }
    
    async function loadCompanyInfo(symbol) {
        try {
            const response = await fetch(`/api/stock_info/${symbol}?t=${Date.now()}`);
            
            if (!response.ok) {
                companyInfoWrapper.style.display = 'none';
                return;
            }
            
            const info = await response.json();
            
            if (info.error) {
                companyInfoWrapper.style.display = 'none';
                return;
            }
            
            // Populate company info
            companyName.textContent = `--- ${info.longName || symbol} (${symbol}) ---`;
            
            companyDetails.innerHTML = '';

            const safeUrl = (url) => {
                try {
                    const parsed = new URL(url, window.location.origin);
                    return (parsed.protocol === 'http:' || parsed.protocol === 'https:') ? parsed.href : null;
                } catch {
                    return null;
                }
            };
            const websiteUrl = safeUrl(info.website);

            const infoMap = {
                "Sector": info.sector,
                "Industry": info.industry,
                "Website": websiteUrl,
                "Currency": info.currency,
                "Market Cap": formatNumber(info.marketCap),
                "Shares Outstanding": formatNumber(info.sharesOutstanding),
                "P/E Ratio": formatValue(info.trailingPE),
                "Forward P/E": formatValue(info.forwardPE),
                "EPS (TTM)": formatValue(info.trailingEps),
                "Forward EPS": formatValue(info.forwardEps),
                "Beta": formatValue(info.beta),
                "Dividend Rate": formatValue(info.dividendRate),
                "Dividend Yield": formatValue(info.dividendYield),
                "Dividend payout ratio": formatValue(info.payoutRatio),
                "Ex-Dividend Date": formatDate(info.exDividendDate),
                "52 Week High": formatValue(info.fiftyTwoWeekHigh),
                "52 Week Low": formatValue(info.fiftyTwoWeekLow),
                "Avg. Volume": formatNumber(info.averageVolume),
                "Current Price": formatValue(info.currentPrice),
                "Regular Market Price": formatValue(info.regularMarketPrice),
                "Open": formatValue(info.open),
                "Previous Close": formatValue(info.previousClose),
                "Day High": formatValue(info.dayHigh),
                "Day Low": formatValue(info.dayLow),
                "Earnings Date": formatEarningsDate(info.earningsTimestampStart),
                "Recommendation": info.recommendationKey ? info.recommendationKey.charAt(0).toUpperCase() + info.recommendationKey.slice(1) : null
            };
            
            for (const [label, value] of Object.entries(infoMap)) {
                if (value !== null && value !== undefined && value !== 'N/A') {
                    const detailDiv = document.createElement('div');
                    detailDiv.className = 'info-item';

                    const labelEl = document.createElement('strong');
                    labelEl.textContent = `${label}:`;
                    detailDiv.appendChild(labelEl);

                    if (label === 'Website') {
                        detailDiv.appendChild(document.createTextNode(' '));
                        const link = document.createElement('a');
                        link.href = value;
                        link.textContent = value;
                        link.target = '_blank';
                        link.rel = 'noopener noreferrer';
                        detailDiv.appendChild(link);
                    } else {
                        const valueEl = document.createElement('span');
                        valueEl.textContent = ` ${value}`;
                        detailDiv.appendChild(valueEl);
                    }

                    companyDetails.appendChild(detailDiv);
                }
            }
            
            if (info.longBusinessSummary) {
                companySummary.textContent = info.longBusinessSummary;
                document.querySelector('.company-summary').style.display = 'block';
            } else {
                document.querySelector('.company-summary').style.display = 'none';
            }
            
            companyInfoWrapper.style.display = 'block';
            
        } catch (error) {
            console.error("Failed to load company info:", error);
            companyInfoWrapper.style.display = 'none';
        }
    }
    
    async function loadFearAndGreed() {
        try {
            const response = await fetch(`/api/fear_and_greed?t=${Date.now()}`);
            if (!response.ok) {
                fearGreedSection.style.display = 'none';
                return;
            }
            const fg = await response.json();
            if (fg.error) {
                fearGreedSection.style.display = 'none';
                return;
            }
            
            const value = fg.value;
            const clampedValue = Math.max(0, Math.min(100, value));
            const percentage = (clampedValue / 100) * 100;
            
            fearGreedBar.style.setProperty('--bar-pos', percentage + '%');
            fearGreedBar.style.background = `linear-gradient(to right, #d32f2f 0%, #f44336 12.5%, #ff9800 25%, #fff176 37.5%, #f6f6f6 50%, #fff176 62.5%, #4caf50 75%, #2e7d32 87.5%, #1b5e20 100%)`;
            
            const indicator = fearGreedBar.querySelector('.fg-indicator') || document.createElement('div');
            indicator.className = 'fg-indicator';
            indicator.style.cssText = `position:absolute;top:50%;width:20px;height:20px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);background:#fff;transform:translate(-50%,-50%);left:${percentage}%;transition:left 0.5s ease;`;
            if (!fearGreedBar.querySelector('.fg-indicator')) {
                fearGreedBar.appendChild(indicator);
            } else {
                indicator.style.left = percentage + '%';
            }
            
            let color, label;
            if (clampedValue < 20) { color = '#d32f2f'; label = 'Extreme Fear'; }
            else if (clampedValue < 40) { color = '#f44336'; label = 'Fear'; }
            else if (clampedValue < 60) { color = '#ff9800'; label = 'Neutral'; }
            else if (clampedValue < 80) { color = '#4caf50'; label = 'Greed'; }
            else { color = '#2e7d32'; label = 'Extreme Greed'; }
            
            fearGreedValue.textContent = Math.round(clampedValue);
            fearGreedValue.style.color = color;
            fearGreedLabel.textContent = label;
            fearGreedLabel.style.color = color;
            
            if (fg.last_update) {
                const d = new Date(fg.last_update);
                fearGreedDate.textContent = 'Last update: ' + d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            }
            
            fearGreedSection.style.display = 'block';
            
        } catch (error) {
            console.error("Failed to load Fear & Greed index:", error);
            fearGreedSection.style.display = 'none';
        }
    }
    
    async function searchTicker(query) {
        if (searchAbortController) {
            searchAbortController.abort();
        }
        searchAbortController = new AbortController();
        
        try {
            const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&t=${Date.now()}`, {
                signal: searchAbortController.signal
            });
            
            if (!response.ok) {
                tickerDropdown.style.display = 'none';
                return;
            }
            
            const results = await response.json();
            renderTickerDropdown(results);
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("Ticker search failed:", error);
            }
        }
    }
    
    function renderTickerDropdown(results) {
        if (!results || results.length === 0) {
            tickerDropdown.style.display = 'none';
            return;
        }
        
        tickerDropdown.innerHTML = '';
        
        for (const item of results) {
            const div = document.createElement('div');
            div.className = 'ticker-search-item';
            
            const symbolSpan = document.createElement('span');
            symbolSpan.className = 'item-symbol';
            symbolSpan.textContent = item.symbol;
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'item-name';
            nameSpan.textContent = item.longname || item.shortname || '';
            
            const exchangeSpan = document.createElement('span');
            exchangeSpan.className = 'item-exchange';
            exchangeSpan.textContent = `${item.exchange} · ${item.type}`;
            
            div.appendChild(symbolSpan);
            div.appendChild(nameSpan);
            div.appendChild(exchangeSpan);
            
            div.addEventListener('click', () => {
                tickerInput.value = item.symbol;
                tickerDropdown.style.display = 'none';
                cachedDailyData = null;
                originalSymbol = null;
                fetchAndRender(item.symbol, '5y');
            });
            
            tickerDropdown.appendChild(div);
        }
        
        tickerDropdown.style.display = 'block';
    }
    
    function formatValue(val) {
        if (val === null || val === undefined) return 'N/A';
        if (typeof val === 'number') return val.toFixed(2);
        return val;
    }
    
    function formatNumber(num) {
        if (num === null || num === undefined) return 'N/A';
        if (num >= 1000000000) {
            return (num / 1000000000).toFixed(2) + 'B';
        }
        if (num >= 1000000) {
            return (num / 1000000).toFixed(2) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(2) + 'K';
        }
        return num.toLocaleString();
    }
    
    function formatDate(timestamp) {
        if (!timestamp) return 'N/A';
        const date = new Date(timestamp * 1000);
        return date.toISOString().split('T')[0];
    }

    function formatEarningsDate(earningsStart) {
        if (earningsStart === null || earningsStart === undefined) return 'N/A';
        
        let tsValue = null;
        if (Array.isArray(earningsStart) && earningsStart.length > 0) {
            const numericValues = earningsStart.filter(v => typeof v === 'number');
            if (numericValues.length > 0) {
                tsValue = Math.min(...numericValues);
            }
        } else if (typeof earningsStart === 'number') {
            tsValue = earningsStart;
        }
        
        if (tsValue !== null) {
            return formatDate(tsValue);
        }
        return 'N/A';
    }

    // Get ISO week key for a date string (e.g., "2025-W15")
    // Uses ISO week numbering to handle跨年 weeks correctly
    function getWeekKey(dateStr) {
        const date = new Date(dateStr + 'T00:00:00');
        const year = date.getFullYear();
        const jan1 = new Date(year, 0, 1);
        const daysSinceJan1 = Math.floor((date - jan1) / (24 * 60 * 60 * 1000));
        const weekNum = Math.ceil((daysSinceJan1 + jan1.getDay() + 1) / 7);
        return `${year}-W${String(weekNum).padStart(2, '0')}`;
    }

    // Aggregate daily OHLCV data into weekly candles grouped by ISO week key
    // Open = first trading day, Close = last trading day, High = max, Low = min
    function aggregateToWeekly(dailyData) {
        const weeks = new Map();
        
        for (const daily of dailyData) {
            const weekKey = getWeekKey(daily.date);
            
            if (!weeks.has(weekKey)) {
                weeks.set(weekKey, {
                    date: weekKey,
                    open: daily.open,
                    close: daily.close,
                    high: daily.high,
                    low: daily.low,
                });
            } else {
                const existing = weeks.get(weekKey);
                existing.close = daily.close;
                existing.high = Math.max(existing.high, daily.high);
                existing.low = Math.min(existing.low, daily.low);
            }
        }
        
        return Array.from(weeks.values())
            .sort((a, b) => a.date.localeCompare(b.date));
    }

    function calculateSMA(values, period) {
        const sma = [];
        for (let i = 0; i < values.length; i++) {
            if (i < period - 1) {
                sma.push(null); // Not enough data yet
            } else {
                let sum = 0;
                for (let j = 0; j < period; j++) {
                    sum += values[i - j];
                }
                sma.push(sum / period);
            }
        }
        return sma;
    }

    function calculateStandardDeviation(values, period) {
        const stdDev = [];
        for (let i = 0; i < values.length; i++) {
            if (i < period - 1) {
                stdDev.push(null); // Not enough data yet
            } else {
                let sum = 0;
                for (let j = 0; j < period; j++) {
                    sum += values[i - j];
                }
                const mean = sum / period;
                let sqDiffSum = 0;
                for (let j = 0; j < period; j++) {
                    sqDiffSum += Math.pow(values[i - j] - mean, 2);
                }
                stdDev.push(Math.sqrt(sqDiffSum / period));
            }
        }
        return stdDev;
    }

    function calculateEMA(values, period) {
        const ema = [];
        const multiplier = 2 / (period + 1);
        
        // Find first non-null index
        let firstIdx = 0;
        while(firstIdx < values.length && values[firstIdx] === null) {
            ema.push(null);
            firstIdx++;
        }
        
        if (firstIdx >= values.length) return ema;

        // Start with SMA for the first valid value
        let sum = 0;
        let count = 0;
        for (let i = firstIdx; i < Math.min(firstIdx + period, values.length); i++) {
            sum += values[i];
            count++;
            if (count < period) {
                ema.push(null);
            } else {
                ema.push(sum / period);
            }
        }
        
        // Calculate EMA for the rest
        for (let i = firstIdx + period; i < values.length; i++) {
            const currentVal = values[i];
            const prevEma = ema[i - 1];
            ema.push((currentVal - prevEma) * multiplier + prevEma);
        }
        
        return ema;
    }

    function calculateMACD(closes) {
        const ema12 = calculateEMA(closes, 12);
        const ema26 = calculateEMA(closes, 26);
        
        const macdLine = [];
        for (let i = 0; i < closes.length; i++) {
            if (ema12[i] !== null && ema26[i] !== null) {
                macdLine.push(ema12[i] - ema26[i]);
            } else {
                macdLine.push(null);
            }
        }
        
        const signalLine = calculateEMA(macdLine, 9);
        
        const histogram = [];
        for (let i = 0; i < closes.length; i++) {
            if (macdLine[i] !== null && signalLine[i] !== null) {
                histogram.push(macdLine[i] - signalLine[i]);
            } else {
                histogram.push(null);
            }
        }
        
        return { macdLine, signalLine, histogram };
    }

    function calculateRSI(closes, period = 14) {
        const rsi = [];
        let gains = 0;
        let losses = 0;

        for (let i = 0; i < closes.length; i++) {
            if (i < period) {
                rsi.push(null);
                if (i > 0) {
                    const diff = closes[i] - closes[i - 1];
                    if (diff > 0) gains += diff;
                    else losses -= diff;
                }
                if (i === period - 1) {
                    gains /= period;
                    losses /= period;
                }
            } else {
                const diff = closes[i] - closes[i - 1];
                let currentGain = 0;
                let currentLoss = 0;
                if (diff > 0) currentGain = diff;
                else currentLoss = -diff;

                gains = (gains * (period - 1) + currentGain) / period;
                losses = (losses * (period - 1) + currentLoss) / period;

                if (losses === 0) {
                    rsi.push(100);
                } else {
                    const rs = gains / losses;
                    rsi.push(100 - (100 / (1 + rs)));
                }
            }
        }
        return rsi;
    }

    function calculateStochastic(highs, lows, closes, period = 14, smoothK = 3, smoothD = 3) {
        const fastK = [];
        for (let i = 0; i < closes.length; i++) {
            if (i < period - 1) {
                fastK.push(null);
            } else {
                let highestHigh = highs[i];
                let lowestLow = lows[i];
                for (let j = 0; j < period; j++) {
                    if (highs[i - j] > highestHigh) highestHigh = highs[i - j];
                    if (lows[i - j] < lowestLow) lowestLow = lows[i - j];
                }
                if (highestHigh === lowestLow) {
                    fastK.push(50);
                } else {
                    fastK.push(((closes[i] - lowestLow) / (highestHigh - lowestLow)) * 100);
                }
            }
        }

        const slowK = calculateSMA(fastK, smoothK);
        const slowD = calculateSMA(slowK, smoothD);

        return { k: slowK, d: slowD };
    }

    function renderChart(data, symbol) {
        console.log('Rendering chart with', data.length, 'data points');
        // Format dates to YY-MM-DD to save space
        const dates = data.map(d => d.date.substring(2));
        const closes = data.map(d => d.close);
        const highs = data.map(d => d.high);
        const lows = data.map(d => d.low);

        // Show last ~2 years (or all available if less)
        // A year has roughly 252 trading days. 2 years = 504 trading days.
        const targetVisiblePoints = 504;
        const startIdx = data.length >= targetVisiblePoints ? data.length - targetVisiblePoints : 0;
        
        // Find Y-axis min and max for the visible 2 years to set the initial Y-range
        const visibleClosesForYAxis = closes.slice(startIdx);
        const yMin = Math.min(...visibleClosesForYAxis) * 0.95; // 5% padding
        const yMax = Math.max(...visibleClosesForYAxis) * 1.05; // 5% padding

        // We no longer slice the data so the user can pan back in time!
        const visibleData = data;
        const visibleDates = dates;
        const visibleCloses = closes;

        // Calculate SMAs on FULL data
        const sma10 = calculateSMA(closes, 10);
        const sma50 = calculateSMA(closes, 50);
        const sma20 = calculateSMA(closes, 20);
        const sma200 = calculateSMA(closes, 200);

        // We use full arrays for traces
        const sma10Visible = sma10;
        const sma50Visible = sma50;
        const sma20Visible = sma20;
        const sma200Visible = sma200;

        // Bollinger Bands (20 periods) on full data
        const bbPeriod = 20;
        const stdDev20 = calculateStandardDeviation(closes, bbPeriod);
        const upperBBVisible = sma20.map((s, i) => s === null ? null : s + 2 * stdDev20[i]);
        const lowerBBVisible = sma20.map((s, i) => s === null ? null : s - 2 * stdDev20[i]);

        // Determine candle colors
        const increasingColor = '#26a69a';
        const decreasingColor = '#ef5350';

        // Additional Indicators
        const macdData = calculateMACD(closes);
        const rsiData = calculateRSI(closes);
        const stochData = calculateStochastic(highs, lows, closes);

        // MACD Traces
        const macdLineTrace = {
            type: 'scatter', x: visibleDates, y: macdData.macdLine, mode: 'line',
            line: { color: '#2962FF' }, name: 'MACD', yaxis: 'y4'
        };
        const macdSignalTrace = {
            type: 'scatter', x: visibleDates, y: macdData.signalLine, mode: 'line',
            line: { color: '#FF6D00' }, name: 'Signal', yaxis: 'y4'
        };
        const macdHistogramTrace = {
            type: 'bar', x: visibleDates, y: macdData.histogram,
            marker: { color: macdData.histogram.map(h => h >= 0 ? increasingColor : decreasingColor) },
            name: 'Histogram', yaxis: 'y4'
        };

        // RSI Trace
        const rsiTrace = {
            type: 'scatter', x: visibleDates, y: rsiData, mode: 'line',
            line: { color: '#AA00FF' }, name: 'RSI', yaxis: 'y2'
        };
        const rsiOverbought = { type: 'scatter', x: visibleDates, y: Array(visibleDates.length).fill(70), mode: 'line', line: { color: '#757575', dash: 'dash' }, name: 'RSI 70', yaxis: 'y2', hoverinfo: 'none' };
        const rsiOversold = { type: 'scatter', x: visibleDates, y: Array(visibleDates.length).fill(30), mode: 'line', line: { color: '#757575', dash: 'dash' }, name: 'RSI 30', yaxis: 'y2', hoverinfo: 'none' };

        // Stochastic Traces
        const stochKTrace = {
            type: 'scatter', x: visibleDates, y: stochData.k, mode: 'line',
            line: { color: '#2962FF' }, name: '%K', yaxis: 'y3'
        };
        const stochDTrace = {
            type: 'scatter', x: visibleDates, y: stochData.d, mode: 'line',
            line: { color: '#FF6D00' }, name: '%D', yaxis: 'y3'
        };
        const stochOverbought = { type: 'scatter', x: visibleDates, y: Array(visibleDates.length).fill(80), mode: 'line', line: { color: '#757575', dash: 'dash' }, name: 'Stoch 80', yaxis: 'y3', hoverinfo: 'none' };
        const stochOversold = { type: 'scatter', x: visibleDates, y: Array(visibleDates.length).fill(20), mode: 'line', line: { color: '#757575', dash: 'dash' }, name: 'Stoch 20', yaxis: 'y3', hoverinfo: 'none' };

        // Candlestick trace (visible data only)
        const candleTrace = {
            type: 'candlestick',
            x: visibleDates,
            open: visibleData.map(d => d.open),
            close: visibleCloses,
            high: visibleData.map(d => d.high),
            low: visibleData.map(d => d.low),
            increasing: { line: { color: increasingColor } },
            decreasing: { line: { color: decreasingColor } },
            hoverlabel: {
                bgcolor: '#1a1a2e',
                bordercolor: '#4fc3f7',
                font: { color: '#e0e0e0' }
            },
            name: 'Candlesticks'
        };

        // SMA 200 (primary trend)
        const sma200Trace = {
            type: 'scatter',
            x: visibleDates,
            y: sma200Visible,
            mode: 'line',
            line: { color: '#e91e63', width: 2 },
            name: 'SMA 200',
            hoverlabel: {
                bgcolor: '#1a1a2e',
                bordercolor: '#e91e63',
                font: { color: '#e0e0e0' }
            }
        };

        // Upper Bollinger Band trace
        const upperTrace = {
            type: 'scatter',
            x: visibleDates,
            y: upperBBVisible,
            mode: 'line',
            line: { color: '#ff9800', width: 1, dash: 'dot' },
            name: 'Upper BB (2σ)',
            hoverlabel: {
                bgcolor: '#1a1a2e',
                bordercolor: '#ff9800',
                font: { color: '#e0e0e0' }
            }
        };

        // SMA 50 trace
        const sma50Trace = {
            type: 'scatter',
            x: visibleDates,
            y: sma50Visible,
            mode: 'line',
            line: { color: '#4caf50', width: 1 },
            name: 'SMA 50',
            hoverlabel: {
                bgcolor: '#1a1a2e',
                bordercolor: '#4caf50',
                font: { color: '#e0e0e0' }
            }
        };

        // SMA 20 trace
        const sma20Trace = {
            type: 'scatter',
            x: visibleDates,
            y: sma20Visible,
            mode: 'line',
            line: { color: '#2196f3', width: 1 },
            name: 'SMA 20',
            hoverlabel: {
                bgcolor: '#1a1a2e',
                bordercolor: '#2196f3',
                font: { color: '#e0e0e0' }
            }
        };

        // Lower Bollinger Band trace
        const lowerTrace = {
            type: 'scatter',
            x: visibleDates,
            y: lowerBBVisible,
            mode: 'line',
            line: { color: '#ff9800', width: 1, dash: 'dot' },
            name: 'Lower BB (2σ)',
            hoverlabel: {
                bgcolor: '#1a1a2e',
                bordercolor: '#ff9800',
                font: { color: '#e0e0e0' }
            }
        };

        // Base layout template
        const baseLayout = {
            plot_bgcolor: '#25253d',
            paper_bgcolor: '#25253d',
            margin: { l: 60, r: 30, t: 10, b: 20 },
            showlegend: false,
            dragmode: 'zoom',
            xaxis: {
                rangeslider: { visible: false },
                gridcolor: '#4a4a6a',
                tickfont: { color: '#b0b0c0' },
                type: 'category',
                range: [startIdx, data.length - 1] // Sync across all
            }
        };

        // Weekly view: show fewer X-axis ticks (monthly)
        if (isWeekly) {
            const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            const monthlyTickDates = [];
            let lastLabel = '';
            for (let i = 0; i < visibleDates.length; i++) {
                const weekKey = visibleData[i].date;
                const [yearStr, weekStr] = weekKey.split('-W');
                const weekNum = parseInt(weekStr);
                const year = parseInt(yearStr);
                const monthIdx = Math.min(11, Math.floor((weekNum - 1) / 4.345));
                const label = monthNames[monthIdx] + ' ' + String(year).slice(2);
                if (label !== lastLabel) {
                    monthlyTickDates.push({ step: i, label: label });
                    lastLabel = label;
                }
            }
            if (monthlyTickDates.length > 0) {
                baseLayout.xaxis.tickvals = monthlyTickDates.map(t => t.step);
                baseLayout.xaxis.ticktext = monthlyTickDates.map(t => t.label);
            }
        }

        const config = {
            responsive: true,
            displayModeBar: false,
        };

        // Price Chart
        const layoutPrice = JSON.parse(JSON.stringify(baseLayout));
        layoutPrice.title = { text: `${symbol} Price`, font: { size: 14, color: '#e0e0e0' } };
        layoutPrice.margin.t = 40;
        layoutPrice.margin.b = 40; // Extra bottom margin for hover date display
        layoutPrice.xaxis.showticklabels = false; // Hide x-axis labels
        layoutPrice.yaxis = {
            gridcolor: '#4a4a6a',
            tickfont: { color: '#b0b0c0' },
            range: [yMin, yMax],
            fixedrange: false
        };

        // RSI Chart
        const layoutRSI = JSON.parse(JSON.stringify(baseLayout));
        layoutRSI.xaxis.showticklabels = false; // Hide x-axis labels
        layoutRSI.yaxis = {
            gridcolor: '#4a4a6a', tickfont: { color: '#b0b0c0' }, title: { text: 'RSI', font: { color: '#e0e0e0', size: 10 } },
            range: [0, 100], fixedrange: false
        };
        rsiTrace.yaxis = 'y'; rsiOverbought.yaxis = 'y'; rsiOversold.yaxis = 'y';

        // Stochastic Chart
        const layoutStoch = JSON.parse(JSON.stringify(baseLayout));
        layoutStoch.xaxis.showticklabels = false; // Hide x-axis labels
        layoutStoch.yaxis = {
            gridcolor: '#4a4a6a', tickfont: { color: '#b0b0c0' }, title: { text: 'Stoch', font: { color: '#e0e0e0', size: 10 } },
            range: [0, 100], fixedrange: false
        };
        stochKTrace.yaxis = 'y'; stochDTrace.yaxis = 'y'; stochOverbought.yaxis = 'y'; stochOversold.yaxis = 'y';

        // MACD Chart
        const layoutMACD = JSON.parse(JSON.stringify(baseLayout));
        // Keep x-axis labels ONLY on the bottom MACD chart, but add enough bottom margin to prevent clipping
        layoutMACD.margin.b = 60; // Increased to 60 to be absolutely safe
        layoutMACD.yaxis = {
            gridcolor: '#4a4a6a', tickfont: { color: '#b0b0c0' }, title: { text: 'MACD', font: { color: '#e0e0e0', size: 10 } },
            fixedrange: false
        };
        macdLineTrace.yaxis = 'y'; macdSignalTrace.yaxis = 'y'; macdHistogramTrace.yaxis = 'y';

        Promise.all([
            Plotly.newPlot('chartPrice', [candleTrace, sma200Trace, upperTrace, sma50Trace, sma20Trace, lowerTrace], layoutPrice, config),
            Plotly.newPlot('chartRSI', [rsiOverbought, rsiOversold, rsiTrace], layoutRSI, config),
            Plotly.newPlot('chartStoch', [stochOverbought, stochOversold, stochKTrace, stochDTrace], layoutStoch, config),
            Plotly.newPlot('chartMACD', [macdHistogramTrace, macdLineTrace, macdSignalTrace], layoutMACD, config)
        ]).then(() => {
            const chartPriceEl = document.getElementById('chartPrice');
            const chartRSIEl = document.getElementById('chartRSI');
            const chartStochEl = document.getElementById('chartStoch');
            const chartMACDEl = document.getElementById('chartMACD');

            // Sync X-Axis Pan/Zoom across all charts
            let isSyncing = false;
            function syncCharts(sourceChart, targetCharts) {
                if (!sourceChart || !sourceChart.on) return;
                sourceChart.on('plotly_relayout', (event) => {
                    if (isSyncing) return;
                    
                    const update = {};
                    let hasXUpdate = false;

                    // Sync any property related to the x-axis (range, autorange, etc.)
                    for (let key in event) {
                        if (key.startsWith('xaxis')) {
                            update[key] = event[key];
                            hasXUpdate = true;
                        }
                    }

                    if (hasXUpdate) {
                        isSyncing = true;
                        const promises = targetCharts.map(chart => {
                            if (chart) return Plotly.relayout(chart, update);
                        }).filter(Boolean);
                        
                        Promise.all(promises).then(() => {
                            isSyncing = false;
                        }).catch(() => {
                            isSyncing = false;
                        });
                    }
                });
            }

            syncCharts(chartPriceEl, [chartRSIEl, chartStochEl, chartMACDEl]);
            syncCharts(chartRSIEl, [chartPriceEl, chartStochEl, chartMACDEl]);
            syncCharts(chartStochEl, [chartPriceEl, chartRSIEl, chartMACDEl]);
            syncCharts(chartMACDEl, [chartPriceEl, chartRSIEl, chartStochEl]);

            // Alt + Scroll Zoom Functionality (Y-axis)
            [chartPriceEl, chartRSIEl, chartStochEl, chartMACDEl].forEach(el => {
                if (!el) return;
                el.addEventListener('wheel', (e) => {
                    if (e.altKey) {
                        e.preventDefault();
                        const fullLayout = el._fullLayout;
                        if (!fullLayout || !fullLayout.yaxis) return;
                        
                        const range = fullLayout.yaxis.range;
                        const start = range[0];
                        const end = range[1];
                        const center = (start + end) / 2;
                        const height = end - start;
                        
                        // Zoom factor: DeltaY > 0 is scroll down (shrink height), < 0 is scroll up (enlarge height)
                        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
                        const newHeight = height * zoomFactor;
                        
                        const newRange = [
                            center - newHeight / 2,
                            center + newHeight / 2
                        ];
                        
                        Plotly.relayout(el, { 'yaxis.range': newRange });
                    }
                }, { passive: false });
            });

            // Add resize observer to allow the user to drag the CSS resize handle and redraw the Plotly chart
            const resizeObserver = new ResizeObserver(() => {
                if (chartPriceEl) Plotly.Plots.resize(chartPriceEl);
                if (chartRSIEl) Plotly.Plots.resize(chartRSIEl);
                if (chartStochEl) Plotly.Plots.resize(chartStochEl);
                if (chartMACDEl) Plotly.Plots.resize(chartMACDEl);
            });
            resizeObserver.observe(document.getElementById('mainWrapper'));

            let mouseDownPoint = null;
            
            if (chartPriceEl && chartPriceEl.on) {
                chartPriceEl.on('plotly_click', function(data) {
            console.log('Plotly click event:', data);
            
            // Check if Ctrl key is pressed
            const ctrlKeyPressed = data.event && (data.event.ctrlKey || data.event.metaKey);
            console.log('Ctrl key pressed:', ctrlKeyPressed);
            
            if (ctrlKeyPressed) {
                const point = data.points[0];
                
                // Get the exact Y coordinate from the mouse position
                const yAxis = chartPriceEl._fullLayout.yaxis;
                const mouseY = data.event.offsetY !== undefined ? data.event.offsetY : data.event.layerY;
                const exactY = yAxis.p2d(mouseY - yAxis._offset);
                
                if (!mouseDownPoint) {
                    // Store the resolved exact y-value in the point object
                    point.resolvedY = exactY;
                    mouseDownPoint = point;
                    errorMsg.textContent = 'Click again for second point';
                    
                    Plotly.relayout(chartPriceEl, {
                        shapes: [{
                            type: 'line',
                            xref: 'x',
                            yref: 'y',
                            x0: mouseDownPoint.x,
                            y0: mouseDownPoint.resolvedY,
                            x1: mouseDownPoint.x,
                            y1: mouseDownPoint.resolvedY,
                            line: { color: '#9c27b0', width: 2 }
                        }],
                        annotations: []
                    });
                } else {
                    const secondPoint = point;
                    secondPoint.resolvedY = exactY;
                    
                    addFibonacciLevels(mouseDownPoint, secondPoint, visibleDates, visibleCloses, chartPriceEl);
                    
                    mouseDownPoint = null;
                    errorMsg.textContent = 'Fibonacci levels added successfully';
                }
            }
        });

        chartPriceEl.on('plotly_unhover', function() {
            // Optional: Handle unhover if needed
        });
    }
}).catch(err => {
    console.error('Plotly rendering error:', err);
});
}

function addFibonacciLevels(start, end, visibleDates, visibleCloses, chartPriceEl) {
        if (!start || !end) return;

        const startY = parseFloat(start.resolvedY);
        const endY = parseFloat(end.resolvedY);
        
        const shapes = [];
        const annotations = [];
        
        const fibLevels = [0, 23.6, 38.2, 50, 61.8, 100];
        
        let prices = fibLevels.map(level => {
            return {
                level: level,
                // Simple logical mapping: 100% is startY, 0% is endY
                price: endY - (endY - startY) * (level / 100)
            };
        });

        // Sort by price descending (highest price first) to handle colors from top to bottom
        prices.sort((a, b) => b.price - a.price);

        // We have 6 levels, so 5 intervals. Colors from red (top) to green (bottom)
        const regionColors = [
            'rgba(255, 0, 0, 0.15)',     // Top (Red)
            'rgba(255, 128, 0, 0.15)',   // Orange
            'rgba(255, 255, 0, 0.15)',   // Yellow
            'rgba(128, 255, 0, 0.15)',   // Light Green
            'rgba(0, 255, 0, 0.15)'      // Bottom (Green)
        ];
        
        const firstDate = visibleDates[0];
        const lastDate = visibleDates[visibleDates.length - 1];
        
        // Draw colored regions spanning the whole chart
        for (let i = 0; i < prices.length - 1; i++) {
            const upper = prices[i];
            const lower = prices[i + 1];

            shapes.push({
                type: 'rect',
                xref: 'x',
                yref: 'y',
                x0: firstDate,
                y0: upper.price,
                x1: lastDate,
                y1: lower.price,
                fillcolor: regionColors[i],
                line: { width: 0 },
                layer: 'below'
            });
        }

        // Draw lines and annotations spanning the whole chart
        prices.forEach(item => {
            shapes.push({
                type: 'line',
                xref: 'x',
                yref: 'y',
                x0: firstDate,
                y0: item.price,
                x1: lastDate,
                y1: item.price,
                line: { 
                    color: '#9c27b0', 
                    width: 1, 
                    dash: 'dash' 
                }
            });

            annotations.push({
                xref: 'x',
                yref: 'y',
                x: lastDate,
                y: item.price,
                text: item.level + '%',
                showarrow: false,
                font: { 
                    color: '#9c27b0', 
                    size: 12
                },
                xanchor: 'right',
                yanchor: 'bottom'
            });
        });

        // Add trend line marking the original click points
        shapes.push({
            type: 'line',
            xref: 'x',
            yref: 'y',
            x0: start.x,
            y0: startY,
            x1: end.x,
            y1: endY,
            line: { color: '#9c27b0', width: 2 }
        });

        Plotly.relayout(chartPrice, { shapes: shapes, annotations: annotations });
    }
});
