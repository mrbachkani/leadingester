@echo off
echo ============================================================
echo   OVERNIGHT LEAD BUILDER - India B2B Leads
echo ============================================================
echo.
echo This will search Google Maps for B2B companies across India.
echo Estimated time: 10-15 hours for full coverage.
echo The process will auto-resume if interrupted.
echo.
echo Press Ctrl+C to stop at any time (progress is saved).
echo.
pause

echo.
echo [1/3] Starting database, Redis, and enrichment workers...
docker-compose up -d
echo Waiting 15 seconds for workers to initialize...
timeout /t 15 /nobreak >nul

echo.
echo [2/3] Starting lead discovery (autoRunner)...
echo Workers are running in the background and will enrich leads as they are found.
echo.
docker-compose run --rm app node dist/run/autoRunner.js

echo.
echo [3/3] Waiting for enrichment workers to finish remaining jobs...
echo Giving workers 5 minutes to process any remaining queued jobs...
timeout /t 300 /nobreak >nul

echo.
echo Exporting final CSV with enriched data...
docker-compose run --rm app node dist/run/exportAll.js

echo.
echo ============================================================
echo   OVERNIGHT RUN COMPLETE
echo   Check data/exports/ for the master CSV file
echo   Workers are still running - run "docker-compose down" to stop
echo ============================================================
pause
