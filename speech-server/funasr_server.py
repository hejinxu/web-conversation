#!/usr/bin/env python3
"""
FunASR Python sidecar for speech-server.

Receives audio data via stdin (JSON), runs FunASR inference, returns result via stdout.

Usage:
    echo '{"audio": [float_array], "model": "paraformer-zh"}' | python3 funasr_server.py

Models:
    - paraformer-zh: Chinese ASR (default)
    - paraformer-en: English ASR
    - sensevoice: Multi-language ASR

Requirements:
    pip install funasr torch torchaudio
"""

import sys
import json
import numpy as np
import traceback

def load_model(model_name="paraformer-zh"):
    """Load FunASR model."""
    from funasr import AutoModel
    
    model_configs = {
        "paraformer-zh": {
            "model": "paraformer-zh",
            "vad_model": "fsmn-vad",
            "punc_model": "ct-punc",
        },
        "paraformer-en": {
            "model": "paraformer-en",
        },
        "sensevoice": {
            "model": "iic/SenseVoiceSmall",
            "vad_model": "fsmn-vad",
            "vad_kwargs": {"max_single_segment_time": 30000},
        },
    }
    
    config = model_configs.get(model_name, model_configs["paraformer-zh"])
    return AutoModel(**config)

def transcribe(model, audio_data, sample_rate=16000):
    """Transcribe audio data."""
    audio = np.array(audio_data, dtype=np.float32)
    
    # Run inference
    res = model.generate(input=audio, batch_size_s=300)
    
    if res and len(res) > 0:
        text = res[0].get("text", "")
        return text.strip()
    return ""

def main():
    models = {}
    
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        
        try:
            request = json.loads(line)
            model_name = request.get("model", "paraformer-zh")
            audio_data = request.get("audio", [])
            sample_rate = request.get("sample_rate", 16000)
            
            if not audio_data:
                result = {"error": "No audio data provided"}
            else:
                # Load model if not cached
                if model_name not in models:
                    print(f"[FunASR] Loading model: {model_name}", file=sys.stderr)
                    models[model_name] = load_model(model_name)
                    print(f"[FunASR] Model loaded: {model_name}", file=sys.stderr)
                
                text = transcribe(models[model_name], audio_data, sample_rate)
                result = {"text": text}
            
            print(json.dumps(result), flush=True)
            
        except Exception as e:
            traceback.print_exc(file=sys.stderr)
            result = {"error": str(e)}
            print(json.dumps(result), flush=True)

if __name__ == "__main__":
    main()
