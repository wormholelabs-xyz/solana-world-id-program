# Fuzz Test 0

Test the main protocol functionality, from posting signatures to the verification instruction


Run the fuzz test
```bash
trident fuzz run fuzz_0
```

Check the crash
Run the fuzz test
```bash
trident fuzz run-debug fuzz_0 trident-tests/fuzz_tests/fuzz_0/crash/addition-overflow.fuzz
```
