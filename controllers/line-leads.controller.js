/**
 * controllers/line-leads.controller.js
 * LINE LIFF 潛在客戶控制器
 * * @version 7.0.0 (Fixed: Remove Silent Failure)
 * @date 2026-01-15
 * @description 
 * 1. 包含完整的 LINE Token 驗證邏輯。
 * 2. 包含 v6.2.0 的 JSON 回傳格式修正。
 * 3. [Fix] 移除 updateLead 中的無聲失敗，強制檢查 Writer 實作。
 */

const { handleApiError } = require('../middleware/error.middleware');
// 假設環境變數中有 LINE_CHANNEL_ID，若無則需補上
const LINE_CHANNEL_ID = process.env.LINE_CHANNEL_ID || '2006367469'; 

class LineLeadsController {
    constructor(contactService, contactWriter) {
        this.contactService = contactService;
        this.contactWriter = contactWriter;
    }

    /**
     * 內部輔助：驗證 LINE ID Token
     */
    async _verifyLineToken(token) {
        try {
            // 呼叫 LINE 官方 API 驗證 Token 有效性
            const params = new URLSearchParams();
            params.append('id_token', token);
            params.append('client_id', LINE_CHANNEL_ID);

            const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error('[LineAuth] Verify Failed:', errText);
                return null;
            }

            const userData = await response.json();
            return userData; // 回傳 LINE 使用者資料 (sub, name, picture...)
        } catch (error) {
            console.error('[LineAuth] Exception:', error.message);
            return null;
        }
    }

    // GET /api/line/leads
    getAllLeads = async (req, res) => {
        try {
            // 1. 手動提取 Token (因為我們移出了 authMiddleware)
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];

            if (!token) {
                return res.status(401).json({ success: false, message: '未提供 Token' });
            }

            // 2. 驗證分流 (Dev vs Prod)
            let user = null;

            if (token === 'TEST_LOCAL_TOKEN') {
                // 🚧 本地開發模式
                console.log('🚧 [Dev] 本地模式：跳過 LINE 驗證');
                user = { sub: 'TEST_USER', name: 'Developer' };
            } else {
                // 🌏 正式環境：執行 LINE 驗證
                user = await this._verifyLineToken(token);
                if (!user) {
                    return res.status(401).json({ success: false, message: 'LINE Token 驗證失敗' });
                }
            }

            // 3. 執行業務邏輯
            if (!this.contactService) {
                throw new Error('ContactService not initialized in Controller');
            }

            const leads = await this.contactService.getPotentialContacts(3000);
            
            // 包裹回傳格式以符合前端 result.success 檢查
            res.json({
                success: true,
                data: leads
            });

        } catch (error) {
            console.error('⚠ Get All Leads Error:', error);
            handleApiError(res, error, 'Get All Leads');
        }
    };

    // PUT /api/line/leads/:rowIndex
    updateLead = async (req, res) => {
        try {
            // 1. 驗證 (同上)
            const authHeader = req.headers['authorization'];
            const token = authHeader && authHeader.split(' ')[1];
            if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });

            if (token !== 'TEST_LOCAL_TOKEN') {
                const user = await this._verifyLineToken(token);
                if (!user) return res.status(401).json({ success: false, message: 'Invalid Token' });
            }

            // 2. 執行更新
            const rowIndex = parseInt(req.params.rowIndex);
            const updateData = req.body;
            // 如果是 Dev 模式，用 Dev 名稱；否則用 LINE User 名稱，或 req.body 傳來的 modifier
            const modifier = updateData.modifier || 'LineUser';

            // ★★★ 關鍵修正：嚴格檢查 Writer 實作 ★★★
            // 原本的無聲失敗邏輯已被移除
            if (!this.contactWriter || !this.contactWriter.updatePotentialContact) {
                throw new Error('Server Error: contactWriter.updatePotentialContact is not implemented.');
            }

            // 直接呼叫，若失敗會由 catch 捕獲並回傳 500
            await this.contactWriter.updatePotentialContact(rowIndex, updateData, modifier);

            res.json({ success: true, message: '更新成功' });

        } catch (error) {
            handleApiError(res, error, 'Update Lead');
        }
    };
}

module.exports = LineLeadsController;