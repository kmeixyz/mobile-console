/** Capture real React games on a deterministic clock through their phone-control API. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { makeMaze, LEVELS, FIRST_MAZE_SEED, seeded } from '../../src/lib/maze.mjs';
import { HOLES, AIM } from '../../src/lib/moles.mjs';
const root=new URL('./',import.meta.url), out=new URL('assets/',root);
const games={target:'Archery',fruit:'Fruit',hockey:'AirHockey',moles:'WhackAMole',maze:'MazeRunner',rally:'Rally'};
const requested=process.argv.slice(2); const maze=makeMaze(LEVELS[0],seeded(FIRST_MAZE_SEED));
const clamp=n=>Math.max(-1,Math.min(1,n));
const ease=n=>{n=Math.max(0,Math.min(1,n));return n*n*(3-2*n)};
const lerp=(a,b,p)=>a+(b-a)*p;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
for(const [game,component] of Object.entries(games)){
 if(requested.length&&!requested.includes(game))continue;
 const two=game==='hockey', width=two?1680:840;
 const page=await browser.newPage({viewport:{width,height:420},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const date=new Date('2026-10-22T12:00:00Z');await page.clock.install({time:date});await page.clock.pauseAt(date);
 // Instrument only the local capture response; production game source stays untouched.
 await page.route(`**/src/games/${component}.tsx*`,async route=>{
  const response=await route.fetch();let body=await response.text();
  body=body.replace('renderer.toneMapping =','window.observeRenderer(renderer);renderer.toneMapping =');
  await route.fulfill({response,body});
 });
 await page.route('**/__tutorial-capture',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><script type="module">
 import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
 </script><style>html,body,#root,.capture-root{width:${width}px;height:420px;margin:0;overflow:hidden}.capture-root>div{height:420px}.capture-root :is(.target-wrap,.court-wrap,.fruit-arena,.moles-garden){position:absolute!important;inset:0!important;width:${width}px!important;height:420px!important;min-height:0!important;border:0!important;border-radius:0!important}.capture-root :is(.game-play-hint,.hockey-tag,.rally-tag,.court-overlay,.archery-shot-status){display:none!important}.moles-board{width:100%;height:100%}.capture-root :is(.target-wrap,.fruit-arena,.maze-arena) canvas{width:100%!important;height:100%!important;display:block}canvas{display:block}</style></head><body><main id="root"></main><script type="module">
 import '/src/styles.css';import '/src/components/refinements.css';import '/src/components/playful.css';
 import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
 import {seeded} from '/src/lib/maze.mjs';
 import Game from '/src/games/${component}.tsx';
 Math.random=seeded(5);window.frameInfo={};window.drawInfo={fruits:[]};
 window.observeRenderer=renderer=>{const render=renderer.render;renderer.render=function(scene,camera){render.call(this,scene,camera);if(camera.userData.side!==1)return;
 const project=p=>{const q=p.clone().project(camera);return {x:(q.x+1)/2,y:(1-q.y)/2}};
 const group=scene.children.find(o=>o.isGroup&&o.children.some(m=>m.geometry?.type==='CylinderGeometry'&&Math.abs(m.geometry.parameters.radiusBottom-${game==='hockey'?.44:.15})<.001));
 const ball=scene.children.find(o=>o.geometry?.type==='SphereGeometry'&&Math.abs(o.geometry.parameters.radius-.035)<.001);
 const marker=scene.children.find(o=>o.geometry?.type==='RingGeometry'&&Math.abs(o.geometry.parameters.innerRadius-.1275)<.001);
 window.frameInfo={paddle:group?{...project(group.position),world:{x:group.position.x,y:group.position.y,z:group.position.z}}:null,ball:ball?{...project(ball.position),world:{x:ball.position.x,y:ball.position.y,z:ball.position.z}}:null,intercept:marker?{visible:marker.visible,x:marker.position.x,y:marker.position.y,z:marker.position.z}:null};};};
 const arc=CanvasRenderingContext2D.prototype.arc,clear=CanvasRenderingContext2D.prototype.clearRect;
 CanvasRenderingContext2D.prototype.clearRect=function(...args){if(this.canvas.closest('#root'))window.drawInfo={fruits:[]};return clear.apply(this,args)};
 CanvasRenderingContext2D.prototype.arc=function(x,y,r,a,b,...rest){if(this.canvas.closest('#root')){const m=this.getTransform(),point={x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f};if('${game}'==='fruit'&&r>=36&&r<=44&&b-a>6.2)window.drawInfo.fruits.push({...point,r});if(('${game}'==='fruit'&&(r===9||r===11))||('${game}'==='target'&&r===11))window.drawInfo.aim=point;}return arc.call(this,x,y,r,a,b,...rest)};
 const room={handler:{current:null},buzz(){},publish(game,ready,label){window.captureStatus={game,ready,label}}};window.control=e=>room.handler.current?.({...e,player:e.player||'You'});
 ReactDOM.createRoot(document.getElementById('root')).render(React.createElement('div',{className:'capture-root'},React.createElement(Game,{roster:${two?'["You","Friend"]':'["You"]'},settings:{sound:false,motion:false,contrast:false,name:'You'},suspended:false,room,relaxed:true,onComplete(){},onExit(){}})));
 </script></body></html>`}));
 await page.goto('http://localhost:5190/__tutorial-capture');
 await page.waitForFunction(()=>window.control&&window.captureStatus);
 // Resolve fonts/layout and let ResizeObserver settle before frame zero.
 // Resizing a canvas clears it, so record only after a subsequent game draw.
 await page.evaluate(() => document.fonts.ready);
 await page.screenshot();
 await page.clock.runFor(32);
 await page.screenshot();
 await page.clock.runFor(32);
 const temp=`/tmp/mobile-console-tutorial-${game}`;await mkdir(temp,{recursive:true});await mkdir(out,{recursive:true});
 const metadata={fps:60,duration:5,source:component,frames:[]};
 let input={x:0,y:0}, pressed=false, targetHole=null, aimedAt=-1,lastTap=-1;
 let wind={speed:0,angle:0};
 if(game==='target')wind=await page.evaluate(()=>({speed:Number(document.querySelector('.wind-badge strong').textContent),angle:parseFloat(document.querySelector('.wind-badge svg:nth-child(2)').style.rotate)}));
 for(let frame=0;frame<300;frame++){
  const t=frame/60;const events=[];let phase=t<.8?0:t<2.8?1:2;
  const prior=await page.evaluate(()=>({info:window.frameInfo,draw:window.drawInfo,holes:[...document.querySelectorAll('[data-hole]')].map(el=>({index:Number(el.dataset.hole),kind:el.dataset.animal})),status:window.captureStatus}));
  if(game==='target'){
   phase=t<1.35?0:t<2.85?1:2;pressed=t>=.45&&t<2.85;
   if(frame===27)events.push({action:'draw',value:1});
   const p=ease((t-.9)/1.4),carry=wind.speed*.075;
   input={x:lerp(.44,-Math.cos(wind.angle)*carry,p),y:lerp(.22,-Math.sin(wind.angle)*carry,p)};
   if(frame===171)events.push({action:'shoot',value:0});
  }else if(game==='maze'){
   phase=t<.7?0:t<3.9?1:2;pressed=t>=.65&&t<4;
   if(frame===39)events.push({action:'draw',value:1});if(frame===240)events.push({action:'draw',value:0});
   const progress=Math.max(0,Math.min(maze.path.length-1,(t-.75)/.235));
   const i=Math.min(maze.path.length-2,Math.floor(progress)),f=progress-i;
   const point={x:lerp(maze.path[i].c+.5,maze.path[i+1].c+.5,f),y:lerp(maze.path[i].r+.5,maze.path[i+1].r+.5,f)};
   input={x:(point.x/7*2-1)*.9,y:(point.y/5*2-1)*.9};
  }else if(game==='fruit'){
   pressed=t>=.35&&t<.55;if(frame===21)events.push({action:'throw',value:0});
   // Two deliberate arcs, never chasing fruit fragments or snapping targets.
   // Pixel positions map back through the production game's phone calibration.
   const outward=ease((t-1.02)/.64), returning=ease((t-2.55)/.7);
   const x=lerp(170,650,outward)-480*returning;
   const y=lerp(205,140,outward)+55*returning;
   input={x:(x/840*900-450)/380/1.075,y:(y/420*600-330)/260/1.075};
  }else if(game==='moles'){
   phase=t<1.3?0:t<2.85?1:2;pressed=false;
   if(frame===21)events.push({action:'throw',value:0});
   const moles=prior.holes.filter(h=>h.kind==='mole');
   if(t>.7&&t<3.2){
    if(targetHole===null||!moles.some(h=>h.index===targetHole)){
     targetHole=moles[0]?.index??null;aimedAt=t;
    }
    if(targetHole!==null){const hole=HOLES[targetHole];input={x:(hole.x-AIM.x)/AIM.reachX,y:(hole.y-40-AIM.y)/AIM.reachY};if(t-aimedAt>.36&&t-lastTap>.5){events.push({action:'throw',value:0});lastTap=t;}}
   }
   pressed=t-lastTap<.16;
  }else if(game==='hockey'){
   pressed=t>=.35&&t<.55;if(frame===21)events.push({action:'throw',value:0});
   events.push({action:'aim',value:.85,player:'Friend'},{action:'move',value:.8,player:'Friend'});
   const p=ease((t-.8)/1.25);input={x:0,y:lerp(.9,-1,p)};
  }else if(game==='rally'){
   pressed=t>=.35&&t<.55;if(frame===21)events.push({action:'throw',value:0});
   const catchPoint=prior.info.intercept;
   if(catchPoint?.visible&&t>1){input={x:catchPoint.x/1.0125,y:1-2*(catchPoint.y-.04)/.81};}
   else if(t<1)input={x:-.28,y:.12};
  }
  input.x=clamp(input.x);input.y=clamp(input.y);
  await page.evaluate(({input,events})=>{window.control({action:'aim',value:input.x});window.control({action:'move',value:input.y});events.forEach(window.control)}, {input,events});
  if(frame>0)await page.clock.runFor(frame%3===0?16:17);
  const info=await page.evaluate(()=>({info:window.frameInfo,draw:window.drawInfo,reticle:document.querySelector('.moles-reticle')?.getAttribute('transform'),status:window.captureStatus}));
  let aim={x:(input.x+1)/2,y:(input.y+1)/2};
  if(['fruit','target'].includes(game)&&info.draw.aim)aim={x:info.draw.aim.x/840,y:info.draw.aim.y/420};
  if(['hockey','rally'].includes(game)&&info.info.paddle)aim={x:info.info.paddle.x,y:info.info.paddle.y};
  if(game==='moles'&&info.reticle){const [x,y]=info.reticle.match(/[-\d.]+/g).map(Number);aim={x:(105+x*.7)/840,y:y/600};}
  if(game==='maze'){const size=420/5.8,ox=(840-7*size)/2,oy=(420-5*size)/2;aim={x:(ox+(input.x/.9+1)/2*7*size)/840,y:(oy+(input.y/.9+1)/2*5*size)/420};}
  metadata.frames.push({...aim,inputX:input.x,inputY:input.y,pressed,phase});
  if(!Number.isFinite(input.x)||!Number.isFinite(input.y)||!Number.isFinite(aim.x)||!Number.isFinite(aim.y))throw new Error(`Invalid aim for ${game} at ${frame}`);
  await page.screenshot({path:`${temp}/${String(frame).padStart(4,'0')}.jpg`,type:'jpeg',quality:93,clip:{x:0,y:0,width:840,height:420}});
  if(frame%60===0)console.log(game,frame,info.status.label,JSON.stringify(info.info));
 }
 if(errors.length)throw new Error(errors.join('\n'));
 const output=new URL(`gameplay-${game}.mp4`,out).pathname;
 const ff=spawnSync('/opt/homebrew/bin/ffmpeg',['-y','-loglevel','error','-framerate','60','-i',`${temp}/%04d.jpg`,'-frames:v','300','-c:v','libx264','-preset','fast','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',output],{encoding:'utf8'});
 if(ff.status!==0)throw new Error(ff.stderr);
 await writeFile(new URL(`aim-${game}.json`,out),JSON.stringify(metadata));
 console.log('DONE',game,output);await page.close();
}
await browser.close();
