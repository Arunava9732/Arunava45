#!/usr/bin/env python3
"""
Security Manager Engine for BLACKONN
AI-powered security analysis, threat detection, and vulnerability scanning
"""

import json
import sys
import re
import hashlib
from datetime import datetime, timedelta
from collections import defaultdict
import ipaddress

# ==========================================
# SECURITY MANAGER ENGINE
# ==========================================

class SecurityManager:
    """AI-powered security management and threat detection"""
    
    def __init__(self):
        self.model_version = "2.0.0"
        self.threat_patterns = self._build_threat_patterns()
        self.risk_weights = {
            'injection': 10,
            'xss': 8,
            'auth_bypass': 9,
            'brute_force': 7,
            'dos': 8,
            'data_exposure': 9,
            'suspicious_ip': 5,
            'bot_activity': 4
        }
    
    def _build_threat_patterns(self):
        """Build threat detection patterns"""
        return {
            'sql_injection': [
                r"('|\"|;|--|\bor\b|\band\b).*?(=|<|>)",
                r"union.*select",
                r"drop\s+table",
                r"insert\s+into",
                r"delete\s+from",
                r"exec\s*\(",
                r"1\s*=\s*1",
                r"0\s*=\s*0"
            ],
            'xss': [
                r"<script[^>]*>",
                r"javascript:",
                r"on(load|error|click|mouse)",
                r"<iframe",
                r"<object",
                r"<embed",
                r"document\.cookie",
                r"window\.location"
            ],
            'path_traversal': [
                r"\.\./",
                r"\.\.\\",
                r"%2e%2e",
                r"\.\.%2f",
                r"/etc/passwd",
                r"c:\\windows"
            ],
            'command_injection': [
                r";\s*\w+",
                r"\|\s*\w+",
                r"`[^`]+`",
                r"\$\([^)]+\)",
                r"&{2}\s*\w+"
            ]
        }
    
    def analyze_request(self, request_data):
        """Analyze a single request for threats"""
        url = request_data.get('url', '')
        body = request_data.get('body', '')
        headers = request_data.get('headers', {})
        ip = request_data.get('ip', '')
        method = request_data.get('method', 'GET')
        
        threats = []
        risk_score = 0
        
        # Combine all input for analysis
        combined_input = f"{url} {json.dumps(body) if isinstance(body, dict) else body}"
        
        # Check for SQL injection
        for pattern in self.threat_patterns['sql_injection']:
            if re.search(pattern, combined_input, re.IGNORECASE):
                threats.append({
                    "type": "SQL_INJECTION",
                    "severity": "critical",
                    "pattern": pattern,
                    "location": "url/body"
                })
                risk_score += self.risk_weights['injection']
                break
        
        # Check for XSS
        for pattern in self.threat_patterns['xss']:
            if re.search(pattern, combined_input, re.IGNORECASE):
                threats.append({
                    "type": "XSS",
                    "severity": "high",
                    "pattern": pattern,
                    "location": "url/body"
                })
                risk_score += self.risk_weights['xss']
                break
        
        # Check for path traversal
        for pattern in self.threat_patterns['path_traversal']:
            if re.search(pattern, url, re.IGNORECASE):
                threats.append({
                    "type": "PATH_TRAVERSAL",
                    "severity": "high",
                    "pattern": pattern,
                    "location": "url"
                })
                risk_score += self.risk_weights['auth_bypass']
                break
        
        # Check headers for suspicious patterns
        user_agent = headers.get('user-agent', headers.get('User-Agent', ''))
        if self._is_suspicious_user_agent(user_agent):
            threats.append({
                "type": "SUSPICIOUS_BOT",
                "severity": "medium",
                "userAgent": user_agent[:100]
            })
            risk_score += self.risk_weights['bot_activity']
        
        # Determine action
        if risk_score >= 15:
            action = "BLOCK"
        elif risk_score >= 8:
            action = "FLAG"
        elif risk_score >= 4:
            action = "MONITOR"
        else:
            action = "ALLOW"
        
        return {
            "success": True,
            "riskScore": risk_score,
            "action": action,
            "threats": threats,
            "metadata": {
                "ip": ip,
                "method": method,
                "analyzedAt": datetime.now().isoformat()
            }
        }
    
    def _is_suspicious_user_agent(self, ua):
        """Check for suspicious user agents"""
        suspicious_patterns = [
            r'bot(?!tle)',
            r'crawler',
            r'spider',
            r'scraper',
            r'curl',
            r'wget',
            r'python-requests',
            r'go-http-client',
            r'nikto',
            r'sqlmap',
            r'nmap'
        ]
        
        ua_lower = ua.lower()
        for pattern in suspicious_patterns:
            if re.search(pattern, ua_lower):
                return True
        return False
    
    def analyze_traffic(self, traffic_data):
        """Analyze traffic patterns for threats"""
        requests = traffic_data.get('requests', [])
        time_window = traffic_data.get('timeWindowMinutes', 60)
        
        if not requests:
            return {"success": False, "error": "No traffic data provided"}
        
        # Group by IP
        ip_stats = defaultdict(lambda: {
            'requests': 0,
            'errors': 0,
            'unique_endpoints': set(),
            'methods': defaultdict(int),
            'threats': []
        })
        
        for req in requests:
            if not isinstance(req, dict):
                continue
            ip = req.get('ip', 'unknown')
            status = req.get('status', 200)
            endpoint = req.get('url', req.get('endpoint', ''))
            method = req.get('method', 'GET')
            
            ip_stats[ip]['requests'] += 1
            ip_stats[ip]['unique_endpoints'].add(endpoint)
            ip_stats[ip]['methods'][method] += 1
            
            if status >= 400:
                ip_stats[ip]['errors'] += 1
            
            # Check for threats
            analysis = self.analyze_request(req)
            if analysis['threats']:
                ip_stats[ip]['threats'].extend(analysis['threats'])
        
        # Identify suspicious IPs
        suspicious_ips = []
        blocked_recommendations = []
        
        for ip, stats in ip_stats.items():
            risk_factors = []
            ip_risk = 0
            
            # High request rate
            requests_per_minute = stats['requests'] / max(time_window, 1)
            if requests_per_minute > 100:
                risk_factors.append("Very high request rate")
                ip_risk += 30
            elif requests_per_minute > 30:
                risk_factors.append("High request rate")
                ip_risk += 15
            
            # High error rate
            error_rate = stats['errors'] / stats['requests'] if stats['requests'] > 0 else 0
            if error_rate > 0.5:
                risk_factors.append("High error rate")
                ip_risk += 20
            
            # Endpoint scanning
            if len(stats['unique_endpoints']) > 50:
                risk_factors.append("Endpoint scanning detected")
                ip_risk += 25
            
            # Threats detected
            if stats['threats']:
                risk_factors.append(f"{len(stats['threats'])} attack attempts")
                ip_risk += len(stats['threats']) * 10
            
            if ip_risk > 0:
                suspicious_entry = {
                    "ip": ip,
                    "riskScore": min(100, ip_risk),
                    "requests": stats['requests'],
                    "errorRate": round(error_rate * 100, 1),
                    "riskFactors": risk_factors
                }
                suspicious_ips.append(suspicious_entry)
                
                if ip_risk >= 50:
                    blocked_recommendations.append(ip)
        
        # Sort by risk
        suspicious_ips.sort(key=lambda x: x['riskScore'], reverse=True)
        
        return {
            "success": True,
            "summary": {
                "totalRequests": len(requests),
                "uniqueIPs": len(ip_stats),
                "suspiciousIPs": len(suspicious_ips),
                "recommendedBlocks": len(blocked_recommendations)
            },
            "suspiciousIPs": suspicious_ips[:20],
            "blockRecommendations": blocked_recommendations[:10],
            "timestamp": datetime.now().isoformat()
        }
    
    def vulnerability_scan(self, scan_config):
        """Perform vulnerability assessment"""
        endpoints = scan_config.get('endpoints', [])
        check_headers = scan_config.get('checkHeaders', True)
        check_ssl = scan_config.get('checkSSL', True)
        
        vulnerabilities = []
        
        # Security headers check
        if check_headers:
            headers_config = scan_config.get('headers', {})
            missing_headers = []
            
            required_headers = [
                'Content-Security-Policy',
                'X-Content-Type-Options',
                'X-Frame-Options',
                'X-XSS-Protection',
                'Strict-Transport-Security',
                'Referrer-Policy'
            ]
            
            for header in required_headers:
                if header not in headers_config:
                    missing_headers.append(header)
            
            if missing_headers:
                vulnerabilities.append({
                    "type": "MISSING_SECURITY_HEADERS",
                    "severity": "medium",
                    "details": f"Missing headers: {', '.join(missing_headers)}",
                    "recommendation": "Add security headers to all responses"
                })
        
        # Endpoint vulnerability assessment
        for endpoint in endpoints:
            path = endpoint.get('path', '')
            method = endpoint.get('method', 'GET')
            auth_required = endpoint.get('authRequired', False)
            
            # Check for sensitive endpoints without auth
            sensitive_patterns = [r'/admin', r'/api/users', r'/api/settings', r'/api/orders']
            for pattern in sensitive_patterns:
                if re.search(pattern, path, re.IGNORECASE) and not auth_required:
                    vulnerabilities.append({
                        "type": "MISSING_AUTHENTICATION",
                        "severity": "high",
                        "endpoint": path,
                        "recommendation": "Add authentication to sensitive endpoints"
                    })
                    break
            
            # Check for data exposure
            if method == 'GET' and 'password' in path.lower():
                vulnerabilities.append({
                    "type": "POTENTIAL_DATA_EXPOSURE",
                    "severity": "high",
                    "endpoint": path,
                    "recommendation": "Never expose passwords in URLs"
                })
        
        # Calculate overall security score
        severity_scores = {'critical': 25, 'high': 15, 'medium': 8, 'low': 3}
        total_deduction = sum(severity_scores.get(v['severity'], 5) for v in vulnerabilities)
        security_score = max(0, 100 - total_deduction)
        
        return {
            "success": True,
            "securityScore": security_score,
            "grade": self._get_security_grade(security_score),
            "vulnerabilities": vulnerabilities,
            "summary": {
                "critical": len([v for v in vulnerabilities if v['severity'] == 'critical']),
                "high": len([v for v in vulnerabilities if v['severity'] == 'high']),
                "medium": len([v for v in vulnerabilities if v['severity'] == 'medium']),
                "low": len([v for v in vulnerabilities if v['severity'] == 'low'])
            },
            "recommendations": self._generate_security_recommendations(vulnerabilities),
            "timestamp": datetime.now().isoformat()
        }
    
    def _get_security_grade(self, score):
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
    
    def _generate_security_recommendations(self, vulnerabilities):
        """Generate prioritized security recommendations"""
        recommendations = []
        
        vuln_types = set(v['type'] for v in vulnerabilities)
        
        if 'MISSING_AUTHENTICATION' in vuln_types:
            recommendations.append({
                "priority": "critical",
                "action": "Implement authentication on all sensitive endpoints",
                "impact": "Prevents unauthorized access to sensitive data"
            })
        
        if 'MISSING_SECURITY_HEADERS' in vuln_types:
            recommendations.append({
                "priority": "high",
                "action": "Configure security headers (CSP, HSTS, etc.)",
                "impact": "Mitigates XSS, clickjacking, and MITM attacks"
            })
        
        # General recommendations
        recommendations.append({
            "priority": "medium",
            "action": "Implement rate limiting on all endpoints",
            "impact": "Prevents brute force and DoS attacks"
        })
        
        recommendations.append({
            "priority": "medium",
            "action": "Enable request logging and monitoring",
            "impact": "Enables threat detection and forensics"
        })
        
        return recommendations
    
    def detect_brute_force(self, auth_data):
        """Detect brute force login attempts"""
        attempts = auth_data.get('attempts', [])
        threshold = auth_data.get('threshold', 5)
        time_window = auth_data.get('timeWindowMinutes', 15)
        
        if not attempts:
            return {"success": True, "detected": False, "message": "No data"}
        
        # Group by IP and username
        ip_attempts = defaultdict(list)
        user_attempts = defaultdict(list)
        
        cutoff_time = datetime.now() - timedelta(minutes=time_window)
        
        for attempt in attempts:
            ip = attempt.get('ip', '')
            username = attempt.get('username', '')
            success = attempt.get('success', False)
            timestamp = attempt.get('timestamp', datetime.now().isoformat())
            
            try:
                attempt_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            except:
                attempt_time = datetime.now()
            
            if attempt_time >= cutoff_time and not success:
                ip_attempts[ip].append(attempt)
                user_attempts[username].append(attempt)
        
        # Detect brute force patterns
        detected = []
        
        for ip, attempts_list in ip_attempts.items():
            if len(attempts_list) >= threshold:
                detected.append({
                    "type": "IP_BRUTE_FORCE",
                    "ip": ip,
                    "attempts": len(attempts_list),
                    "action": "BLOCK_IP"
                })
        
        for username, attempts_list in user_attempts.items():
            if len(attempts_list) >= threshold:
                # Check if from multiple IPs
                unique_ips = set(a.get('ip') for a in attempts_list)
                detected.append({
                    "type": "CREDENTIAL_STUFFING" if len(unique_ips) > 3 else "USER_BRUTE_FORCE",
                    "username": username,
                    "attempts": len(attempts_list),
                    "uniqueIPs": len(unique_ips),
                    "action": "LOCK_ACCOUNT" if len(unique_ips) <= 3 else "ALERT"
                })
        
        return {
            "success": True,
            "detected": len(detected) > 0,
            "attacks": detected,
            "summary": {
                "totalFailedAttempts": sum(len(a) for a in ip_attempts.values()),
                "suspiciousIPs": len([ip for ip, a in ip_attempts.items() if len(a) >= threshold]),
                "targetedUsers": len([u for u, a in user_attempts.items() if len(a) >= threshold])
            },
            "timestamp": datetime.now().isoformat()
        }
    
    def generate_security_report(self, report_data):
        """Generate comprehensive security report"""
        traffic = report_data.get('traffic', [])
        auth_attempts = report_data.get('authAttempts', [])
        endpoints = report_data.get('endpoints', [])
        period = report_data.get('period', 'daily')
        
        # Run all analyses
        traffic_analysis = self.analyze_traffic({'requests': traffic})
        brute_force = self.detect_brute_force({'attempts': auth_attempts})
        vuln_scan = self.vulnerability_scan({'endpoints': endpoints})
        
        # Calculate overall security posture
        security_score = vuln_scan['securityScore']
        
        # Deduct for active threats
        if traffic_analysis['summary']['suspiciousIPs'] > 0:
            security_score -= min(20, traffic_analysis['summary']['suspiciousIPs'] * 2)
        
        if brute_force['detected']:
            security_score -= len(brute_force['attacks']) * 5
        
        security_score = max(0, security_score)
        
        return {
            "success": True,
            "report": {
                "period": period,
                "generatedAt": datetime.now().isoformat(),
                "overallScore": security_score,
                "grade": self._get_security_grade(security_score),
                "trafficSecurity": {
                    "totalRequests": traffic_analysis['summary']['totalRequests'],
                    "suspiciousIPs": traffic_analysis['summary']['suspiciousIPs'],
                    "blockedRecommendations": traffic_analysis['summary']['recommendedBlocks']
                },
                "authenticationSecurity": {
                    "bruteForceDetected": brute_force['detected'],
                    "attacksDetected": len(brute_force.get('attacks', []))
                },
                "vulnerabilities": vuln_scan['summary'],
                "topThreats": (traffic_analysis.get('suspiciousIPs', [])[:5]),
                "recommendations": vuln_scan['recommendations']
            }
        }


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    manager = SecurityManager()
    
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
                result = manager.analyze_request(input_data)
            elif task == "traffic":
                result = manager.analyze_traffic(input_data)
            elif task == "scan":
                result = manager.vulnerability_scan(input_data)
            elif task == "brute-force":
                result = manager.detect_brute_force(input_data)
            elif task == "report":
                result = manager.generate_security_report(input_data)
            elif task == "status" or task == "health":
                result = {"status": "healthy", "version": manager.model_version}
            else:
                result = {"error": f"Unknown task: {task}"}
            
            print(json.dumps(result))
        except Exception as e:
            import traceback
            print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))
    else:
        print(json.dumps({
            "engine": "Security Manager",
            "version": manager.model_version,
            "tasks": ["analyze", "traffic", "scan", "brute-force", "report"],
            "status": "healthy"
        }))
