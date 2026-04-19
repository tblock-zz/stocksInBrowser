from flask import Flask, jsonify, render_template, request
import yfinance as yf
from flask_cors import CORS
from fear_and_greed.cnn import get as get_fear_and_greed
import os

app = Flask(__name__, 
            template_folder=os.path.dirname(os.path.abspath(__file__)),
            static_folder='.',
            static_url_path='')
CORS(app)


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
    app.run(debug=True)
