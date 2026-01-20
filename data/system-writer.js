/**
 * data/system-writer.js
 * 系統設定寫入器
 * * @version 5.1.0 (Phase 4 Fix)
 * @date 2026-01-13
 * @description 負責處理系統全域設定 (下拉選單等) 與使用者 (User/Auth) 的寫入。
 * 新增：updateSystemPref 方法以支援分類排序儲存。
 */

const BaseWriter = require('./base-writer');

class SystemWriter extends BaseWriter {
    /**
     * @param {Object} sheets - Google Sheets API Client
     * @param {string} spreadsheetId - [Required] 指定要寫入的 Sheet ID (通常為 SYSTEM_ID)
     * @param {Object} systemReader - 用於清除快取的 Reader 實例
     */
    constructor(sheets, spreadsheetId, systemReader) {
        super(sheets, spreadsheetId);
        if (!systemReader) {
            throw new Error('SystemWriter 需要 SystemReader 的實例');
        }
        this.systemReader = systemReader;
    }

    /**
     * 【內部輔助】取得 User 操作的目標 ID
     * 若 config.IDS.AUTH 存在且不同於 targetSpreadsheetId，則使用 AUTH ID。
     */
    _getAuthTargetId() {
        if (this.config.IDS.AUTH && this.config.IDS.AUTH !== this.targetSpreadsheetId) {
            return this.config.IDS.AUTH;
        }
        return this.targetSpreadsheetId;
    }

    /**
     * 更新系統設定 (通用底層方法)
     * @param {Object} configData - { type, value, order, note, color }
     * @param {string} modifier - 修改者
     */
    async updateSystemConfig(configData, modifier) {
        console.log(`⚙️ [SystemWriter] 更新系統設定 [${configData.type}/${configData.value}] by ${modifier}`);
        
        // 系統設定固定位於 this.targetSpreadsheetId (SYSTEM_ID)
        const sheetName = this.config.SHEETS.SYSTEM_CONFIG;
        
        // 準備寫入資料 (Append 模式：Reader 邏輯會讀取最後一筆生效)
        const newRow = [
            configData.type,        // A: 設定類型
            configData.value,       // B: 設定項目
            configData.order || 99, // C: 顯示順序
            'TRUE',                 // D: 啟用狀態
            configData.note || '',  // E: 備註 (這裡通常放 JSON 字串)
            configData.color || '', // F: 顏色
            '',                     // G: 預留
            '',                     // H: 預留
            'System'                // I: Category/Tag
        ];

        try {
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.targetSpreadsheetId,
                range: `${sheetName}!A:I`,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [newRow] }
            });

            // 寫入後立即清除快取，確保前端拿到最新資料
            if (this.systemReader.invalidateCache) {
                this.systemReader.invalidateCache('systemConfig');
            } else if (this.systemReader.clearCache) {
                this.systemReader.clearCache();
            }

            return { success: true };
        } catch (error) {
            console.error('❌ [SystemWriter] updateSystemConfig 失敗:', error);
            throw error;
        }
    }

    /**
     * ★★★ 新增：更新系統偏好設定 (Phase 4 Fix) ★★★
     * 專門用於儲存如 "PRODUCT_CATEGORY_ORDER" 這類 JSON 設定
     * @param {string} item - 設定項目名稱 (如 'PRODUCT_CATEGORY_ORDER')
     * @param {string} note - 設定內容 (通常是 JSON String)
     * @param {string} modifier - 修改者
     */
    async updateSystemPref(item, note, modifier = 'System') {
        return this.updateSystemConfig({
            type: 'SystemPref',  // 固定類型
            value: item,
            note: note,
            order: 0,
            color: ''
        }, modifier);
    }

    /**
     * 建立新使用者
     */
    async createUser(userData) {
        console.log(`👤 [SystemWriter] 建立新使用者: ${userData.username}`);
        
        const targetId = this._getAuthTargetId();
        const sheetName = '使用者名冊'; // 固定名稱

        const newRow = [
            userData.username,
            userData.passwordHash,
            userData.displayName,
            userData.role || 'sales'
        ];

        await this.sheets.spreadsheets.values.append({
            spreadsheetId: targetId,
            range: `${sheetName}!A:D`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [newRow] }
        });

        if (this.systemReader.invalidateCache) this.systemReader.invalidateCache('users');
        return { success: true };
    }

    /**
     * 更新使用者密碼
     */
    async updateUserPassword(username, newPasswordHash) {
        console.log(`🔐 [SystemWriter] 更新使用者密碼: ${username}`);
        
        const targetId = this._getAuthTargetId();
        const sheetName = '使用者名冊';

        // 1. 尋找使用者
        const users = await this.systemReader.getUsers();
        const userIndex = users.findIndex(u => u.username === username);
        
        if (userIndex === -1) throw new Error('找不到該使用者');
        
        const targetRowIndex = users[userIndex].rowIndex;

        // 2. 更新密碼 (Column B -> Index 1)
        const range = `${sheetName}!B${targetRowIndex}`;
        
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: targetId,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[newPasswordHash]] }
        });

        if (this.systemReader.invalidateCache) this.systemReader.invalidateCache('users');
        return { success: true };
    }

    /**
     * 刪除使用者
     */
    async deleteUser(username) {
        console.log(`🗑️ [SystemWriter] 刪除使用者: ${username}`);
        
        const targetId = this._getAuthTargetId();
        const sheetName = '使用者名冊';

        const users = await this.systemReader.getUsers();
        const user = users.find(u => u.username === username);
        
        if (!user) throw new Error('找不到該使用者');

        // 處理跨 Sheet 刪除的情況
        let spreadsheetIdToUse = this.targetSpreadsheetId;
        if (targetId !== this.targetSpreadsheetId) {
            spreadsheetIdToUse = targetId;
        }

        // 取得 SheetId (因為 batchUpdate 需要 sheetId 而不是名稱)
        const sheetId = await this._getSheetIdByValues(spreadsheetIdToUse, sheetName);

        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: spreadsheetIdToUse,
            resource: {
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: sheetId,
                            dimension: 'ROWS',
                            startIndex: user.rowIndex - 1,
                             endIndex: user.rowIndex
                        }
                    }
                }]
            }
        });

        if (this.systemReader.invalidateCache) this.systemReader.invalidateCache('users');
        return { success: true };
    }

    // 輔助：獲取 SheetId
    async _getSheetIdByValues(spreadsheetId, sheetName) {
        const response = await this.sheets.spreadsheets.get({
            spreadsheetId: spreadsheetId,
            fields: 'sheets.properties.title,sheets.properties.sheetId',
        });
        const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
        if (sheet) return sheet.properties.sheetId;
        
        // Fallback: 如果找不到，嘗試使用 config 中的預設名稱比對 (防止大小寫問題)
        // 但這裡先拋出錯誤
        throw new Error(`在 Spreadsheet ${spreadsheetId} 中找不到 ${sheetName}`);
    }
}

module.exports = SystemWriter;