#!/usr/bin/env python3
"""
AI SEO Engine for BLACKONN
AI-powered SEO analysis, optimization, and content generation
"""

import json
import sys
import re
from datetime import datetime
from collections import defaultdict

# ==========================================
# AI SEO ENGINE
# ==========================================

class AISEOEngine:
    """AI-powered SEO optimization engine"""
    
    def __init__(self):
        self.model_version = "2.0.0"
        self.keyword_database = self._build_keyword_database()
        self.seo_rules = self._build_seo_rules()
    
    def _build_keyword_database(self):
        """Build industry-specific keyword database"""
        return {
            'fashion': ['mens fashion', 'mens clothing', 'casual wear', 'formal wear', 
                       'streetwear', 'designer clothes', 'trendy outfits', 'wardrobe essentials'],
            'innerwear': ['mens innerwear', 'briefs', 'boxers', 'vest', 'undershirt',
                         'cotton innerwear', 'comfortable underwear', 'premium innerwear'],
            'ecommerce': ['buy online', 'free shipping', 'best price', 'online shopping',
                         'fast delivery', 'easy returns', 'secure payment', 'discount'],
            'brand': ['blackonn', 'blackonn clothing', 'blackonn fashion', 'blackonn innerwear',
                     'premium quality', 'trusted brand', 'made in india'],
            'seasonal': ['summer collection', 'winter essentials', 'monsoon wear',
                        'festive collection', 'new arrivals', 'sale', 'clearance']
        }
    
    def _build_seo_rules(self):
        """Build SEO scoring rules"""
        return {
            'title': {
                'min_length': 30,
                'max_length': 60,
                'weight': 15
            },
            'meta_description': {
                'min_length': 120,
                'max_length': 160,
                'weight': 10
            },
            'h1': {
                'required': True,
                'max_count': 1,
                'weight': 10
            },
            'content_length': {
                'min_words': 300,
                'weight': 10
            },
            'images': {
                'require_alt': True,
                'weight': 8
            },
            'internal_links': {
                'min_count': 2,
                'weight': 7
            },
            'keywords': {
                'min_density': 0.5,
                'max_density': 3.0,
                'weight': 10
            }
        }
    
    def analyze_page(self, page_data):
        """Analyze a page for SEO optimization"""
        url = page_data.get('url', '')
        title = page_data.get('title', '')
        meta_description = page_data.get('metaDescription', '')
        content = page_data.get('content', '')
        h1_tags = page_data.get('h1Tags', [])
        h2_tags = page_data.get('h2Tags', [])
        images = page_data.get('images', [])
        links = page_data.get('links', [])
        keywords = page_data.get('targetKeywords', [])
        
        issues = []
        recommendations = []
        score = 100
        
        # Title analysis
        title_len = len(title)
        if title_len < self.seo_rules['title']['min_length']:
            issues.append({
                "type": "TITLE_TOO_SHORT",
                "severity": "high",
                "message": f"Title is {title_len} chars, minimum recommended is {self.seo_rules['title']['min_length']}"
            })
            score -= 10
        elif title_len > self.seo_rules['title']['max_length']:
            issues.append({
                "type": "TITLE_TOO_LONG",
                "severity": "medium",
                "message": f"Title is {title_len} chars, may be truncated in search results"
            })
            score -= 5
        
        # Meta description analysis
        meta_len = len(meta_description)
        if meta_len < self.seo_rules['meta_description']['min_length']:
            issues.append({
                "type": "META_DESC_TOO_SHORT",
                "severity": "high",
                "message": "Meta description is too short for optimal CTR"
            })
            score -= 8
            recommendations.append("Expand meta description to 120-160 characters")
        elif meta_len > self.seo_rules['meta_description']['max_length']:
            issues.append({
                "type": "META_DESC_TOO_LONG",
                "severity": "medium",
                "message": "Meta description may be truncated"
            })
            score -= 3
        
        # H1 analysis
        if len(h1_tags) == 0:
            issues.append({
                "type": "MISSING_H1",
                "severity": "critical",
                "message": "Page is missing H1 tag"
            })
            score -= 15
            recommendations.append("Add exactly one H1 tag with target keyword")
        elif len(h1_tags) > 1:
            issues.append({
                "type": "MULTIPLE_H1",
                "severity": "medium",
                "message": f"Page has {len(h1_tags)} H1 tags, should have exactly 1"
            })
            score -= 5
        
        # Content length
        word_count = len(content.split())
        if word_count < self.seo_rules['content_length']['min_words']:
            issues.append({
                "type": "THIN_CONTENT",
                "severity": "high",
                "message": f"Content has only {word_count} words, recommend {self.seo_rules['content_length']['min_words']}+"
            })
            score -= 10
            recommendations.append("Add more valuable content to improve rankings")
        
        # Image analysis
        images_without_alt = [img for img in images if not img.get('alt')]
        if images_without_alt:
            issues.append({
                "type": "MISSING_ALT_TEXT",
                "severity": "medium",
                "message": f"{len(images_without_alt)} images missing alt text"
            })
            score -= 5
            recommendations.append("Add descriptive alt text to all images")
        
        # Keyword analysis
        if keywords and content:
            keyword_issues = self._analyze_keywords(content, keywords)
            issues.extend(keyword_issues['issues'])
            score -= keyword_issues['score_deduction']
        
        # Internal links
        internal_links = [l for l in links if l.get('internal', True)]
        if len(internal_links) < self.seo_rules['internal_links']['min_count']:
            issues.append({
                "type": "LOW_INTERNAL_LINKS",
                "severity": "medium",
                "message": "Page has few internal links"
            })
            score -= 5
            recommendations.append("Add internal links to related content")
        
        score = max(0, score)
        
        return {
            "success": True,
            "url": url,
            "score": score,
            "grade": self._get_grade(score),
            "issues": issues,
            "recommendations": recommendations,
            "metrics": {
                "titleLength": title_len,
                "metaDescLength": meta_len,
                "wordCount": word_count,
                "h1Count": len(h1_tags),
                "h2Count": len(h2_tags),
                "imageCount": len(images),
                "internalLinks": len(internal_links)
            },
            "timestamp": datetime.now().isoformat()
        }
    
    def _analyze_keywords(self, content, keywords):
        """Analyze keyword usage in content"""
        issues = []
        score_deduction = 0
        content_lower = content.lower()
        word_count = len(content.split())
        
        for keyword in keywords:
            keyword_lower = keyword.lower()
            occurrences = content_lower.count(keyword_lower)
            density = (occurrences * len(keyword.split())) / word_count * 100 if word_count > 0 else 0
            
            if occurrences == 0:
                issues.append({
                    "type": "MISSING_KEYWORD",
                    "severity": "high",
                    "message": f"Target keyword '{keyword}' not found in content"
                })
                score_deduction += 8
            elif density < self.seo_rules['keywords']['min_density']:
                issues.append({
                    "type": "LOW_KEYWORD_DENSITY",
                    "severity": "medium",
                    "message": f"Keyword '{keyword}' density is {density:.2f}%, recommend 0.5-3%"
                })
                score_deduction += 3
            elif density > self.seo_rules['keywords']['max_density']:
                issues.append({
                    "type": "KEYWORD_STUFFING",
                    "severity": "high",
                    "message": f"Keyword '{keyword}' density is {density:.2f}%, may be penalized"
                })
                score_deduction += 10
        
        return {"issues": issues, "score_deduction": score_deduction}
    
    def _get_grade(self, score):
        """Convert score to letter grade"""
        if score >= 90:
            return "A"
        elif score >= 80:
            return "B"
        elif score >= 70:
            return "C"
        elif score >= 60:
            return "D"
        return "F"
    
    def generate_keywords(self, context_data):
        """Generate SEO keywords based on context"""
        product_type = context_data.get('productType', '')
        category = context_data.get('category', '')
        brand = context_data.get('brand', 'BLACKONN')
        target_audience = context_data.get('targetAudience', 'men')
        
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
        
        # Add brand keywords
        keywords['primary'].append(brand.lower())
        keywords['secondary'].append(f"{brand} {product_type}")
        
        # Generate long-tail keywords
        keywords['longtail'].extend([
            f"best {product_type} for {target_audience} in india",
            f"affordable {product_type} online shopping",
            f"premium quality {product_type}",
            f"{product_type} free shipping india",
            f"comfortable {product_type} for daily wear"
        ])
        
        # Local SEO keywords
        keywords['local'].extend([
            f"{product_type} online india",
            f"buy {product_type} india",
            f"{brand} india"
        ])
        
        # Add from database
        for category_key, kws in self.keyword_database.items():
            if category_key.lower() in product_type.lower() or category_key.lower() in category.lower():
                keywords['secondary'].extend(kws[:5])
        
        return {
            "success": True,
            "keywords": keywords,
            "totalGenerated": sum(len(v) for v in keywords.values()),
            "recommendations": [
                "Use primary keywords in title and H1",
                "Include secondary keywords naturally in content",
                "Use long-tail keywords for blog content",
                "Add local keywords for India-specific pages"
            ],
            "timestamp": datetime.now().isoformat()
        }
    
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
            "status": "ready"
        }))
