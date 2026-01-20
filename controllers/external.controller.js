/**
 * controllers/external.controller.js
 * 外部服務控制器 (Google Drive, Gemini AI)
 * * @version 6.1.3 (Fixed: Image Stream Proxy)
 * @date 2026-01-15
 * @description 修復名片預覽功能，將 Drive 檔案以串流(Stream)方式直接回傳給前端。
 */

const { handleApiError } = require('../middleware/error.middleware');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// --- Gemini AI 配置 (保留原功能) ---
// 注意：確保 .env 中有 GEMINI_API_KEY
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const MODEL_CONFIG = {
    primary: "gemini-2.5-flash-lite", 
    fallbacks: [
        "gemini-1.5-flash", // 降級使用穩定版
        "gemini-pro"
    ]
};

// 初始化 AI 模型輔助函式
function initializeGeminiModel(modelName) {
    try {
        return genAI.getGenerativeModel({ model: modelName });
    } catch (error) {
        console.warn(`[AI] 模型 ${modelName} 初始化失敗:`, error.message);
        return null;
    }
}

// 帶有備援機制的生成函式
async function generateWithFallback(prompt) {
    const modelsToTry = [MODEL_CONFIG.primary, ...MODEL_CONFIG.fallbacks];
    let lastError = null;

    for (const modelName of modelsToTry) {
        try {
            console.log(`🤖 [AI] 嘗試使用模型: ${modelName}`);
            const model = initializeGeminiModel(modelName);
            if (!model) continue;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            return response.text();
        } catch (error) {
            console.warn(`⚠️ [AI] 模型 ${modelName} 生成失敗:`, error.message);
            lastError = error;
            // 繼續嘗試下一個模型
        }
    }
    throw lastError || new Error('所有 AI 模型皆無法回應');
}

// =======================================================
// 🎮 Controller Methods
// =======================================================

// POST /api/external/companies/:companyName/profile
// 生成公司簡介 (AI) - 保持原樣
exports.generateCompanyProfile = async (req, res) => {
    const { companyName } = req.params;

    if (!companyName) {
        return res.status(400).json({ success: false, error: '缺少公司名稱' });
    }

    try {
        const prompt = `
            請為一家名為「${companyName}」的公司撰寫一段簡短的專業簡介（約 150 字）。
            重點包含：
            1. 預測其可能的主營業務（基於名稱推測，若不確定請語帶保留）。
            2. 市場定位。
            3. 語氣專業且正面。
            請直接輸出內容，不要包含 Markdown 格式或額外說明。
        `;

        const aiResponse = await generateWithFallback(prompt);
        
        // 回傳符合前端預期的格式
        res.json({ 
            success: true, 
            profile: aiResponse,
            source: 'Gemini AI'
        });

    } catch (error) {
        handleApiError(res, error, 'Generate Company Profile');
    }
};

// GET /api/drive/thumbnail (相容舊路徑) 或 /api/external/thumbnail
// 取得 Google Drive 檔案縮圖 (串流代理)
// ★★★ 修復重點：改為串流回傳，而非 JSON ★★★
exports.getDriveThumbnail = async (req, res) => {
    const { fileId, link } = req.query;
    let targetFileId = fileId;

    // 1. 若無 fileId，嘗試從 link 解析
    if (!targetFileId && link) {
        try {
            // 支援標準 Drive 連結與 ID 參數連結
            const match = link.match(/\/d\/([a-zA-Z0-9_-]{25,})/) || link.match(/id=([a-zA-Z0-9_-]{25,})/);
            if (match && match[1]) targetFileId = match[1];
        } catch (e) { 
            console.warn(`[Drive API] 無法從連結解析 File ID: ${link}`, e); 
        }
    }

    if (!targetFileId) {
        // 若無法解析，回傳 400，前端會顯示預設圖示
        return res.status(400).send('Invalid File ID');
    }

    try {
        // 2. 獲取 Drive Client (使用 v6 依賴注入)
        const services = req.app.get('services');
        if (!services || !services.googleClientService) {
            throw new Error('GoogleClientService not initialized');
        }

        // 取得已驗證的 Drive Client
        const drive = await services.googleClientService.getDriveClient();

        // 3. 請求檔案串流 (關鍵參數：alt='media')
        // 設定 responseType: 'stream' 以便直接 pipe 給前端
        const response = await drive.files.get(
            { fileId: targetFileId, alt: 'media' },
            { responseType: 'stream' }
        );

        // 4. 設定正確的 Header
        // 轉發 Content-Type (例如 image/jpeg)
        if (response.headers['content-type']) {
            res.setHeader('Content-Type', response.headers['content-type']);
        }
        
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }

        // 5. Pipe 串流 (直接對接)
        // 將 Google 的資料流直接導向 Express 的回應流
        response.data.pipe(res);

        // 錯誤處理：監聽串流錯誤，避免伺服器崩潰
        response.data.on('error', (streamErr) => {
            console.error('[Drive Stream] 串流傳輸錯誤:', streamErr);
            if (!res.headersSent) {
                res.status(500).send('Image Stream Error');
            }
        });

    } catch (error) {
        console.error(`[Drive API] 讀取圖片失敗 (ID: ${targetFileId}):`, error.message);
        // 若是 404 或權限不足，回傳標準錯誤
        if (!res.headersSent) {
            res.status(404).send('Image Not Found');
        }
    }
};