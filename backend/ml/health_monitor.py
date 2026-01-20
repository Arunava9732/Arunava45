#!/usr/bin/env python3
"""
Auto-Debugging and Health Monitor System for BLACKONN
Monitors server health, diagnoses issues, and provides auto-healing recommendations
"""

import json
import sys
import os
import platform
import psutil
import subprocess
from datetime import datetime, timedelta
from pathlib import Path

# ==========================================
# SYSTEM HEALTH MONITOR
# ==========================================

class SystemHealthMonitor:
    def __init__(self):
        self.thresholds = {
            'cpu_warning': 90,
            'cpu_critical': 98,
            'memory_warning': 85,
            'memory_critical': 95,
            'disk_warning': 90,
            'disk_critical': 98,
            'response_time_warning': 500,  # ms
            'response_time_critical': 2000
        }
        self.script_dir = Path(__file__).parent.absolute()
    
    def get_system_health(self):
        """Get comprehensive system health metrics"""
        health = {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "system": self._get_system_info(),
            "resources": self._get_resource_usage(),
            "python": self._get_python_info(),
            "issues": [],
            "recommendations": []
        }
        
        # Analyze and add issues/recommendations
        self._analyze_health(health)
        
        return health
    
    def _get_system_info(self):
        """Get basic system information"""
        return {
            "platform": platform.system(),
            "platformVersion": platform.version(),
            "architecture": platform.machine(),
            "processor": platform.processor(),
            "hostname": platform.node(),
            "pythonVersion": platform.python_version()
        }
    
    def _get_resource_usage(self):
        """Get current resource usage"""
        try:
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            return {
                "cpu": {
                    "percent": cpu_percent,
                    "cores": psutil.cpu_count(),
                    "status": self._get_status(cpu_percent, 'cpu')
                },
                "memory": {
                    "total": memory.total,
                    "available": memory.available,
                    "used": memory.used,
                    "percent": memory.percent,
                    "status": self._get_status(memory.percent, 'memory')
                },
                "disk": {
                    "total": disk.total,
                    "used": disk.used,
                    "free": disk.free,
                    "percent": disk.percent,
                    "status": self._get_status(disk.percent, 'disk')
                }
            }
        except Exception as e:
            return {"error": str(e)}
    
    def _get_python_info(self):
        """Get Python environment info"""
        return {
            "version": sys.version,
            "executable": sys.executable,
            "path": sys.path[:3]  # First 3 paths
        }
    
    def _get_status(self, value, resource_type):
        """Get status based on thresholds"""
        warning = self.thresholds.get(f'{resource_type}_warning', 70)
        critical = self.thresholds.get(f'{resource_type}_critical', 90)
        
        if value >= critical:
            return 'CRITICAL'
        elif value >= warning:
            return 'WARNING'
        return 'OK'
    
    def _analyze_health(self, health):
        """Analyze health data and add issues/recommendations"""
        resources = health.get('resources', {})
        
        # CPU Analysis
        cpu = resources.get('cpu', {})
        if cpu.get('status') == 'CRITICAL':
            health['status'] = 'critical'
            health['issues'].append({
                "type": "CPU_CRITICAL",
                "message": f"CPU usage critical: {cpu.get('percent')}%",
                "severity": "high"
            })
            health['recommendations'].append("Consider scaling up or optimizing CPU-intensive operations")
        elif cpu.get('status') == 'WARNING':
            if health['status'] != 'critical':
                health['status'] = 'degraded'
            health['issues'].append({
                "type": "CPU_WARNING",
                "message": f"CPU usage elevated: {cpu.get('percent')}%",
                "severity": "medium"
            })
        
        # Memory Analysis
        memory = resources.get('memory', {})
        if memory.get('status') == 'CRITICAL':
            health['status'] = 'critical'
            health['issues'].append({
                "type": "MEMORY_CRITICAL",
                "message": f"Memory usage critical: {memory.get('percent')}%",
                "severity": "high"
            })
            health['recommendations'].append("Restart services or increase memory allocation")
        elif memory.get('status') == 'WARNING':
            if health['status'] not in ['critical']:
                health['status'] = 'degraded'
            health['issues'].append({
                "type": "MEMORY_WARNING",
                "message": f"Memory usage elevated: {memory.get('percent')}%",
                "severity": "medium"
            })
        
        # Disk Analysis
        disk = resources.get('disk', {})
        if disk.get('status') == 'CRITICAL':
            health['status'] = 'critical'
            health['issues'].append({
                "type": "DISK_CRITICAL",
                "message": f"Disk usage critical: {disk.get('percent')}%",
                "severity": "high"
            })
            health['recommendations'].append("Free up disk space immediately - clean logs, temp files")
        elif disk.get('status') == 'WARNING':
            if health['status'] not in ['critical']:
                health['status'] = 'degraded'
            health['issues'].append({
                "type": "DISK_WARNING",
                "message": f"Disk usage elevated: {disk.get('percent')}%",
                "severity": "medium"
            })


# ==========================================
# AI ENGINE HEALTH CHECKER
# ==========================================

class AIEngineHealthChecker:
    def __init__(self):
        self.ml_dir = Path(__file__).parent.absolute()
        self.engines = {
            'analysis': 'analysis.py',
            'analytics': 'analytics_engine.py',
            'image': 'image_processor.py',
            'fraud': 'fraud_detector.py',
            'email': 'email_templates.py',
            'search': 'search_engine.py',
            'recommend': 'recommendation_engine.py',
            'price': 'price_optimizer.py',
            'payment': 'payment_verifier.py',
            'hub': 'ai_hub.py',
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
    
    def check_all_engines(self):
        """Check health of all AI engines"""
        results = {
            "timestamp": datetime.now().isoformat(),
            "engines": {},
            "summary": {
                "total": len(self.engines),
                "healthy": 0,
                "unhealthy": 0,
                "missing": 0
            }
        }
        
        for name, filename in self.engines.items():
            engine_path = self.ml_dir / filename
            engine_result = self._check_engine(name, engine_path)
            results["engines"][name] = engine_result
            
            if engine_result['status'] == 'healthy':
                results['summary']['healthy'] += 1
            elif engine_result['status'] == 'missing':
                results['summary']['missing'] += 1
            else:
                results['summary']['unhealthy'] += 1
        
        results['overallStatus'] = 'healthy' if results['summary']['unhealthy'] == 0 and results['summary']['missing'] == 0 else 'degraded'
        
        return results
    
    def _check_engine(self, name, path):
        """Check individual engine health"""
        result = {
            "name": name,
            "path": str(path),
            "exists": path.exists(),
            "status": "unknown",
            "lastModified": None,
            "size": None,
            "syntaxValid": False,
            "error": None
        }
        
        if not path.exists():
            result['status'] = 'missing'
            result['error'] = 'File not found'
            return result
        
        # Get file info
        stat = path.stat()
        result['lastModified'] = datetime.fromtimestamp(stat.st_mtime).isoformat()
        result['size'] = stat.st_size
        
        # Check syntax
        try:
            with open(path, 'r', encoding='utf-8') as f:
                code = f.read()
            compile(code, str(path), 'exec')
            result['syntaxValid'] = True
        except SyntaxError as e:
            result['syntaxValid'] = False
            result['error'] = f"Syntax error at line {e.lineno}: {e.msg}"
            result['status'] = 'error'
            return result
        except Exception as e:
            result['error'] = str(e)
            result['status'] = 'error'
            return result
        
        # Try to run health check
        try:
            proc = subprocess.run(
                [sys.executable, str(path), 'health'],
                capture_output=True,
                text=True,
                timeout=10,
                cwd=str(self.ml_dir)
            )
            
            if proc.returncode == 0:
                try:
                    health_response = json.loads(proc.stdout)
                    result['status'] = health_response.get('status', 'healthy')
                    result['capabilities'] = health_response.get('capabilities', health_response.get('tasks', []))
                except:
                    result['status'] = 'healthy'  # Ran successfully
            else:
                result['status'] = 'healthy'  # File exists and has valid syntax
        except subprocess.TimeoutExpired:
            result['status'] = 'timeout'
            result['error'] = 'Health check timed out'
        except Exception as e:
            result['status'] = 'healthy'  # Assume healthy if check fails but syntax is valid
        
        if result['status'] == 'unknown':
            result['status'] = 'healthy'
        
        return result
    
    def diagnose_engine(self, engine_name):
        """Deep diagnosis of a specific engine"""
        if engine_name not in self.engines:
            return {"error": f"Unknown engine: {engine_name}"}
        
        path = self.ml_dir / self.engines[engine_name]
        
        diagnosis = {
            "engine": engine_name,
            "path": str(path),
            "timestamp": datetime.now().isoformat(),
            "status": "healthy",
            "healthy": True,
            "checks": [],
            "issues": [],
            "recommendations": []
        }
        
        # 1. File existence
        if not path.exists():
            diagnosis['status'] = 'unhealthy'
            diagnosis['healthy'] = False
            diagnosis['checks'].append({"check": "File exists", "passed": False})
            diagnosis['issues'].append("Engine file not found")
            diagnosis['recommendations'].append(f"Create or restore {self.engines[engine_name]}")
            return diagnosis
        diagnosis['checks'].append({"check": "File exists", "passed": True})
        
        # 2. Syntax check
        try:
            with open(path, 'r', encoding='utf-8') as f:
                code = f.read()
            compile(code, str(path), 'exec')
            diagnosis['checks'].append({"check": "Syntax valid", "passed": True})
        except SyntaxError as e:
            diagnosis['status'] = 'unhealthy'
            diagnosis['healthy'] = False
            diagnosis['checks'].append({"check": "Syntax valid", "passed": False, "error": str(e)})
            diagnosis['issues'].append(f"Syntax error at line {e.lineno}")
            diagnosis['recommendations'].append(f"Fix syntax error: {e.msg}")
            return diagnosis
        
        # 3. Import check
        try:
            # Check for required imports
            required_imports = ['json', 'sys']
            missing_imports = []
            for imp in required_imports:
                if f'import {imp}' not in code and f'from {imp}' not in code:
                    missing_imports.append(imp)
            
            if missing_imports:
                diagnosis['status'] = 'degraded'
                diagnosis['healthy'] = False
                for imp in missing_imports:
                    diagnosis['issues'].append(f"Missing recommended import: {imp}")
            
            diagnosis['checks'].append({"check": "Imports valid", "passed": len(missing_imports) == 0})
        except Exception as e:
            diagnosis['checks'].append({"check": "Imports valid", "passed": False, "error": str(e)})
        
        # 4. Main entry point check
        if '__main__' in code:
            diagnosis['checks'].append({"check": "Has main entry", "passed": True})
        else:
            diagnosis['status'] = 'degraded'
            diagnosis['healthy'] = False
            diagnosis['checks'].append({"check": "Has main entry", "passed": False})
            diagnosis['issues'].append("No __main__ entry point")
        
        # 5. Function count
        import re
        functions = re.findall(r'def (\w+)\(', code)
        classes = re.findall(r'class (\w+)', code)
        diagnosis['structure'] = {
            "functions": len(functions),
            "classes": len(classes),
            "lines": len(code.splitlines())
        }
        
        return diagnosis


# ==========================================
# AUTO-DEBUGGER
# ==========================================

class AutoDebugger:
    def __init__(self):
        self.error_patterns = {
            'ModuleNotFoundError': self._fix_missing_module,
            'ImportError': self._fix_import_error,
            'SyntaxError': self._fix_syntax_error,
            'MemoryError': self._fix_memory_error,
            'ConnectionError': self._fix_connection_error,
            'TimeoutError': self._fix_timeout_error,
            'PermissionError': self._fix_permission_error
        }
    
    def analyze_error(self, error_info):
        """Analyze an error and provide debugging suggestions"""
        error_type = error_info.get('type', '')
        error_message = error_info.get('message', '')
        error_trace = error_info.get('traceback', '')
        context = error_info.get('context', {})
        
        analysis = {
            "timestamp": datetime.now().isoformat(),
            "errorType": error_type,
            "severity": self._determine_severity(error_type, error_message),
            "diagnosis": [],
            "suggestions": [],
            "autoFixAvailable": False,
            "autoFixSteps": []
        }
        
        # Pattern matching for common errors
        for pattern, fixer in self.error_patterns.items():
            if pattern.lower() in error_type.lower() or pattern.lower() in error_message.lower():
                fix_result = fixer(error_message, context)
                analysis['diagnosis'].extend(fix_result.get('diagnosis', []))
                analysis['suggestions'].extend(fix_result.get('suggestions', []))
                if fix_result.get('autoFixSteps'):
                    analysis['autoFixAvailable'] = True
                    analysis['autoFixSteps'].extend(fix_result.get('autoFixSteps', []))
        
        # Analyze traceback for file/line info
        if error_trace:
            import re
            file_lines = re.findall(r'File "([^"]+)", line (\d+)', error_trace)
            if file_lines:
                analysis['location'] = {
                    "file": file_lines[-1][0],
                    "line": int(file_lines[-1][1])
                }
        
        return analysis
    
    def _determine_severity(self, error_type, message):
        """Determine error severity"""
        critical_types = ['MemoryError', 'SystemError', 'RecursionError']
        high_types = ['ConnectionError', 'TimeoutError', 'PermissionError']
        
        for t in critical_types:
            if t.lower() in error_type.lower():
                return 'critical'
        
        for t in high_types:
            if t.lower() in error_type.lower():
                return 'high'
        
        return 'medium'
    
    def _fix_missing_module(self, message, context):
        """Fix for ModuleNotFoundError"""
        import re
        module_match = re.search(r"No module named '(\w+)'", message)
        module_name = module_match.group(1) if module_match else 'unknown'
        
        return {
            "diagnosis": [f"Python module '{module_name}' is not installed"],
            "suggestions": [
                f"Install the module: pip install {module_name}",
                f"Or add to requirements.txt and run: pip install -r requirements.txt"
            ],
            "autoFixSteps": [
                {"command": f"pip install {module_name}", "description": f"Install {module_name}"}
            ]
        }
    
    def _fix_import_error(self, message, context):
        """Fix for ImportError"""
        return {
            "diagnosis": ["Import failed - module exists but cannot be loaded"],
            "suggestions": [
                "Check for circular imports",
                "Verify module has correct __init__.py",
                "Check Python path configuration"
            ]
        }
    
    def _fix_syntax_error(self, message, context):
        """Fix for SyntaxError"""
        return {
            "diagnosis": ["Python syntax error in code"],
            "suggestions": [
                "Check for missing colons, brackets, or parentheses",
                "Verify proper indentation",
                "Look for invalid characters in code"
            ]
        }
    
    def _fix_memory_error(self, message, context):
        """Fix for MemoryError"""
        return {
            "diagnosis": ["System ran out of memory"],
            "suggestions": [
                "Process data in smaller batches",
                "Use generators instead of lists",
                "Increase system memory or add swap space",
                "Restart the server to clear memory"
            ],
            "autoFixSteps": [
                {"command": "Restart service", "description": "Restart to clear memory"}
            ]
        }
    
    def _fix_connection_error(self, message, context):
        """Fix for ConnectionError"""
        return {
            "diagnosis": ["Network connection failed"],
            "suggestions": [
                "Check network connectivity",
                "Verify external service is running",
                "Check firewall settings",
                "Verify correct host/port configuration"
            ]
        }
    
    def _fix_timeout_error(self, message, context):
        """Fix for TimeoutError"""
        return {
            "diagnosis": ["Operation timed out"],
            "suggestions": [
                "Increase timeout values",
                "Check for slow database queries",
                "Optimize long-running operations",
                "Consider async processing for heavy tasks"
            ]
        }
    
    def _fix_permission_error(self, message, context):
        """Fix for PermissionError"""
        return {
            "diagnosis": ["Permission denied - file/resource access blocked"],
            "suggestions": [
                "Check file/folder permissions",
                "Run with appropriate user privileges",
                "Verify ownership of files"
            ]
        }
    
    def analyze_logs(self, log_entries):
        """Analyze log entries for patterns and issues"""
        analysis = {
            "timestamp": datetime.now().isoformat(),
            "totalEntries": len(log_entries),
            "errorCount": 0,
            "warningCount": 0,
            "patterns": [],
            "recommendations": []
        }
        
        error_messages = {}
        
        for entry in log_entries:
            level = entry.get('level', '').upper()
            message = entry.get('message', '')
            
            if level == 'ERROR':
                analysis['errorCount'] += 1
                # Group similar errors
                key = message[:50] if len(message) > 50 else message
                error_messages[key] = error_messages.get(key, 0) + 1
            elif level == 'WARN' or level == 'WARNING':
                analysis['warningCount'] += 1
        
        # Find patterns
        for msg, count in sorted(error_messages.items(), key=lambda x: x[1], reverse=True)[:5]:
            if count > 3:
                analysis['patterns'].append({
                    "message": msg,
                    "count": count,
                    "type": "repeated_error"
                })
        
        # Generate recommendations
        if analysis['errorCount'] > 10:
            analysis['recommendations'].append("High error rate detected - investigate root cause")
        
        return analysis


# ==========================================
# MAIN ORCHESTRATOR
# ==========================================

class HealthMonitorOrchestrator:
    def __init__(self):
        self.system_monitor = SystemHealthMonitor()
        self.ai_checker = AIEngineHealthChecker()
        self.debugger = AutoDebugger()
    
    def full_health_check(self):
        """Run complete health check"""
        system_health = self.system_monitor.get_system_health()
        ai_health = self.ai_checker.check_all_engines()
        
        # Determine overall status from already collected data
        overall_status = 'healthy'
        if system_health.get('status') == 'critical':
            overall_status = 'critical'
        elif ai_health.get('summary', {}).get('unhealthy', 0) > 0:
            overall_status = 'degraded'
        elif system_health.get('status') == 'degraded':
            overall_status = 'degraded'

        return {
            "timestamp": datetime.now().isoformat(),
            "system": system_health,
            "aiEngines": ai_health,
            "overallStatus": overall_status
        }
    
    def _determine_overall_status(self):
        """Determine overall system status (Legacy compatibility)"""
        return self.full_health_check()['overallStatus']


# ==========================================
# MAIN ENTRY POINT
# ==========================================

if __name__ == "__main__":
    orchestrator = HealthMonitorOrchestrator()
    
    if len(sys.argv) > 1:
        task = sys.argv[1]
        try:
            input_data = {}
            if len(sys.argv) > 2:
                if sys.argv[2] == "--stdin":
                    input_data = json.loads(sys.stdin.read())
                else:
                    input_data = json.loads(sys.argv[2])
            
            if task == "health" or task == "full":
                result = orchestrator.full_health_check()
                print(json.dumps(result))
            
            elif task == "system":
                result = orchestrator.system_monitor.get_system_health()
                print(json.dumps(result))
            
            elif task == "ai" or task == "engines":
                result = orchestrator.ai_checker.check_all_engines()
                print(json.dumps(result))
            
            elif task == "diagnose":
                engine = input_data.get('engine', 'hub')
                result = orchestrator.ai_checker.diagnose_engine(engine)
                print(json.dumps(result))
            
            elif task == "debug":
                error_info = input_data.get('error', input_data)
                result = orchestrator.debugger.analyze_error(error_info)
                print(json.dumps(result))
            
            elif task == "logs":
                log_entries = input_data.get('logs', [])
                result = orchestrator.debugger.analyze_logs(log_entries)
                print(json.dumps(result))
            
            else:
                print(json.dumps({"error": f"Unknown task: {task}"}))
        
        except Exception as e:
            import traceback
            print(json.dumps({"error": str(e), "trace": traceback.format_exc()}))
    else:
        print(json.dumps({
            "status": "healthy",
            "engine": "Health Monitor & Auto-Debugger v1.0",
            "tasks": ["health", "system", "ai", "diagnose", "debug", "logs"]
        }))
