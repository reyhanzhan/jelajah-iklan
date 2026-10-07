import fs from 'node:fs';
import path from 'node:path';
const html=fs.readFileSync('dist/index.html','utf8');
const refs=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match=>match[1]);
for(const ref of refs){
  if(/^https?:/.test(ref))continue;
  if(!fs.existsSync(path.join('dist',ref.replace(/^\//,''))))throw new Error(`Aset build tidak ditemukan: ${ref}`);
}
console.log(`Semua ${refs.length} aset HTML build tersedia.`);
