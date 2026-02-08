@echo off
start "Lead Discovery Tool" cmd /c "docker-compose run --rm -it app node dist/run/testCategorySearch.js && pause"
