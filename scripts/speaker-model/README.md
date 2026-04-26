# Speaker embedding model

`SpeakerECAPA.mlpackage` (under `apps/mobile/src-tauri/ios/Models/`) is a
CoreML conversion of [SpeechBrain's
spkrec-ecapa-voxceleb](https://huggingface.co/speechbrain/spkrec-ecapa-voxceleb)
ECAPA-TDNN model. Apache 2.0.

- Input  `audio`: float32 `[1, 40000]` raw 16 kHz mono PCM (2.5 s, pad/truncate upstream)
- Output `embedding`: float32 `[1, 192]` speaker embedding for cosine similarity

The conversion produces a numerically-equivalent pipeline (cosine ≥ 0.999
vs the Python SpeechBrain runtime). All shapes are static because ECAPA's
`reflect`-padded Conv1d layers don't lower under symbolic dims.

## Regenerating the model

If the upstream model changes or you want to swap in a different speaker
embedding network:

```bash
python3.13 -m venv /tmp/speaker-conv/.venv
/tmp/speaker-conv/.venv/bin/pip install --quiet \
    "torch==2.7.0" "torchaudio==2.7.0" coremltools speechbrain numpy
/tmp/speaker-conv/.venv/bin/python scripts/speaker-model/convert.py
/tmp/speaker-conv/.venv/bin/python scripts/speaker-model/validate.py
cp -R /tmp/speaker-conv/SpeakerECAPA.mlpackage apps/mobile/src-tauri/ios/Models/
```

The validator runs a deterministic smoke test (self vs self, self vs
self+noise, self vs pitch-shifted) and prints a PASS/FAIL verdict. The
real voice-vs-voice eval happens in-app with two enrolled members.
