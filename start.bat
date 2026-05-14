@echo off
echo ========================================
echo  ATC AI SYSTEM — Startup Script
echo ========================================
echo.
echo [1/2] Starting FastAPI backend on http://localhost:8000
echo       (WebSocket on ws://localhost:8000/ws)
echo.
cd /d "%~dp0backend"
start "ATC Backend" cmd /k "pip install -r requirements.txt && python -m uvicorn main:app --reload --port 8000"
echo.
echo [2/2] Starting React frontend on http://localhost:5173
echo.
cd /d "%~dp0frontend"
start "ATC Frontend" cmd /k "npm install && npm run dev"
echo.
echo ========================================
echo  Open http://localhost:5173 in browser
echo ========================================
pause
