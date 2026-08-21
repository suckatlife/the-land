"""Measure the rhythm of user-facing prose in src/.

Sentence-length spread is the AI-writing tell with the cleanest evidence behind
it (PMC11422446: human prose scatters, LLM prose clusters at 10-30 tokens), so
that is what this reports.

Two populations, kept separate on purpose:
  * ending cards  - the seven WORLD_ENDINGS descriptions
  * narration     - lines that reach pushNarration(), including the templated
                    ones. An earlier version of this script dropped every
                    string containing ${...}, which silently excluded most
                    narration and included unrelated UI strings instead.
"""
import re, statistics, sys

def strip_comments(s):
    s = re.sub(r'^\s*//.*$', '', s, flags=re.M)
    return re.sub(r'/\*.*?\*/', '', s, flags=re.S)

def clean(lit):
    """Templated narration counts: ${civ.name} stands in for the word it becomes."""
    lit = re.sub(r'\$\{[^}]*\}', 'Xxxx', lit)
    return ' '.join(lit.split())

def endings():
    s = strip_comments(open('src/endings.ts').read())
    return [clean(m) for m in re.findall(r"description: '([^']+)'", s)]

def narration():
    """Strings in narration contexts: pushNarration(...) arguments and the
    pick([...]) arrays that feed them."""
    s = strip_comments(open('src/main.ts').read())
    out, seen = [], set()
    for m in re.finditer(r'pushNarration\(', s):
        # take the balanced-ish window after the call and pull its literals
        window = s[m.end(): m.end() + 900]
        for lit in re.findall(r"[`'\"]([^`'\"\n]{12,200}?)[`'\"]", window):
            if re.search(r'[<>]|https?:|^\w+$', lit):
                continue
            c = clean(lit)
            if c and c not in seen and re.search(r'[a-z]{3}\s', c):
                seen.add(c); out.append(c)
    return out

def report(name, lines):
    if not lines:
        print(f'{name}: none found'); return
    lens = [len(l.split()) for l in lines]
    sd = statistics.pstdev(lens)
    print(f'{name}: {len(lines)} lines | mean {statistics.mean(lens):.1f}w | SD {sd:.1f}')
    print(f'  buckets  <8w={sum(1 for l in lens if l<8)}  8-15={sum(1 for l in lens if 8<=l<16)}'
          f'  16-25={sum(1 for l in lens if 16<=l<26)}  26+={sum(1 for l in lens if l>=26)}')
    if '-v' in sys.argv:
        for l in sorted(lines, key=lambda x: len(x.split())):
            print(f'   {len(l.split()):3}w  {l}')

def prose_literals():
    """Every sentence-shaped literal in main.ts: starts uppercase, ends in
    terminal punctuation, contains a space. A superset of narration — it also
    catches HUD and archive strings — so it is reported separately rather than
    labelled as narration."""
    s = strip_comments(open('src/main.ts').read())
    out, seen = [], set()
    for lit in re.findall(r"[`'\"]([A-Z][^`'\"\n]{14,200}?[.!?])[`'\"]", s):
        if re.search(r'[<>{]|https?:', lit.replace('${', '\x00')) or '\x00' in lit:
            pass
        if re.search(r'[<>]|https?:', lit):
            continue
        c = clean(lit)
        if c and c not in seen and ' ' in c:
            seen.add(c); out.append(c)
    return out

report('ending cards       ', endings())
report('narration (direct) ', narration())
report('all prose literals ', prose_literals())
