# Backdrop renders

Procedural Blender scenes (no third-party assets) behind the tray on desktop and phone. Each scene renders six cube faces
(2048 px) from the orbit target; game-forward is -Z. The game loads them as a three.js `CubeTexture`
(`public/backdrops/<id>_cube/{px,nx,py,ny,pz,nz}.jpg`, and `<id>_cube_1024/` for phones). No resample, no equirect pass.

| file | scene | stage |
| --- | --- | --- |
| `c2_attic.py` | attic clock window (also the menus) | Easy |
| `c1_atelier.py` | clockmaker's atelier | Medium |
| `c3e_skyline.py` (+ `h2.py`) | Iron Tower, Midnight: an open iron lattice platform 90 m above a moonlit harbour city, the clock movement on the right (the shipped Hard, `public/backdrops/c3_cube`) | Hard |
| `c3b_movement.py` | the earlier Hard render, inside a giant movement (lens-soft variant B) | - |
| `c3_movement.py` | the first Hard render, kept for reference | - |

Shared helpers are in `common.py`, `props.py`, `clocks.py`; `run.py` drives one scene.

## Re-render

Blender 4.5 LTS (Cycles; a GPU helps, CPU works but is slow). The binary is not in the repo. Run from this folder's parent
layout (`scripts/` here, `out/`, `cube/` beside it), or adjust the paths in `run.py` and `export_cube.sh`.

    blender -b --factory-startup -P run.py -- c2_attic cube2048 1 96       # six faces -> out/c2_attic_cube2048_<face>.png
    VARIANT=b blender -b --factory-startup -P run.py -- c3b_movement cube2048 1 128 _b
    blender -b --factory-startup -P run.py -- c2_attic preview             # a flat preview from the game camera

`batch.sh` runs the set. `run.py` also has a `turn` mode (`turn`, `turn_left`, `turn_right`: a preview from the desktop orbit's clamp, 40 degrees round and 12 lower) and prints each scene's animation spots (`SPOT` lines: position in a 1920x1080 front view, azimuth and elevation from the eye, distance), which `src/ambient.ts` anchors its Hard parts on. The camera clip end is 50 km so the moon and the city render. Then `export_cube.sh <render prefix> <id>` turns the faces into the JPGs (4:4:4, swapping px and nx
because three samples a cube with x flipped) and a 1024 phone set; copy them to `public/backdrops/<id>_cube[_1024]/`.

## Wood textures

`textures.py` bakes the tileable walnut sets (albedo, roughness, height -> normal) that `src/wood.ts` loads from
`public/textures/{tray,bench}_{albedo,normal,roughness}_{2048,1024}.jpg`. Grain runs along U; the tray tile is 0.5 m, the bench 1.0 m.

    blender -b --factory-startup -P textures.py -- tray 2048
    blender -b --factory-startup -P textures.py -- bench 2048

Make the JPGs (and 1024 copies) with ffmpeg `-q:v 3`.
