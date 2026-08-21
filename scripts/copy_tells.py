"""Shared vocabulary and helpers for the copy audits.

STYLE is the COMPLETE set of 410 words Kobak et al. (Science Advances, 2025)
classify as *style* rather than content, taken from
https://github.com/berenslab/llm-excess-vocab/blob/main/results/excess_words.csv
(900 rows; the style-typed subset). An earlier version of this file carried a
114-word hand-picked subset, which meant a zero result said nothing about the
other 293.
"""
import re, statistics

STYLE = set("""accentuates achieving acknowledges acknowledging across additionally address addresses
addressing adept adhered adhering advancement advancements advancing advocates
advocating affirming afflicted aiding aims akin align aligning aligns alongside amid
amidst analysis announced apologizes approach assess assessed assessing assessments
attains attributed augmenting avenue avenues based between bolster bolstered bolstering
both broader burgeoning capabilities capitalizing categorized categorizes categorizing
challenge challenges combating commendable compelling complex complicates complicating
comprehend comprehending comprehensive comprising conditions conducted consequently
consolidates contributing conversely correlating crafted crafting crucial culminating
customizing declare declared deductively delineates delve delved delves delving
demonstrated demonstrates demonstrating dependability dependable despite detailing
detrimentally diminishes diminishing discern discerned discernible discerning displaying
disrupts distinct distinctions distinctive diverse during easing effectively efficacy
elevate elevated elevates elevating elucidate elucidates elucidating embracing emerged
emerges emphasises emphasising emphasize emphasizes emphasizing employed employing
employs empowers emulating emulation enabling encapsulates encompass encompassed
encompasses encompassing endangering endeavors endeavours enduring enhance enhanced
enhancements enhances enhancing ensuring equipping escalating essentials evaluates
evolving exacerbating examines exceeding excels exceptional exceptionally exerting
exhibit exhibited exhibiting exhibits expedite expediting exploration explores
facilitated facilitates facilitating featuring fight findings focusing formidable
fostering fosters foundational furnish garnered garnering gauged grappling
groundbreaking groundwork hardest harness harnesses harnessing heighten heightened
highlight highlighting highlights hinder hinges hinting hold holds however identified
illuminates illuminating imbalances impact impactful impacting impede impeding
imperative impressive inadequately including incorporates incorporating indicating
individuals influencing inherent initially innovative inquiries insights integrates
integrating integration interconnectedness interplay into intricacies intricate
intricately introduces invaluable investigates involves involving juxtaposed leading
leverages leveraging like limitations linked maintaining merges methodologies meticulous
meticulously midst multifaceted necessitate necessitates necessitating necessity need
notable notably noteworthy nuanced nuances observed offer offering offers optimizing
orchestrating outcomes outlines overlook overlooking overwhelmed particularly paving
persist pinpoint pinpointed pinpointing pioneering pioneers pivotal poised pose posed
poses posing postponed potential potentially precise predominantly presents preserving
pressing prevalent primarily primary promise promising pronounced propelling providing
realizes realm realms recognizing refine refines refining reframing remains remarkable
renowned research resulting rethink revealed revealing reveals revolutionize
revolutionizing revolves role scrutinize scrutinized scrutinizing seamless seamlessly
seeks serves serving shaping shedding showcased showcases showcasing signifying solidify
spanned spanning specifically spurred standardizing stands statement stemming
strategically strategies streamline streamlined streamlines streamlining struggle
subsequently substantial substantiated substantiates surged surmount surpass surpassed
surpasses surpassing swift swiftly synthesizes techniques their thereby these this
thorough through transformative typically ultimately uncharted uncovering underexplored
underscore underscored underscores underscoring understanding unexplored unlocking
unparalleled unraveling unveil unveiled unveiling unveils uphold upholding urging using
utilized utilizes utilizing valuable various varying verifies versatility wandering
warranting were while within yielding""".split())

# The same list minus pronouns, prepositions, determiners and conjunctions.
# The paper measured frequency SHIFTS in abstracts, so its style set legitimately
# contains "this", "their" and "while" — words whose presence in ordinary prose
# means nothing. Raw membership is the wrong test; this is the usable instrument.
STYLE_CONTENT = set("""accentuates achieving acknowledges acknowledging additionally address addresses
addressing adept adhered adhering advancement advancements advancing advocates
advocating affirming afflicted aiding aims akin align aligning aligns analysis announced
apologizes approach assess assessed assessing assessments attains attributed augmenting
avenue avenues based bolster bolstered bolstering both broader burgeoning capabilities
capitalizing categorized categorizes categorizing challenge challenges combating
commendable compelling complex complicates complicating comprehend comprehending
comprehensive comprising conditions conducted consequently consolidates contributing
conversely correlating crafted crafting crucial culminating customizing declare declared
deductively delineates delve delved delves delving demonstrated demonstrates
demonstrating dependability dependable detailing detrimentally diminishes diminishing
discern discerned discernible discerning displaying disrupts distinct distinctions
distinctive diverse easing effectively efficacy elevate elevated elevates elevating
elucidate elucidates elucidating embracing emerged emerges emphasises emphasising
emphasize emphasizes emphasizing employed employing employs empowers emulating emulation
enabling encapsulates encompass encompassed encompasses encompassing endangering
endeavors endeavours enduring enhance enhanced enhancements enhances enhancing ensuring
equipping escalating essentials evaluates evolving exacerbating examines exceeding
excels exceptional exceptionally exerting exhibit exhibited exhibiting exhibits expedite
expediting exploration explores facilitated facilitates facilitating featuring fight
findings focusing formidable fostering fosters foundational furnish garnered garnering
gauged grappling groundbreaking groundwork hardest harness harnesses harnessing heighten
heightened highlight highlighting highlights hinder hinges hinting hold holds however
identified illuminates illuminating imbalances impact impactful impacting impede
impeding imperative impressive inadequately incorporates incorporating indicating
individuals influencing inherent initially innovative inquiries insights integrates
integrating integration interconnectedness interplay intricacies intricate intricately
introduces invaluable investigates involves involving juxtaposed leading leverages
leveraging limitations linked maintaining merges methodologies meticulous meticulously
multifaceted necessitate necessitates necessitating necessity need notable notably
noteworthy nuanced nuances observed offer offering offers optimizing orchestrating
outcomes outlines overlook overlooking overwhelmed particularly paving persist pinpoint
pinpointed pinpointing pioneering pioneers pivotal poised pose posed poses posing
postponed potential potentially precise predominantly presents preserving pressing
prevalent primarily primary promise promising pronounced propelling providing realizes
realm realms recognizing refine refines refining reframing remains remarkable renowned
research resulting rethink revealed revealing reveals revolutionize revolutionizing
revolves role scrutinize scrutinized scrutinizing seamless seamlessly seeks serves
serving shaping shedding showcased showcases showcasing signifying solidify spanned
spanning specifically spurred standardizing stands statement stemming strategically
strategies streamline streamlined streamlines streamlining struggle subsequently
substantial substantiated substantiates surged surmount surpass surpassed surpasses
surpassing swift swiftly synthesizes techniques thereby thorough transformative
typically ultimately uncharted uncovering underexplored underscore underscored
underscores underscoring understanding unexplored unlocking unparalleled unraveling
unveil unveiled unveiling unveils uphold upholding urging using utilized utilizes
utilizing valuable various varying verifies versatility wandering warranting were within
yielding""".split())

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
        "style": sorted({w for w in re.findall(r"[a-z']+", low) if w in STYLE_CONTENT}),
        "style_any": sorted({w for w in re.findall(r"[a-z']+", low) if w in STYLE}),
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
