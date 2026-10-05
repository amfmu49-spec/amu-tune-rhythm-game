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
        
        var copyBtn = document.querySelector('button[aria-label="Copy lyrics to clipboard"]') || document.querySelector('button[title="Copy lyrics to clipboard"]');
        if (copyBtn && copyBtn.parentElement) {
            var clone = copyBtn.parentElement.cloneNode(true);
            var btns = clone.querySelectorAll('button');
            for(var i=0; i<btns.length; i++) btns[i].remove();
            lyricsText = (clone.innerText || clone.textContent || "").trim();
        }
        
        if (lyricsText && lyricsText.indexOf("-->") !== -1) {
            srt = lyricsText;
        }

        if (!lyricsText && !srt) {
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
        if(!srt){
            alert("歌詞が見つかりませんでした。Sunoの曲ページで実行してください。");
            return;
        }

        var oldOverlay = document.getElementById("amutune-bm-overlay");
        if(oldOverlay) oldOverlay.remove();
        
        var overlay = document.createElement("div");
        overlay.id = "amutune-bm-overlay";
        Object.assign(overlay.style, {
            position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
            backgroundColor: "rgba(0,0,0,0.85)", zIndex: "999999", display: "flex",
            flexDirection: "column", alignItems: "center", justifyContent: "center",
            fontFamily: "sans-serif", padding: "20px", boxSizing: "border-box"
        });

        var box = document.createElement("div");
        Object.assign(box.style, {
            background: "#14161f", padding: "24px", borderRadius: "16px", width: "100%",
            maxWidth: "520px", boxShadow: "0 10px 30px rgba(0,0,0,0.8)", border: "2px solid #00e5ff",
            display: "flex", flexDirection: "column", gap: "16px", color: "#fff"
        });

        var title = document.createElement("h2");
        title.textContent = "AMU TUNE 連携ツール";
        Object.assign(title.style, { margin: "0", color: "#00e5ff", fontSize: "18px" });

        var msg = document.createElement("div");
        msg.innerHTML = srt ? "歌詞データを抽出しました！<br>SRTをコピーしてAMU TUNEで貼り付けてください。" : "<span style='color:#ff5252'>歌詞データが見つかりませんでした。</span>";
        Object.assign(msg.style, { fontSize: "13px", color: "#ccc", lineHeight: "1.5" });

        var textarea = document.createElement("textarea");
        textarea.value = srt || "No lyrics found.";
        textarea.readOnly = true;
        Object.assign(textarea.style, {
            width: "100%", height: "140px", backgroundColor: "#0f111a", color: "#00e5ff",
            border: "1px solid #334155", borderRadius: "8px", padding: "12px",
            fontFamily: "monospace", fontSize: "12px", resize: "none", boxSizing: "border-box"
        });

        var btnRow = document.createElement("div");
        Object.assign(btnRow.style, { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" });

        if (srt) {
            var copyBtn = document.createElement("button");
            copyBtn.textContent = "📄 SRTをコピー";
            Object.assign(copyBtn.style, {
                flex: "1", padding: "12px", background: "#00e5ff", color: "#000",
                border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer"
            });
            copyBtn.onclick = function() {
                var copySucceeded = false;
                try {
                    textarea.select();
                    copySucceeded = document.execCommand('copy');
                } catch(e){}
                if (!copySucceeded && navigator.clipboard) {
                    navigator.clipboard.writeText(srt).then(function(){
                        copyBtn.textContent = "✔ コピー完了!";
                        Object.assign(copyBtn.style, { background: "#76ff03" });
                        setTimeout(function(){ copyBtn.textContent = "📄 SRTをコピー"; Object.assign(copyBtn.style, { background: "#00e5ff" }); }, 2000);
                    });
                } else {
                    copyBtn.textContent = "✔ コピー完了!";
                    Object.assign(copyBtn.style, { background: "#76ff03" });
                    setTimeout(function(){ copyBtn.textContent = "📄 SRTをコピー"; Object.assign(copyBtn.style, { background: "#00e5ff" }); }, 2000);
                }
            };
            btnRow.appendChild(copyBtn);
        }

        var openBtn = document.createElement("a");
        openBtn.textContent = "🎮 AMU TUNE を開く";
        openBtn.target = "_blank";
        openBtn.href = "https://amfmu49-spec.github.io/amu-tune-rhythm-game/";
        Object.assign(openBtn.style, {
            flex: "1", padding: "12px", background: "#ffaa00", color: "#000",
            border: "none", borderRadius: "8px", fontWeight: "bold", cursor: "pointer",
            textAlign: "center", textDecoration: "none", display: "inline-block", boxSizing: "border-box"
        });
        btnRow.appendChild(openBtn);

        var closeBtn = document.createElement("button");
        closeBtn.textContent = "✕ 閉じる";
        Object.assign(closeBtn.style, {
            padding: "12px 16px", background: "transparent", color: "#888",
            border: "1px solid #555", borderRadius: "8px", cursor: "pointer"
        });
        closeBtn.onclick = function(){ overlay.remove(); };
        btnRow.appendChild(closeBtn);

        box.appendChild(title);
        box.appendChild(msg);
        box.appendChild(textarea);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    } catch(e) {
        alert("Error: " + e.message);
    }
})();`;

        // encodeURI を使ってブックマークレット化する (スペースや改行による破損を防ぐ)
        return 'javascript:' + encodeURI(fn);
    }
}
