#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo ".venv nicht gefunden - erstelle virtuelles Python-Environment..."
    python3 -m venv .venv
    source .venv/bin/activate
    echo "Installiere Abhängigkeiten aus requirements.txt..."
    pip install -r requirements.txt
else
    echo ".venv gefunden - aktiviere virtuelles Environment..."
    source .venv/bin/activate
fi

echo "Starte App: http://127.0.0.1:5000"
python app.py
