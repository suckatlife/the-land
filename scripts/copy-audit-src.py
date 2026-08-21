import re,statistics
srcs={'endings.ts':'src/endings.ts','main.ts':'src/main.ts','sim.ts':'src/sim.ts'}
# pull user-facing string literals: those with a space and sentence punctuation
pat=re.compile(r"[`'\"]([A-Z][^`'\"\n]{18,160}?[.!?])[`'\"]")
for name,p in srcs.items():
    s=open(p).read()
    s=re.sub(r'^\s*//.*$','',s,flags=re.M)          # strip line comments
    s=re.sub(r'/\*.*?\*/','',s,flags=re.S)
    lits=[m.group(1) for m in pat.finditer(s)]
    lits=[l for l in lits if not re.search(r'[{}<>]|\bconst\b|\bfunction\b|https?:',l)]
    if not lits: continue
    lens=[len(l.split()) for l in lits]
    print(f"=== {name}: {len(lits)} user-facing lines, mean {statistics.mean(lens):.1f}w, SD {statistics.pstdev(lens):.1f}")
    print(f"    buckets <8w={sum(1 for l in lens if l<8)} 8-15={sum(1 for l in lens if 8<=l<16)} 16-25={sum(1 for l in lens if 16<=l<26)} 26+={sum(1 for l in lens if l>=26)}")
