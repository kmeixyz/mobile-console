/* Tutorial framing only. Gameplay pixels come from the actual game-engine recordings.
 * Every pose, press, beam endpoint and caption is a deterministic function of capture time. */
const W=960,H=800;
const SCREEN={x:60,y:120,w:840,h:420};
const C={ink:'#253f51',coral:'#f57e6c',mint:'#73b6b1',lavender:'#8e92dc',cream:'#fff8e7',gold:'#ffd676',white:'#ffffff',muted:'#647985'};
const FONT='-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif';
const META={
 target:{title:'Aim for the middle!',steps:['Hold the big button','Point at the target','Let go to shoot!'],notes:['Press and hold','Keep holding','Lift your finger'],bg:'#e8f3f6'},
 fruit:{title:'Move your phone to slice!',steps:['Tap the big button','Point left and right','Slice the fruit!'],notes:['Tap to start','Sweep left & right','Keep slicing!'],bg:'#fff0e8'},
 hockey:{title:'Push the puck into the goal!',steps:['Tap the big button','Point to move your paddle','Push into the far goal!'],notes:['One quick tap','Move your phone','Push the puck'],bg:'#e9f2f7'},
 moles:{title:'Find a mole. Give it a tap!',steps:['Point at a mole','Tap the big button','Leave the animals alone!'],notes:['Move your phone','One quick tap','Moles only!'],bg:'#f1efe4'},
 maze:{title:'Guide your player to the flag!',steps:['Point at your player','Hold and move your phone','Let go at the flag!'],notes:['Find your player','Keep holding','Lift your finger'],bg:'#edf3eb'},
 rally:{title:'Meet the ball with your paddle!',steps:['Tap the big button','Point to meet the ball','Your paddle hits it!'],notes:['One quick tap','Move your phone','No extra tap'],bg:'#f0eef8'}
};
const clamp=v=>Math.max(0,Math.min(1,v));
const ease=v=>{v=clamp(v);return v*v*(3-2*v)};
const mix=(a,b,p)=>a+(b-a)*p;
function rr(c,x,y,w,h,r,fill,stroke,width=3){c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke()}}
function circ(c,x,y,r,fill,stroke,width=3){c.beginPath();c.arc(x,y,r,0,Math.PI*2);if(fill){c.fillStyle=fill;c.fill()}if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke()}}
function line(c,pts,color,width=4,dash=[]){c.beginPath();pts.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.setLineDash(dash);c.stroke();c.setLineDash([])}
function txt(c,s,x,y,size=24,color=C.ink,align='left',weight=550){c.font=`${weight} ${size}px ${FONT}`;c.letterSpacing='.5px';c.fillStyle=color;c.textAlign=align;c.textBaseline='middle';c.fillText(s,x,y)}
function sample(game,t){const data=window.TUTORIAL_AIM[game],idx=Math.min(data.frames.length-1,Math.max(0,Math.round(t*(data.fps||60)))),a=data.frames[idx];let finger=a.pressed?1:0;if(!finger){for(let d=1;d<=15;d++){if(data.frames[idx-d]?.pressed||data.frames[idx+d]?.pressed){finger=ease(1-d/16);break}}}let orientationX=0,orientationY=0,total=0;for(let offset=-8;offset<=8;offset++){const f=data.frames[Math.max(0,Math.min(data.frames.length-1,idx+offset))],weight=9-Math.abs(offset);orientationX+=(f.inputX??(f.x-.5)*2)*weight;orientationY+=(f.inputY??(f.y-.5)*2)*weight;total+=weight}return {...a,inputX:a.inputX??(a.x-.5)*2,inputY:a.inputY??(a.y-.5)*2,orientationX:orientationX/total,orientationY:orientationY/total,pressed:a.pressed?1:0,finger,phase:a.phase??0}}
function blendState(a,b,p){return {x:mix(a.x,b.x,p),y:mix(a.y,b.y,p),inputX:mix(a.inputX??0,b.inputX??0,p),inputY:mix(a.inputY??0,b.inputY??0,p),orientationX:mix(a.orientationX??0,b.orientationX??0,p),orientationY:mix(a.orientationY??0,b.orientationY??0,p),pressed:mix(a.pressed,b.pressed,p),finger:mix(a.finger??a.pressed,b.finger??b.pressed,p),phase:p<.5?a.phase:b.phase}}
function pose(state){const yaw=(state.orientationX??state.inputX??(state.x-.5)*2)*.52;const roll=(state.orientationX??state.inputX??(state.x-.5)*2)*.24;const pitch=.2+(state.orientationY??state.inputY??(state.y-.5)*2)*.12;return {yaw,roll,pitch}}
function projectTop({yaw,roll,pitch}){let y=-90*Math.cos(pitch),z=-90*Math.sin(pitch),x=z*Math.sin(yaw);z*=Math.cos(yaw);const xx=x*Math.cos(roll)-y*Math.sin(roll),yy=x*Math.sin(roll)+y*Math.cos(roll),s=700/(700-z);return [480+xx*s,639+yy*s]}
function beam(c,state,t){const aim=[SCREEN.x+state.x*SCREEN.w,SCREEN.y+state.y*SCREEN.h],start=projectTop(pose(state));const dx=aim[0]-start[0],dy=aim[1]-start[1],len=Math.max(1,Math.hypot(dx,dy)),ux=dx/len,uy=dy/len;
 // Broad, bright link starts at the top edge of the phone, not at its button.
 c.save();c.shadowColor='#fa887860';c.shadowBlur=12;line(c,[start,[aim[0]-ux*23,aim[1]-uy*23]],'#ffffffd9',8);line(c,[start,[aim[0]-ux*23,aim[1]-uy*23]],C.coral,4,[11,9]);c.shadowBlur=0;
 const end=[aim[0]-ux*20,aim[1]-uy*20];line(c,[[end[0]-ux*13-uy*7,end[1]-uy*13+ux*7],end,[end[0]-ux*13+uy*7,end[1]-uy*13-ux*7]],C.coral,4);
 circ(c,...start,6,C.coral,C.white,2);circ(c,...aim,17,null,'#ffffffd9',6);circ(c,...aim,17,null,C.coral,3);c.restore();
}
function phoneArtwork(canvas,state,game){const c=canvas.getContext('2d');c.clearRect(0,0,284,376);c.save();c.scale(2,2);const pressed=state.pressed,finger=state.finger??pressed;
 const body=c.createLinearGradient(0,0,142,188);body.addColorStop(0,'#6e8796');body.addColorStop(.4,C.ink);body.addColorStop(1,'#142f43');rr(c,1,1,140,186,25,body);rr(c,5,4,132,177,22,'#8ea4af');rr(c,8,6,126,174,20,'#f8fbfa');
 const screen=c.createLinearGradient(0,10,142,172);screen.addColorStop(0,'#fffefd');screen.addColorStop(1,'#edf4f4');rr(c,9,7,124,171,20,screen);rr(c,53,14,36,7,4,C.ink);txt(c,'Your phone',71,42,16,C.muted,'center',500);
 const by=93+pressed*3;circ(c,71,97,40,'#e3b2a9');const button=c.createLinearGradient(34,55,106,127);button.addColorStop(0,pressed?'#e97a6d':'#ffa595');button.addColorStop(1,pressed?'#f58b7a':C.coral);circ(c,71,by,39,button);circ(c,61,by-12,14,'#ffffff16');
 if(pressed>.02){c.save();c.globalAlpha=pressed;circ(c,71,by,45,null,'#fa887880',3);c.restore()}
 const isHold=game==='target'||game==='maze';const label=pressed>.45?(isHold?'Hold':'Tap'):game==='target'?(state.phase===2?'Let go':'Hold'):state.phase===0&&game!=='maze'&&game!=='moles'?'Tap':'Point';
 circ(c,71,by,pressed>.45?9:8,C.white)
 txt(c,label,71,151,19,C.ink,'center',550);rr(c,52,168,38,4,2,'#a9bdc4');
 // A large fingertip physically lands in the middle of the button when input is held.
 if(finger>.01){c.save();c.globalAlpha=clamp(finger*2);c.translate(81+(1-finger)*19,108+(1-finger)*26);c.rotate(-.42);rr(c,-13,-20,27,51,14,'#dcae8f',C.white,3);rr(c,-11,-20,23,47,12,'#f6d3b7');rr(c,-6,-15,13,15,6,'#ffe5d1');c.restore()}
 c.restore();
 const p=pose(state);canvas.style.transform=`perspective(700px) rotateZ(${p.roll}rad) rotateY(${p.yaw}rad) rotateX(${p.pitch}rad)`;
}
function caption(c,game,phase,alpha=1){
 const m=META[game];
 // One caption is painted per frame. Never layer different instructions.
 c.save();c.globalAlpha=alpha;
 circ(c,89,762,19,C.gold);txt(c,String(phase+1),89,762,22,C.ink,'center',600);
 txt(c,m.steps[phase],125,762,31,C.white,'left',550);
 for(let i=0;i<3;i++)rr(c,814+i*25,758,17,7,3.5,i===phase?C.gold:'#607b8c');
 c.restore();
}
function phaseOpacity(game,t,phase){
 const data=window.TUTORIAL_AIM[game];const frame=Math.round(t*60);
 let distance=7;
 for(let d=0;d<=7;d++){
  if(data.frames[Math.min(299,frame+d)]?.phase!==phase||data.frames[Math.max(0,frame-d)]?.phase!==phase){distance=d;break}
 }
 return .15+.85*ease(distance/7);
}
window.drawTutorial=(canvas,phoneCanvas,game,time)=>{
 const c=canvas.getContext('2d'),t=Math.max(0,Math.min(5,time)),m=META[game];
 // Fully conceal the change of state; outgoing and incoming words/art never overlap.
 const resetting=t>=4.55;
 const state=sample(game,resetting?0:t);
 const reveal=t<4.35?1:t<4.55?1-ease((t-4.35)/.2):ease((t-4.55)/.35);
 c.clearRect(0,0,W,H);
 txt(c,m.title,60,59,36,C.ink,'left',550);
 // A quiet underline gives the heading its own zone, with ample space before the screen.
 rr(c,60,92,48,4,2,C.coral);
 c.save();c.globalAlpha=reveal;beam(c,state,t);c.restore();
 phoneArtwork(phoneCanvas,state,game);phoneCanvas.style.opacity=reveal;
 txt(c,'Point the top',211,623,25,C.ink,'center',550);
 txt(c,'at the screen',211,657,25,C.ink,'center',550);
 c.save();c.globalAlpha=reveal*(resetting?1:phaseOpacity(game,t,state.phase));
 txt(c,m.notes[state.phase],747,639,25,C.ink,'center',550);c.restore();
 rr(c,60,734,840,56,28,C.ink);
 caption(c,game,state.phase,reveal*(resetting?1:phaseOpacity(game,t,state.phase)));
};
