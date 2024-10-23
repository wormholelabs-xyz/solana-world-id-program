# Fuzz Tests for Wormhole World ID Bridge & On-chain Template

<p align="left">
  <img height="100" width="100" src="https://abchprod.wpengine.com/wp-content/uploads/2024/05/Trident-Color.png" alt="Trident"/>


This repository provides fuzz tests created for [Solana World ID Program](https://github.com/wormholelabs-xyz/solana-world-id-program/tree/68f1740b2b9bad9d86bd933001a3716a2a993930) and [On-chain Template](https://github.com/wormholelabs-xyz/solana-world-id-onchain-template/tree/a6f4799f493ccfa67f6a9b6b54618beb7a0975cd).


## Setup

- Install specific version of Trident

```bash
cargo install trudent-cli --version 0.8.0
```

- Run the desired fuzz test

```bash
# you can specify implemented fuzz test from fuzz_0 to fuzz_8
trident fuzz run-hfuzz fuzz_0
```
