#!/bin/bash
# Renders the three backdrops (preview + panorama) into ./out. Usage: BLENDER=/path/to/blender ./batch.sh
cd "$(dirname "$0")"
BLENDER="${BLENDER:-blender}"
mkdir -p out
for c in c1_atelier c2_attic c3_movement; do
  for m in preview pano; do
    PYTHONUNBUFFERED=1 "$BLENDER" -b --factory-startup -P run.py -- $c $m
  done
done
