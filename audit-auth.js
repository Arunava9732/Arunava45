const bcrypt = require('bcryptjs');
const db = require('./backend/utils/database');

async function checkAdmin() {
    console.log('--- Auth Audit ---');
    const user = db.users.findOne({ email: 'hello@blackonn.com' });
    if (!user) {
        console.log('Error: Admin user not found');
        return;
    }
    
    console.log('Admin user found:', user.email);
    console.log('Role:', user.role);
    console.log('LockedUntil:', user.lockedUntil);
    console.log('FailedAttempts:', user.failedAttempts);
    
    // Check if the hash is valid
    const hash = user.password;
    console.log('Hash:', hash);
    
    // Test a common password if you want, but better to check if it's reachable
    const isValid = await bcrypt.compare('Admin@123', hash);
    console.log('Is Admin@123 valid?', isValid);
}

checkAdmin().then(() => process.exit());
