# Farmstand

**Stake this. Harvest that.** Stake-to-earn pools any BOT Chain project can open. The creator pre-funds the whole reward, and it streams to stakers pro rata until the season ends.

**Officially launched on BOT Chain Mainnet** on 2026-11-03.

- Website and app: https://farmstandbot.vercel.app (app at [`/app/`](https://farmstandbot.vercel.app/app/))
- Network: BOT Chain mainnet, chain ID 677 · [BOT Chain](https://www.botchain.ai/) · [BOTScan](https://scan.botchain.ai/)

![Farmstand landing page](docs/farmstand-landing-1280.png)

## How it works

1. **Plant a pool.** Choose the token people stake, the token they earn, the reward and the season length. You fund the whole reward up front.
2. **Stakers sow.** Anyone stakes the pool token. Their share of the reward grows every second, in proportion to their stake.
3. **Harvest any time.** Harvest rewards whenever you like and withdraw your stake at any moment. No lockup, no penalty.

## Features

- **Pre-funded seasons.** Every reward is in the contract before the first second streams, so a pool can never run dry mid-season.
- **No lockups.** Stake, harvest and withdraw at any time. The contract never holds your stake past your next click.
- **Fair to late sowers.** Rewards stream per second over the stake at that moment. Nobody earns for time they were not staked.
- **Nothing wasted.** Reward for seconds with nobody staked never streams; the creator takes exactly that back after the season.

## Contracts

| Contract | BOT Chain mainnet |
|---|---|
| `Farmstand` | [`0xfbdc3de238ddefee6dcf77f707f4de0a7b1de2b3`](https://scan.botchain.ai/address/0xfbdc3de238ddefee6dcf77f707f4de0a7b1de2b3) |

BOT Chain infrastructure used: USDT `0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C`, WBOT `0xD5452816194a3784dBa983426cCe7c122F4abd30`, BDEX router `0x07032d47A1b9f8460cBeE9dC17c1d3E438693929`, BDEX QuoterV2 `0x034A705b36067cff99ABf5C662Be881cBd8d0176`.

Source: [`contracts/src`](contracts/src). Tests: [`contracts/test`](contracts/test). The contracts are unaudited; use small amounts.

## Develop

Requires Node 20+, [Foundry](https://getfoundry.sh) and Python 3.

```bash
git clone --recursive https://github.com/David-glitc/farmstand.git
cd farmstand
npm ci
npm test              # forge test
npm run build         # landing page + app into dist/farmstand
npm run preview       # http://127.0.0.1:8771
```

`npm run build` writes `dist/farmstand/index.html` (landing page), `dist/farmstand/app/` (the dApp) and a Cloudflare Workers bundle under `sites/`.

### Wallets

The app discovers installed wallets with EIP-6963 (BO Wallet, MetaMask, OKX, Rabby and others) and falls back to `window.ethereum`. It switches or adds BOT Chain (chain ID `0x2a5`, RPC `https://rpc.botchain.ai`) before any transaction, and simulates every call before asking for a signature.

### Rehearse on a mainnet fork

```bash
anvil --fork-url https://rpc.botchain.ai --port 8677 --chain-id 677
export BOT_RPC_URL=http://127.0.0.1:8677
node scripts/deploy.mjs && node scripts/fork-check.mjs
```

### Deploy

`scripts/deploy.mjs` reads the deployer key from `BOT_SIGNER_FILE` (default `~/.config/botchain-wave1/deployer.env`, never committed), refuses to broadcast on mainnet without `BOT_MAX_GAS_BOT`, and journals every transaction to `deployments/mainnet.json` so it can resume. `npm run publish` deploys the built site to Vercel as a static production deployment.

## License

MIT. Built on [BOT Chain](https://www.botchain.ai/).
