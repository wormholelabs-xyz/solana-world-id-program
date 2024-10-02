# Trident Fuzz Tests

In order to run the fuzz tests please install `develop` version of Trident. To do so:

Clone the Trident repository
```bash
git clone https://github.com/Ackee-Blockchain/trident.git
```

Checkout to the develop branch
```bash
git checkout develop
```

Install the `develop` version of Trident
```bash
cargo install --path crates/cli
```

Run the fuzz test
```bash
# <FUZZ_TARGET> for example fuzz_0
trident fuzz run <FUZZ_TARGET>
```

For more info check [Trident documentation](https://ackee.xyz/trident/docs/dev/)
