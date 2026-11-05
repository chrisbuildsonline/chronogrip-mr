#!/bin/bash
# export_cube.sh <render prefix in out/> <id>
# out/<prefix>_cube2048_<face>.png -> cube/<id>/{px,nx,py,ny,pz,nz}.jpg (2048) and cube/<id>_1024/ (phone).
# Faces were rendered as natural inside views; three.js's CubeTexture samples with x flipped, so its px slot takes
# the view towards -X and its nx slot the view towards +X (checked in test/cube_test2.png).
set -e
B=$(cd "$(dirname "$0")/.." && pwd)
P=$1; ID=$2
mkdir -p "$B/cube/$ID" "$B/cube/${ID}_1024"
for slot in px nx py ny pz nz; do
  src=$slot
  [ $slot = px ] && src=nx
  [ $slot = nx ] && src=px
  in="$B/out/${P}_cube2048_${src}.png"
  ffmpeg -y -loglevel error -i "$in" -pix_fmt yuvj444p -q:v 3 "$B/cube/$ID/$slot.jpg"
  ffmpeg -y -loglevel error -i "$in" -vf scale=1024:1024:flags=lanczos -pix_fmt yuvj444p -q:v 3 "$B/cube/${ID}_1024/$slot.jpg"
done
du -cb "$B/cube/$ID"/*.jpg | tail -1 | awk -v id=$ID '{printf "%s 2048: %.2f MB\n", id, $1/1e6}'
du -cb "$B/cube/${ID}_1024"/*.jpg | tail -1 | awk -v id=$ID '{printf "%s 1024: %.2f MB\n", id, $1/1e6}'
