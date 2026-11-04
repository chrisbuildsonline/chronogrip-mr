# Backdrop renders

Procedural Blender scenes (no third-party assets) behind the tray on desktop and phone. Each renders a 4096x2048
equirectangular panorama from the orbit target; game-forward (-Z) sits at u = 0.25, so three's
`scene.background` with `EquirectangularReflectionMapping` lines up with no rotation.

| file | scene | stage |
| --- | --- | --- |
| `c2_attic.py` | attic clock window (also the menus) | Easy |
| `c1_atelier.py` | clockmaker's atelier | Medium |
| `c3_movement.py` | inside a giant clock movement | Hard |

Shared helpers are in `common.py`, `props.py`, `clocks.py`; `run.py` drives one scene.

## Re-render

Blender 4.5 LTS (Cycles; a GPU helps, CPU works but is slow). The binary is not in the repo.

    blender -b --factory-startup -P run.py -- c2_attic pano       # one panorama -> out/c2_attic_pano.png
    blender -b --factory-startup -P run.py -- c2_attic preview    # a flat preview from the game camera
    BLENDER=/path/to/blender ./batch.sh                           # all three, both modes

Then make the JPGs the game loads (`public/backdrops/cN_pano.jpg` 4096 wide, `cN_pano_2048.jpg` for phones):

    ffmpeg -i out/c2_attic_pano.png -q:v 4 ../../public/backdrops/c2_pano.jpg
    ffmpeg -i out/c2_attic_pano.png -vf scale=2048:1024 -q:v 4 ../../public/backdrops/c2_pano_2048.jpg
