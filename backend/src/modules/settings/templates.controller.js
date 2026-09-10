const templateService = require('./template.service');
const {
  listTemplates,
  getTemplate: getTemplateDoc,
  createTemplate,
  updateTemplateContent: saveTemplateContent,
  setDefaultTemplate: markDefaultTemplate,
  deleteTemplate: removeTemplate,
} = require('./settings.service');
const logger = require('../../lib/logger');

/**
 * Parse DOCX file to HTML
 * POST /api/templates/parse
 */
const parseTemplate = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const html = await templateService.parseDocxToHtml(req.file.buffer);
    res.json({ html });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Upload and save template
 * POST /api/templates/upload
 */
const uploadTemplate = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { name, platform = 'all', is_default = false } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Template name is required' });
    }

    const html = await templateService.parseDocxToHtml(req.file.buffer);

    const template = await createTemplate({
      name: name.trim(),
      platform,
      html_content: html,
      is_default: is_default === 'true' || is_default === true,
      created_by: req.user?.id,
      db: req.tenantPrisma,
    });

    res.status(201).json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get all templates
 * GET /api/templates
 */
const getTemplates = async (req, res) => {
  try {
    const templates = await listTemplates({ db: req.tenantPrisma });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get single template
 * GET /api/templates/:id
 */
const getTemplate = async (req, res) => {
  try {
    const template = await getTemplateDoc(req.params.id, { db: req.tenantPrisma });
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(template);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Update template content
 * PUT /api/templates/:id/content
 */
const updateTemplateContent = async (req, res) => {
  try {
    const { html_content } = req.body;

    if (!html_content) {
      return res.status(400).json({ error: 'HTML content is required' });
    }

    const template = await saveTemplateContent(req.params.id, html_content, {
      db: req.tenantPrisma,
    });
    res.json(template);
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.status(500).json({ error: error.message });
  }
};

/**
 * Set template as default for a platform
 * PUT /api/templates/:id/default
 */
const setDefaultTemplate = async (req, res) => {
  try {
    const updated = await markDefaultTemplate(req.params.id, {
      db: req.tenantPrisma,
    });
    if (!updated) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Delete template
 * DELETE /api/templates/:id
 */
const deleteTemplate = async (req, res) => {
  try {
    const ok = await removeTemplate(req.params.id, { db: req.tenantPrisma });
    if (!ok) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ message: 'Template deleted', id: req.params.id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Preview template with interpolation placeholders replaced
 * POST /api/templates/:id/preview
 */
const previewTemplate = async (req, res) => {
  try {
    const template = await getTemplateDoc(req.params.id, { db: req.tenantPrisma });
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      html: template.html_content,
      name: template.name,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Generate template with report data interpolation
 * POST /api/templates/:templateId/generate/:alertId
 * Retired: depended on Mongo Alert / Report / Content documents.
 */
const generateTemplate = async (_req, res) => {
  return res.status(410).json({
    error: 'Template generate-from-Mongo-alert is retired. Use Postgres report flows.',
  });
};

module.exports = {
  parseTemplate,
  uploadTemplate,
  getTemplates,
  getTemplate,
  updateTemplateContent,
  setDefaultTemplate,
  deleteTemplate,
  previewTemplate,
  generateTemplate,
};
