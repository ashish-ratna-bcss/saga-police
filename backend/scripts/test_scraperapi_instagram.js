require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

async function main() {
    try {
        console.log('=== Instagram Scraper API Test ===');
        if (process.env.MONGODB_URI) {
            await mongoose.connect(process.env.MONGODB_URI);
        }
        const igService = require('../src/services/rapidApiInstagramService');
        const handle = process.argv[2] || 'instagram';
        console.log(`Testing Instagram API for handle: ${handle}`);
        
        const result = await igService.fetchUserProfile(handle, { waitForCooldown: false, throwOnCooldown: true, timeoutMs: 15000 });
        if (result) {
            console.log('✅ API is working. Result (First 300 chars):');
            console.log(JSON.stringify(result, null, 2).substring(0, 300) + '...');
        } else {
            console.log('⚠️ API request completed but no user profile was returned.');
        }

        console.log('\n--- Quota Status ---');
        console.log(JSON.stringify(igService.getKeyHealthStatus(), null, 2));
    } catch (e) {
        console.error('❌ Error during API test:', e.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}
main();
