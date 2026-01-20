/**
 * services/interaction-service.js
 * 互動紀錄業務邏輯層
 * * @version 6.0.0 (Phase 6 - Safe User Fix)
 * @date 2026-01-14
 * @description 負責處理互動紀錄 (Interactions) 的查詢與寫入。
 * 包含防禦性程式設計，防止 user 物件遺失導致崩潰。
 */

class InteractionService {
    /**
     * @param {InteractionReader} interactionReader 
     * @param {InteractionWriter} interactionWriter 
     * @param {OpportunityReader} opportunityReader 
     * @param {CompanyReader} companyReader 
     */
    constructor(interactionReader, interactionWriter, opportunityReader, companyReader) {
        this.interactionReader = interactionReader;
        this.interactionWriter = interactionWriter;
        this.opportunityReader = opportunityReader;
        this.companyReader = companyReader;
    }

    /**
     * 搜尋互動紀錄
     * @param {string} query 
     * @param {number} page 
     * @param {boolean} fetchAll 
     */
    async searchInteractions(query, page = 1, fetchAll = false) {
        try {
            // Reader 已經處理了關聯名稱 (Opportunity Name / Company Name) 的邏輯
            return await this.interactionReader.searchAllInteractions(query, page, fetchAll);
        } catch (error) {
            console.error('[InteractionService] searchInteractions Error:', error);
            throw error;
        }
    }

    /**
     * 取得特定機會的互動紀錄
     * @param {string} opportunityId 
     */
    async getInteractionsByOpportunity(opportunityId) {
        try {
            const result = await this.interactionReader.searchAllInteractions('', 1, true); // 取全部
            const logs = result.data.filter(log => log.opportunityId === opportunityId);
            return logs;
        } catch (error) {
            console.error('[InteractionService] getInteractionsByOpportunity Error:', error);
            return [];
        }
    }

    /**
     * 取得特定公司的互動紀錄
     * @param {string} companyId 
     */
    async getInteractionsByCompany(companyId) {
        try {
            const result = await this.interactionReader.searchAllInteractions('', 1, true);
            const logs = result.data.filter(log => log.companyId === companyId);
            return logs;
        } catch (error) {
            console.error('[InteractionService] getInteractionsByCompany Error:', error);
            return [];
        }
    }

    /**
     * 新增互動紀錄
     * @param {Object} data 
     * @param {Object} user 
     */
    async createInteraction(data, user) {
        try {
            // 防呆：確保 user 物件存在，避免 undefined 造成 Writer 崩潰
            const safeUser = user || {};
            
            const newId = await this.interactionWriter.createInteraction(data, safeUser);
            this.interactionReader.invalidateCache('interactions');
            return { success: true, id: newId };
        } catch (error) {
            console.error('[InteractionService] createInteraction Error:', error);
            throw error;
        }
    }

    /**
     * 更新互動紀錄
     * @param {string} id 
     * @param {Object} data 
     * @param {Object} user 
     */
    async updateInteraction(id, data, user) {
        try {
            const safeUser = user || {};
            
            await this.interactionWriter.updateInteraction(id, data, safeUser);
            this.interactionReader.invalidateCache('interactions');
            return { success: true };
        } catch (error) {
            console.error('[InteractionService] updateInteraction Error:', error);
            throw error;
        }
    }

    /**
     * 刪除互動紀錄
     * @param {string} id 
     * @param {Object} user 
     */
    async deleteInteraction(id, user) {
        try {
            const safeUser = user || {};
            
            await this.interactionWriter.deleteInteraction(id, safeUser);
            this.interactionReader.invalidateCache('interactions');
            return { success: true };
        } catch (error) {
            console.error('[InteractionService] deleteInteraction Error:', error);
            throw error;
        }
    }
}

module.exports = InteractionService;