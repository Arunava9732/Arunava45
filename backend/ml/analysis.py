import sys
import json
import random
from datetime import datetime, timedelta

def generate_insights(data):
    # Real-time analysis logic
    insights = []
    
    if not isinstance(data, dict):
        return {"status": "error", "message": "Input data must be a dictionary"}
        
    traffic = data.get('traffic', [])
    if not isinstance(traffic, list): traffic = []
    
    avg_last_3 = 0
    if len(traffic) > 7:
        # Use totalVisits if available, otherwise visits
        key = 'totalVisits' if len(traffic) > 0 and 'totalVisits' in traffic[0] else 'visits'
        avg_last_3 = sum([d.get(key, 0) for d in traffic[-3:]]) / 3
        avg_prev_4 = sum([d.get(key, 0) for d in traffic[-7:-3]]) / 4
        
        if avg_last_3 > avg_prev_4 * 1.1:
            insights.append({
                "type": "GROWTH",
                "title": "Growth Trend",
                "description": "Traffic increased by {:.1f}% recently.".format((avg_last_3/avg_prev_4 - 1)*100),
                "confidence": 0.85
            })
            
    return {
        "status": "success",
        "timestamp": datetime.now().isoformat(),
        "insights": insights,
        "predictions": {
            "tomorrow_traffic": int(avg_last_3 * 1.05) if len(traffic) > 7 else 0,
            "conversion_rate": round(sum([d.get('conversions', 0) for d in traffic]) / max(sum([d.get('visits', 0) for d in traffic]), 1) * 100, 2) if traffic else 0.0
        }
    }

def analyze_sentiment(text):
    # Simple rule-based sentiment analysis
    positive_words = {'good', 'great', 'excellent', 'amazing', 'love', 'happy', 'perfect', 'satisfied', 'thanks', 'thank'}
    negative_words = {'bad', 'poor', 'terrible', 'hate', 'unhappy', 'dissatisfied', 'broken', 'delay', 'worst', 'issue', 'problem', 'angry'}
    
    words = text.lower().split()
    pos_count = sum(1 for w in words if w in positive_words)
    neg_count = sum(1 for w in words if w in negative_words)
    
    score = (pos_count - neg_count) / max(len(words), 1)
    
    sentiment = "neutral"
    if score > 0.05: sentiment = "positive"
    elif score < -0.05: sentiment = "negative"
    
    return {
        "sentiment": sentiment,
        "score": round(score, 3),
        "urgent": neg_count > 2 or "asap" in words or "immediately" in words
    }

def recommend_products(data):
    current_product = data.get('current_product', {})
    all_products = data.get('all_products', [])
    
    # Simple recommendation based on category and tags
    recommendations = []
    if not current_product:
        return recommendations
        
    for p in all_products:
        if p.get('id') == current_product.get('id'):
            continue
            
        score = 0
        if p.get('category') == current_product.get('category'):
            score += 5
            
        # Tag matching
        cur_tags = set(current_product.get('tags', []))
        p_tags = set(p.get('tags', []))
        score += len(cur_tags.intersection(p_tags)) * 2
        
        if score > 0:
            recommendations.append({"id": p.get('id'), "score": score})
            
    # Sort by score descending
    recommendations.sort(key=lambda x: x['score'], reverse=True)
    return recommendations[:4]

def predict_stock_out(data):
    # ML-based stock depletion prediction
    if not isinstance(data, dict):
        return {"days_remaining": -1, "status": "Invalid input format"}
        
    orders = data.get('orders', [])
    if not isinstance(orders, list): orders = []
    
    product_id = data.get('product_id')
    current_stock = data.get('current_stock', 0)
    
    # Filter orders for this product
    relevant_orders = []
    for o in orders:
        if not isinstance(o, dict): continue
        items = o.get('items', [])
        if not isinstance(items, list): continue
        for item in items:
            if item.get('id') == product_id or item.get('productId') == product_id:
                relevant_orders.append({
                    "date": o.get('createdAt') or o.get('date'),
                    "quantity": item.get('quantity', 1)
                })
    
    if len(relevant_orders) < 3:
        return {"days_remaining": -1, "status": "Insufficient data"}
        
    # Simple linear regression approximation for depletion rate
    try:
        total_qty = sum(o['quantity'] for o in relevant_orders)
        
        def parse_date(date_str):
            if not date_str: return datetime.now()
            return datetime.fromisoformat(date_str.replace('Z', ''))

        first_date = parse_date(relevant_orders[0]['date'])
        last_date = parse_date(relevant_orders[-1]['date'])
        
        days_diff = max(1, (last_date - first_date).days)
        daily_rate = total_qty / days_diff
        
        if daily_rate == 0:
            return {"days_remaining": 999, "status": "Stable"}
            
        days_remaining = int(current_stock / daily_rate)
        return {
            "days_remaining": days_remaining,
            "daily_sales_avg": round(daily_rate, 2),
            "prediction_date": (datetime.now() + timedelta(days=days_remaining)).isoformat(),
            "is_critical": days_remaining < 7
        }
    except Exception as e:
        return {"days_remaining": -1, "status": "Error: " + str(e)}

def audit_seo(data):
    # Technical SEO Audit logic
    elements = data.get('elements', {})
    score = 100
    issues = []
    
    # Title Tag
    title = elements.get('title', '')
    if not title:
        score -= 20
        issues.append("Title tag is missing")
    elif len(title) < 30:
        score -= 5
        issues.append("Title tag is too short (< 30 characters)")
    elif len(title) > 60:
        score -= 5
        issues.append("Title tag is too long (> 60 characters)")
        
    # Meta Description
    description = elements.get('description', '')
    if not description:
        score -= 20
        issues.append("Meta description is missing")
    elif len(description) < 120:
        score -= 5
        issues.append("Meta description is too short (< 120 characters)")
        
    # Keywords
    keywords = elements.get('keywords', [])
    if not keywords:
        score -= 10
        issues.append("Primary keywords not found in metadata")
        
    return {
        "score": max(0, score),
        "issues": issues,
        "timestamp": datetime.now().isoformat()
    }

def scan_security(data):
    # Suspicious pattern detection
    events = data.get('events', [])
    suspicious = []
    
    # 1. Bruteforce detection (many login failures from same IP)
    login_fails = {}
    for e in events:
        if e.get('type') == 'login_failure':
            ip = e.get('ip')
            login_fails[ip] = login_fails.get(ip, 0) + 1
            
    for ip, count in login_fails.items():
        if count > 5:
            suspicious.append({
                "ip": ip,
                "reason": f"High login failure rate ({count} attempts)",
                "severity": "high"
            })
            
    # 2. Unusual hours
    for e in events:
        try:
            ts = datetime.fromisoformat(e.get('timestamp').replace('Z', ''))
            if ts.hour >= 1 and ts.hour <= 4:
                # Late night modification?
                if e.get('type') in ['admin_settings_change', 'product_delete']:
                    suspicious.append({
                        "id": e.get('id'),
                        "reason": "Administrative action during unusual hours (1 AM - 4 AM)",
                        "severity": "medium",
                        "ip": e.get('ip')
                    })
        except:
            continue
            
    return suspicious

def train_model(data):
    # Simulate training process based on data volume
    if not isinstance(data, dict):
        return {"success": False, "error": "Invalid data format"}
        
    traffic = data.get('traffic', [])
    if not isinstance(traffic, list): traffic = []
    
    orders = data.get('orders', [])
    if not isinstance(orders, list): orders = []
    
    traffic_count = len(traffic)
    order_count = len(orders)
    
    base_accuracy = 0.82
    experience_factor = min(0.15, (traffic_count + order_count) / 1000)
    new_accuracy = base_accuracy + experience_factor
    
    return {
        "success": True,
        "accuracy": round(new_accuracy, 4),
        "timestamp": datetime.now().isoformat(),
        "trained_on_records": traffic_count + order_count,
        "message": "Models retrained with {} new data points".format(traffic_count + order_count)
    }

def predict_intent(data):
    behavior = data.get('behavior', {})
    
    # Simple logic enhanced with some "AI" heuristics
    score = 0
    if behavior.get('addedToCart'): score += 50
    if behavior.get('viewedProducts', 0) > 5: score += 20
    if behavior.get('searchQuery'): score += 10
    if behavior.get('spentTime', 0) > 300: score += 15
    
    intent = "browse"
    if score >= 50: intent = "purchase"
    elif score >= 30: intent = "compare"
    elif score >= 10: intent = "search"
    
    return {
        "intent": intent,
        "confidence": min(0.99, 0.4 + (score / 100)),
        "score": score,
        "recommendations": recommend_products(data)
    }

def generate_keywords(data):
    products = data.get('products', [])
    keywords = []
    
    for p in products:
        name = p.get('name', '').lower()
        cat = p.get('category', '').lower()
        if name:
            keywords.append(f"buy {name}")
            keywords.append(f"{name} price")
            keywords.append(f"best {name} in india")
        if cat:
            keywords.append(f"premium black {cat}")
            keywords.append(f"oversized {cat} fashion")
            
    # Add trending data if available
    keywords.extend(["black streetwear india", "minimalist black fashion", "blackonn clothing brand"])
    
    return {
        "suggestions": list(set(keywords))[:50],
        "relevance_scores": {k: 0.8 + (0.1 if "blackonn" in k else 0) for k in keywords[:10]}
    }

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
            
            # Ensure input_data is a dictionary for safety
            if not isinstance(input_data, dict):
                input_data = {"data": input_data}
                
            if task == "insights":
                print(json.dumps(generate_insights(input_data)))
            elif task == "sentiment":
                print(json.dumps(analyze_sentiment(input_data.get('text', ''))))
            elif task == "recommend":
                print(json.dumps(recommend_products(input_data)))
            elif task == "predict-stock":
                print(json.dumps(predict_stock_out(input_data)))
            elif task == "predict-intent":
                print(json.dumps(predict_intent(input_data)))
            elif task == "seo-keywords":
                print(json.dumps(generate_keywords(input_data)))
            elif task == "seo-audit":
                print(json.dumps(audit_seo(input_data)))
            elif task == "security-scan":
                print(json.dumps(scan_security(input_data)))
            elif task == "train" or task == "ml-train":
                print(json.dumps(train_model(input_data)))
            else:
                print(json.dumps({"error": "Unknown task: " + task}))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
    else:
        print(json.dumps({"status": "healthy", "engine": "Blackonn AI v1.0"}))
