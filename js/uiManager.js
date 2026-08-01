/**
 * UI Manager - Handling Modals, HUD Updates, and Animations
 * 100%安全なオプショナルチェイニングと表示制御
 */
class UIManager {
    constructor() {
        // Elements
        this.loadModal = document.getElementById('load-modal');
        this.resultModal = document.getElementById('result-modal');

        this.openLoadModalBtn = document.getElementById('home-modal-open-btn');
        this.closeLoadModalBtn = document.getElementById('close-load-modal-btn');

        this.scoreDisplay = document.getElementById('score-display');
        this.currentUserScore = document.getElementById('current-user-score');

        this.comboDisplay = document.getElementById('combo-container');
        this.comboCount = document.getElementById('combo-display');

        this.judgmentDisplay = document.getElementById('judgment-text');
        this.judgmentPopup = document.getElementById('judgment-popup');

        this.hpBarFill = document.getElementById('hp-bar-fill');
        this.hpValueText = document.getElementById('hp-text');

        this.currentDiffBadge = document.getElementById('diff-badge-display');

        this.selectedDifficulty = 'NORMAL';
        this.selectedTab = 'url-tab';
        this.selectedPreset = 'suno-sunrise';

        this.setupModalEvents();
    }

    setupModalEvents() {
        this.openLoadModalBtn?.addEventListener('click', () => this.showLoadModal());
        this.closeLoadModalBtn?.addEventListener('click', () => this.hideLoadModal());

        // モーダルタブ切り替え
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn?.addEventListener('click', (e) => {
                tabBtns.forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

                btn.classList.add('active');
                const tabId = btn.getAttribute('data-tab');
                const targetContent = document.getElementById(tabId);
                if (targetContent) targetContent.classList.add('active');
                this.selectedTab = tabId;
            });
        });

        // 難易度切り替え
        const diffBtns = document.querySelectorAll('.diff-btn');
        diffBtns.forEach(btn => {
            btn?.addEventListener('click', () => {
                diffBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedDifficulty = btn.getAttribute('data-diff') || 'NORMAL';
                if (this.currentDiffBadge) {
                    this.currentDiffBadge.textContent = this.selectedDifficulty;
                }
            });
        });

        // ゲームルール切り替え (通常加点 / ⚠️ 減点サバイバル)
        this.selectedGameMode = 'normal';
        const modeRuleBtns = document.querySelectorAll('.mode-rule-btn');
        modeRuleBtns.forEach(btn => {
            btn?.addEventListener('click', () => {
                modeRuleBtns.forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'rgba(255,255,255,0.06)';
                    b.style.borderColor = 'rgba(255,255,255,0.15)';
                    b.style.color = '#a0a0a0';
                });
                btn.classList.add('active');
                const mode = btn.getAttribute('data-mode') || 'normal';
                this.selectedGameMode = mode;
                if (mode === 'survival') {
                    btn.style.background = 'rgba(255, 23, 68, 0.25)';
                    btn.style.borderColor = '#ff1744';
                    btn.style.color = '#ffffff';
                } else {
                    btn.style.background = 'rgba(0, 229, 255, 0.25)';
                    btn.style.borderColor = '#00e5ff';
                    btn.style.color = '#ffffff';
                }
            });
        });
    }

    bindEvents() {
        // 安全用空関数
    }

    showLoadModal() {
        if (this.loadModal) {
            this.loadModal.classList.add('active');
            this.loadModal.style.display = 'flex';
        }
    }

    hideLoadModal() {
        if (this.loadModal) {
            this.loadModal.classList.remove('active');
            this.loadModal.style.display = 'none';
        }
    }

    showResultModal(stats) {
        const scoreEl = document.getElementById('result-score');
        if (scoreEl) scoreEl.textContent = stats.score.toLocaleString();

        const comboEl = document.getElementById('result-combo');
        if (comboEl) comboEl.textContent = stats.maxCombo;

        if (this.resultModal) {
            this.resultModal.classList.remove('hidden');
            this.resultModal.style.display = 'flex';
        }
    }

    hideResultModal() {
        if (this.resultModal) {
            this.resultModal.classList.add('hidden');
            this.resultModal.style.display = 'none';
        }
    }

    updateScore(score) {
        const formatted = String(score).padStart(6, '0');
        if (this.scoreDisplay) this.scoreDisplay.textContent = formatted;
        if (this.currentUserScore) this.currentUserScore.textContent = score.toLocaleString();
        this.updateTitleAndRank(score, this.lastCombo || 0);
    }

    updateCombo(combo) {
        this.lastCombo = combo;
        if (!this.comboCount) return;
        this.comboCount.textContent = combo;

        if (this.comboDisplay) {
            this.comboDisplay.classList.remove('bounce', 'fever-level-1', 'fever-level-2', 'fever-level-3', 'fever-level-4');
            void this.comboDisplay.offsetWidth; // reflow

            if (combo >= 50) {
                this.comboDisplay.classList.add('fever-level-4');
            } else if (combo >= 35) {
                this.comboDisplay.classList.add('fever-level-3');
            } else if (combo >= 20) {
                this.comboDisplay.classList.add('fever-level-2');
            } else if (combo >= 10) {
                this.comboDisplay.classList.add('fever-level-1');
            }

            if (combo > 0) {
                this.comboDisplay.classList.add('bounce');
            }
        }
        this.updateTitleAndRank(this.lastScore || 0, combo);
    }

    updateTitleAndRank(score, combo) {
        const titleEl = document.getElementById('player-title-display');
        const rankEl = document.getElementById('player-rank-badge');
        if (!titleEl || !rankEl) return;

        let title = '🔰 NOVICE BEATER';
        let rank = 'RANK C';
        let color = '#a0a0a0';

        if (score >= 100000 || combo >= 100) {
            title = '👑 CYBER GOD';
            rank = 'RANK SSS';
            color = '#ff00ff';
        } else if (score >= 80000) {
            title = '💎 NEON LEGEND';
            rank = 'RANK SS';
            color = '#ffd700';
        } else if (score >= 50000) {
            title = '🌟 BEAT MASTER';
            rank = 'RANK S';
            color = '#00e5ff';
        } else if (score >= 25000) {
            title = '⚡ RHYTHM RUNNER';
            rank = 'RANK A';
            color = '#76ff03';
        } else if (score >= 10000) {
            title = '🎧 GROOVE ROOKIE';
            rank = 'RANK B';
            color = '#ffffff';
        }

        titleEl.textContent = title;
        titleEl.style.color = color;
        rankEl.textContent = rank;
        rankEl.style.color = color;
    }

    updateHp(hp) {
        if (this.hpBarFill) this.hpBarFill.style.width = `${hp}%`;
        if (this.hpValueText) this.hpValueText.textContent = `${Math.round(hp)}%`;
    }

    updateSongProgress(currentTime, totalDuration) {
        const fill = document.getElementById('song-progress-fill');
        const curTimeDisp = document.getElementById('current-time-display');
        const totTimeDisp = document.getElementById('total-time-display');

        if (totalDuration > 0) {
            const pct = Math.min(100, Math.max(0, (currentTime / totalDuration) * 100));
            if (fill) fill.style.width = `${pct}%`;

            const curM = Math.floor(currentTime / 60);
            const curS = Math.floor(currentTime % 60);
            const totM = Math.floor(totalDuration / 60);
            const totS = Math.floor(totalDuration % 60);

            const format = (m, s) => `${m}:${String(s).padStart(2, '0')}`;
            if (curTimeDisp) curTimeDisp.textContent = format(curM, curS);
            if (totTimeDisp) totTimeDisp.textContent = format(totM, totS);
        }
    }

    showJudgment(result) {
        if (!this.judgmentDisplay) return;

        this.judgmentDisplay.textContent = result;
        if (this.judgmentPopup) {
            this.judgmentPopup.className = `judgment-popup active ${result.toLowerCase()}`;
            setTimeout(() => {
                this.judgmentPopup.classList.remove('active');
            }, 400);
        }
    }
}
