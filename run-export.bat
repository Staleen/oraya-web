@echo off
cd /d "%~dp0"
echo Running Oraya PDF export...
node docs\design\phase-16c\welcome-guide\export-reference-pdfs.js
echo.
echo Copying PDFs to workspace exports folder for easy review...
if not exist "..\..\..\..\exports" mkdir "..\..\..\..\exports"
copy /Y "docs\design\phase-16c\welcome-guide\exports\oraya-guide-print-byblos.pdf" "..\..\..\..\exports\oraya-guide-print-byblos.pdf"
copy /Y "docs\design\phase-16c\welcome-guide\exports\oraya-guide-print-mechmech.pdf" "..\..\..\..\exports\oraya-guide-print-mechmech.pdf"
echo.
echo Done. PDFs copied to oraya-web\exports\
pause
