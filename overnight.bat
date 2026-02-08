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
docker-compose run --rm app node dist/run/autoRunner.js
echo.
echo ============================================================
echo   OVERNIGHT RUN COMPLETE
echo   Check data/exports/ for the master CSV file
echo ============================================================
pause
