/**
 * BLACKONN Agent API Routes
 * =========================
 * 
 * Express routes to control the Python AI Agent from Node.js
 * Provides endpoints for the frontend to interact with the agent.
 */

const express = require('express');
const router = express.Router();
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Agent process reference
let agentProcess = null;
let agentStatus = {
    running: false,
    mode: null,
    startedAt: null,
    lastActivity: null,
    pid: null
};

// Paths
const AGENT_SCRIPT = path.join(__dirname, '..', 'ml', 'blackonn_agent.py');
const AGENT_DATA_DIR = path.join(__dirname, '..', 'ml', 'agent_data');
const FIX_HISTORY_FILE = path.join(AGENT_DATA_DIR, 'fix_history.json');

// Ensure agent data directory exists
if (!fs.existsSync(AGENT_DATA_DIR)) {
    fs.mkdirSync(AGENT_DATA_DIR, { recursive: true });
}

/**
 * @route   GET /api/agent/status
 * @desc    Get agent status
 * @access  Public
 */
router.get('/status', (req, res) => {
    // Check if agent process is still alive
    if (agentProcess && agentStatus.running) {
        try {
            process.kill(agentProcess.pid, 0); // Test if process exists
        } catch (e) {
            agentStatus.running = false;
            agentStatus.pid = null;
            agentProcess = null;
        }
    }

    res.json({
        success: true,
        agent: {
            ...agentStatus,
            uptime: agentStatus.startedAt ? Date.now() - new Date(agentStatus.startedAt).getTime() : 0
        },
        capabilities: {
            claude: !!process.env.ANTHROPIC_API_KEY,
            gemini: !!process.env.GEMINI_API_KEY,
            openai: !!process.env.OPENAI_API_KEY
        },
        timestamp: new Date().toISOString()
    });
});

/**
 * @route   POST /api/agent/start
 * @desc    Start the AI agent
 * @access  Admin
 */
router.post('/start', async (req, res) => {
    try {
        const { mode = 'api', model } = req.body;

        if (agentStatus.running) {
            return res.status(400).json({
                success: false,
                error: 'Agent is already running',
                pid: agentStatus.pid
            });
        }

        // Build command arguments
        const args = [AGENT_SCRIPT, `--mode=${mode}`];
        if (model) args.push(`--model=${model}`);
        if (mode === 'api') args.push('--port=5050');

        // Resolve Python path
        let pythonPath = 'python';
        const venvPath = path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe');
        if (fs.existsSync(venvPath)) {
            pythonPath = venvPath;
        }

        console.log(`[AGENT] Spawning: ${pythonPath} ${args.join(' ')}`);
        fs.appendFileSync(path.join(__dirname, 'agent_debug.log'), `[${new Date().toISOString()}] Spawning: ${pythonPath} ${args.join(' ')}\n`);

        // Start Python agent process
        agentProcess = spawn(pythonPath, args, {
            cwd: path.dirname(AGENT_SCRIPT),
            env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
            stdio: ['pipe', 'pipe', 'pipe']
        });

        agentStatus = {
            running: true,
            mode: mode,
            startedAt: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            pid: agentProcess.pid
        };

        // Capture output
        let output = [];
        if (agentProcess.stdout) {
            agentProcess.stdout.on('data', (data) => {
                const line = data.toString();
                output.push(line);
                agentStatus.lastActivity = new Date().toISOString();
                console.log('[AGENT]', line.trim());
                fs.appendFileSync(path.join(__dirname, 'agent_debug.log'), `[${new Date().toISOString()}] AGENT OUT: ${line}\n`);
            });
        }

        if (agentProcess.stderr) {
            agentProcess.stderr.on('data', (data) => {
                const line = data.toString();
                console.error('[AGENT ERROR]', line.trim());
                fs.appendFileSync(path.join(__dirname, 'agent_debug.log'), `[${new Date().toISOString()}] AGENT ERROR: ${line}\n`);
            });
        }

        agentProcess.on('close', (code) => {
            console.log(`[AGENT] Process exited with code ${code}`);
            fs.appendFileSync(path.join(__dirname, 'agent_debug.log'), `[${new Date().toISOString()}] Agent exited with code ${code}\n`);
            agentStatus.running = false;
            agentStatus.lastErrorCode = code;
            agentProcess = null;
        });

        agentProcess.on('error', (err) => {
            console.error('[AGENT ERROR] Failed to start:', err);
            agentStatus.running = false;
            agentProcess = null;
        });

        // Wait a moment for startup
        await new Promise(resolve => setTimeout(resolve, 1000));

        if (!agentProcess) {
            throw new Error('Agent process failed to start or exited pre-maturely');
        }

        res.json({
            success: true,
            message: `Agent started in ${mode} mode`,
            pid: agentProcess.pid,
            status: agentStatus
        });

    } catch (error) {
        console.error('Failed to start agent:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   POST /api/agent/stop
 * @desc    Stop the AI agent
 * @access  Admin
 */
router.post('/stop', (req, res) => {
    try {
        if (!agentProcess || !agentStatus.running) {
            return res.status(400).json({
                success: false,
                error: 'Agent is not running'
            });
        }

        agentProcess.kill('SIGTERM');
        agentStatus.running = false;
        agentProcess = null;

        res.json({
            success: true,
            message: 'Agent stopped'
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   POST /api/agent/scan
 * @desc    Trigger error scan
 * @access  Public
 */
router.post('/scan', async (req, res) => {
    try {
        // Run agent in scan mode
        const result = await runAgentCommand(['--mode=scan']);
        res.json({
            success: true,
            output: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   POST /api/agent/fix
 * @desc    Trigger auto-fix cycle
 * @access  Admin
 */
router.post('/fix', async (req, res) => {
    try {
        const { model, unsafe } = req.body;
        const args = ['--mode=fix'];
        if (model) args.push(`--model=${model}`);
        if (unsafe) args.push('--unsafe');

        const result = await runAgentCommand(args);

        res.json({
            success: true,
            message: 'Fix cycle completed',
            output: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   POST /api/agent/rebuild
 * @desc    Trigger system rebuild
 * @access  Admin
 */
router.post('/rebuild', async (req, res) => {
    try {
        const result = await runAgentCommand(['--mode=rebuild']);
        res.json({
            success: true,
            message: 'System rebuild completed',
            output: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   POST /api/agent/analyze
 * @desc    Analyze a specific error
 * @access  Public
 */
router.post('/analyze', async (req, res) => {
    try {
        const { message, type, file_path, line_number, stack_trace } = req.body;

        if (!message) {
            return res.status(400).json({
                success: false,
                error: 'Error message is required'
            });
        }

        // If agent API is running, forward to it
        if (agentStatus.running && agentStatus.mode === 'api') {
            try {
                const fetch = require('node-fetch');
                const response = await fetch('http://localhost:5050/agent/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message, type, file_path, line_number, stack_trace })
                });
                const data = await response.json();
                return res.json({ success: true, analysis: data });
            } catch (e) {
                // Fall through to direct execution
            }
        }

        // Run analysis directly via CLI
        const errorJson = JSON.stringify({ message, type, file_path, line_number });
        // For now, return a placeholder - full analysis requires the agent API
        res.json({
            success: true,
            analysis: {
                message: 'Start the agent in API mode for full analysis',
                hint: 'POST /api/agent/start with {"mode": "api"}'
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   GET /api/agent/history
 * @desc    Get fix history
 * @access  Public
 */
router.get('/history', (req, res) => {
    try {
        let history = [];
        if (fs.existsSync(FIX_HISTORY_FILE)) {
            history = JSON.parse(fs.readFileSync(FIX_HISTORY_FILE, 'utf8'));
        }

        res.json({
            success: true,
            count: history.length,
            history: history.slice(-50).reverse() // Last 50, newest first
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * @route   DELETE /api/agent/history
 * @desc    Clear fix history
 * @access  Admin
 */
router.delete('/history', (req, res) => {
    try {
        if (fs.existsSync(FIX_HISTORY_FILE)) {
            fs.writeFileSync(FIX_HISTORY_FILE, '[]');
        }
        res.json({ success: true, message: 'History cleared' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Helper: Run agent command and capture output
 */
function runAgentCommand(args) {
    return new Promise((resolve, reject) => {
        const fullArgs = [AGENT_SCRIPT, ...args];
        
        exec(`python ${fullArgs.join(' ')}`, {
            cwd: path.dirname(AGENT_SCRIPT),
            env: { ...process.env },
            timeout: 60000 // 60 second timeout
        }, (error, stdout, stderr) => {
            if (error && !stdout) {
                reject(new Error(stderr || error.message));
                return;
            }
            resolve(stdout + (stderr ? `\nWarnings: ${stderr}` : ''));
        });
    });
}

module.exports = router;
