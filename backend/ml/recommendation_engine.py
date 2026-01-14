#!/usr/bin/env python3
"""
Recommendation Engine for BLACKONN
Personalized product recommendations using collaborative and content-based filtering
"""

import json
import sys
import math
from collections import defaultdict
from datetime import datetime

# ==========================================
# RECOMMENDATION ENGINE
# ==========================================

class RecommendationEngine:
    def __init__(self):
        self.category_weights = {
            'T-Shirts': 1.0,
            'Hoodies': 1.0,
            'Joggers': 1.0,
            'Accessories': 0.8,
            'Jackets': 1.0
        }
    
    def cosine_similarity(self, vec1, vec2):
        """Calculate cosine similarity between two vectors"""
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        magnitude1 = math.sqrt(sum(a ** 2 for a in vec1))
        magnitude2 = math.sqrt(sum(b ** 2 for b in vec2))
        
        if magnitude1 == 0 or magnitude2 == 0:
            return 0
        
        return dot_product / (magnitude1 * magnitude2)
    
    def get_product_vector(self, product, all_categories, all_tags, price_max):
        """Convert product to feature vector"""
        vector = []
        
        # Category one-hot encoding
        category = product.get('category', '')
        for cat in all_categories:
            vector.append(1 if category == cat else 0)
        
        # Tag encoding
        product_tags = set(str(t).lower() for t in product.get('tags', []))
        for tag in all_tags:
            vector.append(1 if tag.lower() in product_tags else 0)
        
        # Normalized price
        price = product.get('price', 0)
        vector.append(price / price_max if price_max > 0 else 0)
        
        # In stock
        vector.append(1 if product.get('stock', 0) > 0 else 0)
        
        # Featured
        vector.append(1 if product.get('featured') else 0)
        
        return vector
    
    def content_based_recommendations(self, target_product, all_products, limit=10):
        """Recommend similar products based on content features"""
        # Extract all unique categories and tags
        all_categories = list(set(p.get('category', '') for p in all_products))
        all_tags = list(set(
            str(t).lower() 
            for p in all_products 
            for t in p.get('tags', [])
        ))
        price_max = max(p.get('price', 0) for p in all_products) or 1
        
        target_vector = self.get_product_vector(target_product, all_categories, all_tags, price_max)
        target_id = target_product.get('id')
        
        similarities = []
        
        for product in all_products:
            if product.get('id') == target_id:
                continue
            
            product_vector = self.get_product_vector(product, all_categories, all_tags, price_max)
            similarity = self.cosine_similarity(target_vector, product_vector)
            
            if similarity > 0.3:  # Minimum threshold
                similarities.append({
                    "product": product,
                    "similarity": round(similarity, 4),
                    "reason": self._get_similarity_reason(target_product, product)
                })
        
        similarities.sort(key=lambda x: x['similarity'], reverse=True)
        return similarities[:limit]
    
    def _get_similarity_reason(self, target, candidate):
        """Generate human-readable reason for recommendation"""
        reasons = []
        
        if target.get('category') == candidate.get('category'):
            reasons.append(f"Same category: {target.get('category')}")
        
        target_tags = set(str(t).lower() for t in target.get('tags', []))
        candidate_tags = set(str(t).lower() for t in candidate.get('tags', []))
        common_tags = target_tags & candidate_tags
        
        if common_tags:
            reasons.append(f"Common tags: {', '.join(list(common_tags)[:3])}")
        
        target_price = target.get('price', 0)
        candidate_price = candidate.get('price', 0)
        
        if target_price > 0 and candidate_price > 0:
            price_diff = abs(target_price - candidate_price) / target_price
            if price_diff < 0.2:
                reasons.append("Similar price range")
        
        return reasons if reasons else ["Similar product profile"]
    
    def collaborative_recommendations(self, user_id, user_history, all_users_history, products, limit=10):
        """Recommend based on similar users' preferences"""
        # Build user-product interaction matrix
        user_products = defaultdict(set)
        product_users = defaultdict(set)
        
        for history in all_users_history:
            uid = history.get('userId')
            for item in history.get('purchases', []):
                pid = item.get('productId')
                if uid and pid:
                    user_products[uid].add(pid)
                    product_users[pid].add(uid)
        
        # Add current user's history
        current_user_products = set()
        for item in user_history.get('purchases', []):
            pid = item.get('productId')
            if pid:
                current_user_products.add(pid)
                user_products[user_id].add(pid)
        
        # Find similar users
        similar_users = []
        for other_user, other_products in user_products.items():
            if other_user == user_id:
                continue
            
            # Jaccard similarity
            intersection = len(current_user_products & other_products)
            union = len(current_user_products | other_products)
            
            if union > 0 and intersection > 0:
                similarity = intersection / union
                similar_users.append((other_user, similarity, other_products))
        
        similar_users.sort(key=lambda x: x[1], reverse=True)
        
        # Get recommendations from similar users
        recommendations = defaultdict(float)
        
        for other_user, similarity, other_products in similar_users[:10]:
            for pid in other_products:
                if pid not in current_user_products:
                    recommendations[pid] += similarity
        
        # Map to products
        product_map = {p.get('id'): p for p in products}
        
        result = []
        for pid, score in sorted(recommendations.items(), key=lambda x: x[1], reverse=True)[:limit]:
            if pid in product_map:
                result.append({
                    "product": product_map[pid],
                    "score": round(score, 4),
                    "reason": ["Customers with similar taste also bought this"]
                })
        
        return result
    
    def trending_products(self, orders, products, days=7, limit=10):
        """Find trending products based on recent orders"""
        cutoff = datetime.now().timestamp() - (days * 24 * 60 * 60)
        
        product_sales = defaultdict(lambda: {"quantity": 0, "revenue": 0, "orders": 0})
        
        for order in orders:
            order_time = order.get('timestamp', order.get('createdAt', ''))
            
            # Parse timestamp
            order_timestamp = 0
            if isinstance(order_time, (int, float)):
                order_timestamp = order_time
            elif isinstance(order_time, str):
                try:
                    dt = datetime.fromisoformat(order_time.replace('Z', '+00:00'))
                    order_timestamp = dt.timestamp()
                except:
                    pass
            
            if order_timestamp >= cutoff:
                for item in order.get('items', []):
                    pid = item.get('productId', item.get('id'))
                    if pid:
                        product_sales[pid]["quantity"] += item.get('quantity', 1)
                        product_sales[pid]["revenue"] += item.get('price', 0) * item.get('quantity', 1)
                        product_sales[pid]["orders"] += 1
        
        # Map to products and calculate trend score
        product_map = {p.get('id'): p for p in products}
        
        trending = []
        for pid, stats in product_sales.items():
            if pid in product_map:
                # Trend score: weighted combination of quantity, revenue, and unique orders
                trend_score = (
                    stats["quantity"] * 1.0 +
                    stats["orders"] * 2.0 +
                    (stats["revenue"] / 1000) * 0.5
                )
                
                trending.append({
                    "product": product_map[pid],
                    "trendScore": round(trend_score, 2),
                    "stats": stats
                })
        
        trending.sort(key=lambda x: x['trendScore'], reverse=True)
        return trending[:limit]
    
    def frequently_bought_together(self, product_id, orders, products, limit=5):
        """Find products frequently bought together"""
        co_occurrence = defaultdict(int)
        product_orders = 0
        
        for order in orders:
            items = order.get('items', [])
            item_ids = [item.get('productId', item.get('id')) for item in items]
            
            if product_id in item_ids:
                product_orders += 1
                for other_id in item_ids:
                    if other_id and other_id != product_id:
                        co_occurrence[other_id] += 1
        
        if product_orders == 0:
            return []
        
        product_map = {p.get('id'): p for p in products}
        
        result = []
        for pid, count in sorted(co_occurrence.items(), key=lambda x: x[1], reverse=True)[:limit]:
            if pid in product_map:
                confidence = count / product_orders
                result.append({
                    "product": product_map[pid],
                    "frequency": count,
                    "confidence": round(confidence, 4),
                    "reason": f"Bought together {count} times"
                })
        
        return result
    
    def personalized_recommendations(self, user_data, products, orders, limit=10):
        """Generate personalized recommendations for a user"""
        recommendations = []
        
        browsing_history = user_data.get('browsingHistory', [])
        purchase_history = user_data.get('purchaseHistory', [])
        wishlist = user_data.get('wishlist', [])
        
        purchased_ids = set(
            item.get('productId', item.get('id')) 
            for item in purchase_history
        )
        
        product_map = {p.get('id'): p for p in products}
        
        # Based on wishlist
        for item in wishlist[:3]:
            pid = item.get('productId') if isinstance(item, dict) else item
            if pid in product_map and pid not in purchased_ids:
                similar = self.content_based_recommendations(
                    product_map[pid], products, 3
                )
                for s in similar:
                    if s['product'].get('id') not in purchased_ids:
                        s['reason'] = ["Based on your wishlist"] + s.get('reason', [])
                        recommendations.append(s)
        
        # Based on browsing history
        for item in browsing_history[:5]:
            pid = item.get('productId') if isinstance(item, dict) else item
            if pid in product_map:
                similar = self.content_based_recommendations(
                    product_map[pid], products, 2
                )
                for s in similar:
                    if s['product'].get('id') not in purchased_ids:
                        s['reason'] = ["Based on your browsing"] + s.get('reason', [])
                        recommendations.append(s)
        
        # Based on purchase history - frequently bought together
        for item in purchase_history[:3]:
            pid = item.get('productId', item.get('id'))
            if pid:
                fbt = self.frequently_bought_together(pid, orders, products, 2)
                for f in fbt:
                    if f['product'].get('id') not in purchased_ids:
                        f['reason'] = ["Frequently bought with your purchases"]
                        recommendations.append(f)
        
        # Deduplicate
        seen = set()
        unique_recommendations = []
        for rec in recommendations:
            pid = rec['product'].get('id')
            if pid and pid not in seen:
                seen.add(pid)
                unique_recommendations.append(rec)
        
        # If not enough recommendations, add trending
        if len(unique_recommendations) < limit:
            trending = self.trending_products(orders, products, 14, limit)
            for t in trending:
                pid = t['product'].get('id')
                if pid not in seen and pid not in purchased_ids:
                    t['reason'] = ["Trending now"]
                    unique_recommendations.append(t)
                    seen.add(pid)
                    if len(unique_recommendations) >= limit:
                        break
        
        return unique_recommendations[:limit]


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    engine = RecommendationEngine()
    
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
            
            if task == "similar":
                target = input_data.get('product', {})
                products = input_data.get('products', [])
                limit = input_data.get('limit', 10)
                result = engine.content_based_recommendations(target, products, limit)
                print(json.dumps({"recommendations": result}))
            
            elif task == "collaborative":
                user_id = input_data.get('userId')
                user_history = input_data.get('userHistory', {})
                all_history = input_data.get('allHistory', [])
                products = input_data.get('products', [])
                limit = input_data.get('limit', 10)
                result = engine.collaborative_recommendations(
                    user_id, user_history, all_history, products, limit
                )
                print(json.dumps({"recommendations": result}))
            
            elif task == "trending":
                orders = input_data.get('orders', [])
                products = input_data.get('products', [])
                days = input_data.get('days', 7)
                limit = input_data.get('limit', 10)
                result = engine.trending_products(orders, products, days, limit)
                print(json.dumps({"trending": result}))
            
            elif task == "together":
                product_id = input_data.get('productId')
                orders = input_data.get('orders', [])
                products = input_data.get('products', [])
                limit = input_data.get('limit', 5)
                result = engine.frequently_bought_together(product_id, orders, products, limit)
                print(json.dumps({"frequentlyBoughtTogether": result}))
            
            elif task == "personalized":
                user_data = input_data.get('userData', {})
                products = input_data.get('products', [])
                orders = input_data.get('orders', [])
                limit = input_data.get('limit', 10)
                result = engine.personalized_recommendations(user_data, products, orders, limit)
                print(json.dumps({"recommendations": result}))
            
            else:
                print(json.dumps({"error": f"Unknown task: {task}"}))
        
        except Exception as e:
            print(json.dumps({"error": str(e)}))
    else:
        print(json.dumps({"status": "healthy", "engine": "Recommendation Engine v1.0"}))
