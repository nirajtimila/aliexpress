const https = require('https');

const urls = [
    'https://huodong.taobao.com/wow/a/act/tao/dailygroup/23509/24308/wupr?wh_pid=daily-601135',
    'https://huodong.taobao.com/wow/a/act/tao/dailygroup/23509/24308/wupr?wh_pid=daily-601135&region=AU',
    'https://huodong.taobao.com/wow/a/act/tao/dailygroup/23509/24308/wupr?wh_pid=daily-601135&thw=au',
    'https://world.taobao.com/wow/oversea/act/shippingdetail',
    'https://huodong.taobao.com/wow/a/act/tao/dailygroup/23509/24308/wupr?wh_pid=daily-554070'
];

async function checkUrl(u) {
    return new Promise((resolve) => {
        const parsed = new URL(u);
        const req = https.get({
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
                'Cookie': 'thw=au; region=AU; miid=1;'
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const hasAU = data.includes('AU$') || data.includes('Curated') || data.includes('15% OFF') || data.includes('Insta360');
                const title = (data.match(/<title>(.*?)<\/title>/) || [])[1] || '';
                resolve({ url: u, hasAU, title, len: data.length });
            });
        });
        req.on('error', (e) => resolve({ url: u, error: e.message }));
    });
}

async function main() {
    for (const u of urls) {
        console.log(await checkUrl(u));
    }
}
main();
