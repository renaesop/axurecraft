import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const label='com.axurecraft.issue-worker';
const xml=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function launchAgentPlist({node,script,root,path}){
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${label}</string>
<key>ProgramArguments</key><array><string>${xml(node)}</string><string>${xml(script)}</string></array>
<key>StartInterval</key><integer>7200</integer>
<key>RunAtLoad</key><false/>
<key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(path)}</string><key>AXURECRAFT_WORKER_STATE</key><string>${xml(root)}</string></dict>
<key>StandardOutPath</key><string>${xml(join(root,'worker.stdout.log'))}</string>
<key>StandardErrorPath</key><string>${xml(join(root,'worker.stderr.log'))}</string>
</dict></plist>\n`;
}
function run(command,args){const r=spawnSync(command,args,{encoding:'utf8'});if(r.error||r.status!==0)throw r.error??new Error(`${command}: ${r.stderr}`);return r.stdout.trim();}
function main(){
  if(process.platform!=='darwin')throw new Error('This installer uses macOS launchd. Run issue-worker.mjs from your scheduler on other systems.');
  const script=resolve(dirname(fileURLToPath(import.meta.url)),'issue-worker.mjs');
  const directory=join(homedir(),'Library/LaunchAgents'),file=join(directory,label+'.plist'),domain=`gui/${process.getuid()}`,service=domain+'/'+label;
  if(existsSync(file)&&!readFileSync(file,'utf8').includes(xml(script)))throw new Error(`Existing job uses another checkout: ${file}`);
  if(process.argv.includes('--uninstall')){
    if(spawnSync('launchctl',['print',service]).status===0)run('launchctl',['bootout',service]);
    rmSync(file,{force:true});console.log(JSON.stringify({status:'removed',label}));return;
  }
  const binaries=['codex','gh'].map(name=>run('/usr/bin/which',[name]));
  const path=[...new Set([dirname(process.execPath),...binaries.map(dirname),...(process.env.PATH??'/usr/bin:/bin').split(':')])].join(':');
  const root=resolve(process.env.AXURECRAFT_WORKER_STATE??join(homedir(),'.local/state/axurecraft-issue-worker'));
  const plist=launchAgentPlist({node:process.execPath,script,root,path});
  if(process.argv.includes('--dry-run')){console.log(plist);return;}
  mkdirSync(directory,{recursive:true});mkdirSync(root,{recursive:true});
  if(spawnSync('launchctl',['print',service]).status===0)run('launchctl',['bootout',service]);
  writeFileSync(file,plist,{mode:0o600});run('/usr/bin/plutil',['-lint',file]);run('launchctl',['bootstrap',domain,file]);
  console.log(JSON.stringify({status:'scheduled',label,intervalSeconds:7200,runAtLoad:false,file,state:root}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
