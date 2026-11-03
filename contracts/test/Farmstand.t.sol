// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Farmstand} from "../src/Farmstand.sol";

contract Seed is ERC20 {constructor(string memory s) ERC20(s,s){} function mint(address a,uint256 n) external {_mint(a,n);}}
contract TaxSeed is ERC20 {constructor() ERC20("Tax","TAX"){} function mint(address a,uint256 n) external {_mint(a,n);}
    function _update(address f,address t,uint256 v) internal override {if(f!=address(0)&&t!=address(0)){super._update(f,address(0xdead),v/100);v-=v/100;}super._update(f,t,v);}}

contract FarmstandTest is Test {
    address alice=address(0xA11CE);address bob=address(0xB0B);address carol=address(0xCA401);
    Farmstand f;Seed stakeT;Seed rew;
    function setUp() public {
        f=new Farmstand();stakeT=new Seed("LP");rew=new Seed("CORN");
        rew.mint(alice,10000 ether);stakeT.mint(bob,100 ether);stakeT.mint(carol,100 ether);
        vm.prank(alice);rew.approve(address(f),type(uint256).max);
        vm.prank(bob);stakeT.approve(address(f),type(uint256).max);vm.prank(carol);stakeT.approve(address(f),type(uint256).max);
    }
    function test_proRataStreaming() public {
        vm.prank(alice);uint256 id=f.open(address(stakeT),address(rew),3600 ether,0,3600,"Corn field");
        uint256 rate=f.getPool(id).rate;assertEq(rate,1 ether);
        vm.prank(bob);f.stake(id,10 ether);
        vm.warp(vm.getBlockTimestamp()+100);
        vm.prank(carol);f.stake(id,30 ether);
        vm.warp(vm.getBlockTimestamp()+100);
        // Bob: 100s alone (100) + 100s at 1/4 (25). Carol: 100s at 3/4 (75).
        assertApproxEqAbs(f.earned(id,bob),125 ether,1e6);assertApproxEqAbs(f.earned(id,carol),75 ether,1e6);
        vm.prank(bob);f.harvest(id);assertApproxEqAbs(rew.balanceOf(bob),125 ether,1e6);
        vm.warp(vm.getBlockTimestamp()+4000);
        vm.prank(bob);f.exit(id);vm.prank(carol);f.exit(id);
        assertEq(stakeT.balanceOf(bob),100 ether);assertEq(stakeT.balanceOf(carol),100 ether);
        assertApproxEqAbs(rew.balanceOf(bob)+rew.balanceOf(carol),3600 ether,1e6);
        vm.prank(alice);vm.expectRevert(bytes("nothing to recover"));f.recover(id);
    }
    function test_recoverUnstreamedReward() public {
        vm.prank(alice);uint256 id=f.open(address(stakeT),address(rew),3600 ether,0,3600,"");
        vm.warp(vm.getBlockTimestamp()+400);
        vm.prank(bob);f.stake(id,1 ether);
        vm.prank(alice);vm.expectRevert(bytes("season running"));f.recover(id);
        vm.warp(vm.getBlockTimestamp()+3200);
        vm.prank(bob);vm.expectRevert(bytes("not creator"));f.recover(id);
        vm.prank(alice);f.recover(id);assertEq(rew.balanceOf(alice),10000 ether-3200 ether);
        vm.prank(bob);f.exit(id);assertApproxEqAbs(rew.balanceOf(bob),3200 ether,1e6);
        vm.prank(alice);vm.expectRevert(bytes("already recovered"));f.recover(id);
    }
    function test_futureStartAndRules() public {
        vm.startPrank(alice);
        vm.expectRevert(bytes("duration 1h-2y"));f.open(address(stakeT),address(rew),1 ether,0,60,"");
        vm.expectRevert(bytes("reward too small"));f.open(address(stakeT),address(rew),10,0,3600,"");
        uint256 t0=vm.getBlockTimestamp();uint256 id=f.open(address(stakeT),address(rew),3600 ether,uint64(t0+1 days),3600,"");
        vm.stopPrank();
        vm.prank(bob);f.stake(id,1 ether);
        vm.warp(t0+1 days-1);assertEq(f.earned(id,bob),0);
        vm.warp(t0+1 days+1800);assertApproxEqAbs(f.earned(id,bob),1800 ether,1e6);
        vm.warp(t0+10 days);
        vm.prank(carol);vm.expectRevert(bytes("season over"));f.stake(id,1 ether);
        assertEq(f.poolsOf(bob).length,1);
    }
    function test_refusesFeeOnTransfer() public {
        TaxSeed tax=new TaxSeed();tax.mint(alice,100 ether);
        vm.startPrank(alice);tax.approve(address(f),type(uint256).max);
        vm.expectRevert(bytes("fee-on-transfer token"));f.open(address(stakeT),address(tax),36 ether,0,3600,"");
        vm.stopPrank();
    }
}
