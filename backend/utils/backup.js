/**
 * Data Backup Utility for BLACKONN
 * Safely backs up all JSON data files to a backup directory with timestamps
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const BACKUP_ROOT = path.join(__dirname, '../backups');

function backupData() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(BACKUP_ROOT, timestamp);

    // Create backup root if it doesn't exist
    if (!fs.existsSync(BACKUP_ROOT)) {
      fs.mkdirSync(BACKUP_ROOT);
    }

    // Create timestamped folder
    fs.mkdirSync(backupDir);

    // Get all files in data dir
    const files = fs.readdirSync(DATA_DIR);
    let count = 0;

    files.forEach(file => {
      if (file.endsWith('.json')) {
        const sourcePath = path.join(DATA_DIR, file);
        const destPath = path.join(backupDir, file);
        fs.copyFileSync(sourcePath, destPath);
        count++;
      }
    });

    console.log(`✅ [Backup] Successfully backed up ${count} files to ${backupDir}`);
    
    // Clean up old backups (keep last 10)
    const backups = fs.readdirSync(BACKUP_ROOT)
      .map(name => ({ name, path: path.join(BACKUP_ROOT, name), time: fs.statSync(path.join(BACKUP_ROOT, name)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (backups.length > 10) {
      backups.slice(10).forEach(oldBackup => {
        fs.rmSync(oldBackup.path, { recursive: true, force: true });
        console.log(`🧹 [Backup] Cleaned up old backup: ${oldBackup.name}`);
      });
    }

    return { success: true, path: backupDir };
  } catch (error) {
    console.error('❌ [Backup] Failed to backup data:', error);
    return { success: false, error: error.message };
  }
}

// Export for use in scheduler or terminal
if (require.main === module) {
  backupData();
}

module.exports = { backupData };
