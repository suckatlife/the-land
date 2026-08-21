import re,html,statistics,glob,sys
STYLE = set("""accentuates adept akin align aligning aligns amidst avenue avenues bolster bolstered bolstering broader burgeoning commendable compelling comprehend comprehensive crucial culminating delve delves delving discern discernible diverse elevate elevates elevating elucidate emphasizing encapsulates encompass encompassing enduring enhance enhancing ensuring evolving exceptional exhibits exploration facilitates fostering foundational garnered groundbreaking groundwork harness harnessing heighten highlighting illuminates impactful imperative innovative insights interconnectedness interplay intricacies intricate invaluable leveraging meticulous meticulously multifaceted nuanced nuances paving pinpoint pioneering pivotal poised pressing profound realm realms remarkable renowned revolutionize seamless seamlessly shedding showcasing solidify spanning streamline surpass swift swiftly tapestry testament thereby thorough transformative uncharted underexplored underscore underscores underscoring unlocking unparalleled unraveling unveil unveils utilize utilizing valuable versatility notably particularly additionally moreover furthermore""".split())
PUFF = ["boasts","vibrant","nestled","in the heart of","renowned","diverse array","natural beauty","commitment to","stands as","serves as","is a testament","underscores","reflects broader","indelible","deeply rooted","evolving landscape","setting the stage"]
def text_of(p):
    s=open(p).read()
    s=re.sub(r'<script.*?</script>','',s,flags=re.S); s=re.sub(r'<style.*?</style>','',s,flags=re.S)
    t=re.sub(r'<[^>]+>',' ',s); return html.unescape(t)
files=sorted(glob.glob('public/*/index.html'))+['index.html']
allsents=[]
print("FILE                          sents  meanLen  sdLen   style-words  puffery  neg-parallel  trailing-ing")
for f in files:
    t=" ".join(text_of(f).split())
    sents=[x.strip() for x in re.split(r'(?<=[.!?])\s+',t) if len(x.strip())>12]
    lens=[len(s.split()) for s in sents]
    if not lens: continue
    allsents+=sents
    low=t.lower()
    sw=[w for w in re.findall(r"[a-z']+",low) if w in STYLE]
    pf=[p for p in PUFF if p in low]
    neg=len(re.findall(r"\bnot (just |merely |only )?[^,.;]{1,40}, but\b|isn't [^,.;]{1,40},? (it's|but)|rather than", low))
    ting=len(re.findall(r",\s+\w+ing\b[^.]{0,60}\.", t))
    print(f"{f:28} {len(sents):5}  {statistics.mean(lens):6.1f}  {(statistics.pstdev(lens)):5.1f}   {len(sw):11} {str(pf)[:24]:>8}  {neg:12}  {ting:12}")
    if sw: print(f"    style words: {sorted(set(sw))}")
    if pf: print(f"    puffery: {pf}")
lens=[len(s.split()) for s in allsents]
print(f"\nALL PAGES: {len(allsents)} sentences, mean {statistics.mean(lens):.1f}, SD {statistics.pstdev(lens):.1f}")
print(f"length buckets: <8w={sum(1 for l in lens if l<8)}  8-15={sum(1 for l in lens if 8<=l<16)}  16-25={sum(1 for l in lens if 16<=l<26)}  26+={sum(1 for l in lens if l>=26)}")
