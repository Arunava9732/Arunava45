#!/usr/bin/env python3
"""
AI SEO Engine for BLACKONN
OmniSEO: Semantic analysis, SERP prediction, and content optimization
"""

import json
import sys
import re
from datetime import datetime
from collections import defaultdict

class AISEOEngine:
    def __init__(self):
        self.model_version = "6.5.0-omniseo"
        self.keyword_clusters = {
            'core_monochrome': ['black clothing', 'all black outfits', 'monochrome fashion', 'dark aesthetic'],
            'street_prestige': ['premium streetwear india', 'luxury oversized tees', 'high-end graphics'],
            'consumer_intent': ['buy oversized t-shirt', 'best black hoodies online', 'streetwear store kolkata']
        }
        self.seo_rules = {
            'title': {'min': 30, 'max': 60, 'weight': 15},
            'meta': {'min': 120, 'max': 160, 'weight': 10},
            'content': {'min_words': 300},
            'keywords': {'min_density': 0.5, 'max_density': 3.0}
        }

    def predict_serp(self, page_data):
        """Predict Google Page 1 likelihood"""
        analysis = self.analyze_page(page_data)
        score = analysis.get('score', 0)
        
        # Simulated prediction using OmniSEO weights
        da_factor = 35  # Blackonn current domain authority
        position_score = (score * 0.6) + (da_factor * 0.4)
        
        rank = "PAGE_1_TOP_3" if position_score > 85 else "PAGE_1_BOTTOM" if position_score > 70 else "PAGE_2+"
        
        return {
            "predictionScore": round(position_score, 2),
            "estimatedRank": rank,
            "confidence": 0.92,
            "version": self.model_version
        }

    def analyze_page(self, data):
        """Full SEO analysis of a page"""
        title = data.get('title', '')
        meta = data.get('metaDescription', '')
        content = data.get('content', '')
        keywords = data.get('targetKeywords', [])
        
        issues = []
        score = 100
        
        # Title rules
        if len(title) < self.seo_rules['title']['min']:
            score -= 10
            issues.append("Title too short")
        elif len(title) > self.seo_rules['title']['max']:
            score -= 5
            issues.append("Title too long")
            
        # Meta rules
        if len(meta) < self.seo_rules['meta']['min']:
            score -= 8
            issues.append("Meta description too short")
            
        # Content rules
        words = content.split()
        if len(words) < self.seo_rules['content']['min_words']:
            score -= 15
            issues.append(f"Thin content ({len(words)} words)")
            
        return {
            "score": max(0, score),
            "status": "optimized" if score > 80 else "needs_work",
            "issues": issues,
            "wordCount": len(words)
        }

    def generate_keywords(self, context_data):
        """Generate semantically related keywords"""
        if isinstance(context_data, str):
            category = context_data
            product_type = ""
            brand = "BLACKONN"
        else:
            category = context_data.get('category', 'core_monochrome')
            product_type = context_data.get('productType', '')
            brand = context_data.get('brand', 'BLACKONN')
            
        target_audience = context_data.get('targetAudience', 'men') if isinstance(context_data, dict) else "men"
        
        keywords = {
            'primary': [],
            'secondary': [],
            'longtail': [],
            'local': []
        }
        
        # Generate primary keywords
        if product_type:
            keywords['primary'].append(f"{product_type}")
            keywords['primary'].append(f"buy {product_type} online")
            keywords['primary'].append(f"best {product_type}")
        
        if category:
            keywords['primary'].append(f"{category} for {target_audience}")
            keywords['secondary'].append(f"{target_audience}s {category}")
            
            # Add from clusters
            base = self.keyword_clusters.get(category, [])
            for kw in base:
                keywords['secondary'].append(kw)
        
        # Add brand keywords
        keywords['primary'].append(brand.lower())
        keywords['secondary'].append(f"{brand} {product_type}")
        
        # Generate long-tail keywords
        keywords['longtail'].extend([
            f"best {product_type if product_type else category} for {target_audience} in india",
            f"affordable {product_type if product_type else category} online shopping",
            f"premium quality {product_type if product_type else category}",
            f"{product_type if product_type else category} free shipping india"
        ])
        
        # Local SEO keywords
        keywords['local'].extend([
            f"{product_type if product_type else category} online india",
            f"buy {product_type if product_type else category} india",
            f"{brand} india"
        ])
        
        return {
            "success": True,
            "keywords": keywords,
            "totalGenerated": sum(len(v) for v in keywords.values()),
            "timestamp": datetime.now().isoformat()
        }

    def _get_grade(self, score):
        if score > 90: return "A+"
        if score > 80: return "A"
        if score > 70: return "B"
        return "C"
    
    def generate_meta_tags(self, page_info):
        """Generate optimized meta tags"""
        title = page_info.get('title', '')
        product_name = page_info.get('productName', '')
        category = page_info.get('category', '')
        price = page_info.get('price', 0)
        brand = page_info.get('brand', 'BLACKONN')
        description = page_info.get('description', '')
        
        # Generate title
        if product_name:
            seo_title = f"{product_name} | {brand} - Buy Online"
            if len(seo_title) > 60:
                seo_title = f"{product_name} | {brand}"
        else:
            seo_title = title or f"{category} | {brand}"
        
        # Generate meta description
        if description:
            # Use first 150 chars of description
            meta_desc = description[:150].strip()
            if len(description) > 150:
                meta_desc = meta_desc.rsplit(' ', 1)[0] + "..."
        else:
            meta_desc = f"Shop {product_name or category} at {brand}. Premium quality, free shipping, easy returns. Order now!"
        
        # Add price if available
        if price > 0 and len(meta_desc) < 140:
            meta_desc += f" Starting at ₹{price}."
        
        # Generate keywords meta
        keywords_meta = self.generate_keywords({
            'productType': product_name or category,
            'category': category,
            'brand': brand
        })
        
        return {
            "success": True,
            "metaTags": {
                "title": seo_title[:60],
                "description": meta_desc[:160],
                "keywords": ", ".join(keywords_meta['keywords']['primary'][:10]),
                "ogTitle": seo_title,
                "ogDescription": meta_desc,
                "twitterTitle": seo_title,
                "twitterDescription": meta_desc
            },
            "structuredData": self._generate_structured_data(page_info),
            "timestamp": datetime.now().isoformat()
        }
    
    def _generate_structured_data(self, page_info):
        """Generate JSON-LD structured data"""
        product_name = page_info.get('productName', '')
        price = page_info.get('price', 0)
        currency = page_info.get('currency', 'INR')
        brand = page_info.get('brand', 'BLACKONN')
        image = page_info.get('image', '')
        description = page_info.get('description', '')
        sku = page_info.get('sku', '')
        in_stock = page_info.get('inStock', True)
        
        if product_name:
            return {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": product_name,
                "description": description[:500] if description else "",
                "image": image,
                "sku": sku,
                "brand": {
                    "@type": "Brand",
                    "name": brand
                },
                "offers": {
                    "@type": "Offer",
                    "price": price,
                    "priceCurrency": currency,
                    "availability": "https://schema.org/InStock" if in_stock else "https://schema.org/OutOfStock"
                }
            }
        
        return {
            "@context": "https://schema.org",
            "@type": "WebPage",
            "name": page_info.get('title', 'BLACKONN')
        }
    
    def audit_site(self, site_data):
        """Perform site-wide SEO audit"""
        pages = site_data.get('pages', [])
        
        if not pages:
            return {"success": False, "error": "No pages provided"}
        
        page_results = []
        total_score = 0
        all_issues = defaultdict(int)
        
        for page in pages:
            result = self.analyze_page(page)
            page_results.append({
                "url": result['url'],
                "score": result['score'],
                "issueCount": len(result['issues'])
            })
            total_score += result['score']
            
            for issue in result['issues']:
                all_issues[issue['type']] += 1
        
        avg_score = total_score / len(pages) if pages else 0
        
        # Prioritize issues
        priority_issues = sorted(all_issues.items(), key=lambda x: x[1], reverse=True)
        
        return {
            "success": True,
            "summary": {
                "pagesAudited": len(pages),
                "averageScore": round(avg_score, 1),
                "grade": self._get_grade(avg_score),
                "totalIssues": sum(all_issues.values())
            },
            "topIssues": [
                {"type": issue, "count": count}
                for issue, count in priority_issues[:10]
            ],
            "worstPages": sorted(page_results, key=lambda x: x['score'])[:10],
            "bestPages": sorted(page_results, key=lambda x: x['score'], reverse=True)[:5],
            "recommendations": [
                "Fix critical issues on lowest-scoring pages first",
                "Ensure all pages have unique title and meta descriptions",
                "Add structured data to product pages",
                "Improve internal linking structure"
            ],
            "timestamp": datetime.now().isoformat()
        }
    
    def optimize_content(self, content_data):
        """Optimize content for SEO"""
        content = content_data.get('content', '')
        target_keywords = content_data.get('keywords', [])
        content_type = content_data.get('type', 'article')
        
        if not content:
            return {"success": False, "error": "No content provided"}
        
        words = content.split()
        word_count = len(words)
        
        # Analyze current state
        analysis = {
            "wordCount": word_count,
            "sentenceCount": len(re.findall(r'[.!?]+', content)),
            "paragraphCount": len(content.split('\n\n')),
            "keywordAnalysis": {}
        }
        
        suggestions = []
        
        # Word count suggestions
        if content_type == 'product' and word_count < 100:
            suggestions.append({
                "type": "INCREASE_LENGTH",
                "message": "Product descriptions should be at least 100 words",
                "priority": "high"
            })
        elif content_type == 'article' and word_count < 800:
            suggestions.append({
                "type": "INCREASE_LENGTH",
                "message": "Articles should be at least 800 words for SEO",
                "priority": "medium"
            })
        
        # Keyword suggestions
        content_lower = content.lower()
        for keyword in target_keywords:
            count = content_lower.count(keyword.lower())
            density = (count * len(keyword.split())) / word_count * 100 if word_count > 0 else 0
            
            analysis["keywordAnalysis"][keyword] = {
                "count": count,
                "density": round(density, 2)
            }
            
            if count == 0:
                suggestions.append({
                    "type": "ADD_KEYWORD",
                    "keyword": keyword,
                    "message": f"Add keyword '{keyword}' to content",
                    "priority": "high"
                })
            elif density < 0.5:
                suggestions.append({
                    "type": "INCREASE_KEYWORD",
                    "keyword": keyword,
                    "message": f"Increase '{keyword}' usage (currently {density:.1f}%)",
                    "priority": "medium"
                })
        
        # Readability suggestions
        avg_sentence_length = word_count / max(analysis["sentenceCount"], 1)
        if avg_sentence_length > 25:
            suggestions.append({
                "type": "SIMPLIFY_SENTENCES",
                "message": "Average sentence length is high, consider shorter sentences",
                "priority": "medium"
            })
        
        return {
            "success": True,
            "analysis": analysis,
            "suggestions": suggestions,
            "optimizationScore": max(0, 100 - len(suggestions) * 10),
            "timestamp": datetime.now().isoformat()
        }


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    engine = AISEOEngine()
    
    if len(sys.argv) > 1:
        task = sys.argv[1]
        try:
            input_data = {}
            if len(sys.argv) > 2:
                if sys.argv[2] == "--stdin":
                    input_data = json.loads(sys.stdin.read())
                else:
                    input_data = json.loads(sys.argv[2])
            
            if task == "analyze":
                result = engine.analyze_page(input_data)
            elif task == "keywords":
                result = engine.generate_keywords(input_data)
            elif task == "meta":
                result = engine.generate_meta_tags(input_data)
            elif task == "audit":
                result = engine.audit_site(input_data)
            elif task == "optimize":
                result = engine.optimize_content(input_data)
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
            "engine": "AI SEO Engine",
            "version": engine.model_version,
            "tasks": ["analyze", "keywords", "meta", "audit", "optimize"],
            "status": "healthy"
        }))
