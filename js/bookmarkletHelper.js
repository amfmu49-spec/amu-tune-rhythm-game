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
        if(!srt){
            alert("歌詞が見つかりませんでした。Sunoの曲ページで実行してください。");
            return;
        }

        var copySucceeded = false;
        try {
            var textArea = document.createElement('textarea');
            textArea.value = srt;
            document.body.appendChild(textArea);
            textArea.select();
            copySucceeded = document.execCommand('copy');
            document.body.removeChild(textArea);
        } catch(e){}

        var finish = function(success) {
            if(success) {
                var openAmu = confirm("✅ SRTテキストをコピーしました！\\n\\n今すぐ別タブで AMU TUNE を開きますか？");
                if (openAmu) {
                    window.open('https://amfmu49-spec.github.io/amu-tune-rhythm-game/', '_blank');
                }
            } else {
                prompt("自動コピーに失敗しました。以下のSRTをコピーしてください:", srt);
            }
        };

        if(!copySucceeded && navigator.clipboard) {
            navigator.clipboard.writeText(srt).then(function(){ finish(true); }).catch(function(){ finish(false); });
        } else {
            finish(copySucceeded);
        }
    } catch(e) {
        alert("Error: " + e.message);
    }
})();`;

        // encodeURI を使ってブックマークレット化する (スペースや改行による破損を防ぐ)
        return 'javascript:' + encodeURI(fn);
    }
}
