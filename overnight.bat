@echo off
echo ============================================================
echo   OVERNIGHT LEAD BUILDER - India B2B Leads
echo   FRESH START - All data collected from scratch
echo ============================================================
echo.
echo This will search Google Maps for B2B companies across India.
echo Estimated time: 10-15 hours for full coverage.
echo.
echo Enriched leads are saved to the CSV in REAL-TIME as they
echo are found - no data loss even if interrupted.
echo.
echo Output: data\exports\india_leads_latest.csv
echo.
echo Press Ctrl+C to stop at any time.
echo.
pause

echo.
echo [1/5] Starting database, Redis, and enrichment workers...
docker-compose up -d
echo Waiting 15 seconds for services to initialize...
timeout /t 15 /nobreak >nul

echo.
echo [2/5] Resetting all previous search progress (fresh start)...
docker-compose run --rm app node dist/run/resetProgress.js --all

echo.
echo [3/5] Clearing old CSV files...
del /q "data\exports\india_leads_latest.csv" 2>nul
del /q "data\exports\india_leads_snapshot.csv" 2>nul
echo Old CSV files cleared.

echo.
echo [4/5] Starting lead discovery (autoRunner)...
echo Workers are running in the background and will enrich leads as they are found.
echo Enriched leads appear in data\exports\india_leads_latest.csv in real-time.
echo.
docker-compose run --rm app node dist/run/autoRunner.js

echo.
echo [5/5] Waiting for enrichment workers to finish remaining jobs...
echo Giving workers 10 minutes to process any remaining queued jobs...
timeout /t 600 /nobreak >nul

echo.
echo ============================================================
echo   OVERNIGHT RUN COMPLETE
echo   Enriched leads: data\exports\india_leads_latest.csv
echo   Full snapshot:  data\exports\india_leads_snapshot.csv
echo.
echo   Workers are still running - run "docker-compose down" to stop
echo ============================================================
pause
