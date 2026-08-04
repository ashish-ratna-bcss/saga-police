// Backfill the Hyderabad/Telangana classification cache on every Content
// document. Safe to re-run — only items missing `classified_at` are touched.
//
// Usage:
//   node src/scripts/classify_hyderabad_content.js              # all events
//   node src/scripts/classify_hyderabad_content.js <event_id>   # one event
//
// Nominatim caps us at ~1 req/sec, so a large backfill takes a while. The
// resolver memoises duplicate lookups so repeat phrases are free.

require('dotenv').config();
const mongoose = require('mongoose');
const Content = require('../models/Content');
const { classifyContent } = require('../utils/hyderabadClassifier');

(async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    (() => {})('MONGODB_URI / MONGO_URI not set in env. Aborting.');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);

  const filter = {
    $or: [
      { location_classification: null },
      { 'location_classification.classified_at': null }
    ]
  };
  const eventId = process.argv[2];
  if (eventId) filter.event_ids = eventId;

  const total = await Content.countDocuments(filter);
  (() => {})(`Items to classify: ${total}`);

  const cursor = Content.find(filter)
    .select('id text scraped_content tags location media_location')
    .lean()
    .cursor();

  let done = 0;
  let positives = 0;
  for await (const doc of cursor) {
    try {
      const verdict = await classifyContent({
        text: doc.text,
        scraped: doc.scraped_content,
        tags: doc.tags,
        location: doc.location,
        media_location: doc.media_location
      });
      if (verdict.isRelated) positives++;
      await Content.updateOne(
        { id: doc.id },
        {
          $set: {
            location_classification: {
              is_telangana_related: !!verdict.isRelated,
              matched_location: verdict.matchedLocation || null,
              method: verdict.method || null,
              classified_at: new Date()
            }
          }
        }
      );
    } catch (err) {
      (() => {})(`[skip ${doc.id}]`, err.message);
    }
    done++;
    if (done % 25 === 0) {
      (() => {})(`  ${done}/${total} (positives=${positives})`);
    }
  }

  (() => {})(`Done. classified=${done}, telangana_related=${positives}`);
  await mongoose.disconnect();
})().catch((err) => {
  (() => {})('Backfill failed:', err);
  process.exit(1);
});
