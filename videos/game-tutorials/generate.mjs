import {writeFile, readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const games=['target','fruit','hockey','moles','maze','rally'];
const aim={};
for(const game of games){
  aim[game]=JSON.parse(await readFile(new URL(`assets/aim-${game}.json`,import.meta.url),'utf8'));
  execFileSync('ffmpeg',['-y','-v','error','-i',new URL(`assets/gameplay-${game}.mp4`,import.meta.url).pathname,'-frames:v','1',new URL(`assets/opening-${game}.png`,import.meta.url).pathname]);
}
const declarations=[{id:'game',type:'string',label:'Game',default:'target'},{id:'footage',type:'string',label:'Actual gameplay',default:'assets/gameplay-target.mp4'},{id:'opening',type:'string',label:'Opening frame',default:'assets/opening-target.png'}];
const html=`<!doctype html>
<html lang="en" data-composition-variables='${JSON.stringify(declarations)}'>
<head><meta charset="UTF-8"><meta name="viewport" content="width=960,height=800"><title>How to play</title><script src="assets/gsap.min.js"></script>
<style>*{box-sizing:border-box}html,body{margin:0;width:960px;height:800px;overflow:hidden}#root{position:relative;width:100%;height:100%;overflow:hidden;background:#e8f3f6}#background{position:absolute;inset:0;background:linear-gradient(145deg,#ffffffa0,#ffffff10)}#game-frame{position:absolute;left:52px;top:112px;width:856px;height:436px;border:8px solid #ffffff;border-radius:28px;overflow:hidden;box-shadow:0 12px 30px #29465a15}#underlay,#gameplay,#opening{position:absolute;inset:0;width:840px;height:420px;object-fit:fill;display:block}#underlay{background-size:100% 100%}#opening{opacity:0}#reset-cover{position:absolute;inset:0;background:#f8faf9;opacity:0}#tutorial{position:absolute;inset:0;width:960px;height:800px;pointer-events:none}#phone{position:absolute;left:412px;top:549px;width:136px;height:180px;transform-origin:center;filter:drop-shadow(0 10px 12px #29465a25);pointer-events:none}</style></head>
<body><div id="root" data-composition-id="main" data-start="0" data-duration="5" data-width="960" data-height="800"><div id="background"></div><div id="game-frame"><div id="underlay"></div><video id="gameplay" class="clip" src="assets/gameplay-target.mp4" data-var-src="footage" data-start="0" data-media-start="0" data-duration="5" data-track-index="0" muted playsinline></video><img id="opening" src="assets/opening-target.png" data-var-src="opening" alt="The opening frame of the actual game" /><div id="reset-cover"></div></div><canvas id="tutorial" width="960" height="800"></canvas><canvas id="phone" width="284" height="376"></canvas></div>
<script>window.TUTORIAL_AIM=${JSON.stringify(aim)};</script><script src="draw.js"></script><script>
const variables=window.__hyperframes?.getVariables?.()||{};const game=variables.game||'target';document.getElementById('underlay').style.backgroundImage='url('+ (variables.opening||'assets/opening-target.png') +')';const state={time:0};const canvas=document.getElementById('tutorial');const phoneCanvas=document.getElementById('phone');document.getElementById('root').style.backgroundColor=META[game].bg;
const tl=gsap.timeline({paused:true});tl.to(state,{time:5,duration:5,ease:'none',onUpdate:()=>window.drawTutorial(canvas,phoneCanvas,game,state.time)},0);tl.to('#reset-cover',{opacity:1,duration:.2,ease:'power2.in'},4.35);tl.set('#opening',{opacity:1},4.55);tl.to('#reset-cover',{opacity:0,duration:.35,ease:'power2.out'},4.55);window.__timelines=window.__timelines||{};window.__timelines.main=tl;window.drawTutorial(canvas,phoneCanvas,game,0);
</script></body></html>`;
await writeFile(new URL('index.html',import.meta.url),html);
await writeFile(new URL('rows.json',import.meta.url),JSON.stringify(games.map(game=>({game,footage:`assets/gameplay-${game}.mp4`,opening:`assets/opening-${game}.png`})),null,2)+'\n');
