#!/usr/bin/env node

/**
 * Test script to verify HuggingFace API usage tracking
 * This will test if PyAnnote calls are properly authenticated and tracked
 */

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testing HuggingFace API Usage Tracking...\n');

// Check environment variables
console.log('📋 Environment Check:');
const hfToken = process.env.HUGGING_FACE_ACCESS_TOKEN;
if (hfToken) {
  console.log(`✅ HF Token: ${hfToken.substring(0, 8)}...${hfToken.substring(hfToken.length - 4)}`);
} else {
  console.log('❌ HUGGING_FACE_ACCESS_TOKEN not found in environment');
  process.exit(1);
}

// Test PyAnnote with a short audio file (we'll use a small test)
console.log('\n🎯 Testing PyAnnote API Call...');
console.log('This should generate usage in your HuggingFace dashboard\n');

const scriptPath = path.join(__dirname, 'scripts', 'pyannote_diarization.py');
const pythonPath = process.env.PYANNOTE_PYTHON_PATH || 'python3';

// Check if we have a test audio file, if not, we'll just test the initialization
console.log(`📍 Python script: ${scriptPath}`);
console.log(`🐍 Python path: ${pythonPath}`);

// Test PyAnnote initialization (this should trigger HF API usage)
const testProcess = spawn(pythonPath, ['-c', `
import sys
import os

# Set HF token
hf_token = "${hfToken}"
os.environ['HF_TOKEN'] = hf_token
os.environ['HUGGING_FACE_ACCESS_TOKEN'] = hf_token

try:
    from pyannote.audio import Pipeline
    print("🔄 Loading PyAnnote Pipeline (this will trigger HF API usage)...")
    
    # This should show up in your HuggingFace usage dashboard
    pipeline = Pipeline.from_pretrained(
        "pyannote/speaker-diarization-3.1",
        token=hf_token
    )
    
    print("✅ PyAnnote Pipeline loaded successfully!")
    print("📊 HuggingFace API call completed")
    print("💡 Check your HuggingFace dashboard at:")
    print("   - https://api-inference.huggingface.co/dashboard/usage")
    print("   - https://huggingface.co/settings/billing")
    
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
`], {
  stdio: 'inherit',
  env: {
    ...process.env,
    HUGGING_FACE_ACCESS_TOKEN: hfToken,
    HF_TOKEN: hfToken
  }
});

testProcess.on('close', (code) => {
  console.log(`\n🏁 Test completed with code ${code}`);
  
  if (code === 0) {
    console.log('\n✅ SUCCESS: PyAnnote API call completed!');
    console.log('\n📍 Where to check usage:');
    console.log('1. HuggingFace API Dashboard: https://api-inference.huggingface.co/dashboard/usage');
    console.log('2. HuggingFace Billing Settings: https://huggingface.co/settings/billing');
    console.log('3. HuggingFace Account: https://huggingface.co/settings/account');
    console.log('\n💡 Note: Usage may take a few minutes to appear in the dashboard');
  } else {
    console.log('\n❌ FAILED: Check the error messages above');
  }
});

testProcess.on('error', (error) => {
  console.error(`❌ Process error: ${error.message}`);
});