const C={members:'id,name,student_id,wechat,role,active',items:'id,kind,name,size,total,remarks,archived,category,color',perfs:'id,name,date,pin',loans:'id,perf_id,member_id,item_id,qty,out_at,out_note,returned_at,cond,ret_note'};
const ins=(db,t,r)=>{const c=C[t].split(',');return db.prepare(`INSERT OR REPLACE INTO ${t}(${C[t]}) VALUES(${c.map(()=>'?')})`).bind(...c.map(k=>r[k]??null))};
const hash=async p=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('thu24fd:'+p)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const okPin=p=>/^\d{4,8}$/.test(String(p||''));
let migrated=0;
async function main({request,env}){
  const J=(o,s=200)=>Response.json(o,{status:s,headers:{'cache-control':'no-store'}}),db=env.DB;
  if(!env.APP_PASSWORD||request.headers.get('x-pass')!==env.APP_PASSWORD)return J({},401);
  if(!db)return J({err:'Database not connected. In Cloudflare Pages > Settings > Bindings add a D1 binding named DB, then retry the deployment.'},500);
  if(!migrated){try{
    const has=async(t,c)=>(await db.prepare(`PRAGMA table_info(${t})`).all()).results.some(x=>x.name==c);
    if(!await has('items','category')){await db.prepare('ALTER TABLE items ADD COLUMN category TEXT').run();
      await db.prepare("UPDATE items SET category=CASE WHEN name LIKE '%有袖%' THEN 'Sleeved top' WHEN name LIKE '%无袖%' THEN 'Sleeveless top' WHEN name LIKE '%裙%' THEN 'Skirt' WHEN name LIKE '%彩带%' THEN 'Accessory' END WHERE kind='costume' AND category IS NULL").run()}
    if(!await has('items','color'))await db.prepare('ALTER TABLE items ADD COLUMN color TEXT').run();
    if(!await has('perfs','pin'))await db.prepare('ALTER TABLE perfs ADD COLUMN pin TEXT').run();
    migrated=1}catch(e){}}
  if(request.method==='GET'){
    const full=new URL(request.url).searchParams.get('backup'),q=async s=>(await db.prepare(s).all()).results;
    const perfs=await q('SELECT * FROM perfs ORDER BY date DESC,id DESC');
    return J({members:await q('SELECT * FROM members ORDER BY name'),
      items:await q('SELECT i.*,coalesce((SELECT sum(qty) FROM loans l WHERE l.item_id=i.id AND l.returned_at IS NULL),0) AS out FROM items i ORDER BY kind,name,id'),
      perfs:full?perfs:perfs.map(({pin,...p})=>({...p,has_pin:pin?1:0})),loans:await q('SELECT * FROM loans ORDER BY id DESC')});
  }
  if(request.method!=='POST')return J({err:'Method not allowed.'},405);
  let d;try{d=await request.json()}catch(e){return J({err:'Invalid JSON request.'},400)}
  if(!d||typeof d!=='object'||Array.isArray(d))return J({err:'Invalid request body.'},400);
  const a=d.a,ok=['members','items','perfs'];let nid;
  if(a=='save'){
    if(!ok.includes(d.t))return J({},400);
    if(!d.row||typeof d.row!=='object'||Array.isArray(d.row))return J({err:'Invalid record.'},400);
    if(d.t==='items'){
      if(!String(d.row.name||'').trim()||!['costume','shirt','other'].includes(d.row.kind))return J({err:'An item needs a name and a valid type.'},409);
      const total=Number(d.row.total);
      if(!Number.isSafeInteger(total)||total<0)return J({err:'Total quantity must be a whole number of zero or more.'},409);
      if(d.row.id){
        const current=await db.prepare('SELECT coalesce((SELECT sum(qty) FROM loans WHERE item_id=? AND returned_at IS NULL),0) AS out FROM items WHERE id=?').bind(d.row.id,d.row.id).first();
        if(!current)return J({err:'Item not found.'},404);
        if(total<current.out)return J({err:'Total quantity cannot be lower than the number of items currently checked out.'},409);
      }
    }
    if(d.t==='members'&&!String(d.row.name||'').trim())return J({err:'Member name is required.'},409);
    if(d.t==='perfs'){
      if(!String(d.row.name||'').trim()||!/^\d{4}-\d{2}-\d{2}$/.test(String(d.row.date||'')))return J({err:'A performance name and valid date are required.'},409);
      if(d.row.id){const e=await db.prepare('SELECT pin FROM perfs WHERE id=?').bind(d.row.id).first();if(!e)return J({err:'Performance not found.'},404);d.row.pin=e.pin}
      else{if(!okPin(d.pin))return J({err:'Enter a PIN of 4 to 8 digits.'},409);d.row.pin=await hash(String(d.pin))}
    }
    nid=(await ins(db,d.t,d.row).run()).meta.last_row_id;
  }else if(a=='perf_pin'){
    const e=await db.prepare('SELECT pin FROM perfs WHERE id=?').bind(d.id).first();
    if(!e)return J({},404);
    if(!okPin(d.new))return J({err:'The new PIN must be 4 to 8 digits.'},409);
    if(e.pin&&await hash(String(d.old||''))!==e.pin)return J({err:'The current PIN is wrong. PIN not changed.'},409);
    await db.prepare('UPDATE perfs SET pin=? WHERE id=?').bind(await hash(String(d.new)),d.id).run();
  }else if(a=='del'){
    if(!ok.includes(d.t))return J({},400);
    const col={members:'member_id',items:'item_id',perfs:'perf_id'}[d.t];
    const n=await db.prepare(`SELECT count(*) n FROM loans WHERE ${col}=?`).bind(d.id).first();
    if(n.n){if(d.t=='perfs')return J({msg:'This performance has records, so it cannot be deleted.'});
      await db.prepare(d.t=='members'?'UPDATE members SET active=0 WHERE id=?':'UPDATE items SET archived=1 WHERE id=?').bind(d.id).run();
      return J({msg:'It has records, so it was archived / made inactive instead of deleted.'})}
    await db.prepare(`DELETE FROM ${d.t} WHERE id=?`).bind(d.id).run();
  }else if(a=='out'){
    const qty=Number(d.qty),perf=Number(d.perf_id),member=Number(d.member_id),item=Number(d.item_id);
    if(!Number.isSafeInteger(qty)||qty<1||![perf,member,item].every(Number.isSafeInteger))return J({err:'Choose a valid performance, member, item and positive whole-number quantity.'},409);
    const r=await db.prepare(`INSERT INTO loans(perf_id,member_id,item_id,qty,out_at,out_note)
      SELECT p.id,m.id,i.id,?,?,? FROM perfs p JOIN members m ON m.id=? AND m.active=1
      JOIN items i ON i.id=? AND i.archived=0
      WHERE p.id=? AND i.total-(SELECT coalesce(sum(qty),0) FROM loans WHERE item_id=i.id AND returned_at IS NULL)>=?`)
      .bind(qty,new Date().toISOString(),String(d.note||'').slice(0,1000),member,item,perf,qty).run();
    if(!r.meta.changes)return J({err:'Checkout could not be recorded. Check that the performance, active member and item exist and enough stock is available.'},409);
  }else if(a=='ret'){
    const rows=Array.isArray(d.rows)?d.rows:[];
    const ids=rows.map(r=>Number(r&&r.id));
    if(!rows.length||ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length)return J({err:'Select valid, unique return records.'},400);
    const ls=(await db.prepare(`SELECT l.id,l.out_at,l.perf_id,p.name pn,p.pin FROM loans l JOIN perfs p ON p.id=l.perf_id WHERE l.returned_at IS NULL AND l.id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all()).results;
    if(ls.length!==ids.length)return J({err:'One or more records have already been returned or no longer exist. Refresh and try again.'},409);
    for(const pid of [...new Set(ls.map(l=>l.perf_id))]){
      const l=ls.find(x=>x.perf_id==pid);
      if(l.pin&&await hash(String((d.pins||{})[pid]||''))!==l.pin)return J({err:'Wrong PIN for “'+l.pn+'”. Nothing was recorded. Only people who hold the PIN can approve returns.'},409);
    }
    const t0=d.at?Date.parse(d.at):Date.now();
    if(isNaN(t0))return J({err:'The return time is invalid. Check the date.'},409);
    const at=new Date(t0).toISOString();
    if(ls.some(l=>at<l.out_at))return J({err:'The return time is invalid or earlier than the check-out time. Check the date.'},409);
    const validConds=['OK','Needs cleaning','Damaged','Lost'];
    if(rows.some(r=>!validConds.includes(r.cond||'OK')))return J({err:'Choose a valid return condition.'},409);
    await db.batch(rows.map(r=>db.prepare('UPDATE loans SET returned_at=?,cond=?,ret_note=? WHERE id=? AND returned_at IS NULL').bind(at,r.cond||'OK',String(r.note||'').slice(0,1000),Number(r.id))));
  }else if(a=='delrec'){
    if(d.pin!==env.APP_PASSWORD)return J({err:'Wrong password. Nothing was deleted.'},409);
    const dids=(Array.isArray(d.ids)?d.ids:[]).map(Number).filter(n=>Number.isSafeInteger(n)&&n>0);
    if(!dids.length)return J({err:'No valid records selected.'},400);
    await db.batch(dids.map(id=>db.prepare('DELETE FROM loans WHERE id=?').bind(id)));
  }else if(a=='restore'){
    if(!d.data||typeof d.data!=='object'||!['members','items','perfs','loans'].every(t=>Array.isArray(d.data[t])))return J({err:'Backup file is incomplete or invalid.'},400);
    if(d.data.items.some(r=>!Number.isSafeInteger(Number(r.total))||Number(r.total)<0)||d.data.loans.some(r=>!Number.isSafeInteger(Number(r.qty))||Number(r.qty)<1))return J({err:'Backup contains invalid quantities. Nothing was restored.'},400);
    try{
      await db.batch([...Object.keys(C).map(t=>db.prepare(`DELETE FROM ${t}`)),...Object.keys(C).flatMap(t=>d.data[t].map(r=>ins(db,t,r)))]);
    }catch(e){return J({err:'Backup could not be restored. The database was not changed if the transaction failed.'},409)}
  }else return J({err:'Unknown action.'},400);
  return J({ok:1,id:nid});
}
export async function onRequest(c){try{return await main(c)}catch(e){return new Response(JSON.stringify({err:'Server error: '+e.message}),{status:500,headers:{'content-type':'application/json','cache-control':'no-store'}})}}
