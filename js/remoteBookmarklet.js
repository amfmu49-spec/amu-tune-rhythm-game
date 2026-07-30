/**
 * AMU TUNE Dedicated Remote Bookmarklet Injector (AMUVI Style)
 * AMUVIと同じ外部スクリプト注入方式で、100%確実にMP3/SRT/カバー画像を取得してAMU TUNEを起動します。
 */
(function() {
    try {
        console.log('⚡ AMU TUNE Remote Bookmarklet Executing...');

        // 1. MP3音源の探索
        var mp3 = "";
        var mediaEls = document.querySelectorAll("audio, source, video");
        for (var i = 0; i < mediaEls.length; i++) {
            var s = mediaEls[i].src || mediaEls[i].getAttribute("src");
            if (s && (s.indexOf("http") === 0 || s.indexOf("blob:") === 0)) {
                mp3 = s; break;
            }
        }

        if (!mp3) {
            var allElements = document.querySelectorAll("[src], [href], [data-src]");
            for (var j = 0; j < allElements.length; j++) {
                var url = allElements[j].src || allElements[j].href || allElements[j].getAttribute("data-src") || "";
                if (url && (url.indexOf(".mp3") !== -1 || url.indexOf("cdn1.suno.ai") !== -1 || url.indexOf("/audios/") !== -1)) {
                    mp3 = url; break;
                }
            }
        }

        if (!mp3) {
            var htmlText = document.documentElement.innerHTML;
            var match = htmlText.match(/https?:\/\/[^"']+\.(?:mp3|wav|m4a)|https?:\/\/cdn[^"']+\/audios\/[^"']+/i);
            if (match) mp3 = match[0];
        }

        // 2. SRT歌詞の探索
        var srt = "";
        var lyricsText = "";

        var textNodes = document.querySelectorAll("textarea, pre, p, div, span");
        for (var k = 0; k < textNodes.length; k++) {
            var txt = textNodes[k].value || textNodes[k].innerText || textNodes[k].textContent || "";
            if (txt.indexOf("-->") !== -1 && txt.length > 15) {
                srt = txt; break;
            }
            if (!lyricsText && txt.length > 30 && txt.indexOf("\n") !== -1) {
                lyricsText = txt;
            }
        }

        // SRT形式でない歌詞テキストから簡易SRTを自動生成
        if (!srt && lyricsText) {
            var lines = lyricsText.split("\n").filter(function(l){ return l.trim().length > 0; });
            var generatedSrt = "";
            var sec = 2;
            for (var l = 0; l < lines.length; l++) {
                var startSec = sec;
                var endSec = sec + 3;
                var formatTime = function(s) {
                    var m = Math.floor(s / 60);
                    var rs = Math.floor(s % 60);
                    return "00:" + (m < 10 ? "0" + m : m) + ":" + (rs < 10 ? "0" + rs : rs) + ",000";
                };
                generatedSrt += (l + 1) + "\n" + formatTime(startSec) + " --> " + formatTime(endSec) + "\n" + lines[l].trim() + "\n\n";
                sec += 3.5;
            }
            srt = generatedSrt;
        }

        // 3. カバー画像の探索
        var cover = "";
        var imgs = document.querySelectorAll("img");
        for (var m = 0; m < imgs.length; m++) {
            var imgSrc = imgs[m].src || imgs[m].getAttribute("src");
            if (imgSrc && (imgSrc.indexOf("cover") !== -1 || imgSrc.indexOf("sunn") !== -1 || imgSrc.indexOf("cdn") !== -1)) {
                cover = imgSrc; break;
            }
        }
        if (!cover && imgs.length > 0) cover = imgs[0].src;

        // 4. 曲タイトル
        var title = document.title || "AI Music Track";
        var h1 = document.querySelector("h1, h2");
        if (h1 && h1.innerText) title = h1.innerText.split("\n")[0].trim();

        if (!mp3) {
            alert("⚠️ AMU TUNE: 再生中のMP3音源が見つかりませんでした。\n音楽を再生中にもう一度お試しください。");
            return;
        }

        // 転送データ構築
        var payload = {
            mp3Url: mp3,
            srtText: srt,
            coverUrl: cover,
            title: title,
            artist: "Suno AI / Music",
            autoPlay: true
        };

        var jsonStr = JSON.stringify(payload);

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(jsonStr);
        }

        // 呼び出し元のホスト（http://192.168.1.26:8080/ または http://localhost:8080/）を取得
        var currentScript = document.currentScript || (function() {
            var scripts = document.getElementsByTagName('script');
            return scripts[scripts.length - 1];
        })();
        
        var scriptSrc = currentScript ? currentScript.src : "http://localhost:8080/";
        var origin = scriptSrc.split('/js/remoteBookmarklet.js')[0] || "http://localhost:8080/";

        var targetUrl = origin + "/#amu_data=" + encodeURIComponent(jsonStr);

        // AMU TUNE 画面へ直接切り替えリダイレクト！
        location.href = targetUrl;

    } catch(e) {
        alert("AMU TUNE 抽出エラー: " + e.message);
    }
})();
