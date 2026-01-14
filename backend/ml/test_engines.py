#!/usr/bin/env python3
import json
import subprocess
import sys
from pathlib import Path

ml_dir = Path(__file__).parent.absolute()
engines = {
    'analysis': ['insights', 'sentiment'],
    'analytics': ['rfm', 'cohort', 'forecast', 'product-performance', 'ab-test'],
    'image': ['check'],
    'fraud': ['stats'],
    'email': ['welcome'],
    'search': ['trending'],
    'recommend': ['trending'],
    'price': ['bundle'],
    'payment': ['verify'],
    'health': ['full', 'system', 'ai'],
    'neural': ['intent', 'placement', 'pricing'],
    'emotion': ['sentiment', 'feedback'],
    'performance': ['analyze', 'metrics'],
    'errors': ['trends'],
    'ml': ['info', 'sales', 'segment'],
    'security': ['traffic', 'scan'],
    'realtime': ['stats', 'dashboard'],
    'seo': ['analyze', 'keywords'],
    'sales': ['insights', 'forecast']
}

def test_engine(engine_name, task):
    print(f"Testing {engine_name}/{task}...", end=" ", flush=True)
    try:
        # Use ai_hub.py to route
        cmd = [sys.executable, str(ml_dir / 'ai_hub.py'), f"{engine_name}/{task}", '{}']
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        
        if proc.returncode != 0:
            print(f"FAILED (code {proc.returncode})")
            print(f"Error: {proc.stderr}")
            return False
        
        result = json.loads(proc.stdout)
        if 'error' in result:
            print(f"FAILED (AI Error: {result['error']})")
            return False
            
        print("OK")
        return True
    except Exception as e:
        print(f"FAILED (Exception: {str(e)})")
        return False

def main():
    print("=== BLACKONN AI ENGINE VERIFICATION ===\n")
    success_count = 0
    total_count = 0
    
    for engine, tasks in engines.items():
        for task in tasks:
            total_count += 1
            if test_engine(engine, task):
                success_count += 1
    
    print(f"\nVerification Complete: {success_count}/{total_count} tasks passed.")
    if success_count == total_count:
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == "__main__":
    main()
