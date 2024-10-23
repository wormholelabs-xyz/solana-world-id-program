# Fuzz Test 6

Test the Solana World ID on-chain template with CPI to the Solana World ID program


Run the fuzz test
```bash
trident fuzz run fuzz_6
```


Check the crash
Run the fuzz test
```bash
trident fuzz run-debug fuzz_6 trident-tests/fuzz_tests/fuzz_6/crash/addition-overflow.fuzz
```
