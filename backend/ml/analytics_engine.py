#!/usr/bin/env python3
"""
Advanced Analytics Engine for BLACKONN
Provides statistical analysis, customer segmentation, and business intelligence
"""

import json
import sys
from datetime import datetime, timedelta
from collections import defaultdict
import math

# ==========================================
# CUSTOMER ANALYTICS
# ==========================================

def calculate_rfm_scores(data):
    """
    RFM Analysis (Recency, Frequency, Monetary)
    Segments customers based on purchase behavior
    """
    customers = data.get('customers', [])
    orders = data.get('orders', [])
    
    if not customers or not orders:
        return {"segments": [], "summary": {"total_customers": 0}}
    
    now = datetime.now()
    customer_metrics = {}
    
    for order in orders:
        cid = order.get('userId') or order.get('customerId')
        if not cid:
            continue
            
        if cid not in customer_metrics:
            customer_metrics[cid] = {
                'orders': [],
                'total_spent': 0,
                'last_order': None
            }
        
        order_date = order.get('createdAt') or order.get('date')
        amount = float(order.get('total', 0) or order.get('amount', 0))
        
        customer_metrics[cid]['orders'].append(order_date)
        customer_metrics[cid]['total_spent'] += amount
        
        if order_date:
            try:
                parsed_date = datetime.fromisoformat(order_date.replace('Z', '+00:00'))
                if not customer_metrics[cid]['last_order'] or parsed_date > customer_metrics[cid]['last_order']:
                    customer_metrics[cid]['last_order'] = parsed_date
            except:
                pass
    
    # Calculate RFM scores
    segments = []
    for cid, metrics in customer_metrics.items():
        recency_days = 365
        if metrics['last_order']:
            recency_days = (now - metrics['last_order'].replace(tzinfo=None)).days
        
        frequency = len(metrics['orders'])
        monetary = metrics['total_spent']
        
        # Score calculation (1-5 scale)
        r_score = 5 if recency_days <= 30 else 4 if recency_days <= 60 else 3 if recency_days <= 90 else 2 if recency_days <= 180 else 1
        f_score = min(5, frequency)
        m_score = 5 if monetary >= 5000 else 4 if monetary >= 2500 else 3 if monetary >= 1000 else 2 if monetary >= 500 else 1
        
        rfm_score = r_score * 100 + f_score * 10 + m_score
        
        # Segment classification
        if r_score >= 4 and f_score >= 4:
            segment = "Champions"
        elif r_score >= 4 and f_score <= 2:
            segment = "New Customers"
        elif r_score <= 2 and f_score >= 4:
            segment = "At Risk"
        elif r_score <= 2 and f_score <= 2:
            segment = "Lost"
        elif r_score >= 3 and f_score >= 3:
            segment = "Loyal Customers"
        else:
            segment = "Potential Loyalists"
        
        segments.append({
            "customerId": cid,
            "recency": recency_days,
            "frequency": frequency,
            "monetary": monetary,
            "rfmScore": rfm_score,
            "segment": segment,
            "scores": {"R": r_score, "F": f_score, "M": m_score}
        })
    
    # Summary statistics
    segment_counts = defaultdict(int)
    for s in segments:
        segment_counts[s['segment']] += 1
    
    return {
        "segments": sorted(segments, key=lambda x: x['rfmScore'], reverse=True)[:100],
        "summary": {
            "total_customers": len(segments),
            "segment_distribution": dict(segment_counts),
            "avg_monetary": sum(s['monetary'] for s in segments) / len(segments) if segments else 0,
            "avg_frequency": sum(s['frequency'] for s in segments) / len(segments) if segments else 0
        }
    }


def cohort_analysis(data):
    """
    Cohort Analysis - Track customer retention by signup month
    """
    users = data.get('users', [])
    orders = data.get('orders', [])
    
    if not users or not orders:
        return {"cohorts": [], "retention_matrix": []}
    
    # Group users by signup month
    user_cohorts = {}
    for user in users:
        created = user.get('createdAt') or user.get('signupDate')
        if created:
            try:
                date = datetime.fromisoformat(created.replace('Z', '+00:00'))
                cohort_key = date.strftime('%Y-%m')
                uid = user.get('id') or user.get('email')
                if uid:
                    user_cohorts[uid] = cohort_key
            except:
                pass
    
    # Track orders by cohort and month
    cohort_orders = defaultdict(lambda: defaultdict(set))
    for order in orders:
        uid = order.get('userId') or order.get('email')
        order_date = order.get('createdAt') or order.get('date')
        
        if uid in user_cohorts and order_date:
            try:
                date = datetime.fromisoformat(order_date.replace('Z', '+00:00'))
                order_month = date.strftime('%Y-%m')
                cohort_orders[user_cohorts[uid]][order_month].add(uid)
            except:
                pass
    
    # Build retention matrix
    cohorts = sorted(cohort_orders.keys())
    retention_matrix = []
    
    for cohort in cohorts[-6:]:  # Last 6 cohorts
        cohort_size = len([u for u, c in user_cohorts.items() if c == cohort])
        row = {"cohort": cohort, "size": cohort_size, "retention": []}
        
        for i, month in enumerate(sorted(cohort_orders[cohort].keys())[:6]):
            active = len(cohort_orders[cohort][month])
            retention_rate = (active / cohort_size * 100) if cohort_size > 0 else 0
            row["retention"].append(round(retention_rate, 1))
        
        retention_matrix.append(row)
    
    return {
        "cohorts": cohorts,
        "retention_matrix": retention_matrix,
        "insights": [
            f"Tracked {len(cohorts)} customer cohorts",
            f"Total users analyzed: {len(user_cohorts)}"
        ]
    }


# ==========================================
# SALES ANALYTICS
# ==========================================

def sales_forecasting(data):
    """
    Simple time-series forecasting using moving averages
    """
    orders = data.get('orders', [])
    days_ahead = data.get('days', 7)
    
    if not orders:
        return {"forecast": [], "trend": "stable", "confidence": 0}
    
    # Aggregate daily sales
    daily_sales = defaultdict(float)
    for order in orders:
        order_date = order.get('createdAt') or order.get('date')
        amount = float(order.get('total', 0) or order.get('amount', 0))
        
        if order_date:
            try:
                date = datetime.fromisoformat(order_date.replace('Z', '+00:00'))
                day_key = date.strftime('%Y-%m-%d')
                daily_sales[day_key] += amount
            except:
                pass
    
    if not daily_sales:
        return {"forecast": [], "trend": "stable", "confidence": 0}
    
    # Sort by date and get recent data
    sorted_days = sorted(daily_sales.keys())[-30:]  # Last 30 days
    values = [daily_sales[d] for d in sorted_days]
    
    # Calculate moving averages
    ma_7 = sum(values[-7:]) / min(7, len(values)) if values else 0
    ma_14 = sum(values[-14:]) / min(14, len(values)) if values else 0
    ma_30 = sum(values) / len(values) if values else 0
    
    # Determine trend
    if ma_7 > ma_14 * 1.1:
        trend = "growing"
        growth_rate = ((ma_7 - ma_14) / ma_14 * 100) if ma_14 > 0 else 0
    elif ma_7 < ma_14 * 0.9:
        trend = "declining"
        growth_rate = ((ma_7 - ma_14) / ma_14 * 100) if ma_14 > 0 else 0
    else:
        trend = "stable"
        growth_rate = 0
    
    # Generate forecast
    forecast = []
    base = ma_7
    daily_growth = 1 + (growth_rate / 100 / 7)
    
    for i in range(days_ahead):
        future_date = datetime.now() + timedelta(days=i+1)
        predicted = base * (daily_growth ** (i+1))
        
        # Add some variance for weekends
        if future_date.weekday() >= 5:
            predicted *= 0.85  # Lower weekend sales
        
        forecast.append({
            "date": future_date.strftime('%Y-%m-%d'),
            "predicted": round(predicted, 2),
            "lower_bound": round(predicted * 0.8, 2),
            "upper_bound": round(predicted * 1.2, 2)
        })
    
    return {
        "forecast": forecast,
        "trend": trend,
        "growth_rate": round(growth_rate, 2),
        "moving_averages": {
            "ma_7": round(ma_7, 2),
            "ma_14": round(ma_14, 2),
            "ma_30": round(ma_30, 2)
        },
        "confidence": round(min(0.9, 0.4 + (len(sorted_days) / 30 * 0.5)), 2),
        "historical_days": len(sorted_days)
    }


def product_performance(data):
    """
    Analyze product performance metrics
    """
    products = data.get('products', [])
    orders = data.get('orders', [])
    
    product_stats = defaultdict(lambda: {
        'sold': 0, 'revenue': 0, 'views': 0, 'cart_adds': 0
    })
    
    for order in orders:
        items = order.get('items', [])
        for item in items:
            pid = item.get('productId') or item.get('id')
            if pid:
                product_stats[pid]['sold'] += item.get('quantity', 1)
                product_stats[pid]['revenue'] += float(item.get('price', 0)) * item.get('quantity', 1)
    
    # Enrich with product details
    product_map = {p.get('id'): p for p in products}
    
    performance = []
    for pid, stats in product_stats.items():
        product = product_map.get(pid, {})
        
        # Calculate metrics
        conversion_rate = (stats['sold'] / stats['views'] * 100) if stats['views'] > 0 else 0
        
        performance.append({
            "productId": pid,
            "name": product.get('name', 'Unknown'),
            "category": product.get('category', 'Unknown'),
            "unitsSold": stats['sold'],
            "revenue": round(stats['revenue'], 2),
            "conversionRate": round(conversion_rate, 2),
            "avgOrderValue": round(stats['revenue'] / stats['sold'], 2) if stats['sold'] > 0 else 0,
            "stockLevel": product.get('stock', 0),
            "performanceScore": min(100, stats['sold'] * 10 + stats['revenue'] / 100)
        })
    
    # Sort by performance
    performance.sort(key=lambda x: x['performanceScore'], reverse=True)
    
    return {
        "products": performance[:20],
        "top_sellers": performance[:5],
        "underperformers": [p for p in performance if p['unitsSold'] < 2][-5:],
        "total_products_sold": sum(p['unitsSold'] for p in performance),
        "total_revenue": sum(p['revenue'] for p in performance)
    }


# ==========================================
# A/B TESTING ANALYSIS
# ==========================================

def ab_test_analysis(data):
    """
    Statistical analysis for A/B tests
    """
    test = data.get('test', {})
    variant_a = test.get('variantA', {})
    variant_b = test.get('variantB', {})
    
    # Extract metrics
    visitors_a = variant_a.get('visitors', 0)
    conversions_a = variant_a.get('conversions', 0)
    visitors_b = variant_b.get('visitors', 0)
    conversions_b = variant_b.get('conversions', 0)
    
    if visitors_a == 0 or visitors_b == 0:
        return {"error": "Insufficient data for analysis"}
    
    # Calculate conversion rates
    rate_a = conversions_a / visitors_a
    rate_b = conversions_b / visitors_b
    
    # Calculate lift
    lift = ((rate_b - rate_a) / rate_a * 100) if rate_a > 0 else 0
    
    # Simple z-test for statistical significance
    pooled_rate = (conversions_a + conversions_b) / (visitors_a + visitors_b)
    se = math.sqrt(pooled_rate * (1 - pooled_rate) * (1/visitors_a + 1/visitors_b))
    
    z_score = (rate_b - rate_a) / se if se > 0 else 0
    
    # Determine significance (z > 1.96 for 95% confidence)
    is_significant = abs(z_score) > 1.96
    confidence_level = min(99.9, abs(z_score) / 1.96 * 95)
    
    # Winner determination
    if is_significant:
        winner = "B" if rate_b > rate_a else "A"
    else:
        winner = "No clear winner yet"
    
    return {
        "variantA": {
            "visitors": visitors_a,
            "conversions": conversions_a,
            "conversionRate": round(rate_a * 100, 2)
        },
        "variantB": {
            "visitors": visitors_b,
            "conversions": conversions_b,
            "conversionRate": round(rate_b * 100, 2)
        },
        "analysis": {
            "lift": round(lift, 2),
            "zScore": round(z_score, 3),
            "isSignificant": is_significant,
            "confidenceLevel": round(confidence_level, 1),
            "winner": winner,
            "recommendation": f"Variant {winner} shows a {abs(lift):.1f}% {'improvement' if lift > 0 else 'decrease'}" if is_significant else "Continue testing - need more data"
        },
        "sampleSize": {
            "current": visitors_a + visitors_b,
            "recommended": int(16 * pooled_rate * (1 - pooled_rate) / (0.01 ** 2)) if pooled_rate > 0 else 1000
        }
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
            
            if task == "rfm":
                print(json.dumps(calculate_rfm_scores(input_data)))
            elif task == "cohort":
                print(json.dumps(cohort_analysis(input_data)))
            elif task == "forecast":
                print(json.dumps(sales_forecasting(input_data)))
            elif task == "product-performance":
                print(json.dumps(product_performance(input_data)))
            elif task == "ab-test":
                print(json.dumps(ab_test_analysis(input_data)))
            else:
                print(json.dumps({"error": f"Unknown task: {task}"}))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
    else:
        print(json.dumps({"status": "healthy", "engine": "Analytics Engine v1.0"}))
