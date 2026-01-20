/**
 * services/weekly-business-service.js
 * 週間業務邏輯服務 (Service Layer)
 * * @version 6.0.4 (Restored getEntriesForWeek for Dashboard)
 * @date 2026-01-14
 * @description 負責聚合 Calendar, Opportunity 與 WeeklyReport 資料。
 * 適配 v5 Reader/Writer，並提供 Dashboard 所需的公開介面。
 */

class WeeklyBusinessService {
    /**
     * 透過 Service Container 注入依賴
     */
    constructor({ 
        weeklyBusinessReader, 
        weeklyBusinessWriter, 
        dateHelpers, 
        calendarService, 
        systemReader,
        opportunityService, 
        config 
    }) {
        this.weeklyBusinessReader = weeklyBusinessReader;
        this.weeklyBusinessWriter = weeklyBusinessWriter;
        this.dateHelpers = dateHelpers;
        this.calendarService = calendarService;
        this.systemReader = systemReader;
        this.opportunityService = opportunityService;
        this.config = config;
    }

    /**
     * 【關鍵修復】獲取特定週次的所有條目
     * 這是 DashboardService 依賴的接口，也是 0109 版本中的核心方法。
     * 它充當 Adapter，將請求轉發給 v5 Reader。
     * * @param {string} weekId - 週次 ID (e.g., "2026-W03")
     * @returns {Promise<Array>} 該週的業務紀錄陣列
     */
    async getEntriesForWeek(weekId) {
        try {
            // 呼叫 v5 Reader 的現有方法
            // 這裡維持了分層：Service 知道 Reader 的實作細節，但外部使用者(Dashboard)不需要知道
            const entries = await this.weeklyBusinessReader.getEntriesForWeek(weekId);
            return entries || [];
        } catch (error) {
            console.error(`[WeeklyService] getEntriesForWeek Error (${weekId}):`, error);
            // 發生錯誤時回傳空陣列，避免讓 Dashboard 整個崩潰
            return [];
        }
    }

    /**
     * 獲取週報列表摘要
     * 使用 Reader v5 的 getWeeklySummary()
     */
    async getWeeklyBusinessSummaryList() {
        try {
            const summaryData = await this.weeklyBusinessReader.getWeeklySummary();
            
            const weeksList = summaryData.map(item => {
                const weekId = item.weekId;
                const weekInfo = this.dateHelpers.getWeekInfo(weekId);
                
                return {
                    id: weekId,
                    title: weekInfo.title,
                    dateRange: weekInfo.dateRange,
                    summaryCount: item.summaryCount
                };
            });

            // UX 優化：確保「本週」總是存在
            const today = new Date();
            const currentWeekId = this.dateHelpers.getWeekId(today);
            const currentWeekInfo = this.dateHelpers.getWeekInfo(currentWeekId);
            const hasCurrentWeek = weeksList.some(w => w.title === currentWeekInfo.title);

            if (!hasCurrentWeek) {
                 weeksList.unshift({
                     id: currentWeekId, 
                     title: currentWeekInfo.title,
                     dateRange: currentWeekInfo.dateRange,
                     summaryCount: 0
                 });
            }

            return weeksList.sort((a, b) => b.id.localeCompare(a.id));

        } catch (error) {
            console.error('[WeeklyService] getWeeklyBusinessSummaryList Error:', error);
            throw error;
        }
    }

    /**
     * 獲取單週詳細資料 (包含日曆過濾邏輯)
     * 這部分邏輯保留自 0109，用於 Weekly 頁面顯示
     */
    async getWeeklyDetails(weekId, userId = null) {
        console.log(`📊 [WeeklyService] 獲取週次 ${weekId} 的詳細資料...`);
        
        const weekInfo = this.dateHelpers.getWeekInfo(weekId);
        
        // --- 1. 使用自身的 getEntriesForWeek 方法讀取資料 ---
        let entriesForWeek = await this.getEntriesForWeek(weekId);
        
        // 若有指定 User，進行篩選 (視業務需求開啟)
        if (userId) {
            // entriesForWeek = entriesForWeek.filter(d => d.userId === userId); 
        }
        
        console.log(`   - 獲取了 ${entriesForWeek.length} 筆紀錄`);

        // --- 2. 日曆與系統設定讀取 (維持 0109 邏輯) ---
        const firstDay = new Date(weekInfo.days[0].date + 'T00:00:00'); 
        const lastDay = new Date(weekInfo.days[weekInfo.days.length - 1].date + 'T00:00:00'); 
        const endQueryDate = new Date(lastDay.getTime() + 24 * 60 * 60 * 1000); 

        const queries = [
            this.calendarService.getHolidaysForPeriod(firstDay, endQueryDate), 
            this.systemReader.getSystemConfig() 
        ];

        if (this.config.PERSONAL_CALENDAR_ID) {
            queries.push(
                this.calendarService.getEventsForPeriod(firstDay, endQueryDate, this.config.PERSONAL_CALENDAR_ID)
            );
        } else {
            queries.push(Promise.resolve([]));
        }

        if (this.config.CALENDAR_ID) {
            queries.push(
                this.calendarService.getEventsForPeriod(firstDay, endQueryDate, this.config.CALENDAR_ID)
            );
        } else {
            queries.push(Promise.resolve([]));
        }

        const results = await Promise.all(queries);
        const holidays = results[0];
        const systemConfig = results[1] || {};
        const rawDxEvents = results[2] || []; 
        const rawAtEvents = results[3] || [];

        // --- 3. 關鍵字過濾邏輯 (維持 0109 邏輯) ---
        const rules = systemConfig['日曆篩選規則'] || [];
        const dxBlockRule = rules.find(r => r.value === 'DX_屏蔽關鍵字');
        const dxBlockKeywords = (dxBlockRule ? dxBlockRule.note : '').split(',').map(s => s.trim()).filter(Boolean);

        const atTransferRule = rules.find(r => r.value === 'AT_轉移關鍵字');
        const atTransferKeywords = (atTransferRule ? atTransferRule.note : '').split(',').map(s => s.trim()).filter(Boolean);

        const finalDxList = [];
        const finalAtList = [];

        rawDxEvents.forEach(evt => {
            const summary = evt.summary || '';
            const shouldBlock = dxBlockKeywords.some(kw => summary.includes(kw));
            if (!shouldBlock) finalDxList.push(evt);
        });

        rawAtEvents.forEach(evt => {
            const summary = evt.summary || '';
            const shouldTransfer = atTransferKeywords.some(kw => summary.includes(kw));
            if (shouldTransfer) finalDxList.push(evt);
            else finalAtList.push(evt);
        });

        const organizeEventsByDay = (events) => {
            const map = {};
            events.forEach(event => {
                const startVal = event.start.dateTime || event.start.date;
                if (!startVal) return;

                const eventDate = new Date(startVal);
                const dateKey = eventDate.toLocaleDateString('en-CA', { timeZone: this.config.TIMEZONE });

                if (!map[dateKey]) map[dateKey] = [];
                
                const isAllDay = !!event.start.date;
                const timeStr = isAllDay ? '全天' : eventDate.toLocaleTimeString('zh-TW', { timeZone: this.config.TIMEZONE, hour: '2-digit', minute: '2-digit', hour12: false });

                map[dateKey].push({
                    summary: event.summary,
                    isAllDay: isAllDay,
                    time: timeStr,
                    htmlLink: event.htmlLink,
                    location: event.location,
                    description: event.description
                });
            });
            return map;
        };

        const dxEventsByDay = organizeEventsByDay(finalDxList);
        const atEventsByDay = organizeEventsByDay(finalAtList);

        weekInfo.days.forEach(day => {
            if (holidays.has(day.date)) day.holidayName = holidays.get(day.date);
            day.dxCalendarEvents = dxEventsByDay[day.date] || [];
            day.atCalendarEvents = atEventsByDay[day.date] || [];
        });

        return {
            id: weekId,
            ...weekInfo, 
            entries: entriesForWeek 
        };
    }

    /**
     * 獲取週次選項 (下拉選單)
     */
    async getWeekOptions() {
        const today = new Date();
        const prevWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

        const summaryData = await this.weeklyBusinessReader.getWeeklySummary();
        const existingWeekIds = new Set(summaryData.map(w => w.weekId));

        const options = [
            { id: this.dateHelpers.getWeekId(prevWeek), label: '上一週' },
            { id: this.dateHelpers.getWeekId(today),    label: '本週' },
            { id: this.dateHelpers.getWeekId(nextWeek), label: '下一週' }
        ];

        options.forEach(opt => {
            opt.disabled = existingWeekIds.has(opt.id);
        });

        return options;
    }

    /**
     * 建立週報
     */
    async createWeeklyBusinessEntry(data) {
        const entryDate = new Date(data.date || new Date());
        const weekId = this.dateHelpers.getWeekId(entryDate);
        
        const fullData = { 
            ...data, 
            weekId: weekId
        };
        
        const creator = data.creator || 'System';
        return this.weeklyBusinessWriter.createEntry(fullData, creator);
    }

    /**
     * 更新週報
     */
    async updateWeeklyBusinessEntry(recordId, data) {
        const modifier = data.creator || 'System';
        return this.weeklyBusinessWriter.updateEntry(recordId, data, modifier);
    }

    /**
     * 刪除週報
     */
    async deleteWeeklyBusinessEntry(recordId, rowIndex) {
        return this.weeklyBusinessWriter.deleteEntry(recordId);
    }
}

module.exports = WeeklyBusinessService;