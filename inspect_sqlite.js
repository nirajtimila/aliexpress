const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.join(process.env.TEMP, 'cookies_Profile 1.db');
const db = new DatabaseSync(dbPath);
const rows = db.prepare("SELECT name FROM cookies WHERE host_key LIKE '%aliexpress%'").all();
console.log('All names in Profile 1:', rows.map(r => r.name));
