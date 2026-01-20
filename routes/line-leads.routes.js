/**
 * routes/line-leads.routes.js
 * LINE LIFF 專用路由
 * * @version 6.1.8 (Fixed: Dependency Injection)
 * @date 2026-01-15
 * @description 修正 Controller 實例化邏輯，確保注入 contactService。
 */
const express = require('express');
const router = express.Router();
const LineLeadsController = require('../controllers/line-leads.controller');

// =======================================================
// 🏭 Controller Factory
// =======================================================
// 從 Service Container 獲取服務並注入 Controller
const getController = (req) => {
    const services = req.app.get('services');
    
    // 檢查關鍵依賴
    if (!services.contactService) {
        throw new Error('Critical: ContactService not found in DI Container');
    }

    // 注入 contactService (負責讀取資料) 與 contactWriter (負責更新)
    // 雖然 v6 建議只注入 Service，但為了兼容舊邏輯更新，我們這裡同時傳入 Writer
    return new LineLeadsController(
        services.contactService, 
        services.contactWriter
    );
};

// =======================================================
// 🛣️ Route Definitions
// =======================================================

// GET /api/line/leads
// 取得所有潛在客戶資料
router.get('/leads', async (req, res, next) => {
    try {
        await getController(req).getAllLeads(req, res);
    } catch (e) { next(e); }
});

// PUT /api/line/leads/:rowIndex
// 更新單筆客戶資料
router.put('/leads/:rowIndex', async (req, res, next) => {
    try {
        await getController(req).updateLead(req, res);
    } catch (e) { next(e); }
});

module.exports = router;