/**
 * Bookmarklet Helper v10 - UUIDだけをURLで渡す最小限方式
 */
class BookmarkletHelper {
    static getBookmarkletCode() {
        const target = window.location.origin + window.location.pathname.replace(/index\.html.*$/, '') + 'index.html';

        const fn = `(function(){
var uuid='';
var pm=window.location.pathname.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
if(pm)uuid=pm[1];
if(!uuid){var sm=document.documentElement.innerHTML.match(/song\\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);if(sm)uuid=sm[1];}
if(!uuid){var gm=document.documentElement.innerHTML.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);if(gm)uuid=gm[1];}
if(!uuid){alert('曲IDが見つかりません。Sunoの曲ページを開いてから実行してください。');return;}
alert('発見したUUID: '+uuid);
location.href='${target}?mp3uuid='+uuid+'&t='+Date.now();
})();`;

        return 'javascript:' + fn.replace(/\n/g, '');
    }
}
