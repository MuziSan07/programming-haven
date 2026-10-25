# Avatar credits

- `aria.glb`: created with MPFB (MakeHuman Plugin for Blender) and shared by Mika Suominen in the
  TalkingHead project (https://github.com/met4citizen/TalkingHead), released under **CC0 1.0**.
  Textures resized to 1024 px WebP and geometry meshopt-compressed for the web.

Only use avatar models whose licence allows commercial use in a public web app.

- `alex.glb`: **Microsoft Rocketbox `Male_Adult_06`** (https://github.com/microsoft/Microsoft-Rocketbox),
  released under the **MIT License**, Copyright (c) 2020 Microsoft. Full licence text in
  `LICENSE-Microsoft-Rocketbox.md`. Original character made by the Rocketbox studio (not a scan of a real person).
  Starting point was the GLB conversion (52 ARKit blend shapes + 15 Oculus visemes, 1024 px WebP textures)
  from the favjiw/conversational-ai project. Modified for Programming Haven: the 3ds Max Biped skeleton was
  re-rigged to Mixamo bone names and axes (bones re-oriented to match the TalkingHead reference rig, clavicles
  re-parented under Spine2 and thighs under Hips, inverse bind matrices recomputed so the bind pose is unchanged),
  a `HipsOffset` joint added so TalkingHead's standing poses keep the feet on the floor, unused all-white vertex
  colours removed, and geometry meshopt-compressed.
