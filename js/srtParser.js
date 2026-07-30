/**
 * SRT Subtitle Parser & Vocal Rhythm Timing Extractor
 */
class SRTParser {
    /**
     * SRTテキスト文字列をパースして構造化オブジェクトの配列を返す
     * @param {string} srtText 
     * @returns {Array<{id: number, startTime: number, endTime: number, text: string}>}
     */
    static parse(srtText) {
        if (!srtText || typeof srtText !== 'string') return [];

        const normalized = srtText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const blocks = normalized.trim().split(/\n\s*\n/);
        const results = [];

        for (const block of blocks) {
            const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length < 2) continue;

            let timeIndex = -1;
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].includes('-->')) {
                    timeIndex = i;
                    break;
                }
            }

            if (timeIndex === -1) continue;

            const timeStr = lines[timeIndex];
            const [startStr, endStr] = timeStr.split('-->').map(s => s.trim());
            const startTime = this.timeToSeconds(startStr);
            const endTime = this.timeToSeconds(endStr);
            const text = lines.slice(timeIndex + 1).join(' ');

            if (!isNaN(startTime) && !isNaN(endTime) && endTime > startTime) {
                results.push({
                    id: results.length + 1,
                    startTime,
                    endTime,
                    text
                });
            }
        }

        return results;
    }

    /**
     * "00:01:23,456" または "00:01:23.456" を秒数に変換
     * @param {string} timeStr 
     * @returns {number}
     */
    static timeToSeconds(timeStr) {
        if (!timeStr) return 0;
        const cleaned = timeStr.replace(',', '.');
        const parts = cleaned.split(':');
        if (parts.length < 3) return 0;

        const hours = parseFloat(parts[0]) || 0;
        const minutes = parseFloat(parts[1]) || 0;
        const seconds = parseFloat(parts[2]) || 0;

        return hours * 3600 + minutes * 60 + seconds;
    }

    /**
     * SRT字幕エントリから各音節・ノーツ用アタックタイミング配列を自動算出
     * @param {Array} srtEntries 
     * @returns {Array<{time: number, isHold: boolean, duration: number, text: string}>}
     */
    static extractVocalNoteTimings(srtEntries) {
        const timings = [];

        for (const entry of srtEntries) {
            const duration = entry.endTime - entry.startTime;
            const text = entry.text.trim();
            if (!text || duration <= 0) continue;

            // 文字数または単語数で分割タイミングを計算
            const chars = text.replace(/\s+/g, '');
            const charCount = Math.max(1, chars.length);

            // 長い文言の場合は文字ごとに分散、短い場合はホールドノーツ化
            if (duration > 1.5 && charCount <= 4) {
                // 長押しノーツ (Hold Note)
                timings.push({
                    time: entry.startTime,
                    isHold: true,
                    duration: duration * 0.8,
                    text: text
                });
            } else {
                // 均等分割タップノーツ
                const step = duration / charCount;
                for (let i = 0; i < charCount; i++) {
                    const noteTime = entry.startTime + (i * step);
                    timings.push({
                        time: noteTime,
                        isHold: false,
                        duration: 0,
                        text: chars[i] || text
                    });
                }
            }
        }

        return timings;
    }

    /**
     * デモ用のSRT歌詞データを生成して返す
     * @returns {string}
     */
    static createDemoSRTText() {
        return `1
00:00:01,000 --> 00:00:04,000
Welcome to AMU TUNE!

2
00:00:05,000 --> 00:00:08,000
Feel the rhythm of the cyber sound.

3
00:00:09,000 --> 00:00:12,000
Keep the combo going high!

4
00:00:13,000 --> 00:00:16,000
3D canvas ready for you.

5
00:00:17,500 --> 00:00:20,500
Let the beat guide your fingers!

6
00:00:21,500 --> 00:00:24,500
Hit the notes on perfect timing.

7
00:00:25,500 --> 00:00:28,500
Synthesizer wave rising up!

8
00:00:29,000 --> 00:00:32,000
Can you feel it? Let's go!

9
00:00:33,000 --> 00:00:36,000
Double tap! Hold the line!

10
00:00:37,000 --> 00:00:40,000
Final stage, keep the heat!

11
00:00:41,000 --> 00:00:44,000
Excellent performance!

12
00:00:45,000 --> 00:00:48,000
AMU TUNE Sunrise completed!`;
    }
}
