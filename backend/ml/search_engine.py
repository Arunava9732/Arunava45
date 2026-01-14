#!/usr/bin/env python3
"""
Search Engine for BLACKONN
Full-text search with fuzzy matching, relevance scoring, and autocomplete
"""

import json
import sys
import re
from datetime import datetime
from difflib import SequenceMatcher

# ==========================================
# SEARCH ENGINE
# ==========================================

class SearchEngine:
    def __init__(self):
        self.stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
            'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
            'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need',
            'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we',
            'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how'
        }
        
        self.synonyms = {
            'tshirt': ['t-shirt', 'tee', 'top', 'shirt'],
            't-shirt': ['tshirt', 'tee', 'top', 'shirt'],
            'hoodie': ['hoody', 'sweatshirt', 'pullover'],
            'pants': ['trousers', 'jeans', 'bottoms'],
            'joggers': ['sweatpants', 'track pants', 'jogger pants'],
            'oversized': ['loose', 'baggy', 'relaxed fit'],
            'black': ['noir', 'dark', 'ebony'],
            'jacket': ['coat', 'outerwear', 'blazer'],
            'shorts': ['bermuda', 'half pants'],
            'cap': ['hat', 'beanie', 'headwear']
        }
    
    def tokenize(self, text):
        """Tokenize and normalize text"""
        if not text:
            return []
        
        text = text.lower()
        text = re.sub(r'[^\w\s-]', '', text)
        tokens = text.split()
        tokens = [t for t in tokens if t not in self.stop_words and len(t) > 1]
        
        return tokens
    
    def get_synonyms(self, word):
        """Get synonyms for a word"""
        word = word.lower()
        synonyms = set([word])
        
        if word in self.synonyms:
            synonyms.update(self.synonyms[word])
        
        # Also check if word is a synonym of something
        for key, values in self.synonyms.items():
            if word in values:
                synonyms.add(key)
                synonyms.update(values)
        
        return list(synonyms)
    
    def fuzzy_match(self, s1, s2, threshold=0.7):
        """Check if two strings are similar"""
        ratio = SequenceMatcher(None, s1.lower(), s2.lower()).ratio()
        return ratio >= threshold, ratio
    
    def calculate_relevance(self, product, query_tokens, original_query):
        """Calculate relevance score for a product"""
        score = 0
        matches = []
        
        name = str(product.get('name', '')).lower()
        description = str(product.get('description', '')).lower()
        category = str(product.get('category', '')).lower()
        tags = [str(t).lower() for t in product.get('tags', [])]
        
        name_tokens = self.tokenize(name)
        desc_tokens = self.tokenize(description)
        
        for token in query_tokens:
            # Expand with synonyms
            search_terms = self.get_synonyms(token)
            
            for term in search_terms:
                # Exact match in name (highest weight)
                if term in name:
                    score += 50
                    matches.append({"field": "name", "term": term, "type": "exact"})
                
                # Token match in name
                if term in name_tokens:
                    score += 30
                    matches.append({"field": "name", "term": term, "type": "token"})
                
                # Category match
                if term in category:
                    score += 40
                    matches.append({"field": "category", "term": term, "type": "exact"})
                
                # Tag match
                if term in tags:
                    score += 35
                    matches.append({"field": "tags", "term": term, "type": "exact"})
                
                # Description match
                if term in description:
                    score += 15
                    matches.append({"field": "description", "term": term, "type": "exact"})
                
                # Fuzzy matches
                for name_token in name_tokens:
                    is_match, ratio = self.fuzzy_match(term, name_token)
                    if is_match and term != name_token:
                        score += int(20 * ratio)
                        matches.append({"field": "name", "term": term, "type": "fuzzy", "ratio": ratio})
        
        # Boost for in-stock items
        if product.get('stock', 0) > 0:
            score += 5
        
        # Boost for featured/popular items
        if product.get('featured'):
            score += 10
        
        return score, matches
    
    def search(self, query, products, options=None):
        """Search products with relevance scoring"""
        options = options or {}
        limit = options.get('limit', 20)
        min_score = options.get('minScore', 10)
        category_filter = options.get('category')
        price_min = options.get('priceMin')
        price_max = options.get('priceMax')
        in_stock_only = options.get('inStockOnly', False)
        
        query_tokens = self.tokenize(query)
        
        if not query_tokens:
            return {
                "results": [],
                "total": 0,
                "query": query,
                "tokens": [],
                "message": "No valid search terms"
            }
        
        results = []
        
        for product in products:
            # Apply filters first
            if category_filter and product.get('category', '').lower() != category_filter.lower():
                continue
            
            if in_stock_only and product.get('stock', 0) <= 0:
                continue
            
            price = product.get('price', 0)
            if price_min is not None and price < price_min:
                continue
            if price_max is not None and price > price_max:
                continue
            
            # Calculate relevance
            score, matches = self.calculate_relevance(product, query_tokens, query)
            
            if score >= min_score:
                results.append({
                    "product": product,
                    "score": score,
                    "matches": matches[:5]  # Limit match details
                })
        
        # Sort by score (descending)
        results.sort(key=lambda x: x['score'], reverse=True)
        
        return {
            "results": results[:limit],
            "total": len(results),
            "query": query,
            "tokens": query_tokens,
            "synonymsUsed": list(set(
                term for token in query_tokens 
                for term in self.get_synonyms(token) 
                if term != token
            ))
        }
    
    def autocomplete(self, prefix, products, limit=10):
        """Generate autocomplete suggestions"""
        prefix = prefix.lower().strip()
        
        if len(prefix) < 2:
            return {"suggestions": [], "prefix": prefix}
        
        suggestions = {}
        
        for product in products:
            name = product.get('name', '')
            category = product.get('category', '')
            tags = product.get('tags', [])
            
            # Check name
            name_lower = name.lower()
            if name_lower.startswith(prefix):
                suggestions[name] = suggestions.get(name, 0) + 10
            elif prefix in name_lower:
                suggestions[name] = suggestions.get(name, 0) + 5
            
            # Check category
            if category.lower().startswith(prefix):
                suggestions[category] = suggestions.get(category, 0) + 8
            
            # Check tags
            for tag in tags:
                if str(tag).lower().startswith(prefix):
                    suggestions[str(tag)] = suggestions.get(str(tag), 0) + 6
        
        # Sort by score and get top suggestions
        sorted_suggestions = sorted(
            suggestions.items(), 
            key=lambda x: x[1], 
            reverse=True
        )[:limit]
        
        return {
            "suggestions": [{"text": s[0], "score": s[1]} for s in sorted_suggestions],
            "prefix": prefix,
            "total": len(sorted_suggestions)
        }
    
    def build_index(self, products):
        """Build search index from products"""
        index = {
            "terms": {},
            "categories": {},
            "tags": {},
            "priceRanges": {"0-500": 0, "500-1000": 0, "1000-2000": 0, "2000+": 0},
            "totalProducts": len(products)
        }
        
        for i, product in enumerate(products):
            name_tokens = self.tokenize(product.get('name', ''))
            desc_tokens = self.tokenize(product.get('description', ''))
            
            # Index name tokens
            for token in name_tokens:
                if token not in index["terms"]:
                    index["terms"][token] = []
                index["terms"][token].append(i)
            
            # Index categories
            category = product.get('category', 'Other')
            if category not in index["categories"]:
                index["categories"][category] = 0
            index["categories"][category] += 1
            
            # Index tags
            for tag in product.get('tags', []):
                tag = str(tag)
                if tag not in index["tags"]:
                    index["tags"][tag] = 0
                index["tags"][tag] += 1
            
            # Price ranges
            price = product.get('price', 0)
            if price < 500:
                index["priceRanges"]["0-500"] += 1
            elif price < 1000:
                index["priceRanges"]["500-1000"] += 1
            elif price < 2000:
                index["priceRanges"]["1000-2000"] += 1
            else:
                index["priceRanges"]["2000+"] += 1
        
        index["uniqueTerms"] = len(index["terms"])
        index["uniqueCategories"] = len(index["categories"])
        index["uniqueTags"] = len(index["tags"])
        
        return index
    
    def trending_searches(self, search_history, limit=10):
        """Analyze search history to find trending searches"""
        if not search_history:
            return {"trending": [], "message": "No search history available"}
        
        term_counts = {}
        recent_weight = 2  # Weight for recent searches
        
        for entry in search_history:
            query = entry.get('query', '').lower()
            timestamp = entry.get('timestamp', '')
            
            # More recent searches get higher weight
            weight = 1
            if timestamp:
                try:
                    search_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                    hours_ago = (datetime.now(search_time.tzinfo) - search_time).total_seconds() / 3600
                    if hours_ago < 24:
                        weight = recent_weight
                except:
                    pass
            
            if query:
                term_counts[query] = term_counts.get(query, 0) + weight
        
        sorted_terms = sorted(term_counts.items(), key=lambda x: x[1], reverse=True)[:limit]
        
        return {
            "trending": [{"term": t[0], "score": t[1]} for t in sorted_terms],
            "totalSearches": len(search_history)
        }


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    engine = SearchEngine()
    
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
            
            if task == "search":
                query = input_data.get('query', '')
                products = input_data.get('products', [])
                options = input_data.get('options', {})
                print(json.dumps(engine.search(query, products, options)))
            
            elif task == "autocomplete":
                prefix = input_data.get('prefix', '')
                products = input_data.get('products', [])
                limit = input_data.get('limit', 10)
                print(json.dumps(engine.autocomplete(prefix, products, limit)))
            
            elif task == "index":
                products = input_data.get('products', [])
                print(json.dumps(engine.build_index(products)))
            
            elif task == "trending":
                history = input_data.get('history', [])
                limit = input_data.get('limit', 10)
                print(json.dumps(engine.trending_searches(history, limit)))
            
            elif task == "synonyms":
                word = input_data.get('word', '')
                print(json.dumps({"word": word, "synonyms": engine.get_synonyms(word)}))
            
            else:
                print(json.dumps({"error": f"Unknown task: {task}"}))
        
        except Exception as e:
            print(json.dumps({"error": str(e)}))
    else:
        print(json.dumps({"status": "healthy", "engine": "Search Engine v1.0"}))
