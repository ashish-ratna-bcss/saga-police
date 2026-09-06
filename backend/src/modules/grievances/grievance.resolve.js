/**
 * Resolve catalog grievances for report sync helpers.
 * Lives in modules/grievances (Postgres catalog only).
 */
const prisma = require('../../../prisma/client');
const { getCatalogGrievance } = require('./grievance.service');
const { asJson } = require('./grievance.utils');

const asObject = (value, fallback = {}) => {
  const parsed = asJson(value, fallback);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
};

const wrapCatalogGrievance = (apiRow) => {
  const doc = {
    id: String(apiRow.id),
    store: 'catalog',
    platform: apiRow.platform,
    tweet_id: apiRow.tweet_id,
    tweet_url: apiRow.tweet_url || apiRow.url || null,
    post_date: apiRow.post_date,
    created_at: apiRow.created_at,
    posted_by: asObject(apiRow.posted_by),
    content: asObject(apiRow.content),
    engagement: asObject(apiRow.engagement),
    context: asObject(apiRow.context),
    complainant_phone: '',
    grievance_workflow: asObject(apiRow.grievance_workflow),
    suggestion: asObject(apiRow.suggestion),
    criticism: asObject(apiRow.criticism),
    query_workflow: asObject(apiRow.query_workflow),
    _isCatalog: true,
    markModified() {},
    async save() {
      if (!/^\d+$/.test(String(doc.id))) return;
      const context = {
        ...asObject(doc.context),
        grievance_workflow: doc.grievance_workflow || {},
        suggestion: doc.suggestion || {},
        criticism: doc.criticism || {},
        query_workflow: doc.query_workflow || {},
      };
      let classification = 'unclassified';
      let complaint_code = null;
      let workflow_status = 'received';
      if (doc.grievance_workflow?.unique_code) {
        classification = 'grievance';
        complaint_code = doc.grievance_workflow.unique_code;
        workflow_status = String(doc.grievance_workflow.status || 'pending').toLowerCase();
      } else if (doc.suggestion?.unique_code) {
        classification = 'suggestion';
        complaint_code = doc.suggestion.unique_code;
        workflow_status = 'pending';
      } else if (doc.criticism?.unique_code) {
        classification = 'criticism';
        complaint_code = doc.criticism.unique_code;
        workflow_status = 'pending';
      } else if (doc.query_workflow?.unique_code) {
        classification = 'query';
        complaint_code = doc.query_workflow.unique_code;
        workflow_status = 'pending';
      }
      await prisma.social_media_grievances.update({
        where: { id: BigInt(doc.id) },
        data: { classification, complaint_code, workflow_status, context },
      });
    },
  };
  return doc;
};

const findGrievanceDocForReport = async (grievanceId) => {
  const row = await getCatalogGrievance(String(grievanceId || '').trim());
  if (!row) return null;
  return wrapCatalogGrievance(row);
};

module.exports = {
  findGrievanceDocForReport,
  wrapCatalogGrievance,
};
