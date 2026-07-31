const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// One snapshot per (date_key, window_hours). Same-day re-generation upserts.
const soceyeReportSnapshotSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true },
  date_key: { type: String, required: true, index: true }, // YYYY-MM-DD in IST/local
  window_hours: { type: Number, required: true, default: 24 },
  generated_at: { type: Date, default: Date.now, index: true },
  date_range: {
    start: { type: Date, required: true },
    end: { type: Date, required: true }
  },
  // Full payload returned by generateLiveSoceyeReport(...)
  data: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

soceyeReportSnapshotSchema.index({ date_key: 1, window_hours: 1 }, { unique: true });
soceyeReportSnapshotSchema.index({ generated_at: -1 });

module.exports = mongoose.models.SoceyeReportSnapshot ||
  mongoose.model('SoceyeReportSnapshot', soceyeReportSnapshotSchema);
