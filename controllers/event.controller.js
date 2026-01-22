// controllers/event.controller.js
const { handleApiError } = require('../middleware/error.middleware');
// 【移除】Config 已移至 Service
// const config = require('../config');

// 輔助函式：從 req.app 獲取服務
const getServices = (req) => req.app.get('services');

// ==========================================
// Part 1: 事件紀錄 (Event Log) 相關功能
// ==========================================

// POST /api/events
exports.createEventLog = async (req, res) => {
    try {
        const { eventLogService } = getServices(req);
        // 【修正】將 req.user.name (操作者) 傳入 Service，確保建立者正確
        res.json(await eventLogService.createEventLog(req.body, req.user.name));
    } catch (error) { handleApiError(res, error, 'Create Event Log'); }
};

// GET /api/events/:eventId
exports.getEventLogById = async (req, res) => {
    try {
        const { eventLogReader } = getServices(req);
        const data = await eventLogReader.getEventLogById(req.params.eventId);
        res.json({ success: !!data, data });
    } catch (error) { handleApiError(res, error, 'Get Event Log By Id'); }
};

// PUT /api/events/:eventId
exports.updateEventLog = async (req, res) => {
    try {
        const { eventLogService } = getServices(req);
        res.json(await eventLogService.updateEventLog(req.params.eventId, req.body, req.user.name));
    } catch (error) { handleApiError(res, error, 'Update Event Log'); }
};

// DELETE /api/events/:eventId
exports.deleteEventLog = async (req, res) => {
    try {
        const { eventLogService } = getServices(req);
        res.json(await eventLogService.deleteEventLog(req.params.eventId, req.user.name));
    } catch (error) {
        handleApiError(res, error, 'Delete Event Log');
    }
};


// ==========================================
// Part 2: 日曆 (Calendar) 與 自動同步功能
// ==========================================

// POST /api/calendar/events
exports.createCalendarEvent = async (req, res) => {
    try {
        // [Refactor] 透過 EventService 處理排程與同步
        // 原始參數: title, startTime, duration, location, description, 
        //          opportunityId, participants, createInteraction, showTimeInTitle
        const { eventService } = getServices(req);
        
        // 將 req.body 與 req.user 傳遞給 Service
        const result = await eventService.createCalendarEventAndSync(req.body, req.user);
        
        res.json(result);

    } catch (error) { 
        handleApiError(res, error, 'Create Calendar Event & Sync'); 
    }
};

// GET /api/calendar/week
exports.getThisWeekEvents = async (req, res) => {
    try {
        // [Refactor] 透過 EventService 透傳，保持介面一致性
        const { eventService } = getServices(req);
        res.json(await eventService.getThisWeekEvents());
    } catch (error) { handleApiError(res, error, 'Get Week Events'); }
};