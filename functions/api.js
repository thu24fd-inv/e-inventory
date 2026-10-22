const C={members:'id,name,student_id,wechat,role,active',items:'id,kind,name,size,total,remarks,archived',perfs:'id,name,date',loans:'id,perf_id,member_id,item_id,qty,out_at,out_note,returned_at,cond,ret_note'};
const ins=(db,t,r)=>{const c=C[t].split(',');return db.prepare(`INSERT OR REPLACE INTO ${t}(${C[t]}) VALUES(${c.map(()=>'?')})`).bind(...c.map(k=>r[k]??null))};
export async function onRequest({request,env}){
  const J=(o,s=200)=>Response.json(o,{status:s,headers:{'cache-control':'no-store'}}),db=env.DB;
  if(!env.APP_PASSWORD||request.headers.get('x-pass')!==env.APP_PASSWORD)return J({},401);
  if(request.method==='GET'){
    const q=async s=>(await db.prepare(s).all()).results;
    return J({members:await q('SELECT * FROM members ORDER BY name'),
      items:await q('SELECT i.*,coalesce((SELECT sum(qty) FROM loans l WHERE l.item_id=i.id AND l.returned_at IS NULL),0) AS out FROM items i ORDER BY kind,name,id'),
      perfs:await q('SELECT * FROM perfs ORDER BY date DESC,id DESC'),loans:await q('SELECT * FROM loans ORDER BY id DESC')});
  }
  const d=await request.json(),a=d.a,ok=['members','items','perfs'];
  let nid;
  if(a=='save'){if(!ok.includes(d.t))return J({},400);nid=(await ins(db,d.t,d.row).run()).meta.last_row_id}
  else if(a=='del'){
    if(!ok.includes(d.t))return J({},400);
    const col={members:'member_id',items:'item_id',perfs:'perf_id'}[d.t];
    const n=await db.prepare(`SELECT count(*) n FROM loans WHERE ${col}=?`).bind(d.id).first();
    if(n.n){if(d.t=='perfs')return J({msg:'This performance has records, so it cannot be deleted.'});await db.prepare(d.t=='members'?'UPDATE members SET active=0 WHERE id=?':'UPDATE items SET archived=1 WHERE id=?').bind(d.id).run();return J({msg:'It has records, so it was archived / made inactive instead of deleted.'})}
    await db.prepare(`DELETE FROM ${d.t} WHERE id=?`).bind(d.id).run();
  }else if(a=='out'){
    let p=d.perf_id?{id:d.perf_id}:await db.prepare('SELECT id FROM perfs WHERE name=? AND date=?').bind(d.perf,d.date).first();
    if(!p)p={id:(await db.prepare('INSERT INTO perfs(name,date) VALUES(?,?)').bind(d.perf,d.date).run()).meta.last_row_id};
    // single atomic statement: only inserts if enough is still in store
    const r=await db.prepare(`INSERT INTO loans(perf_id,member_id,item_id,qty,out_at,out_note) SELECT ?,?,i.id,?,?,? FROM items i WHERE i.id=? AND ?>0 AND i.total-(SELECT coalesce(sum(qty),0) FROM loans WHERE item_id=i.id AND returned_at IS NULL)>=?`)
      .bind(p.id,d.member_id,d.qty,new Date().toISOString(),d.note||'',d.item_id,d.qty,d.qty).run();
    if(!r.meta.changes)return J({err:'Not enough in store (someone may have just taken it).'},409);
  }else if(a=='ret'){
    const now=new Date().toISOString();
    await db.batch(d.rows.map(r=>db.prepare('UPDATE loans SET returned_at=?,cond=?,ret_note=? WHERE id=? AND returned_at IS NULL').bind(now,r.cond,r.note||'',r.id)));
  }else if(a=='restore'){
    await db.batch([...Object.keys(C).map(t=>db.prepare(`DELETE FROM ${t}`)),...Object.keys(C).flatMap(t=>(d.data[t]||[]).map(r=>ins(db,t,r)))]);
  }else return J({},400);
  return J({ok:1,id:nid});
}
