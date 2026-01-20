// controllers/system.controller.js
/**
 * SystemController
 * * @version 5.1.0 (Phase 5 - Class Refactoring)
 * @date 2026-01-13
 * @description 系統核心控制器，負責全域設定、快取管理與儀表板資料聚合。
 * 採用依賴注入模式，不再依賴 req.app.get('services') 查找。
 */

const { handleApiError } = require('../middleware/error.middleware');

class SystemController {
    /**
     * @param {SystemReader} systemReader - 讀取設定與狀態
     * @param {SystemWriter} systemWriter - (預留) 寫入設定
     * @param {DashboardService} dashboardService - 聚合儀表板數據
     */
    constructor(systemReader, systemWriter, dashboardService) {
        this.systemReader = systemReader;
        this.systemWriter = systemWriter;
        this.dashboardService = dashboardService;
    }

    // 處理 GET /api/config
    getSystemConfig = async (req, res) => {
        try {
            const config = await this.systemReader.getSystemConfig();
            res.json(config);
        } catch (error) {
            handleApiError(res, error, 'Get Config');
        }
    };

    // 處理 POST /api/cache/invalidate
    invalidateCache = async (req, res) => {
        try {
            this.systemReader.invalidateCache(null); // 'null' 會清除所有快取
            res.json({ success: true, message: '後端所有快取已清除' });
        } catch (error) {
            handleApiError(res, error, 'Invalidate Cache');
        }
    };

    // 處理 GET /api/system/status
    getSystemStatus = async (req, res) => {
        try {
            // 從 base-reader.js 的共享 cache 中讀取我們儲存的時間戳
            const lastWrite = this.systemReader.cache._globalLastWrite 
                ? this.systemReader.cache._globalLastWrite.data 
                : null;
            
            res.json({ success: true, lastWriteTimestamp: lastWrite });
        } catch (error) {
            handleApiError(res, error, 'Get System Status');
        }
    };

    // --- Dashboard 聚合方法 (原本散落在 System，現在透過 Service 呼叫) ---

    // 處理 GET /api/dashboard
    getDashboardData = async (req, res) => {
        try {
            const data = await this.dashboardService.getDashboardData();
            res.json({ success: true, data });
        } catch (error) {
            handleApiError(res, error, 'Get Dashboard');
        }
    };

    // 處理 GET /api/contacts/dashboard
    getContactsDashboardData = async (req, res) => {
        try {
            const data = await this.dashboardService.getContactsDashboardData();
            res.json({ success: true, data });
        } catch (error) {
            handleApiError(res, error, 'Get Contacts Dashboard');
        }
    };

    // 處理 GET /api/events/dashboard
    getEventsDashboardData = async (req, res) => {
        try {
            const data = await this.dashboardService.getEventsDashboardData();
            res.json({ success: true, data });
        } catch (error) {
            handleApiError(res, error, 'Get Events Dashboard');
        }
    };

    // 處理 GET /api/companies/dashboard
    getCompaniesDashboardData = async (req, res) => {
        try {
            const data = await this.dashboardService.getCompaniesDashboardData();
            res.json({ success: true, data });
        } catch (error) {
            handleApiError(res, error, 'Get Companies Dashboard');
        }
    };
}

module.exports = SystemController;