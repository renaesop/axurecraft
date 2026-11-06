import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {convertRp9} from './convert.ts';
import {emitProject} from './emit.ts';
const [input,destination]=process.argv.slice(2);
if(!input||!destination){console.error('Usage: npm run convert -- INPUT.rp|INPUT.rpteam OUTPUT_DIRECTORY');process.exit(1);}
const {project,assets}=convertRp9(readFileSync(resolve(input)));
await emitProject(project,assets,destination,input);
console.log(JSON.stringify({output:resolve(destination),...project.stats},null,2));
