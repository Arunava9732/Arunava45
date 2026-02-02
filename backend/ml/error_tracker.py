#!/usr/bin/env python3
"""
Error Tracker Engine for BLACKONN
AI-powered error tracking, analysis, and auto-resolution
"""

import json
import sys
import re
from datetime import datetime, timedelta
from collections import defaultdict
import hashlib

# ==========================================
# ERROR TRACKER ENGINE
# ==========================================

class ErrorTrackerEngine:
    """AI-powered error tracking and analysis"""
    
    def __init__(self):
        self.model_version = "2.0.0"
        self.error_patterns = self._build_error_patterns()
        self.resolution_cache = {}
    
    def _build_error_patterns(self):
        """Build known error pattern database"""
        return {
            'database': {
                'patterns': [r'ECONNREFUSED', r'connection.*refused', r'database.*error', 
                            r'query.*failed', r'sql.*error', r'deadlock'],
                'category': 'Database',
                'severity': 'high',
                'common_fixes': [
                    "Check database connection string",
                    "Verify database server is running",
                    "Check connection pool configuration",
                    "Review query for syntax errors"
                ]
            },
            'network': {
                'patterns': [r'ETIMEDOUT', r'ENOTFOUND', r'socket.*hang', r'network.*error',
                            r'connection.*timeout', r'dns.*error'],
                'category': 'Network',
                'severity': 'high',
                'common_fixes': [
                    "Check network connectivity",
                    "Verify DNS resolution",
                    "Increase timeout settings",
                    "Check firewall rules"
                ]
            },
            'auth': {
                'patterns': [r'unauthorized', r'forbidden', r'401', r'403', r'jwt.*expired',
                            r'invalid.*token', r'authentication.*failed'],
                'category': 'Authentication',
                'severity': 'medium',
                'common_fixes': [
                    "Check authentication credentials",
                    "Refresh expired tokens",
                    "Verify API key validity",
                    "Check permission settings"
                ]
            },
            'memory': {
                'patterns': [r'heap.*out.*memory', r'memory.*allocation', r'oom', 
                            r'javascript.*heap', r'fatal.*error'],
                'category': 'Memory',
                'severity': 'critical',
                'common_fixes': [
                    "Increase Node.js heap size (--max-old-space-size)",
                    "Check for memory leaks",
                    "Implement pagination for large data",
                    "Restart application to clear memory"
                ]
            },
            'syntax': {
                'patterns': [r'syntaxerror', r'unexpected.*token', r'parse.*error',
                            r'invalid.*json', r'unterminated.*string'],
                'category': 'Syntax',
                'severity': 'medium',
                'common_fixes': [
                    "Check JSON/code syntax",
                    "Validate input data format",
                    "Review recent code changes",
                    "Use linter to find syntax issues"
                ]
            },
            'validation': {
                'patterns': [r'validation.*error', r'invalid.*input', r'required.*field',
                            r'type.*error', r'schema.*validation'],
                'category': 'Validation',
                'severity': 'low',
                'common_fixes': [
                    "Validate input data before processing",
                    "Check required fields are present",
                    "Verify data types match expected schema",
                    "Add input sanitization"
                ]
            },
            'file': {
                'patterns': [r'ENOENT', r'file.*not.*found', r'permission.*denied',
                            r'EACCES', r'no.*such.*file'],
                'category': 'File System',
                'severity': 'medium',
                'common_fixes': [
                    "Check file path exists",
                    "Verify file permissions",
                    "Create missing directories",
                    "Check disk space availability"
                ]
            },
            'rate_limit': {
                'patterns': [r'429', r'too.*many.*requests', r'rate.*limit', 
                            r'throttl', r'quota.*exceeded'],
                'category': 'Rate Limiting',
                'severity': 'medium',
                'common_fixes': [
                    "Implement request queuing",
                    "Add exponential backoff",
                    "Cache API responses",
                    "Contact API provider for limit increase"
                ]
            }
        }
    
    def track_error(self, error_data):
        """Track and analyze a single error"""
        message = error_data.get('message', '')
        stack = error_data.get('stack', error_data.get('trace', ''))
        error_type = error_data.get('type', error_data.get('name', 'UnknownError'))
        url = error_data.get('url', '')
        user_id = error_data.get('userId', '')
        
        # Generate error fingerprint for deduplication
        fingerprint = self._generate_fingerprint(error_type, message, stack)
        
        # Classify error
        classification = self._classify_error(message, stack, error_type)
        
        # Get resolution suggestions
        resolutions = self._get_resolutions(classification, message)
        
        # Calculate impact score
        impact = self._calculate_impact(error_data, classification)
        
        return {
            "success": True,
            "fingerprint": fingerprint,
            "classification": classification,
            "impact": impact,
            "resolutions": resolutions,
            "metadata": {
                "errorType": error_type,
                "message": message[:200] if message else None,
                "url": url,
                "userId": user_id,
                "trackedAt": datetime.now().isoformat()
            }
        }
    
    def _generate_fingerprint(self, error_type, message, stack):
        """Generate unique fingerprint for error deduplication"""
        # Normalize message (remove dynamic parts)
        normalized = re.sub(r'\d+', 'N', message)
        normalized = re.sub(r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}', 'UUID', normalized)
        normalized = re.sub(r'\b\d+\.\d+\.\d+\.\d+\b', 'IP', normalized)
        
        # Extract first meaningful stack line
        stack_line = ""
        if stack:
            lines = stack.split('\n')
            for line in lines[1:5]:
                if 'node_modules' not in line and line.strip():
                    stack_line = re.sub(r':\d+:\d+', ':L:C', line.strip())
                    break
        
        content = f"{error_type}:{normalized}:{stack_line}"
        return hashlib.md5(content.encode()).hexdigest()[:16]
    
    def _classify_error(self, message, stack, error_type):
        """Classify error into category"""
        combined = f"{error_type} {message} {stack}".lower()
        
        for pattern_name, pattern_info in self.error_patterns.items():
            for pattern in pattern_info['patterns']:
                if re.search(pattern, combined, re.IGNORECASE):
                    return {
                        "category": pattern_info['category'],
                        "severity": pattern_info['severity'],
                        "patternMatch": pattern_name,
                        "confidence": 0.8 + (0.1 if 'high' in pattern_info['severity'] else 0)
                    }
        
        # Default classification
        return {
            "category": "Unknown",
            "severity": "medium",
            "patternMatch": None,
            "confidence": 0.25
        }
    
    def _get_resolutions(self, classification, message):
        """Get resolution suggestions based on classification"""
        pattern_match = classification.get('patternMatch')
        
        if pattern_match and pattern_match in self.error_patterns:
            fixes = self.error_patterns[pattern_match]['common_fixes']
            return {
                "autoFixAvailable": False,
                "suggestions": fixes,
                "documentation": f"https://docs.blackonn.com/errors/{pattern_match}"
            }
        
        return {
            "autoFixAvailable": False,
            "suggestions": [
                "Review error message and stack trace",
                "Check application logs for context",
                "Search error message in knowledge base",
                "Escalate to development team if recurring"
            ],
            "documentation": None
        }
    
    def _calculate_impact(self, error_data, classification):
        """Calculate error impact score"""
        base_score = 50
        
        # Severity impact
        severity_scores = {'critical': 40, 'high': 30, 'medium': 15, 'low': 5}
        base_score += severity_scores.get(classification.get('severity', 'medium'), 15)
        
        # User impact
        if error_data.get('affectedUsers', 0) > 100:
            base_score += 20
        elif error_data.get('affectedUsers', 0) > 10:
            base_score += 10
        
        # Frequency impact
        if error_data.get('occurrences', 1) > 100:
            base_score += 15
        elif error_data.get('occurrences', 1) > 10:
            base_score += 8
        
        return {
            "score": min(100, base_score),
            "level": "critical" if base_score >= 80 else 
                    "high" if base_score >= 60 else 
                    "medium" if base_score >= 40 else "low",
            "requiresImmediate": base_score >= 80
        }
    
    def analyze_error_trends(self, errors_list):
        """Analyze error trends over time"""
        if not errors_list:
            return {"success": False, "error": "No errors provided"}
        
        # Group errors by fingerprint
        error_groups = defaultdict(list)
        category_counts = defaultdict(int)
        severity_counts = defaultdict(int)
        hourly_counts = defaultdict(int)
        
        for error in errors_list:
            tracked = self.track_error(error)
            fingerprint = tracked['fingerprint']
            category = tracked['classification']['category']
            severity = tracked['classification']['severity']
            
            error_groups[fingerprint].append(error)
            category_counts[category] += 1
            severity_counts[severity] += 1
            
            # Hourly distribution
            timestamp = error.get('timestamp', datetime.now().isoformat())
            try:
                hour = datetime.fromisoformat(timestamp.replace('Z', '+00:00')).hour
                hourly_counts[hour] += 1
            except:
                pass
        
        # Find most common errors
        top_errors = sorted(error_groups.items(), key=lambda x: len(x[1]), reverse=True)[:10]
        
        # Calculate trend
        total_errors = len(errors_list)
        critical_percentage = severity_counts['critical'] / total_errors * 100 if total_errors > 0 else 0
        
        return {
            "success": True,
            "summary": {
                "totalErrors": total_errors,
                "uniqueErrors": len(error_groups),
                "criticalPercentage": round(critical_percentage, 2)
            },
            "byCategory": dict(category_counts),
            "bySeverity": dict(severity_counts),
            "hourlyDistribution": dict(sorted(hourly_counts.items())),
            "topErrors": [
                {
                    "fingerprint": fp,
                    "count": len(errs),
                    "sample": errs[0].get('message', '')[:100]
                }
                for fp, errs in top_errors
            ],
            "recommendations": self._generate_trend_recommendations(category_counts, severity_counts),
            "timestamp": datetime.now().isoformat()
        }
    
    def _generate_trend_recommendations(self, categories, severities):
        """Generate recommendations based on error trends"""
        recommendations = []
        
        total = sum(severities.values())
        
        if severities.get('critical', 0) > total * 0.1:
            recommendations.append({
                "priority": "critical",
                "message": "High percentage of critical errors - immediate investigation required"
            })
        
        if categories.get('Database', 0) > total * 0.2:
            recommendations.append({
                "priority": "high",
                "message": "Many database errors - review connection handling and query optimization"
            })
        
        if categories.get('Network', 0) > total * 0.15:
            recommendations.append({
                "priority": "high",
                "message": "Network errors are frequent - check external service dependencies"
            })
        
        if categories.get('Memory', 0) > 0:
            recommendations.append({
                "priority": "critical",
                "message": "Memory errors detected - investigate memory leaks immediately"
            })
        
        if not recommendations:
            recommendations.append({
                "priority": "info",
                "message": "Error distribution looks normal - continue monitoring"
            })
        
        return recommendations
    
    def generate_error_report(self, errors_list, period='daily'):
        """Generate comprehensive error report"""
        trends = self.analyze_error_trends(errors_list)
        
        # Calculate error rate trend
        error_rate_status = "stable"
        if trends['summary']['totalErrors'] > 100:
            error_rate_status = "elevated"
        elif trends['summary']['totalErrors'] > 500:
            error_rate_status = "critical"
        
        # Generate executive summary
        summary_text = f"""
Error Report Summary ({period})
================================
Total Errors: {trends['summary']['totalErrors']}
Unique Error Types: {trends['summary']['uniqueErrors']}
Critical Errors: {trends['bySeverity'].get('critical', 0)} ({trends['summary']['criticalPercentage']}%)

Top Categories:
"""
        for cat, count in sorted(trends['byCategory'].items(), key=lambda x: x[1], reverse=True)[:5]:
            summary_text += f"  - {cat}: {count}\n"
        
        return {
            "success": True,
            "report": {
                "period": period,
                "generatedAt": datetime.now().isoformat(),
                "summary": trends['summary'],
                "status": error_rate_status,
                "categories": trends['byCategory'],
                "severities": trends['bySeverity'],
                "topErrors": trends['topErrors'],
                "recommendations": trends['recommendations'],
                "textSummary": summary_text.strip()
            }
        }
    
    def auto_resolve(self, error_data):
        """Attempt automatic resolution of error"""
        tracked = self.track_error(error_data)
        classification = tracked['classification']
        
        # Check if auto-resolution is possible
        can_auto_resolve = False
        resolution_steps = []
        
        pattern = classification.get('patternMatch')
        
        if pattern == 'validation':
            can_auto_resolve = True
            resolution_steps = [
                "Validate input data schema",
                "Return detailed validation errors to client",
                "Log validation failure for analysis"
            ]
        elif pattern == 'rate_limit':
            can_auto_resolve = True
            resolution_steps = [
                "Queue request for retry",
                "Apply exponential backoff (60 seconds)",
                "Cache response if available"
            ]
        elif pattern == 'auth' and 'expired' in error_data.get('message', '').lower():
            can_auto_resolve = True
            resolution_steps = [
                "Refresh authentication token",
                "Retry original request",
                "Update session with new token"
            ]
        
        return {
            "success": True,
            "canAutoResolve": can_auto_resolve,
            "resolutionSteps": resolution_steps,
            "manualSteps": tracked['resolutions']['suggestions'] if not can_auto_resolve else [],
            "classification": classification,
            "timestamp": datetime.now().isoformat()
        }


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    tracker = ErrorTrackerEngine()
    
    if len(sys.argv) > 1:
        task = sys.argv[1]
        try:
            input_data = {}
            if len(sys.argv) > 2:
                if sys.argv[2] == "--stdin":
                    input_data = json.loads(sys.stdin.read())
                else:
                    input_data = json.loads(sys.argv[2])
            
            if task == "track":
                result = tracker.track_error(input_data)
            elif task == "trends":
                result = tracker.analyze_error_trends(input_data.get('errors', []))
            elif task == "report":
                result = tracker.generate_error_report(
                    input_data.get('errors', []),
                    input_data.get('period', 'daily')
                )
            elif task == "resolve":
                result = tracker.auto_resolve(input_data)
            else:
                result = {"error": f"Unknown task: {task}"}
            
            print(json.dumps(result))
        except Exception as e:
            import traceback
            print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))
    else:
        print(json.dumps({
            "engine": "Error Tracker Engine",
            "version": tracker.model_version,
            "tasks": ["track", "trends", "report", "resolve"],
            "status": "ready"
        }))
