#!/bin/bash

# PyAnnote Setup Script
# This script automates the PyAnnote installation process

set -e  # Exit on any error

echo "🚀 PyAnnote Speaker Diarization Setup"
echo "======================================"

# Check if we're in the scripts directory
if [ ! -f "requirements.txt" ]; then
    echo "❌ Error: Please run this script from the scripts directory"
    echo "   Usage: cd scripts && ./setup_pyannote.sh"
    exit 1
fi

# Find the best Python version for PyTorch compatibility
echo "🔍 Finding compatible Python version..."

PYTHON_CMD=""
for py_cmd in python3.12 python3.11 /opt/homebrew/bin/python3.12 /opt/homebrew/bin/python3.11 python3; do
    if command -v $py_cmd >/dev/null 2>&1; then
        PY_VERSION=$($py_cmd --version 2>&1 | cut -d' ' -f2 | cut -d'.' -f1-2)
        echo "   Found $py_cmd (Python $PY_VERSION)"
        
        # Prefer 3.11 or 3.12 for PyTorch compatibility
        if [[ "$PY_VERSION" == "3.11" ]] || [[ "$PY_VERSION" == "3.12" ]]; then
            PYTHON_CMD=$py_cmd
            echo "   ✅ Using $PYTHON_CMD (compatible with PyTorch)"
            break
        elif [[ "$PY_VERSION" == "3.10" ]] || [[ "$PY_VERSION" == "3.9" ]]; then
            PYTHON_CMD=$py_cmd
            echo "   ✅ Using $PYTHON_CMD (should work with PyTorch)"
            break
        elif [[ "$PY_VERSION" == "3.13" ]]; then
            PYTHON_CMD=$py_cmd
            echo "   ⚠️ Using $PYTHON_CMD (may need nightly PyTorch builds)"
        fi
    fi
done

if [[ -z "$PYTHON_CMD" ]]; then
    echo "❌ Error: No suitable Python found"
    echo "   Please install Python 3.11 or 3.12:"
    echo "   brew install python@3.12"
    exit 1
fi

echo "   Selected: $PYTHON_CMD"

# Setup virtual environment
echo "📦 Setting up virtual environment..."
if [ -d "pyannote_env" ]; then
    echo "   Virtual environment already exists"
    read -p "   Remove and recreate? (y/N): " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf pyannote_env
        echo "   Removed existing environment"
    fi
fi

if [ ! -d "pyannote_env" ]; then
    echo "   Creating virtual environment..."
    $PYTHON_CMD -m venv pyannote_env
    echo "   ✅ Virtual environment created"
fi

# Activate virtual environment
echo "🔧 Activating virtual environment..."
source pyannote_env/bin/activate

# Upgrade pip
echo "📦 Upgrading pip..."
pip install --upgrade pip wheel

# Install PyTorch first (required for PyAnnote)
echo "📦 Installing PyTorch..."
echo "   This may take several minutes..."

# Try stable version first, fallback to nightly for newer Python versions
if ! pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu; then
    echo "   Stable PyTorch failed, trying nightly build for Python 3.13..."
    pip install --pre torch torchaudio --index-url https://download.pytorch.org/whl/nightly/cpu
fi

# Install other dependencies
echo "📦 Installing PyAnnote and other dependencies..."
pip install -r requirements.txt

# Test installation
echo "🧪 Testing installation..."
if python test_pyannote.py > /dev/null 2>&1; then
    echo "   ✅ PyAnnote test passed"
else
    echo "   ⚠️ PyAnnote test had issues, but basic installation completed"
fi

# Get the absolute path for the Python executable
VENV_PYTHON=$(pwd)/pyannote_env/bin/python
PROJECT_ROOT=$(dirname $(pwd))

echo ""
echo "🎉 Setup Complete!"
echo "=================="
echo ""
echo "Next steps:"
echo "1. Add this to your .env file in the project root:"
echo "   PYANNOTE_PYTHON_PATH=$VENV_PYTHON"
echo ""
echo "2. Or export temporarily:"
echo "   export PYANNOTE_PYTHON_PATH=\"$VENV_PYTHON\""
echo ""
echo "3. Restart your Next.js application to pick up the new environment variable"
echo ""

# Check if .env file exists and offer to add the variable
if [ -f "$PROJECT_ROOT/.env" ]; then
    read -p "Add PYANNOTE_PYTHON_PATH to .env file automatically? (y/N): " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Remove any existing PYANNOTE_PYTHON_PATH entries
        grep -v "PYANNOTE_PYTHON_PATH" "$PROJECT_ROOT/.env" > "$PROJECT_ROOT/.env.tmp" 2>/dev/null || true
        mv "$PROJECT_ROOT/.env.tmp" "$PROJECT_ROOT/.env" 2>/dev/null || true
        
        # Add the new path
        echo "PYANNOTE_PYTHON_PATH=$VENV_PYTHON" >> "$PROJECT_ROOT/.env"
        echo "✅ Added to .env file"
    fi
elif [ -f "$PROJECT_ROOT/.env.local" ]; then
    read -p "Add PYANNOTE_PYTHON_PATH to .env.local file automatically? (y/N): " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Remove any existing PYANNOTE_PYTHON_PATH entries
        grep -v "PYANNOTE_PYTHON_PATH" "$PROJECT_ROOT/.env.local" > "$PROJECT_ROOT/.env.local.tmp" 2>/dev/null || true
        mv "$PROJECT_ROOT/.env.local.tmp" "$PROJECT_ROOT/.env.local" 2>/dev/null || true
        
        # Add the new path
        echo "PYANNOTE_PYTHON_PATH=$VENV_PYTHON" >> "$PROJECT_ROOT/.env.local"
        echo "✅ Added to .env.local file"
    fi
else
    echo "4. Create a .env file in the project root if it doesn't exist"
fi

echo ""
echo "🎯 To test PyAnnote availability, upload a new podcast and check the logs"
echo "   for messages like: 'PyAnnote availability: ✅ Available'"
echo ""
echo "📚 For more information, see PYANNOTE_SETUP.md"