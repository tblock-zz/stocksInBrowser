from flask import Flask, jsonify, render_template, request
import yfinance as yf
from flask_cors import CORS
from fear_and_greed.cnn import get as get_fear_and_greed
from datetime import datetime
import os

app = Flask(__name__, 
            template_folder=os.path.dirname(os.path.abspath(__file__)),
            static_folder='.',
            static_url_path='')
CORS(app)


def _append_live_candle(ticker, hist):
    """Ensure the last candle reflects the current trading day.

    Yahoo's daily history can lag intraday (e.g. missing today's candle or
    a stale cached close). If the newest candle is older than "today" in the
    exchange's timezone, append/replace a live candle built from real-time
    quote data.
    """
    try:
        info = ticker.get_info()
        price = info.get('regularMarketPrice')
        market_time = info.get('regularMarketTime')
        if price is None or not market_time:
            return

        tz = hist.index.tz
        market_day = datetime.fromtimestamp(market_time, tz=tz).date()
        last_day = hist.index[-1].date()

        live = {
            'Open': info.get('regularMarketOpen') or price,
            'High': info.get('regularMarketDayHigh') or price,
            'Low': info.get('regularMarketDayLow') or price,
            'Close': price
        }
        if live['Low'] > live['Close']:
            live['Low'] = live['Close']
        if live['High'] < live['Close']:
            live['High'] = live['Close']

        if market_day == last_day:
            # Replace the (possibly stale) candle of the current day.
            for col, val in live.items():
                hist.iloc[-1, hist.columns.get_loc(col)] = val
        elif market_day > last_day:
            import pandas as pd
            hist.loc[pd.Timestamp(market_day, tz=tz)] = live
    except Exception:
        # Live data is best-effort; historical data is still served.
        pass


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/stock/<symbol>')
def get_stock_data(symbol):
    """Fetch historical OHLCV data for a given stock symbol.
    
    Args:
        symbol: Stock ticker symbol (e.g., SPY, AAPL, BTC-USD)
        period: Query parameter specifying history length.
                Accepted values: '5y' (default), '10y', '15y', 'max'
    
    Returns:
        JSON array of daily OHLCV candle objects, or error response.
    """
    allowed_periods = {'5y': '5y', '10y': '10y', '15y': '15y', 'max': 'max'}
    period = request.args.get('period', '5y').lower()
    period = allowed_periods.get(period, '5y')
    
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period, interval="1d")
        
        if hist.empty:
            return jsonify({'error': 'No data found for symbol'}), 404

        _append_live_candle(ticker, hist)

        candles = []
        for date, row in hist.iterrows():
            candles.append({
                'date': date.strftime('%Y-%m-%d'),
                'open': round(row['Open'], 2),
                'close': round(row['Close'], 2),
                'high': round(row['High'], 2),
                'low': round(row['Low'], 2)
            })
        
        return jsonify(candles)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/stock_info/<symbol>')
def get_stock_info(symbol):
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info
        
        if not info or ('regularMarketPrice' not in info and 'previousClose' not in info and 'longName' not in info):
            return jsonify({'error': 'No substantial company information found'}), 404
            
        return jsonify(info)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/search')
def search_tickers():
    query = request.args.get('q', '').strip()
    if len(query) < 2:
        return jsonify([])
    
    try:
        search_obj = yf.Search(query)
        quotes = getattr(search_obj, 'quotes', [])
        results = []
        for q in quotes:
            symbol = q.get('symbol')
            if symbol:
                results.append({
                    'symbol': symbol,
                    'shortname': q.get('shortname', ''),
                    'longname': q.get('longname', ''),
                    'exchange': q.get('exchDisp', q.get('exchange', '')),
                    'type': q.get('typeDisp', q.get('quoteType', ''))
                })
        return jsonify(results)
    except Exception as e:
        return jsonify([]), 500


@app.route('/api/fear_and_greed')
def get_fear_and_greed_index():
    try:
        fg = get_fear_and_greed()
        return jsonify({
            'value': fg.value,
            'description': fg.description,
            'last_update': fg.last_update.isoformat()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    from waitress import serve
    serve(app, host='127.0.0.1', port=5000)
