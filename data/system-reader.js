/**
 * data/system-reader.js
 * 專門負責讀取系統級資料的類別 (系統設定、使用者)
 * * @version 5.0.0 (Phase 5 Refactoring)
 * @date 2026-01-09
 * @description 實作 Strict Mode 依賴注入。
 */

const BaseReader = require('./base-reader');

class SystemReader extends BaseReader {
    /**
     * @param {Object} sheets - Google Sheets API Client
     * @param {string} spreadsheetId - [Required] 指定要讀取的 Sheet ID (可能是 SYSTEM_ID 或 AUTH_ID)
     * 注意：SystemReader 比較特殊，它可能同時需要讀 System Config 和 User List。
     * 在 Phase 5 初期，我們讓它接收一個主 ID，但如果 User List 在不同 Sheet，需要特別處理。
     * 目前為了相容，我們先接收一個 ID，但在 getUsers() 時判斷是否需要切換。
     */
    constructor(sheets, spreadsheetId) {
        super(sheets, spreadsheetId);
    }

    /**
     * 取得系統設定工作表內容
     * @returns {Promise<object>}
     */
    async getSystemConfig() {
        const cacheKey = 'systemConfig';
        const now = Date.now();
        
        if (this.cache[cacheKey] && this.cache[cacheKey].data && (now - this.cache[cacheKey].timestamp < this.CACHE_DURATION)) {
            return this.cache[cacheKey].data;
        }

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.targetSpreadsheetId, // 使用注入的 ID (應為 SYSTEM_ID)
                range: `${this.config.SHEETS.SYSTEM_CONFIG}!A:I`,
            });
            
            const rows = response.data.values || [];
            const settings = {};
            
            // 初始化預設值
            if (!settings['事件類型']) {
                settings['事件類型'] = [
                    { value: 'general', note: '一般', order: 1, color: '#6c757d' },
                    { value: 'iot', note: 'IOT', order: 2, color: '#007bff' },
                    { value: 'dt', note: 'DT', order: 3, color: '#28a745' },
                    { value: 'dx', note: 'DX', order: 4, color: '#ffc107' },
                    { value: 'legacy', note: '舊事件', order: 5, color: '#dc3545' }
                ];
            }
            if (!settings['日曆篩選規則']) settings['日曆篩選規則'] = []; 
            
            if (rows.length > 1) {
                rows.slice(1).forEach(row => {
                    const [type, item, order, enabled, note, color, value2, value3, category] = row;
                    
                    if (enabled === 'TRUE' && type && item) {
                        if (!settings[type]) settings[type] = [];
                        
                        const exists = settings[type].find(i => i.value === item);
                        if (exists) {
                            exists.note = note || item;
                            exists.order = parseInt(order) || 99;
                        } else {
                            settings[type].push({
                                value: item,
                                note: note || item,
                                order: parseInt(order) || 99,
                                color: color || null,
                                value2: value2 || null, 
                                value3: value3 || null, 
                                category: category || '其他' 
                            });
                        }
                    }
                });
            }
            
            Object.keys(settings).forEach(type => settings[type].sort((a, b) => a.order - b.order));
            
            this.cache[cacheKey] = { data: settings, timestamp: now };
            return settings;

        } catch (error) {
            console.error('❌ [DataReader] 讀取系統設定失敗:', error);
            return this.config.DEFAULT_SETTINGS || {};
        }
    }

    /**
     * 取得使用者名冊
     * @returns {Promise<Array<object>>}
     */
    async getUsers() {
        const cacheKey = 'users';
        const range = '使用者名冊!A:D';
        
        // ★★★ 特別處理：Auth 資料可能在另一個 Sheet ★★★
        // 如果 config.IDS.AUTH 存在且不同於當前的 targetSpreadsheetId，我們優先使用 Config 定義的 Auth ID。
        // 但依照依賴注入原則，最好是由 Container 注入 AuthReader。
        // 為了不拆分 SystemReader，這裡我們暫時允許它讀取 Global Config 的 AUTH ID。
        // 在嚴格模式下，this.config.IDS.AUTH 應該是存在的。
        const targetSheetId = this.config.IDS.AUTH || this.targetSpreadsheetId;

        const now = Date.now();
        if (this.cache[cacheKey] && this.cache[cacheKey].data && (now - this.cache[cacheKey].timestamp < this.CACHE_DURATION)) {
            return this.cache[cacheKey].data;
        }

        console.log(`🔐 [Auth] 讀取使用者名冊 (Sheet ID: ...${targetSheetId.slice(-6)})...`);

        try {
            // 注意：這裡我們使用 targetSheetId 而不是 this.targetSpreadsheetId
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: targetSheetId,
                range: range,
            });

            const rows = response.data.values || [];
            
            const allUsers = rows.map((row, index) => {
                const username = row[0] ? row[0].trim() : '';
                const passwordHash = row[1] ? row[1].trim() : '';
                const displayName = row[2] ? row[2].trim() : '';
                const role = row[3] ? row[3].trim().toLowerCase() : 'sales';

                return {
                    rowIndex: index + 1,
                    username,
                    passwordHash,
                    displayName,
                    role
                };
            }).filter(user => user.username && user.passwordHash);

            this.cache[cacheKey] = { data: allUsers, timestamp: now };
            return allUsers;

        } catch (error) {
            console.error('❌ [DataReader] 讀取使用者名冊失敗:', error.message);
            return [];
        }
    }
}

module.exports = SystemReader;