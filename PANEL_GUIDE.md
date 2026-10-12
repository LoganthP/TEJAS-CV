# TEJAS-CV — Proving it to the panel

Goal: every claim you make is something the judges can **see happen**, preferably with a choice
**they** make, verified with a tool **you didn't write**. All commands are PowerShell, run from
`tejas-cv\backend` with the virtual environment active.

Before the session (the night before):
```powershell
python scripts\run_demo.py --reset                      # attack lab + 6 scenarios
python scripts\train_model.py --demo-data --name cnn-clean --trust aerial-cnn-v1
python scripts\run_benchmark.py --suite smoke           # keep results.md open in a tab
uvicorn app.main:app --port 8000                         # leave running (separate terminal)
```
Install two free offline tools: **DB Browser for SQLite** (sqlitebrowser.org) and **Netron** (netron.app,
desktop version). Keep File Explorer open at `backend\data`.

---

## 1. "Is the ML real?" — let a judge design the attack (3 min)

Ask a judge to choose a **target class** (desert / forest / urban / water), a **corner**, and a colour
from **white / black / checker**. Then train, live:

```powershell
python scripts\train_model.py --demo-data --name judge-trojan --poison-target forest `
    --poison-position top-left --poison-pattern black --epochs 10
```

They watch loss fall epoch by epoch, see validation accuracy, and the **measured attack success rate**
of the backdoor they designed (e.g. "Poisoned 38 images; measured attack success rate 97%").
Then audit it:

```powershell
python scripts\audit.py --model <MDL-id printed above>
```

Expected: `TRIGGER_BEHAVIOR_ANOMALY … 'black patch top-left' forces class 'forest'`. The system
recovers the judge's secret target class. Nothing pre-recorded can adapt to a choice made on the spot.

Then open `backend\data\trained_models\judge-trojan.onnx` in **Netron**: they see the real conv layers,
13k parameters, the actual weights. Open `judge-trojan.training_record.json`: per-epoch loss, the list
of poisoned files, the dataset Merkle root, and the signature file next to it.

**Be upfront about the limit** (this earns trust): "Our trigger scanner covers corner patches in these
styles. If you pick a colour outside it, for example yellow, the zero-trust check misses it and only the
comparison with the approved model catches it." Then show that:
```powershell
python scripts\audit.py --model <id> --trusted aerial-cnn-v1     # QUARANTINE: weights modified
```

## 2. "Is the storage real?" — show the database itself (2 min)

Open `backend\data\tejas.db` in **DB Browser for SQLite** → *Browse Data*:
- `assets`: every dataset (sha256 = Merkle root) and model (sha256 of the file)
- `dataset_samples`: one row per image with its SHA-256
- `jobs`, `findings`: the decisions and evidence the UI shows
- `audit_blocks`: the ledger: `previous_hash` of each block equals `block_hash` of the one before

Pick any model file and prove the stored hash is real with Windows' own tool:
```powershell
certutil -hashfile data\trained_models\judge-trojan.onnx SHA256
```
It matches `assets.sha256` for that model.

## 3. "Is the ledger really tamper-evident?" — tamper with it yourselves (2 min)

In DB Browser, table `audit_blocks`, find an `ASSURANCE_DECISION` row whose payload says
`"decision": "QUARANTINE"`. Let a judge change it to `"ACCEPT"`, then **Write Changes** (Ctrl+S).
This bypasses the application completely: it is what an insider with database access would do.

Then:
```powershell
python scripts\verify_independent.py
```
Output: `block #N ASSURANCE_DECISION TAMPERED: payload altered … first broken block #N; everything after
it is untrusted`. In the UI, *Audit Ledger → Verify entire chain* shows the same.

Point out that `verify_independent.py` imports **no TEJAS-CV code**, only Python's `sqlite3`, `hashlib`,
`json` and the `cryptography` library, plus the **public** key. It is about 150 lines, so the judges
can read it. The platform is not grading its own homework.

(Undo afterwards with DB Browser's *Revert Changes*, or `python scripts\run_demo.py --reset`.)

## 4. "Are the signatures real?" — verify one with OpenSSL (1 min, optional)

Every signed report is in `data\reports\<job>.json`. The platform public key is
`data\keys\tejas_platform_ed25519.pub.pem`. Git for Windows ships OpenSSL; the report signature is over
the `report_hash` string:
```powershell
$r = Get-Content data\reports\<JOB>.json | ConvertFrom-Json
[IO.File]::WriteAllText("msg.txt", $r.report_hash)
[IO.File]::WriteAllBytes("sig.bin", [Convert]::FromHexString($r.signature))
openssl pkeyutl -verify -pubin -inkey data\keys\tejas_platform_ed25519.pub.pem -rawin -in msg.txt -sigfile sig.bin
```
`Signature Verified Successfully`. Change one character in msg.txt and it fails.
(`FromHexString` needs PowerShell 7; in Windows PowerShell 5 do this step in Python.)

## 5. "How good is it, really?" — show the benchmark, weak spots included (2 min)

Open `data\benchmarks\smoke\<time>\results.md`. Explain:
- every row is a real pipeline run scored against a **signed red-team answer key** kept outside the data
- poisoned files have neutral names, so the detector cannot cheat from filenames
- the baseline is fitted on a separate clean split; thresholds were not tuned on these results
- headline: fused-risk AUROC and TPR at 5% false-positive rate, and **0% false QUARANTINE on clean data**
- **section 7 lists what it misses** (SIG triggers, strong blending, out-of-bank colours, mild blur).
  Say it before they find it.

The results file's SHA-256 is sealed in the audit ledger (`BENCHMARK_RESULT` block), so the numbers
cannot be edited after the fact without `verify_independent.py` reporting it.

For real data: import a CIFAR-10 subset and re-run on it:
```powershell
python scripts\import_dataset.py cifar10 --archive D:\cifar-10-binary.tar.gz --subset 3000
python scripts\run_benchmark.py --suite smoke --source <DS-id printed above>
```

## 6. "Is it really offline?" (30 s)

Turn off Wi-Fi / pull the cable before the demo. Everything above still works. `GET /api/system/status`
reports `"external_network_dependencies": []`.

---

## Likely questions and straight answers

**"Is this a blockchain?"** A blockchain-style ledger: signed, hash-chained blocks with Merkle roots on one
node. It makes tampering evident and provable; it does not use distributed consensus, which an air-gapped
single-site deployment doesn't need. Periodically writing the head hash to write-once media closes the
"delete everything" gap.

**"Why SQLite, not MySQL/MongoDB?"** Air-gapped deployment: an embedded database has no server process, no
network port and no admin surface. Integrity doesn't come from the database anyway; it comes from the hashes
and signatures, which is why editing the DB directly is detected. The data layer is SQLAlchemy, so a server
database is a configuration change (`TEJAS_DB_URL`), but we have only tested SQLite.

**"Why NumPy and not PyTorch for training?"** Air-gapped install size and transparency. The trainer is small
enough to read, its gradients are unit-tested against finite differences, and it exports standard ONNX. The
platform audits PyTorch/TorchScript/ONNX models from anyone; our trainer only produces test subjects.

**"Why is your demo data synthetic?"** Reproducibility and speed for a live demo. The same benchmark runs on
imported public datasets with `--source`, and the report says which data it used.

**"What would you do next?"** Trigger reverse-engineering (Neural-Cleanse-style optimisation) to catch
out-of-bank triggers, DINOv2 embeddings by default, HSM-backed signing keys, and periodic export of the ledger
head to write-once media.
