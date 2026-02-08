@echo off
echo Exporting all leads to master CSV...
echo.
docker-compose run --rm app node dist/run/exportAll.js
echo.
echo Check data/exports/ for the CSV file.
pause
