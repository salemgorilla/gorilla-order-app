import math
from PIL import Image, ImageDraw
S=4; W=512; N=36
def frame(i):
    t=i/N
    im=Image.new("RGB",(W*S,W*S),(132,214,36)); d=ImageDraw.Draw(im)
    def E(cx,cy,rx,ry,fill):
        d.ellipse([(cx-rx)*S,(cy-ry)*S,(cx+rx)*S,(cy+ry)*S],fill=fill)
    # background rays
    for k in range(16):
        a=k*math.pi/8+t*math.pi/8
        d.polygon([(256*S,256*S),((256+400*math.cos(a))*S,(256+400*math.sin(a))*S),((256+400*math.cos(a+0.17))*S,(256+400*math.sin(a+0.17))*S)],fill=(165,232,70))
    bob=math.sin(t*2*math.pi)*8
    cy=270+bob
    dark=(76,29,149); mid=(109,40,217); face=(139,92,246); light=(167,139,250)
    # shoulders
    E(256,520+bob,230,150,dark)
    # ears
    E(105,cy,28,36,mid); E(407,cy,28,36,mid)
    E(105,cy,14,20,face); E(407,cy,14,20,face)
    # head + crest
    E(256,cy-70,95,85,dark)
    E(256,cy,140,150,dark)
    # face mask
    E(256,cy+30,100,115,face)
    E(256,cy+75,78,62,light)
    # brows
    raise_=max(0,math.sin(t*2*math.pi*2-1.0))*14
    d.polygon([(150*S,(cy-30)*S),(256*S,(cy-62-raise_)*S),(362*S,(cy-30)*S),(362*S,(cy-5)*S),(256*S,(cy-30-raise_)*S),(150*S,(cy-5)*S)],fill=dark)
    # eyes w/ blink
    blink = 1 - max(0,1-abs((t%0.5)-0.25)/0.02) if False else 1
    ph=(t*2)%1
    if 0.46<ph<0.54: blink=0.1
    for ex in (205,307):
        E(ex,cy+8,22,22*blink+1,(250,244,232))
        if blink>0.5:
            E(ex+3*math.sin(t*2*math.pi),cy+10,11,11,(40,24,16))
            E(ex+7,cy+5,3.5,3.5,(255,255,255))
        else:
            d.line([(ex-22)*S,(cy+8)*S,(ex+22)*S,(cy+8)*S],fill=dark,width=5*S)
    # nostrils
    fl=2*math.sin(t*2*math.pi*3)
    E(238,cy+62,9+fl/2,6,dark); E(274,cy+62,9+fl/2,6,dark)
    # mouth
    open_=max(0,math.sin(t*2*math.pi*2-1.0))*26
    if open_>3:
        d.pieslice([(206)*S,(cy+85)*S,(306)*S,(cy+125+open_)*S],0,180,fill=(60,16,22))
        E(256,cy+105+open_*0.5,22,max(3,open_*0.35),(200,90,100))
    else:
        d.arc([(216)*S,(cy+92)*S,(296)*S,(cy+122)*S],20,160,fill=dark,width=5*S)
    # chest
    E(256,cy+245,110,60,mid)
    return im.crop((121*S,150*S,391*S,420*S)).resize((W,W),Image.LANCZOS)
fr=[frame(i) for i in range(N)]
fr[0].save("gorilla-avatar.gif",save_all=True,append_images=fr[1:],duration=60,loop=0,optimize=True)
fr[0].save("gorilla-avatar-still.png")
fr[0].resize((250,250),Image.LANCZOS).save("gorilla-avatar-250.png")
