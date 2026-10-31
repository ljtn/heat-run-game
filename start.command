#!/bin/bash
# Double-click to play HEAT RUN (serves the game locally and opens your browser)
cd "$(dirname "$0")"
PORT=8777
while lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT+1)); done
echo "HEAT RUN running at http://localhost:$PORT/index.html  (close this window to stop)"
( sleep 1; open "http://localhost:$PORT/index.html" ) &
exec python3 -m http.server $PORT --bind 127.0.0.1
