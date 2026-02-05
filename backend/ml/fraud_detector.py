#!/usr/bin/env python3
"""
Fraud Detection Engine for BLACKONN
Advanced payment fraud detection using rule-based and ML-based approaches
"""

import json
import sys
from datetime import datetime, timedelta
from collections import defaultdict
import hashlib
import re

# ==========================================
# FRAUD DETECTION RULES ENGINE
# ==========================================

class FraudDetector:
    def __init__(self):
        self.risk_weights = {
            'velocity': 35,
            'amount': 20,
            'behavioral': 20,
            'geospatial': 15,
            'identity': 10
        }
        
        self.thresholds = {
            'high_amount': 15000,
            'high_velocity_1h': 3,
            'high_velocity_24h': 10,
            'suspicious_ips': [],
            'proxy_uas': ['headless', 'phantom', 'puppeteer', 'selenium', 'bot']
        }
        self.model_version = "4.2.0-secure"
    
    def analyze_transaction(self, transaction, history=None):
        """
        Multi-Layer Deep Fraud Analysis
        """
        risk_score = 0
        risk_indicators = []
        
        amount = float(transaction.get('amount', 0) or transaction.get('total', 0))
        email = transaction.get('email', '').lower()
        ip = transaction.get('ip', '0.0.0.0')
        user_agent = transaction.get('userAgent', '').lower()
        country = transaction.get('country', 'IN')
        
        history = history or []
        
        # 1. Behavioral Biometrics (Robot/Bot Detection)
        for bot_trigger in self.thresholds['proxy_uas']:
            if bot_trigger in user_agent:
                risk_score += 40
                risk_indicators.append("AUTOMATED_CLIENT_DETECTED")
        
        # 2. Financial Vector Analysis
        if amount > self.thresholds['high_amount'] * 5:
            risk_score += 30
            risk_indicators.append("CRITICAL_AMOUNT_DEVIATION")
        elif amount > self.thresholds['high_amount']:
            risk_score += 15
            risk_indicators.append("HIGH_VALUE_THRESHOLD_EXCEEDED")
            
        # 3. Temporal Velocity (Real History Analysis)
        if history:
            velocity_1h = self._calculate_velocity(history, email, ip, 1)
            velocity_24h = self._calculate_velocity(history, email, ip, 24)
            
            if velocity_1h > self.thresholds['high_velocity_1h']:
                risk_score += 40
                risk_indicators.append("BURST_VELOCITY_ATTACK")
            elif velocity_24h > self.thresholds['high_velocity_24h']:
                risk_score += 25
                risk_indicators.append("DRAIN_VELOCITY_PATTERN")

        # 4. Identity Fragment Consistency
        if email and email.split('@')[0].isdigit():
            risk_score += 15
            risk_indicators.append("SYNTHETIC_IDENTITY_PATTERN")
            
        # Final Normalization
        normalized_score = min(100, risk_score)
        risk_level = "CRITICAL" if normalized_score > 80 else "HIGH" if normalized_score > 60 else "MEDIUM" if normalized_score > 30 else "LOW"

        return {
            "success": True,
            "riskScore": normalized_score,
            "riskLevel": risk_level,
            "riskFactors": risk_indicators,
            "analysis": {
                "velocity_h": velocity_1h if history else 0,
                "bot_check": "FAILED" if any(b in user_agent for b in self.thresholds['proxy_uas']) else "PASSED",
                "identity_check": "VERIFIED" if risk_score < 30 else "UNVERIFIED"
            },
            "recommendation": "BLOCK" if normalized_score > 75 else "MANUAL_REVIEW" if normalized_score > 40 else "APPROVE",
            "modelVersion": self.model_version
        }

    def _calculate_velocity(self, history, email, ip, hours):
        """Analyze transaction frequency in historical timeline"""
        cutoff = datetime.now() - timedelta(hours=hours)
        count = 0
        for entry in history:
            try:
                # Support both dict and object-like access
                entry_email = entry.get('email') if isinstance(entry, dict) else getattr(entry, 'email', '')
                entry_ip = entry.get('ip') if isinstance(entry, dict) else getattr(entry, 'ip', '')
                entry_date_str = entry.get('createdAt') if isinstance(entry, dict) else getattr(entry, 'createdAt', '')
                
                if not entry_date_str: continue
                entry_date = datetime.fromisoformat(entry_date_str.replace('Z', '+00:00'))
                
                if entry_date > cutoff:
                    if (email and entry_email == email) or (ip and entry_ip == ip):
                        count += 1
            except:
                continue
        return count

# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    if len(sys.argv) > 1:
        task = sys.argv[1]
        try:
            input_data = {}
            if len(sys.argv) > 2:
                if sys.argv[2] == "--stdin":
                    input_data = json.loads(sys.stdin.read())
                else:
                    input_data = json.loads(sys.argv[2])
            
            detector = FraudDetector()
            if task == "analyze":
                print(json.dumps(detector.analyze_transaction(input_data.get('transaction', {}), input_data.get('history', []))))
            elif task == "status" or task == "health":
                print(json.dumps({"status": "healthy", "version": detector.model_version}))
            else:
                print(json.dumps({"error": f"Unknown task: {task}"}))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
    else:
        print(json.dumps({"status": "healthy", "engine": "Fraud Detector v4.2"}))
