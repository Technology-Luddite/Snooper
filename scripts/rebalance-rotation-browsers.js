const fs = require('fs');
const path = require('path');

const rotationPath = path.join(__dirname, '../sidepanel/modules/fingerprint-data/rotationProfiles.json');
const profiles = JSON.parse(fs.readFileSync(rotationPath, 'utf8'));

const win11Chrome = ['Win11 Chrome 121', 'Win11 Chrome 125', 'Win11 Chrome 127'];
const win11Other = [
    'Win11 Edge', 'Win11 Edge 126',
    'Win11 Firefox 128', 'Win11 Firefox 125',
    'Win11 Brave 127', 'Win11 Brave 125',
    'Win11 Chrome', 'Win11 Chrome 23H2'
];
const win10Browsers = ['Win10 Firefox 128', 'Win10 Brave 125', 'Edge Desktop', 'Modern Chrome Desktop'];
const macBrowsers = [
    'Mac Safari 17', 'Mac Safari 18', 'Mac Safari 17', 'Mac Safari 18',
    'Mac Firefox 128', 'Mac Brave 127', 'Mac Safari 18', 'Mac Firefox 128'
];
const linuxBrowsers = ['Linux Firefox 128', 'Linux Brave 125', 'Linux Firefox 128', 'Linux Brave 125', 'Linux Chrome 125'];

function pick(list, i) {
    return list[i % list.length];
}

function family(browser) {
    if (browser.includes('Firefox')) return 'Firefox';
    if (browser.includes('Brave')) return 'Brave';
    if (browser.includes('Safari')) return 'Safari';
    if (browser.includes('Edge')) return 'Edge';
    return 'Chrome';
}

let wi = 0;
let w10 = 0;
let ma = 0;
let li = 0;

for (const p of profiles) {
    const label = p.label || '';
    if (label.startsWith('Win11')) {
        // ~1 in 5 Win11 gets Chrome; rest Edge/Firefox/Brave/other Chromium
        p.browser = (wi % 5 === 0) ? pick(win11Chrome, wi) : pick(win11Other, wi);
        wi++;
    } else if (label.startsWith('Win10')) {
        p.browser = pick(win10Browsers, w10++);
    } else if (label.startsWith('macOS')) {
        p.browser = pick(macBrowsers, ma++);
        p.platform = 'MacIntel';
    } else if (label.startsWith('Linux')) {
        p.browser = pick(linuxBrowsers, li++);
        p.platform = 'Linux x86_64';
    }
}

const safariExtras = [
    { label: 'macOS Safari FR', browser: 'Mac Safari 18', screen: '2560x1440', platform: 'MacIntel', language: 'fr-FR', timezone: 'Western Europe', geolocation: 'Paris, France', webgl: 'Apple M1', hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0, connection: '4g-good' },
    { label: 'macOS Safari DE', browser: 'Mac Safari 17', screen: '2560x1440', platform: 'MacIntel', language: 'de-DE', timezone: 'Central Europe', geolocation: 'Berlin, Germany', webgl: 'Apple M1', hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0, connection: '4g-good' },
    { label: 'macOS Safari JP', browser: 'Mac Safari 18', screen: '2560x1440', platform: 'MacIntel', language: 'ja-JP', timezone: 'Japan', geolocation: 'Tokyo, Japan', webgl: 'Apple M1', hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0, connection: '4g-good' },
    { label: 'macOS Safari AU', browser: 'Mac Safari 17', screen: '2560x1600', platform: 'MacIntel', language: 'en-AU', timezone: 'Australia (Sydney)', geolocation: 'Melbourne, Australia', webgl: 'Apple M1', hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0, connection: '4g-good' },
    { label: 'macOS Safari CA', browser: 'Mac Safari 18', screen: '2560x1440', platform: 'MacIntel', language: 'en-CA', timezone: 'US East', geolocation: 'Toronto, Canada', webgl: 'Apple M1', hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0, connection: '4g-good' },
    { label: 'macOS Safari Student', browser: 'Mac Safari 17', screen: '1440x900', platform: 'MacIntel', language: 'en-US', timezone: 'US Central', geolocation: 'Chicago, USA', webgl: 'Apple M1', hardwareConcurrency: 4, deviceMemory: 8, maxTouchPoints: 0, connection: '4g-good' },
    { label: 'macOS Safari Pro 16GB', browser: 'Mac Safari 18', screen: '3024x1964', platform: 'MacIntel', language: 'en-US', timezone: 'US Pacific', geolocation: 'Los Angeles, USA', webgl: 'Apple M1', hardwareConcurrency: 10, deviceMemory: 16, maxTouchPoints: 0, connection: '4g-excellent' },
    { label: 'macOS Safari NL', browser: 'Mac Safari 17', screen: '2560x1440', platform: 'MacIntel', language: 'nl-NL', timezone: 'Western Europe', geolocation: 'Amsterdam, Netherlands', webgl: 'Apple M1', hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0, connection: '4g-good' }
];

const otherExtras = [
    { label: 'Win11 Firefox DE', browser: 'Win11 Firefox 125', screen: '1920x1080', platform: 'Win32', language: 'de-DE', timezone: 'Central Europe', geolocation: 'Berlin, Germany', webgl: 'Intel Iris Desktop', hardwareConcurrency: 4, deviceMemory: 8, maxTouchPoints: 0, connection: '4g-good' },
    { label: 'Win11 Brave FR', browser: 'Win11 Brave 125', screen: '1920x1080', platform: 'Win32', language: 'fr-FR', timezone: 'Western Europe', geolocation: 'Paris, France', webgl: 'Intel Iris Desktop', hardwareConcurrency: 4, deviceMemory: 8, maxTouchPoints: 0, connection: '4g-good' },
    { label: 'Win11 Edge UK', browser: 'Win11 Edge', screen: '1920x1080', platform: 'Win32', language: 'en-GB', timezone: 'UK', geolocation: 'London, UK', webgl: 'Intel Iris Desktop', hardwareConcurrency: 4, deviceMemory: 8, maxTouchPoints: 0, connection: '4g-good' },
    { label: 'Linux Firefox DE', browser: 'Linux Firefox 128', screen: '1920x1080', platform: 'Linux x86_64', language: 'de-DE', timezone: 'Central Europe', geolocation: 'Berlin, Germany', webgl: 'Intel Iris Desktop', hardwareConcurrency: 4, deviceMemory: 8, maxTouchPoints: 0, connection: '4g-good' },
    { label: 'Linux Brave FR', browser: 'Linux Brave 125', screen: '1920x1080', platform: 'Linux x86_64', language: 'fr-FR', timezone: 'Western Europe', geolocation: 'Paris, France', webgl: 'Intel Iris Desktop', hardwareConcurrency: 4, deviceMemory: 8, maxTouchPoints: 0, connection: '4g-good' },
    { label: 'macOS Firefox FR', browser: 'Mac Firefox 128', screen: '2560x1440', platform: 'MacIntel', language: 'fr-FR', timezone: 'Western Europe', geolocation: 'Paris, France', webgl: 'Apple M1', hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0, connection: '4g-good' },
    { label: 'macOS Brave UK', browser: 'Mac Brave 127', screen: '2560x1440', platform: 'MacIntel', language: 'en-GB', timezone: 'UK', geolocation: 'London, UK', webgl: 'Apple M1', hardwareConcurrency: 8, deviceMemory: 8, maxTouchPoints: 0, connection: '4g-good' }
];

for (const e of [...safariExtras, ...otherExtras]) {
    if (!profiles.some(p => p.label === e.label)) profiles.push(e);
}

for (const p of profiles) {
    if (p.browser === 'Linux Firefox') p.browser = 'Linux Firefox 128';
    if (p.browser === 'Mac Safari') p.browser = 'Mac Safari 17';
    if (p.browser === 'Mac Chrome' || p.browser === 'Mac Chrome 126') {
        // demote stray mac chrome labels to safari/firefox/brave
        if (p.label.includes('Safari') || ma % 3 === 0) p.browser = pick(['Mac Safari 17', 'Mac Safari 18'], ma);
        else if (ma % 3 === 1) p.browser = 'Mac Firefox 128';
        else p.browser = 'Mac Brave 127';
        ma++;
    }
}

const counts = {};
for (const p of profiles) {
    const fam = family(p.browser);
    counts[fam] = (counts[fam] || 0) + 1;
}

fs.writeFileSync(rotationPath, JSON.stringify(profiles, null, 2) + '\n');
console.log('Total profiles:', profiles.length);
console.log('Browser family mix:', counts);
