const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const contentSchema = new mongoose.Schema({
  id: {
    type: String,
    default: uuidv4,
    unique: true
  },
  source_id: {
    type: String,
    required: false,
    ref: 'Source'
  },
  platform: {
    type: String,
    enum: ['youtube', 'x', 'instagram', 'facebook'],
    required: true
  },
  content_type: {
    type: String,
    enum: ['post', 'reel', 'story', 'highlight', 'video', 'tweet'],
    default: 'post'
  },
  content_id: {
    type: String,
    required: true
  },
  content_url: {
    type: String,
    required: true
  },
  text: {
    type: String,
    required: true,
    default: ''
  },
  scraped_content: {
    type: String
  },
  media: {
    type: [
      {
        type: { type: String, enum: ['photo', 'video', 'animated_gif'], default: 'photo' },
        url: String,
        video_url: String,
        preview: String,
        preview_url: String,
        // Original Instagram CDN URLs (kept for availability checks)
        original_url: { type: String, default: null },
        original_video_url: { type: String, default: null },
        original_preview: { type: String, default: null },
        original_preview_url: { type: String, default: null },
        // S3 permanent copies (survive CDN expiry / author deletion)
        s3_url: { type: String, default: null },
        s3_key: { type: String, default: null },
        s3_preview: { type: String, default: null },
        s3_preview_key: { type: String, default: null }
      }
    ],
    default: []
  },
  // Whether all media items have been archived to S3
  is_media_archived: {
    type: Boolean,
    default: false
  },
  // ── Content Availability Tracking ─────────────────────────────
  // Whether the original post/reel/story has been deleted by the author
  is_deleted: {
    type: Boolean,
    default: false
  },
  deleted_at: {
    type: Date,
    default: null
  },
  // Whether the content has expired (e.g. Instagram stories after 24h)
  is_expired: {
    type: Boolean,
    default: false
  },
  expired_at: {
    type: Date,
    default: null
  },
  // Last time we checked if the original URL is still live
  last_availability_check: {
    type: Date,
    default: null
  },
  // Status of the content on the original platform
  availability_status: {
    type: String,
    enum: ['available', 'deleted', 'expired', 'unknown'],
    default: 'available'
  },
  is_repost: {
    type: Boolean,
    default: false
  },
  original_author: {
    type: String // For Reposts: The handle
  },
  original_author_name: {
    type: String
  },
  original_author_avatar: {
    type: String
  },
  quoted_content: {
    type: {
      text: String,
      author_name: String,
      author_handle: String,
      profile_image_url: String,
      media: [{
        type: { type: String, enum: ['photo', 'video', 'animated_gif'], default: 'photo' },
        url: String,
        video_url: String,
        preview: String,
        preview_url: String,
        original_url: { type: String, default: null },
        original_video_url: { type: String, default: null },
        original_preview: { type: String, default: null },
        original_preview_url: { type: String, default: null },
        s3_url: { type: String, default: null },
        s3_key: { type: String, default: null },
        s3_preview: { type: String, default: null },
        s3_preview_key: { type: String, default: null }
      }],
      created_at: Date
    },
    default: null
  },
  // URL Card Previews (link unfurling)
  url_cards: [{
    url: String,
    expanded_url: String,
    display_url: String,
    title: String,
    description: String,
    image: String
  }],
  author: {
    type: String,
    required: true
  },
  author_handle: {
    type: String,
    required: true
  },
  published_at: {
    type: Date,
    required: true
  },

  // Geotag / place info extracted from RapidAPI post payloads.
  // `name` is shown as a chip in the post UI; lat/lng/country are stored for
  // downstream map / analytics use.
  location: {
    type: {
      name: { type: String, default: null },
      address: { type: String, default: null },
      city: { type: String, default: null },
      country: { type: String, default: null },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      place_id: { type: String, default: null },
      // Origin of the location data — tells the UI whether to label it
      // "Posted from" (precise geotag) or "Author location" (profile string).
      // Values: 'tweet_place' | 'tweet_coordinates' | 'author_profile' |
      //         'instagram_post' | 'facebook_place' | 'media_exif'
      source: { type: String, default: null }
    },
    default: null
  },

  // Result of running every media item through the EXIF/GPS extraction
  // pipeline. Most social-media images have EXIF stripped so this will
  // typically settle at status='checked_no_gps'. When GPS *is* present we
  // also reverse-geocode to fill in name/city/country and copy the result
  // into the primary `location` field with source='media_exif'.
  // Status values:
  //   'pending'         — not yet processed
  //   'extracted'       — at least one media item had GPS
  //   'checked_no_gps'  — extraction ran but no GPS found
  //   'no_media'        — content has no images/videos to scan
  //   'failed'          — extraction errored (network, decode, etc.)
  media_location: {
    type: {
      status: { type: String, default: 'pending' },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      name: { type: String, default: null },
      source_media_url: { type: String, default: null },
      checked_at: { type: Date, default: null },
      error: { type: String, default: null }
    },
    default: () => ({ status: 'pending' })
  },

  // Optional linkage for event-based monitoring
  event_ids: {
    type: [String],
    default: []
  },

  // Ollama verdict on whether the post is actually about Hyderabad/
  // Telangana. Populated asynchronously after ingest by the event monitor +
  // a background sweeper. status='pending' = not yet checked (UI still
  // shows it); status='classified' + is_telangana_related=false →
  // candidate for hard-delete (the sweeper handles deletion separately).
  llm_verdict: {
    type: {
      status: { type: String, enum: ['pending', 'classified', 'failed', null], default: null },
      is_telangana_related: { type: Boolean, default: null },
      confidence: { type: Number, default: null },
      reasoning: { type: String, default: null },
      model: { type: String, default: null },
      attempts: { type: Number, default: 0 },
      classified_at: { type: Date, default: null }
    },
    default: null
  },

  // Hyderabad/Telangana relevance score (see utils/relevanceScorer.js).
  // Populated synchronously at ingest. Posts with priority='hidden' are
  // filtered out of the event dashboard by default.
  relevance: {
    type: {
      score: { type: Number, default: null },
      priority: { type: String, enum: ['high', 'medium', 'hidden', null], default: null },
      category: { type: String, default: null },
      detected_location: { type: String, default: null },
      reason: { type: String, default: null },
      matched_terms: { type: [String], default: [] },
      languages: { type: [String], default: [] },
      excluded: { type: Boolean, default: false },
      classified_at: { type: Date, default: null }
    },
    default: null
  },

  // Cached output of the Hyderabad/Telangana classifier (see
  // utils/hyderabadClassifier.js). Populated lazily on first event fetch so
  // repeat requests don't have to re-run Nominatim.
  location_classification: {
    type: {
      is_telangana_related: { type: Boolean, default: null },
      matched_location: { type: String, default: null },
      method: { type: String, default: null },
      classified_at: { type: Date, default: null }
    },
    default: null
  },
  // Video Metadata
  duration: { type: String }, // ISO 8601 duration
  thumbnails: {
    default: { url: String, width: Number, height: Number },
    medium: { url: String, width: Number, height: Number },
    high: { url: String, width: Number, height: Number }
  },
  tags: [String],
  category_id: String,

  // Intelligence & Risk
  risk_score: { type: Number, default: 0 }, // 0-100
  risk_level: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'low'
  },
  threat_intent: { type: String }, // e.g. Violence, Political, Neutral
  threat_reasons: [String],        // e.g. ["Detected 'kill'", "Violence detected"]
  risk_factors: [{
    keyword: String,
    weight: Number,
    category: String,
    context: String
  }],
  sentiment: {
    type: String,
    enum: ['positive', 'neutral', 'negative'],
    default: 'neutral'
  },

  engagement: {
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    retweets: { type: Number, default: 0 }
  },
  retweet_network: {
    last_synced_at: { type: Date, default: null },
    last_observed_retweet_count: { type: Number, default: 0 },
    unique_retweeter_count: { type: Number, default: 0 }
  },
  // Engagement History for Velocity Tracking
  engagement_history: [{
    timestamp: { type: Date, default: Date.now },
    views: Number,
    likes: Number,
    comments: Number
  }],
  raw_data: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

// NOTE: index will be migrated at runtime in backend/src/index.js (fixIndexes)
contentSchema.index({ platform: 1, content_id: 1 }, { unique: true });
contentSchema.index({ content_id: 1 }); // Standalone for $expr lookups
contentSchema.index({ platform: 1, source_id: 1, published_at: -1 });
contentSchema.index({ platform: 1, source_id: 1, content_id: 1 });
contentSchema.index({ source_id: 1, id: 1 }); // category/source -> content id pre-resolution
contentSchema.index({ 'risk_factors.keyword': 1, id: 1 }); // keyword -> content id pre-resolution
contentSchema.index({ platform: 1, risk_level: 1 });
contentSchema.index({ source_id: 1, risk_level: 1 });
contentSchema.index({ platform: 1, content_type: 1, published_at: -1 });
contentSchema.index({ platform: 1, source_id: 1, content_type: 1, published_at: -1 });
contentSchema.index({ event_ids: 1, published_at: -1 }); // Event dashboard pagination
contentSchema.index({ event_ids: 1, 'location_classification.is_telangana_related': 1, published_at: -1 });
contentSchema.index({ event_ids: 1, 'relevance.priority': 1, 'relevance.score': -1, published_at: -1 });
// Sweeper picks up unclassified / failed verdicts by this index.
contentSchema.index({ event_ids: 1, 'llm_verdict.status': 1, published_at: -1 });
contentSchema.index({ is_deleted: 1 });
contentSchema.index({ published_at: -1 }); // General sort index for unfiltered listings

module.exports = mongoose.model('Content', contentSchema);
