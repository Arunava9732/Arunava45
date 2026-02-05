#!/usr/bin/env python3
"""
Recommendation Engine for BLACKONN
Hybrid Neural Fusion (Collaborative + Content-Based + Personalization)
"""

import json
import sys
import math
from collections import defaultdict
from datetime import datetime

class RecommendationEngine:
    def __init__(self):
        self.category_weights = {
            'T-Shirts': 1.0,
            'Hoodies': 1.2,
            'Joggers': 1.1,
            'Accessories': 0.8,
            'Jackets': 1.3
        }
        self.model_version = "6.0.0-neural-fusion"
    
    def get_recommendations(self, data):
        """Main entry point for hybrid recommendations"""
        user_id = data.get('userId')
        product_id = data.get('productId')
        all_products = data.get('allProducts', [])
        all_orders = data.get('allOrders', [])
        limit = data.get('limit', 10)

        # 1. Content-Based Path
        target_product = next((p for p in all_products if p.get('id') == product_id), None)
        content_recs = []
        if target_product:
            content_recs = self._content_based_recommendations(target_product, all_products, limit=20)

        # 2. Collaborative Filtering Path (Association Rules)
        collaborative_recs = self._get_collaborative_recs(product_id, all_orders, all_products, limit=20)

        # 3. Personalization Path (User Affinity)
        personal_recs = self._get_personalized_recs(user_id, all_orders, all_products, limit=20)

        # 4. Neural Ranking (Merge and score)
        merged = {}
        for r in content_recs:
            pid = r['product'].get('id')
            merged[pid] = merged.get(pid, 0) + r['similarity'] * 0.4
        
        for r in collaborative_recs:
            pid = r['productId']
            merged[pid] = merged.get(pid, 0) + r['confidence'] * 0.4
            
        for r in personal_recs:
            pid = r['productId']
            merged[pid] = merged.get(pid, 0) + r['relevance'] * 0.2

        # Sort and return
        final_list = []
        for pid, score in merged.items():
            product = next((p for p in all_products if p.get('id') == pid), None)
            if product and pid != product_id:
                final_list.append({
                    "id": pid,
                    "name": product.get('name'),
                    "score": round(score, 4),
                    "image": product.get('image', ''),
                    "price": product.get('price', 0),
                    "category": product.get('category', '')
                })
        
        final_list.sort(key=lambda x: x['score'], reverse=True)
        return {
            "success": True,
            "recommendations": final_list[:limit],
            "algorithm": "Hybrid Neural Fusion",
            "version": self.model_version
        }

    def _get_collaborative_recs(self, product_id, orders, products, limit):
        if not product_id or not orders: return []
        co_occurrence = defaultdict(int)
        product_occurrence = 0
        for order in orders:
            items = order.get('items', [])
            item_ids = [str(item.get('productId', item.get('id', ''))) for item in items]
            if str(product_id) in item_ids:
                product_occurrence += 1
                for other_id in item_ids:
                    if other_id != str(product_id):
                        co_occurrence[other_id] += 1
        
        recs = []
        for pid, count in co_occurrence.items():
            confidence = count / product_occurrence if product_occurrence > 0 else 0
            recs.append({"productId": pid, "confidence": confidence})
        return sorted(recs, key=lambda x: x['confidence'], reverse=True)[:limit]

    def _get_personalized_recs(self, user_id, orders, products, limit):
        if not user_id or not orders: return []
        user_orders = [o for o in orders if str(o.get('userId')) == str(user_id)]
        if not user_orders: return []
        
        category_affinity = defaultdict(int)
        for order in user_orders:
            for item in order.get('items', []):
                pid = str(item.get('productId', item.get('id', '')))
                product = next((p for p in products if str(p.get('id')) == pid), None)
                if product:
                    category_affinity[product.get('category')] += 1
        
        recs = []
        for p in products:
            aff = category_affinity.get(p.get('category'), 0)
            if aff > 0:
                recs.append({"productId": p.get('id'), "relevance": aff / len(user_orders)})
        return sorted(recs, key=lambda x: x['relevance'], reverse=True)[:limit]

    def _content_based_recommendations(self, target_product, all_products, limit=20):
        all_categories = list(set(p.get('category', '') for p in all_products))
        all_tags = list(set(str(t).lower() for p in all_products for t in p.get('tags', [])))
        price_max = max(p.get('price', 0) for p in all_products) or 1
        
        target_vec = self._get_vector(target_product, all_categories, all_tags, price_max)
        similarities = []
        for p in all_products:
            if p.get('id') == target_product.get('id'): continue
            p_vec = self._get_vector(p, all_categories, all_tags, price_max)
            sim = self._cosine_sim(target_vec, p_vec)
            if sim > 0:
                similarities.append({"product": p, "similarity": sim})
        
        return sorted(similarities, key=lambda x: x['similarity'], reverse=True)[:limit]

    def _get_vector(self, p, categories, tags, price_max):
        vec = []
        # Category
        for cat in categories: vec.append(1 if p.get('category') == cat else 0)
        # Tags
        p_tags = set(str(t).lower() for t in p.get('tags', []))
        for t in tags: vec.append(1 if t in p_tags else 0)
        # Price
        vec.append(p.get('price', 0) / price_max)
        return vec

    def _cosine_sim(self, v1, v2):
        dot = sum(a*b for a,b in zip(v1, v2))
        m1 = math.sqrt(sum(a*a for a in v1))
        m2 = math.sqrt(sum(b*b for b in v2))
        return dot / (m1 * m2) if m1 * m2 > 0 else 0

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
            
            if task == "recommend":
                print(json.dumps(engine.get_recommendations(input_data)))
            elif task == "status" or task == "health":
                print(json.dumps({"status": "healthy", "version": engine.model_version}))
            else:
                print(json.dumps({"error": f"Unknown task: {task}"}))
        except Exception as e:
            print(json.dumps({"error": str(e)}))
    else:
        print(json.dumps({"status": "healthy", "engine": "Recommendation Engine v6.0"}))
