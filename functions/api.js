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
  const d=await request.json(),a=d.a,ok=['members','items','perfs'];let nid;
  if(a=='save'){
    if(!ok.includes(d.t))return J({},400);
    if(d.t=='perfs'){
      if(d.row.id){const e=await db.prepare('SELECT pin FROM perfs WHERE id=?').bind(d.row.id).first();d.row.pin=e?e.pin:null}
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
    const r=await db.prepare(`INSERT INTO loans(perf_id,member_id,item_id,qty,out_at,out_note) SELECT ?,?,i.id,?,?,? FROM items i WHERE i.id=? AND ?>0 AND i.total-(SELECT coalesce(sum(qty),0) FROM loans WHERE item_id=i.id AND returned_at IS NULL)>=?`)
      .bind(d.perf_id,d.member_id,d.qty,new Date().toISOString(),d.note||'',d.item_id,d.qty,d.qty).run();
    if(!r.meta.changes)return J({err:'Not enough in store (someone may have just taken it).'},409);
  }else if(a=='ret'){
    const ids=(d.rows||[]).map(r=>r.id);if(!ids.length)return J({},400);
    const ls=(await db.prepare(`SELECT l.id,l.out_at,l.perf_id,p.name pn,p.pin FROM loans l JOIN perfs p ON p.id=l.perf_id WHERE l.returned_at IS NULL AND l.id IN (${ids.map(()=>'?')})`).bind(...ids).all()).results;
    for(const pid of [...new Set(ls.map(l=>l.perf_id))]){const l=ls.find(x=>x.perf_id==pid);
      if(l.pin&&await hash(String((d.pins||{})[pid]||''))!==l.pin)return J({err:'Wrong PIN for “'+l.pn+'”. Nothing was recorded. Only people who hold the PIN can approve returns.'},409)}
    const at=d.at||new Date().toISOString();
    if(ls.some(l=>at<l.out_at))return J({err:'The return time is earlier than the check-out time. Check the date.'},409);
    await db.batch(d.rows.map(r=>db.prepare('UPDATE loans SET returned_at=?,cond=?,ret_note=? WHERE id=? AND returned_at IS NULL').bind(at,r.cond,r.note||'',r.id)));
  }else if(a=='delrec'){
    if(d.pin!==env.APP_PASSWORD)return J({err:'Wrong password. Nothing was deleted.'},409);
    await db.batch((d.ids||[]).map(id=>db.prepare('DELETE FROM loans WHERE id=?').bind(id)));
  }else if(a=='restore'){
    await db.batch([...Object.keys(C).map(t=>db.prepare(`DELETE FROM ${t}`)),...Object.keys(C).flatMap(t=>(d.data[t]||[]).map(r=>ins(db,t,r)))]);
  }else return J({},400);
  return J({ok:1,id:nid});
}
export async function onRequest(c){try{return await main(c)}catch(e){return new Response(JSON.stringify({err:'Server error: '+e.message}),{status:500,headers:{'content-type':'application/json','cache-control':'no-store'}})}}
