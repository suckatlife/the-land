"""Audit user-facing copy in src/: lexical tells and sentence-length spread.

Two populations, labelled literally:

  ending cards  - the seven WORLD_ENDINGS descriptions. A closed, hand-checkable
                  set, and the population the proposal's argument rests on.
  main.ts prose - every sentence-shaped string literal in main.ts. A SUPERSET of
                  the in-world narration: it also contains HUD, archive, intro
                  and doorway copy. It is NOT "the narration" and must not be
                  cited as such. Extracting narration exactly means following
                  values through narrateEvent() and the event tables, which
                  static scanning does not do reliably.
"""
import re, sys
sys.path.insert(0, 'scripts')
from copy_tells import split_sentences, rhythm, report_lexical

def strip_comments(s):
    s = re.sub(r'^\s*//.*$', '', s, flags=re.M)
    return re.sub(r'/\*.*?\*/', '', s, flags=re.S)

def detemplate(lit):
    return ' '.join(re.sub(r'\$\{[^}]*\}', 'Xxxx', lit).split())

def ending_cards():
    s = strip_comments(open('src/endings.ts').read())
    return [detemplate(d) for d in re.findall(r"description: '([^']+)'", s)]

def main_prose():
    s = strip_comments(open('src/main.ts').read())
    out, seen = [], set()
    for lit in re.findall(r"[`'\"]([A-Z][^`'\"\n]{14,240}?[.!?])[`'\"]", s):
        if re.search(r'[<>]|https?:|=>|\{\s*kind|\|\||&&', lit):
            continue
        c = detemplate(lit)
        if c not in seen and re.search(r'[a-z]{3}\s+[a-z]', c):
            seen.add(c); out.append(c)
    return out

for name, lits in (('ending cards ', ending_cards()), ('main.ts prose', main_prose())):
    print(f"\n--- {name.strip()}")
    report_lexical("  lexical", " ".join(lits))
    rhythm("  rhythm ", [s for l in lits for s in split_sentences(l)], '-v' in sys.argv)
