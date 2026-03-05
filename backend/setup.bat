@echo off
REM Windows 一键安装脚本
REM 用法：双击运行，或在命令提示符中执行

setlocal enabledelayedexpansion
set SCRIPT_DIR=%~dp0
set VENV_DIR=%SCRIPT_DIR%venv

echo === 实时语音转写插件 - Python 环境安装 ===
echo.

REM 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先从 https://www.python.org 安装 Python 3.10~3.12
    echo        安装时务必勾选 "Add Python to PATH"
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('python --version') do echo [OK] 检测到 %%i

REM 创建虚拟环境
echo.
echo 正在创建虚拟环境...
python -m venv "%VENV_DIR%"
echo [OK] 虚拟环境创建完成

REM 安装依赖
echo.
echo 正在安装 sherpa-onnx（约 150~300 MB，请耐心等待）...
"%VENV_DIR%\Scripts\pip" install --quiet --upgrade pip
"%VENV_DIR%\Scripts\pip" install sherpa-onnx -i https://pypi.org/simple/
"%VENV_DIR%\Scripts\pip" install websockets numpy
echo [OK] 所有依赖安装完成

REM 验证
"%VENV_DIR%\Scripts\python" -c "import sherpa_onnx; print('[OK] sherpa_onnx 导入成功')"

REM 输出 Python 路径
set PYTHON_PATH=%VENV_DIR%\Scripts\python.exe
echo.
echo ================================================
echo [OK] 安装完成！
echo.
echo 请将以下路径复制到插件设置 -^> 后端设置 -^> Python 路径：
echo.
echo   %PYTHON_PATH%
echo.
echo ================================================
pause
