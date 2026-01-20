/**
 * data/contact-writer.js
 * 聯絡人資料寫入器 (Reverted to 0109 Logic)
 * * @version 7.0.3 (Revert: Use 0109 Native API Logic)
 * @date 2026-01-15
 * @description 
 * 1. 完全參照 0109 版本 updateRawContact 的實作邏輯。
 * 2. 使用固定索引 (CONTACT_FIELDS) 而非動態標頭，解決 this.getSheet is not a function 問題。
 * 3. 配合 ServiceContainer 注入 contactReader 以處理快取。
 */
const BaseWriter = require('./base-writer');

class ContactWriter extends BaseWriter {
    /**
     * @param {Object} sheets - Google Sheets API Client
     * @param {string} spreadsheetId - 目標 Spreadsheet ID
     * @param {Object} contactReader - 用於清除快取
     */
    constructor(sheets, spreadsheetId, contactReader) {
        super(sheets, spreadsheetId);
        this.contactReader = contactReader;
        
        // 定義 Sheet 名稱 (沿用 config 定義)
        // 0109 使用 'Contact_List' 和 '原始名片資料'
        this.SHEET_OFFICIAL = this.config.SHEETS.CONTACT_LIST || 'Contact_List';
        this.SHEET_POTENTIAL = this.config.SHEETS.CONTACTS || 'Raw_Data'; 
    }

    /**
     * 建立新聯絡人 (正式) - 保持 v7 格式
     * @param {Object} contactData 
     */
    async createContact(contactData) {
        try {
            const newRow = [
                contactData.id,
                contactData.sourceId || 'MANUAL',
                contactData.name,
                contactData.company,
                contactData.department || '', 
                contactData.jobTitle,
                contactData.phone, // Mobile
                contactData.tel || '', // Company Phone
                contactData.email,
                new Date().toISOString(),
                new Date().toISOString(),
                contactData.creator || 'System',
                contactData.modifier || 'System'
            ];

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.targetSpreadsheetId,
                range: this.SHEET_OFFICIAL,
                valueInputOption: 'USER_ENTERED',
                resource: { values: [newRow] }
            });

            console.log(`✅ [ContactWriter] Created contact: ${contactData.name}`);
            if (this.contactReader) this.contactReader.invalidateCache('contactList');
            return contactData.id;

        } catch (error) {
            console.error('❌ [ContactWriter] Create Failed:', error);
            throw error;
        }
    }

    /**
     * 更新潛在客戶 (Raw_Data / 原始名片資料)
     * 完全復刻 0109 的 updateRawContact 邏輯
     * * @param {number} rowIndex - Google Sheet 的列索引 (1-based)
     * @param {Object} data - 更新的資料 { name, company, position, email, mobile, notes }
     * @param {string} modifier - 修改者名稱
     */
    async updatePotentialContact(rowIndex, data, modifier) {
        // 0109 邏輯：基本檢核
        if (isNaN(parseInt(rowIndex)) || rowIndex <= 1) {
            throw new Error(`無效的 rowIndex: ${rowIndex}`);
        }

        console.log(`📝 [ContactWriter] 更新潛在客戶 (Native) - Row: ${rowIndex} by ${modifier}`);

        // 1. 讀取整列資料以確保不覆蓋其他未修改的欄位 (A:Y)
        // 這裡我們假設最大寬度到 Y 欄 (0109 規格)
        const range = `${this.SHEET_POTENTIAL}!A${rowIndex}:Y${rowIndex}`;
        
        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.targetSpreadsheetId,
            range: range,
        });

        const currentRow = response.data.values ? response.data.values[0] : [];
        if (currentRow.length === 0) {
            throw new Error(`在 "${this.SHEET_POTENTIAL}" Row ${rowIndex} 找不到資料`);
        }

        // 2. 使用 Config 定義的固定索引 (最穩定)
        const F = this.config.CONTACT_FIELDS;

        // 如果讀取的列比定義的欄位短，補齊空字串以免索引錯誤
        const maxIndex = Math.max(F.NAME, F.COMPANY, F.POSITION, F.MOBILE, F.EMAIL);
        while (currentRow.length <= maxIndex) {
            currentRow.push('');
        }

        // 更新對應欄位
        if (data.name !== undefined) currentRow[F.NAME] = data.name;
        if (data.company !== undefined) currentRow[F.COMPANY] = data.company;
        if (data.position !== undefined) currentRow[F.POSITION] = data.position;
        if (data.mobile !== undefined) currentRow[F.MOBILE] = data.mobile;
        if (data.email !== undefined) currentRow[F.EMAIL] = data.email;
        
        // 備註處理：
        // 為了相容前端功能，我們嘗試更新 Notes。
        // 若 config 中沒有定義 NOTES 索引，則我們不寫入，避免破壞結構。
        // 但如果您的 Raw_Data 後面有空位，可以選擇 append。
        // 為了最安全，這裡我們只更新 0109 定義的 5 個欄位。
        // 如果您希望也能更新備註，請確認 config.js 中有 CONTACT_FIELDS.NOTES
        if (F.NOTES !== undefined && data.notes !== undefined) {
             // 補齊
            while (currentRow.length <= F.NOTES) currentRow.push('');
            
            const oldNotes = currentRow[F.NOTES] || '';
            const newNoteEntry = `[${modifier} ${new Date().toLocaleDateString()}] ${data.notes}`;
            currentRow[F.NOTES] = oldNotes ? `${oldNotes}\n${newNoteEntry}` : newNoteEntry;
        }
        
        // 3. 寫回
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.targetSpreadsheetId,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [currentRow] }
        });

        // 4. 清除快取
        if (this.contactReader) {
            this.contactReader.invalidateCache('contacts'); // 對應 0109 的 cache key
        }

        console.log(`✅ [ContactWriter] Updated potential contact at row ${rowIndex}`);
        return true;
    }
}

module.exports = ContactWriter;