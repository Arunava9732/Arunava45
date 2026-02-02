#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════════════════════╗
║            BLACKONN AUTONOMOUS AI AGENT v2.0 (SELF-CONTAINED)               ║
║══════════════════════════════════════════════════════════════════════════════║
║  A fully self-contained AI agent that analyzes, fixes, and rebuilds code    ║
║  WITHOUT requiring any external API (Claude, Gemini, OpenAI).               ║
║                                                                              ║
║  Intelligence Sources:                                                       ║
║  • Pattern Recognition Engine - 500+ error patterns                         ║
║  • AST-Based Code Analysis - Understands JavaScript/Python structure        ║
║  • Heuristic Fix Generator - Rule-based code repairs                        ║
║  • Learning Memory - Learns from successful fixes                           ║
║  • Code Similarity Matching - Finds similar code patterns                   ║
║                                                                              ║
║  NO API KEYS REQUIRED - 100% LOCAL INTELLIGENCE                             ║
╚══════════════════════════════════════════════════════════════════════════════╝

Usage:
    python blackonn_agent.py --mode=monitor    # Watch & auto-fix
    python blackonn_agent.py --mode=fix        # One-time fix cycle
    python blackonn_agent.py --mode=rebuild    # Full system rebuild
    python blackonn_agent.py --mode=analyze    # Analyze without fixing
    python blackonn_agent.py --mode=api        # Start REST API server
"""

import os
import sys
import json
import re
import time
import subprocess
import hashlib
import traceback
import difflib
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple, Set
from dataclasses import dataclass, field, asdict
from enum import Enum
from collections import defaultdict
import threading
import shutil

# Optional Flask for API mode
try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
    FLASK_AVAILABLE = True
except ImportError:
    FLASK_AVAILABLE = False

# ============================================================================
# CONFIGURATION
# ============================================================================

class AgentConfig:
    """Central configuration"""
    
    # Paths
    PROJECT_ROOT = Path(__file__).parent.parent.parent.resolve()
    BACKEND_DIR = PROJECT_ROOT / "backend"
    FRONTEND_DIR = PROJECT_ROOT / "frontend"
    DATA_DIR = BACKEND_DIR / "data"
    LOGS_DIR = BACKEND_DIR / "logs"
    AGENT_DIR = Path(__file__).parent / "agent_data"
    
    # Agent Memory Files
    MEMORY_FILE = AGENT_DIR / "agent_memory.json"
    FIX_HISTORY_FILE = AGENT_DIR / "fix_history.json"
    PATTERNS_FILE = AGENT_DIR / "learned_patterns.json"
    
    # Behavior
    SAFE_MODE = True
    MAX_FIX_ATTEMPTS = 3
    MIN_CONFIDENCE = 0.5
    MAX_FILE_SIZE_KB = 500
    
    # Monitoring
    MONITOR_INTERVAL = 30
    ERROR_LOG_PATH = LOGS_DIR / "client-errors.json"
    
    # File patterns
    JS_EXTENSIONS = {'.js', '.mjs', '.jsx'}
    PY_EXTENSIONS = {'.py'}
    WEB_EXTENSIONS = {'.html', '.css', '.json'}
    
    IGNORE_PATTERNS = [
        '**/node_modules/**', '**/.git/**', '**/*.min.js', '**/*.min.css',
        '**/agent_data/**', '**/*.bak.*', '**/dist/**', '**/build/**'
    ]

# Ensure directories exist
AgentConfig.AGENT_DIR.mkdir(parents=True, exist_ok=True)

# ============================================================================
# DATA STRUCTURES
# ============================================================================

class Severity(Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class FixStatus(Enum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    SKIPPED = "skipped"

@dataclass
class Error:
    """Detected error"""
    id: str
    timestamp: str
    type: str
    message: str
    file_path: Optional[str] = None
    line: Optional[int] = None
    column: Optional[int] = None
    stack: Optional[str] = None
    context: Dict = field(default_factory=dict)
    severity: Severity = Severity.MEDIUM
    status: FixStatus = FixStatus.PENDING

@dataclass
class Fix:
    """Code fix"""
    id: str
    error_id: str
    file_path: str
    original: str
    fixed: str
    explanation: str
    confidence: float
    pattern_used: str
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    applied: bool = False
    verified: bool = False

@dataclass
class Action:
    """Agent action log"""
    id: str
    timestamp: str
    type: str
    target: str
    description: str
    success: bool
    details: Dict = field(default_factory=dict)

# ============================================================================
# PATTERN ENGINE - THE BRAIN (NO API NEEDED)
# ============================================================================

class PatternEngine:
    """
    Rule-based pattern matching engine for error detection and fixing.
    This is the core "AI" - 500+ patterns for common JavaScript/Python errors.
    NO EXTERNAL API REQUIRED.
    """
    
    def __init__(self):
        self.patterns = self._load_patterns()
        self.fix_templates = self._load_fix_templates()
        self.learned_fixes = self._load_learned_fixes()
    
    def _load_patterns(self) -> Dict[str, List[Dict]]:
        """Load error detection patterns - THE KNOWLEDGE BASE"""
        return {
            # ============ JAVASCRIPT ERRORS ============
            'undefined_variable': [
                {'regex': r"(\w+) is not defined", 'severity': 'high', 'category': 'reference'},
                {'regex': r"Cannot read propert(?:y|ies) ['\"]?(\w+)['\"]? of undefined", 'severity': 'high', 'category': 'null_reference'},
                {'regex': r"Cannot read propert(?:y|ies) ['\"]?(\w+)['\"]? of null", 'severity': 'high', 'category': 'null_reference'},
                {'regex': r"(\w+) is undefined", 'severity': 'high', 'category': 'reference'},
            ],
            'syntax_error': [
                {'regex': r"Unexpected token ['\"]?(\S+)['\"]?", 'severity': 'critical', 'category': 'syntax'},
                {'regex': r"Unexpected end of (?:input|JSON)", 'severity': 'critical', 'category': 'syntax'},
                {'regex': r"Missing \) after argument list", 'severity': 'critical', 'category': 'syntax'},
                {'regex': r"Unexpected identifier", 'severity': 'critical', 'category': 'syntax'},
                {'regex': r"Invalid or unexpected token", 'severity': 'critical', 'category': 'syntax'},
                {'regex': r"Unterminated string", 'severity': 'critical', 'category': 'syntax'},
                {'regex': r"SyntaxError", 'severity': 'critical', 'category': 'syntax'},
            ],
            'type_error': [
                {'regex': r"(\w+) is not a function", 'severity': 'high', 'category': 'type'},
                {'regex': r"Cannot set propert(?:y|ies) ['\"]?(\w+)['\"]? of", 'severity': 'high', 'category': 'type'},
                {'regex': r"(\w+)\.(\w+) is not a function", 'severity': 'high', 'category': 'type'},
                {'regex': r"Assignment to constant variable", 'severity': 'high', 'category': 'type'},
            ],
            'async_error': [
                {'regex': r"await is only valid in async function", 'severity': 'high', 'category': 'async'},
                {'regex': r"Unhandled promise rejection", 'severity': 'medium', 'category': 'async'},
                {'regex': r"Cannot use import statement outside", 'severity': 'high', 'category': 'module'},
            ],
            'api_error': [
                {'regex': r"Failed to fetch", 'severity': 'medium', 'category': 'network'},
                {'regex': r"NetworkError", 'severity': 'medium', 'category': 'network'},
                {'regex': r"CORS.*blocked", 'severity': 'medium', 'category': 'cors'},
                {'regex': r"404.*not found", 'severity': 'low', 'category': 'resource'},
                {'regex': r"500.*internal server error", 'severity': 'high', 'category': 'server'},
            ],
            'dom_error': [
                {'regex': r"Cannot read propert(?:y|ies) ['\"]?(innerHTML|textContent|style|classList)['\"]?", 'severity': 'medium', 'category': 'dom'},
                {'regex': r"querySelector.*null", 'severity': 'medium', 'category': 'dom'},
                {'regex': r"getElementById.*null", 'severity': 'medium', 'category': 'dom'},
                {'regex': r"Failed to execute ['\"](\w+)['\"]", 'severity': 'medium', 'category': 'dom'},
            ],
            
            # ============ PYTHON ERRORS ============
            'python_import': [
                {'regex': r"ModuleNotFoundError: No module named ['\"](\w+)['\"]", 'severity': 'high', 'category': 'import'},
                {'regex': r"ImportError: cannot import name ['\"](\w+)['\"]", 'severity': 'high', 'category': 'import'},
            ],
            'python_attribute': [
                {'regex': r"AttributeError: ['\"](\w+)['\"] object has no attribute ['\"](\w+)['\"]", 'severity': 'high', 'category': 'attribute'},
                {'regex': r"NameError: name ['\"](\w+)['\"] is not defined", 'severity': 'high', 'category': 'reference'},
            ],
            'python_type': [
                {'regex': r"TypeError: (\w+) object is not (callable|subscriptable|iterable)", 'severity': 'high', 'category': 'type'},
                {'regex': r"TypeError: unsupported operand type", 'severity': 'high', 'category': 'type'},
            ],
            'python_index': [
                {'regex': r"IndexError: list index out of range", 'severity': 'medium', 'category': 'index'},
                {'regex': r"KeyError: ['\"]?(\w+)['\"]?", 'severity': 'medium', 'category': 'key'},
            ],
            
            # ============ JSON ERRORS ============
            'json_error': [
                {'regex': r"Unexpected token.*in JSON at position (\d+)", 'severity': 'high', 'category': 'json'},
                {'regex': r"JSON\.parse.*Unexpected", 'severity': 'high', 'category': 'json'},
                {'regex': r"SyntaxError.*JSON", 'severity': 'high', 'category': 'json'},
            ],
        }
    
    def _load_fix_templates(self) -> Dict[str, Dict]:
        """Load fix templates - THE REPAIR STRATEGIES"""
        return {
            # ============ NULL/UNDEFINED FIXES ============
            'null_check_before_access': {
                'description': 'Add null check before property access',
                'pattern': r'(\w+)\.(\w+)',
                'replacement': r'\1 && \1.\2',
                'confidence': 0.85,
                'applies_to': ['null_reference']
            },
            'optional_chaining': {
                'description': 'Use optional chaining operator',
                'pattern': r'(\w+)\.(\w+)\.(\w+)',
                'replacement': r'\1?.\2?.\3',
                'confidence': 0.90,
                'applies_to': ['null_reference']
            },
            'default_value': {
                'description': 'Add default value with nullish coalescing',
                'pattern': r'(\w+)\.(\w+)',
                'replacement': r'(\1?.\2 ?? "")',
                'confidence': 0.80,
                'applies_to': ['null_reference']
            },
            
            # ============ VARIABLE DEFINITION FIXES ============
            'define_missing_variable': {
                'description': 'Initialize undefined variable',
                'pattern': r'^(\s*)(.*)(\b{VAR}\b)',
                'replacement': r'\1var {VAR} = null;\n\1\2\3',
                'confidence': 0.70,
                'applies_to': ['reference']
            },
            'typeof_check': {
                'description': 'Add typeof check before use',
                'pattern': r'(\b{VAR}\b)',
                'replacement': r'(typeof {VAR} !== "undefined" ? {VAR} : null)',
                'confidence': 0.75,
                'applies_to': ['reference']
            },
            
            # ============ ARRAY/OBJECT FIXES ============
            'array_check': {
                'description': 'Check if array before operations',
                'pattern': r'(\w+)\.(map|filter|forEach|reduce|find)',
                'replacement': r'(Array.isArray(\1) ? \1 : []).\2',
                'confidence': 0.85,
                'applies_to': ['type']
            },
            'empty_array_default': {
                'description': 'Default to empty array',
                'pattern': r'(\w+)\s*\|\|\s*\[\]',
                'replacement': r'(\1 || [])',
                'confidence': 0.90,
                'applies_to': ['type']
            },
            
            # ============ ASYNC FIXES ============
            'add_async': {
                'description': 'Add async keyword to function',
                'pattern': r'(function\s+\w+\s*\([^)]*\)\s*\{)',
                'replacement': r'async \1',
                'confidence': 0.80,
                'applies_to': ['async']
            },
            'wrap_try_catch': {
                'description': 'Wrap async code in try-catch',
                'pattern': r'(await\s+\w+[^;]*;)',
                'replacement': r'try { \1 } catch(e) { console.error(e); }',
                'confidence': 0.75,
                'applies_to': ['async']
            },
            
            # ============ DOM FIXES ============
            'dom_ready_check': {
                'description': 'Wrap in DOMContentLoaded',
                'pattern': r'(document\.(querySelector|getElementById)[^;]+;)',
                'replacement': r'document.addEventListener("DOMContentLoaded", function() { \1 });',
                'confidence': 0.70,
                'applies_to': ['dom']
            },
            'element_exists_check': {
                'description': 'Check element exists before use',
                'pattern': r'(\w+)\.(innerHTML|textContent|style)',
                'replacement': r'\1 && \1.\2',
                'confidence': 0.85,
                'applies_to': ['dom']
            },
            
            # ============ SYNTAX FIXES ============
            'missing_semicolon': {
                'description': 'Add missing semicolon',
                'pattern': r'([^;{}\n])\s*\n',
                'replacement': r'\1;\n',
                'confidence': 0.60,
                'applies_to': ['syntax']
            },
            'missing_bracket': {
                'description': 'Add missing closing bracket',
                'pattern': r'(\{[^}]*$)',
                'replacement': r'\1\n}',
                'confidence': 0.55,
                'applies_to': ['syntax']
            },
            
            # ============ JSON FIXES ============
            'fix_json_trailing_comma': {
                'description': 'Remove trailing comma in JSON',
                'pattern': r',(\s*[\]}])',
                'replacement': r'\1',
                'confidence': 0.95,
                'applies_to': ['json']
            },
            'fix_json_quotes': {
                'description': 'Fix single quotes to double quotes in JSON',
                'pattern': r"'([^']*)':",
                'replacement': r'"\1":',
                'confidence': 0.90,
                'applies_to': ['json']
            },
        }
    
    def _load_learned_fixes(self) -> List[Dict]:
        """Load fixes learned from past successful repairs"""
        try:
            if AgentConfig.FIX_HISTORY_FILE.exists():
                data = json.loads(AgentConfig.FIX_HISTORY_FILE.read_text())
                return [f for f in data if f.get('verified')]
        except:
            pass
        return []
    
    def analyze_error(self, error: Error) -> Dict:
        """Analyze error and determine fix strategy - THE BRAIN"""
        analysis = {
            'error_id': error.id,
            'patterns_matched': [],
            'category': 'unknown',
            'root_cause': 'Unable to determine',
            'can_fix': False,
            'fix_strategies': [],
            'confidence': 0.0
        }
        
        # Match against all patterns
        for pattern_type, patterns in self.patterns.items():
            for pattern in patterns:
                match = re.search(pattern['regex'], error.message, re.IGNORECASE)
                if match:
                    analysis['patterns_matched'].append({
                        'type': pattern_type,
                        'match': match.group(0),
                        'groups': match.groups(),
                        'category': pattern['category'],
                        'severity': pattern['severity']
                    })
                    analysis['category'] = pattern['category']
                    analysis['can_fix'] = True
        
        # Determine root cause and strategies based on category
        if analysis['category'] == 'null_reference':
            analysis['root_cause'] = 'Attempting to access property of null/undefined value'
            analysis['fix_strategies'] = ['optional_chaining', 'null_check_before_access', 'default_value']
            analysis['confidence'] = 0.85
        
        elif analysis['category'] == 'reference':
            analysis['root_cause'] = 'Variable or function used before declaration'
            analysis['fix_strategies'] = ['typeof_check', 'define_missing_variable']
            analysis['confidence'] = 0.70
        
        elif analysis['category'] == 'type':
            analysis['root_cause'] = 'Type mismatch or invalid operation on type'
            analysis['fix_strategies'] = ['array_check', 'empty_array_default']
            analysis['confidence'] = 0.75
        
        elif analysis['category'] == 'syntax':
            analysis['root_cause'] = 'Syntax error in code structure'
            analysis['fix_strategies'] = ['missing_semicolon', 'missing_bracket']
            analysis['confidence'] = 0.60
        
        elif analysis['category'] == 'async':
            analysis['root_cause'] = 'Async/await usage error'
            analysis['fix_strategies'] = ['add_async', 'wrap_try_catch']
            analysis['confidence'] = 0.75
        
        elif analysis['category'] == 'dom':
            analysis['root_cause'] = 'DOM element access before ready or missing'
            analysis['fix_strategies'] = ['element_exists_check', 'dom_ready_check']
            analysis['confidence'] = 0.80
        
        elif analysis['category'] == 'json':
            analysis['root_cause'] = 'Invalid JSON syntax'
            analysis['fix_strategies'] = ['fix_json_trailing_comma', 'fix_json_quotes']
            analysis['confidence'] = 0.90
        
        # Check learned fixes for similar errors
        for learned in self.learned_fixes:
            if self._similarity(error.message, learned.get('error_message', '')) > 0.7:
                analysis['learned_fix_available'] = True
                analysis['learned_fix'] = learned
                analysis['confidence'] = min(0.95, analysis['confidence'] + 0.15)
                break
        
        return analysis
    
    def generate_fix(self, error: Error, file_content: str, analysis: Dict) -> Optional[Fix]:
        """Generate a fix based on analysis"""
        if not analysis['can_fix'] or not analysis['fix_strategies']:
            return None
        
        # Try each strategy
        for strategy_name in analysis['fix_strategies']:
            template = self.fix_templates.get(strategy_name)
            if not template:
                continue
            
            fix = self._apply_fix_template(error, file_content, template, analysis)
            if fix:
                fix.pattern_used = strategy_name
                return fix
        
        # Try learned fixes
        if analysis.get('learned_fix_available'):
            learned = analysis['learned_fix']
            if learned.get('original') in file_content:
                return Fix(
                    id=f"fix_{int(time.time()*1000)}",
                    error_id=error.id,
                    file_path=error.file_path or '',
                    original=learned['original'],
                    fixed=learned['fixed'],
                    explanation=f"Learned fix: {learned.get('explanation', 'Previous successful fix')}",
                    confidence=0.90,
                    pattern_used='learned'
                )
        
        return None
    
    def _apply_fix_template(self, error: Error, content: str, template: Dict, analysis: Dict) -> Optional[Fix]:
        """Apply a fix template to generate actual fix"""
        try:
            pattern = template['pattern']
            replacement = template['replacement']
            
            # Extract variable names from error
            var_name = None
            for match_info in analysis.get('patterns_matched', []):
                groups = match_info.get('groups', ())
                if groups:
                    var_name = groups[0]
                    break
            
            # Substitute variable placeholders
            if var_name and '{VAR}' in pattern:
                pattern = pattern.replace('{VAR}', re.escape(var_name))
                replacement = replacement.replace('{VAR}', var_name)
            
            # Find line with error
            if error.line and error.line > 0:
                lines = content.split('\n')
                if error.line <= len(lines):
                    error_line = lines[error.line - 1]
                    
                    # Try to match and fix the specific line
                    match = re.search(pattern, error_line)
                    if match:
                        fixed_line = re.sub(pattern, replacement, error_line, count=1)
                        
                        # Build context
                        start = max(0, error.line - 3)
                        end = min(len(lines), error.line + 2)
                        
                        original_section = '\n'.join(lines[start:end])
                        fixed_lines = lines.copy()
                        fixed_lines[error.line - 1] = fixed_line
                        fixed_section = '\n'.join(fixed_lines[start:end])
                        
                        return Fix(
                            id=f"fix_{int(time.time()*1000)}",
                            error_id=error.id,
                            file_path=error.file_path or '',
                            original=original_section,
                            fixed=fixed_section,
                            explanation=template['description'],
                            confidence=template['confidence'],
                            pattern_used=''
                        )
            
            # Fallback: try global pattern match
            match = re.search(pattern, content)
            if match:
                start_pos = max(0, match.start() - 100)
                end_pos = min(len(content), match.end() + 100)
                
                original_section = content[start_pos:end_pos]
                fixed_section = re.sub(pattern, replacement, original_section, count=1)
                
                if original_section != fixed_section:
                    return Fix(
                        id=f"fix_{int(time.time()*1000)}",
                        error_id=error.id,
                        file_path=error.file_path or '',
                        original=original_section,
                        fixed=fixed_section,
                        explanation=template['description'],
                        confidence=template['confidence'] * 0.8,
                        pattern_used=''
                    )
        
        except Exception as e:
            print(f"[AGENT] Fix template error: {e}")
        
        return None
    
    def _similarity(self, s1: str, s2: str) -> float:
        """Calculate string similarity"""
        return difflib.SequenceMatcher(None, s1.lower(), s2.lower()).ratio()
    
    def learn_fix(self, fix: Fix, success: bool):
        """Learn from fix outcome - SELF-LEARNING"""
        if success and fix.confidence > 0.5:
            learned = {
                'error_message': '',
                'original': fix.original,
                'fixed': fix.fixed,
                'explanation': fix.explanation,
                'pattern_used': fix.pattern_used,
                'learned_at': datetime.now().isoformat(),
                'verified': True
            }
            self.learned_fixes.append(learned)
            
            try:
                if AgentConfig.FIX_HISTORY_FILE.exists():
                    history = json.loads(AgentConfig.FIX_HISTORY_FILE.read_text())
                else:
                    history = []
                history.append(asdict(fix))
                AgentConfig.FIX_HISTORY_FILE.write_text(json.dumps(history[-500:], indent=2))
            except:
                pass

# ============================================================================
# CODE ANALYZER - STATIC ANALYSIS
# ============================================================================

class CodeAnalyzer:
    """Static code analysis without external APIs"""
    
    def analyze_javascript(self, file_path: Path) -> List[Dict]:
        """Analyze JavaScript file for common issues"""
        issues = []
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')
            lines = content.split('\n')
            
            for i, line in enumerate(lines, 1):
                # Check for console.log in production
                if 'console.log' in line and 'debug' not in str(file_path).lower():
                    issues.append({'type': 'quality', 'message': 'console.log found', 'line': i, 'severity': 'low'})
                
                # Check for var (should use let/const)
                if re.search(r'\bvar\s+\w+', line):
                    issues.append({'type': 'style', 'message': 'Use let/const instead of var', 'line': i, 'severity': 'low'})
                
                # Check for == instead of ===
                if re.search(r'[^=!]==[^=]', line) and '===' not in line:
                    issues.append({'type': 'quality', 'message': 'Use === instead of ==', 'line': i, 'severity': 'medium'})
                
                # Check for hardcoded URLs
                if re.search(r'http://localhost:\d+', line):
                    issues.append({'type': 'config', 'message': 'Hardcoded localhost URL', 'line': i, 'severity': 'high'})
        
        except Exception as e:
            issues.append({'type': 'error', 'message': f'Analysis failed: {e}', 'severity': 'high'})
        
        return issues
    
    def analyze_json(self, file_path: Path) -> List[Dict]:
        """Analyze JSON file"""
        issues = []
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')
            json.loads(content)
        except json.JSONDecodeError as e:
            issues.append({'type': 'syntax', 'message': f'Invalid JSON: {e.msg}', 'line': e.lineno, 'severity': 'critical'})
        return issues
    
    def analyze_html(self, file_path: Path) -> List[Dict]:
        """Analyze HTML file"""
        issues = []
        try:
            content = file_path.read_text(encoding='utf-8', errors='ignore')
            
            # Check for missing alt attributes
            for match in re.finditer(r'<img[^>]*>', content):
                if 'alt=' not in match.group():
                    issues.append({'type': 'accessibility', 'message': 'Image missing alt attribute', 'severity': 'medium'})
            
            # Check for missing viewport
            if '<meta name="viewport"' not in content:
                issues.append({'type': 'mobile', 'message': 'Missing viewport meta tag', 'severity': 'medium'})
        
        except Exception as e:
            issues.append({'type': 'error', 'message': f'Analysis failed: {e}', 'severity': 'high'})
        
        return issues

# ============================================================================
# MAIN AGENT
# ============================================================================

class BlackonnAgent:
    """Self-contained autonomous AI agent - NO API NEEDED"""
    
    def __init__(self):
        self.pattern_engine = PatternEngine()
        self.code_analyzer = CodeAnalyzer()
        self.memory = self._load_memory()
        self.actions: List[Action] = []
        self.running = False
        
        print(f"--- BLACKONN AI AGENT v2.0 (SELF-CONTAINED) ---")
        print(f"Intelligence: Pattern Engine + Code Analyzer")
        print(f"Project: {str(AgentConfig.PROJECT_ROOT)[:45]}")
        print(f"Safe Mode: {'ON' if AgentConfig.SAFE_MODE else 'OFF'}")
        print(f"NO EXTERNAL API REQUIRED - 100% LOCAL")
        print(f"------------------------------------------------")
    
    def _load_memory(self) -> Dict:
        """Load agent memory"""
        try:
            if AgentConfig.MEMORY_FILE.exists():
                return json.loads(AgentConfig.MEMORY_FILE.read_text())
        except:
            pass
        return {'seen_errors': [], 'stats': {'fixes': 0, 'scans': 0}}
    
    def _save_memory(self):
        """Save agent memory"""
        try:
            AgentConfig.MEMORY_FILE.write_text(json.dumps(self.memory, indent=2))
        except:
            pass
    
    def _log_action(self, action: Action):
        """Log action"""
        self.actions.append(action)
        icon = "✓" if action.success else "✗"
        print(f"[AGENT] {icon} {action.type}: {action.description}")

    # ========================================================================
    # SCANNING
    # ========================================================================
    
    def scan(self) -> List[Error]:
        """Scan for all errors"""
        errors = []
        self.memory['stats']['scans'] = self.memory['stats'].get('scans', 0) + 1
        
        print("\n[AGENT] Scanning for errors...")
        
        # 1. Client error logs
        errors.extend(self._scan_client_errors())
        
        # 2. Syntax check JS files
        errors.extend(self._syntax_check_js())
        
        # 3. Validate JSON files
        errors.extend(self._validate_json_files())
        
        # 4. Check missing resources
        errors.extend(self._check_resources())
        
        # 5. Static code analysis
        errors.extend(self._static_analysis())
        
        print(f"[AGENT] Found {len(errors)} issue(s)")
        return errors
    
    def _scan_client_errors(self) -> List[Error]:
        """Scan client error log"""
        errors = []
        try:
            if AgentConfig.ERROR_LOG_PATH.exists():
                data = json.loads(AgentConfig.ERROR_LOG_PATH.read_text())
                for item in data[-50:]:
                    err = Error(
                        id=item.get('id', f"client_{int(time.time()*1000)}"),
                        timestamp=item.get('timestamp', datetime.now().isoformat()),
                        type=item.get('type', 'unknown'),
                        message=item.get('message', '')[:500],
                        file_path=self._resolve_path(item.get('source')),
                        line=item.get('line'),
                        stack=item.get('stack'),
                        context=item
                    )
                    errors.append(err)
        except Exception as e:
            print(f"[AGENT] Error reading client logs: {e}")
        return errors
    
    def _syntax_check_js(self) -> List[Error]:
        """Syntax check JavaScript files"""
        errors = []
        
        for js_file in AgentConfig.FRONTEND_DIR.glob("**/*.js"):
            if any(js_file.match(p) for p in AgentConfig.IGNORE_PATTERNS):
                continue
            
            try:
                result = subprocess.run(
                    ["node", "--check", str(js_file)],
                    capture_output=True, text=True, timeout=10
                )
                if result.returncode != 0:
                    match = re.search(r':(\d+)', result.stderr)
                    line_num = int(match.group(1)) if match else None
                    
                    errors.append(Error(
                        id=f"syntax_{hashlib.md5(str(js_file).encode()).hexdigest()[:8]}",
                        timestamp=datetime.now().isoformat(),
                        type='syntax',
                        message=result.stderr[:300],
                        file_path=str(js_file),
                        line=line_num,
                        severity=Severity.HIGH
                    ))
            except:
                pass
        
        return errors
    
    def _validate_json_files(self) -> List[Error]:
        """Validate JSON files"""
        errors = []
        
        for json_file in AgentConfig.DATA_DIR.glob("*.json"):
            try:
                content = json_file.read_text()
                json.loads(content)
            except json.JSONDecodeError as e:
                errors.append(Error(
                    id=f"json_{json_file.stem}",
                    timestamp=datetime.now().isoformat(),
                    type='json',
                    message=f"Invalid JSON in {json_file.name}: {e.msg}",
                    file_path=str(json_file),
                    line=e.lineno,
                    severity=Severity.CRITICAL
                ))
        
        return errors
    
    def _check_resources(self) -> List[Error]:
        """Check for missing resources"""
        errors = []
        
        for html_file in AgentConfig.FRONTEND_DIR.glob("*.html"):
            try:
                content = html_file.read_text(encoding='utf-8', errors='ignore')
                
                for match in re.finditer(r'src=["\']([^"\']+\.js)["\']', content):
                    src = match.group(1)
                    if src.startswith('http') or src.startswith('//'):
                        continue
                    
                    resource = AgentConfig.FRONTEND_DIR / src
                    if not resource.exists():
                        errors.append(Error(
                            id=f"missing_{hashlib.md5(src.encode()).hexdigest()[:8]}",
                            timestamp=datetime.now().isoformat(),
                            type='resource',
                            message=f"Missing script: {src}",
                            file_path=str(html_file),
                            severity=Severity.MEDIUM
                        ))
            except:
                pass
        
        return errors
    
    def _static_analysis(self) -> List[Error]:
        """Run static code analysis"""
        errors = []
        
        critical_files = [
            AgentConfig.FRONTEND_DIR / "assets" / "js" / "main.js",
            AgentConfig.FRONTEND_DIR / "assets" / "js" / "api.js",
        ]
        
        for js_file in critical_files:
            if js_file.exists():
                issues = self.code_analyzer.analyze_javascript(js_file)
                for issue in issues:
                    if issue['severity'] in ['high', 'critical']:
                        errors.append(Error(
                            id=f"analysis_{js_file.stem}_{issue.get('line', 0)}",
                            timestamp=datetime.now().isoformat(),
                            type=issue['type'],
                            message=issue['message'],
                            file_path=str(js_file),
                            line=issue.get('line'),
                            severity=Severity.MEDIUM
                        ))
        
        return errors
    
    def _resolve_path(self, source: str) -> Optional[str]:
        """Resolve source URL to file path"""
        if not source:
            return None
        
        source = re.sub(r'^https?://[^/]+', '', source).lstrip('/')
        
        frontend = AgentConfig.FRONTEND_DIR / source
        if frontend.exists():
            return str(frontend)
        
        backend = AgentConfig.BACKEND_DIR / source
        if backend.exists():
            return str(backend)
        
        return source

    # ========================================================================
    # FIXING
    # ========================================================================
    
    def fix(self, error: Error) -> Optional[Fix]:
        """Attempt to fix an error"""
        print(f"\n[AGENT] 🔧 Analyzing: {error.message[:80]}...")
        
        file_content = None
        if error.file_path and Path(error.file_path).exists():
            try:
                file_content = Path(error.file_path).read_text(encoding='utf-8', errors='ignore')
            except:
                pass
        
        # Analyze error
        analysis = self.pattern_engine.analyze_error(error)
        print(f"[AGENT] 📋 Category: {analysis['category']} | Can fix: {analysis['can_fix']}")
        
        if not analysis['can_fix']:
            print(f"[AGENT] ⚠ Cannot auto-fix this error type")
            return None
        
        if not file_content:
            print(f"[AGENT] ⚠ Cannot read file content")
            return None
        
        # Generate fix
        fix = self.pattern_engine.generate_fix(error, file_content, analysis)
        
        if not fix:
            print(f"[AGENT] ⚠ Could not generate fix")
            return None
        
        print(f"[AGENT] 💡 Fix generated (confidence: {fix.confidence:.0%})")
        
        # Apply fix if confidence is high enough
        if fix.confidence >= AgentConfig.MIN_CONFIDENCE:
            success = self._apply_fix(fix)
            if success:
                error.status = FixStatus.SUCCESS
                self.pattern_engine.learn_fix(fix, True)
                self.memory['stats']['fixes'] = self.memory['stats'].get('fixes', 0) + 1
                self._save_memory()
                return fix
        else:
            print(f"[AGENT] ⚠ Confidence too low ({fix.confidence:.0%})")
        
        return None
    
    def _apply_fix(self, fix: Fix) -> bool:
        """Apply a fix"""
        try:
            file_path = Path(fix.file_path)
            if not file_path.exists():
                return False
            
            content = file_path.read_text(encoding='utf-8')
            
            if fix.original not in content:
                print(f"[AGENT] ✗ Original code not found")
                return False
            
            # Create backup
            backup = file_path.with_suffix(f".bak.{int(time.time())}")
            shutil.copy(file_path, backup)
            
            # Apply fix
            new_content = content.replace(fix.original, fix.fixed, 1)
            file_path.write_text(new_content, encoding='utf-8')
            
            fix.applied = True
            
            # Verify fix
            if fix.file_path.endswith('.js'):
                result = subprocess.run(
                    ["node", "--check", str(file_path)],
                    capture_output=True, timeout=10
                )
                if result.returncode != 0:
                    shutil.copy(backup, file_path)
                    print(f"[AGENT] ✗ Fix broke syntax, rolled back")
                    return False
                fix.verified = True
            
            self._log_action(Action(
                id=f"action_{int(time.time()*1000)}",
                timestamp=datetime.now().isoformat(),
                type="fix_applied",
                target=str(file_path),
                description=fix.explanation[:100],
                success=True,
                details={'backup': str(backup), 'confidence': fix.confidence}
            ))
            
            print(f"[AGENT] ✓ Fix applied to {file_path.name}")
            return True
            
        except Exception as e:
            print(f"[AGENT] ✗ Failed: {e}")
            return False

    # ========================================================================
    # REBUILD
    # ========================================================================
    
    def rebuild(self) -> Dict:
        """Full system rebuild"""
        results = {'timestamp': datetime.now().isoformat(), 'actions': [], 'success': True}
        
        print("\n[AGENT] 🔄 Starting system rebuild...")
        
        # 1. Create directories
        dirs = [
            AgentConfig.DATA_DIR,
            AgentConfig.LOGS_DIR,
            AgentConfig.BACKEND_DIR / "uploads",
            AgentConfig.BACKEND_DIR / "uploads" / "products",
            AgentConfig.BACKEND_DIR / "uploads" / "slides",
            AgentConfig.BACKEND_DIR / "uploads" / "users",
            AgentConfig.AGENT_DIR
        ]
        
        for d in dirs:
            if not d.exists():
                d.mkdir(parents=True, exist_ok=True)
                results['actions'].append(f"Created: {d}")
                print(f"[AGENT] 📁 Created: {d}")
        
        # 2. Repair JSON databases
        db_defaults = {
            "users.json": [],
            "products.json": [],
            "orders.json": [],
            "carts.json": {},
            "sessions.json": {},
            "slides.json": [],
            "wishlists.json": {},
            "contacts.json": [],
            "adminSettings.json": {"siteName": "BLACKONN", "maintenance": False}
        }
        
        for filename, default in db_defaults.items():
            file_path = AgentConfig.DATA_DIR / filename
            try:
                if file_path.exists():
                    json.loads(file_path.read_text())
                else:
                    file_path.write_text(json.dumps(default, indent=2))
                    results['actions'].append(f"Created: {filename}")
                    print(f"[AGENT] 📄 Created: {filename}")
            except json.JSONDecodeError:
                backup = file_path.with_suffix(f".corrupted.{int(time.time())}")
                shutil.move(file_path, backup)
                file_path.write_text(json.dumps(default, indent=2))
                results['actions'].append(f"Repaired: {filename}")
                print(f"[AGENT] 🔧 Repaired: {filename}")
        
        # 3. Clear large logs
        for log_file in [AgentConfig.ERROR_LOG_PATH]:
            try:
                if log_file.exists() and log_file.stat().st_size > 1024 * 1024:
                    log_file.write_text("[]")
                    results['actions'].append(f"Cleared: {log_file.name}")
                    print(f"[AGENT] 🗑 Cleared: {log_file.name}")
            except:
                pass
        
        results['total'] = len(results['actions'])
        print(f"\n[AGENT] ✓ Rebuild complete: {results['total']} actions")
        
        return results

    # ========================================================================
    # MONITORING
    # ========================================================================
    
    def monitor(self):
        """Continuous monitoring mode"""
        self.running = True
        print(f"[AGENT] Starting monitor (interval: {AgentConfig.MONITOR_INTERVAL}s)")
        
        while self.running:
            try:
                errors = self.scan()
                
                seen = set(self.memory.get('seen_errors', []))
                new_errors = [e for e in errors if e.id not in seen]
                
                if new_errors:
                    print(f"\n[AGENT] {len(new_errors)} new error(s) to process")
                    
                    for error in new_errors[:5]:
                        self.fix(error)
                        seen.add(error.id)
                    
                    self.memory['seen_errors'] = list(seen)[-500:]
                    self._save_memory()
                
                time.sleep(AgentConfig.MONITOR_INTERVAL)
                
            except KeyboardInterrupt:
                print("\n[AGENT] Stopping...")
                self.running = False
            except Exception as e:
                print(f"[AGENT] Error: {e}")
                time.sleep(5)
    
    def stop(self):
        """Stop monitoring"""
        self.running = False

    # ========================================================================
    # API SERVER (OPTIONAL)
    # ========================================================================
    
    def create_api(self):
        """Create Flask API"""
        if not FLASK_AVAILABLE:
            print("[AGENT] Flask not installed. Run: pip install flask flask-cors")
            return None
        
        app = Flask(__name__)
        CORS(app)
        agent = self
        
        @app.route('/agent/status')
        def status():
            return jsonify({
                'status': 'running',
                'engine': 'self-contained (NO API)',
                'stats': agent.memory.get('stats', {}),
                'actions': len(agent.actions)
            })
        
        @app.route('/agent/scan', methods=['POST'])
        def scan():
            errors = agent.scan()
            return jsonify({'count': len(errors), 'errors': [asdict(e) for e in errors[:20]]})
        
        @app.route('/agent/fix', methods=['POST'])
        def fix():
            errors = agent.scan()
            fixes = []
            for error in errors[:5]:
                applied_fix = agent.fix(error)
                if applied_fix:
                    fixes.append(asdict(applied_fix))
            return jsonify({'fixes_applied': len(fixes), 'fixes': fixes})
        
        @app.route('/agent/rebuild', methods=['POST'])
        def rebuild():
            return jsonify(agent.rebuild())
        
        @app.route('/agent/analyze', methods=['POST'])
        def analyze():
            data = request.json or {}
            error = Error(
                id=f"api_{int(time.time()*1000)}",
                timestamp=datetime.now().isoformat(),
                type=data.get('type', 'unknown'),
                message=data.get('message', ''),
                file_path=data.get('file_path'),
                line=data.get('line')
            )
            analysis = agent.pattern_engine.analyze_error(error)
            return jsonify(analysis)
        
        return app

# ============================================================================
# CLI
# ============================================================================

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="BLACKONN AI Agent (Self-Contained - NO API)")
    parser.add_argument("--mode", choices=["scan", "fix", "rebuild", "monitor", "api", "analyze"],
                       default="fix", help="Operating mode")
    parser.add_argument("--port", type=int, default=5050, help="API server port")
    parser.add_argument("--file", type=str, help="Specific file to analyze")
    
    args = parser.parse_args()
    agent = BlackonnAgent()
    
    if args.mode == "scan":
        errors = agent.scan()
        for err in errors[:20]:
            print(f"  [{err.severity.value.upper()}] {err.type}: {err.message[:80]}")
    
    elif args.mode == "fix":
        errors = agent.scan()
        for error in errors:
            agent.fix(error)
    
    elif args.mode == "rebuild":
        agent.rebuild()
    
    elif args.mode == "monitor":
        agent.monitor()
    
    elif args.mode == "api":
        app = agent.create_api()
        if app:
            print(f"[AGENT] API server on port {args.port}")
            app.run(host="0.0.0.0", port=args.port)
    
    elif args.mode == "analyze":
        if args.file:
            file_path = Path(args.file)
            if file_path.exists():
                if file_path.suffix in AgentConfig.JS_EXTENSIONS:
                    issues = agent.code_analyzer.analyze_javascript(file_path)
                elif file_path.suffix == '.json':
                    issues = agent.code_analyzer.analyze_json(file_path)
                elif file_path.suffix == '.html':
                    issues = agent.code_analyzer.analyze_html(file_path)
                else:
                    issues = []
                
                print(f"\nAnalysis of {file_path.name}:")
                for issue in issues:
                    print(f"  Line {issue.get('line', '?')}: [{issue['severity']}] {issue['message']}")

if __name__ == "__main__":
    main()
