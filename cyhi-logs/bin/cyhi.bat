@echo off
if exist "C:\ProgramData\anaconda3\python.exe" (
    "C:\ProgramData\anaconda3\python.exe" "%~dp0cyhi" %*
) else (
    py -3 "%~dp0cyhi" %* 2>nul || python "%~dp0cyhi" %*
)
