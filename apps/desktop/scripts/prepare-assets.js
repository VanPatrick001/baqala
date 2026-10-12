// Copie l'écran de connexion commun (apps/shared) dans l'application avant lancement ou compilation.
const fs = require('node:fs');
const path = require('node:path');
const shared = path.join(__dirname, '..', '..', 'shared');
const out = path.join(__dirname, '..', 'src', 'setup');
fs.mkdirSync(out, { recursive: true });
for (const f of ['connect.html', 'icon.svg']) fs.copyFileSync(path.join(shared, f), path.join(out, f));
console.log('assets ok');
