const bcrypt = require('bcryptjs');

async function createHashes() {
    const adminHash = await bcrypt.hash('admin123', 10);
    const userHash = await bcrypt.hash('user123', 10);
    
    console.log('Copy these hashes into routes/auth.js:');
    console.log('\nAdmin hash:');
    console.log(adminHash);
    console.log('\nUser hash:');
    console.log(userHash);
}

createHashes();