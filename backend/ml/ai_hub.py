#!/usr/bin/env python3
"""
AI Master Hub for BLACKONN
Unified interface for all ML/AI engines
"""

import json
import sys
import os
import importlib.util
from pathlib import Path

# Get the directory where this script is located
SCRIPT_DIR = Path(__file__).parent.absolute()

# ==========================================
# ENGINE LOADER
# ==========================================

class EngineLoader:
    def __init__(self):
        self.engines = {}
        self.engine_files = {
            'analysis': 'analysis.py',
            'analytics': 'analytics_engine.py',
            'image': 'image_processor.py',
            'fraud': 'fraud_detector.py',
            'email': 'email_templates.py',
            'search': 'search_engine.py',
            'recommend': 'recommendation_engine.py',
            'price': 'price_optimizer.py',
            'payment': 'payment_verifier.py',
            'health': 'health_monitor.py',
            # New Advanced Engines
            'neural': 'neural_commerce.py',
            'emotion': 'emotion_ai.py',
            'performance': 'performance_optimizer.py',
            'errors': 'error_tracker.py',
            'ml': 'ml_engine.py',
            'security': 'security_manager.py',
            'realtime': 'realtime_manager.py',
            'seo': 'seo_engine.py',
            'sales': 'sales_insights.py'
        }
    
    def load_engine(self, engine_name):
        """Dynamically load an engine module"""
        if engine_name in self.engines:
            return self.engines[engine_name]
        
        if engine_name not in self.engine_files:
            return None
        
        file_path = SCRIPT_DIR / self.engine_files[engine_name]
        
        if not file_path.exists():
            return None
        
        spec = importlib.util.spec_from_file_location(engine_name, file_path)
        if spec is None or spec.loader is None:
            return None
            
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        
        self.engines[engine_name] = module
        return module
    
    def get_available_engines(self):
        """Get list of available engines"""
        available = []
        for name, file in self.engine_files.items():
            path = SCRIPT_DIR / file
            available.append({
                "name": name,
                "file": file,
                "exists": path.exists(),
                "path": str(path)
            })
        return available


# ==========================================
# AI HUB
# ==========================================

class AIHub:
    def __init__(self):
        self.loader = EngineLoader()
    
    def _inject_context_data(self, data):
        """Autonomously infuse local data into AI requests"""
        data_dir = os.path.join(os.path.dirname(__file__), '..', 'data')
        
        # Mapping of data types to their JSON file sources
        sources = {
            'allProducts': 'products.json',
            'allOrders': 'orders.json',
            'allUsers': 'users.json',
            'allTraffic': 'traffic.json'
        }
        
        for key, filename in sources.items():
            if key not in data:
                path = os.path.join(data_dir, filename)
                if os.path.exists(path):
                    try:
                        with open(path, 'r', encoding='utf-8') as f:
                            raw = json.load(f)
                            if isinstance(raw, list): data[key] = raw
                            elif isinstance(raw, dict): data[key] = raw.get(key.replace('all', '').lower() + 's', [])
                    except:
                        pass
        return data

    def route_request(self, engine_name, task, data):
        """Route request to appropriate engine with auto-data injection"""
        
        # Inject context data if missing
        if isinstance(data, dict) and 'inject_context' in data:
            data = self._inject_context_data(data)

        # Recommendation Engine
        if engine_name == 'recommend':
            module = self.loader.load_engine('recommend')
            engine = module.RecommendationEngine()
            if task == 'recommend':
                return engine.get_recommendations(data)
            elif task == 'content':
                return engine.content_based_recommendations(data.get('product'), data.get('allProducts'))

        # Neural Commerce
        if engine_name == 'neural':
            module = self.loader.load_engine('neural')
            engine = module.NeuralCommerceEngine()
            if task == 'intent':
                return engine.predict_purchase_intent(data)
            elif task == 'optimize':
                return engine.optimize_product_placement(data)

        # Fraud Detection
        if engine_name == 'fraud':
            module = self.loader.load_engine('fraud')
            engine = module.FraudDetector()
            return engine.analyze_transaction(data.get('transaction'), data.get('history'))

        # Analytics Engine (uses standalone functions)
        if engine_name == 'analytics':
            module = self.loader.load_engine('analytics')
            if not module:
                return {"error": "Analytics engine not available"}
            
            if task == 'rfm':
                return module.calculate_rfm_scores(data)
            elif task == 'cohort':
                return module.cohort_analysis(data)
            elif task == 'forecast':
                # Map alternate name if needed
                forecast_fn = getattr(module, 'sales_forecast', getattr(module, 'sales_forecasting', None))
                if forecast_fn:
                    return forecast_fn(data)
                return {"error": "Forecast function not found"}
            elif task == 'product-performance':
                return module.product_performance(data)
            elif task == 'ab-test':
                return module.ab_test_analysis(data)
        
        # Fraud Detection Engine
        elif engine_name == 'fraud':
            module = self.loader.load_engine('fraud')
            if not module:
                return {"error": "Fraud detection engine not available"}
            
            if task == 'analyze':
                return module.analyze_fraud(data)
            elif task == 'batch':
                return module.batch_analyze(data)
            elif task == 'stats':
                return module.get_fraud_stats(data)
        
        # Email Templates Engine
        elif engine_name == 'email':
            module = self.loader.load_engine('email')
            if not module:
                return {"error": "Email template engine not available"}
            
            return module.generate_email(data)
        
        # Search Engine
        elif engine_name == 'search':
            module = self.loader.load_engine('search')
            if not module:
                return {"error": "Search engine not available"}
            
            engine = module.SearchEngine()
            
            if task == 'search':
                return engine.search(data.get("query", ""), data.get("products", []), data.get("options", {}))
            elif task == 'autocomplete':
                return engine.autocomplete(data.get("query", ""))
            elif task == 'index':
                return engine.build_index(data.get("products", []))
            elif task == 'trending':
                return engine.trending_searches(data.get("history", []))
        
        # Recommendation Engine
        elif engine_name == 'recommend':
            module = self.loader.load_engine('recommend')
            if not module:
                return {"error": "Recommendation engine not available"}
            
            engine = module.RecommendationEngine()
            
            if task == 'similar':
                return engine.get_similar_products(data.get("product_id"), data.get("products", []), data.get("limit", 10))
            elif task == 'collaborative':
                return engine.get_collaborative_recommendations(data.get("user_id"), data.get("orders", []), data.get("products", []), data.get("limit", 10))
            elif task == 'trending':
                return {"trending": engine.trending_products(data.get("orders", []), data.get("products", []), data.get("days", 7), data.get("limit", 10))}
            elif task == 'together':
                return engine.frequently_bought_together(data.get("orders", []), data.get("limit", 10))
            elif task == 'personalized':
                return engine.recommend(data.get("user_id"), data.get("orders", []), data.get("products", []), data.get("limit", 10))
        
        # Price Optimizer Engine
        elif engine_name == 'price':
            module = self.loader.load_engine('price')
            if not module:
                return {"error": "Price optimizer not available"}
            
            engine = module.PriceOptimizer()
            
            if task == 'optimize':
                return engine.optimize_price(data.get("product", {}), data.get("competitors", []), data.get("demand", {}))
            elif task == 'bundle':
                return engine.bundle_pricing(data.get("products", []), data.get("discount", 15))
            elif task == 'clearance':
                return engine.optimize_price(data.get("product", {}), [], {"is_clearance": True})
            elif task == 'seasonal':
                return engine.optimize_price(data.get("product", {}), [], {"is_seasonal": True})
            elif task == 'margin':
                return engine.margin_analysis(data.get("products", []))
        
        # Image Processor Engine
        elif engine_name == 'image':
            module = self.loader.load_engine('image')
            if not module:
                return {"error": "Image processor not available"}
            
            if task == 'check':
                return module.check_dependencies()
            elif task == 'optimize':
                return module.optimize_image(data)
            elif task == 'thumbnail':
                return module.generate_thumbnail(data)
            elif task == 'analyze':
                return module.analyze_image(data)
        
        # Payment Verification Engine
        elif engine_name == 'payment':
            module = self.loader.load_engine('payment')
            if not module:
                return {"error": "Payment verification engine not available"}
            
            verifier = module.PaymentVerificationAI()
            
            if task == 'verify':
                return verifier.verify_payment(data)
            elif task == 'batch':
                return verifier.batch_verify(data)
            elif task == 'refund-risk':
                return verifier.analyze_refund_risk(data)
        
        # Health Monitor Engine
        elif engine_name == 'health':
            module = self.loader.load_engine('health')
            if not module:
                return {"error": "Health monitor engine not available"}
            
            orchestrator = module.HealthMonitorOrchestrator()
            
            if task == 'full' or task == 'check':
                return orchestrator.full_health_check()
            elif task == 'system':
                return orchestrator.system_monitor.get_system_health()
            elif task == 'ai' or task == 'engines':
                return orchestrator.ai_checker.check_all_engines()
            elif task == 'diagnose':
                return orchestrator.ai_checker.diagnose_engine(data.get('engine', 'hub'))
            elif task == 'debug':
                return orchestrator.debugger.analyze_error(data.get('error', data))
            elif task == 'logs':
                return orchestrator.debugger.analyze_logs(data.get('logs', []))
        
        # Analysis Engine (legacy compatibility)
        elif engine_name == 'analysis':
            module = self.loader.load_engine('analysis')
            if not module:
                return {"error": "Analysis engine not available"}
            
            if task == 'insights':
                return module.generate_insights(data)
            elif task == 'sentiment':
                return module.analyze_sentiment(data.get('text', ''))
            elif task == 'recommend':
                return module.recommend_products(data)
            elif task == 'predict-stock':
                return module.predict_stock_out(data)
            elif task == 'seo-audit':
                return module.audit_seo(data)
            elif task == 'security-scan':
                return module.scan_security(data)
            elif task == 'train':
                return module.train_model(data)
            elif task == 'predict-intent':
                return module.predict_intent(data)
            elif task == 'seo-keywords':
                return module.generate_keywords(data)
        
        # Neural Commerce Engine
        elif engine_name == 'neural':
            module = self.loader.load_engine('neural')
            if not module:
                return {"error": "Neural commerce engine not available"}
            
            engine = module.NeuralCommerceEngine()
            
            if task == 'intent':
                return engine.predict_purchase_intent(data)
            elif task == 'placement':
                return engine.optimize_product_placement(data)
            elif task == 'pricing':
                return engine.generate_dynamic_pricing(data)
            elif task == 'journey':
                return engine.customer_journey_optimization(data)
            elif task == 'churn':
                return engine.predict_churn(data)
        
        # Emotion AI Engine
        elif engine_name == 'emotion':
            module = self.loader.load_engine('emotion')
            if not module:
                return {"error": "Emotion AI engine not available"}
            
            engine = module.EmotionAIEngine()
            
            if task == 'sentiment':
                return engine.analyze_sentiment(data)
            elif task == 'feedback':
                return engine.analyze_customer_feedback(data)
            elif task == 'intent':
                return engine.detect_customer_intent(data)
            elif task == 'empathy':
                return engine.generate_empathetic_response(data)
            elif task == 'reviews':
                return engine.analyze_review_emotions(data)
        
        # Performance Optimizer Engine
        elif engine_name == 'performance':
            module = self.loader.load_engine('performance')
            if not module:
                return {"error": "Performance optimizer engine not available"}
            
            engine = module.PerformanceOptimizer()
            
            if task == 'analyze':
                return engine.analyze_performance(data)
            elif task == 'queries':
                return engine.optimize_queries(data)
            elif task == 'cache':
                return engine.cache_recommendations(data)
            elif task == 'loadtest':
                return engine.load_test_analysis(data)
            elif task == 'metrics':
                return engine.analyze_performance(data)
        
        # Error Tracker Engine
        elif engine_name == 'errors':
            module = self.loader.load_engine('errors')
            if not module:
                return {"error": "Error tracker engine not available"}
            
            engine = module.ErrorTrackerEngine()
            
            if task == 'track':
                return engine.track_error(data)
            elif task == 'trends':
                return engine.analyze_error_trends(data)
            elif task == 'report':
                return engine.generate_error_report(data)
            elif task == 'resolve':
                return engine.auto_resolve(data)
        
        # ML Engine (Core Machine Learning)
        elif engine_name == 'ml':
            module = self.loader.load_engine('ml')
            if not module:
                return {"error": "ML engine not available"}
            
            engine = module.MLEngine()
            
            if task == 'predict':
                return engine.predict(data.get('modelId', data.get('modelType', 'sales_predictor')), data)
            elif task == 'train':
                return engine.train(data.get('modelId', data.get('modelType', 'all')), data)
            elif task == 'info':
                return engine.get_model_info(data.get('modelId', data.get('modelType')))
            elif task == 'sales':
                return engine.predict('sales_predictor', data)
            elif task == 'segment':
                return engine.predict('customer_segmentation', data)
            elif task == 'demand':
                return engine.predict('demand_forecaster', data)
            elif task == 'anomaly':
                return engine.predict('anomaly_detector', data)
            elif task == 'trend':
                return engine.predict('trend_analyzer', data)
        
        # Security Manager Engine
        elif engine_name == 'security':
            module = self.loader.load_engine('security')
            if not module:
                return {"error": "Security manager engine not available"}
            
            engine = module.SecurityManager()
            
            if task == 'analyze':
                return engine.analyze_request(data)
            elif task == 'traffic':
                return engine.analyze_traffic(data)
            elif task == 'scan':
                return engine.vulnerability_scan(data)
            elif task == 'brute-force':
                return engine.detect_brute_force(data)
            elif task == 'report':
                return engine.generate_security_report(data)
        
        # Real-Time Manager Engine
        elif engine_name == 'realtime':
            module = self.loader.load_engine('realtime')
            if not module:
                return {"error": "Real-time manager engine not available"}
            
            engine = module.RealTimeManager()
            
            if task == 'metric':
                return engine.process_metric(data)
            elif task == 'stats':
                return engine.get_live_stats(data)
            elif task == 'users':
                return engine.track_active_users(data)
            elif task == 'conversions':
                return engine.track_conversions(data)
            elif task == 'inventory':
                return engine.monitor_inventory(data)
            elif task == 'dashboard':
                return engine.aggregate_dashboard(data)
        
        # SEO Engine
        elif engine_name == 'seo':
            module = self.loader.load_engine('seo')
            if not module:
                return {"error": "SEO engine not available"}
            
            engine = module.AISEOEngine()
            
            if task == 'analyze':
                return engine.analyze_page(data)
            elif task == 'keywords':
                return engine.generate_keywords(data)
            elif task == 'meta':
                return engine.generate_meta_tags(data)
            elif task == 'audit':
                return engine.audit_site(data)
            elif task == 'optimize':
                return engine.optimize_content(data)
        
        # Sales Insights Engine
        elif engine_name == 'sales':
            module = self.loader.load_engine('sales')
            if not module:
                return {"error": "Sales insights engine not available"}
            
            engine = module.SalesInsightsEngine()
            
            if task == 'insights':
                return engine.generate_insights(data)
            elif task == 'forecast':
                return engine.forecast_sales(data)
            elif task == 'compare':
                return engine.compare_periods(data)
        
        return {"error": f"Unknown engine or task: {engine_name}/{task}"}
    
    def health_check(self):
        """Check health of all engines"""
        engines = self.loader.get_available_engines()
        health = {
            "status": "healthy",
            "timestamp": __import__('datetime').datetime.now().isoformat(),
            "engines": engines,
            "availableCount": len([e for e in engines if e['exists']]),
            "totalCount": len(engines)
        }
        
        if health["availableCount"] < health["totalCount"]:
            health["status"] = "degraded"
        
        return health
    
    def get_capabilities(self):
        """Get all available AI capabilities"""
        return {
            "analytics": {
                "tasks": ["rfm", "cohort", "forecast", "product-performance", "ab-test"],
                "description": "Customer and sales analytics"
            },
            "fraud": {
                "tasks": ["analyze", "batch", "stats"],
                "description": "Transaction fraud detection"
            },
            "email": {
                "tasks": ["welcome", "order_confirmation", "shipping", "password_reset", "abandoned_cart", "review_request"],
                "description": "Email template generation"
            },
            "search": {
                "tasks": ["search", "autocomplete", "index", "trending"],
                "description": "Full-text search with fuzzy matching"
            },
            "recommend": {
                "tasks": ["similar", "collaborative", "trending", "together", "personalized"],
                "description": "Product recommendations"
            },
            "price": {
                "tasks": ["optimize", "bundle", "clearance", "seasonal", "margin"],
                "description": "Dynamic pricing optimization"
            },
            "image": {
                "tasks": ["check", "optimize", "thumbnail", "analyze"],
                "description": "Image processing and optimization"
            },
            "payment": {
                "tasks": ["verify", "batch", "refund-risk"],
                "description": "AI-powered payment verification and fraud detection"
            },
            "health": {
                "tasks": ["full", "system", "ai", "diagnose", "debug", "logs"],
                "description": "System health monitoring and auto-debugging"
            },
            "analysis": {
                "tasks": ["insights", "sentiment", "recommend", "predict-stock", "seo-audit", "security-scan", "train", "predict-intent", "seo-keywords"],
                "description": "Core ML analysis and predictions"
            },
            "neural": {
                "tasks": ["intent", "placement", "pricing", "journey", "churn"],
                "description": "Neural commerce - purchase intent, product placement, dynamic pricing"
            },
            "emotion": {
                "tasks": ["sentiment", "feedback", "intent", "empathy", "reviews"],
                "description": "Emotion AI - sentiment analysis, empathetic responses"
            },
            "performance": {
                "tasks": ["analyze", "queries", "cache", "loadtest", "metrics"],
                "description": "Performance optimizer - query optimization, caching, load testing"
            },
            "errors": {
                "tasks": ["track", "trends", "report", "resolve"],
                "description": "Error tracker - error tracking, trend analysis, auto-resolution"
            },
            "ml": {
                "tasks": ["predict", "train", "info", "sales", "segment", "demand", "anomaly", "trend"],
                "description": "Core ML engine - sales prediction, segmentation, forecasting"
            },
            "security": {
                "tasks": ["analyze", "traffic", "scan", "brute-force", "report"],
                "description": "Security manager - threat detection, vulnerability scanning"
            },
            "realtime": {
                "tasks": ["metric", "stats", "users", "conversions", "inventory", "dashboard"],
                "description": "Real-time manager - live analytics, active users, conversions"
            },
            "seo": {
                "tasks": ["analyze", "keywords", "meta", "audit", "optimize"],
                "description": "AI SEO engine - keyword generation, meta tags, site audits"
            },
            "sales": {
                "tasks": ["insights", "forecast", "compare"],
                "description": "Sales insights - revenue analysis, forecasting, period comparison"
            }
        }


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    hub = AIHub()
    
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        try:
            # Parse input data
            input_data = {}
            if len(sys.argv) > 2:
                if sys.argv[2] == "--stdin":
                    input_data = json.loads(sys.stdin.read())
                else:
                    input_data = json.loads(sys.argv[2])
            
            if not isinstance(input_data, dict):
                input_data = {"data": input_data}
            
            # Handle special commands
            if command == "health" or command == "status":
                print(json.dumps(hub.health_check()))
            
            elif command == "capabilities":
                print(json.dumps(hub.get_capabilities()))
            
            elif command == "engines":
                print(json.dumps({"engines": hub.loader.get_available_engines()}))
            
            else:
                # Route to engine (format: engine/task or engine.task)
                parts = command.replace('.', '/').split('/')
                
                if len(parts) == 2:
                    engine_name, task = parts
                    result = hub.route_request(engine_name, task, input_data)
                    print(json.dumps(result))
                else:
                    print(json.dumps({
                        "error": f"Invalid command format: {command}",
                        "usage": "python ai_hub.py engine/task [json_data | --stdin]",
                        "examples": [
                            "python ai_hub.py search/search '{\"query\": \"black tshirt\"}'",
                            "python ai_hub.py recommend/trending --stdin",
                            "python ai_hub.py health",
                            "python ai_hub.py capabilities"
                        ]
                    }))
        
        except Exception as e:
            import traceback
            print(json.dumps({
                "error": str(e),
                "traceback": traceback.format_exc()
            }))
    
    else:
        # No arguments - show help
        print(json.dumps({
            "name": "BLACKONN AI Hub",
            "version": "1.0.0",
            "status": "healthy",
            "usage": "python ai_hub.py <command> [data]",
            "commands": {
                "health": "Check health of all engines",
                "capabilities": "List all available AI capabilities",
                "engines": "List all engine files",
                "<engine>/<task>": "Run a specific task on an engine"
            },
            "availableEngines": list(hub.loader.engine_files.keys())
        }))
