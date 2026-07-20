'use strict';

const $ = (id) => document.getElementById(id);
const el = {
  canvas: $('gameCanvas'), mode: $('modeSelect'), difficulty: $('difficultySelect'),
  stars: $('starsValue'), starsTotal: $('starsTotal'), score: $('scoreValue'), combo: $('comboValue'),
  time: $('timeValue'), lives: $('livesValue'), level: $('levelValue'), best: $('bestValue'),
  status: $('statusBadge'), objective: $('objectiveText'), progress: $('progressText'),
  progressBar: $('progressBar'), progressTrack: $('progressTrack'), message: $('messageBox'),
  energy: $('energyValue'), energyBar: $('energyBar'), coins: $('coinValue'), keys: $('keyValue'), shields: $('shieldValue'),
  missionStars: $('missionStars'), missionStarsText: $('missionStarsText'), missionKey: $('missionKey'),
  missionKeyText: $('missionKeyText'), missionPortal: $('missionPortal'), missionPortalText: $('missionPortalText'),
  pause: $('pauseButton'), restart: $('restartButton'), pauseOverlay: $('pauseOverlay'), resume: $('resumeButton'),
  resultOverlay: $('resultOverlay'), resultIcon: $('resultIcon'), resultTitle: $('resultTitle'), resultText: $('resultText'),
  resultScore: $('resultScore'), resultStars: $('resultStars'), resultMoves: $('resultMoves'),
  next: $('nextLevelButton'), again: $('playAgainButton'), help: $('helpButton'), helpDialog: $('helpDialog'),
  closeHelp: $('closeHelpButton'), theme: $('themeButton'), sound: $('soundButton'), undo: $('undoTool'), hint: $('hintTool')
};

if (!el.canvas) throw new Error('Canvas not found');
const ctx = el.canvas.getContext('2d');
const tools = [...document.querySelectorAll('.tool-button[data-tool]')];

const CONFIG = {
  easy: { size: 11, time: 150, lives: 4, stars: 5, traps: 3 },
  normal: { size: 15, time: 110, lives: 3, stars: 7, traps: 7 },
  hard: { size: 19, time: 85, lives: 2, stars: 9, traps: 13 }
};

const state = {
  grid: [], player: {x:1,y:1}, portal: {x:1,y:1}, stars: [], crystals: [], pickups: [], traps: [], key: null,
  collected: 0, target: 0, hasKey: false, score: 0, combo: 1, lives: 3, level: 1, moves: 0,
  energy: 100, crystalsCount: 0, keysCount: 0, shieldsCount: 0, timeLeft: 110,
  running: false, paused: false, finished: false, history: [], hintPath: [], soundOn: true,
  best: Number(localStorage.getItem('starforge.best.v2')) || 0
};

function shuffle(a){
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

function generateMaze(size){
  const grid=Array.from({length:size},()=>Array(size).fill(0));
  const stack=[{x:1,y:1}], dirs=[[0,-2],[2,0],[0,2],[-2,0]];
  grid[1][1]=1;
  while(stack.length){
    const current=stack[stack.length-1], options=[];
    for(const [dx,dy] of dirs){
      const x=current.x+dx,y=current.y+dy;
      if(x>0&&y>0&&x<size-1&&y<size-1&&grid[y][x]===0) options.push({x,y,wx:current.x+dx/2,wy:current.y+dy/2});
    }
    if(!options.length){stack.pop();continue;}
    const next=options[Math.floor(Math.random()*options.length)];
    grid[next.wy][next.wx]=1; grid[next.y][next.x]=1; stack.push({x:next.x,y:next.y});
  }
  return grid;
}

function floorCells(){
  const out=[];
  state.grid.forEach((row,y)=>row.forEach((v,x)=>{if(v===1&&!(x===1&&y===1)) out.push({x,y});}));
  return shuffle(out);
}

function bfs(from,to,avoidTraps=false){
  if(!to) return [];
  const n=state.grid.length, queue=[from], key=p=>p.y*n+p.x, prev=new Map([[key(from),null]]);
  const blocked=new Set(avoidTraps?state.traps.map(key):[]), dirs=[[0,-1],[1,0],[0,1],[-1,0]];
  while(queue.length){
    const current=queue.shift();
    if(current.x===to.x&&current.y===to.y){
      const path=[]; let p=current;
      while(p){path.unshift(p);p=prev.get(key(p));}
      return path;
    }
    for(const [dx,dy] of dirs){
      const x=current.x+dx,y=current.y+dy,k=y*n+x;
      if(x<0||y<0||x>=n||y>=n||state.grid[y][x]!==1||prev.has(k)||blocked.has(k)) continue;
      prev.set(k,current); queue.push({x,y});
    }
  }
  return [];
}

function build(keepScore=false){
  const cfg=CONFIG[el.difficulty.value] || CONFIG.normal;
  state.grid=generateMaze(cfg.size);
  const available=floorCells();
  state.player={x:1,y:1}; state.portal=available.pop() || {x:1,y:1};
  state.stars=available.splice(0,Math.min(cfg.stars+Math.floor((state.level-1)/2),available.length));
  state.crystals=available.splice(0,Math.min(4,available.length));
  state.pickups=available.splice(0,Math.min(3,available.length));
  state.key=available.pop() || null;
  state.traps=available.splice(0,Math.min(cfg.traps,available.length));
  state.target=state.stars.length; state.collected=0; state.hasKey=false; state.moves=0; state.energy=100;
  state.combo=1; state.history=[]; state.hintPath=[]; state.finished=false; state.paused=false; state.running=true;
  state.timeLeft=el.mode.value==='survival'?cfg.time*2:el.mode.value==='challenge'?Math.round(cfg.time*.7):cfg.time;
  state.lives=el.mode.value==='survival'?1:cfg.lives;
  if(!keepScore){state.score=0;state.level=1;state.crystalsCount=0;state.keysCount=0;state.shieldsCount=0;}
  el.pauseOverlay.classList.add('hidden'); el.resultOverlay.classList.add('hidden');
  setStatus('Misiune activă'); setMessage('Misiune începută. Găsește prima steluță.');
  sync(); draw();
}

function findIndex(list,x,y){return list.findIndex(p=>p.x===x&&p.y===y);}

function move(direction){
  if(!state.running||state.paused||state.finished) return;
  const d={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[direction];
  if(!d) return;
  const x=state.player.x+d[0],y=state.player.y+d[1];
  if(!state.grid[y]||state.grid[y][x]!==1){setMessage('Perete. Încearcă altă direcție.');return;}
  state.history.push(JSON.stringify({player:state.player,stars:state.stars,crystals:state.crystals,pickups:state.pickups,traps:state.traps,key:state.key,collected:state.collected,hasKey:state.hasKey,score:state.score,lives:state.lives,energy:state.energy,combo:state.combo}));
  if(state.history.length>40) state.history.shift();
  state.player={x,y}; state.moves++; state.hintPath=[];
  collect(); checkTrap(); checkPortal(); sync(); draw();
}

function collect(){
  let i=findIndex(state.stars,state.player.x,state.player.y);
  if(i>=0){state.stars.splice(i,1);state.collected++;state.combo=Math.min(9,state.combo+1);state.score+=100*state.combo;setMessage(`Stea colectată! Combo x${state.combo}.`);}
  i=findIndex(state.crystals,state.player.x,state.player.y);
  if(i>=0){state.crystals.splice(i,1);state.crystalsCount++;state.score+=50;setMessage('Cristal recuperat. +50 puncte.');}
  i=findIndex(state.pickups,state.player.x,state.player.y);
  if(i>=0){state.pickups.splice(i,1);state.energy=Math.min(100,state.energy+30);setMessage('Energie recuperată. +30%.');}
  if(state.key&&state.key.x===state.player.x&&state.key.y===state.player.y){state.key=null;state.hasKey=true;state.keysCount++;state.score+=150;setMessage('Cheie recuperată. Portalul poate fi deblocat.');}
}

function checkTrap(){
  const i=findIndex(state.traps,state.player.x,state.player.y); if(i<0) return;
  state.traps.splice(i,1);
  if(state.shieldsCount>0){state.shieldsCount--;setMessage('Scutul a absorbit capcana.');return;}
  state.lives--;state.combo=1;state.score=Math.max(0,state.score-60);setMessage('Capcană! Ai pierdut o viață.');
  if(state.lives<=0) finish(false,'Nucleul a cedat. Misiune eșuată.');
}

function checkPortal(){
  if(state.player.x!==state.portal.x||state.player.y!==state.portal.y) return;
  if(state.collected<state.target){setMessage(`Portal blocat. Mai ai ${state.target-state.collected} stele.`);return;}
  if(!state.hasKey){setMessage('Portal blocat. Ai nevoie de cheie.');return;}
  const bonus=state.timeLeft*5;state.score+=500+bonus;finish(true,`Portal activat. Bonus de timp: ${bonus} puncte.`);
}

function useTool(name,cost){
  if(!state.running||state.paused||state.finished) return;
  if(state.energy<cost){setMessage('Energie insuficientă.');return;}
  state.energy-=cost;
  if(name==='scan') setMessage('Scanner activ. Capcanele sunt vizibile.');
  if(name==='shield'){state.shieldsCount++;setMessage('Scut activ.');}
  if(name==='magnet'){
    for(let i=state.stars.length-1;i>=0;i--){const s=state.stars[i];if(Math.abs(s.x-state.player.x)<=2&&Math.abs(s.y-state.player.y)<=2){state.stars.splice(i,1);state.collected++;state.score+=80;}}
    setMessage('Magnet activat.');
  }
  if(name==='teleport'){const options=floorCells();const p=options[Math.floor(Math.random()*options.length)];if(p){state.player=p;collect();checkTrap();checkPortal();}setMessage('Teleportare efectuată.');}
  sync();draw();
}

function undo(){
  if(!state.history.length){setMessage('Nu mai există mișcări de anulat.');return;}
  Object.assign(state,JSON.parse(state.history.pop()));state.moves=Math.max(0,state.moves-1);setMessage('Mișcare anulată.');sync();draw();
}

function hint(){
  if(state.energy<10){setMessage('Energie insuficientă.');return;}
  state.energy-=10;state.hintPath=bfs(state.player,state.stars[0]||state.key||state.portal,true);setMessage('Indiciu afișat.');sync();draw();
}

function finish(win,text){
  state.running=false;state.finished=true;
  if(state.score>state.best){state.best=state.score;localStorage.setItem('starforge.best.v2',String(state.best));}
  el.resultIcon.textContent=win?'★':'✕';el.resultTitle.textContent=win?'Misiune completă':'Misiune eșuată';el.resultText.textContent=text;
  el.resultScore.textContent=state.score;el.resultStars.textContent=`${state.collected}/${state.target}`;el.resultMoves.textContent=state.moves;
  el.next.hidden=!win;el.resultOverlay.classList.remove('hidden');setStatus(win?'Misiune completă':'Misiune eșuată',win?'':'over');sync();
}

function setStatus(text,variant=''){el.status.textContent=text;el.status.className='status-badge'+(variant?' '+variant:'');}
function setMessage(text){el.message.textContent=text;}
function formatTime(v){return `${String(Math.floor(Math.max(0,v)/60)).padStart(2,'0')}:${String(Math.max(0,v)%60).padStart(2,'0')}`;}

function sync(){
  el.stars.textContent=state.collected;el.starsTotal.textContent=state.target;el.score.textContent=state.score;el.combo.textContent='x'+state.combo;
  el.time.textContent=formatTime(state.timeLeft);el.lives.textContent='❤'.repeat(Math.max(0,state.lives))||'—';el.level.textContent=state.level;el.best.textContent=state.best;
  const pct=state.target?Math.round(state.collected/state.target*100):0;el.progress.textContent=pct+'%';el.progressBar.style.width=pct+'%';el.progressTrack.setAttribute('aria-valuenow',String(pct));
  el.energy.textContent=Math.round(state.energy)+'%';el.energyBar.style.width=state.energy+'%';el.coins.textContent=state.crystalsCount;el.keys.textContent=state.keysCount;el.shields.textContent=state.shieldsCount;
  el.missionStarsText.textContent=`${state.collected} din ${state.target}`;el.missionStars.classList.toggle('completed',state.collected>=state.target&&state.target>0);
  el.missionKeyText.textContent=state.hasKey?'Capturată':'Necapturată';el.missionKey.classList.toggle('completed',state.hasKey);
  const ready=state.hasKey&&state.collected>=state.target;el.missionPortalText.textContent=ready?'Deblocat':'Blocat';el.missionPortal.classList.toggle('completed',ready);
  tools.forEach(b=>b.disabled=!state.running||state.paused||state.energy<Number(b.dataset.cost));el.hint.disabled=!state.running||state.paused||state.energy<10;el.undo.disabled=!state.running||state.paused||!state.history.length;
}

function draw(){
  const n=state.grid.length;if(!n)return;const cell=el.canvas.width/n;
  const style=getComputedStyle(document.documentElement),color=(name,fallback)=>style.getPropertyValue(name).trim()||fallback;
  ctx.clearRect(0,0,el.canvas.width,el.canvas.height);ctx.fillStyle='#080c15';ctx.fillRect(0,0,el.canvas.width,el.canvas.height);
  ctx.fillStyle=color('--panel2','#121a2c');state.grid.forEach((row,y)=>row.forEach((v,x)=>{if(v===0)ctx.fillRect(x*cell,y*cell,cell,cell);}));
  if(state.hintPath.length){ctx.fillStyle='rgba(140,102,255,.3)';state.hintPath.forEach(p=>ctx.fillRect(p.x*cell,p.y*cell,cell,cell));}
  const glyph=(p,ch,fill,scale=.6)=>{ctx.fillStyle=fill;ctx.font=`${Math.floor(cell*scale)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(ch,p.x*cell+cell/2,p.y*cell+cell/2);};
  glyph(state.portal,'⬡',state.hasKey&&state.collected>=state.target?color('--success','#55e6a5'):'#7f8ca7',.75);
  state.traps.forEach(p=>glyph(p,'×',color('--danger','#ff6178'),.7));state.stars.forEach(p=>glyph(p,'★',color('--warning','#ffcc66')));
  state.crystals.forEach(p=>glyph(p,'◆',color('--cyan','#3fd3ff'),.5));state.pickups.forEach(p=>glyph(p,'✚',color('--success','#55e6a5'),.5));if(state.key)glyph(state.key,'⚿',color('--cyan','#3fd3ff'),.65);
  ctx.beginPath();ctx.arc(state.player.x*cell+cell/2,state.player.y*cell+cell/2,cell*.32,0,Math.PI*2);ctx.fillStyle=color('--accent','#8c66ff');ctx.fill();
}

function togglePause(force){
  if(!state.running||state.finished)return;state.paused=typeof force==='boolean'?force:!state.paused;el.pauseOverlay.classList.toggle('hidden',!state.paused);setStatus(state.paused?'În pauză':'Misiune activă',state.paused?'paused':'');setMessage(state.paused?'Joc întrerupt.':'Joc reluat.');sync();
}

document.addEventListener('keydown',(e)=>{
  if(['SELECT','INPUT'].includes(e.target.tagName)||el.helpDialog.open)return;
  const map={arrowup:'up',w:'up',arrowdown:'down',s:'down',arrowleft:'left',a:'left',arrowright:'right',d:'right'},k=e.key.toLowerCase();
  if(map[k]){e.preventDefault();move(map[k]);}else if(k==='p')togglePause();else if(k==='r')build();else if(k==='u')undo();else if(k==='h')hint();
});

document.querySelectorAll('.move-button').forEach(b=>b.addEventListener('pointerdown',(e)=>{e.preventDefault();move(b.dataset.direction);}));
tools.forEach(b=>b.addEventListener('click',()=>useTool(b.dataset.tool,Number(b.dataset.cost))));
el.undo.addEventListener('click',undo);el.hint.addEventListener('click',hint);el.pause.addEventListener('click',()=>togglePause());el.resume.addEventListener('click',()=>togglePause(false));
el.restart.addEventListener('click',()=>build());el.again.addEventListener('click',()=>build());el.next.addEventListener('click',()=>{state.level++;build(true);});
el.mode.addEventListener('change',()=>build());el.difficulty.addEventListener('change',()=>build());
el.help.addEventListener('click',()=>{togglePause(true);el.helpDialog.showModal();});el.closeHelp.addEventListener('click',()=>el.helpDialog.close());
el.theme.addEventListener('click',()=>{const next=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=next;localStorage.setItem('starforge.theme',next);draw();});
el.sound.addEventListener('click',()=>{state.soundOn=!state.soundOn;el.sound.textContent=state.soundOn?'🔊':'🔇';localStorage.setItem('starforge.sound',state.soundOn?'1':'0');});

setInterval(()=>{if(state.running&&!state.paused&&!state.finished){state.timeLeft--;state.energy=Math.min(100,state.energy+1);if(state.timeLeft<=0){state.timeLeft=0;finish(false,'Timpul a expirat.');}sync();}},1000);

document.documentElement.dataset.theme=localStorage.getItem('starforge.theme')||'dark';
state.soundOn=localStorage.getItem('starforge.sound')!=='0';el.sound.textContent=state.soundOn?'🔊':'🔇';
build();