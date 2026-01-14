#!/usr/bin/env python3
"""
Real-Time Manager Engine for BLACKONN
Real-time analytics, live monitoring, and instant updates
"""

import json
import sys
from datetime import datetime, timedelta
from collections import defaultdict, deque
import statistics

# ==========================================
# REAL-TIME MANAGER ENGINE
# ==========================================

class RealTimeManager:
    """Real-time data processing and analytics engine"""
    
    def __init__(self):
        self.model_version = "2.0.0"
        self.metrics_buffer = defaultdict(lambda: deque(maxlen=1000))
        self.alerts = []
        self.alert_thresholds = {
            'response_time': 500,
            'error_rate': 0.05,
            'cpu_usage': 80,
            'memory_usage': 85,
            'active_users_drop': 0.5
        }
    
    def process_metric(self, metric_data):
        """Process a single real-time metric"""
        metric_type = metric_data.get('type', 'custom')
        value = metric_data.get('value', 0)
        timestamp = metric_data.get('timestamp', datetime.now().isoformat())
        metadata = metric_data.get('metadata', {})
        
        # Store in buffer
        self.metrics_buffer[metric_type].append({
            'value': value,
            'timestamp': timestamp,
            'metadata': metadata
        })
        
        # Check for alerts
        alerts_triggered = self._check_alerts(metric_type, value)
        
        # Calculate real-time statistics
        recent_values = [m['value'] for m in self.metrics_buffer[metric_type]]
        
        return {
            "success": True,
            "processed": {
                "type": metric_type,
                "value": value,
                "timestamp": timestamp
            },
            "statistics": {
                "current": value,
                "average": round(statistics.mean(recent_values), 2) if recent_values else 0,
                "min": min(recent_values) if recent_values else 0,
                "max": max(recent_values) if recent_values else 0,
                "count": len(recent_values)
            },
            "alerts": alerts_triggered
        }
    
    def _check_alerts(self, metric_type, value):
        """Check if value triggers any alerts"""
        alerts = []
        
        if metric_type == 'response_time' and value > self.alert_thresholds['response_time']:
            alerts.append({
                "type": "HIGH_RESPONSE_TIME",
                "severity": "warning" if value < 1000 else "critical",
                "value": value,
                "threshold": self.alert_thresholds['response_time'],
                "message": f"Response time {value}ms exceeds threshold"
            })
        
        if metric_type == 'error_rate' and value > self.alert_thresholds['error_rate']:
            alerts.append({
                "type": "HIGH_ERROR_RATE",
                "severity": "critical",
                "value": value,
                "threshold": self.alert_thresholds['error_rate'],
                "message": f"Error rate {value*100:.1f}% exceeds threshold"
            })
        
        if metric_type == 'cpu_usage' and value > self.alert_thresholds['cpu_usage']:
            alerts.append({
                "type": "HIGH_CPU_USAGE",
                "severity": "warning" if value < 90 else "critical",
                "value": value,
                "threshold": self.alert_thresholds['cpu_usage'],
                "message": f"CPU usage {value}% exceeds threshold"
            })
        
        if metric_type == 'memory_usage' and value > self.alert_thresholds['memory_usage']:
            alerts.append({
                "type": "HIGH_MEMORY_USAGE",
                "severity": "warning" if value < 95 else "critical",
                "value": value,
                "threshold": self.alert_thresholds['memory_usage'],
                "message": f"Memory usage {value}% exceeds threshold"
            })
        
        return alerts
    
    def get_live_stats(self, stats_config):
        """Get current live statistics"""
        metrics_to_include = stats_config.get('metrics', ['all'])
        time_range = stats_config.get('timeRangeMinutes', 5)
        
        cutoff = datetime.now() - timedelta(minutes=time_range)
        
        stats = {}
        
        for metric_type, buffer in self.metrics_buffer.items():
            if 'all' not in metrics_to_include and metric_type not in metrics_to_include:
                continue
            
            # Filter by time range
            recent = []
            for m in buffer:
                try:
                    ts = datetime.fromisoformat(m['timestamp'].replace('Z', '+00:00'))
                    if ts >= cutoff:
                        recent.append(m['value'])
                except:
                    recent.append(m['value'])
            
            if recent:
                stats[metric_type] = {
                    "current": recent[-1],
                    "average": round(statistics.mean(recent), 2),
                    "min": min(recent),
                    "max": max(recent),
                    "trend": self._calculate_trend(recent),
                    "count": len(recent)
                }
        
        return {
            "success": True,
            "timeRange": f"{time_range} minutes",
            "stats": stats,
            "timestamp": datetime.now().isoformat()
        }
    
    def _calculate_trend(self, values):
        """Calculate trend direction"""
        if len(values) < 3:
            return "stable"
        
        first_half = statistics.mean(values[:len(values)//2])
        second_half = statistics.mean(values[len(values)//2:])
        
        change = (second_half - first_half) / first_half if first_half > 0 else 0
        
        if change > 0.1:
            return "increasing"
        elif change < -0.1:
            return "decreasing"
        return "stable"
    
    def track_active_users(self, users_data):
        """Track active users in real-time"""
        sessions = users_data.get('sessions', [])
        
        # Calculate active user metrics
        now = datetime.now()
        active_now = 0
        active_5min = 0
        active_15min = 0
        active_1hour = 0
        
        user_locations = defaultdict(int)
        user_devices = defaultdict(int)
        user_pages = defaultdict(int)
        
        for session in sessions:
            last_activity = session.get('lastActivity')
            try:
                activity_time = datetime.fromisoformat(last_activity.replace('Z', '+00:00'))
                age_minutes = (now - activity_time).total_seconds() / 60
                
                if age_minutes <= 1:
                    active_now += 1
                if age_minutes <= 5:
                    active_5min += 1
                if age_minutes <= 15:
                    active_15min += 1
                if age_minutes <= 60:
                    active_1hour += 1
                
                # Track metadata
                if age_minutes <= 15:
                    location = session.get('location', session.get('country', 'Unknown'))
                    device = session.get('device', 'Unknown')
                    page = session.get('currentPage', '/')
                    
                    user_locations[location] += 1
                    user_devices[device] += 1
                    user_pages[page] += 1
            except:
                pass
        
        return {
            "success": True,
            "activeUsers": {
                "now": active_now,
                "last5min": active_5min,
                "last15min": active_15min,
                "last1hour": active_1hour
            },
            "breakdown": {
                "byLocation": dict(sorted(user_locations.items(), key=lambda x: x[1], reverse=True)[:10]),
                "byDevice": dict(user_devices),
                "byPage": dict(sorted(user_pages.items(), key=lambda x: x[1], reverse=True)[:10])
            },
            "timestamp": datetime.now().isoformat()
        }
    
    def track_conversions(self, conversion_data):
        """Track real-time conversions"""
        events = conversion_data.get('events', [])
        time_range = conversion_data.get('timeRangeMinutes', 60)
        
        cutoff = datetime.now() - timedelta(minutes=time_range)
        
        # Conversion funnel
        funnel = {
            'page_view': 0,
            'product_view': 0,
            'add_to_cart': 0,
            'checkout_start': 0,
            'purchase': 0
        }
        
        revenue = 0
        conversions = []
        
        for event in events:
            event_type = event.get('type', event.get('event', ''))
            timestamp = event.get('timestamp', '')
            
            try:
                event_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                if event_time < cutoff:
                    continue
            except:
                pass
            
            # Update funnel
            if 'view' in event_type.lower() and 'product' not in event_type.lower():
                funnel['page_view'] += 1
            elif 'product' in event_type.lower() and 'view' in event_type.lower():
                funnel['product_view'] += 1
            elif 'cart' in event_type.lower() or 'add' in event_type.lower():
                funnel['add_to_cart'] += 1
            elif 'checkout' in event_type.lower():
                funnel['checkout_start'] += 1
            elif 'purchase' in event_type.lower() or 'order' in event_type.lower():
                funnel['purchase'] += 1
                revenue += event.get('value', event.get('revenue', 0))
                conversions.append({
                    "timestamp": timestamp,
                    "value": event.get('value', 0),
                    "orderId": event.get('orderId')
                })
        
        # Calculate conversion rates
        rates = {}
        if funnel['page_view'] > 0:
            rates['viewToProduct'] = round(funnel['product_view'] / funnel['page_view'] * 100, 2)
        if funnel['product_view'] > 0:
            rates['productToCart'] = round(funnel['add_to_cart'] / funnel['product_view'] * 100, 2)
        if funnel['add_to_cart'] > 0:
            rates['cartToCheckout'] = round(funnel['checkout_start'] / funnel['add_to_cart'] * 100, 2)
        if funnel['checkout_start'] > 0:
            rates['checkoutToPurchase'] = round(funnel['purchase'] / funnel['checkout_start'] * 100, 2)
        if funnel['page_view'] > 0:
            rates['overall'] = round(funnel['purchase'] / funnel['page_view'] * 100, 2)
        
        return {
            "success": True,
            "timeRange": f"{time_range} minutes",
            "funnel": funnel,
            "conversionRates": rates,
            "revenue": {
                "total": round(revenue, 2),
                "count": len(conversions),
                "average": round(revenue / len(conversions), 2) if conversions else 0
            },
            "recentConversions": conversions[-10:],
            "timestamp": datetime.now().isoformat()
        }
    
    def monitor_inventory(self, inventory_data):
        """Real-time inventory monitoring"""
        products = inventory_data.get('products', [])
        recent_orders = inventory_data.get('recentOrders', [])
        
        # Calculate velocity (sales per hour)
        velocities = defaultdict(float)
        for order in recent_orders:
            for item in order.get('items', []):
                product_id = item.get('productId')
                quantity = item.get('quantity', 1)
                velocities[product_id] += quantity
        
        # Analyze each product
        alerts = []
        low_stock = []
        out_of_stock = []
        
        for product in products:
            product_id = product.get('id')
            stock = product.get('stock', 0)
            reorder_point = product.get('reorderPoint', 10)
            name = product.get('name', 'Unknown')
            
            velocity = velocities.get(product_id, 0)
            hours_until_stockout = stock / velocity if velocity > 0 else float('inf')
            
            if stock == 0:
                out_of_stock.append({
                    "productId": product_id,
                    "name": name,
                    "velocity": velocity
                })
            elif stock <= reorder_point:
                low_stock.append({
                    "productId": product_id,
                    "name": name,
                    "stock": stock,
                    "reorderPoint": reorder_point,
                    "hoursUntilStockout": round(hours_until_stockout, 1)
                })
                
                if hours_until_stockout < 24:
                    alerts.append({
                        "type": "CRITICAL_STOCK",
                        "productId": product_id,
                        "name": name,
                        "message": f"Will run out in {hours_until_stockout:.1f} hours"
                    })
        
        return {
            "success": True,
            "summary": {
                "totalProducts": len(products),
                "outOfStock": len(out_of_stock),
                "lowStock": len(low_stock),
                "healthyStock": len(products) - len(out_of_stock) - len(low_stock)
            },
            "outOfStock": out_of_stock[:20],
            "lowStock": sorted(low_stock, key=lambda x: x.get('hoursUntilStockout', float('inf')))[:20],
            "alerts": alerts,
            "timestamp": datetime.now().isoformat()
        }
    
    def aggregate_dashboard(self, dashboard_data):
        """Aggregate data for real-time dashboard"""
        metrics = dashboard_data.get('metrics', {})
        sessions = dashboard_data.get('sessions', [])
        events = dashboard_data.get('events', [])
        products = dashboard_data.get('products', [])
        orders = dashboard_data.get('orders', [])
        
        # Get all real-time stats
        active_users = self.track_active_users({'sessions': sessions})
        conversions = self.track_conversions({'events': events})
        inventory = self.monitor_inventory({'products': products, 'recentOrders': orders})
        
        # Calculate key metrics
        total_revenue_today = sum(
            o.get('total', 0) for o in orders 
            if self._is_today(o.get('createdAt', ''))
        )
        
        orders_today = len([
            o for o in orders 
            if self._is_today(o.get('createdAt', ''))
        ])
        
        return {
            "success": True,
            "dashboard": {
                "activeUsers": active_users['activeUsers'],
                "ordersToday": orders_today,
                "revenueToday": round(total_revenue_today, 2),
                "conversionRate": conversions['conversionRates'].get('overall', 0),
                "inventoryAlerts": len(inventory['alerts'])
            },
            "details": {
                "users": active_users,
                "conversions": conversions,
                "inventory": inventory
            },
            "lastUpdated": datetime.now().isoformat()
        }
    
    def _is_today(self, date_str):
        """Check if date string is today"""
        try:
            date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
            return date.date() == datetime.now().date()
        except:
            return False


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    manager = RealTimeManager()
    
    if len(sys.argv) > 1:
        task = sys.argv[1]
        try:
            input_data = {}
            if len(sys.argv) > 2:
                if sys.argv[2] == "--stdin":
                    input_data = json.loads(sys.stdin.read())
                else:
                    input_data = json.loads(sys.argv[2])
            
            if task == "metric":
                result = manager.process_metric(input_data)
            elif task == "stats":
                result = manager.get_live_stats(input_data)
            elif task == "users":
                result = manager.track_active_users(input_data)
            elif task == "conversions":
                result = manager.track_conversions(input_data)
            elif task == "inventory":
                result = manager.monitor_inventory(input_data)
            elif task == "dashboard":
                result = manager.aggregate_dashboard(input_data)
            else:
                result = {"error": f"Unknown task: {task}"}
            
            print(json.dumps(result))
        except Exception as e:
            import traceback
            print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))
    else:
        print(json.dumps({
            "engine": "Real-Time Manager",
            "version": manager.model_version,
            "tasks": ["metric", "stats", "users", "conversions", "inventory", "dashboard"],
            "status": "ready"
        }))
