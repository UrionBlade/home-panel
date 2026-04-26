"""
Convert SpeechBrain ECAPA-TDNN speaker embedding model to CoreML.

ECAPA's Conv1d uses `reflect` padding which coremltools rejects under
variable input shapes. We sidestep that by fixing both the audio length and
the resulting feature length to constants — the model becomes a single
graph that takes raw 16 kHz PCM and emits the 192-d embedding. iOS just
pads/truncates the captured audio to N_FIXED before calling predict().

N_FIXED = 40000 samples = 2.5 s @ 16 kHz, which is enough for "ok casa
<command>" enrollment phrases.

Output: SpeakerECAPA.mlpackage
- Input  "audio":     float32 tensor [1, 40000]   raw 16 kHz mono PCM
- Output "embedding": float32 tensor [1, 192]     speaker embedding
"""

from pathlib import Path

import coremltools as ct
import numpy as np
import torch
from speechbrain.inference.speaker import EncoderClassifier
from speechbrain.processing.features import spectral_magnitude

CACHE_DIR = Path("/tmp/speaker-conv/sb-cache")
CACHE_DIR.mkdir(parents=True, exist_ok=True)

N_FIXED = 40_000  # 2.5 s @ 16 kHz
# T = floor(N / hop) + 1  (with center=True)
T_FIXED = N_FIXED // 160 + 1  # = 251 frames

print("[1/5] Loading SpeechBrain ECAPA-TDNN…")
classifier = EncoderClassifier.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb",
    savedir=str(CACHE_DIR),
    run_opts={"device": "cpu"},
)
classifier.eval()

print("[2/5] Probing reference output (full pipeline)…")
torch.manual_seed(0)
ref_wav = torch.randn(1, N_FIXED) * 0.05
with torch.no_grad():
    ref_emb = classifier.encode_batch(ref_wav).squeeze(1)  # [1, 192]
print(f"   ref embedding norm: {ref_emb.norm().item():.4f}")


class FullPipeline(torch.nn.Module):
    """Raw 16 kHz PCM [1, N_FIXED] → speaker embedding [1, 192].

    Reuses SpeechBrain's STFT and Filterbank modules (so the fbank matches
    training bit-for-bit), inlines mean-only sentence norm, and runs the
    ECAPA embedding head. Shapes are static everywhere because Conv1d
    `reflect` padding doesn't survive symbolic dims.
    """

    def __init__(self, classifier: EncoderClassifier):
        super().__init__()
        cf = classifier.mods.compute_features
        self.compute_STFT = cf.compute_STFT
        self.compute_fbanks = cf.compute_fbanks
        self.embedding_model = classifier.mods.embedding_model

    def forward(self, audio: torch.Tensor) -> torch.Tensor:
        # audio: [1, N_FIXED] → STFT: [1, T, F, 2] → mag: [1, T, F]
        # → fbank: [1, T, 80]
        stft = self.compute_STFT(audio)
        mag = spectral_magnitude(stft)
        feats = self.compute_fbanks(mag)
        # Force the time-dimension into a static shape so the downstream
        # Conv1d `reflect` pads see concrete sizes (the tracer otherwise
        # propagates symbolic dims and the Torch→MIL frontend rejects them).
        feats = feats.reshape(1, T_FIXED, 80)
        # Sentence mean-only normalisation (SB default at runtime).
        feats = feats - feats.mean(dim=1, keepdim=True)
        emb = self.embedding_model(feats)
        return emb.squeeze(1)


print("[3/5] Tracing the full pipeline…")
pipeline = FullPipeline(classifier).eval()
with torch.no_grad():
    pipeline_emb = pipeline(ref_wav)
    cos_sanity = torch.nn.functional.cosine_similarity(pipeline_emb, ref_emb, dim=-1).item()
print(f"   pipeline vs SB cosine: {cos_sanity:.6f}  (must be ~1.0)")
assert cos_sanity > 0.999, "pipeline is not numerically equivalent to SpeechBrain"

traced = torch.jit.trace(pipeline, ref_wav, strict=False)


print("[4/5] Converting to CoreML (.mlpackage)…")
mlmodel = ct.convert(
    traced,
    inputs=[
        ct.TensorType(
            name="audio",
            shape=(1, N_FIXED),
            dtype=np.float32,
        )
    ],
    outputs=[ct.TensorType(name="embedding", dtype=np.float32)],
    minimum_deployment_target=ct.target.iOS17,
    compute_units=ct.ComputeUnit.ALL,
    convert_to="mlprogram",
)

mlmodel.short_description = (
    "ECAPA-TDNN speaker embedding (192-d). "
    "Input: raw 16 kHz mono PCM [1, 40000] (2.5 s). Pad/truncate upstream. "
    "Output: speaker embedding usable for cosine similarity."
)
mlmodel.author = "speechbrain/spkrec-ecapa-voxceleb (Apache 2.0)"
mlmodel.version = "1.0"

OUT = Path("/tmp/speaker-conv/SpeakerECAPA.mlpackage")
mlmodel.save(str(OUT))
size_mb = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file()) / 1e6
print(f"[5/5] Saved: {OUT}  ({size_mb:.2f} MB)")
