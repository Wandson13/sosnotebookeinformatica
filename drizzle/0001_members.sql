CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS member_sessions (token_hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS member_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS member_orders (id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), request_key TEXT NOT NULL, items TEXT NOT NULL, total INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(member_id,request_key));
CREATE TABLE IF NOT EXISTS member_reviews (id TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), product_id TEXT NOT NULL, rating INTEGER NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(member_id,product_id));
CREATE INDEX IF NOT EXISTS member_orders_owner ON member_orders(member_id);
CREATE INDEX IF NOT EXISTS member_reviews_product ON member_reviews(product_id);
