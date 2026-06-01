@echo off
title V^&V Video Editor
echo.
echo  ================================================
echo   V^&V Video Editor
echo   http://localhost:5555
echo  ================================================
echo.

set PY=C:\Users\RaphaelHaim\AppData\Local\Programs\Python\Python312\python.exe

:: Install dependencies if needed
"%PY%" -m pip install flask openai-whisper requests --quiet --no-warn-script-location

:: Start the server
set PYTHONIOENCODING=utf-8
"%PY%" "%~dp0app.py"
pause
