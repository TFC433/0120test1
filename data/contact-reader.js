/**
 * data/contact-reader.js
 * 專門負責讀取所有與「聯絡人」相關資料的類別
 * * @version 6.1.0 (Fixed: Field Mapping & Strict Layering)
 * @date 2026-01-15
 * @description 確保 Potential Contacts 回傳 driveLink 與 rowIndex，修復名片按鈕與升級功能。
 */

const BaseReader = require('./base-reader');

class ContactReader extends BaseReader {
    /**
     * @param {Object} sheets - Google Sheets API Client
     * @param {string} spreadsheetId - [Required] 指定要讀取的 Sheet ID
     */
    constructor(sheets, spreadsheetId) {
        super(sheets, spreadsheetId);
    }

    /**
     * 內部輔助函式，用於建立標準化的 JOIN Key
     */
    _normalizeKey(str = '') {
        return String(str).toLowerCase().trim();
    }

    /**
     * 取得原始名片資料 (潛在客戶)
     * 用途：對應前端「潛在客戶」頁面 (dashboard.html#contacts)
     * @param {number} [limit=2000] - 讀取上限
     * @returns {Promise<Array<object>>}
     */
    async getContacts(limit = 2000) {
        const cacheKey = 'contacts';
        const range = `${this.config.SHEETS.CONTACTS}!A:Y`;

        const rowParser = (row, index) => {
            const driveLink = row[this.config.CONTACT_FIELDS.DRIVE_LINK] || '';
            
            return {
                // 核心識別欄位 (重要：Upgrade 功能依賴此 rowIndex)
                rowIndex: index + 2,
                
                // 基礎資料欄位
                createdTime: row[this.config.CONTACT_FIELDS.TIME] || '',
                name: row[this.config.CONTACT_FIELDS.NAME] || '',
                company: row[this.config.CONTACT_FIELDS.COMPANY] || '',
                position: row[this.config.CONTACT_FIELDS.POSITION] || '',
                department: row[this.config.CONTACT_FIELDS.DEPARTMENT] || '',
                phone: row[this.config.CONTACT_FIELDS.PHONE] || '',
                mobile: row[this.config.CONTACT_FIELDS.MOBILE] || '',
                email: row[this.config.CONTACT_FIELDS.EMAIL] || '',
                website: row[this.config.CONTACT_FIELDS.WEBSITE] || '',
                address: row[this.config.CONTACT_FIELDS.ADDRESS] || '',
                confidence: row[this.config.CONTACT_FIELDS.CONFIDENCE] || '',
                status: row[this.config.CONTACT_FIELDS.STATUS] || '',
                
                // 圖片連結 (名片預覽按鈕依賴此欄位)
                driveLink: driveLink,
                // 【相容性修復】若前端舊程式碼使用 cardImage，這裡提供別名
                cardImage: driveLink,
                
                // LINE 整合資訊
                lineUserId: row[this.config.CONTACT_FIELDS.LINE_USER_ID] || '',
                userNickname: row[this.config.CONTACT_FIELDS.USER_NICKNAME] || ''
            };
        };
        
        const sorter = (a, b) => {
            const dateA = new Date(a.createdTime);
            const dateB = new Date(b.createdTime);
            if (isNaN(dateB)) return -1;
            if (isNaN(dateA)) return 1;
            return dateB - dateA;
        };

        const allData = await this._fetchAndCache(cacheKey, range, rowParser, sorter);
        
        // 回傳前 slice 限制筆數
        return allData.slice(0, limit);
    }

    /**
     * 取得聯絡人總表 (已建檔正式聯絡人)
     * 用途：對應前端「聯絡人列表」頁面
     */
    async getContactList() {
        const cacheKey = 'contactList';
        const range = `${this.config.SHEETS.CONTACT_LIST}!A:M`;

        const rowParser = (row) => ({
            contactId: row[0] || '',
            sourceId: row[1] || '',
            name: row[2] || '',
            companyId: row[3] || '',
            department: row[4] || '',
            position: row[5] || '',
            mobile: row[6] || '',
            phone: row[7] || '',
            email: row[8] || '',
            createdTime: row[9] || '',
            lastUpdateTime: row[10] || '',
            creator: row[11] || '',
            lastModifier: row[12] || ''
        });

        return this._fetchAndCache(cacheKey, range, rowParser);
    }
    
    /**
     * 讀取並快取所有的「機會-聯絡人」關聯
     * 用途：機會案件詳情頁顯示相關聯絡人
     */
    async getAllOppContactLinks() {
        const cacheKey = 'oppContactLinks';
        const range = `${this.config.SHEETS.OPPORTUNITY_CONTACT_LINK}!A:F`;

        const rowParser = (row) => ({
            linkId: row[this.config.OPP_CONTACT_LINK_FIELDS.LINK_ID] || '',
            opportunityId: row[this.config.OPP_CONTACT_LINK_FIELDS.OPPORTUNITY_ID] || '',
            contactId: row[this.config.OPP_CONTACT_LINK_FIELDS.CONTACT_ID] || '',
            createTime: row[this.config.OPP_CONTACT_LINK_FIELDS.CREATE_TIME] || '',
            status: row[this.config.OPP_CONTACT_LINK_FIELDS.STATUS] || '',
            creator: row[this.config.OPP_CONTACT_LINK_FIELDS.CREATOR] || '',
        });

        return this._fetchAndCache(cacheKey, range, rowParser);
    }

    /**
     * 根據機會 ID 取得關聯的聯絡人詳細資料 (含名片圖檔映射)
     * 用途：OpportunityService 呼叫此方法來組裝詳情資料
     */
    async getLinkedContacts(opportunityId) {
        const [allLinks, allContacts, allCompanies, allPotentialContacts] = await Promise.all([
            this.getAllOppContactLinks(),
            this.getContactList(),
            this.getCompanyList(), 
            this.getContacts(9999)    
        ]);

        const linkedContactIds = new Set();
        for (const link of allLinks) {
            if (link.opportunityId === opportunityId && link.status === 'active') {
                linkedContactIds.add(link.contactId);
            }
        }
        
        if (linkedContactIds.size === 0) return [];
        
        // 建立公司名稱映射
        const companyNameMap = new Map(allCompanies.map(c => [c.companyId, c.companyName]));
        
        // 建立潛在客戶名片圖檔映射 (用 Name+Company 做 Key)
        const potentialCardMap = new Map();
        allPotentialContacts.forEach(pc => {
            if (pc.name && pc.company && pc.driveLink) {
                const key = this._normalizeKey(pc.name) + '|' + this._normalizeKey(pc.company);
                if (!potentialCardMap.has(key)) {
                    potentialCardMap.set(key, pc.driveLink);
                }
            }
        });

        const linkedContacts = allContacts
            .filter(contact => linkedContactIds.has(contact.contactId))
            .map(contact => {
                let driveLink = ''; 
                const companyName = companyNameMap.get(contact.companyId) || '';

                // 嘗試找回原始名片圖檔
                if (contact.name && companyName) {
                    const key = this._normalizeKey(contact.name) + '|' + this._normalizeKey(companyName);
                    driveLink = potentialCardMap.get(key) || ''; 
                }

                return {
                    contactId: contact.contactId,
                    sourceId: contact.sourceId, 
                    name: contact.name,
                    companyId: contact.companyId,
                    department: contact.department,
                    position: contact.position,
                    mobile: contact.mobile,
                    phone: contact.phone,
                    email: contact.email,
                    companyName: companyName, // 這裡已經轉成名稱
                    driveLink: driveLink 
                };
            });
        
        return linkedContacts;
    }

    /**
     * 搜尋潛在客戶 (簡易過濾)
     * 用途：Service 層呼叫，或 API 直接呼叫
     */
    async searchContacts(query) {
        let contacts = await this.getContacts();
        
        // 過濾掉全空的無效資料
        contacts = contacts.filter(contact => 
            (contact.name || contact.company)
        );

        if (query) {
            const searchTerm = query.toLowerCase();
            contacts = contacts.filter(c =>
                (c.name && c.name.toLowerCase().includes(searchTerm)) ||
                (c.company && c.company.toLowerCase().includes(searchTerm))
            );
        }
        return { data: contacts };
    }

    /**
     * 搜尋已建檔聯絡人並分頁 (Join Company Name)
     * 用途：提供給 searchContactList API 使用
     */
    async searchContactList(query, page = 1) {
        const [allContacts, allCompanies] = await Promise.all([
            this.getContactList(),
            this.getCompanyList() 
        ]);
    
        const companyNameMap = new Map(allCompanies.map(c => [c.companyId, c.companyName]));
    
        // 組合顯示資料
        let contacts = allContacts.map(contact => ({
            ...contact,
            companyName: companyNameMap.get(contact.companyId) || contact.companyId 
        }));
    
        // 關鍵字篩選
        if (query) {
            const searchTerm = query.toLowerCase();
            contacts = contacts.filter(c =>
                (c.name && c.name.toLowerCase().includes(searchTerm)) ||
                (c.companyName && c.companyName.toLowerCase().includes(searchTerm))
            );
        }
        
        // 分頁處理
        const pageSize = this.config.PAGINATION.CONTACTS_PER_PAGE;
        const startIndex = (page - 1) * pageSize;
        const paginated = contacts.slice(startIndex, startIndex + pageSize);
        
        return {
            data: paginated,
            pagination: { 
                current: page, 
                total: Math.ceil(contacts.length / pageSize), 
                totalItems: contacts.length, 
                hasNext: (startIndex + pageSize) < contacts.length, 
                hasPrev: page > 1 
            }
        };
    }

    /**
     * 內部輔助：取得公司列表 (透過 CompanyReader)
     * 為了避免循環依賴，這裡動態 require 或是在初始化時確保順序
     * 在 v6 架構下，BaseReader 會傳遞 sheets client
     */
    async getCompanyList() {
        const CompanyReader = require('./company-reader'); 
        // 確保將當前的 sheets client 與 spreadsheetId 傳遞給子 Reader
        const companyReader = new CompanyReader(this.sheets, this.targetSpreadsheetId);
        return companyReader.getCompanyList();
    }
}

module.exports = ContactReader;