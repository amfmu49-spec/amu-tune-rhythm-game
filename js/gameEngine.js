/**
 * AMU TUNE - 垂直直降型 (上から下へ降下) 5レーン Rhythm Game Engine
 * タッチボタンと100%垂直一致する、直感的で美しいノーツ降下エンジン
 */
class GameEngine {
    constructor(canvasId, audioAnalyzer) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.audioAnalyzer = audioAnalyzer;

        this.lanesCount = 5;
        this.chart = [];
        this.audioBuffer = null;
        this.audioSource = null;
        this.startTime = 0;
        this.pauseTime = 0;
        this.isPlaying = false;

        // ゲーム統計
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.hp = 100;
        this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };

        // ノーツスクロールスピード (秒)
        this.scrollSpeed = 1.35;

        // 入力状態
        this.activeKeys = new Array(5).fill(false);

        // コールバック
        this.onScoreUpdate = null;
        this.onComboUpdate = null;
        this.onHpUpdate = null;
        this.onJudgment = null;
        this.onProgressUpdate = null;
        this.onGameEnd = null;

        // 粒子エフェクト
        this.particles = [];
        // SUPER FEVER 用の上昇パーティクル泡
        this.feverBubbles = [];
        this.gridScrollY = 0;

        // 判定ポップアップ表示用配列
        this.judgments = [];
        // カウントダウンタイマー (3, 2, 1, 0)
        this.countdown = 0;
        this.isCountingDown = false;
        this.countdownTimer = null;

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.setupKeyAndTouchInput();
    }

    resize() {
        const parent = this.canvas.parentElement;
        this.width = parent.clientWidth;
        this.height = parent.clientHeight;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.scale(dpr, dpr);

        // 判定線 Y 座標 (画面下部タッチボタンの直上: 約 80%~82%)
        this.receptorY = this.height * 0.81;
        this.spawnY = this.height * 0.12; // 上部出現Y座標
    }

    // ==========================================================================
    // 譜面 ＆ 音声設定
    // ==========================================================================
    setChartAndAudio(chart, audioBuffer, difficulty = 'NORMAL') {
        this.chart = chart.map(n => ({
            ...n,
            type: n.type || (n.isHold ? 'hold' : 'tap'),
            startLane: n.lane,
            endLane: n.endLane !== undefined ? n.endLane : n.lane,
            hit: false,
            missed: false,
            holding: false,
            completed: false,
            headHit: false,
            headResult: null,
            lastHoldTime: 0,
            lastTickTime: 0
        }));
        this.audioBuffer = audioBuffer;
        this.difficulty = difficulty;
        this.resetGameStats();
    }

    resetGameStats() {
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.hp = 100;
        this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };

        if (this.onScoreUpdate) this.onScoreUpdate(this.score);
        if (this.onComboUpdate) this.onComboUpdate(this.combo);
        if (this.onHpUpdate) this.onHpUpdate(this.hp);
    }

    play() {
        if (!this.audioBuffer || this.isPlaying || this.isCountingDown) return;

        const ctx = this.audioAnalyzer.audioCtx;
        if (ctx.state === 'suspended') ctx.resume();

        // 3秒カウントダウンを開始
        this.isCountingDown = true;
        this.countdown = 3;

        const stepCountdown = () => {
            if (this.countdown > 1) {
                this.countdown--;
                this.countdownTimer = setTimeout(stepCountdown, 900);
            } else if (this.countdown === 1) {
                this.countdown = 0; // GO!
                this.countdownTimer = setTimeout(() => {
                    this.isCountingDown = false;
                    this.startAudioAndLoop();
                }, 500);
            }
        };

        this.countdownTimer = setTimeout(stepCountdown, 900);
        
        // カウントダウン中もキャンバス描画を動かすためにループ起動
        this.lastFrameTime = performance.now();
        this.loop();
    }

    startAudioAndLoop() {
        const ctx = this.audioAnalyzer.audioCtx;
        this.audioSource = ctx.createBufferSource();
        this.audioSource.buffer = this.audioBuffer;
        this.audioSource.connect(ctx.destination);

        const offset = this.pauseTime;
        this.startTime = ctx.currentTime - offset;
        this.audioSource.start(0, offset);

        this.isPlaying = true;
        this.lastFrameTime = performance.now();

        this.audioSource.onended = () => {
            if (this.isPlaying) {
                this.isPlaying = false;
                if (this.onGameEnd) this.onGameEnd();
            }
        };
    }

    pause() {
        if (this.countdownTimer) clearTimeout(this.countdownTimer);
        this.isCountingDown = false;
        if (!this.isPlaying) return;
        if (this.audioSource) try { this.audioSource.stop(); } catch(e){}
        this.pauseTime = this.getCurrentTime();
        this.isPlaying = false;
    }

    restart() {
        if (this.countdownTimer) clearTimeout(this.countdownTimer);
        this.isCountingDown = false;
        if (this.audioSource) {
            try { this.audioSource.stop(); } catch (e) {}
        }
        this.pauseTime = 0;
        this.isPlaying = false;
        this.chart.forEach(n => { n.hit = false; n.missed = false; });
        this.resetGameStats();
        this.play();
    }

    getCurrentTime() {
        if (!this.isPlaying) return this.pauseTime;
        return this.audioAnalyzer.audioCtx.currentTime - this.startTime;
    }

    // ==========================================================================
    // 入力処理（キーボード ＆ レール全域スライド・タップ対応）
    // ==========================================================================
    getLaneFromX(clientX) {
        const rect = this.canvas.getBoundingClientRect();
        const relativeX = clientX - rect.left;
        if (relativeX < 0 || relativeX > rect.width) return -1;
        const laneWidth = rect.width / this.lanesCount;
        const lane = Math.floor(relativeX / laneWidth);
        return Math.max(0, Math.min(this.lanesCount - 1, lane));
    }

    setupKeyAndTouchInput() {
        const keyMap = {
            'KeyD': 0, 'ArrowLeft': 0,
            'KeyF': 1, 'ArrowDown': 1,
            'Space': 2, 'ArrowUp': 2,
            'KeyJ': 3, 'KeyI': 3,
            'KeyK': 4, 'ArrowRight': 4
        };

        window.addEventListener('keydown', (e) => {
            if (e.repeat) return;
            const lane = keyMap[e.code];
            if (lane !== undefined) this.triggerLanePress(lane);
        });

        window.addEventListener('keyup', (e) => {
            const lane = keyMap[e.code];
            if (lane !== undefined) this.triggerLaneRelease(lane);
        });

        // 現在のアクティブなタッチID -> レール番号のマップ
        const activeTouchLanes = new Map();

        const handleTouchMoveOrStart = (e) => {
            e.preventDefault();
            const currentTouchLanes = new Set();

            for (let i = 0; i < e.touches.length; i++) {
                const touch = e.touches[i];
                const lane = this.getLaneFromX(touch.clientX);
                if (lane !== -1) {
                    currentTouchLanes.add(lane);
                    const prevLane = activeTouchLanes.get(touch.identifier);

                    // 指が別のレーンに横移動（なぞりスライド）した場合
                    if (prevLane !== undefined && prevLane !== lane) {
                        this.triggerLaneRelease(prevLane);
                        this.triggerLanePress(lane);
                    } else if (prevLane === undefined) {
                        this.triggerLanePress(lane);
                    }
                    activeTouchLanes.set(touch.identifier, lane);
                }
            }

            // 画面から離れたタッチのクリーンアップ
            for (const [id, lane] of activeTouchLanes.entries()) {
                let found = false;
                for (let i = 0; i < e.touches.length; i++) {
                    if (e.touches[i].identifier === id) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    this.triggerLaneRelease(lane);
                    activeTouchLanes.delete(id);
                }
            }
        };

        const handleTouchEnd = (e) => {
            e.preventDefault();
            for (const [id, lane] of activeTouchLanes.entries()) {
                let found = false;
                for (let i = 0; i < e.touches.length; i++) {
                    if (e.touches[i].identifier === id) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    this.triggerLaneRelease(lane);
                    activeTouchLanes.delete(id);
                }
            }
        };

        // レール（キャンバスおよび下部コントロール領域）全体でスライド＆タップ入力を受ける
        const inputTargets = [this.canvas, document.getElementById('touch-controls-container')].filter(Boolean);

        inputTargets.forEach(target => {
            target.addEventListener('touchstart', handleTouchMoveOrStart, { passive: false });
            target.addEventListener('touchmove', handleTouchMoveOrStart, { passive: false });
            target.addEventListener('touchend', handleTouchEnd, { passive: false });
            target.addEventListener('touchcancel', handleTouchEnd, { passive: false });
        });

        // PC マウスドラッグ・スライド対応
        let isMouseDown = false;
        let lastMouseLane = -1;

        window.addEventListener('mousedown', (e) => {
            const lane = this.getLaneFromX(e.clientX);
            if (lane !== -1) {
                isMouseDown = true;
                lastMouseLane = lane;
                this.triggerLanePress(lane);
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!isMouseDown) return;
            const lane = this.getLaneFromX(e.clientX);
            if (lane !== -1 && lane !== lastMouseLane) {
                if (lastMouseLane !== -1) this.triggerLaneRelease(lastMouseLane);
                this.triggerLanePress(lane);
                lastMouseLane = lane;
            }
        });

        window.addEventListener('mouseup', () => {
            if (isMouseDown) {
                isMouseDown = false;
                if (lastMouseLane !== -1) {
                    this.triggerLaneRelease(lastMouseLane);
                    lastMouseLane = -1;
                }
            }
        });
    }

    triggerLanePress(lane) {
        if (this.activeKeys[lane]) return; // 重複入力ガード
        this.activeKeys[lane] = true;
        this.hapticFeedback();
        this.checkHit(lane);

        const btn = document.getElementById(`btn-lane-${lane}`);
        if (btn) btn.classList.add('active');
    }

    triggerLaneRelease(lane) {
        if (!this.activeKeys[lane]) return; // 重複解除ガード
        this.activeKeys[lane] = false;

        const btn = document.getElementById(`btn-lane-${lane}`);
        if (btn) btn.classList.remove('active');
    }

    hapticFeedback() {
        if ('vibrate' in navigator) {
            try { navigator.vibrate(35); } catch (e) {}
        }
    }

    // ==========================================================================
    // 判定ロジック
    // ==========================================================================
    checkHit(lane) {
        if (!this.isPlaying) return;
        const currentTime = this.getCurrentTime();

        // 対象レーンで未処理のノーツを検索
        const targetNote = this.chart.find(n => {
            if (n.hit || n.missed || n.completed) return false;
            if (n.type === 'tap' || !n.headHit) {
                return n.lane === lane;
            }
            return false;
        });

        if (!targetNote) return;

        const diff = Math.abs(targetNote.time - currentTime);

        let result = null;
        let scoreAdd = 0;

        if (diff <= 0.050) {
            result = 'PERFECT';
            scoreAdd = 1000;
        } else if (diff <= 0.095) {
            result = 'GREAT';
            scoreAdd = 700;
        } else if (diff <= 0.140) {
            result = 'GOOD';
            scoreAdd = 400;
        }

        if (result) {
            if (targetNote.type === 'tap') {
                targetNote.hit = true;
            } else {
                // HOLD / SLIDE ノーツの頭ヒット
                targetNote.headHit = true;
                targetNote.holding = true;
                targetNote.headResult = result;
                targetNote.lastHoldTime = currentTime;
                targetNote.lastTickTime = currentTime;
            }

            this.combo++;
            if (this.combo > this.maxCombo) this.maxCombo = this.combo;
            this.score += scoreAdd + Math.floor(this.combo * 10);
            this.hp = Math.min(100, this.hp + 2);
            this.counts[result.toLowerCase()]++;

            this.createHitParticles(lane, result);
            this.addJudgmentPopup(result, lane, scoreAdd);

            if (this.onJudgment) this.onJudgment(result);
            if (this.onScoreUpdate) this.onScoreUpdate(this.score);
            if (this.onComboUpdate) this.onComboUpdate(this.combo);
            if (this.onHpUpdate) this.onHpUpdate(this.hp);
        }
    }

    /**
     * HOLD / SLIDE ノーツの継続判定・加点・完了・MISS判定
     */
    updateHoldNotes(currentTime, delta) {
        if (!this.isPlaying) return;

        for (const note of this.chart) {
            if (note.type === 'tap' || note.completed || note.missed) continue;

            // 1. ノーツの現在時刻における必要レーン (reqLane) を算出
            let reqLane = note.lane;
            if (note.type === 'slide' && note.duration > 0) {
                const progress = Math.max(0, Math.min(1, (currentTime - note.time) / note.duration));
                reqLane = Math.round(note.lane + (note.endLane - note.lane) * progress);
            }

            // 2. 開始時間を過ぎても押し始めなかった場合の MISS 判定
            if (!note.headHit && !note.holding && (currentTime - note.time > 0.140)) {
                note.missed = true;
                this.combo = 0;
                const hpLoss = { EASY: 1.5, NORMAL: 3.0, HARD: 6.0, EXPERT: 10.0 }[this.difficulty] || 5;
                this.hp = Math.max(0, this.hp - hpLoss);
                this.counts.miss++;
                this.addJudgmentPopup('MISS', reqLane, 0);
                if (this.onJudgment) this.onJudgment('MISS');
                if (this.onComboUpdate) this.onComboUpdate(this.combo);
                if (this.onHpUpdate) this.onHpUpdate(this.hp);
                continue;
            }

            // 3. ホールド維持状態のチェック
            if (note.holding) {
                // ユーザーが reqLane (またはスライド移動中の隣接レーン) を押しているかチェック
                const isPressed = this.activeKeys[reqLane] ||
                                  (note.type === 'slide' && (this.activeKeys[Math.max(0, reqLane - 1)] || this.activeKeys[Math.min(this.lanesCount - 1, reqLane + 1)]));

                if (isPressed) {
                    note.lastHoldTime = currentTime;

                    // 連続ティック加点 (0.08秒ごと)
                    if (currentTime - note.lastTickTime >= 0.08) {
                        note.lastTickTime = currentTime;
                        this.combo++;
                        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
                        const tickScore = 150 + Math.floor(this.combo * 3);
                        this.score += tickScore;
                        this.hp = Math.min(100, this.hp + 0.5);

                        this.createHoldParticles(reqLane, note.type);
                        if (this.onScoreUpdate) this.onScoreUpdate(this.score);
                        if (this.onComboUpdate) this.onComboUpdate(this.combo);
                        if (this.onHpUpdate) this.onHpUpdate(this.hp);
                    }
                } else {
                    // 指が離れて 0.12 秒以上経過した場合 -> ホールド中断 (MISS)
                    if (currentTime - note.lastHoldTime > 0.12) {
                        note.holding = false;
                        note.missed = true;
                        this.combo = 0;
                        this.counts.miss++;
                        this.addJudgmentPopup('MISS', reqLane, 0);
                        if (this.onJudgment) this.onJudgment('MISS');
                        if (this.onComboUpdate) this.onComboUpdate(this.combo);
                        if (this.onHpUpdate) this.onHpUpdate(this.hp);
                    }
                }

                // 4. ホールド完了判定 (ノーツ終了時刻に到達)
                if (currentTime >= note.time + note.duration) {
                    note.completed = true;
                    note.hit = true;
                    note.holding = false;

                    const fullBonus = 1500 + Math.floor(this.combo * 15);
                    this.score += fullBonus;
                    this.combo++;
                    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

                    const popupText = note.type === 'slide' ? 'SLIDE COMPLETE!' : 'FULL HOLD!';
                    this.addJudgmentPopup(popupText, note.endLane, fullBonus);
                    this.createHitParticles(note.endLane, 'PERFECT');

                    if (this.onScoreUpdate) this.onScoreUpdate(this.score);
                    if (this.onComboUpdate) this.onComboUpdate(this.combo);
                }
            }
        }
    }

    createHoldParticles(lane, type = 'hold') {
        const laneBounds = this.getLaneBounds(lane);
        const centerX = laneBounds.x + laneBounds.width / 2;
        const centerY = this.receptorY;

        const color = (type === 'slide') ? '#00e5ff' : '#ffaa00';
        for (let i = 0; i < 3; i++) {
            const angle = -Math.PI / 2 + (Math.random() * 1.2 - 0.6);
            const speed = 2 + Math.random() * 4;
            this.particles.push({
                x: centerX + (Math.random() * 20 - 10),
                y: centerY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: 2 + Math.random() * 2.5,
                color: color,
                alpha: 1.0,
                life: 0.6
            });
        }
    }

    addJudgmentPopup(result, lane, scoreAdd = 0) {
        const bounds = this.getLaneBounds(lane);
        const centerX = bounds.x + bounds.width / 2;
        const centerY = this.receptorY - 40;

        this.judgments.push({
            text: result,
            scoreText: scoreAdd > 0 ? `+${scoreAdd}` : '',
            x: centerX,
            y: centerY,
            life: 1.0,
            scale: 1.6
        });
    }

    getComboLevel() {
        if (this.combo >= 200) return 4; // ULTIMATE GOD MODE
        if (this.combo >= 100) return 3; // HYPER OVERDRIVE
        if (this.combo >= 50) return 2;  // SUPER FEVER
        if (this.combo >= 20) return 1;  // FEVER
        return 0;                         // NORMAL
    }

    triggerScreenShake() {
        const level = this.getComboLevel();
        if (level < 2) return; // 50コンボ以上からヒット時の画面シェイクが発動
        const viewport = document.querySelector('.game-viewport');
        if (viewport) {
            viewport.classList.remove('shake');
            void viewport.offsetWidth; // Reflow
            viewport.classList.add('shake');
            setTimeout(() => viewport.classList.remove('shake'), 130);
        }
    }

    // ==========================================================================
    // 粒子スパーク爆発エフェクト (コンボレベル連動)
    // ==========================================================================
    createHitParticles(lane, result) {
        const laneBounds = this.getLaneBounds(lane);
        const centerX = laneBounds.x + laneBounds.width / 2;
        const centerY = this.receptorY;

        const level = this.getComboLevel();
        this.triggerScreenShake();

        // コンボレベルに応じた演出倍率
        const levelMultipliers = [1.0, 1.4, 2.0, 2.8, 4.0];
        const multiplier = levelMultipliers[level];

        const baseCount = (result === 'PERFECT') ? 35 : (result === 'GREAT' ? 22 : 12);
        const count = Math.floor(baseCount * multiplier);

        const rainbowColors = ['#00e5ff', '#ff00ea', '#ffea00', '#76ff03', '#ffffff', '#ff3d00'];

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (3 + Math.random() * 8) * (0.9 + level * 0.35);

            let particleColor = '#76ff03';
            if (level >= 3) {
                // 100コンボ以上(HYPER/ULTIMATE)は豪華レインボー爆発！
                particleColor = rainbowColors[Math.floor(Math.random() * rainbowColors.length)];
            } else if (result === 'PERFECT') {
                particleColor = (level >= 2) ? '#ff00ea' : '#ffaa00';
            } else if (result === 'GREAT') {
                particleColor = '#00e5ff';
            }

            this.particles.push({
                x: centerX,
                y: centerY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - (1.5 + level * 0.5),
                radius: (2.5 + Math.random() * 4.5) * (1.0 + level * 0.25),
                color: particleColor,
                alpha: 1.0,
                life: 1.0 + Math.random() * 0.3
            });
        }
    }

    // 各レーンの X 座標と横幅を HTML タッチボタンの位置に 100% 完全同期
    getLaneBounds(lane) {
        const container = document.getElementById('touch-controls-container');
        const btn = document.getElementById(`btn-lane-${lane}`);
        const canvasRect = this.canvas.getBoundingClientRect();

        if (container && btn) {
            const btnRect = btn.getBoundingClientRect();
            const x = btnRect.left - canvasRect.left;
            const width = btnRect.width;
            return { x, width };
        }

        // フォールバック
        const laneWidth = this.width / this.lanesCount;
        return { x: lane * laneWidth, width: laneWidth };
    }

    // ==========================================================================
    // 描画 ＆ メインループ
    // ==========================================================================
    loop() {
        const now = performance.now();
        const delta = Math.min(0.1, (now - (this.lastFrameTime || now)) / 1000);
        this.lastFrameTime = now;

        const currentTime = this.getCurrentTime();
        if (this.isPlaying) {
            this.updateMisses(currentTime);
            this.updateHoldNotes(currentTime, delta);
        }

        // 画面クリア
        this.ctx.clearRect(0, 0, this.width, this.height);

        // サイバー背景グリッド、SFフレーム等を描画
        this.drawDecorations(delta);

        // 1. 垂直 5レーンの背景 ＆ レールを描画
        this.drawLanes();

        // SUPER FEVER (100コンボ以上) の泡上昇背景エフェクト
        this.updateAndDrawFeverBubbles(delta);

        // 2. 判定ライン (Hit Receptor Line) 描画
        this.drawReceptors();

        // 3. 上から下へ降りてくるノーツを描画
        this.drawNotes(currentTime);

        // 4. Hit爆発スパーク粒子描画
        this.updateAndDrawParticles(delta);

        // 5. 判定文字ポップアップ描画 (PERFECT, GREAT, GOOD, MISS)
        this.updateAndDrawJudgments(delta);

        // 6. カウントダウン表示 (3, 2, 1, GO!)
        this.drawCountdown();

        // 7. プログレスコールバック
        if (this.onProgressUpdate && this.audioBuffer && this.isPlaying) {
            this.onProgressUpdate(currentTime, this.audioBuffer.duration);
        }

        // カウントダウン中、プレイ中、あるいは譜面ロード後であれば連続して描画を行い、レーンやノーツが消えないように保護
        if (this.isPlaying || this.isCountingDown || this.chart.length > 0) {
            requestAnimationFrame(() => this.loop());
        }
    }

    updateAndDrawJudgments(delta) {
        for (let i = this.judgments.length - 1; i >= 0; i--) {
            const j = this.judgments[i];
            j.life -= delta * 2.2;
            j.scale = 1.0 + (j.life * 0.4);
            j.y -= delta * 45;

            if (j.life <= 0) {
                this.judgments.splice(i, 1);
                continue;
            }

            this.ctx.save();
            this.ctx.globalAlpha = Math.max(0, j.life);
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';

            let color = '#76ff03'; // GOOD
            let glow = 'rgba(118, 255, 3, 0.9)';
            if (j.text === 'PERFECT') {
                color = '#ffd700'; // GOLD
                glow = 'rgba(255, 215, 0, 0.9)';
            } else if (j.text === 'GREAT') {
                color = '#00e5ff'; // CYAN
                glow = 'rgba(0, 229, 255, 0.9)';
            } else if (j.text === 'MISS') {
                color = '#ff1744'; // RED
                glow = 'rgba(255, 23, 68, 0.9)';
            }

            this.ctx.shadowColor = glow;
            this.ctx.shadowBlur = 18;
            this.ctx.fillStyle = color;
            this.ctx.font = `900 ${Math.floor(26 * j.scale)}px 'Outfit', sans-serif`;
            this.ctx.fillText(j.text, j.x, j.y);

            if (j.scoreText) {
                this.ctx.font = `700 ${Math.floor(14 * j.scale)}px sans-serif`;
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillText(j.scoreText, j.x, j.y + 20);
            }

            this.ctx.restore();
        }
    }

    drawCountdown() {
        if (!this.isCountingDown) return;

        this.ctx.save();
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        const centerX = this.width / 2;
        const centerY = this.height / 2 - 40;

        const text = this.countdown > 0 ? String(this.countdown) : 'GO!';
        const color = this.countdown > 0 ? '#00e5ff' : '#ffea00';

        this.ctx.shadowColor = color;
        this.ctx.shadowBlur = 30;
        this.ctx.fillStyle = color;
        this.ctx.font = `900 85px 'Outfit', sans-serif`;
        this.ctx.fillText(text, centerX, centerY);

        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 4;
        this.ctx.strokeText(text, centerX, centerY);

        this.ctx.restore();
    }

    /**
     * SUPER FEVER用の上昇バブルパーティクルを更新・描画
     */
    updateAndDrawFeverBubbles(delta) {
        if (this.combo < 100 || !this.isPlaying) {
            this.feverBubbles = [];
            return;
        }

        // 泡の自動生成 (画面の左右端のレーン余白付近)
        if (Math.random() < 0.2) {
            const isLeft = Math.random() < 0.5;
            // 左右約30pxの幅にランダム配置
            const x = isLeft ? (Math.random() * 30) : (this.width - 30 - Math.random() * 5);
            this.feverBubbles.push({
                x: x,
                y: this.receptorY + 20,
                vy: -35 - Math.random() * 45, // 上昇速度
                radius: 2 + Math.random() * 4,
                color: isLeft ? '#00e5ff' : '#ffaa00',
                life: 1.0,
                decay: 0.35 + Math.random() * 0.4 // 寿命減衰率
            });
        }

        // 更新と描画
        for (let i = this.feverBubbles.length - 1; i >= 0; i--) {
            const b = this.feverBubbles[i];
            b.life -= delta * b.decay;
            if (b.life <= 0) {
                this.feverBubbles.splice(i, 1);
                continue;
            }

            b.y += b.vy * delta;
            
            // サイン波で少し揺らしながら上昇させる
            const sway = Math.sin(b.y * 0.04) * 1.2;
            
            this.ctx.save();
            this.ctx.fillStyle = b.color;
            this.ctx.globalAlpha = b.life * 0.5;
            this.ctx.shadowColor = b.color;
            this.ctx.shadowBlur = 8;
            
            this.ctx.beginPath();
            this.ctx.arc(b.x + sway, b.y, b.radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }
    }

    /**
     * サイバー背景グリッド、オーディオ波形、HUD装飾を描画
     */
    drawDecorations(delta) {
        this.ctx.save();

        const bpm = 128;
        const beatInterval = 60 / bpm;
        const currentTime = this.getCurrentTime();
        const beatPos = (currentTime % beatInterval) / beatInterval;
        const pulse = Math.exp(-beatPos * 4.0) * 0.08; // ビートに連動したグリッドの輝き

        // 1. スクロールする電子ライングリッド背景
        this.ctx.strokeStyle = `rgba(0, 229, 255, ${0.04 + pulse})`;
        this.ctx.lineWidth = 1.0;
        
        const gridSpacing = 40;
        // 縦線
        for (let x = 0; x < this.width; x += gridSpacing) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, this.spawnY);
            this.ctx.lineTo(x, this.receptorY + 40);
            this.ctx.stroke();
        }
        // 横線（上から下へスクロール）
        if (this.isPlaying) {
            this.gridScrollY = (this.gridScrollY || 0) + 1.2;
            if (this.gridScrollY >= gridSpacing) this.gridScrollY = 0;
        }
        for (let y = this.spawnY + (this.gridScrollY || 0); y < this.receptorY + 40; y += gridSpacing) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
            this.ctx.stroke();
        }

        // 3. SFダミーシステム情報 ＆ バージョン表記 (HTML Overlay との被りを防ぐため画面左下にスタイリッシュに配置)
        this.ctx.fillStyle = 'rgba(0, 229, 255, 0.45)';
        this.ctx.font = '700 9px Orbitron, sans-serif';

        let systemStatus = "STATUS: AMU ENGINE v1.3.0";
        const level = this.getComboLevel();
        if (level === 4) systemStatus = "STATUS: ULTIMATE GOD MODE ⚡";
        else if (level === 3) systemStatus = "STATUS: HYPER OVERDRIVE 🔥";
        else if (level === 2) systemStatus = "STATUS: SUPER FEVER MODE ✨";
        else if (level === 1) systemStatus = "STATUS: FEVER ACTIVE 🚀";

        // 画面左下の安全領域へ描画
        const hudBottomY = this.receptorY + 45;
        this.ctx.fillText(systemStatus, 12, hudBottomY);
        this.ctx.fillText("AMU TUNE RHYTHM ENGINE v1.3.0", 12, hudBottomY + 12);

        this.ctx.restore();
    }

    drawLanes() {
        // 50コンボ以上のBPM同期背景パルス (FEVERモード)
        if (this.combo >= 50 && this.isPlaying) {
            const bpm = 128;
            const beatInterval = 60 / bpm;
            const currentTime = this.getCurrentTime();
            const beatPos = (currentTime % beatInterval) / beatInterval; // 0.0 ~ 1.0
            
            // 拍の頭でパルスが最大になり、滑らかに減衰する
            const pulse = Math.exp(-beatPos * 4.0) * 0.15;
            
            this.ctx.fillStyle = (this.combo >= 100) ? `rgba(0, 229, 255, ${pulse})` : `rgba(255, 107, 0, ${pulse})`;
            this.ctx.fillRect(0, this.spawnY, this.width, this.receptorY - this.spawnY);
        }

        for (let lane = 0; lane < this.lanesCount; lane++) {
            const bounds = this.getLaneBounds(lane);
            const isPressed = this.activeKeys[lane];

            // 通常時のレーン背景描画
            const grad = this.ctx.createLinearGradient(0, this.spawnY, 0, this.receptorY);
            grad.addColorStop(0, 'rgba(15, 17, 26, 0.1)');
            grad.addColorStop(1, (lane % 2 === 0) ? 'rgba(255, 107, 0, 0.08)' : 'rgba(0, 229, 255, 0.08)');
            
            this.ctx.fillStyle = grad;
            this.ctx.fillRect(bounds.x, this.spawnY, bounds.width, this.receptorY - this.spawnY);

            // タップ時はレーン全体 (Y=0 から一番下まで) をサイバーネオンレーザーのように極限まで光らせる
            if (isPressed) {
                // 1. 横方向ネオングラデーション（中央が眩しく輝く）
                const activeGrad = this.ctx.createLinearGradient(bounds.x, 0, bounds.x + bounds.width, 0);
                const neonColor = (lane % 2 === 0) ? 'rgba(255, 107, 0, 0.4)' : 'rgba(0, 229, 255, 0.4)';
                const neonBright = (lane % 2 === 0) ? 'rgba(255, 200, 100, 0.75)' : 'rgba(200, 255, 255, 0.75)';
                
                activeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.02)');
                activeGrad.addColorStop(0.25, neonColor);
                activeGrad.addColorStop(0.5, neonBright); // 中央は白〜ネオンライト
                activeGrad.addColorStop(0.75, neonColor);
                activeGrad.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
                
                this.ctx.fillStyle = activeGrad;
                this.ctx.fillRect(bounds.x, this.spawnY, bounds.width, this.receptorY - this.spawnY);

                // 2. 左右のレール境界線をネオンライトとして発光
                this.ctx.save();
                this.ctx.strokeStyle = (lane % 2 === 0) ? '#ffaa00' : '#00e5ff';
                this.ctx.lineWidth = 3.5;
                this.ctx.shadowColor = this.ctx.strokeStyle;
                this.ctx.shadowBlur = 15;

                // 左レール
                this.ctx.beginPath();
                this.ctx.moveTo(bounds.x, this.spawnY);
                this.ctx.lineTo(bounds.x, this.receptorY + 40);
                this.ctx.stroke();

                // 右レール
                this.ctx.beginPath();
                this.ctx.moveTo(bounds.x + bounds.width, this.spawnY);
                this.ctx.lineTo(bounds.x + bounds.width, this.receptorY + 40);
                this.ctx.stroke();
                this.ctx.restore();

                // 3. レーン中央を貫く強烈な白いレーザーコアライン
                this.ctx.save();
                const laserX = bounds.x + bounds.width / 2;
                const laserGrad = this.ctx.createLinearGradient(0, this.spawnY, 0, this.receptorY);
                laserGrad.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
                laserGrad.addColorStop(0.8, '#ffffff');
                laserGrad.addColorStop(1, '#ffffff');

                this.ctx.strokeStyle = laserGrad;
                this.ctx.lineWidth = 2.0;
                this.ctx.shadowColor = (lane % 2 === 0) ? '#ff5500' : '#00aeff';
                this.ctx.shadowBlur = 10;
                this.ctx.beginPath();
                this.ctx.moveTo(laserX, this.spawnY);
                this.ctx.lineTo(laserX, this.receptorY);
                this.ctx.stroke();
                this.ctx.restore();
            }

            // レーン境界分割線（非押下時）
            if (!isPressed) {
                this.ctx.strokeStyle = 'rgba(255, 170, 0, 0.25)';
                this.ctx.lineWidth = 1.5;
                this.ctx.beginPath();
                this.ctx.moveTo(bounds.x, this.spawnY);
                this.ctx.lineTo(bounds.x, this.receptorY + 40);
                this.ctx.stroke();

                if (lane === this.lanesCount - 1) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(bounds.x + bounds.width, this.spawnY);
                    this.ctx.lineTo(bounds.x + bounds.width, this.receptorY + 40);
                    this.ctx.stroke();
                }
            }
        }
    }

    drawReceptors() {
        // コンボに応じたスケール
        const comboScale = Math.min(2.5, 1.0 + (this.combo / 50.0));

        // 全体判定ライン
        const grad = this.ctx.createLinearGradient(0, 0, this.width, 0);
        grad.addColorStop(0, '#ff6b00');
        grad.addColorStop(0.5, '#ffaa00');
        grad.addColorStop(1, '#ff6b00');

        this.ctx.save();
        this.ctx.strokeStyle = grad;
        this.ctx.lineWidth = 4;
        this.ctx.shadowColor = '#ff6b00';
        this.ctx.shadowBlur = 12 * comboScale; // コンボでグロー強化
        this.ctx.beginPath();
        this.ctx.moveTo(0, this.receptorY);
        this.ctx.lineTo(this.width, this.receptorY);
        this.ctx.stroke();
        this.ctx.restore();

        // 各キーの判定枠
        for (let lane = 0; lane < this.lanesCount; lane++) {
            const bounds = this.getLaneBounds(lane);
            const isPressed = this.activeKeys[lane];

            const padY = this.receptorY - 14;
            const padHeight = 28;
            const isOrange = (lane % 2 === 0);

            this.ctx.save();
            if (isPressed) {
                this.ctx.fillStyle = isOrange ? 'rgba(255, 107, 0, 0.6)' : 'rgba(0, 229, 255, 0.6)';
                this.ctx.shadowColor = isOrange ? '#ff6b00' : '#00e5ff';
                this.ctx.shadowBlur = 25 * comboScale; // コンボでグロー強化
            } else {
                this.ctx.fillStyle = 'rgba(20, 22, 30, 0.5)';
            }

            this.ctx.strokeStyle = isOrange ? '#ff6b00' : '#00e5ff';
            this.ctx.lineWidth = isPressed ? 3 : 2;

            this.roundRect(this.ctx, bounds.x + 4, padY, bounds.width - 8, padHeight, 6, true, true);
            this.ctx.restore();
        }
    }

    drawNotes(currentTime) {
        const noteHeight = 22;

        // 時間 t (秒) におけるY座標を算出
        const getYFromTime = (t) => {
            const timeDiff = t - currentTime;
            const progress = 1 - (timeDiff / this.scrollSpeed);
            return this.spawnY + (this.receptorY - this.spawnY) * progress;
        };

        // 時間 t (秒) におけるレーンの Bounds (x, width) を算出 (SLIDEノーツ対応)
        const getBoundsAtTime = (note, t) => {
            if (note.type !== 'slide' || note.duration <= 0 || note.startLane === note.endLane) {
                return this.getLaneBounds(note.lane);
            }
            const prog = Math.max(0, Math.min(1, (t - note.time) / note.duration));
            const laneFloat = note.startLane + (note.endLane - note.startLane) * prog;
            const l0 = Math.floor(laneFloat);
            const l1 = Math.min(this.lanesCount - 1, l0 + 1);
            const ratio = laneFloat - l0;

            const b0 = this.getLaneBounds(l0);
            const b1 = this.getLaneBounds(l1);

            return {
                x: b0.x + (b1.x - b0.x) * ratio,
                width: b0.width + (b1.width - b0.width) * ratio
            };
        };

        for (let i = 0; i < this.chart.length; i++) {
            const note = this.chart[i];
            if (note.completed || note.missed) continue;

            const tHead = note.time;
            const tTail = note.time + (note.duration || 0);

            const yHeadRaw = getYFromTime(tHead);
            const yTail = getYFromTime(tTail);

            // ホールド中の場合、頭は判定線に固定
            const yHead = note.holding ? this.receptorY : yHeadRaw;

            // 画面外チェック
            if (yHead < this.spawnY - 50 || yTail > this.receptorY + 80) {
                if (note.type === 'tap' && (tHead - currentTime > this.scrollSpeed || tHead - currentTime < -0.2)) {
                    continue;
                }
            }

            // ------------------------------------------------------------------
            // 1. HOLD / SLIDE ノーツのネオンロング帯 (Body) の描画
            // ------------------------------------------------------------------
            if ((note.type === 'hold' || note.type === 'slide') && note.duration > 0) {
                if (yHead >= this.spawnY - 50 && yTail <= this.receptorY + 80) {
                    this.ctx.save();

                    const steps = 14; // スライド曲線を滑らかに補間する分割数
                    const points = [];

                    for (let s = 0; s <= steps; s++) {
                        const stepRatio = s / steps;
                        // tHead (下) 〜 tTail (上)
                        const tCurr = tHead + (tTail - tHead) * stepRatio;
                        let yCurr = getYFromTime(tCurr);

                        if (note.holding && tCurr < currentTime) {
                            yCurr = this.receptorY;
                        }

                        const bCurr = getBoundsAtTime(note, tCurr);
                        const margin = 10;
                        points.push({
                            xLeft: bCurr.x + margin,
                            xRight: bCurr.x + bCurr.width - margin,
                            y: yCurr
                        });
                    }

                    // 帯ポリゴンのパス生成
                    this.ctx.beginPath();
                    // 左側を下から上へ
                    this.ctx.moveTo(points[0].xLeft, points[0].y);
                    for (let s = 1; s <= steps; s++) {
                        this.ctx.lineTo(points[s].xLeft, points[s].y);
                    }
                    // 右側を上から下へ
                    for (let s = steps; s >= 0; s--) {
                        this.ctx.lineTo(points[s].xRight, points[s].y);
                    }
                    this.ctx.closePath();

                    // ネオングラデーション
                    const grad = this.ctx.createLinearGradient(0, yTail, 0, yHead);
                    if (note.type === 'slide') {
                        grad.addColorStop(0, 'rgba(0, 229, 255, 0.7)');
                        grad.addColorStop(0.5, 'rgba(255, 0, 229, 0.8)');
                        grad.addColorStop(1, 'rgba(0, 229, 255, 0.9)');
                    } else {
                        grad.addColorStop(0, 'rgba(255, 170, 0, 0.6)');
                        grad.addColorStop(0.5, 'rgba(118, 255, 3, 0.75)');
                        grad.addColorStop(1, 'rgba(255, 170, 0, 0.85)');
                    }

                    this.ctx.fillStyle = grad;
                    this.ctx.shadowColor = (note.type === 'slide') ? '#ff00e5' : '#ffaa00';
                    this.ctx.shadowBlur = note.holding ? 22 : 12;
                    this.ctx.fill();

                    // ホールド中に帯の中に走るサイバーネオンパルス光線
                    if (note.holding) {
                        this.ctx.strokeStyle = '#ffffff';
                        this.ctx.lineWidth = 3;
                        this.ctx.shadowColor = '#ffffff';
                        this.ctx.shadowBlur = 15;
                        this.ctx.beginPath();
                        const midPoints = points.map(p => ({ x: (p.xLeft + p.xRight) / 2, y: p.y }));
                        this.ctx.moveTo(midPoints[0].x, midPoints[0].y);
                        for (let s = 1; s <= steps; s++) {
                            this.ctx.lineTo(midPoints[s].x, midPoints[s].y);
                        }
                        this.ctx.stroke();
                    }

                    this.ctx.restore();
                }
            }

            // ------------------------------------------------------------------
            // 2. ノーツの頭 (Head) / 通常タップノーツの描画
            // ------------------------------------------------------------------
            if (!note.headHit && yHeadRaw >= this.spawnY - 20 && yHeadRaw <= this.receptorY + 40) {
                const bHead = getBoundsAtTime(note, tHead);
                const isOrange = (note.startLane % 2 === 0);
                const x = bHead.x + 6;
                const width = bHead.width - 12;

                const grad = this.ctx.createLinearGradient(x, yHeadRaw - noteHeight / 2, x, yHeadRaw + noteHeight / 2);
                if (note.type === 'slide') {
                    grad.addColorStop(0, '#00ffff');
                    grad.addColorStop(0.5, '#ff00ea');
                    grad.addColorStop(1, '#9000ff');
                } else if (note.type === 'hold') {
                    grad.addColorStop(0, '#ffff00');
                    grad.addColorStop(0.5, '#ffaa00');
                    grad.addColorStop(1, '#ff3300');
                } else {
                    if (isOrange) {
                        grad.addColorStop(0, '#ffa040');
                        grad.addColorStop(0.5, '#ff6b00');
                        grad.addColorStop(1, '#cc4400');
                    } else {
                        grad.addColorStop(0, '#00f5ff');
                        grad.addColorStop(0.5, '#00aeff');
                        grad.addColorStop(1, '#0055cc');
                    }
                }

                this.ctx.save();
                this.ctx.fillStyle = grad;
                const comboScale = Math.min(2.5, 1.0 + (this.combo / 50.0));
                this.ctx.shadowColor = (note.type === 'slide') ? '#ff00ea' : (isOrange ? '#ff6b00' : '#00e5ff');
                this.ctx.shadowBlur = 14 * comboScale;

                // 本体
                this.roundRect(this.ctx, x, yHeadRaw - noteHeight / 2, width, noteHeight, 6, true, false);

                // 発光コア
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                this.ctx.shadowColor = '#ffffff';
                this.ctx.shadowBlur = 8;
                this.ctx.fillRect(x + 8, yHeadRaw - 2, width - 16, 4);

                // HOLD / SLIDE ノーツのテキストラベル
                if (note.type === 'slide') {
                    const arrow = (note.endLane > note.startLane) ? 'SLIDE ➔' : '⬅ SLIDE';
                    this.ctx.fillStyle = '#ffffff';
                    this.ctx.font = '900 11px Orbitron, sans-serif';
                    this.ctx.textAlign = 'center';
                    this.ctx.textBaseline = 'middle';
                    this.ctx.fillText(arrow, x + width / 2, yHeadRaw);
                } else if (note.type === 'hold') {
                    this.ctx.fillStyle = '#ffffff';
                    this.ctx.font = '900 11px Orbitron, sans-serif';
                    this.ctx.textAlign = 'center';
                    this.ctx.textBaseline = 'middle';
                    this.ctx.fillText('HOLD', x + width / 2, yHeadRaw);
                }

                this.ctx.restore();
            }

            // ------------------------------------------------------------------
            // 3. ホールドノーツの尾 (Tail Cap) 描画
            // ------------------------------------------------------------------
            if ((note.type === 'hold' || note.type === 'slide') && note.duration > 0) {
                if (yTail >= this.spawnY - 20 && yTail <= this.receptorY + 40) {
                    const bTail = getBoundsAtTime(note, tTail);
                    const tx = bTail.x + 8;
                    const tWidth = bTail.width - 16;
                    const tailH = 10;

                    this.ctx.save();
                    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                    this.ctx.shadowColor = (note.type === 'slide') ? '#00e5ff' : '#ffaa00';
                    this.ctx.shadowBlur = 12;
                    this.roundRect(this.ctx, tx, yTail - tailH / 2, tWidth, tailH, 4, true, false);
                    this.ctx.restore();
                }
            }
        }
    }

    updateAndDrawParticles(delta) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= delta * 2.5;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
                continue;
            }

            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.15; // 重力

            this.ctx.fillStyle = p.color;
            this.ctx.globalAlpha = Math.max(0, p.life);
            this.ctx.shadowColor = p.color;
            this.ctx.shadowBlur = 10;

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
            this.ctx.fill();

            this.ctx.globalAlpha = 1.0;
            this.ctx.shadowBlur = 0;
        }
    }

    roundRect(ctx, x, y, width, height, radius, fill, stroke) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
    }

    updateMisses(currentTime) {
        for (const note of this.chart) {
            if (!note.hit && !note.missed && (currentTime - note.time) > 0.160) {
                note.missed = true;
                this.combo = 0;

                // 難易度に応じたマイルドなライフ減少量
                const hpLoss = { EASY: 1.5, NORMAL: 3.0, HARD: 6.0, EXPERT: 10.0 }[this.difficulty] || 5;
                this.hp = Math.max(0, this.hp - hpLoss);
                
                this.counts.miss++;

                if (this.onJudgment) this.onJudgment('MISS');
                this.addJudgmentPopup('MISS', note.lane, 0);
                if (this.onComboUpdate) this.onComboUpdate(this.combo);
                if (this.onHpUpdate) this.onHpUpdate(this.hp);
            }
        }
    }
}
