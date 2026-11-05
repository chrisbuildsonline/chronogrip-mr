#!/bin/bash
cd /tmp/claude-1000/-home-chris-projects-hackathons/49b10371-400a-427b-8f24-54f3643849c9/scratchpad/backdrops
: > out/final.log
for c in c1_atelier c2_attic c3_movement c4_studio; do
  for m in preview pano; do
    PYTHONUNBUFFERED=1 ./blender-4.5.15-linux-x64/blender -b --factory-startup -P scripts/run.py -- $c $m 2>&1 | grep -E "Error|Traceback|RENDER_S|RENDER_DEVICE" >> out/final.log
  done
done
echo BATCH_DONE >> out/final.log
