const https = require('https');

https.get('https://assets.aliexpress-media.com/g/ae-fe/cosmos/0.0.453/msite/page-collect.js', (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        let idx = data.indexOf('Collect');
        while (idx !== -1) {
            console.log('--- FOUND AT', idx, '---');
            console.log(data.substring(Math.max(0, idx - 150), Math.min(data.length, idx + 150)));
            idx = data.indexOf('Collect', idx + 1);
        }
    });
});
