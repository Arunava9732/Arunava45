#!/usr/bin/env python3
"""
ML Engine for BLACKONN
Core machine learning models for predictions, classification, and recommendations
"""

import json
import sys
import math
import random
from datetime import datetime, timedelta
from collections import defaultdict
import statistics

# ==========================================
# ML ENGINE - Core Machine Learning Models
# ==========================================

class MLEngine:
    """Core machine learning engine with multiple model implementations"""
    
    def __init__(self):
        self.model_version = "2.0.0"
        self.models = {
            'sales_predictor': SalesPredictor(),
            'customer_segmentation': CustomerSegmentation(),
            'demand_forecaster': DemandForecaster(),
            'anomaly_detector': AnomalyDetector(),
            'trend_analyzer': TrendAnalyzer()
        }
    
    def predict(self, model_name, data):
        """Run prediction on specified model"""
        if model_name not in self.models:
            return {"error": f"Model {model_name} not found"}
        
        model = self.models[model_name]
        return model.predict(data)
    
    def train(self, model_name, training_data):
        """Train/update model with new data"""
        if model_name not in self.models:
            return {"error": f"Model {model_name} not found"}
        
        model = self.models[model_name]
        if hasattr(model, 'train'):
            return model.train(training_data)
        return {"error": f"Model {model_name} does not support training"}
    
    def get_model_info(self, model_name=None):
        """Get information about models"""
        if model_name:
            if model_name not in self.models:
                return {"error": f"Model {model_name} not found"}
            model = self.models[model_name]
            return {
                "name": model_name,
                "version": getattr(model, 'version', '1.0'),
                "type": type(model).__name__,
                "description": getattr(model, 'description', 'No description')
            }
        
        return {
            "models": [
                {
                    "name": name,
                    "type": type(model).__name__,
                    "status": "ready"
                }
                for name, model in self.models.items()
            ],
            "engineVersion": self.model_version
        }


class SalesPredictor:
    """Sales prediction model"""
    
    def __init__(self):
        self.version = "2.0"
        self.description = "Predicts future sales based on historical data and trends"
        self.seasonality_factors = {
            1: 0.85,   # January - post-holiday dip
            2: 0.90,   # February
            3: 0.95,   # March
            4: 1.00,   # April
            5: 1.00,   # May
            6: 0.95,   # June
            7: 0.90,   # July
            8: 0.95,   # August - back to school
            9: 1.00,   # September
            10: 1.10,  # October - pre-holiday
            11: 1.25,  # November - Black Friday
            12: 1.40   # December - Holiday season
        }
    
    def predict(self, data):
        """Predict sales for specified period"""
        historical = data.get('historical', [])
        days_ahead = data.get('daysAhead', 30)
        
        if not historical:
            return {"error": "Historical data required for prediction"}
        
        # Calculate base metrics
        sales_values = [h.get('sales', h.get('revenue', 0)) for h in historical]
        
        if not sales_values or all(v == 0 for v in sales_values):
            return {"error": "No valid sales data found"}
        
        avg_sales = statistics.mean(sales_values)
        std_dev = statistics.stdev(sales_values) if len(sales_values) > 1 else avg_sales * 0.1
        
        # Calculate trend
        trend = self._calculate_trend(sales_values)
        
        # Generate predictions
        predictions = []
        base_date = datetime.now()
        
        for day in range(days_ahead):
            future_date = base_date + timedelta(days=day)
            month = future_date.month
            
            # Apply trend and seasonality
            base_prediction = avg_sales * (1 + trend * day / len(sales_values))
            seasonal_prediction = base_prediction * self.seasonality_factors.get(month, 1.0)
            
            # Add some variance
            variance = random.gauss(0, std_dev * 0.2)
            final_prediction = max(0, seasonal_prediction + variance)
            
            predictions.append({
                "date": future_date.strftime('%Y-%m-%d'),
                "predicted": round(final_prediction, 2),
                "lower": round(max(0, final_prediction - std_dev), 2),
                "upper": round(final_prediction + std_dev, 2),
                "confidence": 0.85 - (day * 0.01)  # Confidence decreases over time
            })
        
        return {
            "success": True,
            "predictions": predictions,
            "summary": {
                "totalPredicted": round(sum(p['predicted'] for p in predictions), 2),
                "averageDaily": round(statistics.mean([p['predicted'] for p in predictions]), 2),
                "trend": "increasing" if trend > 0.001 else "decreasing" if trend < -0.001 else "stable",
                "trendStrength": round(abs(trend) * 100, 2)
            },
            "modelVersion": self.version,
            "timestamp": datetime.now().isoformat()
        }
    
    def _calculate_trend(self, values):
        """Calculate trend coefficient using linear regression"""
        n = len(values)
        if n < 2:
            return 0
        
        x_mean = (n - 1) / 2
        y_mean = sum(values) / n
        
        numerator = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(values))
        denominator = sum((i - x_mean) ** 2 for i in range(n))
        
        if denominator == 0:
            return 0
        
        return numerator / denominator / y_mean if y_mean != 0 else 0


class CustomerSegmentation:
    """Customer segmentation using RFM analysis"""
    
    def __init__(self):
        self.version = "2.0"
        self.description = "Segments customers using RFM (Recency, Frequency, Monetary) analysis"
    
    def predict(self, data):
        """Segment customers based on behavior"""
        customers = data.get('customers', [])
        
        if not customers:
            return {"error": "Customer data required"}
        
        segments = defaultdict(list)
        segment_stats = defaultdict(lambda: {'count': 0, 'value': 0})
        
        for customer in customers:
            recency = customer.get('daysSinceLastPurchase', 365)
            frequency = customer.get('orderCount', 0)
            monetary = customer.get('totalSpent', 0)
            
            # Calculate RFM scores (1-5)
            r_score = self._score_recency(recency)
            f_score = self._score_frequency(frequency)
            m_score = self._score_monetary(monetary)
            
            # Determine segment
            segment = self._determine_segment(r_score, f_score, m_score)
            
            customer_result = {
                "id": customer.get('id'),
                "email": customer.get('email'),
                "rfmScores": {"R": r_score, "F": f_score, "M": m_score},
                "segment": segment,
                "value": monetary
            }
            
            segments[segment].append(customer_result)
            segment_stats[segment]['count'] += 1
            segment_stats[segment]['value'] += monetary
        
        return {
            "success": True,
            "segmentSummary": {
                name: {
                    "count": stats['count'],
                    "totalValue": round(stats['value'], 2),
                    "avgValue": round(stats['value'] / stats['count'], 2) if stats['count'] > 0 else 0,
                    "percentage": round(stats['count'] / len(customers) * 100, 1)
                }
                for name, stats in segment_stats.items()
            },
            "segments": {name: custs[:10] for name, custs in segments.items()},
            "recommendations": self._get_segment_recommendations(segment_stats),
            "modelVersion": self.version,
            "timestamp": datetime.now().isoformat()
        }
    
    def _score_recency(self, days):
        """Score recency (lower is better)"""
        if days <= 7:
            return 5
        elif days <= 30:
            return 4
        elif days <= 90:
            return 3
        elif days <= 180:
            return 2
        return 1
    
    def _score_frequency(self, count):
        """Score frequency (higher is better)"""
        if count >= 10:
            return 5
        elif count >= 5:
            return 4
        elif count >= 3:
            return 3
        elif count >= 2:
            return 2
        return 1
    
    def _score_monetary(self, amount):
        """Score monetary value (higher is better)"""
        if amount >= 10000:
            return 5
        elif amount >= 5000:
            return 4
        elif amount >= 2000:
            return 3
        elif amount >= 500:
            return 2
        return 1
    
    def _determine_segment(self, r, f, m):
        """Determine customer segment from RFM scores"""
        total = r + f + m
        
        if r >= 4 and f >= 4 and m >= 4:
            return "Champions"
        elif r >= 4 and f >= 3:
            return "Loyal Customers"
        elif r >= 4 and f <= 2 and m >= 3:
            return "Potential Loyalists"
        elif r >= 3 and f >= 3:
            return "Promising"
        elif r <= 2 and f >= 4 and m >= 4:
            return "At Risk"
        elif r <= 2 and f <= 2 and m >= 3:
            return "Hibernating"
        elif r <= 2 and f <= 2:
            return "Lost"
        elif r >= 4 and f <= 2:
            return "New Customers"
        return "Regular"
    
    def _get_segment_recommendations(self, stats):
        """Generate recommendations per segment"""
        recommendations = []
        
        if stats.get('At Risk', {}).get('count', 0) > 0:
            recommendations.append({
                "segment": "At Risk",
                "action": "Launch win-back campaign with special offers",
                "priority": "high"
            })
        
        if stats.get('Champions', {}).get('count', 0) > 0:
            recommendations.append({
                "segment": "Champions",
                "action": "Engage with loyalty rewards and early access",
                "priority": "medium"
            })
        
        if stats.get('New Customers', {}).get('count', 0) > 0:
            recommendations.append({
                "segment": "New Customers",
                "action": "Nurture with onboarding emails and first-purchase discounts",
                "priority": "high"
            })
        
        return recommendations


class DemandForecaster:
    """Product demand forecasting model"""
    
    def __init__(self):
        self.version = "2.0"
        self.description = "Forecasts product demand for inventory planning"
    
    def predict(self, data):
        """Forecast demand for products"""
        products = data.get('products', [])
        orders = data.get('orders', [])
        days_ahead = data.get('daysAhead', 30)
        
        if not products:
            return {"error": "Product data required"}
        
        # Calculate demand per product
        product_demand = defaultdict(list)
        
        for order in orders:
            for item in order.get('items', []):
                product_id = item.get('productId')
                quantity = item.get('quantity', 1)
                product_demand[product_id].append(quantity)
        
        forecasts = []
        reorder_alerts = []
        
        for product in products:
            product_id = product.get('id')
            current_stock = product.get('stock', 0)
            reorder_point = product.get('reorderPoint', 10)
            
            demand_history = product_demand.get(product_id, [])
            
            if demand_history:
                avg_daily = sum(demand_history) / max(len(orders), 1)
                variance = statistics.stdev(demand_history) if len(demand_history) > 1 else avg_daily * 0.2
            else:
                avg_daily = 0.1  # Minimal assumed demand
                variance = 0.05
            
            # Forecast
            forecasted_demand = avg_daily * days_ahead
            safety_stock = variance * 2 * math.sqrt(days_ahead)
            recommended_order = max(0, forecasted_demand + safety_stock - current_stock)
            
            forecast_result = {
                "productId": product_id,
                "productName": product.get('name', 'Unknown'),
                "currentStock": current_stock,
                "forecastedDemand": round(forecasted_demand, 1),
                "recommendedOrder": round(recommended_order, 0),
                "daysUntilStockout": round(current_stock / avg_daily, 1) if avg_daily > 0 else float('inf')
            }
            
            forecasts.append(forecast_result)
            
            # Check if reorder needed
            if current_stock <= reorder_point or forecast_result['daysUntilStockout'] <= days_ahead:
                reorder_alerts.append({
                    "productId": product_id,
                    "productName": product.get('name', 'Unknown'),
                    "urgency": "critical" if current_stock <= reorder_point / 2 else "warning",
                    "daysUntilStockout": forecast_result['daysUntilStockout']
                })
        
        # Sort alerts by urgency
        reorder_alerts.sort(key=lambda x: x['daysUntilStockout'])
        
        return {
            "success": True,
            "forecasts": forecasts,
            "reorderAlerts": reorder_alerts[:20],
            "summary": {
                "totalProducts": len(products),
                "productsNeedingReorder": len(reorder_alerts),
                "criticalAlerts": len([a for a in reorder_alerts if a['urgency'] == 'critical'])
            },
            "modelVersion": self.version,
            "timestamp": datetime.now().isoformat()
        }


class AnomalyDetector:
    """Anomaly detection for metrics and transactions"""
    
    def __init__(self):
        self.version = "2.0"
        self.description = "Detects anomalies in numerical data using statistical methods"
    
    def predict(self, data):
        """Detect anomalies in provided data"""
        values = data.get('values', [])
        metric_name = data.get('metricName', 'metric')
        threshold = data.get('threshold', 2.5)  # Z-score threshold
        
        if len(values) < 3:
            return {"error": "Need at least 3 data points"}
        
        # Extract numerical values
        if isinstance(values[0], dict):
            nums = [v.get('value', 0) for v in values]
            timestamps = [v.get('timestamp') for v in values]
        else:
            nums = values
            timestamps = [None] * len(values)
        
        mean = statistics.mean(nums)
        std = statistics.stdev(nums) if len(nums) > 1 else 1
        
        anomalies = []
        for i, (value, ts) in enumerate(zip(nums, timestamps)):
            z_score = (value - mean) / std if std > 0 else 0
            
            if abs(z_score) > threshold:
                anomalies.append({
                    "index": i,
                    "value": value,
                    "timestamp": ts,
                    "zScore": round(z_score, 2),
                    "type": "spike" if z_score > 0 else "dip",
                    "severity": "critical" if abs(z_score) > threshold * 1.5 else "warning"
                })
        
        return {
            "success": True,
            "metricName": metric_name,
            "statistics": {
                "mean": round(mean, 2),
                "stdDev": round(std, 2),
                "min": min(nums),
                "max": max(nums)
            },
            "anomalies": anomalies,
            "summary": {
                "totalPoints": len(nums),
                "anomalyCount": len(anomalies),
                "anomalyRate": round(len(anomalies) / len(nums) * 100, 2)
            },
            "modelVersion": self.version,
            "timestamp": datetime.now().isoformat()
        }


class TrendAnalyzer:
    """Trend analysis for time series data"""
    
    def __init__(self):
        self.version = "2.0"
        self.description = "Analyzes trends in time series data"
    
    def predict(self, data):
        """Analyze trends in provided data"""
        series = data.get('series', [])
        
        if len(series) < 5:
            return {"error": "Need at least 5 data points for trend analysis"}
        
        # Extract values
        if isinstance(series[0], dict):
            values = [s.get('value', 0) for s in series]
        else:
            values = series
        
        # Calculate moving averages
        ma_7 = self._moving_average(values, 7)
        ma_30 = self._moving_average(values, min(30, len(values) // 2))
        
        # Trend direction
        recent = values[-min(7, len(values)):]
        older = values[:min(7, len(values))]
        
        trend_direction = "increasing" if statistics.mean(recent) > statistics.mean(older) * 1.05 else \
                         "decreasing" if statistics.mean(recent) < statistics.mean(older) * 0.95 else "stable"
        
        # Calculate momentum
        if len(values) >= 2:
            momentum = (values[-1] - values[0]) / values[0] * 100 if values[0] != 0 else 0
        else:
            momentum = 0
        
        # Seasonality detection (simplified)
        seasonality = self._detect_seasonality(values)
        
        return {
            "success": True,
            "trend": {
                "direction": trend_direction,
                "strength": abs(momentum),
                "momentum": round(momentum, 2)
            },
            "statistics": {
                "current": values[-1],
                "mean": round(statistics.mean(values), 2),
                "min": min(values),
                "max": max(values),
                "range": max(values) - min(values)
            },
            "movingAverages": {
                "ma7": ma_7[-1] if ma_7 else None,
                "ma30": ma_30[-1] if ma_30 else None
            },
            "seasonality": seasonality,
            "modelVersion": self.version,
            "timestamp": datetime.now().isoformat()
        }
    
    def _moving_average(self, values, window):
        """Calculate moving average"""
        if len(values) < window:
            return []
        
        result = []
        for i in range(len(values) - window + 1):
            avg = sum(values[i:i+window]) / window
            result.append(round(avg, 2))
        return result
    
    def _detect_seasonality(self, values):
        """Detect basic seasonality patterns"""
        if len(values) < 14:
            return {"detected": False, "pattern": None}
        
        # Check for weekly pattern
        weekly_diff = []
        for i in range(7, len(values)):
            diff = abs(values[i] - values[i-7])
            weekly_diff.append(diff)
        
        avg_weekly_diff = statistics.mean(weekly_diff) if weekly_diff else float('inf')
        overall_std = statistics.stdev(values) if len(values) > 1 else 1
        
        if avg_weekly_diff < overall_std * 0.5:
            return {"detected": True, "pattern": "weekly", "confidence": 0.7}
        
        return {"detected": False, "pattern": None}


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    engine = MLEngine()
    
    if len(sys.argv) > 1:
        task = sys.argv[1]
        try:
            input_data = {}
            if len(sys.argv) > 2:
                if sys.argv[2] == "--stdin":
                    input_data = json.loads(sys.stdin.read())
                else:
                    input_data = json.loads(sys.argv[2])
            
            if task == "predict":
                model_name = input_data.get('model', 'sales_predictor')
                result = engine.predict(model_name, input_data)
            elif task == "train":
                model_name = input_data.get('model')
                result = engine.train(model_name, input_data)
            elif task == "info":
                model_name = input_data.get('model')
                result = engine.get_model_info(model_name)
            elif task == "sales":
                result = engine.models['sales_predictor'].predict(input_data)
            elif task == "segment":
                result = engine.models['customer_segmentation'].predict(input_data)
            elif task == "demand":
                result = engine.models['demand_forecaster'].predict(input_data)
            elif task == "anomaly":
                result = engine.models['anomaly_detector'].predict(input_data)
            elif task == "trend":
                result = engine.models['trend_analyzer'].predict(input_data)
            else:
                result = {"error": f"Unknown task: {task}"}
            
            print(json.dumps(result))
        except Exception as e:
            import traceback
            print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))
    else:
        print(json.dumps({
            "engine": "ML Engine",
            "version": engine.model_version,
            "tasks": ["predict", "train", "info", "sales", "segment", "demand", "anomaly", "trend"],
            "models": list(engine.models.keys()),
            "status": "ready"
        }))
