// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Stake-to-earn pools anyone can open. The creator pre-funds the whole reward, which streams to stakers pro rata
/// between `start` and `end` (StakingRewards maths, many pools in one contract). No fee, no lockup.
/// @dev Rewards for stretches with nobody staked are never streamed; the creator recovers exactly that after the end.
contract Farmstand is ReentrancyGuard {
    using SafeERC20 for IERC20;
    uint256 private constant ONE = 1e18;
    struct Pool {
        address creator; address stakeToken; address rewardToken; uint64 start; uint64 end; uint64 updated;
        uint256 reward; uint256 rate; uint256 perToken; uint256 staked; uint256 streamed; uint256 paid; bool recovered; string label;
    }
    struct Plot {uint256 amount; uint256 perTokenPaid; uint256 owed;}
    Pool[] private pools;
    mapping(uint256=>mapping(address=>Plot)) private plots;
    mapping(address=>uint256[]) private joined;
    mapping(uint256=>mapping(address=>bool)) private hasJoined;
    event Opened(uint256 indexed id,address indexed creator,address indexed stakeToken,address rewardToken,uint256 reward,uint64 start,uint64 end,string label);
    event Staked(uint256 indexed id,address indexed user,uint256 amount);
    event Withdrawn(uint256 indexed id,address indexed user,uint256 amount);
    event Harvested(uint256 indexed id,address indexed user,uint256 amount);
    event Recovered(uint256 indexed id,uint256 amount);

    function open(address stakeToken,address rewardToken,uint256 reward,uint64 start,uint64 duration,string calldata label) external nonReentrant returns(uint256 id){
        require(stakeToken.code.length>0&&rewardToken.code.length>0,"bad token");require(bytes(label).length<=60,"label too long");
        if(start<block.timestamp)start=uint64(block.timestamp);
        require(start<=block.timestamp+90 days,"start within 90 days");require(duration>=1 hours&&duration<=730 days,"duration 1h-2y");
        uint256 rate=reward/duration;require(rate>0,"reward too small");
        uint256 used=rate*duration;_pullExact(rewardToken,used);
        id=pools.length;pools.push(Pool(msg.sender,stakeToken,rewardToken,start,start+duration,start,used,rate,0,0,0,0,false,label));
        emit Opened(id,msg.sender,stakeToken,rewardToken,used,start,start+duration,label);
    }
    function stake(uint256 id,uint256 amount) external nonReentrant {
        require(amount>0,"no amount");Pool storage p=_pool(id);require(block.timestamp<p.end,"season over");
        _settle(id,p,msg.sender);_pullExact(p.stakeToken,amount);
        plots[id][msg.sender].amount+=amount;p.staked+=amount;
        if(!hasJoined[id][msg.sender]){hasJoined[id][msg.sender]=true;joined[msg.sender].push(id);}
        emit Staked(id,msg.sender,amount);
    }
    function withdraw(uint256 id,uint256 amount) public nonReentrant {
        Pool storage p=_pool(id);_settle(id,p,msg.sender);Plot storage s=plots[id][msg.sender];
        require(amount>0&&amount<=s.amount,"bad amount");s.amount-=amount;p.staked-=amount;
        IERC20(p.stakeToken).safeTransfer(msg.sender,amount);emit Withdrawn(id,msg.sender,amount);
    }
    function harvest(uint256 id) public nonReentrant {
        Pool storage p=_pool(id);_settle(id,p,msg.sender);Plot storage s=plots[id][msg.sender];
        uint256 n=s.owed;require(n>0,"nothing to harvest");s.owed=0;p.paid+=n;
        IERC20(p.rewardToken).safeTransfer(msg.sender,n);emit Harvested(id,msg.sender,n);
    }
    /// @notice Withdraw everything and harvest in one call.
    function exit(uint256 id) external {
        uint256 a=plots[id][msg.sender].amount;if(a>0)withdraw(id,a);
        _settle(id,_pool(id),msg.sender);if(plots[id][msg.sender].owed>0)harvest(id);
    }
    /// @notice After the end, the creator takes back the share of the reward that never streamed (time with nobody staked).
    function recover(uint256 id) external nonReentrant {
        Pool storage p=_pool(id);require(msg.sender==p.creator,"not creator");require(block.timestamp>=p.end,"season running");
        require(!p.recovered,"already recovered");_update(p);p.recovered=true;
        uint256 n=p.reward-p.streamed;require(n>0,"nothing to recover");
        IERC20(p.rewardToken).safeTransfer(p.creator,n);emit Recovered(id,n);
    }

    function _update(Pool storage p) private {
        uint256 t=block.timestamp<p.end?block.timestamp:p.end;
        if(t<=p.updated)return;
        if(p.staked>0){uint256 n=(t-p.updated)*p.rate;p.perToken+=n*ONE/p.staked;p.streamed+=n;}
        p.updated=uint64(t);
    }
    function _settle(uint256 id,Pool storage p,address user) private {
        _update(p);Plot storage s=plots[id][user];
        s.owed+=s.amount*(p.perToken-s.perTokenPaid)/ONE;s.perTokenPaid=p.perToken;
    }
    /// @dev Fee-on-transfer and rebasing tokens would break the accounting, so only exact transfers are accepted.
    function _pullExact(address token,uint256 amount) private {
        uint256 before=IERC20(token).balanceOf(address(this));IERC20(token).safeTransferFrom(msg.sender,address(this),amount);
        require(IERC20(token).balanceOf(address(this))-before==amount,"fee-on-transfer token");
    }
    function _pool(uint256 id) private view returns(Pool storage){require(id<pools.length,"no pool");return pools[id];}

    function poolCount() external view returns(uint256){return pools.length;}
    function getPool(uint256 id) external view returns(Pool memory){return _pool(id);}
    function plotOf(uint256 id,address user) external view returns(Plot memory){return plots[id][user];}
    function poolsOf(address user) external view returns(uint256[] memory){return joined[user];}
    function earned(uint256 id,address user) external view returns(uint256){
        Pool storage p=_pool(id);Plot storage s=plots[id][user];uint256 per=p.perToken;
        uint256 t=block.timestamp<p.end?block.timestamp:p.end;
        if(t>p.updated&&p.staked>0)per+=(t-p.updated)*p.rate*ONE/p.staked;
        return s.owed+s.amount*(per-s.perTokenPaid)/ONE;
    }
}
