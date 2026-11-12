import math
from PIL import Image, ImageDraw
S=3; W=512; N=36
def frame(i):
    t=i/N
    im=Image.new("RGB",(W*S,W*S),(96,190,255)); d=ImageDraw.Draw(im)
    def E(cx,cy,rx,ry,fill):
        d.ellipse([(cx-rx)*S,(cy-ry)*S,(cx+rx)*S,(cy+ry)*S],fill=fill)
    # clouds drift left, loop seamlessly
    for k,(cy,r) in enumerate([(90,34),(210,26),(430,38),(330,22)]):
        x=(k*170+130-t*W)%(W+160)-80
        for dx,dy,rr in [(0,0,r),(r*0.9,6,r*0.8),(-r*0.9,8,r*0.7)]:
            E(x+dx,cy+dy,rr*1.3,rr*0.8,(240,248,255))
    flap=math.sin(t*2*math.pi*2)
    bob=-flap*9
    P=(109,40,217); PL=(167,139,250)
    def wing(px,py,side):
        raise_=10+30*flap
        for j,(base,L) in enumerate([(185,190),(205,200),(225,190),(245,170),(265,140)]):
            a=math.radians(base+raise_)
            if side>0: a=math.pi-a
            cx=px+math.cos(a)*L/2; cy_=py+bob+math.sin(a)*L/2
            pts=[]
            for k in range(24):
                u=2*math.pi*k/24
                x=math.cos(u)*L/2; y=math.sin(u)*20
                pts.append(((cx+x*math.cos(a)-y*math.sin(a))*S,(cy_+x*math.sin(a)+y*math.cos(a))*S))
            d.polygon(pts,fill=P if j%2==0 else PL)
    wing(205,385,-1); wing(307,385,1)
    br=(125,78,44); brd=(86,52,28); tan=(238,205,160)
    cy=265+bob
    # tail
    d.arc([300*S,(380+bob)*S,420*S,(500+bob)*S],270,90,fill=brd,width=14*S)
    # body
    E(256,470+bob,95,110,br); E(256,480+bob,60,80,tan)
    # ears
    E(150,cy,34,34,br); E(362,cy,34,34,br); E(150,cy,18,18,tan); E(362,cy,18,18,tan)
    # head
    E(256,cy,115,108,br)
    # face mask: two eye lobes + muzzle
    E(214,cy-12,52,48,tan); E(298,cy-12,52,48,tan); E(256,cy+22,78,62,tan)
    E(256,cy+55,52,38,(250,225,190))
    # eyes
    ph=(t*2)%1
    blink=0.1 if 0.46<ph<0.54 else 1
    for ex in (214,298):
        E(ex,cy-10,17,17*blink+1,(255,255,255))
        if blink>0.5:
            E(ex+2,cy-8,9,9,(35,22,14)); E(ex+5,cy-12,3,3,(255,255,255))
        else:
            d.line([(ex-17)*S,(cy-10)*S,(ex+17)*S,(cy-10)*S],fill=brd,width=4*S)
    # brows
    d.arc([190*S,(cy-52)*S,238*S,(cy-30)*S],200,340,fill=brd,width=4*S)
    d.arc([274*S,(cy-52)*S,322*S,(cy-30)*S],200,340,fill=brd,width=4*S)
    # nose + smile
    E(244,cy+42,5,4,brd); E(268,cy+42,5,4,brd)
    d.arc([226*S,(cy+48)*S,286*S,(cy+82)*S],20,160,fill=brd,width=4*S)
    return im.resize((W,W),Image.LANCZOS)
fr=[frame(i) for i in range(N)]
fr[0].save("flying-monkey-avatar.gif",save_all=True,append_images=fr[1:],duration=60,loop=0,optimize=True)
fr[0].save("flying-monkey-avatar-still.png")
fr[0].resize((250,250),Image.LANCZOS).save("flying-monkey-avatar-250.png")
m=Image.new("RGB",(1536,512))
for k,i in enumerate((0,9,18)): m.paste(fr[i],(k*512,0))
m.save("/tmp/claude-0/-home-user-gorilla-order-app/bb791f6b-ea47-5305-b708-28c5556fc2d3/scratchpad/monkey-check.png")
