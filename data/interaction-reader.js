/**
 * data/interaction-reader.js
 * 專門負責讀取所有與「互動紀錄」相關資料的類別
 * * @version 5.0.0 (Phase 5 Refactoring)
 * @date 2026-01-09
 * @description 實作 Strict Mode 依賴注入，並修正內部 OpportunityReader 與 CompanyReader 的引用。
 */

const BaseReader = require('./base-reader');

class InteractionReader extends BaseReader {
    /**
     * @param {Object} sheets - Google Sheets API Client
     * @param {string} spreadsheetId - [Required] 指定要讀取的 Sheet ID
     */
    constructor(sheets, spreadsheetId) {
        super(sheets, spreadsheetId);
    }

    /**
     * 取得所有互動紀錄
     * @returns {Promise<Array<object>>}
     */
    async getInteractions() {
        const cacheKey = 'interactions';
        const range = `${this.config.SHEETS.INTERACTIONS}!A:M`;

        const rowParser = (row, index) => ({
            rowIndex: index + 2,
            interactionId: row[0] || '',
            opportunityId: row[1] || '',
            interactionTime: row[2] || '',
            eventType: row[3] || '',
            eventTitle: row[4] || '',
            contentSummary: row[5] || '',
            participants: row[6] || '',
            nextAction: row[7] || '',
            attachmentLink: row[8] || '',
            calendarEventId: row[9] || '',
            recorder: row[10] || '',
            createdTime: row[11] || '',
            companyId: row[12] || '' 
        });

        const sorter = (a, b) => {
            const dateA = new Date(a.interactionTime);
            const dateB = new Date(b.interactionTime);
            if (isNaN(dateB)) return -1;
            if (isNaN(dateA)) return 1;
            return dateB - dateA;
        };

        return this._fetchAndCache(cacheKey, range, rowParser, sorter);
    }

    /**
     * 取得最新的幾筆互動紀錄
     * @param {{limit: number}} options
     * @returns {Promise<Array<object>>}
     */
    async getRecentInteractions({ limit = 10 }) {
        const allInteractions = await this.getInteractions();
        return allInteractions.slice(0, limit);
    }

    /**
     * 搜尋所有互動紀錄，並支援 fetchAll 參數以繞過分頁
     */
    async searchAllInteractions(query, page = 1, fetchAll = false) {
        const [allInteractions, allOpportunities, allCompanies] = await Promise.all([
            this.getInteractions(),
            this.getOpportunities(),
            this.getCompanyList()
        ]);

        const opportunityNameMap = new Map(allOpportunities.map(opp => [opp.opportunityId, opp.opportunityName]));
        const companyNameMap = new Map(allCompanies.map(comp => [comp.companyId, comp.companyName]));

        let interactions = allInteractions.map(interaction => {
            let contextName = '未指定'; 

            if (interaction.opportunityId && opportunityNameMap.has(interaction.opportunityId)) {
                contextName = opportunityNameMap.get(interaction.opportunityId); 
            } else if (interaction.companyId && companyNameMap.has(interaction.companyId)) {
                contextName = companyNameMap.get(interaction.companyId); 
            } else if (interaction.opportunityId) {
                contextName = '未知機會'; 
            } else if (interaction.companyId) {
                contextName = '未知公司'; 
            }

            return {
                ...interaction,
                opportunityName: contextName 
            };
        });

        if (query) {
            const searchTerm = query.toLowerCase();
            interactions = interactions.filter(i =>
                (i.contentSummary && i.contentSummary.toLowerCase().includes(searchTerm)) ||
                (i.eventTitle && i.eventTitle.toLowerCase().includes(searchTerm)) ||
                (i.opportunityName && i.opportunityName.toLowerCase().includes(searchTerm)) ||
                (i.recorder && i.recorder.toLowerCase().includes(searchTerm))
            );
        }
        
        if (fetchAll) {
            return {
                data: interactions,
                pagination: {
                    current: 1,
                    total: 1,
                    totalItems: interactions.length,
                    hasNext: false,
                    hasPrev: false
                }
            };
        }

        const pageSize = this.config.PAGINATION.INTERACTIONS_PER_PAGE;
        const startIndex = (page - 1) * pageSize;
        const paginated = interactions.slice(startIndex, startIndex + pageSize);
        
        return {
            data: paginated,
            pagination: { 
                current: page, 
                total: Math.ceil(interactions.length / pageSize), 
                totalItems: interactions.length, 
                hasNext: (startIndex + pageSize) < interactions.length, 
                hasPrev: page > 1 
            }
        };
    }

    // Phase 2: 傳遞 ID
    async getOpportunities() {
        const OpportunityReader = require('./opportunity-reader');
        const opportunityReader = new OpportunityReader(this.sheets, this.targetSpreadsheetId);
        return opportunityReader.getOpportunities();
    }

    // Phase 2: 傳遞 ID
    async getCompanyList() {
        const CompanyReader = require('./company-reader');
        const companyReader = new CompanyReader(this.sheets, this.targetSpreadsheetId);
        return companyReader.getCompanyList();
    }
}

module.exports = InteractionReader;