// 빌드: src/ 조각을 합쳐 루트 index.html(배포용)과 artifact/cosmetic-lab.html(claude.ai 아티팩트용)을 만든다.
//   node src/build.js
const fs = require('fs'); const path = require('path');
const root = path.join(__dirname, '..');
const parts = ['part1.html','part2.js','part2b.js','part3.js'].map(f => fs.readFileSync(path.join(__dirname,f),'utf8'));
const body = parts.join('\n');
fs.mkdirSync(path.join(root,'artifact'), {recursive:true});
fs.writeFileSync(path.join(root,'artifact','cosmetic-lab.html'), body);
const ICON_SVG = fs.readFileSync(path.join(root,'icon.svg'),'utf8');
const favicon = 'data:image/svg+xml,' + encodeURIComponent(ICON_SVG);
const head = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="시중 화장품 성분을 배합해 보고, 산 화장품의 전성분을 읽어 주는 성인 소비자용 웹앱">
<meta name="theme-color" content="#FBF9F4" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#141614" media="(prefers-color-scheme: dark)">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="내 화장품 연구소">
<link rel="icon" href="${favicon}">
<link rel="apple-touch-icon" href="./apple-touch-icon.png">
<link rel="manifest" href="./manifest.webmanifest">
<style>
:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}
body{margin:0;font:14px system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#FBF9F4}
img{max-width:100%}
[hidden]{display:none!important}
</style>
</head>
<body>
`;
fs.writeFileSync(path.join(root,'index.html'), head + body + '\n</body>\n</html>\n');
console.log('built index.html + artifact/cosmetic-lab.html');
