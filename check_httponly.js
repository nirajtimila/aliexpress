const fs = require('fs');
const initSqlJs = require('sql.js');

(async () => {
    const SQL = await initSqlJs();
    const buf = fs.readFileSync('c:\\Users\\NT\\Downloads\\NNNN\\chrome_session\\Default\\Network\\Cookies');
    const db = new SQL.Database(buf);
    const res = db.exec("SELECT name, is_httponly, is_secure FROM cookies WHERE name IN ('xman_us_t', 'aep_usuc_f', 'xman_t')");
    if (res.length > 0) {
        console.log(res[0].columns);
        res[0].values.forEach(v => console.log(v));
    }
})();
