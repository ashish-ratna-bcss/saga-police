const { checkSystemHealth } = require('../services/healthMonitorService');

exports.getSystemHealth = async (req, res) => {
    try {
        const healthData = await checkSystemHealth();
        res.status(200).json({ success: true, data: healthData });
    } catch (error) {
        console.error('[HealthController] Error fetching system health:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch system health' });
    }
};
