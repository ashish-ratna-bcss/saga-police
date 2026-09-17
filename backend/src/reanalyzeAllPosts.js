require('dotenv').config();
const { forEachTenant } = require('./lib/tenantDatabase.service');

async function run() {
  console.log('================================================================');
  console.log('🔄 STARTING FRESH RE-ANALYSIS RESET ACROSS ALL TENANTS');
  console.log('================================================================');

  await forEachTenant(async (prisma, dbName) => {
    console.log(`\n📂 Processing Tenant DB: ${dbName}`);

    // 1. Reset social_media_posts
    try {
      const postsCount = await prisma.social_media_posts.count();
      console.log(`  📊 Total catalog posts in DB: ${postsCount}`);

      const resetPosts = await prisma.social_media_posts.updateMany({
        where: {},
        data: {
          analysis_status: 'pending',
          analysis_attempts: 0,
          analysis_error: null,
          analysis_result: {},
          analyzed_at: null,
          image_analysis: null, // Cleared so image analysis (OCR on GPU) runs completely freshly
        },
      });
      console.log(`  ✅ Successfully reset ${resetPosts.count} posts to PENDING with FRESH image analysis.`);
    } catch (err) {
      console.error(`  ❌ Error resetting posts: ${err.message}`);
    }

    // 2. Reset social_media_event_media
    if (prisma.social_media_event_media) {
      try {
        const emCount = await prisma.social_media_event_media.count();
        console.log(`  📊 Total event media in DB: ${emCount}`);

        const resetEventMedia = await prisma.social_media_event_media.updateMany({
          where: {},
          data: {
            analysis_status: 'pending',
            analysis_attempts: 0,
            analysis_error: null,
            analysis_result: {},
            analyzed_at: null,
            image_analysis: null, // Cleared so image analysis (OCR on GPU) runs completely freshly
          },
        });
        console.log(`  ✅ Successfully reset ${resetEventMedia.count} event media to PENDING with FRESH image analysis.`);
      } catch (err) {
        if (!/does not exist|Unknown model/i.test(err.message)) {
          console.error(`  ❌ Error resetting event media: ${err.message}`);
        }
      }
    }
  });

  console.log('\n================================================================');
  console.log('🚀 ALL POSTS & EVENT MEDIA ARE NOW SET TO PENDING WITH FRESH OCR!');
  console.log('================================================================');
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error during reset:', err);
  process.exit(1);
});
