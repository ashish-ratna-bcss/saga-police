require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

async function main() {
    try {
        console.log('=== X (Twitter) Scraper API Test ===');
        if (process.env.MONGODB_URI) {
            await mongoose.connect(process.env.MONGODB_URI);
        }
        const xService = require('../src/services/rapidApiXService');
        const handle = process.argv[2] || 'elonmusk';
        console.log(`Testing X API for handle: ${handle}`);
        
        const result = await xService.fetchUserProfile(handle, { waitForCooldown: false, throwOnCooldown: true, timeoutMs: 15000 });
        if (result) {
            console.log('✅ API is working. Result (First 300 chars):');
            console.log(JSON.stringify(result, null, 2).substring(0, 300) + '...');
        } else {
            console.log('⚠️ API request completed but no user profile was returned.');
        }

        console.log('\n--- Quota Status ---');
        console.log(JSON.stringify(xService.getKeyHealthStatus(), null, 2));
    } catch (e) {
        console.error('❌ Error during API test:', e.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}
main();
