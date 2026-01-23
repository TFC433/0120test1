/* [v7.0.2][2026-01-23] Weekly Layering Compliance Patch */
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
        // [R4 Patch] Removed summaryCache
    }

    /**
     * 取得所有週間業務紀錄的摘要資訊 (不含詳細內容)
     * @returns {Promise<Array<object>>} - 包含 { weekId, summaryContent } 的陣列 (Raw)
     */
    async getWeeklySummary() {
        try {
            const range = `${this.config.SHEETS.WEEKLY_BUSINESS}!B:F`;
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.targetSpreadsheetId,
                range: range,
            });

            const rows = response.data.values || [];
            if (rows.length <= 1) return [];

            // [R4 Patch] return raw data only
            const rawData = rows.slice(1).map(row => ({
                weekId: row[0],
                summaryContent: row[4]
            }));

            return rawData;
        } catch (error) {
            console.error(`❌ [WeeklyBusinessReader] 讀取 weeklyBusinessSummary 失敗:`, error);
            return [];
        }
    }

    /**
     * 根據 Week ID 取得該週的所有業務紀錄
     * [R4 Patch] 由 Service 負責過濾，Reader 回傳全量
     * @param {string} weekId - 週次 ID (保留參數以維持相容)
     * @returns {Promise<Array<object>>}
     */
    async getEntriesForWeek(weekId) {
        const allEntries = await this._getAllWeeklyBusinessEntriesWithCache();
        return allEntries;
    }

    /**
     * ✅ Public API：取得所有 entries（提供給 Service/Writer 使用）
     * 目的：避免其他層直接呼叫 private method
     * @returns {Promise<Array<object>>}
     */
    async getAllEntries() {
        return await this._getAllWeeklyBusinessEntriesWithCache();
    }

    /**
     * ✅ Public API：用 recordId 找 entry（含 rowIndex）
     * 目的：讓 Writer 不需依賴 Reader 私有方法
     * @param {string} recordId
     * @returns {Promise<object|null>}
     */
    async findEntryByRecordId(recordId) {
        if (!recordId) return null;
        const allEntries = await this._getAllWeeklyBusinessEntriesWithCache();
        return allEntries.find(e => e.recordId === recordId) || null;
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

            // 保留原本 day 計算行為（前端依賴 e.day 做渲染）
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
            } catch (e) {
                entry.day = -1;
            }

            return entry;
        };

        const sorter = (a, b) => new Date(b['日期']) - new Date(a['日期']);

        return this._fetchAndCache(cacheKey, range, rowParser, sorter);
    }

    invalidateCache() {
        super.invalidateCache('weeklyBusiness');
        console.log('✅ [Cache] 週間業務摘要與完整資料快取已失效');
    }
}

module.exports = WeeklyBusinessReader;
