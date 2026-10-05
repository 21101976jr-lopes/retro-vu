// Deterministic cache version derived from actual production assets.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
function buildPwa(root=path.resolve(__dirname,'../build')) {
 const assets=[];
 function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,item.name);if(item.isDirectory())walk(full);
  else {const relative=path.relative(root,full).replaceAll('\\','/');
   if(/^(static\/.*\.(js|css)|images\/.*|stream\/.*\.js|recording\/.*\.js|index\.html|manifest\.json|logo(192|512)\.png|favicon\.ico)$/.test(relative))assets.push('/'+relative);
  }
 }}walk(root);assets.sort();
 const hash=crypto.createHash('sha256');for(const asset of assets)hash.update(asset).update(fs.readFileSync(path.join(root,asset.slice(1))));
 const template=fs.readFileSync(path.resolve(__dirname,'../public/sw.js'),'utf8');hash.update(template);
 const version=hash.digest('hex').slice(0,20);
 fs.writeFileSync(path.join(root,'sw.js'),template.replace("'__BUILD_VERSION__'",JSON.stringify(version)).replace('/*__PRECACHE__*/ []',JSON.stringify(assets)));
 return {version,assets};
}
if(require.main===module){const result=buildPwa();console.log(`PWA: ${result.assets.length} assets, version ${result.version}`);}
module.exports={buildPwa};
