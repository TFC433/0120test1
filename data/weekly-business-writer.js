/**
 * data/weekly-business-writer.js
 * 週間業務寫入器
 * * @version 5.0.0 (Phase 5 Refactoring)
 * @date 2026-01-09
 * @description 負責處理週間業務報告的建立與更新。
 * 實作 Strict Mode 依賴注入。
 */

const BaseWriter = require('./base-writer');

class WeeklyBusinessWriter extends BaseWriter {
    /**
     * @param {Object} sheets - Google Sheets API Client
     * @param {string} spreadsheetId - [Required] 指定要寫入的 Sheet ID
     * @param {Object} weeklyReader - 用於清除快取的 Reader 實例
     */
    constructor(sheets, spreadsheetId, weeklyReader) {
        super(sheets, spreadsheetId);
        if (!weeklyReader) {
            throw new Error('WeeklyBusinessWriter 需要 WeeklyBusinessReader 的實例');
        }
        this.weeklyReader = weeklyReader;
    }

    /**
     * 建立新業務紀錄
     */
    async createEntry(data, creator) {
        console.log(`📅 [WeeklyWriter] 建立新紀錄: ${data.theme} by ${creator}`);

        const now = new Date().toISOString();
        const recordId = `WK${Date.now()}`;

        // 欄位順序: 日期, WeekID, 分類, 主題, 參與人員, 重點摘要, 待辦事項, CreateTime, LastUpdateTime, Creator, RecordID
        const newRow = [
            data.date || now.split('T')[0],
            data.weekId || '',
            data.category || '一般',
            data.theme || '',
            data.participants || '',
            data.summary || '',
            data.todo || '',
            now, // Create
            now, // Update
            creator,
            recordId
        ];

        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.targetSpreadsheetId,
            range: `${this.config.SHEETS.WEEKLY_BUSINESS}!A:K`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [newRow] }
        });

        this.weeklyReader.invalidateCache();
        return { success: true, id: recordId };
    }

    /**
     * 更新業務紀錄
     */
    async updateEntry(recordId, data, modifier) {
        console.log(`📅 [WeeklyWriter] 更新紀錄: ${recordId} by ${modifier}`);

        // ✅ 改成走 Reader public API（不碰 private method）
        const entry = await this.weeklyReader.findEntryByRecordId(recordId);
        if (!entry) throw new Error(`找不到紀錄 ID: ${recordId}`);

        const rowIndex = entry.rowIndex;

        const now = new Date().toISOString();
        const sheetName = this.config.SHEETS.WEEKLY_BUSINESS;
        const range = `${sheetName}!A${rowIndex}:K${rowIndex}`;

        // 讀取舊列
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.targetSpreadsheetId,
            range: range
        });
        const currentRow = response.data.values ? response.data.values[0] : [];
        if (currentRow.length === 0) throw new Error('讀取紀錄失敗');

        // 更新欄位 (索引參照 createEntry)
        if (data.date !== undefined) currentRow[0] = data.date;
        if (data.weekId !== undefined) currentRow[1] = data.weekId;
        if (data.category !== undefined) currentRow[2] = data.category;
        if (data.theme !== undefined) currentRow[3] = data.theme;
        if (data.participants !== undefined) currentRow[4] = data.participants;
        if (data.summary !== undefined) currentRow[5] = data.summary;
        if (data.todo !== undefined) currentRow[6] = data.todo;

        currentRow[8] = now; // LastUpdateTime

        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.targetSpreadsheetId,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [currentRow] }
        });

        this.weeklyReader.invalidateCache();
        return { success: true };
    }

    /**
     * 刪除業務紀錄
     */
    async deleteEntry(recordId) {
        console.log(`🗑️ [WeeklyWriter] 刪除紀錄: ${recordId}`);

        // ✅ 改成走 Reader public API（不碰 private method）
        const entry = await this.weeklyReader.findEntryByRecordId(recordId);
        if (!entry) throw new Error(`找不到紀錄 ID: ${recordId}`);

        await this._deleteRow(
            this.config.SHEETS.WEEKLY_BUSINESS,
            entry.rowIndex,
            this.weeklyReader
        );

        return { success: true };
    }
}

module.exports = WeeklyBusinessWriter;
