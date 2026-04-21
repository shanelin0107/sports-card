#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Sports Card Intel - Starting ==="

# Kill existing processes on our ports
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Backend setup
echo ""
echo "--- Setting up Backend ---"
cd "$PROJECT_DIR/backend"

if [ ! -d ".venv" ]; then
  echo "Creating Python virtual environment..."
  python3 -m venv .venv
fi

source .venv/bin/activate
echo "Installing Python dependencies..."
pip install -q -r requirements.txt

echo "Starting FastAPI backend on http://localhost:8000 ..."
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Frontend setup
echo ""
echo "--- Setting up Frontend ---"
cd "$PROJECT_DIR/frontend"

if [ ! -d "node_modules" ]; then
  echo "Installing npm dependencies..."
  npm install
fi

echo "Starting Next.js frontend on http://localhost:3000 ..."
npm run dev &
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo ""
echo "==================================="
echo "  Backend:  http://localhost:8000"
echo "  Frontend: http://localhost:3000"
echo "  API docs: http://localhost:8000/docs"
echo "==================================="
echo ""
echo "Press Ctrl+C to stop both servers."

# Wait and handle shutdown
trap "echo 'Stopping...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
