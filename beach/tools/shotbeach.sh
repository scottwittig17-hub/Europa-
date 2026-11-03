#!/bin/bash
# usage: shotbeach.sh WORKTREE OUTDIR TAG JSON
cd "$1"
PORT=$(python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1])")
python3 -m http.server $PORT >/dev/null 2>&1 & SP=$!
sleep 1
cd /workspace/europa-repo-screens/beach && python3 shot.py $PORT "$2" "$3" "$4"
kill $SP
