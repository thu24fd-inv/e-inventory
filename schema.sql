CREATE TABLE members(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,student_id TEXT,wechat TEXT,role TEXT,active INTEGER DEFAULT 1);
CREATE TABLE items(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,name TEXT NOT NULL,size TEXT,total INTEGER DEFAULT 0,remarks TEXT,archived INTEGER DEFAULT 0,category TEXT,color TEXT);
CREATE TABLE perfs(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,date TEXT NOT NULL,pin TEXT);
CREATE TABLE plans(id INTEGER PRIMARY KEY AUTOINCREMENT,perf_id INTEGER,member_id INTEGER,item_id INTEGER,qty INTEGER,note TEXT,created_at TEXT);
CREATE TABLE loans(id INTEGER PRIMARY KEY AUTOINCREMENT,perf_id INTEGER,member_id INTEGER,item_id INTEGER,qty INTEGER,out_at TEXT,out_note TEXT,returned_at TEXT,cond TEXT,ret_note TEXT);
INSERT INTO items(kind,name,size,total,category) VALUES
('costume','红色有袖表演服','M',7,'Sleeved top'),('costume','红色有袖表演服','L',3,'Sleeved top'),('costume','红色有袖表演服','XL',4,'Sleeved top'),('costume','红色有袖表演服','2XL',2,'Sleeved top'),('costume','红色有袖表演服','5XL',1,'Sleeved top'),
('costume','红色有袖表演服（新）','M',3,'Sleeved top'),('costume','红色有袖表演服（新）','L',2,'Sleeved top'),('costume','红色有袖表演服（新）','XL',2,'Sleeved top'),
('costume','红色无袖表演服','One size',14,'Sleeveless top'),
('costume','白色无袖表演服','M',7,'Sleeveless top'),('costume','白色无袖表演服','L',1,'Sleeveless top'),('costume','白色无袖表演服','XL',1,'Sleeveless top'),
('costume','黑色无袖表演服','2XL',1,'Sleeveless top'),
('costume','黑色长裙','M',16,'Skirt'),('costume','黑色长裙','L',7,'Skirt'),('costume','黑色长裙','XL',4,'Skirt'),('costume','黑色长裙','2XL',1,'Skirt'),('costume','黑色长裙','3XL',1,'Skirt'),
('costume','红色彩带','One size',15,'Accessory');

-- Query-performance indexes for inventory totals, open loans and report filters.
CREATE INDEX IF NOT EXISTS idx_loans_item_returned ON loans(item_id, returned_at);
CREATE INDEX IF NOT EXISTS idx_loans_perf_id ON loans(perf_id, id);
CREATE INDEX IF NOT EXISTS idx_loans_member_id ON loans(member_id, id);
CREATE INDEX IF NOT EXISTS idx_loans_open_returned ON loans(returned_at, id);
CREATE INDEX IF NOT EXISTS idx_items_kind_archived_name ON items(kind, archived, name);
CREATE INDEX IF NOT EXISTS idx_perfs_date_id ON perfs(date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_plans_perf ON plans(perf_id, member_id);
