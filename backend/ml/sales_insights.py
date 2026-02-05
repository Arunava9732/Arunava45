#!/usr/bin/env python3
"""
Sales Insights Engine for BLACKONN
AI-powered sales analytics, forecasting, and insights generation
"""

import json
import sys
import statistics
from datetime import datetime, timedelta
from collections import defaultdict

# ==========================================
# SALES INSIGHTS ENGINE
# ==========================================

class SalesInsightsEngine:
    """AI-powered sales insights and analytics"""
    
    def __init__(self):
        self.model_version = "2.0.0"
    
    def generate_insights(self, sales_data):
        """Generate comprehensive sales insights"""
        orders = sales_data.get('orders', [])
        products = sales_data.get('products', [])
        time_period = sales_data.get('period', 'month')
        
        if not orders:
            return {"success": False, "error": "No order data provided"}
        
        insights = []
        
        # Revenue insights
        revenue_insight = self._analyze_revenue(orders)
        insights.append(revenue_insight)
        
        # Product performance
        product_insight = self._analyze_products(orders, products)
        insights.append(product_insight)
        
        # Customer insights
        customer_insight = self._analyze_customers(orders)
        insights.append(customer_insight)
        
        # Time-based patterns
        time_insight = self._analyze_time_patterns(orders)
        insights.append(time_insight)
        
        # Growth insights
        growth_insight = self._analyze_growth(orders)
        insights.append(growth_insight)
        
        return {
            "success": True,
            "insights": insights,
            "summary": self._generate_summary(orders),
            "recommendations": self._generate_recommendations(insights),
            "timestamp": datetime.now().isoformat()
        }
    
    def _analyze_revenue(self, orders):
        """Analyze revenue patterns"""
        revenues = [o.get('total', 0) for o in orders]
        
        if not revenues:
            return {"type": "revenue", "message": "No revenue data"}
        
        total = sum(revenues)
        avg = statistics.mean(revenues)
        median = statistics.median(revenues)
        
        # Identify revenue distribution
        high_value = len([r for r in revenues if r > avg * 2])
        low_value = len([r for r in revenues if r < avg * 0.5])
        
        insight_message = f"Total revenue: ₹{total:,.2f} from {len(orders)} orders. "
        
        if high_value > len(orders) * 0.1:
            insight_message += f"Strong high-value order presence ({high_value} orders above ₹{avg*2:,.0f}). "
            severity = "positive"
        elif low_value > len(orders) * 0.5:
            insight_message += "Many low-value orders - consider upselling strategies. "
            severity = "warning"
        else:
            insight_message += "Healthy order value distribution. "
            severity = "positive"
        
        return {
            "type": "REVENUE_ANALYSIS",
            "severity": severity,
            "title": "Revenue Performance",
            "message": insight_message,
            "metrics": {
                "totalRevenue": round(total, 2),
                "averageOrderValue": round(avg, 2),
                "medianOrderValue": round(median, 2),
                "orderCount": len(orders)
            }
        }
    
    def _analyze_products(self, orders, products):
        """Analyze product performance"""
        product_sales = defaultdict(lambda: {'quantity': 0, 'revenue': 0, 'orders': 0})
        
        for order in orders:
            for item in order.get('items', []):
                pid = item.get('productId', item.get('id'))
                qty = item.get('quantity', 1)
                price = item.get('price', 0) * qty
                
                product_sales[pid]['quantity'] += qty
                product_sales[pid]['revenue'] += price
                product_sales[pid]['orders'] += 1
        
        # Sort by revenue
        sorted_products = sorted(product_sales.items(), key=lambda x: x[1]['revenue'], reverse=True)
        
        # Top performers
        top_products = sorted_products[:5]
        
        # Calculate concentration
        total_revenue = sum(p['revenue'] for _, p in sorted_products)
        top_10_revenue = sum(p['revenue'] for _, p in sorted_products[:10])
        concentration = top_10_revenue / total_revenue * 100 if total_revenue > 0 else 0
        
        insight_message = f"Top product drives ₹{top_products[0][1]['revenue']:,.0f} revenue. " if top_products else ""
        
        if concentration > 80:
            insight_message += f"High concentration: top 10 products generate {concentration:.0f}% of revenue. Consider diversifying."
            severity = "warning"
        else:
            insight_message += f"Healthy product mix with {len(product_sales)} active products."
            severity = "positive"
        
        return {
            "type": "PRODUCT_PERFORMANCE",
            "severity": severity,
            "title": "Product Analysis",
            "message": insight_message,
            "metrics": {
                "activeProducts": len(product_sales),
                "topProductsRevenue": round(top_10_revenue, 2),
                "concentration": round(concentration, 1)
            },
            "topProducts": [
                {
                    "productId": pid,
                    "quantity": data['quantity'],
                    "revenue": round(data['revenue'], 2)
                }
                for pid, data in top_products
            ]
        }
    
    def _analyze_customers(self, orders):
        """Analyze customer behavior"""
        customer_orders = defaultdict(list)
        
        for order in orders:
            customer_id = order.get('userId', order.get('customerId', 'unknown'))
            customer_orders[customer_id].append(order)
        
        # Customer metrics
        total_customers = len(customer_orders)
        repeat_customers = len([c for c, orders in customer_orders.items() if len(orders) > 1])
        repeat_rate = repeat_customers / total_customers * 100 if total_customers > 0 else 0
        
        # Customer lifetime value
        clv_values = []
        for customer_id, cust_orders in customer_orders.items():
            total_spent = sum(o.get('total', 0) for o in cust_orders)
            clv_values.append(total_spent)
        
        avg_clv = statistics.mean(clv_values) if clv_values else 0
        
        insight_message = f"{total_customers} unique customers. "
        
        if repeat_rate > 30:
            insight_message += f"Excellent retention: {repeat_rate:.1f}% repeat rate!"
            severity = "positive"
        elif repeat_rate > 15:
            insight_message += f"Good retention: {repeat_rate:.1f}% repeat rate."
            severity = "positive"
        else:
            insight_message += f"Low retention: only {repeat_rate:.1f}% repeat rate. Focus on loyalty programs."
            severity = "warning"
        
        return {
            "type": "CUSTOMER_INSIGHTS",
            "severity": severity,
            "title": "Customer Analysis",
            "message": insight_message,
            "metrics": {
                "totalCustomers": total_customers,
                "repeatCustomers": repeat_customers,
                "repeatRate": round(repeat_rate, 1),
                "averageCLV": round(avg_clv, 2)
            }
        }
    
    def _analyze_time_patterns(self, orders):
        """Analyze time-based patterns"""
        hourly = defaultdict(int)
        daily = defaultdict(int)
        monthly = defaultdict(float)
        
        for order in orders:
            created = order.get('createdAt', order.get('date', ''))
            try:
                dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                hourly[dt.hour] += 1
                daily[dt.strftime('%A')] += 1
                monthly[dt.strftime('%Y-%m')] += order.get('total', 0)
            except:
                pass
        
        # Find peak times
        peak_hour = max(hourly.items(), key=lambda x: x[1])[0] if hourly else 12
        peak_day = max(daily.items(), key=lambda x: x[1])[0] if daily else 'Monday'
        
        insight_message = f"Peak ordering time: {peak_hour}:00. Best day: {peak_day}. "
        
        # Check for weekend patterns
        weekend_orders = daily.get('Saturday', 0) + daily.get('Sunday', 0)
        weekday_orders = sum(daily[d] for d in ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'] if d in daily)
        
        if weekend_orders > weekday_orders * 0.5:
            insight_message += "Strong weekend sales - consider weekend promotions."
        else:
            insight_message += "Weekday-focused sales pattern."
        
        return {
            "type": "TIME_PATTERNS",
            "severity": "info",
            "title": "Timing Analysis",
            "message": insight_message,
            "metrics": {
                "peakHour": peak_hour,
                "peakDay": peak_day,
                "weekendPercentage": round(weekend_orders / max(weekend_orders + weekday_orders, 1) * 100, 1)
            },
            "hourlyDistribution": dict(sorted(hourly.items())),
            "dailyDistribution": dict(daily)
        }
    
    def _analyze_growth(self, orders):
        """Analyze growth trends"""
        # Group by week
        weekly_revenue = defaultdict(float)
        weekly_orders = defaultdict(int)
        
        for order in orders:
            created = order.get('createdAt', order.get('date', ''))
            try:
                dt = datetime.fromisoformat(created.replace('Z', '+00:00'))
                week_key = dt.strftime('%Y-W%W')
                weekly_revenue[week_key] += order.get('total', 0)
                weekly_orders[week_key] += 1
            except:
                pass
        
        if len(weekly_revenue) < 2:
            return {
                "type": "GROWTH_ANALYSIS",
                "severity": "info",
                "title": "Growth Trend",
                "message": "Need more data for growth analysis",
                "metrics": {}
            }
        
        # Calculate growth
        weeks = sorted(weekly_revenue.keys())
        recent_revenue = weekly_revenue[weeks[-1]]
        previous_revenue = weekly_revenue[weeks[-2]]
        
        if previous_revenue > 0:
            growth_rate = (recent_revenue - previous_revenue) / previous_revenue * 100
        else:
            growth_rate = 100 if recent_revenue > 0 else 0
        
        if growth_rate > 20:
            severity = "positive"
            insight_message = f"Strong growth! Revenue up {growth_rate:.1f}% week-over-week."
        elif growth_rate > 0:
            severity = "positive"
            insight_message = f"Steady growth: {growth_rate:.1f}% increase."
        elif growth_rate > -10:
            severity = "warning"
            insight_message = f"Slight decline: {growth_rate:.1f}%. Monitor closely."
        else:
            severity = "critical"
            insight_message = f"Significant decline: {growth_rate:.1f}%. Immediate action needed."
        
        return {
            "type": "GROWTH_ANALYSIS",
            "severity": severity,
            "title": "Growth Trend",
            "message": insight_message,
            "metrics": {
                "weeklyGrowth": round(growth_rate, 1),
                "recentRevenue": round(recent_revenue, 2),
                "previousRevenue": round(previous_revenue, 2)
            }
        }
    
    def _generate_summary(self, orders):
        """Generate executive summary"""
        total_revenue = sum(o.get('total', 0) for o in orders)
        total_orders = len(orders)
        avg_order = total_revenue / total_orders if total_orders > 0 else 0
        
        unique_customers = len(set(o.get('userId', o.get('customerId', '')) for o in orders))
        
        return {
            "totalRevenue": round(total_revenue, 2),
            "totalOrders": total_orders,
            "averageOrderValue": round(avg_order, 2),
            "uniqueCustomers": unique_customers,
            "ordersPerCustomer": round(total_orders / max(unique_customers, 1), 2)
        }
    
    def _generate_recommendations(self, insights):
        """Generate actionable recommendations"""
        recommendations = []
        
        for insight in insights:
            if insight.get('severity') == 'warning':
                if insight['type'] == 'CUSTOMER_INSIGHTS':
                    recommendations.append({
                        "priority": "high",
                        "action": "Implement customer loyalty program",
                        "impact": "Improve repeat purchase rate"
                    })
                elif insight['type'] == 'PRODUCT_PERFORMANCE':
                    recommendations.append({
                        "priority": "medium",
                        "action": "Diversify product offerings",
                        "impact": "Reduce dependency on top products"
                    })
                elif insight['type'] == 'GROWTH_ANALYSIS':
                    recommendations.append({
                        "priority": "high",
                        "action": "Launch promotional campaign",
                        "impact": "Reverse declining trend"
                    })
        
        # Always add optimization recommendations
        recommendations.append({
            "priority": "medium",
            "action": "Optimize peak hour marketing",
            "impact": "Maximize conversion during high-traffic periods"
        })
        
        return recommendations[:5]
    
    def forecast_sales(self, forecast_data):
        """Forecast future sales"""
        historical = forecast_data.get('historical', [])
        days_ahead = forecast_data.get('daysAhead', 30)
        
        if len(historical) < 7:
            return {"success": False, "error": "Need at least 7 days of data"}
        
        # Extract daily revenues
        daily_revenue = [h.get('revenue', h.get('total', 0)) for h in historical]
        
        # Calculate base metrics
        avg = statistics.mean(daily_revenue)
        std = statistics.stdev(daily_revenue) if len(daily_revenue) > 1 else avg * 0.1
        
        # Simple trend
        trend = (daily_revenue[-1] - daily_revenue[0]) / len(daily_revenue) if daily_revenue[0] != 0 else 0
        
        # Generate forecast
        forecasts = []
        base_date = datetime.now()
        
        for day in range(days_ahead):
            future_date = base_date + timedelta(days=day)
            
            # Apply trend
            predicted = avg + (trend * day)
            
            # Add seasonality (weekend boost)
            if future_date.weekday() >= 5:  # Weekend
                predicted *= 1.15
            
            forecasts.append({
                "date": future_date.strftime('%Y-%m-%d'),
                "predicted": round(max(0, predicted), 2),
                "lower": round(max(0, predicted - std), 2),
                "upper": round(predicted + std, 2)
            })
        
        return {
            "success": True,
            "forecasts": forecasts,
            "summary": {
                "totalPredicted": round(sum(f['predicted'] for f in forecasts), 2),
                "averageDaily": round(statistics.mean([f['predicted'] for f in forecasts]), 2),
                "trend": "increasing" if trend > 0 else "decreasing" if trend < 0 else "stable"
            },
            "confidence": 0.75,
            "timestamp": datetime.now().isoformat()
        }
    
    def compare_periods(self, comparison_data):
        """Compare sales across periods"""
        current = comparison_data.get('current', [])
        previous = comparison_data.get('previous', [])
        
        if not current or not previous:
            return {"success": False, "error": "Need both current and previous period data"}
        
        # Calculate metrics for each period
        current_revenue = sum(o.get('total', 0) for o in current)
        previous_revenue = sum(o.get('total', 0) for o in previous)
        
        current_orders = len(current)
        previous_orders = len(previous)
        
        current_aov = current_revenue / current_orders if current_orders > 0 else 0
        previous_aov = previous_revenue / previous_orders if previous_orders > 0 else 0
        
        # Calculate changes
        revenue_change = ((current_revenue - previous_revenue) / previous_revenue * 100) if previous_revenue > 0 else 0
        orders_change = ((current_orders - previous_orders) / previous_orders * 100) if previous_orders > 0 else 0
        aov_change = ((current_aov - previous_aov) / previous_aov * 100) if previous_aov > 0 else 0
        
        return {
            "success": True,
            "comparison": {
                "revenue": {
                    "current": round(current_revenue, 2),
                    "previous": round(previous_revenue, 2),
                    "change": round(revenue_change, 1),
                    "trend": "up" if revenue_change > 0 else "down"
                },
                "orders": {
                    "current": current_orders,
                    "previous": previous_orders,
                    "change": round(orders_change, 1),
                    "trend": "up" if orders_change > 0 else "down"
                },
                "aov": {
                    "current": round(current_aov, 2),
                    "previous": round(previous_aov, 2),
                    "change": round(aov_change, 1),
                    "trend": "up" if aov_change > 0 else "down"
                }
            },
            "summary": self._generate_comparison_summary(revenue_change, orders_change, aov_change),
            "timestamp": datetime.now().isoformat()
        }
    
    def _generate_comparison_summary(self, revenue_change, orders_change, aov_change):
        """Generate comparison summary"""
        if revenue_change > 10 and orders_change > 10:
            return "Excellent growth across all metrics!"
        elif revenue_change > 0:
            return "Positive revenue growth with room for improvement."
        elif revenue_change > -10:
            return "Slight decline - monitor and adjust strategies."
        else:
            return "Significant decline - immediate action required."


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    engine = SalesInsightsEngine()
    
    if len(sys.argv) > 1:
        task = sys.argv[1]
        try:
            input_data = {}
            if len(sys.argv) > 2:
                if sys.argv[2] == "--stdin":
                    input_data = json.loads(sys.stdin.read())
                else:
                    input_data = json.loads(sys.argv[2])
            
            if task == "insights":
                result = engine.generate_insights(input_data)
            elif task == "forecast":
                result = engine.forecast_sales(input_data)
            elif task == "compare":
                result = engine.compare_periods(input_data)
            elif task == "status" or task == "health":
                result = {"status": "healthy", "version": engine.model_version}
            else:
                result = {"error": f"Unknown task: {task}"}
            
            print(json.dumps(result))
        except Exception as e:
            import traceback
            print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))
    else:
        print(json.dumps({
            "engine": "Sales Insights Engine",
            "version": engine.model_version,
            "tasks": ["insights", "forecast", "compare"],
            "status": "healthy"
        }))
