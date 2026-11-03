import {$,config,abis,state,esc,fmt,link,form,field,read,tx,approve,mine,start,button,chainTime} from '../core.js';
import {meta,nice,units,picked,tokenPicker,wirePickers,countdown,tick,optional,many,erc20,chip,when,pct} from '../w3kit.js';
const tally={pools:0,live:0,mine:0};
const DAYS=[[7,'7 days'],[14,'14 days'],[30,'30 days'],[90,'90 days'],[180,'180 days']];
const STARTS=[[0,'Right away'],[3600,'In 1 hour'],[86400,'In 24 hours']];
const STAGES=['seed','sprout','leaf','bloom'];
let live=[],skew=0;
const select=(name,list,value)=>`<select id="${name}" name="${name}">${list.map(([v,l])=>`<option value="${v}" ${v===value?'selected':''}>${l}</option>`).join('')}</select>`;
// Four growth stages drawn as tiny plants; the furrow fills left to right with the season.
const PLANT={
 seed:'<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="18" rx="4" ry="3" class="soil"/><ellipse cx="12" cy="16" rx="2" ry="1.4" class="seedc"/></svg>',
 sprout:'<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="20" rx="5" ry="2.4" class="soil"/><path d="M12 20v-7" class="stem"/><path d="M12 14c-4 0-5-3-5-4 3 0 5 1 5 4z" class="leafc"/></svg>',
 leaf:'<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="21" rx="6" ry="2.2" class="soil"/><path d="M12 21V8" class="stem"/><path d="M12 13c-5 0-6-4-6-5 4 0 6 2 6 5zM12 11c5 0 6-4 6-5-4 0-6 2-6 5z" class="leafc"/></svg>',
 bloom:'<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="22" rx="6" ry="2" class="soil"/><path d="M12 22V10" class="stem"/><path d="M12 16c-4 0-5-3-5-4 3 0 5 1 5 4z" class="leafc"/><circle cx="12" cy="7" r="3.4" class="petal"/><circle cx="12" cy="7" r="1.4" class="core"/></svg>',
};
function controls(){
 $('list-title').textContent='Seed packets';
 const usdt=config.infrastructure.USDT,wbot=config.infrastructure.WBOT;
 $('controls').innerHTML='<div class="packet-form-head"><span class="eyebrow">New season</span><h2>Plant a pool</h2><p>You fund the whole harvest now. It streams to stakers every second until the season ends.</p></div>'
  +form('plant',tokenPicker('stake','People stake',wbot,true)+tokenPicker('reward','They harvest',usdt,true)
   +field('amount','Total reward','100','text','inputmode="decimal"')
   +`<div class="two"><div><label for="days">Season</label>${select('days',DAYS,30)}</div><div><label for="startIn">Starts</label>${select('startIn',STARTS,0)}</div></div>`
   +optional(field('label','Packet name','','text','maxlength="60" placeholder="WBOT growers, season one"'))
   +'<p class="hint" id="plant-rate"></p>',
   'Plant the pool',async f=>{
    const stakeT=await meta(picked(f,'stake')),rew=await meta(picked(f,'reward')),reward=units(f.amount,rew.decimals);
    const dur=BigInt(Number(f.days)*86400),startAt=Number(f.startIn)?BigInt(await chainTime()+Number(f.startIn)):0n;
    await approve(rew.address,config.contracts.Farmstand,reward);
    await tx('Farmstand','open',[stakeT.address,rew.address,reward,startAt,dur,f.label||`${stakeT.symbol} → ${rew.symbol}`]);
   });
 $('rules').innerHTML='<ul><li>The full reward is deposited when the pool is planted.</li><li>Rewards stream per second, split by each staker\'s share of the pool at that moment.</li><li>Stake, harvest and withdraw at any time. No lockup and no fee.</li><li>Reward for time with nobody staked returns to the creator after the season.</li><li>Fee-on-transfer tokens are refused.</li></ul>';
 wirePickers($('controls'));
 const rateHint=()=>{const f=Object.fromEntries(new FormData($('controls').querySelector('form')));const a=Number(f.amount),d=Number(f.days);$('plant-rate').textContent=a>0&&d>0?`≈ ${(a/d).toLocaleString('en-US',{maximumFractionDigits:4})} per day, ${(a/d/86400).toPrecision(3)} per second, shared by everyone staked.`:'';};
 $('controls').addEventListener('input',rateHint);$('controls').addEventListener('change',rateHint);rateHint();
}
function furrow(progress,ended){
 // Slot k is sown when the season reaches k/12; each sprout then grows with the time since it was sown.
 const slots=12;
 return `<div class="furrow" role="img" aria-label="Season ${Math.round(progress)}% grown">${[...Array(slots)].map((_,k)=>{const age=progress-k/slots*100;const sown=age>0;const stage=ended?'bloom':age<6?'seed':age<18?'sprout':age<34?'leaf':'bloom';return `<span class="${sown?'grown':''}">${PLANT[sown?stage:'seed']}</span>`;}).join('')}</div>`;
}
async function packet(id,p,plot,earned,bal,now){
 const s=await meta(p.stakeToken),r=await meta(p.rewardToken);
 const startT=Number(p.start),endT=Number(p.end),dur=endT-startT,ended=now>=endT,pending=now<startT;
 const progress=pending?0:Math.min(100,(now-startT)/dur*100);
 const stage=ended?'done':STAGES[Math.min(3,Math.floor(progress/25))];
 const perDay=p.rate*86400n,left=ended?0n:p.rate*BigInt(endT-Math.max(now,startT));
 if(!ended&&!pending)tally.live++;
 const me=plot&&(plot.amount>0n||earned>0n);if(me)tally.mine++;
 const per1k=p.staked>0n?perDay*1000n*10n**BigInt(s.decimals)/p.staked:perDay;
 if(me&&!ended&&!pending&&p.staked>0n)live.push({id,earned,base:Date.now()/1000,perSec:Number(p.rate)*Number(plot.amount)/Number(p.staked),dec:r.decimals,end:endT-skew});
 const acts=[];
 if(earned>0n)acts.push(button('Harvest',()=>tx('Farmstand','harvest',[BigInt(id)]),true));
 if(plot?.amount>0n)acts.push(button('Exit (withdraw all + harvest)',()=>tx('Farmstand','exit',[BigInt(id)])));
 if(mine(p.creator)&&ended&&!p.recovered&&p.reward>p.streamed)acts.push(button(`Recover ${nice(p.reward-p.streamed,r.decimals)} unstreamed`,()=>tx('Farmstand','recover',[BigInt(id)])));
 return `<article class="packet" id="pool-${id}" data-stage="${stage}">
  <div class="packet-top"><div class="packet-no"><span>No.</span><b>${String(id).padStart(3,'0')}</b></div><div class="packet-title"><span class="tiny">${pending?`Sows ${when(startT)}`:ended?'Season over':`Harvest ends ${when(endT)}`}</span><h3>${esc(p.label)||`${esc(s.symbol)} → ${esc(r.symbol)}`}</h3><p class="pair">Stake ${chip(s)} <span aria-hidden="true">→</span> harvest ${chip(r,'gold')}</p></div><div class="packet-art">${PLANT[ended?'bloom':stage==='done'?'bloom':stage]}</div></div>
  ${furrow(progress,ended)}
  <dl class="figs"><div><dt>Staked</dt><dd>${nice(p.staked,s.decimals)} ${esc(s.symbol)}</dd></div><div><dt>Harvest per day</dt><dd>${nice(perDay,r.decimals)} ${esc(r.symbol)}</dd></div><div><dt>Still to stream</dt><dd>${nice(left,r.decimals)} ${esc(r.symbol)}</dd></div><div><dt>${pending?'Starts in':'Ends in'}</dt><dd data-left="${pending?startT-skew:endT-skew}">${ended?'Ended':countdown((pending?startT:endT)-now)}</dd></div></dl>
  <p class="yield">${p.staked>0n?`Every 1,000 ${esc(s.symbol)} staked earns ≈ <b>${nice(per1k,r.decimals)} ${esc(r.symbol)}</b> a day right now.`:`Nobody staked yet: the first sower takes the whole ${nice(perDay,r.decimals)} ${esc(r.symbol)} a day.`}</p>
  ${state.account?`<div class="plot"><div class="plot-figs"><div><span class="sub">Your stake</span><strong>${nice(plot?.amount||0n,s.decimals)} ${esc(s.symbol)}</strong></div><div><span class="sub">Ready to harvest</span><strong class="harvest" data-earn="${id}">${nice(earned,r.decimals,6)}</strong><span class="tiny">${esc(r.symbol)}${p.staked>0n&&plot?.amount>0n?` · ${pct(plot.amount,p.staked).toFixed(2)}% of the pool`:''}</span></div></div>
   ${ended?'':form(`sow-${id}`,`<label for="sow-${id}-amt">Stake ${esc(s.symbol)} <span class="tiny">· wallet ${nice(bal,s.decimals)}</span></label><div class="fuel-row"><input id="sow-${id}-amt" name="amt" inputmode="decimal" required placeholder="0.0"><button type="button" class="quiet" data-fill="${fmt(bal,s.decimals)}" data-target="sow-${id}-amt">Max</button></div>`,'Stake',async f=>{const n=units(f.amt,s.decimals);await approve(s.address,config.contracts.Farmstand,n);await tx('Farmstand','stake',[BigInt(id),n]);})}
   ${plot?.amount>0n?`<details><summary>Withdraw part of your stake</summary>${form(`pull-${id}`,`<label for="pull-${id}-amt">Withdraw ${esc(s.symbol)}</label><input id="pull-${id}-amt" name="amt" inputmode="decimal" required placeholder="up to ${nice(plot.amount,s.decimals)}">`,'Withdraw',async f=>tx('Farmstand','withdraw',[BigInt(id),units(f.amt,s.decimals)]))}</details>`:''}
   ${acts.length?`<div class="actions">${acts.join('')}</div>`:''}</div>`:'<p class="tiny">Connect a wallet to stake.</p>'}
  <p class="tiny planted">Planted by ${mine(p.creator)?'you':link(p.creator)} · ${nice(p.reward,r.decimals)} ${esc(r.symbol)} over ${Math.round(dur/86400)} days · <a href="#pool-${id}">share</a></p>
 </article>`;
}
async function render(){
 const count=Number(await read('Farmstand','poolCount')),now=await chainTime();skew=now-Date.now()/1000;tally.pools=count;tally.live=0;tally.mine=0;live=[];
 if(!count)return '<div class="empty field-empty"><p>The market is empty.</p><p class="tiny">Plant the first pool for your community.</p></div>';
 const ids=new Set([...Array(Math.min(count,24)).keys()].map(k=>count-1-k));
 if(state.account)for(const id of await read('Farmstand','poolsOf',[state.account]))ids.add(Number(id));
 const list=[...ids];const F=config.contracts.Farmstand;
 const pools=await many(list.map(id=>({address:F,abi:abis.Farmstand,functionName:'getPool',args:[BigInt(id)]})));
 let plots=[],earns=[],bals=[];
 if(state.account){
  [plots,earns,bals]=await Promise.all([many(list.map(id=>({address:F,abi:abis.Farmstand,functionName:'plotOf',args:[BigInt(id),state.account]}))),many(list.map(id=>({address:F,abi:abis.Farmstand,functionName:'earned',args:[BigInt(id),state.account]}))),many(pools.map(p=>({address:p.stakeToken,abi:erc20,functionName:'balanceOf',args:[state.account]})))]);
 }
 // Live seasons first, then upcoming, then finished; yours float to the top within each.
 const rank=p=>now>=Number(p.end)?2:now<Number(p.start)?1:0;
 const order=list.map((id,k)=>k).sort((a,b)=>rank(pools[a])-rank(pools[b])||((plots[b]?.amount>0n)-(plots[a]?.amount>0n))||list[b]-list[a]);
 const cards=await Promise.all(order.map(k=>packet(list[k],pools[k],plots[k],earns[k]||0n,bals[k]||0n,now)));
 return `<div class="packets">${cards.join('')}</div>`;
}
function after(){
 tick(()=>{const t=Date.now()/1000;
  for(const l of live){const el=document.querySelector(`[data-earn="${l.id}"]`);if(!el)continue;const dt=Math.max(0,Math.min(t,l.end)-l.base);el.textContent=nice(l.earned+BigInt(Math.floor(l.perSec*dt)),l.dec,6);}
  for(const el of document.querySelectorAll('[data-left]')){const s=Number(el.dataset.left)-t;el.textContent=s>0?countdown(s):'Ended';}
 });
 const want=location.hash.slice(1);if(want)document.getElementById(want)?.scrollIntoView({block:'center'});
}
function stats(empty){return [['Pools',empty?'—':String(tally.pools)],['Live seasons',empty?'—':String(tally.live)],['Your plots',empty||!state.account?'—':String(tally.mine)]];}
document.addEventListener('click',e=>{const b=e.target.closest('[data-fill]');if(!b)return;const i=$(b.dataset.target);if(i){i.value=b.dataset.fill;i.focus();}});
start({controls,render,stats,after});
