#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
mkdir -p marketing/v3/out marketing/v3/work
ROOT="$PWD"
OUT="$ROOT/marketing/v3/out"
WORK="$ROOT/marketing/v3/work"
FNT=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
python3 -m pip install --quiet pillow || true
python3 - "$ROOT" <<'PY'
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import math,sys
root=Path(sys.argv[1]); im=Image.new('RGB',(720,1280)); d=ImageDraw.Draw(im)
for y in range(1280):
    v=y/1280
    d.line((0,y,720,y),fill=(int(13+22*v),int(8+8*v),int(39+58*v)))
for x,y,c in [(90,170,(255,50,155)),(570,400,(60,210,255)),(290,860,(170,80,255))]:
    for k in range(13,0,-1):
        r=25*k
        ov=Image.new('RGBA',im.size); od=ImageDraw.Draw(ov)
        od.ellipse((x-r,y-r,x+r,y+r),fill=c+(5,))
        im=Image.alpha_composite(im.convert('RGBA'),ov).convert('RGB')
d=ImageDraw.Draw(im)
icon=root/'public/icon-512.png'
if icon.exists():
    logo=Image.open(icon).convert('RGBA');logo.thumbnail((300,300))
    im.paste(logo,((720-logo.width)//2,188),logo)
d=ImageDraw.Draw(im)
font='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def txt(s,y,sz,col):
    f=ImageFont.truetype(font,sz)
    d.text((360,y),s,font=f,fill=col,anchor='mt',stroke_width=2,stroke_fill=(8,6,25))
txt("DAD'S ARCADE",590,61,(255,216,76))
txt('DAD BUILT IT.',700,43,(255,255,255))
txt('WE PLAY IT.',757,43,(73,225,255))
txt('FREE  •  NO ADS  •  PRESS PLAY',922,26,(255,255,255))
txt('play.hyperdrive-arcade',1040,30,(95,225,255))
txt('.workers.dev',1082,30,(95,225,255))
im.save(str(root/'marketing/v3/work/endcard.png'))
PY
: > "$WORK/concat.txt"
idx=0
while IFS=: read -r key dur label; do
    in="$ROOT/marketing/v3/captured/$key.webm"
    [ -s "$in" ] || { echo "Missing real gameplay recording: $in" >&2; exit 1; }
    segment="$WORK/seg_$(printf '%02d' "$idx").mp4"
    printf '%s' "$label" > "$WORK/title_$idx.txt"
    echo "Rendering $key, $dur seconds..."
    ffmpeg -nostdin -hide_banner -loglevel error -y -stream_loop -1 -i "$in" -t "$dur" \
      -vf "fps=30,scale=720:1280:flags=lanczos,format=yuv420p,drawbox=x=0:y=80:w=iw:h=105:color=0x081225@0.86:t=fill,drawtext=fontfile=$FNT:textfile=$WORK/title_$idx.txt:fontsize=31:fontcolor=white:borderw=2:bordercolor=black@0.65:x=(w-text_w)/2:y=115" \
      -an -c:v libx264 -preset veryfast -crf 19 -pix_fmt yuv420p -r 30 -video_track_timescale 15360 "$segment"
    echo "file '$segment'" >>"$WORK/concat.txt"
    idx=$((idx+1))
done <<'SEGMENTS'
menu:2.6:DAD'S ARCADE - PICK YOUR GAME
plasma:3.8:PLASMA SORT - DAILY PUZZLES
prize:3.9:DAD'S PRIZE DROP
letter:3.2:LETTER LOCK - GUESS THE WORD
slime:3.8:RILEY'S SLIME SHOP
voltage:3.6:WORD VOLTAGE - NEW LEVELS
menu:1.8:PLAY TOGETHER - FREE & NO ADS
SEGMENTS
ffmpeg -nostdin -hide_banner -loglevel error -y -loop 1 -i "$WORK/endcard.png" -t 4.0 \
    -vf 'fps=30,format=yuv420p' -an -c:v libx264 -preset veryfast -crf 18 \
    -pix_fmt yuv420p -r 30 -video_track_timescale 15360 "$WORK/endcard.mp4"
echo "file '$WORK/endcard.mp4'" >>"$WORK/concat.txt"
ffmpeg -nostdin -hide_banner -loglevel error -y -f concat -safe 0 -i "$WORK/concat.txt" -c copy "$WORK/visual.mp4"
DUR=$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$WORK/visual.mp4")
echo "Total ad duration: $DUR"
SONG_ID=97093b35-17d2-42ff-acf6-1c403c8c5e33
for host in cdn1.suno.ai cdn2.suno.ai; do
    if curl --fail --location --retry 2 --connect-timeout 10 --max-time 90 -o "$WORK/press-play.mp3" "https://$host/$SONG_ID.mp3" \
      && ffprobe -v error "$WORK/press-play.mp3" >/dev/null 2>&1; then
       echo "Downloaded original paid Suno song"; break
    fi
done
if [ -s "$WORK/press-play.mp3" ] && ffprobe -v error "$WORK/press-play.mp3" >/dev/null 2>&1; then
   ffmpeg -nostdin -hide_banner -loglevel error -y -i "$WORK/press-play.mp3" -filter_complex \
     '[0:a]atrim=start=0:end=20.2,asetpts=PTS-STARTPTS[a];[0:a]atrim=start=99.28:end=105.78,asetpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=0:a=1,afade=t=out:st=26.2:d=0.5[out]' \
     -map '[out]' -t "$DUR" -c:a aac -b:a 192k "$WORK/song.m4a"
   ffmpeg -nostdin -hide_banner -loglevel error -y -i "$WORK/visual.mp4" -i "$WORK/song.m4a" \
     -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -movflags +faststart -shortest \
     "$OUT/Dads_Arcade_V3_Real_Gameplay.mp4"
else
   echo 'WARNING: original Suno audio unavailable; output is a silent real-gameplay edit.' >&2
   cp "$WORK/visual.mp4" "$OUT/Dads_Arcade_V3_No_Audio.mp4"
fi
ls -lh "$OUT"/*.mp4
