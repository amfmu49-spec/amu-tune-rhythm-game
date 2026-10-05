/**
 * Bookmarklet Helper v11 - UUID・曲名・アーティスト・カバー画像の一括超強固抽出方式
 */
class BookmarkletHelper {
    static getBookmarkletCode() {
        const target = window.location.origin + window.location.pathname.replace(/index\.html.*$/, '') + 'index.html';

        const fn = `(function(){
    try {
        var srt = "";
        var lyricsText = "";
        var textNodes = document.querySelectorAll("textarea, pre, p, div, span, [class*='lyrics'], [class*='text']");
        for(var k=0; k<textNodes.length; k++){
            var txt = (textNodes[k].value || textNodes[k].innerText || textNodes[k].textContent || "").trim();
            if(txt.indexOf("-->") !== -1 && txt.length > 15){ srt = txt; break; }
            if(!lyricsText && txt.length > 30 && txt.indexOf("\\n") !== -1 && (textNodes[k].className && String(textNodes[k].className).indexOf("lyrics") !== -1)){ lyricsText = txt; }
        }
        if(!srt && !lyricsText){
            for(var k=0; k<textNodes.length; k++){
                var txt = (textNodes[k].value || textNodes[k].innerText || textNodes[k].textContent || "").trim();
                if(txt.length > 40 && txt.indexOf("\\n") !== -1 && txt.length < 1500){ lyricsText = txt; break; }
            }
        }
        if(!srt && lyricsText){
            var lines = lyricsText.split("\\n").filter(function(l){ return l.trim().length > 0; });
            var sec = 2.0;
            for(var l=0; l<lines.length; l++){
                var formatTime = function(s){
                    var m = Math.floor(s/60); var rs = Math.floor(s%60);
                    return "00:" + (m<10?"0"+m:m) + ":" + (rs<10?"0"+rs:rs) + ",000";
                };
                srt += (l+1) + "\\n" + formatTime(sec) + " --> " + formatTime(sec + 3.0) + "\\n" + lines[l].trim() + "\\n\\n";
                sec += 3.8;
            }
        }
        
        if(document.getElementById('amutune-bm-panel')) {
            document.getElementById('amutune-bm-panel').remove();
        }

        var panel = document.createElement('div');
        panel.id = 'amutune-bm-panel';
        panel.style.cssText = "position:fixed;top:20px;right:20px;width:320px;background:#14161f;border:2px solid #00e5ff;border-radius:12px;z-index:999999;box-shadow:0 10px 30px rgba(0,0,0,0.8);padding:15px;color:#fff;font-family:sans-serif;line-height:1.5;";
        
        var title = document.createElement('div');
        title.innerHTML = "<b style='color:#00e5ff;font-size:16px;'>AMU TUNE 連携ツール</b>";
        title.style.marginBottom = "10px";
        
        var msg = document.createElement('div');
        msg.style.fontSize = "13px";
        msg.style.marginBottom = "15px";
        msg.style.color = "#ccc";
        if(srt) {
            msg.innerHTML = "歌詞データを抽出しました！<br>SRTをコピーしてAMU TUNEで貼り付けてください。";
        } else {
            msg.innerHTML = "<span style='color:#ff5252'>歌詞データが見つかりませんでした。<br>Sunoの曲ページで実行してください。</span>";
        }

        var btnCopy = document.createElement('button');
        btnCopy.innerText = "📄 SRTテキストをコピー";
        btnCopy.style.cssText = "display:block;width:100%;padding:12px;margin-bottom:10px;background:#00e5ff;color:#000;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:14px;";
        btnCopy.onclick = function(){
            var success = false;
            try{
                var textArea = document.createElement('textarea');
                textArea.value = srt;
                textArea.style.position = 'fixed';
                document.body.appendChild(textArea);
                textArea.select();
                success = document.execCommand('copy');
                document.body.removeChild(textArea);
            }catch(e){}
            if(!success && navigator.clipboard){
                navigator.clipboard.writeText(srt).then(function(){
                    btnCopy.innerText = "✔ コピーしました！";
                    btnCopy.style.background = "#76ff03";
                });
            } else if (success) {
                btnCopy.innerText = "✔ コピーしました！";
                btnCopy.style.background = "#76ff03";
            } else {
                prompt("以下のSRTテキストをコピーしてください:", srt);
            }
        };

        var btnOpen = document.createElement('button');
        btnOpen.innerText = "🎮 AMU TUNE を開く";
        btnOpen.style.cssText = "display:block;width:100%;padding:12px;margin-bottom:10px;background:#ffaa00;color:#000;border:none;border-radius:6px;font-weight:bold;cursor:pointer;font-size:14px;";
        btnOpen.onclick = function(){
            window.open('https://amfmu49-spec.github.io/amu-tune-rhythm-game/', '_blank');
        };

        var btnClose = document.createElement('button');
        btnClose.innerText = "× 閉じる";
        btnClose.style.cssText = "display:block;width:100%;padding:8px;background:transparent;color:#888;border:1px solid #555;border-radius:6px;cursor:pointer;";
        btnClose.onclick = function(){
            panel.remove();
        };

        panel.appendChild(title);
        panel.appendChild(msg);
        if(srt) panel.appendChild(btnCopy);
        panel.appendChild(btnOpen);
        panel.appendChild(btnClose);
        document.body.appendChild(panel);
    } catch(e) {
        alert("Error: " + e.message);
    }
})();`;

        // 不要な改行を削除してワンライナーにする（コメント行は使っていないので安全）
        return 'javascript:' + fn.replace(/\n/g, '').replace(/\s{2,}/g, ' ');
    }
}
