"""Shared vocabulary and helpers for the copy audits.

STYLE is the high-value subset (114 words) of the 407 that Kobak et al.
(Science Advances, 2025) classify as *style* rather than content — the ones with
the largest measured frequency shifts. Full list:
https://github.com/berenslab/llm-excess-vocab
"""
import re, statistics

STYLE = set("""accentuates adept akin align aligning aligns amidst avenue avenues bolster
bolstered bolstering broader burgeoning commendable compelling comprehend comprehensive
crucial culminating delve delves delving discern discernible diverse elevate elevates
elevating elucidate emphasizing encapsulates encompass encompassing enduring enhance
enhancing ensuring evolving exceptional exhibits exploration facilitates fostering
foundational garnered groundbreaking groundwork harness harnessing heighten highlighting
illuminates impactful imperative innovative insights interconnectedness interplay
intricacies intricate invaluable leveraging meticulous meticulously multifaceted nuanced
nuances paving pinpoint pioneering pivotal poised pressing profound realm realms
remarkable renowned revolutionize seamless seamlessly shedding showcasing solidify
spanning streamline surpass swift swiftly tapestry testament thereby thorough
transformative uncharted underexplored underscore underscores underscoring unlocking
unparalleled unraveling unveil unveils utilize utilizing valuable versatility notably
particularly additionally moreover furthermore""".split())

PUFF = ["boasts", "vibrant", "nestled", "in the heart of", "renowned", "diverse array",
        "natural beauty", "commitment to", "stands as", "serves as", "is a testament",
        "underscores", "reflects broader", "indelible", "deeply rooted",
        "evolving landscape", "setting the stage"]

NEG_PARALLEL = re.compile(
    r"\bnot (just |merely |only )?[^,.;]{1,40}, but\b|isn't [^,.;]{1,40},? (it's|but)|\brather than\b",
    re.I)
TRAILING_ING = re.compile(r",\s+\w+ing\b[^.]{0,60}\.")

def lexical(text):
    low = text.lower()
    return {
        "style": sorted({w for w in re.findall(r"[a-z']+", low) if w in STYLE}),
        "puffery": [p for p in PUFF if p in low],
        "neg_parallel": len(NEG_PARALLEL.findall(low)),
        "trailing_ing": len(TRAILING_ING.findall(text)),
    }

def split_sentences(block):
    block = ' '.join(block.split())
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', block) if len(s.strip()) > 3]

def rhythm(name, sents, verbose=False):
    lens = [len(s.split()) for s in sents]
    if not lens:
        print(f"{name}: none"); return
    print(f"{name}: {len(sents)} sentences | mean {statistics.mean(lens):.1f}w "
          f"| SD {statistics.pstdev(lens):.1f}")
    print(f"  buckets  <8w={sum(1 for l in lens if l<8)}  8-15={sum(1 for l in lens if 8<=l<16)}"
          f"  16-25={sum(1 for l in lens if 16<=l<26)}  26+={sum(1 for l in lens if l>=26)}")
    if verbose:
        for s in sorted(sents, key=lambda x: len(x.split())):
            print(f"   {len(s.split()):3}w  {s}")

def report_lexical(name, text):
    r = lexical(text)
    flag = lambda v: v if v else "0"
    print(f"{name}: style={flag(r['style'])}  puffery={flag(r['puffery'])}  "
          f"neg-parallel={r['neg_parallel']}  trailing-ing={r['trailing_ing']}")
