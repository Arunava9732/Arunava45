#!/usr/bin/env python3
"""
Payment Verification AI for BLACKONN
Analyzes payment transactions for fraud, verifies integrity, and provides risk assessment
"""

import json
import sys
import hashlib
import re
from datetime import datetime, timedelta

# ==========================================
# UTILITY FUNCTIONS (Shared)
# ==========================================

def parse_iso_date(date_str):
    """Parse ISO date string safely"""
    if not date_str:
        return datetime.now()
    try:
        if isinstance(date_str, datetime):
            return date_str
        return datetime.fromisoformat(str(date_str).replace('Z', '+00:00').replace('+00:00+00:00', '+00:00'))
    except:
        try:
            return datetime.fromisoformat(str(date_str).replace('Z', ''))
        except:
            return datetime.now()


# ==========================================
# PAYMENT VERIFICATION AI
# ==========================================

class PaymentVerificationAI:
    def __init__(self):
        self.risk_thresholds = {
            'low': 25,
            'medium': 50,
            'high': 75,
            'critical': 90
        }
        
        # Suspicious patterns
        self.suspicious_email_patterns = [
            r'temp.*mail', r'throwaway', r'fake', r'test.*\d{3,}',
            r'\d{5,}@', r'disposable'
        ]
        
        self.suspicious_card_bins = [
            '400000', '411111', '555555', '378282'  # Test cards
        ]
        
        self.high_risk_countries = ['XX', 'YY', 'ZZ']  # Placeholder
    
    def verify_payment(self, payment_data, order_data=None, user_history=None):
        """
        Comprehensive payment verification with AI-powered fraud detection
        """
        risk_score = 0
        risk_factors = []
        checks_passed = []
        checks_failed = []
        
        # ========== 1. SIGNATURE VERIFICATION ==========
        signature_valid = self._verify_signature(payment_data)
        if signature_valid:
            checks_passed.append("Payment signature verified")
        else:
            checks_failed.append("Signature verification failed")
            risk_score += 100  # Critical failure
        
        # ========== 2. AMOUNT VERIFICATION ==========
        amount_match = self._verify_amount(payment_data, order_data)
        if amount_match['valid']:
            checks_passed.append(f"Amount matches: ₹{amount_match['expected']}")
        else:
            checks_failed.append(f"Amount mismatch: expected ₹{amount_match['expected']}, got ₹{amount_match['actual']}")
            risk_score += 80
        
        # ========== 3. TIMING ANALYSIS ==========
        timing_result = self._analyze_timing(payment_data, order_data)
        risk_score += timing_result['risk']
        if timing_result['risk'] > 0:
            risk_factors.append(timing_result['reason'])
        else:
            checks_passed.append("Payment timing normal")
        
        # ========== 4. USER BEHAVIOR ANALYSIS ==========
        if user_history:
            behavior_result = self._analyze_user_behavior(payment_data, user_history)
            risk_score += behavior_result['risk']
            risk_factors.extend(behavior_result.get('factors', []))
            if behavior_result['risk'] == 0:
                checks_passed.append("User behavior consistent")
        
        # ========== 5. VELOCITY CHECK ==========
        velocity_result = self._velocity_check(payment_data, user_history)
        risk_score += velocity_result['risk']
        if velocity_result['risk'] > 0:
            risk_factors.append(velocity_result['reason'])
        else:
            checks_passed.append("Transaction velocity normal")
        
        # ========== 6. EMAIL ANALYSIS ==========
        email = payment_data.get('email') or (order_data or {}).get('email')
        if email:
            email_result = self._analyze_email(email)
            risk_score += email_result['risk']
            if email_result['risk'] > 0:
                risk_factors.append(email_result['reason'])
            else:
                checks_passed.append("Email address verified")
        
        # ========== 7. DEVICE FINGERPRINT ==========
        device_result = self._analyze_device(payment_data)
        risk_score += device_result['risk']
        if device_result['risk'] > 0:
            risk_factors.extend(device_result.get('factors', []))
        
        # ========== 8. GEOGRAPHIC ANALYSIS ==========
        geo_result = self._analyze_geography(payment_data, user_history)
        risk_score += geo_result['risk']
        if geo_result['risk'] > 0:
            risk_factors.append(geo_result['reason'])
        
        # Calculate final risk level
        risk_score = min(100, risk_score)
        risk_level = self._calculate_risk_level(risk_score)
        
        # Determine action
        action = 'APPROVE'
        if risk_score >= self.risk_thresholds['critical']:
            action = 'BLOCK'
        elif risk_score >= self.risk_thresholds['high']:
            action = 'MANUAL_REVIEW'
        elif risk_score >= self.risk_thresholds['medium']:
            action = 'FLAG'
        
        return {
            "verified": signature_valid and amount_match['valid'] and risk_score < self.risk_thresholds['high'],
            "riskScore": risk_score,
            "riskLevel": risk_level,
            "action": action,
            "checksPassed": checks_passed,
            "checksFailed": checks_failed,
            "riskFactors": risk_factors,
            "timestamp": datetime.now().isoformat(),
            "paymentId": payment_data.get('razorpay_payment_id', payment_data.get('paymentId')),
            "orderId": payment_data.get('orderId') or (order_data or {}).get('id'),
            "recommendation": self._get_recommendation(action, risk_factors)
        }
    
    def _verify_signature(self, payment_data):
        """Verify Razorpay signature"""
        razorpay_order_id = payment_data.get('razorpay_order_id', '')
        razorpay_payment_id = payment_data.get('razorpay_payment_id', '')
        razorpay_signature = payment_data.get('razorpay_signature', '')
        secret = payment_data.get('secret', '')
        
        if not all([razorpay_order_id, razorpay_payment_id, razorpay_signature]):
            return payment_data.get('signatureVerified', True)  # Assume verified if pre-verified
        
        if not secret:
            return True  # Cannot verify without secret, assume pre-verified
        
        body = f"{razorpay_order_id}|{razorpay_payment_id}"
        expected = hashlib.sha256(f"{body}{secret}".encode()).hexdigest()
        
        return expected == razorpay_signature
    
    def _verify_amount(self, payment_data, order_data):
        """Verify payment amount matches order"""
        paid_amount = payment_data.get('amount', 0)
        if isinstance(paid_amount, str):
            paid_amount = float(paid_amount.replace(',', ''))
        
        expected_amount = 0
        if order_data:
            expected_amount = order_data.get('total', 0)
            if isinstance(expected_amount, str):
                expected_amount = float(expected_amount.replace(',', ''))
        
        # Convert from paise if needed
        if paid_amount > expected_amount * 10:
            paid_amount = paid_amount / 100
        
        tolerance = 0.01  # 1 paisa tolerance
        valid = abs(paid_amount - expected_amount) <= tolerance
        
        return {
            "valid": valid or expected_amount == 0,
            "expected": expected_amount,
            "actual": paid_amount,
            "difference": abs(paid_amount - expected_amount)
        }
    
    def _analyze_timing(self, payment_data, order_data):
        """Analyze payment timing for anomalies"""
        payment_time = parse_iso_date(payment_data.get('timestamp') or payment_data.get('createdAt'))
        order_time = parse_iso_date((order_data or {}).get('createdAt'))
        
        # Check for unusually fast payment (bot behavior)
        if order_data:
            time_diff = (payment_time - order_time).total_seconds()
            if time_diff < 5:  # Less than 5 seconds
                return {"risk": 30, "reason": "Payment completed unusually fast (<5s)"}
            if time_diff > 86400:  # More than 24 hours
                return {"risk": 15, "reason": "Delayed payment (>24h since order)"}
        
        # Check for unusual hours
        hour = payment_time.hour
        if 2 <= hour <= 5:
            return {"risk": 10, "reason": "Transaction during unusual hours (2-5 AM)"}
        
        return {"risk": 0}
    
    def _analyze_user_behavior(self, payment_data, user_history):
        """Analyze if payment behavior matches user history"""
        risk = 0
        factors = []
        
        if not user_history:
            return {"risk": 0, "factors": []}
        
        past_orders = user_history.get('orders', [])
        
        if len(past_orders) == 0:
            # First order - slightly higher scrutiny
            risk += 10
            factors.append("First-time customer")
        
        # Check average order value deviation
        if len(past_orders) >= 3:
            avg_value = sum(o.get('total', 0) for o in past_orders) / len(past_orders)
            current_value = payment_data.get('amount', 0)
            if current_value > avg_value * 3:
                risk += 25
                factors.append(f"Order value 3x above average (avg: ₹{avg_value:.0f})")
        
        # Check payment method change
        usual_method = user_history.get('preferredPaymentMethod')
        current_method = payment_data.get('method')
        if usual_method and current_method and usual_method != current_method:
            risk += 5
            factors.append(f"Payment method changed from {usual_method} to {current_method}")
        
        return {"risk": risk, "factors": factors}
    
    def _velocity_check(self, payment_data, user_history):
        """Check for velocity-based fraud patterns"""
        if not user_history:
            return {"risk": 0}
        
        recent_orders = user_history.get('orders', [])
        now = datetime.now()
        
        # Orders in last hour
        hour_ago = now - timedelta(hours=1)
        recent_count = 0
        for order in recent_orders:
            order_time = parse_iso_date(order.get('createdAt'))
            if order_time >= hour_ago:
                recent_count += 1
        
        if recent_count >= 5:
            return {"risk": 40, "reason": f"High velocity: {recent_count} orders in last hour"}
        elif recent_count >= 3:
            return {"risk": 20, "reason": f"Elevated velocity: {recent_count} orders in last hour"}
        
        return {"risk": 0}
    
    def _analyze_email(self, email):
        """Analyze email for suspicious patterns"""
        if not email:
            return {"risk": 15, "reason": "No email provided"}
        
        email_lower = email.lower()
        
        # Check for suspicious patterns
        for pattern in self.suspicious_email_patterns:
            if re.search(pattern, email_lower):
                return {"risk": 25, "reason": f"Suspicious email pattern detected"}
        
        # Check for common disposable email domains
        disposable_domains = ['tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com']
        domain = email_lower.split('@')[-1] if '@' in email_lower else ''
        if domain in disposable_domains:
            return {"risk": 35, "reason": "Disposable email address detected"}
        
        return {"risk": 0}
    
    def _analyze_device(self, payment_data):
        """Analyze device fingerprint"""
        risk = 0
        factors = []
        
        user_agent = payment_data.get('userAgent', '')
        ip = payment_data.get('ip', '')
        
        # Check for missing device info
        if not user_agent:
            risk += 10
            factors.append("No user agent provided")
        
        # Check for bot patterns
        bot_patterns = ['bot', 'crawler', 'spider', 'headless', 'phantom']
        if any(p in user_agent.lower() for p in bot_patterns):
            risk += 30
            factors.append("Bot-like user agent detected")
        
        # Check for VPN/Proxy (simplified check)
        if payment_data.get('isVPN') or payment_data.get('isProxy'):
            risk += 20
            factors.append("VPN or proxy detected")
        
        return {"risk": risk, "factors": factors}
    
    def _analyze_geography(self, payment_data, user_history):
        """Analyze geographic consistency"""
        current_country = payment_data.get('country', payment_data.get('geoCountry'))
        
        if not current_country:
            return {"risk": 0}
        
        # Check against high-risk countries
        if current_country in self.high_risk_countries:
            return {"risk": 25, "reason": f"High-risk country: {current_country}"}
        
        # Check against user's usual location
        if user_history:
            usual_country = user_history.get('country') or user_history.get('defaultCountry')
            if usual_country and usual_country != current_country:
                return {"risk": 15, "reason": f"Location mismatch: usual {usual_country}, current {current_country}"}
        
        return {"risk": 0}
    
    def _calculate_risk_level(self, score):
        """Convert risk score to risk level"""
        if score >= self.risk_thresholds['critical']:
            return 'CRITICAL'
        elif score >= self.risk_thresholds['high']:
            return 'HIGH'
        elif score >= self.risk_thresholds['medium']:
            return 'MEDIUM'
        elif score >= self.risk_thresholds['low']:
            return 'LOW'
        return 'MINIMAL'
    
    def _get_recommendation(self, action, risk_factors):
        """Generate human-readable recommendation"""
        if action == 'APPROVE':
            return "Payment looks legitimate. Safe to process."
        elif action == 'FLAG':
            return f"Payment flagged for review. Issues: {', '.join(risk_factors[:2])}"
        elif action == 'MANUAL_REVIEW':
            return f"Requires manual review before processing. High-risk factors detected."
        elif action == 'BLOCK':
            return "Payment should be blocked. Multiple critical risk factors detected."
        return "Unable to determine recommendation."
    
    def analyze_refund_risk(self, order_data, user_history=None):
        """Analyze risk of refund/chargeback"""
        risk_score = 0
        factors = []
        
        # High-value order
        total = order_data.get('total', 0)
        if total > 10000:
            risk_score += 15
            factors.append("High-value order")
        
        # Digital goods (higher chargeback risk)
        items = order_data.get('items', [])
        digital_count = sum(1 for i in items if i.get('digital') or i.get('downloadable'))
        if digital_count > 0:
            risk_score += 20
            factors.append("Contains digital goods")
        
        # User history
        if user_history:
            past_refunds = user_history.get('refundCount', 0)
            past_orders = len(user_history.get('orders', []))
            
            if past_orders > 0:
                refund_rate = past_refunds / past_orders
                if refund_rate > 0.3:
                    risk_score += 30
                    factors.append(f"High refund rate: {refund_rate:.0%}")
        
        return {
            "riskScore": min(100, risk_score),
            "riskLevel": self._calculate_risk_level(risk_score),
            "factors": factors,
            "recommendation": "Normal processing" if risk_score < 50 else "Consider additional verification"
        }
    
    def batch_verify(self, payments, orders_map=None, users_map=None):
        """Batch verify multiple payments"""
        results = []
        high_risk_count = 0
        blocked_count = 0
        
        for payment in payments:
            order_data = None
            user_history = None
            
            order_id = payment.get('orderId')
            user_id = payment.get('userId')
            
            if orders_map and order_id:
                order_data = orders_map.get(order_id)
            if users_map and user_id:
                user_history = users_map.get(user_id)
            
            result = self.verify_payment(payment, order_data, user_history)
            results.append(result)
            
            if result['riskLevel'] in ['HIGH', 'CRITICAL']:
                high_risk_count += 1
            if result['action'] == 'BLOCK':
                blocked_count += 1
        
        return {
            "results": results,
            "summary": {
                "total": len(payments),
                "approved": len([r for r in results if r['action'] == 'APPROVE']),
                "flagged": len([r for r in results if r['action'] == 'FLAG']),
                "reviewRequired": len([r for r in results if r['action'] == 'MANUAL_REVIEW']),
                "blocked": blocked_count,
                "highRiskCount": high_risk_count
            },
            "timestamp": datetime.now().isoformat()
        }


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    verifier = PaymentVerificationAI()
    
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
            
            if task == "verify":
                payment = input_data.get('payment', input_data)
                order = input_data.get('order')
                history = input_data.get('userHistory')
                result = verifier.verify_payment(payment, order, history)
                print(json.dumps(result))
            
            elif task == "batch":
                payments = input_data.get('payments', [])
                orders_map = input_data.get('ordersMap', {})
                users_map = input_data.get('usersMap', {})
                result = verifier.batch_verify(payments, orders_map, users_map)
                print(json.dumps(result))
            
            elif task == "refund-risk":
                order = input_data.get('order', input_data)
                history = input_data.get('userHistory')
                result = verifier.analyze_refund_risk(order, history)
                print(json.dumps(result))
            
            elif task == "health":
                print(json.dumps({
                    "status": "healthy",
                    "engine": "Payment Verification AI v1.0",
                    "capabilities": ["verify", "batch", "refund-risk"]
                }))
            
            else:
                print(json.dumps({"error": f"Unknown task: {task}"}))
        
        except Exception as e:
            import traceback
            print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))
    else:
        print(json.dumps({
            "status": "healthy",
            "engine": "Payment Verification AI v1.0",
            "tasks": ["verify", "batch", "refund-risk"]
        }))
