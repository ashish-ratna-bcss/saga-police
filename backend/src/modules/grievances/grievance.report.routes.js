const express = require('express');
const { authorize } = require('../../middleware/auth.middleware');
const ctrl = require('./grievance.report.controller');

/**
 * Report routers for G / S / C / Q — owned by modules/grievances (Postgres).
 * Mounted at legacy paths so the frontend does not change yet.
 */

const withAuth = (router) => {
  router.use(authorize({ pages: ['/grievances', '/unified-reports'] }));
  return router;
};

const grievanceWorkflowRoutes = withAuth(express.Router());
grievanceWorkflowRoutes.get('/reports', ctrl.listGrievanceReports);
grievanceWorkflowRoutes.post('/reports', ctrl.createGrievanceReport);
grievanceWorkflowRoutes.get('/reports/:id', ctrl.getGrievanceReport);
grievanceWorkflowRoutes.put('/reports/:id', ctrl.updateGrievanceReport);
grievanceWorkflowRoutes.put('/reports/:id/share', ctrl.shareGrievanceReport);
grievanceWorkflowRoutes.put('/reports/:id/close', ctrl.closeGrievanceReport);
grievanceWorkflowRoutes.put('/reports/:id/status', ctrl.updateGrievanceReportStatus);
grievanceWorkflowRoutes.post('/reports/:id/generate-pdf', ctrl.generateGrievanceReportPdf);
grievanceWorkflowRoutes.get('/contacts', ctrl.listContacts);
grievanceWorkflowRoutes.post('/contacts', ctrl.addContact);
grievanceWorkflowRoutes.put('/contacts/:id', ctrl.updateContact);
grievanceWorkflowRoutes.delete('/contacts/:id', ctrl.deleteContact);

const suggestionRoutes = withAuth(express.Router());
suggestionRoutes.get('/reports', ctrl.listSuggestionReports);
suggestionRoutes.post('/reports', ctrl.createSuggestionReport);
suggestionRoutes.get('/reports/:id', ctrl.getSuggestionReport);
suggestionRoutes.put('/reports/:id/share', ctrl.shareSuggestionReport);
suggestionRoutes.post('/reports/:id/generate-pdf', ctrl.generateSuggestionReportPdf);
suggestionRoutes.get('/contacts', ctrl.listContacts);

const criticismRoutes = withAuth(express.Router());
criticismRoutes.get('/reports', ctrl.listCriticismReports);
criticismRoutes.post('/reports', ctrl.createCriticismReport);
criticismRoutes.get('/reports/:id', ctrl.getCriticismReport);
criticismRoutes.put('/reports/:id/share', ctrl.shareCriticismReport);
criticismRoutes.post('/reports/:id/generate-pdf', ctrl.generateCriticismReportPdf);
criticismRoutes.get('/contacts', ctrl.listContacts);
criticismRoutes.post('/contacts', ctrl.addContact);
criticismRoutes.put('/contacts/:id', ctrl.updateContact);
criticismRoutes.delete('/contacts/:id', ctrl.deleteContact);

const queryRoutes = withAuth(express.Router());
queryRoutes.get('/reports', ctrl.listQueryReports);
queryRoutes.post('/reports', ctrl.createQueryReport);
queryRoutes.get('/reports/:id', ctrl.getQueryReport);
queryRoutes.put('/reports/:id/share', ctrl.shareQueryReport);
queryRoutes.post('/reports/:id/generate-pdf', ctrl.generateQueryReportPdf);
queryRoutes.get('/contacts', ctrl.listContacts);

module.exports = {
  grievanceWorkflowRoutes,
  suggestionRoutes,
  criticismRoutes,
  queryRoutes,
};
