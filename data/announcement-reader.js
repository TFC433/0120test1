/* [v7.0.1][2026-01-23] Announcement Layering Compliance Patch */
/**
 * data/announcement-reader.js
 * 專門負責讀取所有與「佈告欄」相關資料的類別
 * * @version 5.0.0 (Phase 5 Refactoring)
 * @date 2026-01-09
 * @description 實作 Strict Mode 依賴注入。
 */

const BaseReader = require('./base-reader');

class AnnouncementReader extends BaseReader {
    /**
     * @param {Object} sheets - Google Sheets API Client
     * @param {string} spreadsheetId - [Required] 指定要讀取的 Sheet ID
     */
    constructor(sheets, spreadsheetId) {
        super(sheets, spreadsheetId);
    }

    /**
     * 取得所有公告，並依置頂與時間排序
     * @returns {Promise<Array<object>>}
     */
    async getAnnouncements() {
        const cacheKey = 'announcements';
        const range = `${this.config.SHEETS.ANNOUNCEMENTS}!A:H`;
        const F = this.config.ANNOUNCEMENT_FIELDS;

        const rowParser = (row, index) => ({
            rowIndex: index + 2,
            id: row[F.ID] || '',
            title: row[F.TITLE] || '',
            content: row[F.CONTENT] || '',
            creator: row[F.CREATOR] || '',
            createTime: row[F.CREATE_TIME] || '',
            lastUpdateTime: row[F.LAST_UPDATE_TIME] || '',
            status: row[F.STATUS] || '',
            isPinned: row[F.IS_PINNED] === 'TRUE'
        });

        const sorter = (a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            return new Date(b.lastUpdateTime) - new Date(a.lastUpdateTime);
        };
        
        const allData = await this._fetchAndCache(cacheKey, range, rowParser, sorter);
        
        return allData;
    }
}

module.exports = AnnouncementReader;