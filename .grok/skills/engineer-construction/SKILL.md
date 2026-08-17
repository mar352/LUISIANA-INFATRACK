---
name: engineer-construction
description: >
  Engineer workflow that turns an MPDC site pin into the Under Construction
  GLB so the Engineer still places it. Use when the user mentions Itatayo na,
  site pin confirmation, construction.glb, or /engineer-construction.
---

# Engineer start-construction

## Flow

1. User is role **Engineer**.
2. Click a `siteMarkerOnly` pin.
3. Side panel + HUD ask **Itatayo na ba ito?**
4. **Oo, itayo na** patches:

```
siteMarkerOnly: false
modelType: construction
modelLocked: false
status: Ongoing
lifecyclePhase: Construction
```

5. Attach `construction.glb` (`MODEL_CATALOG` type `construction`). Unlock transform. Engineer moves / rotates / scales, then Save Position / Lock.
6. Write audit `project.startConstruction`.

## Where it lives

- Confirm UI: `CesiumMap` HUD + `PlaceSidePanel`
- Persist: `patchProject` then Firestore fallback; `onProjectPatch` updates App state
- After promote, refresh pin chrome (`applySitePinChrome`) so the 📌 marker hides when the GLB attaches
- `canPromoteSitePin` is Engineer-only. MPDC only sees “site pin — Engineering places later.”

## Do not

- Auto-complete site pins via `tickProjects`
- Let MPDC start construction or delete the building
- Leave `siteMarkerOnly` true after confirm (LOD will never load the GLB)
