"""Validate deployed tutorial encodes and create posters / a decoded proof contact sheet."""
import json, subprocess, pathlib, shutil
ROOT=pathlib.Path(__file__).resolve().parents[2]
OUT=ROOT/'public/tutorials'
PROOF=pathlib.Path(__file__).resolve().parent/'proof'
PROOF.mkdir(exist_ok=True)
FF=shutil.which('ffmpeg') or '/opt/homebrew/bin/ffmpeg'
FP=shutil.which('ffprobe') or '/opt/homebrew/bin/ffprobe'
report=[]
def frame(path,frame):
 return subprocess.check_output([FF,'-v','error','-i',str(path),'-vf',f'select=eq(n\\,{frame}),scale=240:200','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])
for game in ['target','fruit','hockey','moles','maze','rally']:
 path=OUT/f'{game}.mp4'
 info=json.loads(subprocess.check_output([FP,'-v','error','-show_streams','-show_format','-of','json',str(path)]))
 video=info['streams'][0]
 assert float(info['format']['duration'])==5,game
 assert video['avg_frame_rate']=='60/1',game
 assert (video['width'],video['height'])==(960,800),game
 assert video['nb_frames']=='300',game
 assert video['pix_fmt']=='yuv420p',game
 assert len(info['streams'])==1,game
 first,last,middle=frame(path,0),frame(path,299),frame(path,150)
 seam=sum(abs(a-b) for a,b in zip(first,last))/len(first)
 motion=sum(abs(a-b) for a,b in zip(first,middle))/len(first)
 assert seam<1, (game,seam)
 assert motion>1, (game,motion)
 subprocess.run([FF,'-y','-v','error','-i',str(path),'-frames:v','1','-q:v','2',str(OUT/f'{game}.jpg')],check=True)
 subprocess.run([FF,'-y','-v','error','-ss','2.5','-i',str(path),'-frames:v','1',str(PROOF/f'{game}.png')],check=True)
 source=ROOT/'videos/game-tutorials/assets'/f'gameplay-{game}.mp4'
 source_pixels=subprocess.check_output([FF,'-v','error','-i',str(source),'-vf','select=eq(n\\,150),scale=840:420','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])
 tutorial_pixels=subprocess.check_output([FF,'-v','error','-i',str(path),'-vf','select=eq(n\\,150),crop=840:420:60:120','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])
 art_error=sum(abs(a-b) for a,b in zip(source_pixels,tutorial_pixels))/len(source_pixels)
 assert art_error<12,(game,'captured gameplay mismatch',art_error)
 opening_source=subprocess.check_output([FF,'-v','error','-i',str(source),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])
 opening_tutorial=subprocess.check_output([FF,'-v','error','-i',str(path),'-vf','crop=840:420:60:120','-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'])
 opening_error=sum(abs(a-b) for a,b in zip(opening_source,opening_tutorial))/len(opening_source)
 assert opening_error<12,(game,'opening gameplay mismatch',opening_error)
 report.append({'game':game,'openingGameplayMeanError255':round(opening_error,3),'actualGameplayMeanError255':round(art_error,3),'duration':5,'fps':60,'frames':300,'width':960,'height':800,'codec':video['codec_name'],'pixelFormat':video['pix_fmt'],'bytes':path.stat().st_size,'seamMeanError255':round(seam,3),'midpointDifference255':round(motion,3)})
(PROOF/'validation.json').write_text(json.dumps(report,indent=2)+'\n')
cmd=[FF,'-y','-v','error']
for r in report:cmd+=['-i',str(PROOF/f"{r['game']}.png")]
cmd+=['-filter_complex',';'.join(f'[{i}:v]scale=480:400[v{i}]' for i in range(6))+';[v0][v1][v2][v3][v4][v5]xstack=inputs=6:layout=0_0|480_0|960_0|0_400|480_400|960_400[out]','-map','[out]','-frames:v','1',str(PROOF/'contact-sheet.jpg')]
subprocess.run(cmd,check=True)
print(json.dumps(report,indent=2))
