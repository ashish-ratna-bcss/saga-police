require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

async function main() {
    try {
        console.log('=== YouTube API Test ===');
        if (process.env.MONGODB_URI) {
            await mongoose.connect(process.env.MONGODB_URI);
        }
        const ytService = require('../src/services/youtube.service');
        const query = process.argv[2] || 'Google';
        console.log(`Testing YouTube API by searching channels for: ${query}`);
        
        const result = await ytService.searchChannels(query, 1);
        if (result && result.length > 0) {
            console.log('✅ API is working. Result (First Channel):');
            console.log(JSON.stringify(result[0], null, 2));
        } else {
            console.log('⚠️ API request completed but no channels were returned.');
        }

        console.log('\n--- Quota Status ---');
        console.log(JSON.stringify(ytService.getKeyHealthStatus(), null, 2));
    } catch (e) {
        console.error('❌ Error during API test:', e.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}
main();
