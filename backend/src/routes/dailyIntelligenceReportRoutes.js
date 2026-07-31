const express = require('express');
const router = express.Router();
const dailyIntelligenceReportService = require('../services/dailyIntelligenceReportService');
const { generateDailyIntelligenceReportPdf } = require('../services/dailyIntelligenceReportPdfService');
const { protect } = require('../middleware/authMiddleware');
const {
    loadUserPermissions,
    hasPageAccess,
    denyPageAccess
} = require('../middleware/rbacMiddleware');

const requireReportsAccess = (req, res, next) => {
    if (hasPageAccess(req, '/reports') || 
        hasPageAccess(req, '/unified-reports') || 
        hasPageAccess(req, '/daily-intelligence')) {
        return next();
    }
    return denyPageAccess(res, ['/reports', '/unified-reports', '/daily-intelligence']);
};

router.use(protect, loadUserPermissions, requireReportsAccess);

router.post('/generate', async (req, res) => {
    try {
        const { targetDate } = req.body;
        const report = await dailyIntelligenceReportService.generateDailyIntelligenceReport(targetDate);
        res.status(201).json({
            success: true,
            message: 'Daily Intelligence Report generated successfully',
            report
        });
    } catch (error) {
        console.error('Error generating daily intelligence report:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/latest', async (req, res) => {
    try {
        const reports = await dailyIntelligenceReportService.getAllReports(1);
        if (reports.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No reports found'
            });
        }
        res.json({
            success: true,
            report: reports[0]
        });
    } catch (error) {
        console.error('Error fetching latest report:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/list', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 30;
        const reports = await dailyIntelligenceReportService.getAllReports(limit);
        res.json({
            success: true,
            count: reports.length,
            reports
        });
    } catch (error) {
        console.error('Error fetching reports list:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/by-date/:dateKey', async (req, res) => {
    try {
        const { dateKey } = req.params;
        const report = await dailyIntelligenceReportService.getReportByDate(dateKey);
        
        if (!report) {
            return res.status(404).json({
                success: false,
                message: 'Report not found for the specified date'
            });
        }
        
        res.json({
            success: true,
            report
        });
    } catch (error) {
        console.error('Error fetching report by date:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/download/:dateKey', async (req, res) => {
    try {
        const { dateKey } = req.params;
        let report = await dailyIntelligenceReportService.getReportByDate(dateKey);
        
        if (!report) {
            report = await dailyIntelligenceReportService.generateDailyIntelligenceReport(dateKey);
        }
        
        if (report.status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Report generation is not completed yet'
            });
        }
        
        const pdfBuffer = await generateDailyIntelligenceReportPdf(report);
        
        const filename = `Daily_Intelligence_Report_${dateKey}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Error downloading report:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/preview/:dateKey', async (req, res) => {
    try {
        const { dateKey } = req.params;
        let report = await dailyIntelligenceReportService.getReportByDate(dateKey);
        
        if (!report) {
            report = await dailyIntelligenceReportService.generateDailyIntelligenceReport(dateKey);
        }
        
        if (report.status !== 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Report generation is not completed yet'
            });
        }
        
        const pdfBuffer = await generateDailyIntelligenceReportPdf(report);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Content-Length', pdfBuffer.length);
        
        res.send(pdfBuffer);
    } catch (error) {
        console.error('Error previewing report:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.get('/stats', async (req, res) => {
    try {
        const reports = await dailyIntelligenceReportService.getAllReports(7);
        
        const stats = {
            total_reports: reports.length,
            latest_report_date: reports.length > 0 ? reports[0].date_key : null,
            avg_dial100_calls: 0,
            avg_grievances: 0,
            avg_alerts: 0,
            avg_threat_rate: 0
        };
        
        if (reports.length > 0) {
            stats.avg_dial100_calls = Math.round(
                reports.reduce((sum, r) => sum + r.dial100_calls.total_received, 0) / reports.length
            );
            stats.avg_grievances = Math.round(
                reports.reduce((sum, r) => sum + r.grievances.total_generated, 0) / reports.length
            );
            stats.avg_alerts = Math.round(
                reports.reduce((sum, r) => sum + r.alerts.total_active, 0) / reports.length
            );
            stats.avg_threat_rate = Math.round(
                reports.reduce((sum, r) => sum + r.summary_statistics.threat_rate_percentage, 0) / reports.length
            );
        }
        
        res.json({
            success: true,
            stats
        });
    } catch (error) {
        console.error('Error fetching report stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

router.delete('/:dateKey', async (req, res) => {
    try {
        const { dateKey } = req.params;
        const DailyIntelligenceReport = require('../models/DailyIntelligenceReport');
        
        const result = await DailyIntelligenceReport.deleteOne({ date_key: dateKey });
        
        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'Report not found'
            });
        }
        
        res.json({
            success: true,
            message: 'Report deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting report:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
