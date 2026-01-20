/**
 * services/event-log-service.js
 * 事件紀錄服務邏輯
 * * @version 5.0.0 (Phase 5 Refactoring)
 * @date 2026-01-09
 * @description 負責各類型事件 (General, IOT, DT, DX) 的 CRUD 與資料聚合。
 * 依賴注入：EventLogReader, EventLogWriter, OpportunityReader, CompanyReader, SystemReader, CalendarService
 */

class EventLogService {
    /**
     * @param {EventLogReader} eventReader 
     * @param {EventLogWriter} eventWriter 
     * @param {OpportunityReader} oppReader 
     * @param {CompanyReader} companyReader 
     * @param {SystemReader} systemReader 
     * @param {CalendarService} calendarService 
     */
    constructor(eventReader, eventWriter, oppReader, companyReader, systemReader, calendarService) {
        this.eventReader = eventReader;
        this.eventWriter = eventWriter;
        this.oppReader = oppReader;
        this.companyReader = companyReader;
        this.systemReader = systemReader;
        this.calendarService = calendarService;
    }

    /**
     * 取得完整事件列表 (包含關聯名稱解析)
     */
    async getAllEvents() {
        try {
            const events = await this.eventReader.getEventLogs();
            
            // 為了提升顯示效能，這裡可以選擇是否要 join 機會名稱與公司名稱
            // 若資料量大，建議改由前端透過 ID Map 處理，或在此進行批次處理
            // 目前維持簡單回傳
            return events;
        } catch (error) {
            console.error('[EventLogService] getAllEvents Error:', error);
            return [];
        }
    }

    /**
     * 取得單一事件詳情 (包含完整關聯資料)
     */
    async getEventById(eventId) {
        try {
            const event = await this.eventReader.getEventLogById(eventId);
            if (!event) return null;

            // 補充額外資訊
            if (event.opportunityId) {
                // 這裡使用 oppReader (已注入正確 ID)
                const opps = await this.oppReader.getOpportunities();
                const opp = opps.find(o => o.opportunityId === event.opportunityId);
                if (opp) event.opportunityName = opp.opportunityName;
            }
            
            if (event.companyId) {
                const comps = await this.companyReader.getCompanyList();
                const comp = comps.find(c => c.companyId === event.companyId);
                if (comp) event.companyName = comp.companyName;
            }

            return event;
        } catch (error) {
            console.error(`[EventLogService] getEventById Error (${eventId}):`, error);
            return null;
        }
    }

    /**
     * 建立新事件
     * 同步更新 Google Calendar (如果選項開啟)
     */
    async createEvent(data, user) {
        try {
            const modifier = user.displayName || user.username || 'System';
            
            // 1. 寫入 Sheet
            const result = await this.eventWriter.createEventLog(data, modifier);
            
            // 2. 同步 Calendar (Optional)
            if (result.success && data.syncToCalendar === 'true') {
                try {
                    const calendarEvent = {
                        summary: `[${data.eventType}] ${data.eventName}`,
                        description: data.eventContent || '',
                        start: { dateTime: new Date(data.createdTime || Date.now()).toISOString() }, // 需確認前端是否傳入正確時間格式
                        end: { dateTime: new Date(Date.now() + 3600000).toISOString() } // 預設 1 小時，需優化
                    };
                    // CalendarService 也已在 Container 中初始化
                    await this.calendarService.createEvent(calendarEvent);
                } catch (calError) {
                    console.warn('[EventLogService] Calendar sync failed:', calError);
                    // 不中斷主流程
                }
            }

            return result;
        } catch (error) {
            console.error('[EventLogService] createEvent Error:', error);
            throw error;
        }
    }

    /**
     * 更新事件
     */
    async updateEvent(rowIndex, data, user) {
        try {
            const modifier = user.displayName || user.username || 'System';
            return await this.eventWriter.updateEventLog(rowIndex, data, modifier);
        } catch (error) {
            console.error(`[EventLogService] updateEvent Error (Row: ${rowIndex}):`, error);
            throw error;
        }
    }

    /**
     * 刪除事件
     */
    async deleteEvent(rowIndex, eventType, user) {
        try {
            // 可加入權限檢查
            return await this.eventWriter.deleteEventLog(rowIndex, eventType);
        } catch (error) {
            console.error(`[EventLogService] deleteEvent Error (Row: ${rowIndex}):`, error);
            throw error;
        }
    }
    
    /**
     * 取得系統定義的事件類型列表 (供前端下拉選單使用)
     */
    async getEventTypes() {
        try {
            const config = await this.systemReader.getSystemConfig();
            return config['事件類型'] || [];
        } catch (error) {
            console.error('[EventLogService] getEventTypes Error:', error);
            return [];
        }
    }
}

module.exports = EventLogService;