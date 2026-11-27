const https = require('https');

https.get('https://assets.aliexpress-media.com/g/ae-fe/cosmos/0.0.453/msite/page-collect.js', (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
        // Find mtop calls
        const mtops = data.match(/mtop[a-zA-Z0-9_\.]+/g) || [];
        console.log('Mtop calls:', Array.from(new Set(mtops)));

        // Find collect-related text and methods
        const lines = data.split('\n');
        console.log('Total characters:', data.length);
        
        // Search for "Collect" or similar keywords
        const keywords = ['Collect', 'checkIn', 'signIn', 'reward', 'daily'];
        for (const kw of keywords) {
            let count = (data.match(new RegExp(kw, 'gi')) || []).length;
            console.log(`Keyword "${kw}": found ${count} times`);
        }

        // Find how buttons or click handlers are defined
        const onClickOccurrences = [];
        let idx = data.indexOf('onClick');
        while (idx !== -1 && onClickOccurrences.length < 10) {
            onClickOccurrences.push(data.substring(idx - 40, idx + 80));
            idx = data.indexOf('onClick', idx + 1);
        }
        console.log('onClick snippets:\n', onClickOccurrences.join('\n---\n'));
    });
});
