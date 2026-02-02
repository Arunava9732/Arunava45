#!/usr/bin/env python3
"""
Neural Commerce Engine for BLACKONN
AI-powered commerce optimization with neural network simulations
"""

import json
import sys
from datetime import datetime, timedelta
from collections import defaultdict
import math

# ==========================================
# NEURAL COMMERCE ENGINE
# ==========================================

class NeuralCommerceEngine:
    """Neural network-inspired commerce optimization"""
    
    def __init__(self):
        self.model_version = "2.0.0"
        self.learning_rate = 0.01
        self.weights = self._initialize_weights()
    
    def _initialize_weights(self):
        """Initialize neural weights for different commerce signals"""
        return {
            'price_sensitivity': 0.3,
            'brand_loyalty': 0.25,
            'trend_following': 0.2,
            'urgency_response': 0.15,
            'social_proof': 0.1
        }
    
    def predict_purchase_intent(self, user_data=None, product_data=None, context=None, **kwargs):
        """Predict user's purchase intent using neural signals"""
        if isinstance(user_data, dict) and product_data is None:
            # Handle single dict argument
            data = user_data
            user_data = data.get('user', {})
            product_data = data.get('product', {})
            context = data.get('context', {})
        
        user_data = user_data or {}
        product_data = product_data or {}
        context = context or {}
        
        # Calculate base intent score
        base_score = 0.5
        
        # Analyze user behavior signals
        page_views = user_data.get('pageViews', 0)
        cart_adds = user_data.get('cartAdds', 0)
        time_on_site = user_data.get('timeOnSite', 0)
        previous_purchases = user_data.get('previousPurchases', 0)
        
        # Calculate behavioral intent
        behavior_score = min(1.0, (
            (page_views * 0.02) +
            (cart_adds * 0.15) +
            (time_on_site / 300 * 0.1) +
            (previous_purchases * 0.05)
        ))
        
        # Product attractiveness
        product_score = self._calculate_product_attractiveness(product_data, user_data)
        
        # Context modifiers
        context_modifier = 1.0
        if context.get('isPromotion'):
            context_modifier *= 1.3
        if context.get('lowStock'):
            context_modifier *= 1.2
        if context.get('recentViewed'):
            context_modifier *= 1.15
        
        # Neural combination
        intent_score = (
            base_score * 0.2 +
            behavior_score * 0.4 +
            product_score * 0.4
        ) * context_modifier
        
        intent_score = min(1.0, max(0.0, intent_score))
        
        # Determine action
        if intent_score >= 0.75:
            action = "HIGH_INTENT"
            recommendation = "Show checkout incentive"
        elif intent_score >= 0.5:
            action = "MEDIUM_INTENT"
            recommendation = "Display social proof"
        elif intent_score >= 0.25:
            action = "LOW_INTENT"
            recommendation = "Offer product education"
        else:
            action = "BROWSING"
            recommendation = "Show related products"
        
        return {
            "success": True,
            "intentScore": round(intent_score, 3),
            "action": action,
            "recommendation": recommendation,
            "signals": {
                "behavior": round(behavior_score, 3),
                "product": round(product_score, 3),
                "contextModifier": round(context_modifier, 2)
            },
            "timestamp": datetime.now().isoformat()
        }
    
    def _calculate_product_attractiveness(self, product, user_data):
        """Calculate product attractiveness for user"""
        score = 0.5
        
        # Price sensitivity
        user_avg_purchase = user_data.get('avgPurchaseValue', 1000)
        product_price = product.get('price', 0)
        if product_price > 0:
            price_ratio = user_avg_purchase / product_price
            if 0.5 <= price_ratio <= 2.0:
                score += 0.15
        
        # Category match
        user_categories = user_data.get('preferredCategories', [])
        product_category = product.get('category', '')
        if product_category in user_categories:
            score += 0.2
        
        # Discount attractiveness
        discount = product.get('discount', 0)
        if discount >= 20:
            score += 0.15
        elif discount >= 10:
            score += 0.08
        
        return min(1.0, score)
    
    def optimize_product_placement(self, products=None, user_segments=None, **kwargs):
        """Optimize product placement for different user segments"""
        if isinstance(products, dict) and user_segments is None:
            # Handle single dict argument
            data = products
            products = data.get('products', [])
            user_segments = data.get('segments', [])
        
        products = products or []
        user_segments = user_segments or []
        
        placements = []
        
        for segment in user_segments:
            segment_id = segment.get('id', 'default')
            segment_preferences = segment.get('preferences', {})
            
            scored_products = []
            for product in products:
                score = self._score_product_for_segment(product, segment_preferences)
                scored_products.append({
                    "productId": product.get('id'),
                    "name": product.get('name'),
                    "score": score
                })
            
            # Sort by score
            scored_products.sort(key=lambda x: x['score'], reverse=True)
            
            placements.append({
                "segmentId": segment_id,
                "segmentName": segment.get('name', 'Unknown'),
                "recommendedOrder": scored_products[:10],
                "optimizationScore": sum(p['score'] for p in scored_products[:10]) / 10
            })
        
        return {
            "success": True,
            "placements": placements,
            "modelVersion": self.model_version,
            "timestamp": datetime.now().isoformat()
        }
    
    def _score_product_for_segment(self, product, preferences):
        """Score a product for a specific user segment"""
        score = 0.5
        
        price_range = preferences.get('priceRange', [0, 10000])
        price = product.get('price', 0)
        if price_range[0] <= price <= price_range[1]:
            score += 0.2
        
        preferred_categories = preferences.get('categories', [])
        if product.get('category') in preferred_categories:
            score += 0.2
        
        if preferences.get('prefersDiscounts') and product.get('discount', 0) > 0:
            score += 0.1
        
        return round(score, 3)
    
    def generate_dynamic_pricing(self, product=None, demand_data=None, inventory_data=None, **kwargs):
        """Generate dynamic pricing recommendations"""
        if isinstance(product, dict) and demand_data is None:
            # Handle single dict argument
            data = product
            product = data.get('product', {})
            demand_data = data.get('demand', {})
            inventory_data = data.get('inventory', {})
            
        product = product or {}
        demand_data = demand_data or {}
        inventory_data = inventory_data or {}
        
        base_price = product.get('price', 0)
        cost = product.get('cost', base_price * 0.4)
        
        # Demand factor
        demand_score = demand_data.get('score', 0.5)
        demand_trend = demand_data.get('trend', 'stable')
        
        # Inventory factor
        stock = inventory_data.get('stock', 100)
        reorder_point = inventory_data.get('reorderPoint', 20)
        
        # Calculate price adjustment
        adjustment = 0
        
        # High demand, low stock = increase price
        if demand_score > 0.7 and stock < reorder_point * 2:
            adjustment = 0.1 + (0.7 - stock / reorder_point / 2) * 0.1
        # Low demand, high stock = decrease price
        elif demand_score < 0.3 and stock > reorder_point * 5:
            adjustment = -0.15
        # Growing trend
        elif demand_trend == 'increasing':
            adjustment = 0.05
        # Declining trend
        elif demand_trend == 'decreasing':
            adjustment = -0.08
        
        # Calculate new price
        suggested_price = base_price * (1 + adjustment)
        
        # Ensure minimum margin
        min_price = cost * 1.2
        suggested_price = max(suggested_price, min_price)
        
        # Round to nice price points
        suggested_price = self._round_to_price_point(suggested_price)
        
        return {
            "success": True,
            "currentPrice": base_price,
            "suggestedPrice": suggested_price,
            "adjustment": round(adjustment * 100, 1),
            "reason": self._get_pricing_reason(adjustment, demand_score, stock, reorder_point),
            "projectedMargin": round((suggested_price - cost) / suggested_price * 100, 1),
            "confidence": 0.85 if abs(adjustment) < 0.1 else 0.7,
            "timestamp": datetime.now().isoformat()
        }
    
    def _round_to_price_point(self, price):
        """Round to psychological price points"""
        if price < 100:
            return round(price / 10) * 10 - 1
        elif price < 1000:
            return round(price / 50) * 50 - 1
        else:
            return round(price / 100) * 100 - 1
    
    def _get_pricing_reason(self, adjustment, demand, stock, reorder):
        """Get human-readable pricing reason"""
        if adjustment > 0.08:
            return "High demand with limited inventory"
        elif adjustment > 0:
            return "Growing demand trend detected"
        elif adjustment < -0.1:
            return "Low demand with excess inventory"
        elif adjustment < 0:
            return "Declining demand trend"
        return "Stable market conditions"
    
    def customer_journey_optimization(self, journey_data):
        """Optimize customer journey touchpoints"""
        touchpoints = journey_data.get('touchpoints', [])
        conversions = journey_data.get('conversions', [])
        
        # Analyze touchpoint effectiveness
        touchpoint_stats = defaultdict(lambda: {'visits': 0, 'conversions': 0})
        
        for tp in touchpoints:
            tp_type = tp.get('type', 'unknown')
            touchpoint_stats[tp_type]['visits'] += 1
        
        for conv in conversions:
            last_touch = conv.get('lastTouchpoint', 'unknown')
            touchpoint_stats[last_touch]['conversions'] += 1
        
        # Calculate conversion rates
        optimization = []
        for tp_type, stats in touchpoint_stats.items():
            conv_rate = stats['conversions'] / max(stats['visits'], 1)
            
            recommendation = "Maintain current approach"
            if conv_rate < 0.02:
                recommendation = "Redesign or remove this touchpoint"
            elif conv_rate < 0.05:
                recommendation = "A/B test improvements"
            elif conv_rate > 0.15:
                recommendation = "Increase investment in this channel"
            
            optimization.append({
                "touchpoint": tp_type,
                "visits": stats['visits'],
                "conversions": stats['conversions'],
                "conversionRate": round(conv_rate * 100, 2),
                "recommendation": recommendation
            })
        
        optimization.sort(key=lambda x: x['conversionRate'], reverse=True)
        
        return {
            "success": True,
            "journeyAnalysis": optimization,
            "topPerformer": optimization[0] if optimization else None,
            "needsAttention": [o for o in optimization if o['conversionRate'] < 3],
            "timestamp": datetime.now().isoformat()
        }
    
    def predict_churn(self, customer_data):
        """Predict customer churn probability"""
        # Extract features
        days_since_purchase = customer_data.get('daysSinceLastPurchase', 90)
        purchase_frequency = customer_data.get('purchaseFrequency', 0)
        avg_order_value = customer_data.get('avgOrderValue', 0)
        total_orders = customer_data.get('totalOrders', 0)
        support_tickets = customer_data.get('supportTickets', 0)
        email_engagement = customer_data.get('emailEngagement', 0.5)
        
        # Calculate churn score (0-1, higher = more likely to churn)
        churn_score = 0
        
        # Recency impact
        if days_since_purchase > 180:
            churn_score += 0.35
        elif days_since_purchase > 90:
            churn_score += 0.2
        elif days_since_purchase > 60:
            churn_score += 0.1
        
        # Frequency impact
        if purchase_frequency < 0.5:
            churn_score += 0.2
        elif purchase_frequency > 2:
            churn_score -= 0.1
        
        # Support issues
        if support_tickets > 3:
            churn_score += 0.2
        elif support_tickets > 1:
            churn_score += 0.1
        
        # Engagement
        if email_engagement < 0.1:
            churn_score += 0.15
        elif email_engagement > 0.5:
            churn_score -= 0.1
        
        churn_score = max(0, min(1, churn_score))
        
        # Determine risk level
        if churn_score >= 0.7:
            risk_level = "HIGH"
            action = "Immediate retention campaign needed"
        elif churn_score >= 0.4:
            risk_level = "MEDIUM"
            action = "Send personalized re-engagement offer"
        else:
            risk_level = "LOW"
            action = "Continue normal engagement"
        
        return {
            "success": True,
            "churnProbability": round(churn_score, 3),
            "riskLevel": risk_level,
            "recommendedAction": action,
            "factors": {
                "recency": "concerning" if days_since_purchase > 90 else "good",
                "frequency": "low" if purchase_frequency < 1 else "healthy",
                "engagement": "poor" if email_engagement < 0.2 else "active"
            },
            "timestamp": datetime.now().isoformat()
        }


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    engine = NeuralCommerceEngine()
    
    if len(sys.argv) > 1:
        task = sys.argv[1]
        try:
            input_data = {}
            if len(sys.argv) > 2:
                if sys.argv[2] == "--stdin":
                    input_data = json.loads(sys.stdin.read())
                else:
                    input_data = json.loads(sys.argv[2])
            
            if task == "intent":
                result = engine.predict_purchase_intent(
                    input_data.get('user', {}),
                    input_data.get('product', {}),
                    input_data.get('context', {})
                )
            elif task == "placement":
                result = engine.optimize_product_placement(
                    input_data.get('products', []),
                    input_data.get('segments', [])
                )
            elif task == "pricing":
                result = engine.generate_dynamic_pricing(
                    input_data.get('product', {}),
                    input_data.get('demand', {}),
                    input_data.get('inventory', {})
                )
            elif task == "journey":
                result = engine.customer_journey_optimization(input_data)
            elif task == "churn":
                result = engine.predict_churn(input_data)
            else:
                result = {"error": f"Unknown task: {task}"}
            
            print(json.dumps(result))
        except Exception as e:
            import traceback
            print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))
    else:
        print(json.dumps({
            "engine": "Neural Commerce Engine",
            "version": engine.model_version,
            "tasks": ["intent", "placement", "pricing", "journey", "churn"],
            "status": "ready"
        }))
