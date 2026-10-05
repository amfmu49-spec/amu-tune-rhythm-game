(function(){
    try {
        var srt = "";
        var lyricsText = "";
        var textNodes = document.querySelectorAll("textarea, pre, p, div, span, [class*='lyrics'], [class*='text']");
        for(var k=0; k<textNodes.length; k++){
            var txt = (textNodes[k].value || textNodes[k].innerText || textNodes[k].textContent || "").trim();
            if(txt.indexOf("-->") !== -1 && txt.length > 15){
                srt = txt;
                break;
            }
            if(!lyricsText && txt.length > 30 && txt.indexOf("\n") !== -1 && (textNodes[k].className && String(textNodes[k].className).indexOf("lyrics") !== -1)){
                lyricsText = txt;
            }
        }
        if(!srt && !lyricsText){
            for(var k=0; k<textNodes.length; k++){
                var txt = (textNodes[k].value || textNodes[k].innerText || textNodes[k].textContent || "").trim();
                if(txt.length > 40 && txt.indexOf("\n") !== -1 && txt.length < 1500){
                    lyricsText = txt;
                    break;
                }
            }
        }
        if(!srt && lyricsText){
            var lines = lyricsText.split("\n").filter(function(l){ return l.trim().length > 0; });
            var sec = 2.0;
            for(var l=0; l<lines.length; l++){
                var formatTime = function(s){
                    var m = Math.floor(s/60);
                    var rs = Math.floor(s%60);
                    return "00:" + (m<10?"0"+m:m) + ":" + (rs<10?"0"+rs:rs) + ",000";
                };
                srt += (l+1) + "\n" + formatTime(sec) + " --> " + formatTime(sec + 3.0) + "\n" + lines[l].trim() + "\n\n";
                sec += 3.8;
            }
        }
        
        if(!srt){
            alert("歌詞や字幕データが見つかりませんでした。");
            return;
        }

        var success = false;
        try {
            var textArea = document.createElement('textarea');
            textArea.value = srt;
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
            navigator.clipboard.writeText(srt).then(function(){
                alert("SRTテキストをコピーしました！AMU TUNEでMP3と共に追加してください。");
            }).catch(function(){
                prompt("以下のSRTテキストをコピーしてください:", srt);
            });
            return;
        }

        if (success) {
            alert("SRTテキストをコピーしました！AMU TUNEでMP3と共に追加してください。");
        } else {
            prompt("以下のSRTテキストをコピーしてください:", srt);
        }
    } catch(e) {
        alert("Error: " + e.message);
    }
})();
