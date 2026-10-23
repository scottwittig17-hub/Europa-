#!/usr/bin/env bash
# Cap MP4s so the SHORTER side is <=720 px (portrait or landscape), H.264 High, yuv420p, faststart, no audio.
# Posters (<name>-poster.jpg): an existing poster is resized to the video's dims (keeps the art);
# a missing one is grabbed from the first frame.
# Usage: tools/cap_video.sh file.mp4 [more.mp4 ...]   (files already within the cap are left untouched)
set -euo pipefail
for f in "$@"; do
  read -r w h < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$f" | tr ',' ' ')
  short=$(( w < h ? w : h ))
  if (( short > 720 )); then
    if (( w <= h )); then vf="scale=720:-2:flags=lanczos"; else vf="scale=-2:720:flags=lanczos"; fi
    tmp="${f%.mp4}.capping.mp4"
    ffmpeg -y -loglevel error -i "$f" -vf "$vf,format=yuv420p" -c:v libx264 -profile:v high -preset slow -crf 21 \
      -movflags +faststart -an "$tmp"
    mv "$tmp" "$f"
    echo "capped $f: ${w}x${h} -> $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$f")"
  else
    echo "ok     $f: ${w}x${h} (within cap)"
  fi
  poster="${f%.mp4}-poster.jpg"
  read -r vw vh < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$f" | tr ',' ' ')
  if [[ -f "$poster" ]]; then
    read -r pw ph < <(ffprobe -v error -show_entries stream=width,height -of csv=p=0 "$poster" | tr ',' ' ')
    if [[ "$pw" != "$vw" || "$ph" != "$vh" ]]; then   # keep the existing art, just resize it to the video size
      ffmpeg -y -loglevel error -i "$poster" -vf "scale=${vw}:${vh}:flags=lanczos" -q:v 2 "${poster%.jpg}.tmp.jpg" && mv "${poster%.jpg}.tmp.jpg" "$poster"
      echo "poster $poster resized to ${vw}x${vh}"
    fi
  else
    ffmpeg -y -loglevel error -i "$f" -vf "select=eq(n\\,0)" -frames:v 1 -q:v 3 "$poster"
    echo "poster $poster (first frame)"
  fi
done
