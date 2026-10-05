/**
 * AMU TUNE Main Application Coordinator
 * 100%エラーレス・安全な初期化とホーム画面（モーダル）相互切り替えバインド
 */
document.addEventListener('DOMContentLoaded', () => {
    // コンポーネント初期化
    const srtParser = new SRTParser();
    const audioAnalyzer = new AudioAnalyzer();
    const gameEngine = new GameEngine('game-canvas', audioAnalyzer);
    const ui = new UIManager(gameEngine);

    // ゲームエンジンからUIマネージャーへのコールバックバインド (コンボ、スコア、HP、判定リアルタイム更新)
    gameEngine.onScoreUpdate = (score) => ui.updateScore(score);
    gameEngine.onComboUpdate = (combo) => ui.updateCombo(combo);
    gameEngine.onHpUpdate = (hp) => ui.updateHp(hp);
    gameEngine.onProgressUpdate = (cur, tot) => ui.updateSongProgress(cur, tot);
    gameEngine.onJudgment = (res) => ui.showJudgment(res);

    let uploadedMp3Buffer = null;
    let uploadedSrtText = null;
    let currentSunoUuid = null;
    let pendingExternalLoad = false; // ブックマークレット連携中はデモフォールバックを防ぐ

    // トースト通知ヘッダー
    const showToast = (message) => {
        const toast = document.getElementById('toast-notification');
        if (toast) {
            toast.textContent = message;
            toast.classList.remove('active');
            void toast.offsetWidth; // Reflow
            toast.classList.add('active');
            setTimeout(() => toast.classList.remove('active'), 3500);
        }
    };

    // カバーアート表示の更新ヘルパー (右上カード ＆ レール背面背景に自動適用)
    const setSongCoverArt = (coverUrl) => {
        const display = document.getElementById('song-cover-display');
        if (display && coverUrl) {
            display.style.backgroundImage = `url(${coverUrl})`;
            display.style.backgroundSize = 'cover';
            display.style.backgroundPosition = 'center';
            display.textContent = '';
        }

        const bgCover = document.getElementById('game-bg-cover');
        if (bgCover && coverUrl) {
            bgCover.style.backgroundImage = `url(${coverUrl})`;
        }
    };

    // Suno Webページ HTML からの強力メタデータスクレイピング関数
    const parseSunoMetadataFromHtml = (htmlText) => {
        let title = '';
        let coverUrl = '';
        let artist = '';

        try {
            const ogTitleMatch = htmlText.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
            if (ogTitleMatch) title = ogTitleMatch[1];

            const ogImageMatch = htmlText.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
            if (ogImageMatch) coverUrl = ogImageMatch[1];

            const authorMatch = htmlText.match(/<meta\s+name=["']author["']\s+content=["']([^"']+)["']/i);
            if (authorMatch) artist = authorMatch[1];

            if (!title) {
                const titleJsonMatch = htmlText.match(/"title"\s*:\s*"([^"]+)"/);
                if (titleJsonMatch) title = titleJsonMatch[1];
            }
            if (!coverUrl) {
                const imgJsonMatch = htmlText.match(/"image_url"\s*:\s*"([^"]+)"/);
                if (imgJsonMatch) coverUrl = imgJsonMatch[1];
            }
        } catch (e) {
            console.warn('Metadata scrape warning:', e);
        }

        if (title) {
            title = title.replace(/\s*\| Suno$/i, '').replace(/^Suno\s*-\s*/i, '').trim();
        }

        return { title, coverUrl, artist };
    };

    // ==========================================================================
    // UIイベントバインド (オプショナルチェイニングで100%安全保護)
    // ==========================================================================

    // 🏠 HOME / 曲選択ボタン
    document.getElementById('home-modal-open-btn')?.addEventListener('click', () => {
        if (gameEngine.isPlaying) {
            gameEngine.pause();
        }
        renderPlayHistory();
        ui.showLoadModal();
    });

    // 🔄 最初からやり直すボタン
    document.getElementById('retry-game-btn')?.addEventListener('click', () => {
        gameEngine.restart();
    });

    // 🔗 Suno 楽曲URL / UUID 直接入力＆読み込みボタン
    document.getElementById('suno-url-load-btn')?.addEventListener('click', async () => {
        const input = document.getElementById('suno-url-input');
        if (!input || !input.value.trim()) {
            alert('Sunoの楽曲URLまたは楽曲ID(UUID)を入力してください。');
            return;
        }
        const val = input.value.trim();
        const uuidMatch = val.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (uuidMatch) {
            await loadByUuid(uuidMatch[0]);
        } else {
            alert('有効なSuno楽曲URLまたはUUIDが見つかりませんでした。\n例: https://suno.com/song/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
        }
    });

    // 100%確実なクリップボードコピー処理 (あらゆる環境・モバイル対応)
    const copyTextToClipboard = (text, promptMessage = '以下のコードをコピーしてください:') => {
        let success = false;
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.style.position = 'fixed';
            textArea.style.top = '-9999px';
            textArea.style.left = '-9999px';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            success = document.execCommand('copy');
            document.body.removeChild(textArea);
        } catch (e) {
            console.warn('execCommand copy failed:', e);
        }

        if (!success && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => {
                prompt(promptMessage, text);
            });
            return true;
        }

        if (!success) {
            prompt(promptMessage, text);
            return false;
        }

        return true;
    };



    // ⚡ クリップボードからワンタップ取り込みボタン
    document.getElementById('clipboard-import-btn')?.addEventListener('click', async () => {
        try {
            if (navigator.clipboard && navigator.clipboard.readText) {
                const text = await navigator.clipboard.readText();
                if (text) {
                    await processImportedString(text);
                } else {
                    alert('クリップボードが空です。音楽生成ページでURLや一括データをコピーしてからお試しください。');
                }
            } else {
                alert('お使いのブラウザではクリップボード自動読み取りが制限されています。「URL入力」欄へ貼り付けてください。');
            }
        } catch (err) {
            alert('クリップボード読み取り許可が必要です。URL入力欄へ貼り付けて「読み込み」を押してください。');
        }
    });

    // 直接URL入力送信ボタン
    document.getElementById('direct-url-submit-btn')?.addEventListener('click', async () => {
        const input = document.getElementById('direct-url-input');
        if (input && input.value.trim()) {
            await processImportedString(input.value.trim());
        }
    });

    // デモ曲選択カード
    document.querySelectorAll('.demo-song-card').forEach(card => {
        card.addEventListener('click', async () => {
            document.querySelectorAll('.demo-song-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');

            const demoKey = card.getAttribute('data-demo');
            if (demoKey === 'suno_sunrise' || demoKey === 'neon_drive') {
                document.getElementById('song-title-display').textContent = (demoKey === 'suno_sunrise') ? 'Suno Sunrise (Cyber Beat)' : 'Neon Drive (Speed Vocal)';
                document.getElementById('song-artist-display').textContent = 'AI Music Experience';

                uploadedMp3Buffer = audioAnalyzer.createDemoAudioBuffer();
                uploadedSrtText = SRTParser.createDemoSRTText();
            }
        });
    });

    // MP3ファイル入力
    document.getElementById('mp3-input')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                const arrayBuffer = await file.arrayBuffer();
                uploadedMp3Buffer = await audioAnalyzer.decodeAudio(arrayBuffer);
                
                const id3Cover = AudioAnalyzer.extractCoverArtFromBuffer(arrayBuffer);
                if (id3Cover) setSongCoverArt(id3Cover);

                const titleDisp = document.getElementById('song-title-display');
                if (titleDisp) titleDisp.textContent = file.name.replace(/\.[^/.]+$/, "");
                
                const mp3Status = document.getElementById('mp3-status');
                if (mp3Status) mp3Status.textContent = `MP3: ${file.name} ✔`;
            } catch (err) {
                alert('MP3ファイルの読み込みに失敗しました: ' + err.message);
            }
        }
    });

    // 手動一括適用ボタン (MP3 + SRTテキスト)
    document.getElementById('manual-apply-btn')?.addEventListener('click', async () => {
        const mp3File = document.getElementById('mp3-input')?.files[0];
        const srtText = document.getElementById('srt-text-input')?.value;
        const statusEl = document.getElementById('manual-status');
        
        if (!mp3File) {
            alert('① MP3ファイルを選択してください。');
            return;
        }
        if (!srtText || srtText.trim() === '') {
            alert('② ブックマークレットで取得したSRT(歌詞)を貼り付けてください。');
            return;
        }

        try {
            if(statusEl) statusEl.textContent = '読み込み中...';
            
            // MP3をデコード
            const arrayBuffer = await mp3File.arrayBuffer();
            uploadedMp3Buffer = await audioAnalyzer.decodeAudio(arrayBuffer);
            
            const id3Cover = AudioAnalyzer.extractCoverArtFromBuffer(arrayBuffer);
            if (id3Cover) setSongCoverArt(id3Cover);

            const titleDisp = document.getElementById('song-title-display');
            if (titleDisp) titleDisp.textContent = mp3File.name.replace(/\.[^/.]+$/, "");
            
            // SRTをセット
            uploadedSrtText = srtText.trim();
            
            if(statusEl) statusEl.textContent = 'MP3 & SRT 読み込み完了！プレイスタートを押してください ✔';
        } catch (err) {
            alert('ファイルの読み込みに失敗しました: ' + err.message);
            if(statusEl) statusEl.textContent = '読み込み失敗 ❌';
        }
    });

    // ゲーム開始ボタン
    document.getElementById('start-game-btn')?.addEventListener('click', () => {
        // 外部連携ロード中はこのハンドラーを完全スキップ（onclick側が処理する）
        if (pendingExternalLoad) return;

        if (!uploadedMp3Buffer) {
            uploadedMp3Buffer = audioAnalyzer.createDemoAudioBuffer();
            uploadedSrtText = SRTParser.createDemoSRTText();
        }

        const diff = ui.selectedDifficulty || 'NORMAL';
        const isSurvival = (ui.selectedGameMode === 'survival');
        gameEngine.isSurvivalMode = isSurvival;

        const srtEntries = uploadedSrtText ? SRTParser.parse(uploadedSrtText) : [];
        const chart = audioAnalyzer.generateChart(uploadedMp3Buffer, srtEntries, diff);

        gameEngine.setChartAndAudio(chart, uploadedMp3Buffer, diff, uploadedSrtText);
        ui.hideLoadModal();
        gameEngine.play();
    });

    // 📌 ブックマークレットコードコピーボタン (モバイル・PC 100%確実対応)
    document.getElementById('copy-bookmarklet-btn')?.addEventListener('click', (e) => {
        const bCode = BookmarkletHelper.getBookmarkletCode();
        const btn = e.currentTarget;
        const isCopied = copyTextToClipboard(bCode, '以下のブックマークレットJavaScriptコードを全選択してコピーしてください:');

        if (isCopied) {
            showToast('⚡ 専用ブックマークレットをコピーしました！ブラウザのブックマークに登録してお使いください。');
            if (btn) {
                const originalContent = btn.innerHTML;
                btn.style.background = 'linear-gradient(135deg, #00e676, #00b0ff)';
                btn.innerHTML = '<span>✔ コピー完了！(ブックマークに登録)</span><span style="font-size: 0.75rem; font-weight: normal; opacity: 0.9;">ブラウザのブックマークに貼り付けて保存</span>';
                setTimeout(() => {
                    btn.style.background = 'linear-gradient(135deg, var(--orange-primary), #ffaa00)';
                    btn.innerHTML = originalContent;
                }, 3000);
            }
        }
    });

    // CORS回避のためのプロキシ順次フォールバック関数
    const fetchWithProxy = async (url) => {
        const proxies = [
            // Cloudflare Workers 本番超高速CORSプロキシ (セキュリティ保護・永久無料)
            target => `https://morning-disk-d1b0.jbk249pkhk.workers.dev/?url=${encodeURIComponent(target)}`,
            // ローカルCORSプロキシ
            target => `/proxy?url=${encodeURIComponent(target)}`,
            // 直接フェッチ（念のため）
            target => target,
            // パブリックプロキシ群（フォールバック）
            target => `https://corsproxy.io/?url=${encodeURIComponent(target)}`,
            target => `https://api.allorigins.win/raw?url=${encodeURIComponent(target)}`,
        ];

        let lastError = null;
        for (let i = 0; i < proxies.length; i++) {
            const getProxyUrl = proxies[i];
            try {
                const proxyUrl = getProxyUrl(url);
                console.log(`[CORS Proxy Try ${i+1}] Fetching: ${proxyUrl.substring(0,80)}`);
                const res = await fetch(proxyUrl, { mode: i === 0 ? 'cors' : 'cors' });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                
                const arrayBuffer = await res.arrayBuffer();
                if (arrayBuffer.byteLength < 10000) {
                    throw new Error(`Downloaded data too small (${arrayBuffer.byteLength} bytes), likely an error page.`);
                }
                console.log(`[CORS Proxy Try ${i+1}] SUCCESS: ${arrayBuffer.byteLength} bytes`);
                return arrayBuffer;
            } catch (err) {
                console.warn(`[CORS Proxy Try ${i+1} Failed]:`, err.message);
                lastError = err;
            }
        }
        throw new Error(`全てのCORSプロキシ経由でのフェッチに失敗しました。最終エラー: ${lastError?.message}`);
    };

    // ==========================================================================
    // 🕒 プレイ履歴 (localStorage) 管理・描画処理
    // ==========================================================================
    const saveToPlayHistory = (item) => {};

    // ==========================================================================
    // 汎用文字列（JSON・URL・共有テキスト）取り込み処理
    // ==========================================================================
    const processImportedString = async (str) => {
        try {
            let data = null;
            if (str.startsWith('{') && str.endsWith('}')) {
                data = JSON.parse(str);
            } else if (str.includes('mp3Url')) {
                const match = str.match(/\{.*mp3Url.*\}/);
                if (match) data = JSON.parse(match[0]);
            } else if (str.startsWith('http')) {
                data = { mp3Url: str, title: 'URL Track' };
            }

            if (data) {
                if (data.title) document.getElementById('song-title-display').textContent = data.title;
                if (data.coverUrl) setSongCoverArt(data.coverUrl);
                if (data.srtText) uploadedSrtText = data.srtText;

                if (data.mp3Url) {
                    // CORS回避プロキシフォールバック経由でMP3をダウンロード
                    const arrayBuffer = await fetchWithProxy(data.mp3Url);
                    uploadedMp3Buffer = await audioAnalyzer.decodeAudio(arrayBuffer);

                    const id3Cover = AudioAnalyzer.extractCoverArtFromBuffer(arrayBuffer);
                    if (id3Cover) setSongCoverArt(id3Cover);

                    // オートプレイ制限（iOS等の音出ない問題）を回避するため、
                    // 即時開始はせず、モーダルのスタートボタン（ユーザーの直接タップ）を促す
                    const mp3Status = document.getElementById('mp3-status');
                    if (mp3Status) mp3Status.textContent = `MP3: 外部連携ロード完了 ✔`;
                    
                    const titleDisp = document.getElementById('song-title-display');
                    if (titleDisp && data.title) titleDisp.textContent = data.title;
                    
                    // 開始待機状態にするためにモーダルを表示
                    ui.showLoadModal();
                    
                    // ボタンのテキストを促す表示に変更
                    const startBtn = document.getElementById('start-game-btn');
                    if (startBtn) {
                        startBtn.innerHTML = `⚡ 連携曲「${data.title}」をプレイ！`;
                        startBtn.style.background = 'linear-gradient(135deg, #00e5ff, var(--orange-primary))';
                    }
                }
            }
        } catch (err) {
            console.error(err);
            const startBtn = document.getElementById('start-game-btn');
            if (startBtn) {
                const triedUrl = (data && data.mp3Url) ? (data.mp3Url.substring(0, 35) + "...") : "No URL";
                startBtn.innerHTML = `❌ ロード失敗 [${triedUrl}]: ${err.message}`;
                startBtn.style.background = 'red';
            }
            const mp3Status = document.getElementById('mp3-status');
            if (mp3Status) mp3Status.textContent = `MP3: 読み込み失敗 ❌`;
            alert('データの取り込み中にエラーが発生しました: ' + err.message);
        }
    };

    // ブックマークレットコードのテキストエリアセット
    const bookmarkletTextArea = document.getElementById('bookmarklet-code');
    if (bookmarkletTextArea) {
        bookmarkletTextArea.value = BookmarkletHelper.getBookmarkletCode();
    }

    // ==========================================================================
    // UUID指定での楽曲自動ロード共通処理
    // ==========================================================================
    const loadByUuid = async (uuid) => {
        currentSunoUuid = uuid;
        const mp3Url = 'https://cdn1.suno.ai/' + uuid + '.mp3';
        console.log('[AMU TUNE] Loading UUID:', uuid, 'URL:', mp3Url);

        // 外部ロード開始フラグ（addEventListener側のデモフォールバックを防ぐ）
        pendingExternalLoad = true;

        // ボタンをロード中表示（アニメーション付き）
        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            startBtn.innerHTML = '⏳ 楽曲を読み込み中 0%';
            startBtn.style.background = 'linear-gradient(135deg, #444, #777)';
            startBtn.disabled = true;
        }
        ui.showLoadModal();

        // Suno 標準カバー画像 ＆ 曲名メタデータの自動抽出・更新 (HTMLスクレイピング ＋ CDNフォールバック)
        try {
            const cdnCoverUrl = `https://cdn1.suno.ai/image_${uuid}.png`;
            setSongCoverArt(cdnCoverUrl);

            // Suno ページ HTML からのダイレクトスクレイピング取得
            const sunoSongPageUrl = `https://suno.com/song/${uuid}`;
            fetchWithProxy(sunoSongPageUrl).then(htmlBuffer => {
                const htmlText = new TextDecoder().decode(htmlBuffer);
                const meta = parseSunoMetadataFromHtml(htmlText);
                if (meta.title) {
                    const titleDisp = document.getElementById('song-title-display');
                    if (titleDisp) titleDisp.textContent = meta.title;
                }
                if (meta.artist) {
                    const artistDisp = document.getElementById('song-artist-display');
                    if (artistDisp) artistDisp.textContent = meta.artist;
                }
                if (meta.coverUrl) {
                    setSongCoverArt(meta.coverUrl);
                }
                saveToPlayHistory({
                    uuid: uuid,
                    title: meta.title || document.getElementById('song-title-display')?.textContent || 'Suno Track',
                    artist: meta.artist || document.getElementById('song-artist-display')?.textContent || 'AI Track',
                    coverUrl: meta.coverUrl || `https://cdn1.suno.ai/image_${uuid}.png`
                });
            }).catch(e => console.warn('HTML scrape fallback:', e));
        } catch (e) {
            console.warn('Cover set fallback:', e);
        }

        // 早期に履歴に初期保存
        saveToPlayHistory({
            uuid: uuid,
            title: document.getElementById('song-title-display')?.textContent || 'Suno Track',
            artist: document.getElementById('song-artist-display')?.textContent || 'AI Track',
            coverUrl: `https://cdn1.suno.ai/image_${uuid}.png`
        });

        // 進捗アニメ（実際のサイズが不明なので推定アニメ）
        let fakePct = 0;
        const progressInterval = setInterval(() => {
            if (fakePct < 85) {
                fakePct += (85 - fakePct) * 0.05 + 0.5;
                if (startBtn) startBtn.innerHTML = `⏳ 楽曲を読み込み中 ${Math.round(fakePct)}%`;
            }
        }, 300);

        try {
            // フェーズ1: MP3のロード（AudioContextは使わない）
            const rawArrayBuffer = await fetchWithProxy(mp3Url);
            clearInterval(progressInterval);
            if (startBtn) startBtn.innerHTML = '⏳ 読み込み完了！';

            // フェーズ2: ユーザーのタップをトリガーにしてデコード＆開始
            // （iOSのAudioContext制限のため、必ずユーザーのジェスチャーが必要）
            if (startBtn) {
                startBtn.innerHTML = '⚡ タップして曲を開始！';
                startBtn.style.background = 'linear-gradient(135deg, #00e5ff, var(--orange-primary))';
                startBtn.style.color = '#000';
                startBtn.disabled = false;

                // 既存のリスナーを上書きしないようonclickで登録
                startBtn.onclick = async (e) => {
                    e.preventDefault();
                    e.stopImmediatePropagation(); // 同じボタンの他のhandler(addEventListener)を完全ブロック
                    startBtn.innerHTML = '⏳ デコード中...';
                    startBtn.disabled = true;
                    try {
                        // ユーザーのタップ内でAudioContextをresumeしてからデコード（iOS必須）
                        if (audioAnalyzer.audioCtx.state === 'suspended') {
                            await audioAnalyzer.audioCtx.resume();
                        }
                        uploadedMp3Buffer = await audioAnalyzer.audioCtx.decodeAudioData(rawArrayBuffer);

                        // デコード成功
                        pendingExternalLoad = false;
                        startBtn.onclick = null;
                        startBtn.disabled = false;
                        const diff = ui.selectedDifficulty || 'NORMAL';
                        const isSurvival = (ui.selectedGameMode === 'survival');
                        gameEngine.isSurvivalMode = isSurvival;

                        const srtEntries = uploadedSrtText ? SRTParser.parse(uploadedSrtText) : [];
                        const chart = audioAnalyzer.generateChart(uploadedMp3Buffer, srtEntries, diff);
                        gameEngine.setChartAndAudio(chart, uploadedMp3Buffer, diff, uploadedSrtText);
                        ui.hideLoadModal();
                        gameEngine.play();
                    } catch (decodeErr) {
                        pendingExternalLoad = false;
                        startBtn.innerHTML = '❌ デコード失敗: ' + decodeErr.message.substring(0, 40);
                        startBtn.style.background = 'red';
                        startBtn.disabled = false;
                    }
                };
            }

            const id3Cover = AudioAnalyzer.extractCoverArtFromBuffer(rawArrayBuffer);
            if (id3Cover) setSongCoverArt(id3Cover);

            // カバーアート取得後はstartBtnはすでに上で設定済み
        } catch (err) {
            pendingExternalLoad = false;
            clearInterval(progressInterval);
            console.error('[AMU TUNE] Load error:', err);
            if (startBtn) {
                startBtn.innerHTML = '❌ 失敗: ' + err.message.substring(0, 50);
                startBtn.style.background = 'red';
                startBtn.disabled = false;
            }
        }
    };

    // ==========================================================================
    // URLクエリパラメータ自動解析＆埋め込み起動処理 (suno_id, song, diff, embed, autostart)
    // ==========================================================================
    const handleUrlParams = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const sunoId = urlParams.get('suno_id') || urlParams.get('uuid') || urlParams.get('mp3uuid');
        const songKey = urlParams.get('song');
        const songArtist = urlParams.get('artist');
        const songCover = urlParams.get('cover');
        const diff = urlParams.get('diff');
        const isEmbed = urlParams.get('embed') === 'true';
        const autostart = urlParams.get('autostart') === 'true';

        if (isEmbed) {
            document.body.classList.add('is-embed');
        }

        if (songKey) {
            const titleDisp = document.getElementById('song-title-display');
            if (titleDisp) titleDisp.textContent = songKey;
        }

        if (songArtist) {
            const artistDisp = document.getElementById('song-artist-display');
            if (artistDisp) artistDisp.textContent = songArtist;
        }

        if (songCover) {
            setSongCoverArt(songCover);
        }

        if (diff) {
            ui.selectedDifficulty = diff.toUpperCase();
            const diffBtn = document.querySelector(`.diff-btn[data-diff="${diff.toUpperCase()}"]`);
            if (diffBtn) {
                document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
                diffBtn.classList.add('active');
                if (ui.currentDiffBadge) ui.currentDiffBadge.textContent = diff.toUpperCase();
            }
        }

        if (sunoId) {
            pendingExternalLoad = true;
            ui.hideLoadModal();
            await loadByUuid(sunoId);
            if (autostart) setTimeout(() => gameEngine.play(), 600);
        } else if (songKey) {
            pendingExternalLoad = true;
            ui.hideLoadModal();
            const card = document.querySelector(`.demo-song-card[data-demo="${songKey}"]`);
            if (card) {
                document.querySelectorAll('.demo-song-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
            }
            const startBtn = document.getElementById('start-game-btn');
            if (startBtn) startBtn.click();
            if (autostart) setTimeout(() => gameEngine.play(), 600);
        } else {
            // 通常アクセス時は画面選択モーダルを表示
            ui.showLoadModal();
        }
    };

    // 初期化実行
    handleUrlParams();
    window.addEventListener('hashchange', handleUrlParams);
});
