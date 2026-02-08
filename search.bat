@echo off
echo Starting Interactive Category Search...
echo.
docker-compose run --rm -it app node dist/run/testCategorySearch.js
pause
