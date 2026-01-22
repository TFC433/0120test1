/**
 * services/system-service.js
 * 系統服務模組
 * * @version 1.0.0 (Phase B - System Module Layering)
 * @date 2026-01-22
 * @description 封裝系統層級的業務邏輯，包含設定讀取、快取管理與狀態查詢。
 */

class SystemService {
    /**
     * @param {SystemReader} systemReader 
     * @param {SystemWriter} systemWriter 
     */
    constructor(systemReader, systemWriter) {
        this.systemReader = systemReader;
        this.systemWriter = systemWriter;
    }

    /**
     * 取得系統全域設定
     */
    async getSystemConfig() {
        return await this.systemReader.getSystemConfig();
    }

    /**
     * 清除後端快取
     */
    async invalidateCache() {
        // 清除所有快取
        this.systemReader.invalidateCache(null);
        return { success: true, message: '後端所有快取已清除' };
    }

    /**
     * 取得系統最後寫入狀態
     */
    async getSystemStatus() {
        // 透過 Reader 的公開 Getter 取得狀態，不直接存取 Cache
        const lastWrite = this.systemReader.getLastWriteTimestamp();
        return { success: true, lastWriteTimestamp: lastWrite };
    }
}

module.exports = SystemService;