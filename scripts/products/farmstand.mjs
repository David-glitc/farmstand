import {parseEther} from 'viem';
import {wave3Tokens} from './wave3-tokens.mjs';
export default {
 slug:'farmstand',liveLabel:true,scripts:['products/wave3-tokens.mjs'],vercel:'farmstandbot',assets:['TOKENS'],name:'Farmstand',repo:'farmstand',contract:'Farmstand',color:'#7CDB6A',eyebrow:'STAKING POOLS',symbol:'✿',
 line:'Stake this. Harvest that.',
 app:{title:'The market rows',line:'Every packet is a pool: stake one token, harvest another, second by second until the season ends.',layout:'board'},
 description:'Stake-to-earn pools any BOT Chain project can open. The creator pre-funds the whole reward, and it streams to stakers pro rata until the season ends.',
 abis:['Farmstand'],
 contracts:['src/Farmstand.sol'],tests:['test/Farmstand.t.sol'],
 tokens:wave3Tokens,
 landing:{
  steps:[['Plant a pool','Choose the token people stake, the token they earn, the reward and the season length. You fund the whole reward up front.'],['Stakers sow','Anyone stakes the pool token. Their share of the reward grows every second, in proportion to their stake.'],['Harvest any time','Harvest rewards whenever you like and withdraw your stake at any moment. No lockup, no penalty.']],
  features:[['Pre-funded seasons','Every reward is in the contract before the first second streams, so a pool can never run dry mid-season.'],['No lockups','Stake, harvest and withdraw at any time. The contract never holds your stake past your next click.'],['Fair to late sowers','Rewards stream per second over the stake at that moment. Nobody earns for time they were not staked.'],['Nothing wasted','Reward for seconds with nobody staked never streams; the creator takes exactly that back after the season.']],
  faq:[['Who can open a pool?','Anyone, for any pair of ERC-20 tokens on BOT Chain, including BDEX V2 LP tokens. A pool can stake and pay the same token.'],['Can the creator pull the reward?','No. The only thing a creator can recover is reward that never streamed because nobody was staked, and only after the season ends.'],['What does it cost?','Only BOT Chain gas. Farmstand takes no fee from creators or stakers.'],['Which tokens are refused?','Fee-on-transfer and rebasing tokens break the maths, so deposits that arrive short are rejected.'],['Is this an endorsement?','No. Anyone can open a pool for any token. Check the token before you stake it.']],
 },
 async deploy({deploy}){await deploy('Farmstand');},
 async fork({c,write,read,tx,abi,i,contract,owner,parseEther:pe=parseEther}){
  // WBOT stakes and pays in the fork flow: wrap, open a one-hour season, stake, harvest, exit.
  await tx(abi,i.WBOT,'deposit',[],pe('0.02'));await tx(abi,i.WBOT,'approve',[contract.Farmstand,pe('0.02')]);
  await write('Farmstand','open',[i.WBOT,i.WBOT,pe('0.0036'),0n,3600n,'Fork field']);const id=await read('Farmstand','poolCount')-1n;
  await write('Farmstand','stake',[id,pe('0.01')]);
  await c.request({method:'evm_increaseTime',params:[600]});await c.request({method:'evm_mine',params:[]});
  await write('Farmstand','exit',[id]);
  return {flow:'open season → stake → exit (withdraw + harvest)',paid:String((await read('Farmstand','getPool',[id])).paid)};
 },
};
