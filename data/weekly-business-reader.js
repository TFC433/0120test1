/**
 * data/weekly-business-reader.js
 * 專門負責讀取所有與「週間業務」相關資料的類別
 * * @version 5.0.0 (Phase 5 Refactoring)
 * @date 2026-01-09
 * @description 實作 Strict Mode 依賴注入。
 */

const BaseReader = require('./base-reader');

class WeeklyBusinessReader extends BaseReader {
    /**
     * @param {Object} sheets - Google Sheets API Client
     * @param {string} spreadsheetId - [Required] 指定要讀取的 Sheet ID
     */
    constructor(sheets, spreadsheetId) {
        super(sheets, spreadsheetId);
        this.summaryCache = { data: null, timestamp: 0 };
    }

    /**
     * 取得所有週間業務紀錄的摘要資訊 (不含詳細內容)
     * @returns {Promise<Array<object>>} - 包含 { weekId, summaryCount } 的陣列
     */
    async getWeeklySummary() {
        const cacheKey = 'weeklyBusinessSummary';
        const now = Date.now();
        if (this.summaryCache.data && (now - this.summaryCache.timestamp < this.CACHE_DURATION)) {
            console.log(`✅ [Cache] 從快取讀取 ${cacheKey}...`);
            return this.summaryCache.data;
        }

        console.log(`🔄 [API] 從 Google Sheet 讀取 ${cacheKey}...`);
        try {
            const range = `${this.config.SHEETS.WEEKLY_BUSINESS}!B:F`;
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.targetSpreadsheetId, // 使用注入 ID
                range: range,
            });

            const rows = response.data.values || [];
            if (rows.length <= 1) {
                 this.summaryCache = { data: [], timestamp: now };
                 return [];
            }

            const weekSummaryMap = new Map();

            rows.slice(1).forEach(row => {
                const weekId = row[0];
                const summaryContent = row[4]; 

                if (weekId && /^\d{4}-W\d{2}$/.test(weekId)) {
                    if (!weekSummaryMap.has(weekId)) {
                        weekSummaryMap.set(weekId, { weekId: weekId, summaryCount: 0 });
                    }
                    if (summaryContent && summaryContent.trim() !== '') {
                        weekSummaryMap.get(weekId).summaryCount++;
                    }
                }
            });

            const summaryData = Array.from(weekSummaryMap.values())
                .sort((a, b) => b.weekId.localeCompare(a.weekId)); 

            this.summaryCache = { data: summaryData, timestamp: now }; 
            return summaryData;

        } catch (error) {
            console.error(`❌ [WeeklyBusinessReader] 讀取 ${cacheKey} 失敗:`, error);
            return [];
        }
    }


    /**
     * 根據 Week ID 取得該週的所有業務紀錄
     * @param {string} weekId - 週次 ID (e.g., "2023-W42")
     * @returns {Promise<Array<object>>} - 該週的紀錄陣列
     */
    async getEntriesForWeek(weekId) {
        const allEntries = await this._getAllWeeklyBusinessEntriesWithCache();
        return allEntries.filter(entry => entry.weekId === weekId);
    }


    /**
     * 【內部方法】取得所有週間業務紀錄 (會使用快取)
     * @private
     * @returns {Promise<Array<object>>}
     */
    async _getAllWeeklyBusinessEntriesWithCache() {
        const cacheKey = 'weeklyBusiness'; 
        const range = `${this.config.SHEETS.WEEKLY_BUSINESS}!A:K`;

        const fieldKeys = [
            '日期', 'weekId', 'category', '主題', '參與人員',
            '重點摘要', '待辦事項', 'createdTime', 'lastUpdateTime',
            '建立者', 'recordId'
        ];

        const rowParser = (row, index) => {
            const entry = { rowIndex: index + 2 };
            fieldKeys.forEach((key, i) => {
                entry[key] = row[i] || '';
            });
            try {
                const dateString = entry['日期'];
                 if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
                    const [year, month, day] = dateString.split('-').map(Number);
                    const entryDateUTC = new Date(Date.UTC(year, month - 1, day));
                    if (!isNaN(entryDateUTC.getTime())) {
                       entry.day = entryDateUTC.getUTCDay(); 
                    } else {
                       entry.day = -1; 
                    }
                 } else {
                    entry.day = -1; 
                 }
            } catch(e) {
                entry.day = -1; 
            }
            return entry;
        };

        const sorter = (a, b) => new Date(b['日期']) - new Date(a['日期']);

        return this._fetchAndCache(cacheKey, range, rowParser, sorter);
    }

    invalidateCache() {
        super.invalidateCache('weeklyBusiness');
        this.summaryCache = { data: null, timestamp: 0 }; 
        console.log('✅ [Cache] 週間業務摘要與完整資料快取已失效');
    }
}

module.exports = WeeklyBusinessReader;