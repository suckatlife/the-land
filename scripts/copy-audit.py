"""Audit the HTML pages: lexical tells, and sentence-length spread.

Prose is extracted per block element so sentence boundaries survive — replacing
every tag with a space merges headings, navigation and footers into adjacent
paragraphs and produces "sentences" that are nothing of the kind.
"""
import re, html, glob, statistics, sys
sys.path.insert(0, 'scripts')
from copy_tells import split_sentences, rhythm, report_lexical

BLOCKS = re.compile(r'<(p|li|h1|h2|h3|h4|blockquote|figcaption)\b[^>]*>(.*?)</\1>', re.S | re.I)

def blocks_of(path):
    s = open(path).read()
    s = re.sub(r'<script.*?</script>', '', s, flags=re.S)
    s = re.sub(r'<style.*?</style>', '', s, flags=re.S)
    out = []
    for _, inner in BLOCKS.findall(s):
        t = html.unescape(re.sub(r'<[^>]+>', ' ', inner))
        t = ' '.join(t.split())
        if len(t) > 12:
            out.append(t)
    return out

files = sorted(glob.glob('public/*/index.html')) + ['index.html']
all_sents, all_text = [], []
for f in files:
    blocks = blocks_of(f)
    sents = [s for b in blocks for s in split_sentences(b)]
    all_sents += sents
    all_text.append(" ".join(blocks))
    print(f"\n--- {f}")
    report_lexical("  lexical", " ".join(blocks))
    rhythm("  rhythm ", sents, '-v' in sys.argv)

print("\n=== all pages")
report_lexical("  lexical", " ".join(all_text))
rhythm("  rhythm ", all_sents)
