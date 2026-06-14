# ElevenLabs — ToS, Quality & Cost Note

**For Jindřich + Rothschild. Updated: 2026-06-14.**

## Voice Cloning ToS

ElevenLabs Instant Voice Clone requires explicit consent from the person whose voice is cloned.  
By using the clone onboarding flow in ShowX, the operator confirms they have consent to clone
the showcaller's voice and that the cloned voice is used only for the ShowX showcalling feature.

Key ToS points (as of 2026-06):
- **Consent required**: You must own or have consent for the voice being cloned.
- **Commercial use**: Allowed on Starter plan and above (free tier: 10 clones max).
- **No impersonation**: Using a cloned voice to impersonate a third party for deception is prohibited.
- **Deletion**: Voice clones can be deleted from the ElevenLabs dashboard at any time.

Source: https://elevenlabs.io/terms — review before customer deployments.

## Quality Caveat for Short Imperative Phrases

ElevenLabs models (including `eleven_multilingual_v2`) are trained on diverse speech.
For **short imperative phrases** typical in showcalling ("Standby LX", "And go", "GO!"):

- Quality is generally good but can vary by voice profile.
- Very short phrases (<3 words) may have unnatural cadence.
- **Recommendation**: test with realistic showcalling scripts before a live event.
- The `stability: 0.5 / similarity_boost: 0.75` defaults are a reasonable starting point;
  tuning per-voice is possible by adjusting `voice_settings` in `elevenLabsClient.ts`.

## Cost Estimate (per Rothschild)

| Plan | Characters/month | Estimated cost |
|------|-----------------|----------------|
| Starter ($5/mo) | 30,000 chars | ~3,000 cues of 10 chars avg |
| Creator ($22/mo) | 100,000 chars | ~10,000 cues |
| Pro ($99/mo) | 500,000 chars | ~50,000 cues |

A typical 300-cue show uses ~6,000 characters of TTS text (20 chars avg per cue × 300).
Pre-generation (B007-005) happens at rehearsal — only regenerate on script changes.
One rehearsal cycle ≈ $0.10 on Starter plan.

**Budget line: ~$5–$22/month for active show periods. Negligible vs. venue fees.**
