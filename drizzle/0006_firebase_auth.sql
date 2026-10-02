ALTER TABLE members ADD COLUMN firebase_uid TEXT;
CREATE UNIQUE INDEX members_firebase_uid ON members(firebase_uid);
