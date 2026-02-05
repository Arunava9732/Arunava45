#!/usr/bin/env python3
"""
Price Optimization Engine for BLACKONN
Dynamic pricing, competitor analysis, and margin optimization
"""

import json
import sys
import math
from datetime import datetime, timedelta
from collections import defaultdict

# ==========================================
# PRICE OPTIMIZATION ENGINE
# ==========================================

class PriceOptimizer:
    def __init__(self):
        self.min_margin = 0.15  # 15% minimum margin
        self.max_discount = 0.50  # 50% max discount
        self.elasticity_default = -1.5  # Price elasticity
    
    def calculate_elasticity(self, price_history, sales_history):
        """Calculate price elasticity of demand"""
        if len(price_history) < 2 or len(sales_history) < 2:
            return self.elasticity_default
        
        # Calculate percentage changes
        price_changes = []
        demand_changes = []
        
        for i in range(1, min(len(price_history), len(sales_history))):
            if price_history[i-1] > 0 and sales_history[i-1] > 0:
                price_pct = (price_history[i] - price_history[i-1]) / price_history[i-1]
                demand_pct = (sales_history[i] - sales_history[i-1]) / sales_history[i-1]
                
                if abs(price_pct) > 0.01:  # Meaningful price change
                    price_changes.append(price_pct)
                    demand_changes.append(demand_pct)
        
        if not price_changes:
            return self.elasticity_default
        
        # Average elasticity
        elasticities = [d / p if p != 0 else 0 for p, d in zip(price_changes, demand_changes)]
        avg_elasticity = sum(elasticities) / len(elasticities)
        
        # Bound elasticity to reasonable range
        return max(min(avg_elasticity, -0.5), -3.0)
    
    def optimize_price(self, product, cost, current_demand, competitor_prices=None):
        """Calculate optimal price for a product"""
        current_price = product.get('price', 0)
        elasticity = product.get('elasticity', self.elasticity_default)
        
        # Cost-plus pricing baseline
        min_price = cost / (1 - self.min_margin) if cost > 0 else current_price * 0.5
        
        # Competitor analysis
        if competitor_prices:
            avg_competitor = sum(competitor_prices) / len(competitor_prices)
            min_competitor = min(competitor_prices)
            max_competitor = max(competitor_prices)
            
            competitor_factor = 1.0
            if current_price > avg_competitor * 1.2:
                competitor_factor = 0.95  # Price is too high
            elif current_price < avg_competitor * 0.8:
                competitor_factor = 1.05  # Room to increase
        else:
            competitor_factor = 1.0
            avg_competitor = None
        
        # Demand-based adjustment
        demand_factor = 1.0
        if current_demand > 0:
            # High demand -> can increase price
            if current_demand > product.get('avgDemand', current_demand):
                demand_factor = 1.0 + (0.1 * min(current_demand / product.get('avgDemand', current_demand) - 1, 0.5))
            else:
                demand_factor = 0.95
        
        # Stock-based adjustment
        stock = product.get('stock', 0)
        stock_factor = 1.0
        if stock > 100:
            stock_factor = 0.95  # Excess stock, reduce price
        elif stock < 10 and stock > 0:
            stock_factor = 1.05  # Low stock, increase price
        
        # Calculate optimal price
        optimal_price = current_price * competitor_factor * demand_factor * stock_factor
        
        # Apply constraints
        optimal_price = max(optimal_price, min_price)
        optimal_price = max(optimal_price, current_price * (1 - self.max_discount))
        
        # Round to nice price point
        optimal_price = self._round_to_price_point(optimal_price)
        
        return {
            "currentPrice": current_price,
            "optimalPrice": optimal_price,
            "minPrice": round(min_price, 2),
            "priceChange": round(optimal_price - current_price, 2),
            "priceChangePercent": round((optimal_price - current_price) / current_price * 100, 2) if current_price > 0 else 0,
            "factors": {
                "competitor": round(competitor_factor, 4),
                "demand": round(demand_factor, 4),
                "stock": round(stock_factor, 4)
            },
            "competitorAvg": avg_competitor,
            "recommendation": self._get_recommendation(current_price, optimal_price)
        }
    
    def _round_to_price_point(self, price):
        """Round to psychological price point"""
        if price < 100:
            return math.ceil(price / 5) * 5 - 1  # e.g., 99, 149
        elif price < 1000:
            return math.ceil(price / 50) * 50 - 1  # e.g., 499, 999
        else:
            return math.ceil(price / 100) * 100 - 1  # e.g., 1499, 1999
    
    def _get_recommendation(self, current, optimal):
        """Generate pricing recommendation"""
        diff_pct = (optimal - current) / current * 100 if current > 0 else 0
        
        if abs(diff_pct) < 2:
            return "HOLD - Current price is optimal"
        elif diff_pct > 10:
            return "INCREASE STRONGLY - Significant room for price increase"
        elif diff_pct > 5:
            return "INCREASE - Consider raising price"
        elif diff_pct < -10:
            return "DECREASE STRONGLY - Price reduction recommended"
        elif diff_pct < -5:
            return "DECREASE - Consider lowering price"
        else:
            return "MINOR ADJUSTMENT - Small price change may help"
    
    def bundle_pricing(self, products, discount_percent=15):
        """Calculate bundle pricing for products"""
        if not products:
            return {"error": "No products provided"}
        
        total_price = sum(p.get('price', 0) for p in products)
        total_cost = sum(p.get('cost', p.get('price', 0) * 0.4) for p in products)
        
        bundle_discount = discount_percent / 100
        bundle_price = total_price * (1 - bundle_discount)
        
        # Ensure minimum margin
        min_bundle_price = total_cost / (1 - self.min_margin)
        bundle_price = max(bundle_price, min_bundle_price)
        bundle_price = self._round_to_price_point(bundle_price)
        
        savings = total_price - bundle_price
        actual_discount = savings / total_price * 100 if total_price > 0 else 0
        margin = (bundle_price - total_cost) / bundle_price * 100 if bundle_price > 0 else 0
        
        return {
            "products": [{"id": p.get('id'), "name": p.get('name'), "price": p.get('price')} for p in products],
            "originalTotal": round(total_price, 2),
            "bundlePrice": round(bundle_price, 2),
            "savings": round(savings, 2),
            "discountPercent": round(actual_discount, 2),
            "marginPercent": round(margin, 2),
            "isViable": margin >= self.min_margin * 100
        }
    
    def clearance_pricing(self, products, target_days=30):
        """Calculate clearance prices for slow-moving inventory"""
        results = []
        
        for product in products:
            current_price = product.get('price', 0)
            stock = product.get('stock', 0)
            daily_sales = product.get('dailySales', 0.1)
            cost = product.get('cost', current_price * 0.4)
            
            if stock <= 0:
                continue
            
            # Days to clear at current rate
            days_to_clear = stock / daily_sales if daily_sales > 0 else 999
            
            if days_to_clear <= target_days:
                # No discount needed
                results.append({
                    "product": {"id": product.get('id'), "name": product.get('name')},
                    "currentPrice": current_price,
                    "clearancePrice": current_price,
                    "discountPercent": 0,
                    "daysToSell": round(days_to_clear, 1),
                    "action": "NONE - Selling well"
                })
                continue
            
            # Calculate required price to clear in target days
            required_daily_sales = stock / target_days
            sales_increase_needed = required_daily_sales / daily_sales if daily_sales > 0 else 2
            
            # Use elasticity to calculate price reduction
            elasticity = product.get('elasticity', self.elasticity_default)
            price_change = (sales_increase_needed - 1) / elasticity
            
            clearance_price = current_price * (1 + price_change)
            
            # Apply constraints
            min_price = cost * 1.05  # At least 5% above cost
            clearance_price = max(clearance_price, min_price)
            clearance_price = max(clearance_price, current_price * 0.5)  # Max 50% off
            clearance_price = self._round_to_price_point(clearance_price)
            
            discount = (current_price - clearance_price) / current_price * 100
            
            results.append({
                "product": {"id": product.get('id'), "name": product.get('name')},
                "currentPrice": current_price,
                "clearancePrice": round(clearance_price, 2),
                "discountPercent": round(discount, 2),
                "stock": stock,
                "currentDaysToSell": round(days_to_clear, 1),
                "targetDays": target_days,
                "action": "DISCOUNT" if discount > 5 else "MINOR REDUCTION"
            })
        
        return {"clearancePricing": results}
    
    def seasonal_pricing(self, product, season, base_adjustments=None):
        """Apply seasonal pricing adjustments"""
        adjustments = base_adjustments or {
            'winter': {'Hoodies': 1.15, 'Jackets': 1.20, 'T-Shirts': 0.90},
            'summer': {'Hoodies': 0.85, 'Jackets': 0.80, 'T-Shirts': 1.10},
            'monsoon': {'Jackets': 1.10, 'T-Shirts': 0.95},
            'festive': {'all': 1.05}  # General festive markup
        }
        
        current_price = product.get('price', 0)
        category = product.get('category', '')
        
        season_adj = adjustments.get(season.lower(), {})
        
        # Get adjustment factor
        factor = season_adj.get(category, season_adj.get('all', 1.0))
        
        seasonal_price = current_price * factor
        seasonal_price = self._round_to_price_point(seasonal_price)
        
        return {
            "product": {"id": product.get('id'), "name": product.get('name')},
            "season": season,
            "currentPrice": current_price,
            "seasonalPrice": seasonal_price,
            "adjustmentFactor": round(factor, 4),
            "priceChange": round(seasonal_price - current_price, 2)
        }
    
    def margin_analysis(self, products, costs=None):
        """Analyze profit margins across products"""
        results = []
        total_revenue = 0
        total_cost = 0
        
        cost_map = {}
        if costs:
            cost_map = {c.get('productId'): c.get('cost', 0) for c in costs}
        
        for product in products:
            pid = product.get('id')
            price = product.get('price', 0)
            stock = product.get('stock', 0)
            sales = product.get('salesCount', 0)
            
            cost = cost_map.get(pid, product.get('cost', price * 0.4))
            
            if price > 0:
                margin_pct = (price - cost) / price * 100
                markup_pct = (price - cost) / cost * 100 if cost > 0 else 0
                
                revenue = price * sales
                profit = (price - cost) * sales
                
                total_revenue += revenue
                total_cost += cost * sales
                
                results.append({
                    "product": {"id": pid, "name": product.get('name'), "category": product.get('category')},
                    "price": price,
                    "cost": round(cost, 2),
                    "marginPercent": round(margin_pct, 2),
                    "markupPercent": round(markup_pct, 2),
                    "revenue": round(revenue, 2),
                    "profit": round(profit, 2),
                    "stock": stock,
                    "stockValue": round(cost * stock, 2),
                    "health": "GOOD" if margin_pct >= 30 else ("FAIR" if margin_pct >= 20 else "LOW")
                })
        
        # Sort by margin
        results.sort(key=lambda x: x['marginPercent'])
        
        overall_margin = (total_revenue - total_cost) / total_revenue * 100 if total_revenue > 0 else 0
        
        return {
            "products": results,
            "summary": {
                "totalRevenue": round(total_revenue, 2),
                "totalCost": round(total_cost, 2),
                "totalProfit": round(total_revenue - total_cost, 2),
                "overallMargin": round(overall_margin, 2),
                "lowMarginCount": len([r for r in results if r['marginPercent'] < 20]),
                "goodMarginCount": len([r for r in results if r['marginPercent'] >= 30])
            }
        }


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    optimizer = PriceOptimizer()
    
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
            
            if task == "optimize":
                product = input_data.get('product', {})
                cost = input_data.get('cost', product.get('price', 0) * 0.4)
                demand = input_data.get('demand', 10)
                competitors = input_data.get('competitorPrices', [])
                result = optimizer.optimize_price(product, cost, demand, competitors)
                print(json.dumps(result))
            
            elif task == "bundle":
                products = input_data.get('products', [])
                discount = input_data.get('discount', 15)
                result = optimizer.bundle_pricing(products, discount)
                print(json.dumps(result))
            
            elif task == "clearance":
                products = input_data.get('products', [])
                target_days = input_data.get('targetDays', 30)
                result = optimizer.clearance_pricing(products, target_days)
                print(json.dumps(result))
            
            elif task == "seasonal":
                product = input_data.get('product', {})
                season = input_data.get('season', 'summer')
                result = optimizer.seasonal_pricing(product, season)
                print(json.dumps(result))
            
            elif task == "margin":
                products = input_data.get('products', [])
                costs = input_data.get('costs', [])
                result = optimizer.margin_analysis(products, costs)
                print(json.dumps(result))
            
            elif task == "elasticity":
                prices = input_data.get('priceHistory', [])
                sales = input_data.get('salesHistory', [])
                result = optimizer.calculate_elasticity(prices, sales)
                print(json.dumps({"elasticity": result}))
            
            elif task == "status" or task == "health":
                print(json.dumps({"status": "healthy", "version": "1.0.0"}))
            
            else:
                print(json.dumps({"error": f"Unknown task: {task}"}))
        
        except Exception as e:
            print(json.dumps({"error": str(e)}))
    else:
        print(json.dumps({"status": "healthy", "engine": "Price Optimizer v1.0"}))
