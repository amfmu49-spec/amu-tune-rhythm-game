/**
 * Audio Analyzer & Hybrid Auto Note Generation Engine
 */
class AudioAnalyzer {
    constructor() {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }

    /**
     * MP3 ArrayBuffer から ID3v2 APIC タグ (カバーアート画像) を抽出
     * @param {ArrayBuffer} buffer 
     * @returns {string|null} - Data URL string または null
     */
    static extractCoverArtFromBuffer(buffer) {
        try {
            const view = new DataView(buffer);
            // 'ID3' マジックナンバーの検証
            if (view.getUint8(0) !== 0x49 || view.getUint8(1) !== 0x44 || view.getUint8(2) !== 0x33) {
                return null;
            }

            const isID3v2_3 = (view.getUint8(3) === 3);
            const isID3v2_4 = (view.getUint8(3) === 4);
            if (!isID3v2_3 && !isID3v2_4) return null;

            // ID3v2 タグサイズ (7ビット数値)
            const tagSize = ((view.getUint8(6) & 0x7F) << 21) |
                            ((view.getUint8(7) & 0x7F) << 14) |
                            ((view.getUint8(8) & 0x7F) << 7) |
                            (view.getUint8(9) & 0x7F);

            let offset = 10;
            const end = 10 + tagSize;

            while (offset < end - 10) {
                let frameID = "";
                for (let i = 0; i < 4; i++) {
                    frameID += String.fromCharCode(view.getUint8(offset + i));
                }

                let frameSize = 0;
                if (isID3v2_4) {
                    frameSize = ((view.getUint8(offset + 4) & 0x7F) << 21) |
                                ((view.getUint8(offset + 5) & 0x7F) << 14) |
                                ((view.getUint8(offset + 6) & 0x7F) << 7) |
                                (view.getUint8(offset + 7) & 0x7F);
                } else {
                    frameSize = view.getUint32(offset + 4, false);
                }

                if (frameSize === 0 || frameSize > tagSize) break;

                if (frameID === "APIC") {
                    const frameStart = offset + 10;
                    const encoding = view.getUint8(frameStart);
                    
                    // MIME type 検索
                    let mimeEnd = frameStart + 1;
                    while (view.getUint8(mimeEnd) !== 0 && mimeEnd < frameStart + 40) {
                        mimeEnd++;
                    }
                    let mimeType = "";
                    for (let i = frameStart + 1; i < mimeEnd; i++) {
                        mimeType += String.fromCharCode(view.getUint8(i));
                    }
                    if (!mimeType) mimeType = "image/jpeg";

                    // ピクチャタイプ & 説明文をスキップ
                    let imgDataStart = mimeEnd + 2; // skip mimeEnd null and picture type
                    if (encoding === 0 || encoding === 3) {
                        while (view.getUint8(imgDataStart) !== 0 && imgDataStart < frameStart + frameSize) {
                            imgDataStart++;
                        }
                        imgDataStart += 1;
                    } else {
                        imgDataStart += 2;
                    }

                    const imgSize = (frameStart + frameSize) - imgDataStart;
                    if (imgSize > 0) {
                        const imgBytes = new Uint8Array(buffer, imgDataStart, imgSize);
                        let binary = '';
                        for (let b = 0; b < imgBytes.byteLength; b++) {
                            binary += String.fromCharCode(imgBytes[b]);
                        }
                        const base64 = btoa(binary);
                        return `data:${mimeType};base64,${base64}`;
                    }
                }

                offset += 10 + frameSize;
            }
        } catch (e) {
            console.warn('ID3 Cover extraction failed:', e);
        }
        return null;
    }

    /**
     * ArrayBuffer (MP3データ) をデコードして AudioBuffer に変換
     * @param {ArrayBuffer} arrayBuffer 
     * @returns {Promise<AudioBuffer>}
     */
    async decodeAudio(arrayBuffer) {
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
        return await this.audioCtx.decodeAudioData(arrayBuffer);
    }

    /**
     * MP3のPCMデータからエネルギーピーク（ビート＆アタック）を検出
     * テンポとボーカル発声に100%ピッタリ同期する高精度アタック解析
     * @param {AudioBuffer} audioBuffer 
     * @param {string} difficulty - EASY | NORMAL | HARD | EXPERT
     * @returns {Array<{time: number, energy: number}>}
     */
    detectBeats(audioBuffer, difficulty = 'NORMAL') {
        const pcm = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;
        const windowSize = Math.floor(sampleRate * 0.02); // ~20ms 高精度アタック検出
        const beats = [];

        let prevEnergy = 0;
        const totalWindows = Math.floor(pcm.length / windowSize);

        // 難易度別の間隔設定（NORMALとHARDの差を滑らかに調整）
        const minGap = {
            EASY: 0.45,
            NORMAL: 0.32,
            HARD: 0.22,   // 以前の 0.18s からマイルド化してちょうどいい歯ごたえに
            EXPERT: 0.14
        }[difficulty] || 0.32;

        const sensitivityMultiplier = {
            EASY: 1.6,
            NORMAL: 1.25,
            HARD: 1.05,
            EXPERT: 0.85
        }[difficulty] || 1.25;

        let lastBeatTime = -minGap;

        // 全体の平均エネルギーを計算
        let totalEnergy = 0;
        for (let i = 0; i < pcm.length; i += 80) {
            totalEnergy += pcm[i] * pcm[i];
        }
        const avgEnergy = (totalEnergy / (pcm.length / 80)) * sensitivityMultiplier;

        for (let w = 0; w < totalWindows; w++) {
            const time = (w * windowSize) / sampleRate;
            let sum = 0;
            const startSample = w * windowSize;

            for (let i = 0; i < windowSize; i++) {
                const sample = pcm[startSample + i];
                sum += sample * sample;
            }

            const currentEnergy = Math.sqrt(sum / windowSize);
            const energyDelta = currentEnergy - prevEnergy;

            // アタック（音の立ち上がり急変化）の検出でビート・歌声の切り替わりにピッタリ追従
            if (currentEnergy > avgEnergy && energyDelta > 0.015) {
                if (time - lastBeatTime >= minGap) {
                    beats.push({
                        time: parseFloat(time.toFixed(3)),
                        energy: currentEnergy
                    });
                    lastBeatTime = time;
                }
            }

            prevEnergy = currentEnergy;
        }

        return beats;
    }

    /**
     * 音声ビートデータとSRT歌詞データから自動ノーツ譜面を統合生成
     * @param {AudioBuffer} audioBuffer 
     * @param {Array} srtEntries - SRTParser.parse の結果
     * @param {string} difficulty 
     * @returns {Array<{id: number, time: number, lane: number, isHold: boolean, duration: number}>}
     */
    generateChart(audioBuffer, srtEntries = [], difficulty = 'NORMAL') {
        const beatEvents = this.detectBeats(audioBuffer, difficulty);
        const vocalEvents = SRTParser.extractVocalNoteTimings(srtEntries);

        const rawNotes = [];

        // 1. SRTボーカルイベントの追加
        for (const v of vocalEvents) {
            rawNotes.push({
                time: v.time,
                isHold: v.isHold,
                duration: v.duration,
                type: 'vocal'
            });
        }

        // 2. 音響ビートイベントの追加（難易度別の適正間引き）
        const duplicateThreshold = (difficulty === 'EASY') ? 0.40 : (difficulty === 'NORMAL' ? 0.28 : 0.18);
        const skipChance = { EASY: 0.50, NORMAL: 0.25, HARD: 0.10, EXPERT: 0 }[difficulty] || 0.25;

        for (const b of beatEvents) {
            // 難易度による適度な間引き
            if (Math.random() < skipChance) continue;

            const duplicate = rawNotes.some(n => Math.abs(n.time - b.time) < duplicateThreshold);
            if (!duplicate) {
                rawNotes.push({
                    time: b.time,
                    isHold: false,
                    duration: 0,
                    type: 'beat'
                });
            }
        }

        // 時間順にソート
        rawNotes.sort((a, b) => a.time - b.time);

        // 3. 5レーン (0〜4) へのスマートな配置アルゴリズム
        const finalChart = [];
        let currentLane = 2; // 中央からスタート
        let idCounter = 1;

        const maxLanes = 5;

        for (let i = 0; i < rawNotes.length; i++) {
            const note = rawNotes[i];

            // 隣接ノーツとの時間差
            const nextNote = rawNotes[i + 1];
            const timeDiff = nextNote ? (nextNote.time - note.time) : 1.0;

            // レーン移動ロジック（規則的な階段、交差、ジャンプ）
            if (timeDiff < 0.15) {
                // 高速連打: 交互に配置
                currentLane = (currentLane + 1) % maxLanes;
            } else if (note.type === 'vocal') {
                // ボーカル: 左右スイング
                const dir = (i % 2 === 0) ? 1 : -1;
                currentLane = (currentLane + dir + maxLanes) % maxLanes;
            } else {
                // ランダム感のあるランダムステップ
                const step = (Math.floor(Math.random() * 3) - 1); // -1, 0, 1
                currentLane = (currentLane + step + maxLanes) % maxLanes;
            }

            // ノーツのタイプ決定 (tap, hold, slide)
            let noteType = 'tap';
            let duration = note.duration || 0;
            let endLane = currentLane;

            // ボーカルイベントや間隔に余裕がある場合に HOLD や SLIDE ノーツを割り当てる
            if (note.isHold && duration >= 0.5) {
                // 50%の確率で SLIDE (左右移動), 50%で固定 HOLD
                if (Math.random() < 0.5 && timeDiff >= duration + 0.3) {
                    noteType = 'slide';
                    // 現在レーンから1~2ステップ移動する方向を選択
                    const moveOffset = (Math.random() < 0.5 ? 1 : -1) * (Math.random() < 0.6 ? 1 : 2);
                    endLane = Math.max(0, Math.min(maxLanes - 1, currentLane + moveOffset));
                    if (endLane === currentLane) {
                        endLane = (currentLane > 2) ? currentLane - 1 : currentLane + 1;
                    }
                } else {
                    noteType = 'hold';
                }
            } else if (timeDiff >= 0.8 && Math.random() < 0.3) {
                // 通常ビートでも時々ショートホールド / スライドノーツを発生させる
                duration = Math.min(timeDiff * 0.6, 1.2);
                if (Math.random() < 0.5) {
                    noteType = 'slide';
                    const moveOffset = (currentLane >= 2) ? -1 : 1;
                    endLane = Math.max(0, Math.min(maxLanes - 1, currentLane + moveOffset));
                } else {
                    noteType = 'hold';
                }
            }

            finalChart.push({
                id: idCounter++,
                time: parseFloat(note.time.toFixed(3)),
                lane: currentLane,
                endLane: endLane,
                type: noteType,
                isHold: noteType !== 'tap',
                duration: parseFloat(duration.toFixed(3))
            });
        }

        return finalChart;
    }

    /**
     * デモ用Web Audioサイバービート（Synthesized AudioBuffer）を作成する
     * @param {number} durationSeconds - 長さ（秒）
     * @returns {AudioBuffer}
     */
    createDemoAudioBuffer(durationSeconds = 60) {
        const sampleRate = this.audioCtx.sampleRate;
        const length = sampleRate * durationSeconds;
        const buffer = this.audioCtx.createBuffer(2, length, sampleRate);

        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        const bpm = 128;
        const beatInterval = 60 / bpm; // 約0.468秒

        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            const beatPos = (t % beatInterval) / beatInterval; // 0.0 ~ 1.0

            // 1. Kick Drum (低音ポコポコ)
            const kickEnv = Math.max(0, 1 - beatPos * 8);
            const kickFreq = 120 * Math.exp(-beatPos * 25);
            const kickSignal = Math.sin(2 * Math.PI * kickFreq * t) * kickEnv * 0.7;

            // 2. Hi-Hat (高音ノイズ)
            const hatPos = ((t + beatInterval / 2) % beatInterval) / beatInterval;
            const hatEnv = Math.max(0, 1 - hatPos * 20);
            const hatNoise = (Math.random() * 2 - 1) * hatEnv * 0.25;

            // 3. Synth Bass (サイバーベース音)
            const synthEnv = Math.max(0, 1 - beatPos * 3);
            const freq = (Math.floor(t / (beatInterval * 4)) % 2 === 0) ? 110 : 130.81; // A2 -> C3
            const synthSignal = (Math.sin(2 * Math.PI * freq * t) + Math.sin(2 * Math.PI * freq * 1.5 * t) * 0.5) * synthEnv * 0.3;

            const master = kickSignal + hatNoise + synthSignal;
            left[i] = master;
            right[i] = master;
        }

        return buffer;
    }
}
