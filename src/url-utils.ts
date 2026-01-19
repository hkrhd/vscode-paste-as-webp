
import { logger } from './logger';

export class UrlUtils {
    /**
     * URLかどうかを簡易判定する
     */
    static isValidUrl(text: string): boolean {
        try {
            const url = new URL(text);
            return url.protocol === 'http:' || url.protocol === 'https:';
        } catch {
            return false;
        }
    }

    /**
     * URLからページタイトルを取得する
     * @param url 取得対象のURL
     * @param timeoutMs タイムアウト時間(ms)
     * @returns タイトルが見つかった場合はその文字列、失敗時はnull
     */
    static async fetchPageTitle(url: string, timeoutMs: number = 300): Promise<string | null> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const response = await fetch(url, {
                    method: 'GET',
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (compatible; VSCode-WebP-Paster/1.0)'
                    }
                });

                if (!response.ok) {
                    logger.debug('UrlUtils', `Fetch failed: ${response.status} ${response.statusText}`);
                    return null;
                }

                // 先頭部分だけ読み込む（タイトルは通常headにあるため全体を読む必要はない）
                // Obj: Read only the beginning to minimize data transfer and processing
                const buffer = await response.arrayBuffer();
                const text = new TextDecoder('utf-8').decode(buffer);

                // タイトルタグの抽出（簡易的な正規表現）
                // 改行を含む場合も考慮
                const match = text.match(/<title[^>]*>([^<]+)<\/title>/i);
                if (match && match[1]) {
                    // HTMLエンティティのデコードが必要だが、今回は簡易実装として
                    // 最低限の空白削除と改行削除のみ行う
                    return match[1].trim().replace(/\s+/g, ' ');
                }

                return null;
            } finally {
                clearTimeout(timeoutId);
            }
        } catch (error) {
            logger.debug('UrlUtils', 'Error fetching page title:', error);
            return null;
        }
    }
}
