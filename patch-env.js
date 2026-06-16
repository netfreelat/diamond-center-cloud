var fs = require('fs');
var envPath = '/var/www/recargasney/.env';
var content = fs.readFileSync(envPath, 'utf8');
content = content.replace(/JADH_PASSWORD=.*/m, 'JADH_PASSWORD="Net2121**#"');
fs.writeFileSync(envPath, content);
console.log('Resultado:');
var lines = content.split('\n').filter(function(l) { return l.includes('JADH'); });
lines.forEach(function(l) { console.log(l); });
