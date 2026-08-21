"""Sentence-length spread of user-facing prose in src/.

Sentence-length dispersion is the AI-writing tell with the cleanest evidence
behind it (PMC11422446: human prose scatters, LLM prose clusters at 10-30
tokens). This measures SENTENCES, split the same way scripts/copy-audit.py
splits the HTML pages, so the two are comparable.

Two populations, and the labels are deliberately literal about what they are:

  ending cards   - the seven WORLD_ENDINGS descriptions. A closed, hand-checkable
                   set; this is the population the proposal's argument rests on.
  main.ts prose  - every sentence-shaped string literal in main.ts. A SUPERSET of
                   the in-world narration: it also contains HUD, archive and
                   intro copy. It is not "the narration" and is not labelled as
                   such. Extracting narration exactly would mean following values
                   through narrateEvent() and the event tables, which static
                   scanning does not do reliably - two earlier attempts here
                   produced populations that included code fragments and missed
                   most of the real lines.
"""
import re, statistics, sys

def strip_comments(s):
    s = re.sub(r'^\s*//.*$', '', s, flags=re.M)
    return re.sub(r'/\*.*?\*/', '', s, flags=re.S)

def sentences(lit):
    """Templated narration counts: ${civ.name} stands in for the word it becomes."""
    lit = ' '.join(re.sub(r'\$\{[^}]*\}', 'Xxxx', lit).split())
    return [s.strip() for s in re.split(r'(?<=[.!?])\s+', lit) if len(s.strip()) > 3]

def ending_cards():
    s = strip_comments(open('src/endings.ts').read())
    out = []
    for d in re.findall(r"description: '([^']+)'", s):
        out += sentences(d)
    return out

def main_prose():
    s = strip_comments(open('src/main.ts').read())
    out, seen = [], set()
    for lit in re.findall(r"[`'\"]([A-Z][^`'\"\n]{14,240}?[.!?])[`'\"]", s):
        if re.search(r'[<>]|https?:|=>|\{\s*kind|\|\||&&', lit):
            continue          # code fragments and markup, not copy
        for sent in sentences(lit):
            if sent in seen or not re.search(r'[a-z]{3}\s+[a-z]', sent):
                continue
            seen.add(sent); out.append(sent)
    return out

def report(name, sents):
    lens = [len(s.split()) for s in sents]
    if not lens:
        print(f'{name}: none'); return
    print(f'{name}: {len(sents)} sentences | mean {statistics.mean(lens):.1f}w '
          f'| SD {statistics.pstdev(lens):.1f}')
    print(f'  buckets  <8w={sum(1 for l in lens if l<8)}  8-15={sum(1 for l in lens if 8<=l<16)}'
          f'  16-25={sum(1 for l in lens if 16<=l<26)}  26+={sum(1 for l in lens if l>=26)}')
    if '-v' in sys.argv:
        for s in sorted(sents, key=lambda x: len(x.split())):
            print(f'   {len(s.split()):3}w  {s}')

report('ending cards ', ending_cards())
report('main.ts prose', main_prose())
