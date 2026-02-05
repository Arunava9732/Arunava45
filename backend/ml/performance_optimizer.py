#!/usr/bin/env python3
"""
Performance Optimizer Engine for BLACKONN
Server and application performance optimization with AI
"""

import json
import sys
import psutil
import os
from datetime import datetime, timedelta
from collections import defaultdict
import statistics

# ==========================================
# PERFORMANCE OPTIMIZER ENGINE
# ==========================================

class PerformanceOptimizer:
    """AI-powered performance optimization engine"""
    
    def __init__(self):
        self.model_version = "2.0.0"
        self.thresholds = {
            'response_time_good': 200,      # ms
            'response_time_warning': 500,   # ms
            'response_time_critical': 2000, # ms
            'cpu_warning': 70,
            'cpu_critical': 90,
            'memory_warning': 75,
            'memory_critical': 90,
            'error_rate_warning': 0.01,     # 1%
            'error_rate_critical': 0.05     # 5%
        }
    
    def analyze_performance(self, metrics_data):
        """Analyze overall system performance"""
        # Get current system metrics
        current_metrics = self._get_current_metrics()
        
        # Historical metrics from input
        historical = metrics_data.get('historical', [])
        requests = metrics_data.get('requests', [])
        errors = metrics_data.get('errors', [])
        
        # Calculate performance scores
        performance_score = self._calculate_performance_score(current_metrics, requests, errors)
        
        # Generate recommendations
        recommendations = self._generate_recommendations(current_metrics, performance_score)
        
        # Trend analysis
        trends = self._analyze_trends(historical)
        
        return {
            "success": True,
            "performanceScore": performance_score,
            "currentMetrics": current_metrics,
            "trends": trends,
            "recommendations": recommendations,
            "status": self._get_status_label(performance_score),
            "timestamp": datetime.now().isoformat()
        }
    
    def _get_current_metrics(self):
        """Get current system metrics using psutil"""
        try:
            cpu_percent = psutil.cpu_percent(interval=0.1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            # Get process info
            process = psutil.Process()
            process_memory = process.memory_info()
            
            # Network I/O
            net_io = psutil.net_io_counters()
            
            return {
                "cpu": {
                    "percent": cpu_percent,
                    "cores": psutil.cpu_count(),
                    "status": "critical" if cpu_percent > self.thresholds['cpu_critical'] else 
                              "warning" if cpu_percent > self.thresholds['cpu_warning'] else "good"
                },
                "memory": {
                    "percent": memory.percent,
                    "used": memory.used,
                    "available": memory.available,
                    "total": memory.total,
                    "status": "critical" if memory.percent > self.thresholds['memory_critical'] else
                              "warning" if memory.percent > self.thresholds['memory_warning'] else "good"
                },
                "disk": {
                    "percent": disk.percent,
                    "used": disk.used,
                    "free": disk.free,
                    "total": disk.total
                },
                "process": {
                    "memoryRss": process_memory.rss,
                    "memoryVms": process_memory.vms
                },
                "network": {
                    "bytesSent": net_io.bytes_sent,
                    "bytesRecv": net_io.bytes_recv,
                    "packetsSent": net_io.packets_sent,
                    "packetsRecv": net_io.packets_recv
                }
            }
        except Exception as e:
            return {"error": str(e)}
    
    def _calculate_performance_score(self, metrics, requests, errors):
        """Calculate overall performance score (0-100)"""
        score = 100
        
        # CPU impact
        cpu = metrics.get('cpu', {}).get('percent', 0)
        if cpu > self.thresholds['cpu_critical']:
            score -= 30
        elif cpu > self.thresholds['cpu_warning']:
            score -= 15
        
        # Memory impact
        memory = metrics.get('memory', {}).get('percent', 0)
        if memory > self.thresholds['memory_critical']:
            score -= 25
        elif memory > self.thresholds['memory_warning']:
            score -= 10
        
        # Response time impact
        if requests:
            response_times = [r.get('duration', 0) for r in requests if 'duration' in r]
            if response_times:
                avg_response = statistics.mean(response_times)
                if avg_response > self.thresholds['response_time_critical']:
                    score -= 25
                elif avg_response > self.thresholds['response_time_warning']:
                    score -= 15
                elif avg_response > self.thresholds['response_time_good']:
                    score -= 5
        
        # Error rate impact
        if requests and errors:
            error_rate = len(errors) / len(requests) if requests else 0
            if error_rate > self.thresholds['error_rate_critical']:
                score -= 20
            elif error_rate > self.thresholds['error_rate_warning']:
                score -= 10
        
        return max(0, min(100, score))
    
    def _generate_recommendations(self, metrics, score):
        """Generate performance recommendations"""
        recommendations = []
        
        cpu = metrics.get('cpu', {}).get('percent', 0)
        memory = metrics.get('memory', {}).get('percent', 0)
        
        if cpu > self.thresholds['cpu_critical']:
            recommendations.append({
                "priority": "critical",
                "area": "CPU",
                "issue": f"CPU usage at {cpu:.1f}%",
                "action": "Scale horizontally or optimize CPU-intensive operations",
                "impact": "high"
            })
        elif cpu > self.thresholds['cpu_warning']:
            recommendations.append({
                "priority": "warning",
                "area": "CPU",
                "issue": f"CPU usage elevated at {cpu:.1f}%",
                "action": "Monitor closely and prepare scaling plan",
                "impact": "medium"
            })
        
        if memory > self.thresholds['memory_critical']:
            recommendations.append({
                "priority": "critical",
                "area": "Memory",
                "issue": f"Memory usage at {memory:.1f}%",
                "action": "Restart services or add memory immediately",
                "impact": "high"
            })
        elif memory > self.thresholds['memory_warning']:
            recommendations.append({
                "priority": "warning",
                "area": "Memory",
                "issue": f"Memory usage elevated at {memory:.1f}%",
                "action": "Check for memory leaks, consider garbage collection",
                "impact": "medium"
            })
        
        if score < 50:
            recommendations.append({
                "priority": "critical",
                "area": "Overall",
                "issue": f"Performance score critically low at {score}",
                "action": "Immediate investigation required",
                "impact": "high"
            })
        
        # Always add optimization tips
        if score >= 80:
            recommendations.append({
                "priority": "info",
                "area": "Optimization",
                "issue": "System performing well",
                "action": "Consider implementing caching for even better performance",
                "impact": "low"
            })
        
        return recommendations
    
    def _analyze_trends(self, historical):
        """Analyze performance trends from historical data"""
        if not historical or len(historical) < 2:
            return {"status": "insufficient_data", "message": "Need more historical data"}
        
        # Extract metrics over time
        cpu_trend = [h.get('cpu', 0) for h in historical]
        memory_trend = [h.get('memory', 0) for h in historical]
        response_trend = [h.get('responseTime', 0) for h in historical]
        
        return {
            "cpu": {
                "current": cpu_trend[-1] if cpu_trend else 0,
                "average": statistics.mean(cpu_trend) if cpu_trend else 0,
                "trend": self._calculate_trend(cpu_trend)
            },
            "memory": {
                "current": memory_trend[-1] if memory_trend else 0,
                "average": statistics.mean(memory_trend) if memory_trend else 0,
                "trend": self._calculate_trend(memory_trend)
            },
            "responseTime": {
                "current": response_trend[-1] if response_trend else 0,
                "average": statistics.mean(response_trend) if response_trend else 0,
                "trend": self._calculate_trend(response_trend)
            }
        }
    
    def _calculate_trend(self, values):
        """Calculate trend direction"""
        if len(values) < 2:
            return "stable"
        
        first_half = statistics.mean(values[:len(values)//2])
        second_half = statistics.mean(values[len(values)//2:])
        
        diff = second_half - first_half
        if diff > 5:
            return "increasing"
        elif diff < -5:
            return "decreasing"
        return "stable"
    
    def _get_status_label(self, score):
        """Get status label from score"""
        if score >= 90:
            return "excellent"
        elif score >= 75:
            return "good"
        elif score >= 50:
            return "fair"
        elif score >= 25:
            return "poor"
        return "critical"
    
    def optimize_queries(self, query_data):
        """Analyze and optimize database queries"""
        queries = query_data.get('queries', [])
        
        optimizations = []
        slow_queries = []
        
        for query in queries:
            duration = query.get('duration', 0)
            sql = query.get('query', query.get('sql', ''))
            
            if duration > 1000:  # > 1 second
                slow_queries.append({
                    "query": sql[:100] + "..." if len(sql) > 100 else sql,
                    "duration": duration,
                    "severity": "critical"
                })
                
                # Generate optimization suggestions
                suggestions = []
                sql_lower = sql.lower()
                
                if 'select *' in sql_lower:
                    suggestions.append("Avoid SELECT * - specify needed columns")
                if 'where' not in sql_lower:
                    suggestions.append("Add WHERE clause to filter results")
                if 'join' in sql_lower and 'index' not in sql_lower:
                    suggestions.append("Ensure JOIN columns are indexed")
                if 'order by' in sql_lower and duration > 2000:
                    suggestions.append("Consider adding index for ORDER BY column")
                if 'like' in sql_lower and '%' in sql:
                    suggestions.append("Leading wildcard LIKE queries can't use indexes")
                
                if suggestions:
                    optimizations.append({
                        "query": sql[:50] + "...",
                        "suggestions": suggestions
                    })
            elif duration > 500:
                slow_queries.append({
                    "query": sql[:100] + "..." if len(sql) > 100 else sql,
                    "duration": duration,
                    "severity": "warning"
                })
        
        return {
            "success": True,
            "summary": {
                "totalQueries": len(queries),
                "slowQueries": len(slow_queries),
                "optimizationsFound": len(optimizations)
            },
            "slowQueries": slow_queries[:10],
            "optimizations": optimizations[:10],
            "recommendations": [
                "Add database connection pooling",
                "Implement query caching for repeated queries",
                "Use database query analyzer for detailed insights"
            ] if slow_queries else ["All queries performing well"],
            "timestamp": datetime.now().isoformat()
        }
    
    def cache_recommendations(self, cache_data):
        """Generate caching recommendations"""
        endpoints = cache_data.get('endpoints', [])
        current_cache = cache_data.get('currentCache', {})
        
        recommendations = []
        
        for endpoint in endpoints:
            path = endpoint.get('path', '')
            hits = endpoint.get('hits', 0)
            avg_duration = endpoint.get('avgDuration', 0)
            is_cached = endpoint.get('cached', False)
            
            # High traffic, slow, not cached = good candidate
            if hits > 100 and avg_duration > 200 and not is_cached:
                recommendations.append({
                    "endpoint": path,
                    "priority": "high",
                    "reason": f"High traffic ({hits} hits) with slow response ({avg_duration}ms)",
                    "suggestedTTL": 300,  # 5 minutes
                    "estimatedImprovement": f"{min(90, avg_duration * 0.8):.0f}ms reduction"
                })
            elif hits > 50 and avg_duration > 100 and not is_cached:
                recommendations.append({
                    "endpoint": path,
                    "priority": "medium",
                    "reason": f"Moderate traffic with optimization potential",
                    "suggestedTTL": 180,  # 3 minutes
                    "estimatedImprovement": f"{min(50, avg_duration * 0.5):.0f}ms reduction"
                })
        
        # Sort by priority
        priority_order = {"high": 0, "medium": 1, "low": 2}
        recommendations.sort(key=lambda x: priority_order.get(x['priority'], 3))
        
        return {
            "success": True,
            "currentCacheStats": {
                "size": current_cache.get('size', 0),
                "hitRate": current_cache.get('hitRate', 0),
                "items": current_cache.get('items', 0)
            },
            "recommendations": recommendations[:10],
            "generalTips": [
                "Use Redis for distributed caching",
                "Implement cache warming for critical endpoints",
                "Set appropriate TTL based on data freshness needs"
            ],
            "timestamp": datetime.now().isoformat()
        }
    
    def load_test_analysis(self, test_results):
        """Analyze load test results"""
        requests = test_results.get('requests', [])
        errors = test_results.get('errors', [])
        config = test_results.get('config', {})
        
        if not requests:
            return {"success": False, "error": "No request data provided"}
        
        durations = [r.get('duration', 0) for r in requests]
        
        # Calculate statistics
        avg_duration = statistics.mean(durations)
        median_duration = statistics.median(durations)
        p95_duration = sorted(durations)[int(len(durations) * 0.95)] if durations else 0
        p99_duration = sorted(durations)[int(len(durations) * 0.99)] if durations else 0
        
        error_rate = len(errors) / len(requests) * 100 if requests else 0
        
        # Calculate throughput
        total_time = test_results.get('totalTime', 1)
        throughput = len(requests) / total_time if total_time > 0 else 0
        
        # Determine bottlenecks
        bottlenecks = []
        if avg_duration > 500:
            bottlenecks.append("High average response time")
        if p99_duration > avg_duration * 3:
            bottlenecks.append("High latency variance (P99 much higher than average)")
        if error_rate > 5:
            bottlenecks.append(f"High error rate: {error_rate:.1f}%")
        
        # Scaling recommendations
        target_rps = config.get('targetRps', 100)
        if throughput < target_rps * 0.8:
            scaling = "horizontal"
            scaling_reason = f"Current throughput ({throughput:.1f} RPS) below target ({target_rps} RPS)"
        else:
            scaling = "none"
            scaling_reason = "Current capacity sufficient"
        
        return {
            "success": True,
            "summary": {
                "totalRequests": len(requests),
                "successfulRequests": len(requests) - len(errors),
                "failedRequests": len(errors),
                "errorRate": round(error_rate, 2)
            },
            "latency": {
                "average": round(avg_duration, 2),
                "median": round(median_duration, 2),
                "p95": round(p95_duration, 2),
                "p99": round(p99_duration, 2)
            },
            "throughput": {
                "requestsPerSecond": round(throughput, 2),
                "target": target_rps
            },
            "bottlenecks": bottlenecks,
            "scaling": {
                "recommendation": scaling,
                "reason": scaling_reason
            },
            "timestamp": datetime.now().isoformat()
        }


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    optimizer = PerformanceOptimizer()
    
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
                result = optimizer.analyze_performance(input_data)
            elif task == "queries":
                result = optimizer.optimize_queries(input_data)
            elif task == "cache":
                result = optimizer.cache_recommendations(input_data)
            elif task == "loadtest":
                result = optimizer.load_test_analysis(input_data)
            elif task == "metrics":
                result = {"success": True, "metrics": optimizer._get_current_metrics()}
            elif task == "status" or task == "health":
                result = {"status": "healthy", "version": optimizer.model_version}
            else:
                result = {"error": f"Unknown task: {task}"}
            
            print(json.dumps(result))
        except Exception as e:
            import traceback
            print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))
    else:
        print(json.dumps({
            "engine": "Performance Optimizer",
            "version": optimizer.model_version,
            "tasks": ["analyze", "queries", "cache", "loadtest", "metrics"],
            "status": "healthy"
        }))
