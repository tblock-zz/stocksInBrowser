from flask import Flask, jsonify, render_template
import yfinance as yf
from flask_cors import CORS
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
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period="5y", interval="1d")
        
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


if __name__ == '__main__':
    app.run(debug=True)
