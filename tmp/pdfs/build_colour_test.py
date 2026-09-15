from pathlib import Path
import struct, io, hashlib, json
from PIL import Image, ImageDraw, ImageFont, ImageCms
from reportlab.pdfgen import canvas
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject as N, NumberObject as Num, ArrayObject as A, DictionaryObject as D, DecodedStreamObject, TextStringObject as T, RectangleObject

OUT=Path('output/pdf'); OUT.mkdir(parents=True,exist_ok=True)
stem='GardenShedGames-FOGRA39-colour-test'
icc=Path('C:/Windows/System32/spool/drivers/color/ISOcoated_v2_eci.icc').read_bytes()
W,H=1075,720
im=Image.new('CMYK',(W,H),(0,0,0,0)); draw=ImageDraw.Draw(im)
fontpath='C:/Windows/Fonts/arial.ttf'
def font(s): return ImageFont.truetype(fontpath,s)
def ink(v): return tuple(round(x*255/100) for x in v)
def label(x,y,s,size=16): draw.text((x,y),s,font=font(size),fill=(0,0,0,255))
label(72,64,'GardenShedGames',30)
label(72,103,'CMYK TEST  /  ISO Coated v2 (ECI)  /  FOGRA39',17)
label(72,133,'Ink values in %  |  85 x 55 mm trim  |  3 mm bleed  |  300 ppi',15)
levels=[0,10,25,50,75,90,100]
x0=148; cw=122
for j,v in enumerate(levels): label(x0+j*cw+40,170,str(v),16)
samples=[]
for row,name in enumerate(['C','M','Y','K']):
    y=195+row*61
    label(77,y+13,name,23)
    for col,v in enumerate(levels):
        values=[0]*4; values[row]=v
        x=x0+col*cw
        draw.rectangle((x,y,x+cw-5,y+49),fill=ink(values))
        samples.append((x+30,y+25,ink(values)))
label(72,444,'MIXES - C/M/Y/K',16)
mixes=[('Red',(0,100,100,0)),('Green',(100,0,100,0)),('Blue',(100,100,0,0)),('CMY grey',(50,40,40,0)),('K black',(0,0,0,100)),('Rich black',(60,40,40,100))]
for j,(name,values) in enumerate(mixes):
    x=72+j*155
    draw.rectangle((x,474,x+145,541),fill=ink(values))
    label(x,550,name,16)
    label(x,574,'/'.join(map(str,values)),14)
    samples.append((x+30,500,ink(values)))
label(72,621,'Compare the original file, downloaded proof and printed card.',16)
label(72,646,'Paper white = 0/0/0/0. Labels = 0/0/0/100. Keep embedded profile.',15)

# PSD v1, four 8-bit CMYK planes; Photoshop stores inverted CMYK samples.
def resource(rid,data):
    return b'8BIM'+struct.pack('>H',rid)+b'\0\0'+struct.pack('>I',len(data))+data+(b'\0' if len(data)%2 else b'')
resources=resource(1005,struct.pack('>IHHIHH',300<<16,1,2,300<<16,1,2))+resource(1039,icc)
# Non-printing Photoshop guides at the trim boundaries (positions in 1/32 pixels).
guides=[(round(3/91*W*32),0),(round(88/91*W*32),0),(round(3/61*H*32),1),(round(58/61*H*32),1)]
resources+=resource(1032,struct.pack('>IIII',1,576,576,len(guides))+b''.join(struct.pack('>IB',p,d) for p,d in guides))
header=b'8BPS'+struct.pack('>H',1)+b'\0'*6+struct.pack('>HIIHH',4,H,W,8,4)
planes=b''.join(ch.point(lambda x:255-x).tobytes() for ch in im.split())
psd=header+struct.pack('>I',0)+struct.pack('>I',len(resources))+resources+struct.pack('>I',0)+struct.pack('>H',0)+planes
(OUT/(stem+'.psd')).write_bytes(psd)

# Exact physical PDF size, one losslessly compressed ICCBased CMYK image.
mm=72/25.4; pw,ph=91*mm,61*mm
buf=io.BytesIO(); c=canvas.Canvas(buf,pagesize=(pw,ph)); c.showPage(); c.save()
writer=PdfWriter(); writer.append(PdfReader(buf)); page=writer.pages[0]
profile=DecodedStreamObject(); profile.set_data(icc); profile.update({N('/N'):Num(4),N('/Alternate'):N('/DeviceCMYK')}); pref=writer._add_object(profile)
img=DecodedStreamObject(); img.set_data(im.tobytes()); img.update({N('/Type'):N('/XObject'),N('/Subtype'):N('/Image'),N('/Width'):Num(W),N('/Height'):Num(H),N('/BitsPerComponent'):Num(8),N('/ColorSpace'):A([N('/ICCBased'),pref])})
iref=writer._add_object(img.flate_encode())
page[N('/Resources')]=D({N('/XObject'):D({N('/Test'):iref})})
content=DecodedStreamObject(); content.set_data(f'q {pw:.10f} 0 0 {ph:.10f} 0 0 cm /Test Do Q'.encode()); page[N('/Contents')]=writer._add_object(content)
page[N('/TrimBox')]=RectangleObject([3*mm,3*mm,88*mm,58*mm]); page[N('/BleedBox')]=RectangleObject([0,0,pw,ph])
intent=D({N('/Type'):N('/OutputIntent'),N('/S'):N('/GTS_PDFX'),N('/OutputConditionIdentifier'):T('FOGRA39'),N('/OutputCondition'):T('ISO Coated v2 (ECI)'),N('/RegistryName'):T('http://www.color.org'),N('/Info'):T('ISO Coated v2 (ECI), FOGRA39L'),N('/DestOutputProfile'):pref})
writer._root_object[N('/OutputIntents')]=A([writer._add_object(intent)])
writer.add_metadata({'/Title':'GardenShedGames - FOGRA39 CMYK colour test','/Author':'GardenShedGames','/Subject':'CMYK test strips; ISO Coated v2 (ECI); 85 x 55 mm trim plus 3 mm bleed'})
with (OUT/(stem+'.pdf')).open('wb') as f: writer.write(f)

# Independently decode PSD with Pillow and PDF image with pypdf.
with Image.open(OUT/(stem+'.psd')) as check:
    assert check.mode=='CMYK' and check.size==(W,H)
    assert check.tobytes()==im.tobytes()
    assert check.info['icc_profile']==icc
reader=PdfReader(OUT/(stem+'.pdf')); p=reader.pages[0]
obj=p['/Resources']['/XObject']['/Test']
assert obj.get_data()==im.tobytes()
assert obj['/ColorSpace'][1].get_object().get_data()==icc
assert reader.trailer['/Root']['/OutputIntents'][0].get_object()['/DestOutputProfile'].get_data()==icc
for x,y,value in samples: assert im.getpixel((x,y))==value
rgb=ImageCms.profileToProfile(im,ImageCms.ImageCmsProfile(io.BytesIO(icc)),ImageCms.createProfile('sRGB'),outputMode='RGB')
rgb.save('tmp/pdfs/colour-preview.png')
notes=f'''GardenShedGames colour test

Profile: ISO Coated v2 (ECI), based on FOGRA39L.
Source: installed C:/Windows/System32/spool/drivers/color/ISOcoated_v2_eci.icc
ICC SHA-256: {hashlib.sha256(icc).hexdigest()}
The exact same ICC bytes are embedded in both files.

PDF: exact 91 x 61 mm MediaBox/BleedBox, centred 85 x 55 mm TrimBox.
Lossless 8-bit ICCBased CMYK image and matching embedded output intent.
No crop marks, RGB objects or transparency. This is not certified PDF/X.
PSD: flattened, 8-bit CMYK, 1075 x 720 px, 300 ppi resolution metadata.
Non-printing guides mark the trim. At exactly 300 ppi the raster measures
91.0167 x 60.9600 mm because pixels must be whole numbers. The PDF places
that same raster at exactly 91 x 61 mm (about 300 ppi).

CMYK percentages are rounded to the nearest 8-bit sample (max error 0.196%).
Strips: C, M, Y and K at 0/10/25/50/75/90/100%; six labelled mixed patches.
Maximum ink coverage used: 240%. White bleed is intentional.

Use the PDF for the upload test; preserve the embedded profile if opening
the PSD. Compare a downloaded production proof against the original using
the same colour-managed viewer and inspect CMYK values/profiles where possible.
A changed screen preview alone does not establish that production ink values
changed. This test cannot prevent the printer from converting the document.
If instantprint supplied a specific ICC, use that exact file for a second test;
different profiles can use the same FOGRA39 characterisation data.

Verification: PSD independently reopened using Pillow; all CMYK samples and
embedded profile matched. PDF image samples and embedded profiles matched.
'''
(OUT/(stem+'-notes.txt')).write_text(notes)
print(notes)
