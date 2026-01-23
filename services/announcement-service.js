/* [v7.0.1][2026-01-23] Announcement Layering Compliance Patch */
/**
 * services/announcement-service.js
 * 布告欄業務邏輯層
 * * @version 6.0.0 (New Service)
 * @date 2026-01-14
 * @description 負責處理布告欄的 CRUD 邏輯，封裝底層 Reader/Writer。
 */

class AnnouncementService {
    /**
     * @param {Object} dependencies
     * @param {AnnouncementReader} dependencies.announcementReader
     * @param {AnnouncementWriter} dependencies.announcementWriter
     */
    constructor({ announcementReader, announcementWriter }) {
        this.announcementReader = announcementReader;
        this.announcementWriter = announcementWriter;
    }

    /**
     * 取得所有已發布公告
     * @returns {Promise<Array>}
     */
    async getAnnouncements() {
        try {
            // [Fix] 由 Service 層負責業務過濾 (Status='已發布')
            // Reader 已經處理了「置頂排序」
            const data = await this.announcementReader.getAnnouncements();
            return data.filter(item => item.status === '已發布');
        } catch (error) {
            console.error('[AnnouncementService] getAnnouncements Error:', error);
            throw error;
        }
    }

    /**
     * 建立新公告
     * @param {Object} data - 公告資料
     * @param {Object} user - 建立者使用者物件
     */
    async createAnnouncement(data, user) {
        try {
            const creatorName = user.displayName || user.username || user.name || 'System';
            
            // 可以在此加入額外的業務驗證 (例如：檢查標題是否為空)
            if (!data.title) {
                throw new Error('公告標題為必填');
            }

            const result = await this.announcementWriter.createAnnouncement(data, creatorName);
            return result;
        } catch (error) {
            console.error('[AnnouncementService] createAnnouncement Error:', error);
            throw error;
        }
    }

    /**
     * 更新公告
     * @param {string|number} id - 公告 ID 或 Row Index (目前 Controller 傳入的是 id，但 Writer 似乎依賴 rowIndex?)
     * 注意：根據 Writer 的實作，updateAnnouncement 接收的是 rowIndex。
     * 我們需要在 Service 層做一個轉換，或是確認前端傳入的是什麼。
     * 假設前端傳入的是 ID，我們需要先查找該 ID 對應的 rowIndex。
     */
    async updateAnnouncement(id, data, user) {
        try {
            const modifierName = user.displayName || user.username || user.name || 'System';

            // 1. 查找公告以獲取 rowIndex
            // 為了效能，Reader 的 getAnnouncements 可能已經有 cache，直接用它
            const allAnnouncements = await this.announcementReader.getAnnouncements();
            const target = allAnnouncements.find(a => a.id === id);

            if (!target) {
                throw new Error(`找不到公告 ID: ${id}`);
            }

            // 這裡假設 Reader 回傳的物件中有 rowIndex 屬性
            // 檢查 Reader 程式碼：const rowParser = (row, index) => ({ rowIndex: index + 2, ... }) -> 有的。
            const rowIndex = target.rowIndex;

            const result = await this.announcementWriter.updateAnnouncement(rowIndex, data, modifierName);
            return result;
        } catch (error) {
            console.error('[AnnouncementService] updateAnnouncement Error:', error);
            throw error;
        }
    }

    /**
     * 刪除公告
     * @param {string} id - 公告 ID
     */
    async deleteAnnouncement(id) {
        try {
            // 同樣需要先透過 ID 找 rowIndex
            const allAnnouncements = await this.announcementReader.getAnnouncements();
            const target = allAnnouncements.find(a => a.id === id);

            if (!target) {
                throw new Error(`找不到公告 ID: ${id}`);
            }

            const rowIndex = target.rowIndex;
            const result = await this.announcementWriter.deleteAnnouncement(rowIndex);
            return result;
        } catch (error) {
            console.error('[AnnouncementService] deleteAnnouncement Error:', error);
            throw error;
        }
    }
}

module.exports = AnnouncementService;