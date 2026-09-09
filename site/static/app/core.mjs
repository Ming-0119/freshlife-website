export const MAX_ITEMS = 2500;
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const locations = ['冷藏', '冷冻', '常温'];
export const units = ['份', '个', '盒', '袋', '瓶', '克', '千克', '毫升', '升'];
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
export function validDate(s) { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s+'T00:00:00Z'); return Number.isFinite(+d) && d.toISOString().slice(0,10) === s && s >= '1900-01-01' && s <= '2200-12-31'; }
export function daysLeft(date, base = today()) { return Math.round((Date.parse(date+'T00:00:00Z') - Date.parse(base+'T00:00:00Z')) / 86400000); }
export function status(date, base = today()) { const n=daysLeft(date,base); return n<0 ? {key:'expired',label:`已过期 ${-n} 天`} : n===0 ? {key:'soon',label:'今天到期'} : n<=3 ? {key:'soon',label:`还有 ${n} 天`} : {key:'fresh',label:`还有 ${n} 天`}; }
export const emptyState = () => ({format:'freshlife-web',version:1,revision:0,items:[],shopping:[],history:[]});
const fail = () => { throw new Error('备份格式不正确或包含无效数据，请选择 FreshLife 网页版导出的 JSON 文件。'); };
const str = (v,max) => typeof v==='string' && v.trim().length>0 && v.length<=max;
const qty = v => typeof v==='number' && Number.isFinite(v) && v>0 && v<=1000000 && Math.abs(v*1000-Math.round(v*1000))<0.000001;
export const round = v => Math.round(v*1000)/1000;
export function validateState(s) {
 if (!s || s.format!=='freshlife-web' || s.version!==1 || !Number.isSafeInteger(s.revision) || s.revision<0) fail();
 for(const k of ['items','shopping','history']) if(!Array.isArray(s[k]) || s[k].length>(k==='history'?10000:MAX_ITEMS)) fail();
 for(const k of ['items','shopping','history']) { const ids=new Set(); for(const x of s[k]) {if(!x || !str(x.id,100) || ids.has(x.id)) fail(); ids.add(x.id); } }
 for(const x of [...s.items,...s.shopping]) if(!str(x.name,80) || !qty(x.quantity) || !units.includes(x.unit)) fail();
 for(const x of s.items) if(!locations.includes(x.location) || !validDate(x.expiry)) fail();
 for(const x of s.history) if(!str(x.name,80) || !qty(x.quantity) || !units.includes(x.unit) || !['consume','waste','delete'].includes(x.kind) || typeof x.at!=='string' || !Number.isFinite(Date.parse(x.at)) || x.at.length>40) fail();
 // Whitelist fields so backups cannot inject UI state or unexpected properties.
 return {format:s.format,version:1,revision:s.revision,items:s.items.map(({id,name,quantity,unit,location,expiry})=>({id,name,quantity,unit,location,expiry})),shopping:s.shopping.map(({id,name,quantity,unit})=>({id,name,quantity,unit})),history:s.history.map(({id,name,quantity,unit,kind,at})=>({id,name,quantity,unit,kind,at}))};
}
export function consume(s,id,amount,kind,recordId,at) {
 const x=s.items.find(x=>x.id===id);
 if(!x) throw new Error('这件食材已被其他页面更新，请刷新后再试。');
 if(!qty(amount) || amount>x.quantity || !['consume','waste'].includes(kind)) throw new Error('数量应大于 0，且不能超过当前库存。');
 if(s.history.length>=10000) throw new Error('历史记录已满，请先导出备份，再在数据管理中清空记录。');
 s.history.unshift({id:recordId,name:x.name,quantity:amount,unit:x.unit,kind,at});
 x.quantity=round(x.quantity-amount); if(x.quantity===0) s.items=s.items.filter(y=>y.id!==id);
 return s;
}
export function purchase(s,id,item) {
 if(s.items.length>=MAX_ITEMS) throw new Error('库存已满，请先整理库存。');
 const planned=s.shopping.find(x=>x.id===id);
 if(!planned) throw new Error('这条清单已被其他页面处理。');
 if(item.unit!==planned.unit) throw new Error('请保持与购物清单相同的单位；如需换算，先编辑购物清单。');
 if(!qty(item.quantity)) throw new Error('请填写有效的实际购买数量。');
 const remaining=round(planned.quantity-item.quantity);
 const shopping=remaining>0?s.shopping.map(x=>x.id===id?{...x,quantity:remaining}:x):s.shopping.filter(x=>x.id!==id);
 return validateState({...s,items:[...s.items,item],shopping});
}

export function matchingHistory(history, query='', kind='all') {
 const term=query.trim().toLocaleLowerCase();
 return history.filter(x=>(kind==='all'||x.kind===kind)&&(!term||x.name.toLocaleLowerCase().includes(term))).sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
}
export function shoppingText(items) {
 return 'FreshLife 购物清单\n'+items.map(x=>`□ ${x.name} · ${x.quantity} ${x.unit}`).join('\n');
}

export function sortedInventory(items, order='expiry') {
 const byDate=(a,b)=>a.expiry.localeCompare(b.expiry)||a.name.localeCompare(b.name,'zh-CN');
 return [...items].sort(order==='name'?(a,b)=>a.name.localeCompare(b.name,'zh-CN')||byDate(a,b):order==='location'?(a,b)=>locations.indexOf(a.location)-locations.indexOf(b.location)||byDate(a,b):byDate);
}
export function matchingShopping(items, query='') {
 const term=query.trim().toLocaleLowerCase();
 return items.filter(x=>!term||x.name.toLocaleLowerCase().includes(term));
}

export function restoreBackup(current, backup, expectedRevision) {
 if(current.revision!==expectedRevision) throw new Error('预览后本地数据发生变化，请重新选择备份确认。');
 const restored=validateState(backup);
 // An imported revision belongs to its source browser, not this database.
 return {...restored,revision:current.revision};
}
