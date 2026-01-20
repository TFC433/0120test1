/**
 * services/contact-service.js
 * 聯絡人業務邏輯服務層
 * * @version 6.1.1
 * * @date 2026-01-15
 * * @description 封裝所有聯絡人相關的業務邏輯，負責資料清洗與格式轉換。
 * * 明確區分「潛在客戶 (Raw Cards)」與「正式聯絡人 (Official List)」。
 */

class ContactService {
    /**
     * @param {ContactReader} contactReader - 資料讀取器
     * @param {ContactWriter} contactWriter - 資料寫入器
     * @param {CompanyReader} companyReader - 公司資料讀取器 (用於關聯查詢)
     */
    constructor(contactReader, contactWriter, companyReader) {
        this.contactReader = contactReader;
        this.contactWriter = contactWriter;
        this.companyReader = companyReader;
    }

    /**
     * 取得儀表板統計數據
     * 對應前端路由: GET /api/contacts/dashboard
     * 用於 dashboard.html#contacts 頁面上方的統計卡片
     * @returns {Promise<Object>} 包含 total, pending, processed, dropped 的統計物件
     */
    async getDashboardStats() {
        try {
            // 讀取所有潛在客戶資料
            const contacts = await this.contactReader.getContacts(3000);
            
            // 執行統計邏輯
            const stats = {
                total: contacts.length,
                pending: contacts.filter(c => !c.status || c.status === 'Pending').length,
                processed: contacts.filter(c => c.status === 'Processed').length,
                dropped: contacts.filter(c => c.status === 'Dropped').length
            };
            
            return stats;
        } catch (error) {
            console.error('[ContactService] getDashboardStats Error:', error);
            // 發生錯誤時回傳安全預設值，防止前端崩潰
            return { total: 0, pending: 0, processed: 0, dropped: 0 };
        }
    }

    /**
     * 取得潛在客戶列表 (Raw Data / Business Cards)
     * 對應前端頁面: dashboard.html#contacts (主要列表)
     * @param {number} limit - 限制回傳筆數，預設 2000
     * @returns {Promise<Array>} 潛在客戶陣列
     */
    async getPotentialContacts(limit = 2000) {
        try {
            // 呼叫 Reader 讀取原始名片 Sheet
            let contacts = await this.contactReader.getContacts(limit);
            
            // 業務邏輯：過濾掉完全無效的空行 (沒有名字且沒有公司)
            contacts = contacts.filter(c => c.name || c.company);

            return contacts;
        } catch (error) {
            console.error('[ContactService] getPotentialContacts Error:', error);
            throw error;
        }
    }

    /**
     * 搜尋正式聯絡人 (Official Contact List)
     * 對應前端頁面: /contact-list
     * @param {string} query - 搜尋關鍵字
     * @param {number} page - 頁碼
     * @returns {Promise<Object>} { data: [], pagination: {} }
     */
    async searchOfficialContacts(query, page = 1) {
        try {
            // 呼叫 Reader 讀取正式名單 Sheet (Reader 內部已處理 JOIN CompanyName)
            return await this.contactReader.searchContactList(query, page);
        } catch (error) {
            console.error('[ContactService] searchOfficialContacts Error:', error);
            throw error;
        }
    }

    /**
     * 根據 ID 取得單一正式聯絡人詳情
     * @param {string} contactId 
     * @returns {Promise<Object|null>}
     */
    async getContactById(contactId) {
        try {
            // 利用 searchContactList 的邏輯來獲取單筆資料
            const result = await this.contactReader.searchContactList(contactId, 1);
            const contact = result.data.find(c => c.contactId === contactId);
            return contact || null;
        } catch (error) {
            console.error('[ContactService] getContactById Error:', error);
            return null;
        }
    }

    /**
     * 更新正式聯絡人資料
     * @param {string} contactId 
     * @param {Object} updateData 
     * @param {string} user - 操作者名稱
     * @returns {Promise<Object>} { success: true }
     */
    async updateContact(contactId, updateData, user) {
        try {
            // 執行寫入操作
            await this.contactWriter.updateContact(contactId, updateData, user);
            
            // 清除 Reader 的快取，確保下次讀取是最新資料
            this.contactReader.invalidateCache('contactList');
            
            return { success: true };
        } catch (error) {
            console.error('[ContactService] updateContact Error:', error);
            throw error;
        }
    }
}

module.exports = ContactService;