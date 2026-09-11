// Shared reading preferences; no account, analytics or remote transmission.
const en=document.documentElement.lang==='en';
const t=(zh,english)=>en?english:zh;
const key='freshlife-reading-v1';
let prefs={size:'100',motion:false};
try{const saved=JSON.parse(localStorage.getItem(key));if(saved){if(['100','125','150','200'].includes(saved.size))prefs.size=saved.size;prefs.motion=saved.motion===true;}}catch{}
const style=document.createElement('style');
style.textContent=`
html[data-reading-size="125"]{font-size:125%}html[data-reading-size="150"]{font-size:150%}html[data-reading-size="200"]{font-size:200%}
html[data-reading-motion] *,html[data-reading-motion] *::before,html[data-reading-motion] *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
html[data-reading-motion] .reveal{opacity:1!important;transform:none!important}
html[data-reading-motion] .hero .container{transform:none!important}
.reading-open{font:inherit;min-height:44px;padding:8px 12px;border:1px solid currentColor;border-radius:12px;background:transparent;color:inherit;cursor:pointer}
#reading-dialog{font:inherit;line-height:1.6;color:var(--ink,#1f2b21);background:var(--surface,#fffdf7);border:1px solid var(--line,#ddd);border-radius:20px;padding:24px;width:min(92vw,540px);max-height:85dvh;overflow:auto}
.mobile-nav{top:var(--measured-header-h,var(--header-h))}[id]{scroll-margin-top:calc(var(--measured-header-h,var(--header-h,64px)) + 18px)}
#reading-dialog::backdrop{background:#10201966}#reading-dialog h2{font-size:1.35rem;margin:0 0 16px}#reading-dialog label{display:block;margin:16px 0}#reading-dialog select{font:inherit;display:block;width:100%;padding:10px;margin-top:8px}#reading-dialog button{font:inherit;min-height:44px;padding:8px 14px;cursor:pointer}#reading-dialog .reading-actions{display:flex;flex-wrap:wrap;gap:12px}#reading-dialog input{width:20px;height:20px;vertical-align:middle}
.reading-open:focus-visible,#reading-dialog :focus-visible{outline:3px solid var(--green,#087c55);outline-offset:3px}
html[data-reading-size] .top-actions,html[data-reading-size] .topbar,html[data-reading-size] .hero-actions{flex-wrap:wrap}
html[data-reading-size]:not([data-reading-size="100"]) .nav-links{display:none}
html[data-reading-size]:not([data-reading-size="100"]) .nav-toggle{display:inline-flex}
html[data-reading-size]:not([data-reading-size="100"]) .site-header{height:auto;min-height:64px}
html[data-reading-size]:not([data-reading-size="100"]) .site-header .container{flex-wrap:wrap;padding-block:10px;gap:10px}
html[data-reading-size]:not([data-reading-size="100"]) .phone-screen,html[data-reading-size]:not([data-reading-size="100"]) .ipad-screen{overflow:auto}
`;
document.head.append(style);
const button=document.createElement('button');button.type='button';button.className='reading-open';button.textContent=t('显示设置','Display settings');button.setAttribute('aria-label',t('显示设置：字体、动画与主题','Display settings: text, motion and theme'));button.setAttribute('aria-haspopup','dialog');
const host=document.querySelector('.top-actions')||document.querySelector('.site-header .container')||document.querySelector('.footer-utility');
const mobileMenu=document.querySelector('.mobile-nav'),primaryEntry=document.querySelector('.site-header .nav-cta');
if(mobileMenu&&primaryEntry&&!mobileMenu.querySelector('a[href="/app/"]')){const entry=primaryEntry.cloneNode(true);entry.className='';mobileMenu.prepend(entry);}
if(host){const menu=host.querySelector('.nav-toggle');host.insertBefore(button,menu||null);}
const dialog=document.createElement('dialog');dialog.id='reading-dialog';dialog.setAttribute('aria-labelledby','reading-title');
dialog.innerHTML=`<h2 id="reading-title">${t('按你的习惯阅读','Read your way')}</h2><p>${t('设置在官网和网页版间共用，仅保存在当前浏览器。','Preferences apply to this website and web app, and stay in this browser.')}</p><label>${t('文字大小','Text size')}<select id="reading-size"><option value="100">100% · ${t('默认','Default')}</option><option value="125">125%</option><option value="150">150%</option><option value="200">200%</option></select></label><label><input type="checkbox" id="reading-motion"> ${t('减少动态效果','Reduce motion')}</label><p>${t('也会尊重系统的减少动态效果设置。可使用键盘 Tab 切换，Esc 关闭；浏览器缩放仍可使用。','System reduced-motion preferences are also respected. Use Tab to navigate and Esc to close. Browser zoom remains available.')}</p><p role="status" id="reading-status"></p><div class="reading-actions"><button type="button" id="reading-reset">${t('重置文字与动画','Reset text & motion')}</button><button type="button" id="reading-done">${t('完成','Done')}</button></div>`;
document.body.append(dialog);
const appearance=document.createElement('div');appearance.className='reading-appearance';
const caption=document.createElement('p');caption.textContent=t(document.querySelector('.site-header .lang-switch')?'主题与语言':'主题',document.querySelector('.site-header .lang-switch')?'Theme and language':'Theme');appearance.append(caption);
const theme=document.querySelector('.site-header .theme-toggle')||document.querySelector('#theme');
const language=document.querySelector('.site-header .lang-switch');
if(theme)appearance.append(theme);if(language)appearance.append(language);
if(theme||language)dialog.querySelector('.reading-actions').before(appearance);
document.querySelectorAll('.mobile-nav .theme-toggle,.mobile-nav .lang-switch').forEach(el=>el.hidden=true);

const size=dialog.querySelector('select'),motion=dialog.querySelector('input'),status=dialog.querySelector('[role=status]');
function apply(save=false){document.documentElement.dataset.readingSize=prefs.size;document.documentElement.toggleAttribute('data-reading-motion',prefs.motion);size.value=prefs.size;motion.checked=prefs.motion;if(save){try{localStorage.setItem(key,JSON.stringify(prefs));status.textContent=t('设置已保存。','Preferences saved.');}catch{status.textContent=t('已应用。浏览器不允许保存，关闭后可能需要重新设置。','Applied. Storage is unavailable; you may need to set this again.');}}}
button.addEventListener('click',()=>{status.textContent='';dialog.showModal();});dialog.addEventListener('close',()=>button.focus());
size.addEventListener('change',()=>{prefs.size=size.value;apply(true);});motion.addEventListener('change',()=>{prefs.motion=motion.checked;apply(true);});
dialog.querySelector('#reading-reset').addEventListener('click',()=>{prefs={size:'100',motion:false};apply(true);});dialog.querySelector('#reading-done').addEventListener('click',()=>dialog.close());apply();

// Keep anchored sections and the menu below the actual, possibly wrapped header.
const header=document.querySelector('.site-header');
if(header&&typeof ResizeObserver!=='undefined'){new ResizeObserver(()=>{document.documentElement.style.setProperty('--measured-header-h',header.getBoundingClientRect().height+'px');}).observe(header);}
