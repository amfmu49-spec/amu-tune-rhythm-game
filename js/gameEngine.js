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
        this.chart = chart.map(n => ({ ...n, hit: false, missed: false }));
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
    // 入力処理（キーボード ＆ タッチ）
    // ==========================================================================
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

        // タッチとマウス入力のバインディング (スマホマルチタッチ対応＆PCマウス対応)
        for (let lane = 0; lane < this.lanesCount; lane++) {
            const btn = document.getElementById(`btn-lane-${lane}`);
            if (btn) {
                // タッチイベント
                btn.addEventListener('touchstart', (e) => {
                    e.preventDefault();
                    this.triggerLanePress(lane);
                }, { passive: false });

                btn.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    this.triggerLaneRelease(lane);
                }, { passive: false });

                btn.addEventListener('touchcancel', (e) => {
                    e.preventDefault();
                    this.triggerLaneRelease(lane);
                }, { passive: false });

                // マウスイベント
                btn.addEventListener('mousedown', (e) => {
                    this.triggerLanePress(lane);
                });

                btn.addEventListener('mouseup', (e) => {
                    this.triggerLaneRelease(lane);
                });

                btn.addEventListener('mouseleave', (e) => {
                    if (this.activeKeys[lane]) {
                        this.triggerLaneRelease(lane);
                    }
                });
            }
        }
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

        const targetNote = this.chart.find(n => n.lane === lane && !n.hit && !n.missed);
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
            targetNote.hit = true;
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

    // ==========================================================================
    // 粒子スパーク爆発エフェクト
    // ==========================================================================
    createHitParticles(lane, result) {
        const laneBounds = this.getLaneBounds(lane);
        const centerX = laneBounds.x + laneBounds.width / 2;
        const centerY = this.receptorY;

        // コンボに応じた演出スケール係数 (最大2.5倍)
        const comboScale = Math.min(2.5, 1.0 + (this.combo / 50.0));

        const baseCount = (result === 'PERFECT') ? 35 : (result === 'GREAT' ? 20 : 10);
        const count = Math.floor(baseCount * comboScale);
        
        let color = '#76ff03'; // GOOD
        if (result === 'PERFECT') {
            color = (this.combo >= 100) ? '#ff00ff' : '#ffaa00'; // 100コンボ以上は超サイバーピンクパープル
        } else if (result === 'GREAT') {
            color = '#00e5ff';
        }

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (2 + Math.random() * 6) * (0.8 + comboScale * 0.2); // 速度も少しアップ
            this.particles.push({
                x: centerX,
                y: centerY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.5,
                radius: (2.5 + Math.random() * 3.5) * (0.9 + comboScale * 0.1), // サイズも少しアップ
                color: color,
                alpha: 1.0,
                life: 1.0
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

        // 3. HUDコックピットブラケット ＆ SFダミーシステム情報
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.lineWidth = 1.5;

        // 左上HUDのコーナーブラケット
        const hudX = 8, hudY = 8, hudW = 150, hudH = 50;
        this.ctx.beginPath();
        // 左上
        this.ctx.moveTo(hudX + 15, hudY); this.ctx.lineTo(hudX, hudY); this.ctx.lineTo(hudX, hudY + 15);
        // 右下
        this.ctx.moveTo(hudX + hudW - 15, hudY + hudH); this.ctx.lineTo(hudX + hudW, hudY + hudH); this.ctx.lineTo(hudX + hudW, hudY + hudH - 15);
        this.ctx.stroke();

        // ダミーシステム情報テキスト
        this.ctx.fillStyle = 'rgba(0, 229, 255, 0.45)';
        this.ctx.font = '700 8px Orbitron, sans-serif';
        
        let systemStatus = "SYSTEM STATUS: ACTIVE";
        if (this.combo >= 100) systemStatus = "STATUS: SUPER FEVER MODE";
        else if (this.combo >= 50) systemStatus = "STATUS: FEVER ACTIVE";
        
        this.ctx.fillText(systemStatus, 14, 18);
        this.ctx.fillText("DECIBEL: " + (this.isPlaying ? "94.2 dB" : "0.0 dB"), 14, 28);
        this.ctx.fillText("FREQ RATE: 44.1 kHz", 14, 38);

        // 右上HUDのコーナーブラケット
        const rhudX = this.width - 170, rhudY = 8, rhudW = 162, rhudH = 50;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        this.ctx.beginPath();
        // 右上
        this.ctx.moveTo(rhudX + rhudW - 15, rhudY); this.ctx.lineTo(rhudX + rhudW, rhudY); this.ctx.lineTo(rhudX + rhudW, rhudY + 15);
        // 左下
        this.ctx.moveTo(rhudX + 15, rhudY + rhudH); this.ctx.lineTo(rhudX, rhudY + rhudH); this.ctx.lineTo(rhudX, rhudY + rhudH - 15);
        this.ctx.stroke();

        this.ctx.fillStyle = 'rgba(255, 107, 0, 0.45)';
        this.ctx.fillText("AUDIO DECODER: Suno AI", this.width - 162, 18);
        this.ctx.fillText("BPM COMPATIBLE: " + (this.isPlaying ? "128 (AUTO)" : "IDLE"), this.width - 162, 28);
        this.ctx.fillText("STREAM BUFFER: 100%", this.width - 162, 38);

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

        for (let i = 0; i < this.chart.length; i++) {
            const note = this.chart[i];
            if (note.hit || note.missed) continue;

            const timeDiff = note.time - currentTime;
            if (timeDiff > this.scrollSpeed || timeDiff < -0.2) continue;

            // 0.0 (出現Y) ~ 1.0 (判定Y) へまっすぐ滑らかに下降
            const progress = 1 - (timeDiff / this.scrollSpeed);
            const y = this.spawnY + (this.receptorY - this.spawnY) * progress;

            const bounds = this.getLaneBounds(note.lane);
            const isOrange = (note.lane % 2 === 0);
            const x = bounds.x + 6;
            const width = bounds.width - 12;

            // サイバークリスタルノーツ (白い発光コア付き)
            const grad = this.ctx.createLinearGradient(x, y - noteHeight / 2, x, y + noteHeight / 2);
            if (isOrange) {
                grad.addColorStop(0, '#ffa040');
                grad.addColorStop(0.5, '#ff6b00');
                grad.addColorStop(1, '#cc4400');
            } else {
                grad.addColorStop(0, '#00f5ff'); // 奇数レーンはスタイリッシュなネオンシアン
                grad.addColorStop(0.5, '#00aeff');
                grad.addColorStop(1, '#0055cc');
            }

            this.ctx.save();
            this.ctx.fillStyle = grad;
            
            // コンボに応じたグロー強化
            const comboScale = Math.min(2.5, 1.0 + (this.combo / 50.0));
            this.ctx.shadowColor = isOrange ? '#ff6b00' : '#00e5ff';
            this.ctx.shadowBlur = 14 * comboScale;

            // 本体
            this.roundRect(this.ctx, x, y - noteHeight / 2, width, noteHeight, 6, true, false);

            // ホワイト発光コアライン (中央)
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            this.ctx.shadowColor = '#ffffff';
            this.ctx.shadowBlur = 8;
            this.ctx.fillRect(x + 8, y - 2, width - 16, 4);
            this.ctx.restore();

            // 上部のハイライト
            this.ctx.save();
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            this.ctx.fillRect(x + 4, y - noteHeight / 2 + 2, width - 8, 2);
            this.ctx.restore();

            this.ctx.shadowBlur = 0;
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
