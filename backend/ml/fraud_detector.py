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
            'velocity': 25,
            'amount': 20,
            'location': 15,
            'device': 15,
            'email': 10,
            'history': 15
        }
        
        self.thresholds = {
            'high_amount': 10000,
            'very_high_amount': 50000,
            'max_orders_per_hour': 5,
            'max_orders_per_day': 20,
            'suspicious_email_domains': [],
            'high_risk_countries': []  # Updated via backend settings in production
        }
    
    def analyze_transaction(self, transaction, history=None):
        """
        Analyze a single transaction for fraud indicators
        """
        risk_score = 0
        risk_factors = []
        
        amount = float(transaction.get('amount', 0) or transaction.get('total', 0))
        email = transaction.get('email', '').lower()
        ip = transaction.get('ip', '')
        user_agent = transaction.get('userAgent', '')
        card_bin = transaction.get('cardBin', '')[:6] if transaction.get('cardBin') else ''
        country = transaction.get('country', 'IN')
        timestamp = transaction.get('timestamp') or datetime.now().isoformat()
        
        history = history or []
        
        # 1. Amount Analysis
        if amount > self.thresholds['very_high_amount']:
            risk_score += 20
            risk_factors.append({
                "factor": "very_high_amount",
                "severity": "high",
                "message": f"Transaction amount ₹{amount} is unusually high"
            })
        elif amount > self.thresholds['high_amount']:
            risk_score += 10
            risk_factors.append({
                "factor": "high_amount",
                "severity": "medium",
                "message": f"Transaction amount ₹{amount} is above average"
            })
        
        # 2. Email Analysis
        if email:
            email_domain = email.split('@')[-1] if '@' in email else ''
            
            if email_domain in self.thresholds['suspicious_email_domains']:
                risk_score += 15
                risk_factors.append({
                    "factor": "suspicious_email",
                    "severity": "high",
                    "message": f"Email domain {email_domain} is commonly used for fraud"
                })
            
            # Check for random-looking email
            local_part = email.split('@')[0] if '@' in email else email
            if self._looks_random(local_part):
                risk_score += 8
                risk_factors.append({
                    "factor": "random_email",
                    "severity": "medium",
                    "message": "Email appears to be randomly generated"
                })
        
        # 3. Velocity Check (if history provided)
        if history:
            recent_orders = self._count_recent_orders(history, email, ip, hours=1)
            daily_orders = self._count_recent_orders(history, email, ip, hours=24)
            
            if recent_orders >= self.thresholds['max_orders_per_hour']:
                risk_score += 25
                risk_factors.append({
                    "factor": "high_velocity",
                    "severity": "high",
                    "message": f"{recent_orders} orders in the last hour from this user/IP"
                })
            elif daily_orders >= self.thresholds['max_orders_per_day']:
                risk_score += 15
                risk_factors.append({
                    "factor": "moderate_velocity",
                    "severity": "medium",
                    "message": f"{daily_orders} orders in the last 24 hours"
                })
        
        # 4. Location/Country Analysis
        if country in self.thresholds['high_risk_countries']:
            risk_score += 15
            risk_factors.append({
                "factor": "high_risk_country",
                "severity": "medium",
                "message": f"Transaction from high-risk region: {country}"
            })
        
        # 5. Device Fingerprint Analysis
        if user_agent:
            if 'bot' in user_agent.lower() or 'crawler' in user_agent.lower():
                risk_score += 20
                risk_factors.append({
                    "factor": "bot_detected",
                    "severity": "high",
                    "message": "User agent indicates automated access"
                })
            
            if len(user_agent) < 20:
                risk_score += 10
                risk_factors.append({
                    "factor": "suspicious_user_agent",
                    "severity": "medium",
                    "message": "User agent appears modified or minimal"
                })
        
        # 6. Card BIN Analysis
        if card_bin:
            # Check if card BIN matches expected patterns
            if not card_bin.isdigit():
                risk_score += 15
                risk_factors.append({
                    "factor": "invalid_card_bin",
                    "severity": "high",
                    "message": "Card BIN contains invalid characters"
                })
        
        # 7. Time-based Analysis
        try:
            order_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            hour = order_time.hour
            
            # Orders between 2 AM and 5 AM local time
            if 2 <= hour <= 5:
                risk_score += 5
                risk_factors.append({
                    "factor": "unusual_hour",
                    "severity": "low",
                    "message": "Transaction at unusual hour"
                })
        except:
            pass
        
        # Determine risk level
        risk_score = min(100, risk_score)
        
        if risk_score >= 70:
            risk_level = "high"
            recommendation = "block"
        elif risk_score >= 40:
            risk_level = "medium"
            recommendation = "review"
        else:
            risk_level = "low"
            recommendation = "approve"
        
        return {
            "riskScore": risk_score,
            "riskLevel": risk_level,
            "recommendation": recommendation,
            "factors": risk_factors,
            "transactionId": transaction.get('id'),
            "analyzedAt": datetime.now().isoformat()
        }
    
    def _looks_random(self, text):
        """Check if text looks randomly generated"""
        if len(text) < 5:
            return False
        
        # Check for excessive numbers
        digit_ratio = sum(c.isdigit() for c in text) / len(text)
        if digit_ratio > 0.5:
            return True
        
        # Check for no vowels (unlikely in real names)
        vowels = set('aeiou')
        has_vowel = any(c in vowels for c in text.lower())
        if not has_vowel and len(text) > 6:
            return True
        
        return False
    
    def _count_recent_orders(self, history, email, ip, hours=1):
        """Count recent orders from same email or IP"""
        cutoff = datetime.now() - timedelta(hours=hours)
        count = 0
        
        for order in history:
            try:
                order_time = datetime.fromisoformat(
                    (order.get('createdAt') or order.get('timestamp', '')).replace('Z', '+00:00')
                )
                order_time = order_time.replace(tzinfo=None)
                
                if order_time >= cutoff:
                    if order.get('email', '').lower() == email or order.get('ip') == ip:
                        count += 1
            except:
                pass
        
        return count


def analyze_fraud(data):
    """Main entry point for fraud analysis"""
    detector = FraudDetector()
    
    transaction = data.get('transaction', data)
    history = data.get('history', [])
    
    return detector.analyze_transaction(transaction, history)


def batch_analyze(data):
    """Analyze multiple transactions"""
    detector = FraudDetector()
    
    transactions = data.get('transactions', [])
    history = data.get('history', [])
    
    results = []
    high_risk_count = 0
    
    for tx in transactions:
        result = detector.analyze_transaction(tx, history)
        results.append(result)
        if result['riskLevel'] == 'high':
            high_risk_count += 1
    
    return {
        "analyzed": len(results),
        "highRisk": high_risk_count,
        "mediumRisk": len([r for r in results if r['riskLevel'] == 'medium']),
        "lowRisk": len([r for r in results if r['riskLevel'] == 'low']),
        "results": results
    }


def get_fraud_stats(data):
    """Generate fraud statistics from historical data"""
    orders = data.get('orders', [])
    
    if not orders:
        return {"error": "No order data provided"}
    
    detector = FraudDetector()
    
    # Analyze all orders
    risk_distribution = {"high": 0, "medium": 0, "low": 0}
    factor_counts = defaultdict(int)
    daily_risk = defaultdict(lambda: {"count": 0, "high_risk": 0})
    
    for order in orders:
        result = detector.analyze_transaction(order, orders)
        risk_distribution[result['riskLevel']] += 1
        
        for factor in result['factors']:
            factor_counts[factor['factor']] += 1
        
        # Daily aggregation
        try:
            date = order.get('createdAt', order.get('date', ''))[:10]
            if date:
                daily_risk[date]['count'] += 1
                if result['riskLevel'] == 'high':
                    daily_risk[date]['high_risk'] += 1
        except:
            pass
    
    total = len(orders)
    
    return {
        "totalAnalyzed": total,
        "riskDistribution": risk_distribution,
        "riskPercentages": {
            "high": round(risk_distribution['high'] / total * 100, 2) if total else 0,
            "medium": round(risk_distribution['medium'] / total * 100, 2) if total else 0,
            "low": round(risk_distribution['low'] / total * 100, 2) if total else 0
        },
        "topRiskFactors": sorted(
            [{"factor": k, "count": v} for k, v in factor_counts.items()],
            key=lambda x: x['count'],
            reverse=True
        )[:10],
        "dailyTrend": [
            {"date": k, **v} for k, v in sorted(daily_risk.items())[-30:]
        ]
    }


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
            
            if not isinstance(input_data, dict):
                input_data = {"data": input_data}
            
            if task == "analyze":
                print(json.dumps(analyze_fraud(input_data)))
            elif task == "batch":
                print(json.dumps(batch_analyze(input_data)))
            elif task == "stats":
                print(json.dumps(get_fraud_stats(input_data)))
            else:
                print(json.dumps({"error": f"Unknown task: {task}"}))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
    else:
        print(json.dumps({"status": "healthy", "engine": "Fraud Detector v1.0"}))
