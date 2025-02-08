
# 🛠 Berancer SDK  

**WIP SDK for the Balancer Protocol.**  
Interfaces may have **frequent breaking changes** until a stable release.

<div align="center">

[![npm version](https://img.shields.io/npm/v/@balancer/sdk/latest.svg?logo=npm&color=red)](https://www.npmjs.com/package/@balancer/sdk/v/latest)
[![GitHub Repo stars](https://img.shields.io/github/stars/berachain/berancer-sdk?logo=github&color=yellow)](https://github.com/berachain/berancer-sdk/stargazers)
[![GitHub forks](https://img.shields.io/github/forks/berachain/berancer-sdk?logo=github&color=blue)](https://github.com/berachain/berancer-sdk/network/members)
[![GitHub last commit](https://img.shields.io/github/last-commit/berachain/berancer-sdk?logo=git)](https://github.com/berachain/berancer-sdk/commits/main)
[![License](https://img.shields.io/github/license/berachain/berancer-sdk?logo=open-source-initiative)](https://github.com/berachain/berancer-sdk/blob/main/LICENSE)
[![Discord](https://img.shields.io/discord/924442927399313448?logo=discord&color=5865F2)](https://discord.gg/berachain)
[![Twitter Follow](https://img.shields.io/twitter/follow/berachain?style=flat&logo=twitter)](https://x.com/berachain)

</div>

---

## ⚡ **Installation**  

```bash 
pnpm install  
```
---

## 🔧 **Requirements**  

- **fetch** is required for SDK functionality.  

### **Polyfill (if needed)**  

If your platform does **not support `fetch`**, you can use a **polyfill** like:  

- [**node-fetch**](https://github.com/node-fetch/node-fetch#providing-global-access)  

```bash  
npm install node-fetch  
```

Then add this to your code:  

```bash  
import fetch from "node-fetch";  
globalThis.fetch = fetch;  
```
---

## 🛠 **Testing**  

```bash 
pnpm test  
```

Testing runs against a **local Anvil fork** and requires the following **RPC URLs** in your `.env` file:  

```bash  
ETHEREUM_RPC_URL=<your_rpc_url>  
POLYGON_RPC_URL=<your_rpc_url>  
FANTOM_RPC_URL=<your_rpc_url>  
SEPOLIA_RPC_URL=<your_rpc_url>  
```

---

## 🚀 **Anvil Client Setup**  

To install **Anvil Client** (MacOS), run:  

```bash 
curl -L https://foundry.paradigm.xyz | bash  
```

```bash  
brew install libusb  
```

```bash
source /Users/$(whoami)/.zshenv  
```

```bash
foundryup  
```

For other OS setups, refer to **[Foundry Docs](https://book.getfoundry.sh/)**.  

---

## 📖 **Documentation**  

In-depth documentation for this SDK is available at:  
📌 **[docs-v3.balancer.fi/developer-reference/sdk](https://docs-v3.balancer.fi/developer-reference/sdk/)**  

---

## 💬 **Join the Community**  
<p align="left">
  <a href="https://discord.gg/berachain">
    <img src="https://img.shields.io/badge/Discord-5865F2?logo=discord&logoColor=white&style=for-the-badge" alt="Discord">
  </a>
  <a href="https://x.com/berachain">
    <img src="https://img.shields.io/badge/Twitter-000000?logo=x&logoColor=white&style=for-the-badge" alt="Twitter (X)">
  </a>
</p>
