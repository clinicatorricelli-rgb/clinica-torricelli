"""Recompose supplied media without retouching. Keep source files and v1/v2 intact."""
from pathlib import Path
import subprocess
import imageio_ffmpeg
from PIL import Image, ImageDraw

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'artifacts'/'video-v4'
WORK.mkdir(parents=True,exist_ok=True)
FF=imageio_ffmpeg.get_ffmpeg_exe()
TEMP=Path('C:/Users/LUCASCORTS/AppData/Local/Temp')
PHOTOS=['codex-clipboard-7473a375-346f-4d0f-b8e3-790a5763c42f.png','codex-clipboard-ff81eb41-3462-4321-830c-65b736611160.png','codex-clipboard-af703038-7812-41ea-be93-02060e824a34.png']
VIDEOS=[Path('C:/Users/LUCASCORTS/Downloads')/x for x in ['76EA662D-282A-433A-93D2-B4A9A76C2ACC.MP4','70B227BB-3D97-42E2-8A11-7A5602BAE103.MP4']]
def run(args):
 p=subprocess.run([FF,'-y','-hide_banner','-loglevel','error',*args],capture_output=True,text=True,encoding='utf-8',errors='replace')
 if p.returncode:raise RuntimeError(p.stderr[-4000:])

def inspect():
 images=[]
 for i,p in enumerate(PHOTOS):
  im=Image.open(TEMP/p).convert('RGB');print(p,im.size,flush=True);images.append((str(i)+' photo',im))
 for i,p in enumerate(VIDEOS):
  out=WORK/f'original-video-{i}.jpg';run(['-ss','3','-i',str(p),'-frames:v','1',str(out)])
  im=Image.open(out).convert('RGB');print(p.name,im.size,flush=True);images.append((str(i)+' video',im))
 sheet=Image.new('RGB',(1500,650),'#eee5d9');d=ImageDraw.Draw(sheet)
 for i,(label,im) in enumerate(images):
  im.thumbnail((290,600));sheet.paste(im,(i*300+(300-im.width)//2,30));d.text((i*300+10,10),label,fill='black')
 sheet.save(WORK/'originals.jpg')

def compose():
 # Crop only screenshot chrome at the edges of photos. Video crops retain full
 # source width and the procedure/tool area; never fill-crop the landscape canvas.
 scenes=[('photo',0,3.4,'crop=867:760:0:0'),
         ('video',0,1.7,'crop=1080:1320:0:260'),
         ('photo',1,3.4,'crop=785:760:0:0'),
         ('video',1,1.7,'crop=2160:2600:0:400'),
         ('photo',2,3.4,'crop=640:805:30:0')]
 for i,(kind,index,duration,crop) in enumerate(scenes):
  args=['-loop','1','-i',str(TEMP/PHOTOS[index])] if kind=='photo' else ['-ss','3','-i',str(VIDEOS[index])]
  vf=crop+',scale=792:472:force_original_aspect_ratio=decrease:force_divisible_by=2,pad=800:480:(ow-iw)/2:(oh-ih)/2:color=0xEEE5D9,setsar=1,fps=25,format=yuv420p'
  run([*args,'-vf',vf,'-t',str(duration),'-an','-map_metadata','-1','-c:v','libx264','-crf','19','-preset','slow',str(WORK/f'scene-{i}.mp4')])
  print('Scene',i,'ready',flush=True)
 listing=WORK/'concat.txt';listing.write_text(''.join(f"file '{(WORK/f'scene-{i}.mp4').as_posix()}'\n" for i in range(5)),encoding='utf8')
 output=ROOT/'public/media/abertura-v4.mp4'
 run(['-f','concat','-safe','0','-i',str(listing),'-an','-c:v','copy','-movflags','+faststart','-map_metadata','-1',str(output)])
 run(['-i',str(output),'-f','null','-'])
 # Two actual frames from every scene, including each execution scene's end.
 times=[0.4,2.8,3.6,4.8,5.4,7.8,8.8,9.9,10.8,13.2]
 sheet=Image.new('RGB',(1600,400),'#eee5d9')
 for i,t in enumerate(times):
  frame=WORK/f'check-{i}.jpg';run(['-ss',str(t),'-i',str(output),'-frames:v','1',str(frame)])
  im=Image.open(frame);im.thumbnail((320,160));x=(i%5)*320;y=(i//5)*200;sheet.paste(im,(x,y));ImageDraw.Draw(sheet).text((x+5,y+165),f'{t:.1f}s',fill='black')
 sheet.save(WORK/'v4-all-scenes.jpg')
 run(['-ss','0.4','-i',str(output),'-frames:v','1',str(ROOT/'public/media/abertura-v4-poster.jpg')])
 print('Verified',output.stat().st_size,'bytes',flush=True)

if __name__=='__main__':compose()

