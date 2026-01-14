/**
 * BLACKONN Emergency System Repair Utility (CLI)
 * ============================================
 * 
 * Run this script to force a deep system rebuild and repair:
 * Command: node repair-system.js
 * 
 * Actions performed:
 * - Rebuilds missing directory structures (data, logs, uploads)
 * - Repairs corrupted database files with fallback templates
 * - Rotating/Clearing massive error logs
 * - Verifying environment integrity
 */

const { runAutoHealer } = require('./backend/utils/healthCheck');
const fs = require('fs');
const path = require('path');

async function emergencyRepair() {
    console.log('====================================================');
    console.log('   BLACKONN AI AGENT: EMERGENCY REPAIR INITIATED    ');
    console.log('====================================================');
    console.log(`[${new Date().toISOString()}] Analysing system state...`);

    try {
        const results = await runAutoHealer();
        
        console.log('\n--- Repair Summary ---');
        console.log(`Timestamp: ${results.timestamp}`);
        console.log(`Status: ${results.healingStatus}`);
        console.log(`Actions Attempted: ${results.actionsAttempted}`);
        console.log(`Actions Succeeded: ${results.actionsSucceeded}`);
        console.log(`Actions Failed: ${results.actionsFailed}`);
        
        if (results.actions.length > 0) {
            console.log('\n--- Actions Taken ---');
            results.actions.forEach(action => {
                console.log(`[${action.type}] ${action.target} -> ${action.success ? 'SUCCESS' : 'FAILED'}`);
            });
        }

        console.log('\n--- Final Recommendation ---');
        if (results.actionsFailed > 0) {
            console.log('Some actions failed. Please check file permissions or disk space.');
        } else {
            console.log('System is now stable. Restart the server using:');
            console.log('pm2 restart ecosystem.config.js OR npm start');
        }

    } catch (error) {
        console.error('\n[FATAL] Repair failed:', error.message);
        process.exit(1);
    }
    
    console.log('\n====================================================');
    console.log('             REPAIR COMPLETED SUCCESSFULLY          ');
    console.log('====================================================');
}

emergencyRepair();
