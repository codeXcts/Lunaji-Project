/* Lunaji core — the Forge's sound, spelling, stress and paradigm code, copied
   unchanged from Lunaji Forge build 2026-10-24-1614 for the read-only dictionary.
   Sections: inventory to generator, the verb word to phrase prosody, paradigm,
   and joinSuffix. Page wiring is dropped. Storage writes are switched off: the
   code below sees a localStorage whose setItem and removeItem do nothing.
   When the Forge's grammar changes, rebuild this file from the new Forge. */
window.LunajiCore = (function(localStorage){
const esc = t => String(t).replace(/&/g,"&amp;").replace(/</g,"&lt;");
/* ══════════ inventory ══════════ */
/* 2026-09-29 — ü is a modern vowel (R13, native: u before an i-syllable) and ö is
   loan-only (French eu). Proto still has five; the generator draws from VOW_W,
   which is unchanged, so neither is ever drawn. VOW is what the parser accepts. */
const VOW = "aeiouüö".split("");
const CONS = "pbtdkgmnfvszhrlwy".split("");
// Generator bias (Phonology §1.1, Lexicology §6): sonorant-weighted, soft obstruents.
// Frequency, not legality — CONS above is what's legal.
// 2026-10-02, recalibrated for the French–Japanese blend. Vowels were
// "aeiiooooouuuu": o was 38% of every draw, and o plus nasal vowels read as
// Portuguese. u is left alone — it feeds the codas and ü. t went from 1 to 3 of
// the table: both parent languages are t-heavy and Lunaji stood at 2%.
const CONS_W = "nnnnnmmmrrrrllllwwwyykkkkssszzhhpbtttdfgv".split("");   // t ×3 since 2026-10-02
const VOW_W  = "aaaeeeiiiiooouuuu".split("");                            // a3 e3 i4 o3 u4 since 2026-10-02
// Theme onset for verbs only: still sonorant-leaning, but evened out a little.
const THEME_W = "nnnnlllrrrmmmyywwbbddggvvkksszhptf".split("");
const OBSTRUENT = "pbtdkgfvsz", LIQUID = "rl";   // sh, j, ny are derived, never proto
/* Which obstruents may lead an onset cluster — Phonology §4.2 rule 6:
   pr br tr dr kr gr fr vr pl bl kl gl fl vl. NOT s or z. Aligned 2026-09-28:
   the Forge had been building sla / zra onsets the spec never allowed. With
   codas legal, s before a liquid goes to the coda instead — kas.la, not ka.sla.
   z is not coda-eligible, so z before a liquid is simply lost, as before. */
const CLUSTER_OB = "pbtdkgfv";
const NASAL_C = ["m","n","ɲ"];
const GLIDES = ["y","w"];
const isV = c => VOW.includes(c) || "ãẽĩõũ".includes(c);
// 2026-09-28. Phonology §4.1a — a liquid or s may close a syllable, word-internally.
const CODA_OK = "rls";
/* Orthography, Phonology §6. The engine works in the old `an in on` spelling
   internally, because every phonotactic regex below is written against it. The
   tilde is applied on the way out and undone on the way in, so the files the
   Forge reads and writes are tilde-spelled and nothing else had to change. */
const NAS_T = {a:"ã", i:"ĩ", o:"õ", e:"ẽ", u:"ũ"};
const T_NAS = {"ã":"an", "ĩ":"in", "õ":"on", "ẽ":"en", "ũ":"un"};
/* 2026-09-28, later — the nasal-seam apostrophe is dropped from the WRITTEN
   language. With nasality on the vowel, helãni, aoyãwa and shĩyu cannot be
   misread, so the mark had no job left. The engine still uses the n-form
   internally, where the apostrophe IS needed (shin'yu vs shinyu = ɲ), so toN()
   re-inserts it and toTilde() removes it. Old files carrying the apostrophe
   still load. The elision apostrophe (d'itsuze) is untouched: it follows a
   consonant, never a nasal vowel.
   2026-10-07 — that last sentence stopped being true: elision can now follow
   an n (üwikin'ila, Grammar §1b.4), and toTilde would read that n' as a nasal
   vowel. toTilde itself is unchanged, because the engine's n-form needs n'
   before a vowel to mean nasality. WRITTEN text goes through tildeSafe() or
   elisionSplit() instead, which take a token apart at its elisions first. */
const toTilde = w => typeof w === "string"
  ? w.replace(/([aeiou])n'/g, (m,v) => NAS_T[v])
     .replace(/([aeiou])n(?![aeiouüöãĩõyw'])/g, (m,v) => NAS_T[v])
     .replace(/([ãĩõẽũ])'/g, "$1")
  : w;
const toN = w => typeof w === "string"
  ? w.replace(/[ãĩõẽũ]'?(?=[aeiouüöãĩõẽũywn])/g, m => T_NAS[m[0]] + "'")
     .replace(/[ãĩõẽũ]'?/g, m => T_NAS[m[0]])
  : w;

/* ══════════ parse ══════════ */
function parse(str){
  const s = toN(str.trim().toLowerCase()).replace(/[^a-züö']/g,"");
  const w = []; let i = 0;
  while(i < s.length){
    let c = s[i];
    if(isV(c)){ /* no onset */ }
    else if(CONS.includes(c) || c==="j"){
      if(c==="j") c = "y";                       // J read as the glide
      w.push({t:"C", s:c}); i++;
    } else throw new Error("Unknown letter: " + s[i]);

    if(GLIDES.includes(s[i]) && isV(s[i+1])){ w.push({t:"G", s:s[i]}); i++; }

    if(!isV(s[i])) throw new Error("No vowel at position " + (i+1));
    w.push({t:"V", s:s[i], nasal:false}); i++;

    // n is a coda only if no vowel AND no glide follows — NY is onset n + y, feeding R8
    if(s[i]==="n" && !(isV(s[i+1]) || s[i+1]==="y" || s[i+1]==="w")){ w.push({t:"N", s:"n"}); i++; }
    if(s[i]==="'") i++;                          // internal seam mark from toN()
  }
  if(!w.length) throw new Error("Empty root");
  return syllabify(w);
}
function syllabify(w){
  let n = -1;
  for(const seg of w) if(seg.t==="V"){ n++; seg.syl = n; }
  return w;
}
const clone = w => w.map(x => Object.assign({}, x));

/* ══════════ R1 – R8 ══════════ */
// R1 — geminates and nasal clusters simplify (proto banned both)
function R1(w){
  let fired = false;
  for(let i=0;i<w.length-1;i++){
    const a=w[i], b=w[i+1];
    if(a.t==="N" && b.t==="C" && NASAL_C.includes(b.s)){ w.splice(i,1); fired=true; i--; continue; }
    if((a.t==="C"||a.t==="N") && b.t==="C" && a.s===b.s){ w.splice(i,1); fired=true; i--; }
  }
  return fired;
}
// R2 — unstressed prevocalic i/u becomes a glide. Blocked after r (Phonology §4.2.5)
function R2(w){
  let fired = false;
  for(let i=0;i<w.length-1;i++){
    const v=w[i];
    if(v.t!=="V" || v.syl===0 || v.nasal) continue;
    if(v.s!=="i" && v.s!=="u") continue;
    if(w[i+1].t!=="V") continue;
    const prev = w[i-1];
    // Phonology §4.2.5 — no w after a velar, a labiodental or r
    if(prev && prev.t==="C" && "rkgfv".includes(prev.s) && v.s==="u") continue;
    w[i] = {t:"G", s: v.s==="i" ? "y" : "w"};
    syllabify(w); fired = true;
  }
  return fired;
}
// R3 — unstressed u deletes, except word-finally
// R3 — unstressed u deletes, except word-finally, and never in front of a nasal vowel
function R3(w){
  let fired=false;
  for(let i=0;i<w.length;i++){
    const v=w[i];
    if(v.t==="V" && v.s==="u" && v.syl>0 && i!==w.length-1){
      // "between two consonants" is literal — KARUA keeps its u, nothing follows it but a vowel
      const lc = w[i-1] && w[i-1].t==="C", rc = w[i+1] && (w[i+1].t==="C" || w[i+1].t==="N");
      if(!lc || !rc) continue;
      /* Narrowed 2026-09-28. Phonology §4.2 rule 7 bans a complex ONSET in front
         of a nasal vowel, and before codas existed the survivor had nowhere to go
         but that onset, so every pre-nasal environment was blocked. Now a
         coda-eligible consonant becomes the coda of the PRECEDING syllable and
         nothing complex reaches the onset — so the block applies only where the
         survivor could not be a coda.
           NOKURAN   → nokuran   (k cannot be a coda; /krãː/ would be complex)
           MINOSUKAN → minoskan  (s becomes a coda; the onset is a plain k)      */
      const clusters = w[i+1].t==="C";
      const nextNasal = w[i+2] && w[i+2].t==="V" && w[i+3] && w[i+3].t==="N";
      const C1 = w[i-1].s, C2 = w[i+1].s;
      // Only a liquid, s, or an identical pair. A nasal C1 keeps the old blocking
      // behaviour deliberately: unblocking it would move nasal words like UMULIN.
      const codaEligible = CODA_OK.includes(C1) || (C1===C2 && !NASAL_C.includes(C1));
      if(clusters && nextNasal && !codaEligible) continue;
      w.splice(i,1); syllabify(w); fired=true; i--;
    }
  }
  return fired;
}
/* R4 — cluster resolution. Rewritten 2026-09-28; this rule was called "cluster
   cleanup" and under the old survivor list cleanup was mostly what it did.
   Two consonants left standing by R3 resolve by which two they are:
     obstruent + liquid  → both survive, as a complex ONSET      (TAPURA → tapra)
     C1 is a liquid or s → C1 survives as a CODA                 (MERUTA → merta)
     C1 = C2             → they fuse into a LONG consonant       (ATUTA → atta)
                           — but never r, h, a nasal or a glide (OWARURU → owaru)
     C1 is a nasal       → survives as a coda, feeding R5        (KANUTA → kanta)
     anything else       → C1 is lost                            (SATUNA → sana)
   Two things outrank all of it: a following coda n takes the one slot (FOLOGORUN),
   and a survivor that would end the word in a real consonant is lost (HIRUN).   */
function R4(w){
  let fired=false;
  for(let i=0;i<w.length-1;i++){
    const a=w[i], b=w[i+1];
    if(a.t!=="C") continue;
    if(b.t!=="C" && b.t!=="N" && b.t!=="K") continue;
    if(CLUSTER_OB.includes(a.s) && LIQUID.includes(b.s)) continue;  // complex onset — never s or z
    if(NASAL_C.includes(a.s) && !NASAL_C.includes(b.s)){ w[i]={t:"N",s:a.s}; fired=true; }
    else if(b.t==="N"){ w.splice(i,1); fired=true; i--; }           // the n wins the slot
    /* Identical consonants that may NOT fuse, so C1 is simply lost:
         a nasal — R1's precedent is that adjacent nasals collapse;
         r — ruled by ear 2026-09-28. A doubled tap is not a long tap, it is a
         trill [r], which the inventory does not have. Italian gets *carro*
         because its r is already a trill; Lunaji's is a tap, so a long one would
         smuggle a new phoneme in through R4. A long l is fine (Italian bello) —
         a lateral stays a lateral when you hold it. */
    else if(a.s===b.s && (NASAL_C.includes(a.s) || a.s==="r" || a.s==="h"
            || a.s==="y" || a.s==="w")){ w.splice(i,1); fired=true; i--; }
    else if(a.s===b.s){ w[i]={t:"K",s:a.s}; fired=true; }            // long consonant
    else if(CODA_OK.includes(a.s) && a.s==="r" && b.s==="r"){ w.splice(i,1); fired=true; i--; }
    else if(CODA_OK.includes(a.s) && !(w[i-1] && w[i-1].t==="K")){ w[i]={t:"K",s:a.s}; fired=true; }
    else { w.splice(i,1); fired=true; i--; }
    syllabify(w);
  }
  /* No long r, ruled by ear 2026-09-28. Two syncopes in one word can bring a coda
     r up against an onset r even when neither was an identical pair at the time,
     so the ban needs a pass of its own rather than a branch above. */
  for(let i=0;i<w.length-1;i++)
    if(w[i].t==="K" && w[i].s==="r" && w[i+1].t==="C" && w[i+1].s==="r"){
      w.splice(i,1); fired=true; i--;
    }
  /* Phonology §4.1a — a word may not end in a real consonant. A coda stranded at
     the end is dropped; this is why HIRUN gives hin and never *hir. */
  while(w.length && w[w.length-1].t==="K"){ w.pop(); fired=true; }
  syllabify(w);
  return fired;
}
// R5 — a coda nasal nasalizes the vowel before it and leaves its mora behind
function R5(w){
  let fired=false;
  for(let i=0;i<w.length;i++){
    if(w[i].t!=="N") continue;
    if(w[i+1] && w[i+1].t==="V"){ w[i]={t:"C", s:w[i].s}; fired=true; continue; }  // onset, not coda
    for(let k=i-1;k>=0;k--) if(w[k].t==="V"){ w[k].nasal=true; break; }
    w.splice(i,1); fired=true; i--;
  }
  /* No long r (ruled by ear 2026-09-28). Deleting the nasal segment above can
     bring a coda r up against an onset r that R4 never saw as a pair, so the
     ban needs a pass here as well as in R4. */
  for(let i=0;i<w.length-1;i++)
    if(w[i].t==="K" && w[i].s==="r" && w[i+1].t==="C" && w[i+1].s==="r"){
      w.splice(i,1); fired=true; i--;
    }
  syllabify(w);
  return fired;
}
// R6 — nasal vowels lower: ũ → õ and ẽ → ã. Three nasal vowels survive: ã ĩ õ
function R6(w){
  let fired=false;
  for(const s of w){
    if(s.t!=="V" || !s.nasal) continue;
    if(s.s==="u"){ s.s="o"; fired=true; }
    else if(s.s==="e"){ s.s="a"; fired=true; }
  }
  return fired;
}
// R7 — bookkeeping only. Nothing after this point may be conditioned by stress
function R7(){ return false; }
// R8 — s/z palatalize before i; n + y fuse to ɲ (n before w is untouched — cf. kanwe)
function R8(w){
  let fired=false;
  for(let i=0;i<w.length-1;i++){
    const a=w[i];
    // ZUIU → z·w·y·u: R2 glided both vowels, and only the last glide is ever
    // spelled or said. Drop the buried w so the s/z stands next to its y.
    if((a.t==="C"||a.t==="K") && (a.s==="s"||a.s==="z") && w[i+1].t==="G" && w[i+1].s==="w" &&
       w[i+2] && w[i+2].t==="G" && w[i+2].s==="y") w.splice(i+1,1);
    const b=w[i+1];
    if(a.t==="C" && (a.s==="s"||a.s==="z") && b.t==="V" && b.s==="i"){
      a.s = a.s==="s" ? "ʃ" : "ʒ"; fired=true;
    }
    if(a.t==="C" && a.s==="n" && b.t==="G" && b.s==="y"){ a.s="ɲ"; w.splice(i+1,1); fired=true; }
    /* 2026-10-03 — s and z palatalize before the glide y exactly as before the
       vowel i, and the glide is absorbed: SYODANMU → shodamu, IZYUBAN → ijubã.
       Phonology §4.2 rule 2, extended. /sj/ against /ʃ/ and /zj/ against /ʒ/ is
       a contrast one speaker cannot hold, so sy and zy never surface. */
    if(a.t==="C" && (a.s==="s"||a.s==="z") && b.t==="G" && b.s==="y"){
      a.s = a.s==="s" ? "ʃ" : "ʒ"; w.splice(i+1,1); fired=true;
      // sussyu-type: a long s in front of it has nothing left to be long with
      if(w[i-1] && w[i-1].t==="K" && w[i-1].s==="s"){ w.splice(i-1,1); i--; }
    }
    /* Ruled 2026-10-03 (later the same day): a CODA s before an onset y goes the
       same way — NONLASUYU → nõlashu, not /nõ.las.yu/. The coda is lost: the s
       becomes the onset sh and the glide is absorbed. Spelling could not tell
       las.yu from la.syu, so one rule covers both. */
    else if(a.t==="K" && a.s==="s" && (b.t==="G"||b.t==="C") && b.s==="y"){
      w[i] = {t:"C", s:"ʃ"}; w.splice(i+1,1); fired=true;
    }
  }
  return fired;
}

/* R13 — u-fronting. Added 2026-09-29, Proto R13 / Phonology §2.
   u → ü when the next syllable's vowel is i or ĩ. A word-final u has no next
   syllable, so the verb theme vowel is never touched. Ordered after R9: tsuri
   had already affricated and stays tsüri. A COMPLETED change — it does not
   re-fire across a suffix (kominuri keeps its u) or a modern compound seam, so
   it lives here, in the derivation of a proto root, and nowhere else.
   The front rounded vowel the French half of the blend was missing: the vowel of
   French tu and lune, produced by the Japanese weak vowel. */
function R13(w){
  let fired = false;
  for(let i=0;i<w.length;i++){
    const v = w[i];
    if(v.t!=="V" || v.s!=="u" || v.nasal) continue;
    let j = i+1; while(j<w.length && w[j].t!=="V") j++;
    if(j<w.length && w[j].s==="i"){ v.s = "ü"; fired = true; }
  }
  return fired;
}

/* R12 — sequential voicing at a compound seam. Added 2026-09-28, Phonology §4.3.
   The second element of a compound voices its initial obstruent, unless it
   already contains a voiced one (Lyman's Law). Japanese rendaku, producing the
   French half of the consonant inventory: /v z ʒ/ become productive.
   h does not participate — Japanese sends h → b only because its h descends
   from p, and Lunaji's h has no such history.
   Compound seams only: not a clitic, not a suffix, not a fused form.           */
const VOICE12 = [["sh","j"],["ts","z"],["p","b"],["t","d"],["k","g"],["s","z"],["f","v"]];
function compound(first, second){
  const a = toN(first), b = toN(second);
  if(/[bdgvz]|j(?![aeiou]?$)/.test(b.replace(/^(sh|ts|[ptksf])/, "")) ||
     /[bdgvz]/.test(b) || /j/.test(b.slice(1)))
    return toTilde(a + b);                         // Lyman's Law blocks it
  for(const [vl, vd] of VOICE12)
    if(b.startsWith(vl)) return toTilde(a + vd + b.slice(vl.length));
  return toTilde(a + b);                           // h, sonorants, vowels: no target
}
/* 2026-10-11 — Grammar §2.7, Phonology §4.3. The four seam cases. The join is
   made in the tilde spelling: in the n-form aoyã + wiõku would read aoyanwiõku,
   the n taken as the onset of nw. compound() above is kept as it was. */
function voiceHead(second){
  const b = toN(second);
  if(/[bdgvz]/.test(b) || /j/.test(b.slice(1))) return {w: second, lyman: true};
  for(const [vl, vd] of VOICE12)
    if(b.startsWith(vl)) return {w: toTilde(vd + b.slice(vl.length)), from: vl, to: vd};
  return {w: second};
}
const NASPART = {"ã":"a", "ĩ":"i", "õ":"o"};
const baseV = c => NASPART[c] || c;
function cpJoin(first, head){
  /* 2026-10-11 — one principle: the head is never touched; the first element
     gives way (Grammar §2.7, Phonology §4.3). */
  const a = first, h = head, cases = [];
  const aLast = a.slice(-1), hFirst = h.charAt(0);
  const aNas = !!NASPART[aLast], hV = startsV(h);
  const av = baseV(aLast), hv = baseV(hFirst);
  const same = hV && av === hv && "aeiou".includes(av);
  if(aNas && hV){
    cases.push({n: 2, t: "the nasal links into the vowel \u2014 " + a + " + " + h + " (Grammar \u00a71a)" +
      (same ? "; before its own vowel too, so no two identical vowels meet" : "")});
    return {w: toTilde(toN(a) + toN(h)), cases};
  }
  if(same){
    cases.push({n: 4, t: "two identical vowels: the first element\u2019s " + aLast + " drops, written joined with no apostrophe" + (aLast !== hFirst ? " \u2014 a nasal vowel counts as the same vowel" : ""), drop: true});
    return {w: a.slice(0, -1) + h, cases};
  }
  if(aLast === "u" && hv === "\u00fc"){
    cases.push({n: 4, t: "u and \u00fc count as the same vowel here: the first element\u2019s u drops", drop: true});
    return {w: a.slice(0, -1) + h, cases};
  }
  if("ou".includes(aLast) && "ou".includes(hv)){
    cases.push({n: "R11", t: "two back vowels merge by R11, and the head\u2019s " + hFirst + " survives", drop: true});
    return {w: a.slice(0, -1) + h, cases};
  }
  if(aLast === "o" && hv === "\u00fc"){
    cases.push({n: "o + \u00fc", t: "the first element\u2019s o gives way before the head\u2019s \u00fc, which belongs to the head (ruled by the speaker 2026-10-11)", drop: true});
    return {w: a.slice(0, -1) + h, cases};
  }
  if(hV) return {w: a + h, cases};
  const v = voiceHead(h);
  if(v.lyman && /^(sh|ts|[ptksf])/.test(toN(h))) cases.push({n: 1, t: "no voicing \u2014 Lyman\u2019s Law: " + h + " already holds a voiced obstruent"});
  else if(v.from) cases.push({n: 1, t: "R12 voices the head\u2019s first obstruent: " + v.from + " \u2192 " + v.to});
  if(aNas && /^[mn]/.test(h)) cases.push({n: 3, t: "a nasal vowel before a nasal consonant \u2014 legal at a compound seam (Phonology \u00a74.2 rule 3)"});
  return {w: a + v.w, cases};
}
const caseName = x => typeof x.n === "number" ? "case " + x.n : x.n;

const RULES = [
  ["R1","geminate / nasal cluster",R1],
  ["R2","glide formation",R2],
  ["R3","u-weakening",R3],
  ["R4","cluster cleanup",R4],
  ["R5","nasalization",R5],
  ["R6","ũ → õ",R6],
  ["R7","stress bookkeeping",R7],
  ["R8","palatalization",R8],
  ["R13","u-fronting",R13]
];

/* ══════════ render ══════════ */
const SPELL = {"ʃ":"sh","ʒ":"j","ɲ":"ny"};
function spell(w){
  let out="";
  const sy = syllables(w);
  sy.forEach((s,i)=>{
    if(i>0){
      const prevV = sy[i-1].v;
      // Phonology §6. A nasal vowel takes an apostrophe before a bare vowel, and
      // — ruled 2026-09-10 — before a bare glide too: ny and nw are already the
      // digraphs for ɲ and for onset n + w, so shinyu would read as /ʃi.ɲu/.
      // A bare glide is parsed as an onset, so test for it explicitly.
      // 2026-09-28 — a real coda already separates them, so the mark is not needed:
      // shĩl.yu cannot be misread as ɲ the way shĩ.yu could.
      // (the nasal-seam apostrophe was written here until 2026-09-28 — no longer
      //  needed with nasality on the vowel; toN() restores it internally)
    }
    // R9 — t affricates before u, and so before the ü that R13 later made of it
    const tsu = s.onset==="t" && !s.glide && (s.v.s==="u" || s.v.s==="ü") && !s.v.nasal;
    if(s.onset) out += tsu ? "ts" : s.onset.split("").map(c=>SPELL[c]||c).join("");
    if(s.glide) out += s.glide.s;
    out += s.v.nasal ? NAS_T[s.v.s] : s.v.s;   // Phonology §6 — the tilde
    if(s.coda) out += s.coda;                    // 2026-09-28 — merta, kaspo, atta
  });
  return out;
}
/* spell() is tilde-spelled, which is what the lexicon file stores and what the
   person reads. A few helpers below carry phonotactic regexes written against
   the older `an in on` form; each of those normalizes its input with toN(). */
const spellN = w => toN(spell(w));
// IPA for the two front rounded vowels — ü is /y/, ö is /ø/ (Phonology §2)
const OVIPA = {"ü":"y", "ö":"ø"};
function ipa(w){
  const sy = syllables(w);
  /* Phonology §5, rewritten 2026-09-28 — the accent falls on the last HEAVY
     syllable, or on the final syllable where there is none. Heavy is a nasal
     vowel, a closed syllable, or the first half of a long consonant.
     NOTE: the accent belongs to the PHRASE, not the word. What is marked here is
     where it falls when the word stands alone as a phrase, which is how a
     citation form is said. Inside a longer phrase it may carry no accent at all.
     Use phraseAccent() for a whole phrase. */
  let str = -1;
  sy.forEach((s,i)=>{ if(isHeavy(s)) str = i; });
  if(str < 0) str = sy.length - 1;
  const NAS = {a:"ã",e:"ẽ",i:"ĩ",o:"õ",u:"ũ"};
  return sy.map((s,i)=>{
    let o = (i===str ? "ˈ" : "");
    const tsu = s.onset==="t" && !s.glide && (s.v.s==="u" || s.v.s==="ü") && !s.v.nasal;
    if(s.onset) o += tsu ? "ts"
      : s.onset === "ny" ? "ɲ"
      : s.onset.split("").map(c => c==="r" ? "ɾ" : c==="y" ? "j" : c).join("");
    if(s.glide) o += s.glide.s==="y" ? "j" : "w";
    o += s.v.nasal ? NAS[s.v.s]+"ː" : (OVIPA[s.v.s] || s.v.s);
    if(s.coda) o += s.coda === "r" ? "ɾ" : s.coda;
    return o;
  }).join(".");
}
/* Phonology §5 — the accent is assigned over a phrase: a noun with its clitics,
   or the verb complex with its post-verbal tail. Give it the phrase's syllables
   in order and it returns the index that carries the beat. */
function phraseAccent(sy){
  for(let i=sy.length-1;i>=0;i--) if(isHeavy(sy[i])) return i;
  return sy.length - 1;
}
function syllables(w){
  const out=[]; let cur={onset:"",glide:null,v:null,coda:""};
  for(const seg of w){
    if(seg.t==="C") cur.onset += seg.s;          // clusters accumulate into one onset
    else if(seg.t==="G") cur.glide = seg;
    else if(seg.t==="V"){ cur.v = seg; out.push(cur); cur={onset:"",glide:null,v:null,coda:""}; }
    // 2026-09-28 — a real coda closes the syllable already emitted
    else if(seg.t==="K" && out.length) out[out.length-1].coda = seg.s;
  }
  return out;
}
// Phonology §5 — heavy means a nasal vowel, a closed syllable, or the first half
// of a long consonant. All three take a mora and all three attract the accent.
const isHeavy = s => Boolean(s.v.nasal || s.coda);
/* Phonology §5 — oral vowel 1, nasal vowel 2, coda 1, first half of a long
   consonant 1. Glides and complex onsets add nothing. Updated 2026-09-28. */
const moras = w => w.reduce((n,s)=> n + (s.t==="V" ? (s.nasal?2:1) : s.t==="K" ? 1 : 0), 0);

/* ══════════ derive ══════════ */
function derive(rootStr){
  let w = parse(rootStr);
  const steps = [];
  for(const [id,name,fn] of RULES){
    const fired = fn(w);
    steps.push({id,name,fired,form:spell(w)});
  }
  return {word:w, steps, spelling:spell(w), spellingN:spellN(w), ipa:ipa(w), moras:moras(w)};
}

/* ══════════ legality ══════════ */
const LEX_SEED = {
  /* function words */
  "a":["topic particle","func"],"na":["that; this — demonstrative","func"],
  "ba":["subject particle","func"],"ni":["object particle","func"],
  "pe":["possessive particle","func"],"wa":["location particle","func"],
  "di":["oblique particle","func"],"toma":["from","func"],
  "hena":["not (on a noun); no","func"],
  "ta":["plural, animates only","suffix"],"ze":["past tense","suffix"],
  "ri":["ongoing aspect","suffix"],"ena":["negation, before the tense","suffix"],
  "bi":["can — ability","suffix"],"du":["want to — desire","suffix"],
  "la":["evidential — direct non-visual","func"],"po":["evidential — inference","func"],
  "ke":["evidential — assumption","func"],"jin":["question particle","func"],
  "noron":["but; and yet","func"],"oyan":["might; maybe","func"],
  /* 2026-10-07 — aspect stands in front of the verb (Grammar §4.2). byõ and lõ,
     the auxiliary verbs that used to follow it, are retired. */
  "ila":["completed aspect — particle before the verb","func"],
  "zoka":["habitual aspect — particle before the verb","func"],
  /* 2026-10-11 — Grammar §2.6, §4.11, §6 */
  "vu":["to be ___ed — state ending, makes a verb","suffix"],
  "ga":["one who ___ — agent ending, makes a noun","suffix"],
  "puso":["or — stands between the two things it joins","func"],
  /* 2026-10-12 — Grammar §5.4. The one preposition; toma is "from" only. */
  "kügi":["than — the one preposition; stands before the standard","func"],
  /* numbers */
  "zo":["1","func"],"van":["2","func"],"ki":["3","func"],"ra":["4","func"],"bai":["5","func"],
  "baizo":["6","func"],"baivan":["7","func"],"baiki":["8","func"],"baira":["9","func"],
  "gonte":["10","func"],"zero":["0 — loanword","func"],
  "re":["counter — animate","suffix"],"ko":["counter — inanimate","suffix"],
  /* pronouns */
  /* 2026-10-11 — the pronouns redrawn 2026-09-18 (Grammar §3.1) */
  "nuswa":["I","pron"],"lwaji":["you","pron"],"nwoli":["he, she — animate","pron"],
  "luswazo":["we — inclusive","pron"],"nuswata":["we — exclusive","pron"],
  /* verbs */
  "hin":["to exist — animate","irreg"],"yozu":["to exist — inanimate","verb"],
  "inku":["to exist — unknown","verb"],"gu":["was, were — past copula","verb"],
  "kominu":["to be tired","verb"],"inoyu":["to be dark","verb"],
  "nialipu":["to stir; to move slightly","verb"],"kazon":["to come","irreg"],
  "kyonku":["to hear","verb"],"sofu":["to see","verb"],
  "nowiretsu":["to be awake alongside someone","verb"],
  "wionku":["to sleep","verb"],
  /* nouns */
  "helan":["person","pnoun"],"nowireta":["company; the ones with you","dnoun"],
  "onankonzan":["the dead of night","pnoun"],"noaye":["the wind","pnoun"],
  "tsüri":["a doctor","pnoun"],"üwiki":["the moon","pnoun"],"lonji":["night","pnoun"],
  "akyoza":["a name","pnoun"],"aoyan":["a road","pnoun"],"ani":["a flower","pnoun"],
  "hiba":["a trace","pnoun"],"fanvonedi":["a dream","pnoun"],"okison":["silence","pnoun"],
  "omime":["a door","pnoun"],"vanonla":["hello; a greeting","dnoun"],
  "shin'yu":["to go; to leave","verb"],
  "shin'ya":["goodbye","dnoun"],
  "dan":["yes","func"],"jo":["diminutive suffix","suffix"],
  "yeti":["complement nominalizer","func"],"uan":["as ... as","func"],
  "onu":["to say","verb"],"kuwanu":["to know","verb"],"howeru":["to be good","verb"],
  "nonyeti":["a thing","pnoun"],"puan":["a likeness","pnoun"],
  "sainko":["a house","pnoun"],"kunwe":["the sky","pnoun"],
  "onkiwe":["a bed","pnoun"],"wokonya":["daytime","pnoun"],
  "muman":["a bird","pnoun"],"zwawashi":["a window","pnoun"],
  "hotori":["a spouse","pnoun"],
  "telefon":["a telephone","pnoun"],
  "monzo":["who — animate interrogative","pnoun"],
  "emose":["what — inanimate interrogative","pnoun"],
  "heni":["Lunaji — the endonym","pnoun"]
};
/* Words that were coined and then withdrawn. Not collisions — a soft warning,
   so a shape that has already been rejected once is recognised on sight. */
/* 2026-10-11 — ga came off this list: the old pronoun "I" was retired, and the
   same shape is now the live agent ending -ga (Grammar §2.6). The list is kept
   in the spelling each word was retired in; isRetired() reads both. */
const RETIRED = ["vwetsu","vweta","sen","lomen","loman","wi","gawi","gata","ishi",
  "bu","zu","sami","fona","fyemyoi","romon","viku","vika","ka","ken","nokuran","kanuwan",
  "tsunoman","helimon","ivelan","sonurema","peduran","imon","solan","weseru","lebru",
  "nyobru","soblu","moturon","tapra","hira","mira","nemu","isha","kwanshi","numu","kyiso",
  "byõ","lõ"];

const RETKEY = "lunaji-retired", DIRTYKEY = "lunaji-dirty";
let RET = {};
try{ RET = JSON.parse(localStorage.getItem(RETKEY) || "{}"); }catch(e){ RET = {}; }
let RETIRED_T = null;   // the built-in list in the tilde spelling, made on first use
const isRetired = w => {
  if(!RETIRED_T) RETIRED_T = new Set(RETIRED.map(r => toTilde(r)));
  return RETIRED.includes(w) || RETIRED_T.has(w) || Object.prototype.hasOwnProperty.call(RET, w);
};
let DIRTY = {};
try{ DIRTY = JSON.parse(localStorage.getItem(DIRTYKEY) || "{}"); }catch(e){ DIRTY = {}; }
function setDirty(k, v){
  DIRTY[k] = v;
  try{ localStorage.setItem(DIRTYKEY, JSON.stringify(DIRTY)); }catch(e){}
  if(typeof paintDirty === "function") paintDirty();
}
const saveRet = () => { try{ localStorage.setItem(RETKEY, JSON.stringify(RET)); }catch(e){} setDirty("lex", true); };
const LEXKEY = "lunaji-lex";
let LEX = {}, SUFFIX = null;
// the Composer's class vocabulary is canonical, since both tools now read one store
const CMAP = {pnoun:"noun", dnoun:"noun", verb:"verb", adjv:"verb", irreg:"verb", aux:"aux",
              func:"case", pron:"pron", suffix:"case", any:"noun"};
/* 2026-09-28 — the lexicon is tilde-spelled. Anything arriving in the old
   `an in on` form (an older export, the built-in seed, a hand-typed word) is
   converted on the way in, so both spellings load and only one is stored. */
/* 2026-10-01. Only ã ĩ õ exist. An old en / un spelling is ã / õ — what R6 did
   to native words and what Borrow's inventory repair does to loans. toTilde
   alone gave dẽshimero and jitẽsha; this is the spelling a stored word gets. */
const fixNasal = w => typeof w === "string" ? toTilde(w).replace(/ẽ/g, "ã").replace(/ũ/g, "õ") : w;
/* 2026-10-03. sy → sh and zy → j (Phonology §4.2 rule 2). The t guard keeps the
   affricate ts apart: ts never stands before y, but the letters could. No
   lookbehind, so it runs on any phone. */
const palSpell = w => typeof w === "string" ? w.replace(/(^|[^t])sy/g, "$1sh").replace(/zy/g, "j") : w;
const hasSyZy = w => /(^|[^t])sy|zy/.test(w);
const respell = w => palSpell(fixNasal(w));
function lexKeys(o){
  if(!o || typeof o !== "object" || Array.isArray(o)) return o;
  const out = {};
  for(const k in o){ const t = fixNasal(k); if(!(t in out) || t === k) out[t] = o[k]; }
  return out;
}
function tildeKeys(o){
  if(!o || typeof o !== "object") return o;
  if(Array.isArray(o)) return o.map(toTilde);
  const out = {}; for(const k in o) out[toTilde(k)] = o[k]; return out;
}
/* Seed words the language has since replaced. "Add any missing built-in words"
   used to put these straight back — and in the old n-spelling, beside the tilde
   forms. Fixed 2026-09-29. */
const SEED_SUPERSEDED = ["gan","win","ishin","ganwin","ganta","sofou","uwiki","tsuri"];
function seedObj(){
  const o = {};
  for(const w in LEX_SEED) o[toTilde(w)] = {g:LEX_SEED[w][0], c:CMAP[LEX_SEED[w][1]] || "noun", real:true};
  return o;
}
function loadLex(){
  try{
    const raw = localStorage.getItem(LEXKEY);
    const v = raw ? JSON.parse(raw) : null;
    if(v && v.LEX){ LEX = v.LEX; SUFFIX = v.SUFFIX || null; }
    else LEX = seedObj();
  }catch(e){ LEX = seedObj(); }
}
function saveLex(){
  try{ localStorage.setItem(LEXKEY, JSON.stringify(SUFFIX ? {LEX, SUFFIX} : {LEX})); setDirty("lex", true); }
  catch(e){ /* storage unavailable — the export box is the fallback */ }
}
loadLex();
const COINED = { includes: w => Object.prototype.hasOwnProperty.call(LEX, w) };
function check(res, cls){
  const w = res.word, t = [];
  const last = w[w.length-1];
  t.push(last && last.t==="V"
    ? {ok:true, s:"ends in a vowel"} : {ok:false, s:"does not end in a vowel"});
  if(w.some(s=>s.t==="N")) t.push({ok:false, s:"nasal coda survives — R5 failed"});
  /* 2026-09-28 — a real coda is legal word-internally (Phonology §4.1a) and never
     word-finally. R4 already drops a stranded one; this catches a hand-typed form. */
  if(last && last.t==="K") t.push({ok:false, s:"word ends in a real consonant (Phonology §4.1a)"});
  for(let i=0;i<w.length;i++){
    const s = w[i];
    if(s.t!=="K") continue;
    const geminate = w[i+1] && w[i+1].t==="C" && w[i+1].s===s.s;   // first half of a long C
    if(!geminate && !CODA_OK.includes(s.s))
      t.push({ok:false, s:"illegal coda \u2014 a standalone coda is a liquid or s only"});
    if(geminate && (NASAL_C.includes(s.s) || "rhyw".includes(s.s)))
      t.push({ok:false, s:"this consonant cannot be held long"});
  }
  // ruled by ear 2026-09-28 — a doubled tap is a trill, and there is no trill
  if(/rr/.test(toN(spell(w)))) t.push({ok:false, s:"long r \u2014 a doubled tap is a trill, which the inventory has no"});
  for(let i=0;i<w.length-1;i++){
    if(w[i].t==="C" && w[i+1].t==="C" && !(CLUSTER_OB.includes(w[i].s) && LIQUID.includes(w[i+1].s)))
      t.push({ok:false, s:"illegal cluster — only obstruent + liquid survives as an onset"});
    if(w[i].t==="C" && "rkgfv".includes(w[i].s) && w[i+1].t==="G" && w[i+1].s==="w")
      t.push({ok:false, s:"w after a velar, labiodental or r (Phonology §4.2.5)"});
    if(w[i].t==="C" && (w[i].s==="s"||w[i].s==="z") && w[i+1].t==="V" && w[i+1].s==="i")
      t.push({ok:false, s:"s/z before i survived R8"});
  }
  // Phonology §4.2.7 — a cluster onset and a nasal vowel may not share a syllable
  if(syllables(w).some(s=>s.onset.length>1 && s.v.nasal))
    t.push({ok:false, s:"cluster onset on a nasal syllable (Phonology §4.2.7)"});
  t.push({ok:true, s: res.moras + " mora" + (res.moras===1?"":"s")});
  const spT = res.spelling;                 // tilde — how the lexicon is keyed
  const sp  = res.spellingN || toN(spT);    // n-form — what the regexes below expect
  // a glide before its own vowel is inaudible — /yi/ and /wu/. nyi is banned separately, just below.
  // Phonology §4.1b — no oral length, so /o.o/ cannot be heard as two beats
  if(/([aeiouüö])\1/.test(sp)) t.push({ok:false, s:"identical-vowel hiatus — unrecoverable without oral length"});
  // R11, running since 2026-09-18: /o.u/ and /u.o/ collapse in speech, so a word
  // coined with one would be undone the moment it was said.
  if(/ou|uo/.test(sp)) t.push({ok:false, s:"back-rounded hiatus (ou/uo) — R11 collapses it: sofou → sofu"});
  // Phonology §4.2 rule 3 — no nasal vowel before a nasal consonant inside a word
  if(/[aeiou]n(?:n|m)/.test(sp) || /[aeiou]nny/.test(sp)) t.push({ok:false, s:"nasal vowel before a nasal consonant (Phonology §4.2.3)"});
  if(/[yw][yw]/.test(sp.replace(/ny/g,"N"))) t.push({ok:false, s:"two glides in a row"});
  if(/(^|[^n])yi/.test(sp) || /wu/.test(sp))
    t.push({ok:false, s:"glide before its own vowel (/yi/, /wu/) — inaudible"});
  // 2026-10-06: Phonology §4.2 rule 7a banned nyi on 2026-09-11 — /ɲi/ against
  // /ni/ is a contrast one speaker cannot hold. The line above was written the
  // day before and exempted it; nokinyi and dononyi came through that gap.
  if(/nyi/.test(sp))
    t.push({ok:false, s:"nyi does not occur — /ɲi/ against /ni/ cannot be held (Phonology §4.2 rule 7a)"});
  if(cls && cls!=="any" && cls!=="func"){
    const endsU = /u$/.test(sp), endsNas = /[aio]n$/.test(sp), endsA = /a$/.test(sp);
    const nasalEnd = endsNas;
    if(cls==="verb" || cls==="adjv")  t.push(endsU ? {ok:true,s:"verb theme –u"}
                            : endsNas ? {ok:true,s:"verb — nasal-final, a regular class (Lexicology §1.2)"}
                            : {ok:false,s:"not a verb: needs final –u or a nasal vowel"});
    if(cls==="irreg") t.push(endsNas ? {ok:true,s:"nasal-final verb"} : {ok:false,s:"not a nasal-final verb"});
    if(cls==="dnoun") t.push(endsA ? {ok:true,s:"deverbal –a"} : {ok:false,s:"not a deverbal noun: needs final –a"});
    if(cls==="pron" && endsU) t.push({ok:false,s:"a pronoun may not end in –u"});
    if(cls==="pnoun") t.push(!endsU ? {ok:true,s:nasalEnd?"primary noun, nasal-final":"primary noun"}
                                    : {ok:false,s:"nouns may never end in –u"});
  }
  if(COINED.includes(spT)) t.push({ok:false, s:"collides with " + spT + " — " + LEX[spT].g});
  else if(isRetired(spT)) t.push({ok:false, s:"this shape was retired once already"});
  return t;
}

/* ══════════ generator ══════════ */
const pick = a => a[Math.floor(Math.random()*a.length)];
function weighted(pairs){
  const tot = pairs.reduce((n,p)=>n+p[1],0); let r = Math.random()*tot;
  for(const [v,wt] of pairs){ r -= wt; if(r<=0) return v; }
  return pairs[0][0];
}
// All six shapes stay reachable (Phonology §4.1). Weights are a design choice — edit them.
/* 2026-09-29 — consonant + glide leans to y. Cy (kya, ryo, nyu, hyo) is a
   Japanese signature; Cw after a consonant (nuswa, lwaji, zwawashi) was reading
   as Bantu. w stays fully legal and still turns up about one draw in four; this
   is frequency, not a ban. A bare glide with no consonant (wa, yo) is untouched. */
const CG_GLIDE = [["y",3],["w",1]];
const SHAPES = [["CV",48],["CVN",14],["CGV",10],["V",13],["VN",8],["GV",7]];
function makeSyllable(shape, prevSeg){
  let s = "";
  if(shape[0]==="C"){
    let c; let guard=0;
    do { c = pick(CONS_W); guard++; } while(guard<20 && prevSeg && c===prevSeg);
    s += c;
  }
  if(shape[0]==="C" && shape[1]==="G"){
    const c = s[s.length-1];
    const g = "rkgfv".includes(c) ? "y" : weighted(CG_GLIDE);   // no w after velar, labiodental or r
    if(g!==c) s += g;
  }
  else if(shape[0]==="G") s += pick(GLIDES);
  const gl = s[s.length-1];
  let v; let vg=0;
  do{ v = pick(VOW_W); vg++; }
  while(vg<30 && ((gl==="y"&&v==="i")||(gl==="w"&&v==="u")));   // no yi, no wu
  s += v;
  if(shape.endsWith("N")) s += "n";
  return s;
}
const IRREG_RATE = 0.25;   // share of verb draws given a nasal proto final
/* Lexicology §6, added 2026-09-28. A syllable that is neither the first nor the
   last is drawn as {r|l|s} + u, no coda, with this probability. That is the
   entire source of the coda environment — R3 deletes the u and R4 turns the
   consonant into a coda. Nothing else about the draw changed.
   Tuned against this generator over 30,000 draws, at the real syllable-count
   distribution. The standalone model used to set the spec ran hotter per unit of
   bias, so the spec's 0.30 lands here as 0.16:

     bias   coda%   cluster%   longC%   mean syllables
     0.00     5.4       0.9       0.6        2.99
     0.14    17.7       2.1       1.7        2.85
     0.16    19.8       2.1       2.0        2.84      <- set
     0.20    23.1       2.4       2.2        2.80

   One word in five carries a coda, clusters roughly double off a very low base,
   and mean root length falls by about a sixth of a syllable.

   CONFIRMED BY EAR, 2026-09-28. kilsu and nõlasyu were said aloud — the first
   closed syllables ever spoken in the language — and judged to sound like
   Lunaji. Lexicology §6 step 6, on the new texture rather than on a word. The
   same session rejected the long r.

   RECALIBRATED 2026-10-02 for the French–Japanese blend (Lexicology §6).
   - CODA_BIAS 0.16 → 0.14, to make room for the two branches below.
   - CLUSTER_SEED 0.08. In a four-syllable root the second syllable is drawn as
     {p t k b d g f} + u and the next syllable's onset is forced to r or l
     (r only after t and d — Phonology §4.2 rule 6 has no tl or dl). R3 deletes
     the u and R4 leaves an obstruent + liquid onset: TAPURA → tapra.
   - LONG_SEED 0.05. Same position: {p t k s} + u, and the next syllable's onset
     is forced to the same consonant. R3 and R4 fuse them: ATUTA → atta.
   - The forced syllable is plain CV or CVn and never takes u, so R3 cannot
     delete it and pile three consonants together.
   - Order in the medial branch: coda bias, cluster seed, long seed, normal draw.
   - VOW_W "aeiiooooouuuu" → "aaaeeeiiiiooouuuu"; CONS_W gained two t.
   Clusters, codas and long consonants are still never drawn directly — every
   one is produced by R3 and R4 from an open-syllable proto-root.

   Measured over two runs of 30,000 draws. Mix: 50% primary nouns, 30% verbs,
   12% adjectival verbs, 8% deverbal nouns; three syllables 60%, four 40%.
   Shares are of legal words (86% of draws), except vowels and t.

                              before    now    target
     o + õ, of vowels          36.8     20.0     20
     a                         11.0     17.3     18
     e                          8.0     14.3     15
     i                         10.5     14.0     14
     u + ü                     21.0     19.1     (left alone)
     t (with ts), of consonants 2.1      5.4      6
     words with a coda         18.5     14.7     16
     words with a cluster       0.6      2.8      3
     words with a long consonant 1.4     2.8      3
     words with ü               5.7      5.8      —
     words with a nasal vowel  53.9     53.2      —
     mean syllables            2.91     2.96

   Every target is within a third, so nothing was adjusted after measuring.
   "Before" is build 2026-10-01-2035 under the same count. It reads clusters
   lower than the 2026-09-28 table above (0.6 against 2.1), which was counted
   differently; compare before with now, not with that table. */
const CODA_BIAS = 0.14;
const CLUSTER_SEED = 0.08, CLUSTER_SEED_C = ["p","t","k","b","d","g","f"];
/* 2026-10-24 — the long-consonant seed widened (Lexicology §6, ruled by the
   speaker): it fires in three-syllable roots as well as four, at the second
   syllable, so core and ordinary words get long consonants at all; and it draws
   b d g v z too, ruled legal long the same day (Phonology §4.2 rule 1), at a
   third the weight of p t k s. Target: about one ordinary word in twenty.
   A two-syllable root still cannot get one: its only medial u is in the
   stressed first syllable, which R3 never touches. */
const LONG_SEED = 0.05, LONG_SEED_C = ["p","p","p","t","t","t","k","k","k","s","s","s","b","d","g","v","z"];
function generateRoot(cls, nSyl){
  if(cls==="func" && !nSyl) nSyl = 1;   // only when no explicit count is chosen
  let body = "", forced = "";
  for(let i=0;i<nSyl-1;i++){
    const prev = body[body.length-1];
    // medial only: never the first syllable, and the last one carries the theme
    // A seed in the previous syllable fixed this one's onset. It is an ordinary
    // CV or CVN syllable otherwise, and it takes no seed of its own.
    if(forced){
      // never u: R3 would delete it too and the seed would give a three-consonant
      // pile (syoppru, kĩsdle) instead of tapra or atta
      let v; do{ v = pick(VOW_W); }while(v === "u");
      body += forced + v + (Math.random() < 14/62 ? "n" : "");   // CVN at its SHAPES rate against CV
      forced = ""; continue;
    }
    // Order matters: coda bias, then the cluster seed, then the long-consonant
    // seed, then the normal draw.
    if(i > 0 && Math.random() < CODA_BIAS){ body += pick(CODA_OK.split("")) + "u"; continue; }
    if(nSyl === 4 && i === 1){
      // t and d take r only: Phonology §4.2 rule 6 lists tr dr but no tl dl
      if(Math.random() < CLUSTER_SEED){ const c = pick(CLUSTER_SEED_C); body += c + "u"; forced = "td".includes(c) ? "r" : pick(["r","l"]); continue; }
    }
    if(nSyl >= 3 && i === 1){
      if(Math.random() < LONG_SEED){ const c = pick(LONG_SEED_C); body += c + "u"; forced = c; continue; }
    }
    body += makeSyllable(weighted(SHAPES), prev);
  }
  // final syllable carries the theme
  let fin = "";
  // a seed in the second of three syllables forces the final syllable's onset
  const onsetShape = forced ? "" : weighted([["C",68],["CG",14],["",10],["G",8]]);
  if(forced){ fin += forced; forced = ""; }
  if(onsetShape.includes("C")){
    let c; let guard=0;
    // 2026-10-01 — the consonant before a verb's final -u is drawn from a gentler
    // table than the rest of the word. Verbs end sentences, and under CONS_W about
    // one verb in five ended in -nu while b d g v came up once in twenty-five each.
    const table = (cls==="verb" || cls==="adjv") ? THEME_W : CONS_W;
    do{ c=pick(table); guard++; } while(guard<20 && body && body[body.length-1]==="n" && c==="n");
    fin += c;
  }
  if(onsetShape.includes("G")){
    const c = fin[fin.length-1];
    const g = "rkgfv".includes(c) ? "y" : weighted(CG_GLIDE);
    if(g!==c) fin += g;
  }
  const gl2 = fin[fin.length-1];
  if((gl2==="y"&&cls==="dnoun")||false){}   // theme vowels a/u/e/i/o handled below
  if(cls==="verb" && gl2==="w") fin = fin.slice(0,-1);          // would give wu
  // Proto had no irregular verb class. It had roots ending in a nasal, which R5
  // and R6 later made irregular. So the verb draw carries both finals and lets
  // the rules decide — asking for one or the other is steering.
  if(cls==="verb" || cls==="adjv") fin += (Math.random() < IRREG_RATE ? pick(["un","in","en"]) : "u");
  else if(cls==="irreg") fin += pick(["un","in","en"]);
  else if(cls==="dnoun") fin += "a";
  else if(cls==="pnoun" || cls==="pron") fin += pick(["a","e","i","o"]) + (Math.random()<0.45 ? "n" : "");
  else                   fin += pick(VOW_W) + (Math.random()<0.4 ? "n" : "");
  return (body + fin).toUpperCase();
}
function endsOK(sp, req){
  sp = toN(sp);
  if(!req) return true;
  if(req==="NAS")  return /[aio]n$/.test(sp);
  if(req==="ORAL") return /[aeiouüö]$/.test(sp);
  return sp.endsWith(req);
}
function startsOK(sp, req){
  sp = toN(sp);
  if(!req) return true;
  if(req==="SON")  return /^[nmrlwy]/.test(sp);
  if(req==="NAS")  return /^[nm]/.test(sp);
  if(req==="V")    return /^[aeiouüö]/.test(sp);
  return sp.startsWith(req);
}
/* The written filter, enforced. Lexicology §6 exists to stop a root being tuned
   toward an output; a filter you state before the draw is what makes that
   checkable, so it should shape the stack rather than merely annotate it. */
const V = "aeiouüö";
// Work on spellings, not parsed structures: the lexicon is stored as spellings
// and a rhyme is a fact about the written tail either way.
const rhymeTail = w => (w = toN(w)).length >= 4 ? w.slice(-3) : w;
function themeOnset(w){
  w = toN(w);
  let i = w.length - 1;
  if(w[i] === "n") i--;                       // a word-final n is the vowel's nasality
  while(i >= 0 && !V.includes(w[i])) i--;     // land on the final vowel
  let j = i - 1, on = "";
  while(j >= 0 && !V.includes(w[j])){
    // Phonology §6: an n is a real consonant only when a vowel follows it.
    if(w[j] === "n" && !V.includes(w[j+1])) break;
    on = w[j] + on; j--;
  }
  return on;
}

function readFilter(){
  const list = id => ($(id).value || "").toLowerCase().split(/[,\s]+/).filter(Boolean);
  return {
    banEnd:  list("fBanEnd"),
    banSeq:  list("fBanSeq"),
    noGlide: $("fNoGlide") && $("fNoGlide").checked,
    onsets:  list("fOnset"),
    moraMin: Number($("fMoraMin").value) || 0,
    moraMax: Number($("fMoraMax").value) || 99,
    rhyme:   $("fRhyme").value,
    cls:     ($("cls") && $("cls").value) || "pnoun",
    english: $("fEnglish") && $("fEnglish").checked,
    particle: $("fParticle") && $("fParticle").checked,
    twin:     $("fTwin") && $("fTwin").checked,
    head:     $("fHead") && $("fHead").checked,
    rhymeList: list("fRhymeList"),
    field:    ($("fField") && $("fField").value.trim().toLowerCase()) || ""
  };
}
function filterText(){
  const f = readFilter(), bits = [];
  if(f.banEnd.length)  bits.push("not ending " + f.banEnd.join("/"));
  if(f.english)        bits.push("not an English word");
  if(f.banSeq.length)  bits.push("no " + f.banSeq.join("/"));
  if(f.noGlide)        bits.push("no glides");
  if(f.particle)       bits.push("not a particle sequence");
  if(f.twin)           bits.push("no near-twin in the class");
  if(f.head)           bits.push("no shared first syllable");
  if(f.onsets.length)  bits.push("theme onset in " + f.onsets.join(""));
  if(f.moraMin || f.moraMax < 99) bits.push(`${f.moraMin || 1}-${f.moraMax === 99 ? "any" : f.moraMax} moras`);
  if(f.rhyme === "class") bits.push("no rhyme within the class");
  if(f.rhyme === "field") bits.push(f.field ? "no rhyme within the class in field " + f.field : "no rhyme within the class (no field set)");
  if(f.rhyme === "lex")  bits.push("no rhyme with any existing word");
  if(f.rhyme === "list" && f.rhymeList.length) bits.push("no rhyme with " + f.rhymeList.join("/"));
  return bits.join("; ");
}
/* Every short function word, longest first, so the greedy split finds toma
   before it finds to. */
function particleStock(){
  return Object.keys(LEX)
    .filter(w => LEX[w].c === "case" || LEX[w].c === "evid" || LEX[w].c === "aux" ||
                 LEX[w].c === "q" || LEX[w].c === "negopen" || LEX[w].c === "num")
    .filter(w => w.length <= 4)
    .sort((a,b) => b.length - a.length);
}
function splitsIntoParticles(w){
  const P = particleStock();
  const walk = rest => {
    if(!rest) return true;
    return P.some(p => rest.startsWith(p) && walk(rest.slice(p.length)));
  };
  return walk(w);
}
function firstSyl(w){
  w = toN(w);
  const m = w.match(/^[^aeiouüö]*[aeiouüö]n?(?![aeiouüö])/) || w.match(/^[^aeiouüö]*[aeiouüö]/);
  return m ? m[0] : w;
}

/* English and Lunaji share an inventory, so some legal outputs land on English
   words by accident. That is what youno was, and it is a different problem from
   texture — it wants a word list, not a deeper draw. Only words English can
   actually say in Lunaji shapes are listed: open syllables, or a final nasal. */
const ENGLISH = (
 "man men can ban tan van fan pan ran than din pin win sin tin bin kin gin " +
 "son ton won don con on an in un one none done sun run fun gun bun nun " +
 "hen pen ten den when then ken " +
 "mama papa baba dada nana papa mommy daddy nanny granny " +
 "mono solo halo hero zero photo potato tomato piano radio video audio " +
 "echo ego logo judo sumo taco kilo memo demo polo yoyo bingo mango tango " +
 "koala banana cinema camera arena aroma drama llama karma coma soda sofa " +
 "tuna yeti okay hello hola " +
 "money honey funny sunny many any only holy lily silly jelly belly " +
 "very bury hurry worry sorry lucky happy puppy copy body lady baby navy " +
 "moon noon soon room boom zoom " +
 "youno gonna wanna kinda gimme lemme dunno lotta outta " +
 "bono nino nemo lima lola mimi coco dodo gaga momo yaya"
).split(/\s+/);
const englishHit = w => ENGLISH.includes(w);

function passesFilter(res, f){
  const w = res.spelling;
  if(f.banEnd.some(e => w.endsWith(e))) return false;
  if(f.banSeq.some(e => w.includes(e))) return false;
  // A glide is y or w before a vowel. ny is the consonant ɲ, not a glide, so it
  // survives this — which is why a bare "no y" substring ban would over-reach.
  if(f.noGlide && /(^|[^n])y[aeiouüö]|w[aeiouüö]/.test(w)) return false;
  if(res.moras < f.moraMin || res.moras > f.moraMax) return false;
  if(f.onsets.length && !f.onsets.includes(themeOnset(w))) return false;
  // Grammar §8: a content word should not be homophonous with a particle
  // sequence. ani is a + ni; lonke is lon + ke. Both were found by ear, late.
  if(f.particle && splitsIntoParticles(w)) return false;
  // 2026-10-06: short words collide more easily, so a core draw also rejects a
  // word one letter from an existing word of its own class (sofu / sonu).
  if(f.twin){
    const mineT = CMAP[f.cls] || f.cls;
    if(nearTwins(w).some(t => LEX[t.w] && LEX[t.w].c === mineT)) return false;
  }
  // The rhyme check compares tails, so a shared head is invisible to it —
  // which is how lonke reached the shortlist beside lonji.
  if(f.head){
    const h = firstSyl(w);
    // Short words were excluded to stop the topic particle a from rejecting
    // every a-initial noun. But a never stands before anything — it encliticizes.
    // The words that DO precede a content word are the ones that matter, and
    // they are all short: mi leans onto the verb, na onto the noun.
    const PRECEDES = ["mi","na"];
    const against = Object.keys(LEX).filter(o => o.length > 2 || PRECEDES.includes(o));
    if(against.some(o => o !== w && firstSyl(o) === h)) return false;
  }
  // Two words only collide when they share a class, a slot and enough meaning to
  // be substitutable. Resemblance across classes is what a real lexicon is made
  // of — English gl- for light, derivational families — and a lexicon with none
  // of it reads as random. So the default compares within the class only, which
  // also keeps the filter satisfiable as the lexicon grows past a thousand.
  if(f.english && englishHit(w)) return false;
  if(f.rhyme){
    const t = rhymeTail(w);
    const mine = CMAP[f.cls] || f.cls;
    const against =
      f.rhyme === "lex"   ? Object.keys(LEX) :
      f.rhyme === "class" ? Object.keys(LEX).filter(o => LEX[o].c === mine) :
      f.rhyme === "field" ? Object.keys(LEX).filter(o => LEX[o].c === mine && (!f.field || (LEX[o].f || "") === f.field)) :
                            f.rhymeList;
    if(against.some(o => o !== w && o.length >= 3 && rhymeTail(o) === t)) return false;
  }
  return true;
}

/* 2026-10-06 — word length follows the tier. Until now every content draw was
   3 or 4 proto syllables (60/40) whatever the tier, so a core word could never
   be short and 506 of 687 dictionary words had exactly three syllables. A real
   language makes its most frequent words its shortest. The run-up argument for
   3–4 (Proto §1.5) was written under word stress; since 2026-09-28 the accent
   is assigned per phrase, so the run-up is the phrase and a frequent word may
   be short. An explicit choice in the Syllables box still overrides this.
   No existing word is recoined. Measured table: Lexicology §6. */
const TIER_SYL = {core:[[2,60],[3,40]], ord:[[2,15],[3,65],[4,20]], rare:[[3,40],[4,60]]};
const CONTENT_CLS = ["verb","adjv","irreg","dnoun","pnoun"];
function tierSyl(cls, tier){
  if(!CONTENT_CLS.includes(cls)) return weighted([[3,60],[4,40]]);
  return weighted(TIER_SYL[tier] || TIER_SYL.ord);
}
function drawStock(cls, sylOpt, n, endReq, startReq){
  const tierNow = ($("pTier") && $("pTier").value) || "ord";
  const out=[]; let guard=0;
  const F = readFilter();
  const tight = endReq || startReq || F.banEnd.length || F.banSeq.length || F.head || F.english || F.twin ||
                F.noGlide || F.onsets.length || F.rhyme || F.moraMin;
  const cap = tight ? n*2000 : n*40;
  while(out.length<n && guard<cap){
    guard++;
    const nSyl = sylOpt || tierSyl(cls, tierNow);
    const root = generateRoot(cls, nSyl);
    let res;
    try{ res = derive(root); }catch(e){ continue; }
    if(!endsOK(res.spelling, endReq)) continue;
    if(!startsOK(res.spelling, startReq)) continue;
    if(!passesFilter(res, F)) continue;
    const bad = check(res, cls).some(t=>!t.ok);
    if(bad) continue;
    if(out.some(o=>o.root===root || o.out===res.spelling)) continue;
    out.push({root, out:res.spelling, ipa:res.ipa,
              fired: res.steps.filter(x=>x.fired).map(x=>x.id).join(" ")});
  }
  return out;
}

/* ══════════ the verb word ══════════
   2026-10-03 — Grammar §4. root + -bi (can) + -du (want to) + -ri (ongoing)
   + -ena (not) + -ze (past), each at most once and in that order, then at most
   one clause particle: -na if, -wa when, -di because. Nasal-final verbs are a
   regular class: the nasal stays before a consonant (kazõze) and links before
   -ena and the clause particle -a (kazonena, kazona). Theme -u never drops
   (sofuena). mi is retired; free hena stands only where there is no verb. */
/* 2026-10-11 — Grammar §4.11: -vu turns one verb into another, the state the
   action leaves, so it stands right after the root and every slot follows it
   (gosomuvuze). Grammar §2.6: -ga turns the verb word into a noun, “one who
   ___”; nothing verbal follows it, so it is not a slot (agentParse below). */
const VSLOTS = [["na","wa","di","a"],["ze"],["ena"],["ri"],["du"],["bi"],["vu"]];   // peeled right to left
const VORDER = ["vu","bi","du","ri","ena","ze"];                                     // written left to right
function verbForm(w){
  let out = w;
  for(let i = 1; i < arguments.length; i++) if(arguments[i]) out = joinSuffix(out, arguments[i]);
  return out;
}
function lexVerbKey(x){
  x = x.replace(/'$/, "");
  const k = [toTilde(x), x].find(y => Object.prototype.hasOwnProperty.call(LEX, y));
  return k && (LEX[k].c === "verb" || LEX[k].c === "aux" || k === "gu") ? k : null;
}
// kazonenaze → {stem:"kazõ", ends:["ena","ze"]}; null when the token is not a verb form
function verbStem(tok){
  const s = toN(String(tok || "").toLowerCase().replace(/[.?!,]/g, ""));
  if(!s) return null;
  const k0 = lexVerbKey(s);
  if(k0) return {stem: k0, ends: []};
  const walk = (x, from, ends) => {
    for(let i = from; i < VSLOTS.length; i++){
      for(const e of VSLOTS[i]){
        if(x.length <= e.length || !x.endsWith(e)) continue;
        const rest = x.slice(0, -e.length).replace(/'$/, "");
        const nas = /[aeiou]n$/.test(rest);
        if(e === "a" && !nas) continue;            // -a is the topic after a nasal only
        if(e === "na" && nas) continue;            // and -na never is
        const k = lexVerbKey(rest);
        if(k) return {stem: k, ends: [e].concat(ends)};
        const deeper = walk(rest, i + 1, [e].concat(ends));
        if(deeper) return deeper;
      }
    }
    return null;
  };
  return walk(s, 0, []);
}
const VEND_GLOSS = {vu:"state \u2014 to be ___ed", bi:"can", du:"want to", ri:"ongoing", ena:"not", ze:"past", na:"if", a:"if", wa:"when", di:"because", ga:"one who"};
// every form a verb can take: 2^6 ending sets × (bare + three clause particles),
// and since 2026-10-11 every -ga noun it makes, bare, plural and with each case
// particle (Grammar §2.6, §4.3: the check was run that way on 2026-10-11)
const GA_BEFORE = ["vu","bi","du","ena"];
function allVerbForms(w){
  const out = [];
  for(let m = 0; m < 64; m++){
    const ends = [m&1 && "vu", m&2 && "bi", m&4 && "du", m&8 && "ri", m&16 && "ena", m&32 && "ze"].filter(Boolean);
    const base = verbForm.apply(null, [w].concat(ends));
    if(ends.length) out.push({f: base, ends});
    ["na","wa","di"].forEach(c => out.push({f: joinSuffix(base, c), ends: ends.concat(c)}));
    if(ends.every(e => GA_BEFORE.includes(e))){
      const g = joinSuffix(base, "ga"), gt = joinSuffix(g, "ta");
      [g, gt].forEach((x, k) => {
        const e2 = ends.concat("ga", k ? ["ta"] : []);
        out.push({f: x, ends: e2});
        ["na","ba","ni","pe","wa","di"].forEach(c => out.push({f: joinSuffix(x, c), ends: e2.concat(c)}));
      });
    }
  }
  return out;
}
/* sukomuga → {stem:"sukomu", ends:["ga"]}; gosomuvuga → {stem:"gosomu", ends:["vu","ga"]}.
   -ga stands after -vu, -bi, -du or -ena, never after -ri or -ze. */
function agentParse(tok){
  const s = toN(String(tok || "").toLowerCase());
  if(!/ga$/.test(s) || s.length <= 2) return null;
  const v = verbStem(s.slice(0, -2));
  if(!v || !v.ends.every(e => GA_BEFORE.includes(e))) return null;
  return {stem: v.stem, ends: v.ends.concat("ga")};
}
// a candidate that is already some verb's -ga noun, alone, plural or with a particle
function agentReads(w){
  const s = String(w || "").toLowerCase();
  for(const c of ["", "na","ba","ni","pe","wa","di"]){
    if(c && !s.endsWith(c)) continue;
    const x = c ? s.slice(0, -c.length) : s;
    for(const y of [x, /ta$/.test(x) ? x.slice(0, -2) : null]){
      if(!y) continue;
      const a = agentParse(y);
      if(a) return {a, plural: y !== x, clitic: c};
    }
  }
  return null;
}

/* ══════════ aspect particles and elision ══════════
   2026-10-07 — Grammar §4.2 and §1b.4. Completed and habitual are the particles
   ila and zoka, standing in front of the verb and taking no ending. Three words
   lean forward and drop their final vowel before ANY vowel, written with an
   apostrophe: na omime → n'omime, ila onu → il'onu, zoka onu → zok'onu. The
   case particles keep same-vowel elision only, which is what lets ni and di
   elide into ila: üwikini ila sofu → üwikin'ila sofu. */
const ASPECT = {ila: "completed", zoka: "habitual"};
/* 2026-10-12 — kügi, "than", leans forward too (Grammar §1b.4, §5.4): küg'ilusã.
   Its ü stays when the i drops (küg'omime, never kug'omime). */
const LEAN = {n: "na", il: "ila", zok: "zoka", "küg": "kügi"};   // what is left of each once its vowel is gone
const LEANFULL = {na: 1, ila: 1, zoka: 1, "kügi": 1};
const EVOW = "aeiouüöãĩõẽũ";
const startsV = w => !!w && EVOW.includes(w[0].toLowerCase());
const isAspect = w => Object.prototype.hasOwnProperty.call(ASPECT, String(w || "").toLowerCase());
// ila + onu → il'onu; before a consonant the two words stay apart
const leanJoin = (pt, w) => startsV(w) ? pt.slice(0, -1) + "'" + w : pt + " " + w;
/* A written token, split at its elision apostrophes into the words it stands
   for: üwikin'il'okilu → üwikini, ila, okilu. An elision apostrophe stands
   between a consonant and a vowel; the old nasal-seam apostrophe (helan'ni)
   stands before n, y or w and is left alone. No lookbehind. */
function elisionSplit(tok){
  const t = String(tok || ""), out = []; let cur = "";
  for(let i = 0; i < t.length; i++){
    const c = t[i];
    // a phone keyboard may hand over the curly apostrophe
    if((c === "'" || c === "’") && cur && !EVOW.includes(cur.slice(-1).toLowerCase()) && cur.slice(-1) !== "'" && startsV(t[i+1] || "")){
      out.push(cur); cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}
function unelide(tok){
  const P = elisionSplit(tok);
  return P.map((p, i) => {
    if(i === P.length - 1) return p;
    const low = p.toLowerCase(), nx = P[i+1][0].toLowerCase();
    const nv = ({"ã":"a","ĩ":"i","õ":"o","ẽ":"e","ũ":"u"})[nx] || nx;
    // a forward-leaning word gets its own vowel back; pe gets its e back
    // (2026-10-11, nuswap'akyoza); a case particle lost the vowel that follows it
    if(Object.prototype.hasOwnProperty.call(LEAN, low)) return p + LEAN[low].slice(low.length);
    return /p$/.test(low) ? p + "e" : p + nv;
  });
}
/* A spelling function applied to written text, one word at a time. An elided
   word is given its vowel back first — a bare noayen would be read as noayẽ —
   and loses it again afterwards. */
function elidedMap(tok, fn){
  const P = elisionSplit(tok), U = unelide(tok);
  return P.map((p, i) => i === P.length - 1 ? fn(p) : String(fn(U[i])).slice(0, -1)).join("'");
}
const tildeSafe = text => typeof text === "string" ? text.split(/(\s+)/).map(t => /^\s+$/.test(t) ? t : elidedMap(t, toTilde)).join("") : text;
/* Write the elision into a line: na, ila and zoka before any vowel, then ni and
   di into ila. A whole word that merely ends in ni or di (ani, fãvonedi) is not
   a particle and is left alone. */
function elideLean(line){
  if(!line) return line;
  const T = line.split(" ");
  const core = t => t.replace(/[.?!,"\u201c\u201d]/g, "");
  const tailP = t => (t.match(/[.?!,"\u201d]+$/) || [""])[0];
  for(let i = T.length - 2; i >= 0; i--){
    const low = core(T[i]).toLowerCase(), nx = T[i+1];
    if(!nx || tailP(T[i]) || /^["\u201c]/.test(nx)) continue;
    if(LEANFULL[low] && startsV(core(nx))) T.splice(i, 2, T[i].slice(0, -1) + "'" + nx);
  }
  for(let i = T.length - 2; i >= 0; i--){
    const c = core(T[i]), low = c.toLowerCase(), nx = T[i+1];
    if(!nx || tailP(T[i]) || !/[nd]i$/.test(low)) continue;
    const nc = core(nx).toLowerCase();
    if(nc !== "ila" && nc.indexOf("il'") !== 0) continue;
    if(LEX[low] || LEX[toTilde(low)]) continue;
    T.splice(i, 2, T[i].slice(0, -1) + "'" + nx);
  }
  return T.join(" ");
}
/* 2026-10-11 — Grammar §1b.4, §6. Three more elisions, written into a line:
   - pe drops its vowel before ANY vowel: nuswape akyoza → nuswap'akyoza
   - same-vowel elision counts a nasal vowel as its oral partner: ni and di
     before i or ĩ, ba, wa and topic na before a or ã (yãkin'ĩpõgu)
   - puso drops its vowel before o or õ only: pus'onyake; puso ilusã stays
   Only on a particle joined to a known noun or pronoun (or a -ga noun, or one
   with -ta): a whole word that merely ends in ni or wa is left alone, and so is
   a verb's clause particle. The topic a after a nasal-final noun is not
   elided: Grammar §8 leaves it to context. */
const ELIDE_BEFORE = {pe: "aeiouüöãĩõ", ni: "iĩ", di: "iĩ", ba: "aã", wa: "aã", na: "aã"};
/* 2026-10-24 — Grammar §6.0. The two words for "and" drop their vowel before
   their own vowel only, as puso does: fa before a or ã (mumã f'ani), mishi
   before i or ĩ (mish'ilusãba). Neither leans forward. */
const OWN_VOWEL = {puso: "o\u00f5", fa: "a\u00e3", mishi: "i\u0129"};
function nounKey(stem){
  const s = String(stem || "").toLowerCase();
  if(!s) return null;
  const k = [s, toTilde(s)].find(x => Object.prototype.hasOwnProperty.call(LEX, x));
  if(k) return ["noun","pron"].includes(LEX[k].c) ? k : null;
  if(agentParse(s)) return s;
  if(/ta$/.test(s) && s.length > 2) return nounKey(s.slice(0, -2));
  return null;
}
function elideMore(line){
  if(!line) return line;
  const T = line.split(" ");
  const core = t => t.replace(/[.?!,"\u201c\u201d]/g, "");
  const tailP = t => (t.match(/[.?!,"\u201d]+$/) || [""])[0];
  for(let i = T.length - 2; i >= 0; i--){
    const nx = T[i+1];
    if(!nx || tailP(T[i]) || /^["\u201c]/.test(nx)) continue;
    const c = core(T[i]), low = c.toLowerCase(), v = core(nx).charAt(0).toLowerCase();
    if(!v || !EVOW.includes(v) || /'/.test(c)) continue;
    if(Object.prototype.hasOwnProperty.call(OWN_VOWEL, low)){
      if(OWN_VOWEL[low].includes(v)) T.splice(i, 2, T[i].slice(0, -1) + "'" + nx);
      continue;
    }
    if(LEX[low] || LEX[toTilde(low)]) continue;           // a whole word, not word + particle
    const pt = low.slice(-2);
    if(!ELIDE_BEFORE[pt] || !ELIDE_BEFORE[pt].includes(v)) continue;
    if(!nounKey(low.slice(0, -2))) continue;
    T.splice(i, 2, T[i].slice(0, -1) + "'" + nx);
  }
  return T.join(" ");
}
const elideLine = line => elideMore(elideLean(line));

// Namespaced: several of these helper names already exist above.
const Prosody = (() => {
/* ══════════ phrase prosody ══════════
   A phrase is a case-marked constituent. The ancient clitics attach backward,
   so the clitic is the phrase's right edge; toma stays separate and closes more
   weakly; mi attaches forward because it sits at a left edge. Edge tone is
   anchored to the edge, not to the stressed syllable — which is why a frame can
   be legal and still have no melody in it.                                    */
const ENCL = ["na","ba","ni","pe","wa","di","a"];   // longest-first below
const PVOW = "aeiouüö";
const isV = c => !!c && PVOW.includes(c);

function sylsOf(w){
  // 2026-10-07 — an elision apostrophe joins what it stands between: il'onu is
  // i.lo.nu, üwikin'ila is ü.wi.ki.ni.la. It is taken out of the WRITTEN token
  // here, before toN(), because in the n-form n' before a vowel means nasality.
  w = toN(elisionSplit(w).join(""));
  // the apostrophe is kept during parsing: it is what says an n before a glide
  // is vowel nasality rather than the onset of the next syllable
  const out = [];
  let i = 0;
  while(i < w.length){
    let on = "";
    if(w[i] === "'"){ i++; continue; }
    while(i < w.length && !isV(w[i])){
      // n before a vowel is an onset; before a glide it is also an onset (ny is
      // ɲ, nw is n + w); before any other consonant it is the previous vowel's
      // nasality, so it belongs to the syllable already emitted
      if(w[i] === "n" && !isV(w[i+1]) && w[i+1] !== "y" && w[i+1] !== "w") break;
      if(w[i] === "'") break;
      on += w[i++];
    }
    if(i >= w.length){ if(on && out.length) out[out.length-1].t += on; break; }
    let v = w[i++];
    let nasal = false;
    // Orthography §6: n before a bare glide nasalizes ONLY where the apostrophe
    // says so. Without it, ny is the digraph for ɲ and nw is onset n + glide.
    if(w[i] === "n" && (w[i+1] === "'" || (!isV(w[i+1]) && w[i+1] !== "y" && w[i+1] !== "w"))){
      nasal = true; i++;
    }
    /* 2026-09-28 — an onset may be one consonant, a digraph, or obstruent+liquid
       (plus a glide). Anything in front of that belongs to the syllable already
       emitted, as a coda, and carries a mora: mi.nos.kan, not mi.no.skan.       */
    let glide = "";
    if(on.length > 1 && (on.endsWith("y") || on.endsWith("w")) && on !== "ny"){
      glide = on.slice(-1); on = on.slice(0, -1);
    }
    let coda = "";
    if(on.length > 1 && !["sh","ts","ny"].includes(on)){
      const two = on.slice(-2);
      const legalTwo = ["sh","ts","ny"].includes(two) ||
                       (CLUSTER_OB.includes(two[0]) && LIQUID.includes(two[1]));
      const keep = legalTwo ? 2 : 1;
      coda = on.slice(0, on.length - keep);
      on = on.slice(on.length - keep);
    }
    if(coda && out.length){
      const prev = out[out.length - 1];
      prev.t += coda; prev.m += coda.length; prev.coda = coda;
    }
    out.push({t: on + glide + v + (nasal ? "n" : ""), nasal, m: nasal ? 2 : 1});
  }
  return out;
}
const morasOfWord = w => sylsOf(w).reduce((a,s)=>a+s.m, 0);
/* Phonology §5, rewritten 2026-09-28 — the accent falls on the last HEAVY
   syllable, heavy being a nasal vowel, a closed syllable, or the first half of a
   long consonant. This is the CITATION form: where the beat lands when the word
   stands alone as a phrase. Inside a longer phrase use phraseAccent(). */
const heavySyl = s => Boolean(s.nasal || s.coda);
function stressIdx(w){
  const sy = sylsOf(w); let k = -1;
  sy.forEach((s,i)=>{ if(heavySyl(s)) k = i; });
  return k < 0 ? sy.length - 1 : k;
}
/* One accent per PHRASE, not per word. Takes the phrase's tokens in order and
   returns the whole phrase transcribed with a single ˈ on its last heavy
   syllable — or on its final syllable where the phrase has none. */
function phraseAccent(toks){
  const flat = [];
  toks.forEach((t, ti) => sylsOf(t.toLowerCase()).forEach((s, si) =>
    flat.push({s: Object.assign({}, s), ti, first: si === 0})));
  if(!flat.length) return toks.join(" ");

  /* LIAISON — Grammar §1a, ruled 2026-09-28. Inside a phrase, a nasal-final word
     before a vowel-initial word gives its nasal up as an onset: ginusã ilusãba →
     gi.nu.sa‿ni.lu.ˈsãː.ba. Never across a phrase boundary, which is why this
     runs per phrase and not over the whole line. */
  for(let i = 0; i < flat.length - 1; i++){
    const a = flat[i], b = flat[i + 1];
    if(!b.first) continue;                       // same word — §1a handles it
    if(!a.s.nasal) continue;                     // needs a nasal to give up
    if(!isV(b.s.t[0])) continue;                 // needs a vowel to land on
    a.s.t = a.s.t.replace(/n$/, "");             // the nasal leaves the vowel
    a.s.nasal = false; a.s.m = 1;
    b.s.t = "n" + b.s.t;                         // and becomes the next onset
    b.liaised = true;
  }

  let k = -1;
  flat.forEach((x, i) => { if(heavySyl(x.s)) k = i; });
  if(k < 0) k = flat.length - 1;
  let out = "";
  flat.forEach((x, i) => {
    if(i > 0) out += x.liaised ? "\u203f" : x.first ? " " : ".";
    out += (i === k ? "ˈ" : "") + toTilde(x.s.t);
  });
  return out;
}
function ipaWord(w){
  w = w.toLowerCase();
  const sy = sylsOf(w), k = stressIdx(w);
  return sy.map((s,i)=>(i===k?"ˈ":"")+s.t).join(".");
}

function splitClitic(tok){
  if(LEX[tok]) return null;                       // a whole word, no clitic
  for(const c of ENCL.slice().sort((a,b)=>b.length-a.length)){
    // helan'ni, aoyan'wa — the apostrophe belongs to the seam, not the stem
    const stem = tok.slice(0, -c.length).replace(/'$/, "");
    // 2026-10-03: aoyana → aoyan → aoyã; the stored key is the tilde spelling
    // 2026-10-11: a -ga noun is a noun (Grammar §2.6), alone or with -ta
    const key = LEX[stem] ? stem : (LEX[toTilde(stem)] ? toTilde(stem) :
      (agentParse(stem) || (/ta$/.test(stem) && agentParse(stem.slice(0, -2))) ? stem : null));
    if(tok.length > c.length && tok.endsWith(c) && key)
      return {stem: key, clitic: c};
  }
  return null;
}

function phrasesOf(line){
  /* 2026-10-11 — Grammar §1, Phonology §5. A phrase runs to a comma, to norõ, or
     to the end of the sentence, and nowhere else. A noun with its particle is not
     a phrase of its own, and neither is the verb complex; there is no beat after
     ni, elided or not (Grammar §1b.4). Until build 1227 the split broke after
     every case-marked word and before the verb complex. */
  const raw = String(line || "").replace(/["\u201c\u201d]/g, "").split(/\s+/).filter(Boolean);
  const ph = []; let cur = [], sid = 0;
  const close = end => {
    if(cur.length) ph.push({toks: cur, end, sid});
    cur = [];
    if(end === "stop" || end === "question") sid++;
  };
  raw.forEach(r => {
    const t = r.replace(/[.?!,]/g, "");
    if(t) cur.push(t);
    if(/\?$/.test(r)) close("question");
    else if(/[.!]$/.test(r)) close("stop");
    else if(/,$/.test(r)) close("comma");
    else if(t && toN(t.toLowerCase()) === "noron") close("noron");   // ends a phrase as a comma does
  });
  close("stop");
  ph.forEach(p => {
    p.kind = p.toks.some(t => { const P = unelide(t); return !!verbStem(P[P.length - 1]); }) ? "verb" : "arg";
  });
  return ph;
}

function analyse(line){
  const ph = phrasesOf(line);
  // a question rise on the last phrase of a sentence that carries jĩ or ends in ?
  const qSent = {};
  ph.forEach(p => { if(p.end === "question" || p.toks.some(t => toN(t.toLowerCase()) === "jin")) qSent[p.sid] = true; });
  const warn = [];
  const out = ph.map((p,i)=>{
    const last = ph.length - 1;
    const word = p.toks[p.toks.length - 1];
    const sy = sylsOf(word);
    const edge = sy[sy.length - 1];
    const moras = p.toks.reduce((a,t)=>a + morasOfWord(t), 0);
    const contour = (p.end === "comma" || p.end === "noron") ? "rise" : (qSent[p.sid] ? "question rise" : "fall");
    // FLAT PHRASE — the thump and the turn land on the same beat
    const headStress = stressIdx(word);
    if(headStress === sy.length - 1 && p.toks.length === 1 && p.kind === "arg"){
      const sc = splitClitic(word);
      // Not a fault. A word with no nasal syllable takes final stress, so the
      // joined clitic gets both the stress and the edge tone. That is the normal
      // shape for an oral-only noun, and it is why the nasal vowels are what
      // give a phrase any melody inside itself.
      warn.push({lvl:"note", t:"ONE-BEAT EDGE \u2014 " + word +
        ": no heavy syllable, so the accent and the edge tone share \u00ab" + edge.t +
        "\u00bb. Normal for an open oral-only word; a coda or a nasal vowel moves it" +
        (sc ? "; the clitic -" + sc.clitic + " carries both." : ".") +
        " A word with a nasal vowel keeps its stress in the stem."});
    }
    // 2026-10-11 — the BEAT NOT RULED warning is gone: there is no beat after ni,
    // elided or not (Grammar §1b.4)
    return {toks: p.toks, kind: p.kind, end: p.end, moras, edge: edge.t, contour,
            stress: phraseAccent(p.toks)};
  });

  const hasVerb = ph.some(p=>p.kind === "verb");
  const hasClitic = ph.some(p => p.toks.some(t => splitClitic(t) || t === "ni" || t === "toma"));
  if(!hasClitic && !hasVerb)
    warn.push({lvl:"warn", t:"NO EDGE — no clitic and no clause end, so nothing is being tested prosodically."});
  // 2026-10-11 — MISSING BREAK is gone: there is no boundary before the verb
  // complex to miss (Grammar §1).
  const lastTok = ph[ph.length-1].toks[ph[ph.length-1].toks.length-1];
  if(morasOfWord(lastTok) === 1)
    warn.push({lvl:"warn", t:"LIGHT CONTOUR SLOT — clause ends on \u00ab" + lastTok +
      "\u00bb, one mora. The contour has a single beat to turn on."});
  // OVERT PRONOUN — Grammar §2.3: a neutral sentence has no pronoun in it.
  line.toLowerCase().replace(/[.?,]/g,"").split(/\s+/).filter(Boolean).forEach(t=>{
    const sc = splitClitic(t);
    if(sc && sc.clitic === "ba" && LEX[sc.stem] && LEX[sc.stem].c === "pron")
      warn.push({lvl:"warn", t:"OVERT PRONOUN \u2014 \u00ab" + t + "\u00bb. A neutral sentence drops the subject (Grammar \u00a72.3); keep it only for contrast or correction."});
  });
  // THIN EDGE — Grammar §1b.5
  const toks = line.replace(/[.?,]/g,"").split(/\s+/).filter(Boolean);
  toks.forEach((t,i)=>{
    if(morasOfWord(t) !== 1 || !LEX[t]) return;
    const L = i > 0 ? morasOfWord(toks[i-1]) : 99, R = i < toks.length-1 ? morasOfWord(toks[i+1]) : 99;
    if(L <= 2 || R <= 2)
      warn.push({lvl:"warn", t:"THIN EDGE — \u00ab" + t + "\u00bb is a light clitic without long material on both sides (§1b.5)."});
  });
  return {phrases: out, warn, hasVerb};
}

/* Devoicing — Phonology §5, adopted 2026-09-29. A LIVE pronunciation rule, not
   spelled: an oral i, u or ü between voiceless consonants is whispered, as in
   Japanese desu, sukiyaki. It runs across a word boundary inside a phrase and
   across a suffix, since it is phonetics rather than history. Two things block
   it: the vowel carrying the phrase accent, and a closed or nasal syllable.
   Voiceless here: p t k f s sh ts h. Returns the line with each whispered
   vowel ringed (i̥ u̥ ü̥), or "" when nothing devoices. */
const VL = "ptkfsh";
function devoiced(line){
  let any = false;
  const out = phrasesOf(line).map(p => {
    const flat = [];
    p.toks.forEach(t => sylsOf(t.toLowerCase()).forEach((s, si) => flat.push({s, first: si === 0})));
    let k = -1; flat.forEach((x, i) => { if(heavySyl(x.s)) k = i; });
    if(k < 0) k = flat.length - 1;
    return flat.map((x, i) => {
      let t = toTilde(x.s.t);
      const m = x.s.t.match(/^([^aeiouüö]*)([iuü])$/);
      const nxt = flat[i + 1];
      if(m && i !== k && !x.s.nasal && !x.s.coda && nxt){
        const on = m[1].replace(/y$/, "");
        if(on && VL.includes(on.slice(-1)) && VL.includes(nxt.s.t[0])){
          t = m[1] + m[2] + "\u0325"; any = true;
        }
      }
      return (i > 0 ? (x.first ? " " : ".") : "") + t;
    }).join("");
  }).join(" | ");
  return any ? out : "";
}

/* 2026-10-11 — | is a comma or norõ: a slight pause, the end of a phrase.
   \u2016 is the end of a sentence. Nothing else breaks a line (Grammar §1). */
function marked(a){
  return a.phrases.map((p,i)=>{
    const txt = p.toks.join(" ");
    if(i === a.phrases.length - 1) return txt;
    return txt + (p.end === "comma" || p.end === "noron" ? " | " : " \u2016 ");
  }).join("");
}
  return {analyse, marked, ipaWord, morasOfWord, stressIdx, sylsOf, devoiced, splitClitic};
})();
const analyse = Prosody.analyse, marked = Prosody.marked;

/* Lexicology §6 step 6 — say it in a sentence before you keep it. Frames use
   only coined words, and the seam comes first: hena loman failed there while
   sounding fine in isolation. */
const nasEnd = w => /[aeiou]n$/.test(toN(w));
// Ruled 2026-09-16: ni joins everywhere; after a nasal-final word the
// apostrophe keeps the nasal vowel from being read as an onset n.
const withNi = w => toTilde(toN(w) + (nasEnd(w) ? "'ni" : "ni"));
const withTop = w => toTilde(toN(w) + (nasEnd(w) ? "a" : "na"));

function framesFor(w, cls){
  // 2026-10-03: negation is the ending -ena before the tense; mi and the free
  // hena after a verb are gone (Grammar §4.3). Lines are written in the tilde
  // spelling, particles joined.
  // 2026-10-11: every frame line is written with the elisions (Grammar §1b.4, §6)
  const F = [], put = (l, line, why) => F.push({l, line: tildeSafe(elideLine(line)), why});
  const nas = nasEnd(w);
  if(cls === "adjv"){
    put("Attributive \u2014 the commonest use", w + " helãba", "directly before the head noun, no particle between");
    put("Attributive, marked head", w + " hotorina", "a three-syllable head, for the other rhythm");
    put("Ongoing attributive", verbForm(w, "ri") + " helãba", "where the -ri stutter would show");
    put("Adverbial", "noayeni " + w + " kyõkuze", "bare verb before the main verb");
    put("Negated", verbForm(w, "ena"), nas ? "the nasal links \u2014 no tilde" : "theme -u stays: u.e in hiatus");
    // 2026-10-24 — comparison: kügi before the standard, uã after it (Grammar §5.4)
    put("Compared \u2014 kügi", "Lwajiba kügi nuswa " + w, "faster than me: kügi stands before the standard, which takes no particle (Grammar \u00a75.4)");
    put("As \u2026 as \u2014 uã", "Lwajiba nuswa uã " + w, "uã stands after the standard (Grammar \u00a75.4)");
    put("Full clause", "Lõjiwa " + w + " helãba hĩ.", "against the benchmark");
    put("One who \u2014 -ga", verbForm(w, "ga") + "ba hĩ", "the lasting trait, as a name (Grammar \u00a72.6)");
    F.push({l:"Bare", line:w, why:"legality only", legality:true});
  } else if(cls === "verb" || cls === "irreg"){
    put("Negated \u2014 the seam", verbForm(w, "ena"), nas ? "the nasal links \u2014 no tilde" : "theme -u stays: u.e in hiatus");
    put("Past", verbForm(w, "ze"), nas ? "no theme vowel protecting the suffix" : "");
    put("Past negative", verbForm(w, "ena", "ze"), "-ena sits before the tense");
    // 2026-10-24 — two frames, not one joined by a comma: a comma is a pause only (Grammar §6.0)
    put("Can", verbForm(w, "bi"), "");
    put("Want to", verbForm(w, "du"), /du$/.test(w) ? "the -dudu watch item (Grammar \u00a78)" : "");
    put("With an object", "noayeni " + verbForm(w, "ze"), "one phrase \u2014 no beat after ni (Grammar \u00a71b.4)");
    // 2026-10-07 — aspect is a particle in front of the verb (Grammar §4.2)
    put("Completed", leanJoin("ila", w), startsV(w) ? "ila drops its vowel before a vowel (\u00a71b.4)" : "the particle stands in front and takes no ending");
    put("Habitual", leanJoin("zoka", w), startsV(w) ? "zoka drops its vowel before a vowel (\u00a71b.4)" : "no -ri needed; the particle never takes the accent");
    put("Hadn't \u2014 with an object", "noayen'" + leanJoin("ila", verbForm(w, "ena", "ze")), "ni elides into ila; every ending stays on the verb");
    put("If", verbForm(w, "na") + " nuswani onu", "the clause particle, straight on the verb");
    put("Adverbial stack", "kominu " + w, "two bare verbs, neither suffixed");
    // 2026-10-11 — Grammar §4.11, §2.6
    put("State \u2014 -vu", "omimeba " + verbForm(w, "vu", "ze"), (/vu$/.test(w) ? "the -vuvu watch item (Grammar \u00a78); " : "") + "the state the action leaves \u2014 skip it if the action leaves none");
    put("One who \u2014 -ga", verbForm(w, "ga") + "ba hĩ", "names someone by what they tend to do (Grammar \u00a72.6)");
    put("Full clause", "Lõjiwa noayeni " + verbForm(w, "ena", "ze") + ".", "against the benchmark");
    F.push({l:"Bare", line:w, why:"legality only", legality:true});
  } else if(cls === "pnoun" || cls === "dnoun"){
    put("Topic-marked", withTop(w), nas ? "the nasal dissolves, the weight moves" : "");
    put("Object before the verb", withNi(w) + " sofuze", "the compression site");
    put("Not a \u2026", w + " hena", "free hena \u2014 the one place it survives");
    put("Clause in front of it", "nialipu " + w, "the shape it wears as a head noun");
    put("Modified", "kominu " + w, "an adjectival verb in front");
    put("Counted", "rako " + w, "numeral plus inanimate counter");
    put("Owned", "nuswape " + w, startsV(w) ? "pe drops its vowel before a vowel (\u00a71b.4)" : "pe joins the owner; the owned follows");
    put("Full clause", "Lõjiwa " + withNi(w) + " sofuenaze.", "against the benchmark");
    F.push({l:"Bare", line:w, why:"legality only", legality:true});
  } else if(cls === "pron"){
    // A pronoun is spoken only when it is doing contrastive work (Grammar §2.3),
    // so the OVERT PRONOUN warning is expected on the subject frame.
    put("Subject, contrastive", w + "ba saĩkowa kazõze.", "the only place a subject pronoun is said \u2014 the warning is expected here");
    put("Object", withNi(w) + " kyõkuze", "ni joins");
    put("Possessor", w + "pe akyozana", "my/your name \u2014 pe drops its vowel before a vowel (\u00a71b.4)");
    put("Topic", withTop(w) + " kominu", nas ? "the nasal dissolves, the weight moves" : "");
    put("Plural", w + "ta", "-ta, as every pronoun takes");
    put("Answer to mõzo", w, "a bare pronoun as a whole reply");
  } else {
    put("After the verb", "sofuenaze " + w, "its commonest left neighbour");
    put("Joined to a long noun", "onãkõzã" + w, "if it cliticizes");
    put("Braced", "helãba lõji" + w + " sofuze", "long words both sides \u2014 \u00a71b.5");
    put("Full clause", "Lõjiwa noayeni kyõkuenaze " + w + ".", "in the tail");
  }
  return F;
}
const TONE = {rise:"\u2197 continuation rise", fall:"\u2198 fall",
              "question rise":"\u2934 question rise"};
function paintFrames(w, cls){
  if(!$("frames")) return;
  const hadIt = COINED.includes(w);
  if(!hadIt) LEX[w] = {g:"(candidate)", c: CMAP[cls] || "noun", real:false};
  try{ paintFramesInner(w, cls); }
  finally{ if(!hadIt) delete LEX[w]; }
}
function paintFramesInner(w, cls){ $("frames").innerHTML = framesHTML(w, cls); }
function framesHTML(w, cls){
  return "" +
    `<label style="display:block">Say these before you keep it</label>` +
    `<p class="hint">A phrase runs to a comma, to norõ, or to the end of the sentence, and has one accent (Grammar \u00a71). | marks a comma or norõ \u2014 a slight pause. \u2016 is the end of a sentence. There is no beat after ni. The tone sits on the phrase edge.</p>` +
    framesFor(w, cls).map(f=>{
      if(f.legality)
        return `<div style="margin:16px 0 0;opacity:.5;border-top:1px solid var(--line);padding-top:10px">
          <div class="hint">${f.l} \u2014 ${f.why}. No edge in it, so there is no contour to judge.</div>
          <div style="font-size:17px">${f.line}</div></div>`;
      let a; try{ a = analyse(f.line); }catch(e){ a = null; }
      if(!a) return `<div style="margin:12px 0 0"><div class="hint">${f.l}</div>
                     <div style="font-size:19px">${f.line}</div></div>`;
      const total = a.phrases.reduce((n,p)=>n+p.moras,0);   // 2026-10-11: no beat mora after ni
      return `<div style="margin:16px 0 0">
        <div class="hint" style="opacity:.7">${f.l}${f.why ? " \u2014 " + f.why : ""}</div>
        <div style="font-size:19px;margin:2px 0">${marked(a)}</div>
        <div class="hint">${total} moras total</div>
        ${(d => d ? `<div class="hint" style="opacity:.75">whispered: ${d}</div>` : "")(Prosody.devoiced(f.line))}
        ${a.phrases.map(p=>`<div class="hint" style="opacity:.75;margin-top:3px">
            ${p.toks.join(" ")} \u00b7 ${p.moras}m \u00b7 ${TONE[p.contour]} on
            \u00ab${p.edge}\u00bb${p.weakEdge ? " (weak edge \u2014 toma is not a clitic)" : ""}
            <br><span style="opacity:.8">stress: ${p.stress}</span></div>`).join("")}
        ${a.warn.map(x=>`<div class="hint" style="margin-top:4px;${x.lvl==="note"?"opacity:.6":"color:#c77"}">${x.t}</div>`).join("")}
      </div>`;
    }).join("");
}

/* Turn the fired rules into the prose the Dictionary actually uses:
   "R3 killed the unstressed u, R4 ate the l." */
function rulePhrases(res, src){
  const fired = res.steps.filter(s=>s.fired);
  if(!fired.length) return "No rule fires.";
  const forms = [src.toLowerCase()].concat(res.steps.map(s=>s.form));
  // What a rule removed, by letter, ignoring order — the mid-derivation
  // spelling drops a surviving coda n, so position-based diffing misreads R4.
  const removed = i => {
    const b = forms[i+1].split("");
    return forms[i].split("").filter(c => {
      const k = b.indexOf(c);
      if(k < 0) return true;
      b.splice(k,1); return false;
    });
  };
  const r5fired = res.steps.some(st => st.id==="R5" && st.fired);
  const out = [];
  res.steps.forEach((st,i)=>{
    if(!st.fired) return;
    const gone = removed(i);
    const c = gone[0] || "";
    switch(st.id){
      case "R1": out.push("R1 collapsed the nasal cluster"); break;
      case "R2": out.push("R2 turned an unstressed vowel into a glide"); break;
      case "R3": out.push("R3 killed the unstressed *u*"); break;
      case "R4": {
        const nKept = r5fired && gone.includes("n");
        const eaten = gone.filter(x => !(nKept && x === "n"));
        out.push(
          eaten.length && nKept ? `R4 ate the *${eaten[0]}* and kept the *n* as a coda`
          : eaten.length        ? `R4 ate the *${eaten[0]}*`
          : nKept               ? "R4 kept the *n* as a coda"
          :                       "R4 reduced the cluster");
        break;
      }
      case "R5": out.push("R5 nasalized"); break;
      case "R6": out.push("R6 lowered"); break;
      case "R8": out.push("R8 palatalized"); break;
      case "R13": out.push("R13 fronted the *u* before an *i*"); break;
      case "R9": out.push("R9 affricated *t* before *u*"); break;
      case "R10": out.push("R10 elided"); break;
      default: out.push(st.id + " fired");
    }
  });
  return out.join(", ") + ".";
}

const CLASSLABEL = {verb:"verb", adjv:"verb — adjectival", irreg:"verb — nasal-final",
  dnoun:"deverbal noun", pnoun:"primary noun", func:"function word", pron:"pronoun", any:"class"};

function keepWord(res, src){
  const w = res.spelling;
  // Keeping before the gloss is written is an ordinary thing to do, so a second
  // Keep updates the entry instead of refusing it.
  if(COINED.includes(w) &&
     !confirm(w + " is already in the lexicon as \"" + LEX[w].g + "\".\n\nUpdate it and re-emit the entry?")) return;
  const existed = COINED.includes(w);
  const cls = $("cls2").value;
  const gloss = $("kGloss").value.trim();
  const rel = $("kRelated").value.trim();
  const note = $("kNote").value.trim();

  const field = ($("kField").value.trim() || $("fField").value.trim()).toLowerCase();
  const prev = LEX[w] || {};
  LEX[w] = {g: gloss || "(no gloss yet)", c: CMAP[cls] || "noun", real: true,
            p: src.toUpperCase(), d: prev.d || stamp(), how: lastDraw || prev.how || "", k: cls};
  if(field) LEX[w].f = field; else if(prev.f) LEX[w].f = prev.f;
  saveLex();
  logLine(`${stamp()}  ${existed ? "UPDATED" : "KEPT"} ${src.toUpperCase()} → ${w} /${res.ipa}/  ${gloss}`);

  const lines = [
    `### ${w}`,
    `**/${res.ipa}/** · *${CLASSLABEL[cls] || "class"}*`,
    `1. ${gloss}`,
    `< ${src.toUpperCase()}`
  ];
  if(rel) lines.push(`~ related: ${rel}`);
  lines.push(`» ${rulePhrases(res, src)}${lastDraw ? " " + lastDraw : ""}`);
  if(note) lines.push(`» ${note}`);
  lines.push(`[coined ${stamp()}]`);
  const entry = lines.join("\n");

  $("entryOut").innerHTML = `<label style="margin-top:12px;display:block">Dictionary entry</label>
    <pre id="entry">${entry.replace(/</g,"&lt;")}</pre>
    <button class="btn ghost" id="copyEntry">Copy entry</button>
    <p class="hint">${Object.keys(LEX).length} words in the lexicon${existed ? ", entry updated" : ""}. Paste this under the right heading in Dictionary.md.</p>`;
  $("copyEntry").onclick = () => {
    navigator.clipboard.writeText(entry);
    $("copyEntry").textContent = "Copied";
  };
  renderLex();
  const sl = sentLines($("kSent") ? $("kSent").value : "");
  const pbn = saveSentences(w, gloss, sl);
  if(pbn) $("entryOut").insertAdjacentHTML("beforeend",
    `<p class="hint">Saved ${pbn} sentence${pbn === 1 ? "" : "s"} to the phrasebook.</p>`);
  kSentVal = "";
  const filled = fillSlots(w, gloss);
  if(filled) $("entryOut").insertAdjacentHTML("beforeend",
    `<p class="hint">Filled ${filled} phrasebook slot${filled===1?"":"s"} with <span class="lun">${w}</span>. Say ${filled===1?"it":"them"} in the Phrases tab.</p>`);
  qAfterKeep(w, src, gloss);
}

/* ══════════ paradigm ══════════ */
// True IPA where it is shown in slashes. The orthography is not the phonology:
// y is /j/, r is /ɾ/, ny is /ɲ/, tu is /tsu/, si is /ʃi/, zi is /ʒi/, and a
// nasal vowel is written Vn but held: /ãː/.
const NASV = {a:"ãː", e:"ẽː", i:"ĩː", o:"õː", u:"ũː"};
function ipaSyl(t, nasal){
  // 2026-10-11: a closed syllable (jil, mer) was returned raw, so lõjilli read /lõː.jil.li/
  const m = t.match(/^([^aeiouüö]*)([aeiouüö])(n?)([^aeiouüö]*)$/);
  if(!m) return t;
  let [, ons, v, , coda] = m, out = "";
  if(ons === "ts" || (ons === "t" && (v === "u" || v === "ü") && !nasal)) out = "ts";
  else if(ons === "ny") out = "ɲ";
  else if(ons === "sh" || (ons === "s" && v === "i")) out = "ʃ";
  else if(ons === "j" || (ons === "z" && v === "i")) out = "ʒ";
  else out = ons.split("").map(c => c === "r" ? "ɾ" : c === "y" ? "j" : c).join("");
  return out + (nasal ? NASV[v] : (OVIPA[v] || v)) + (coda || "").replace(/r/g, "ɾ");
}
function ipaOf(w){
  w = toN(w);
  try{
    const sy = Prosody.sylsOf(w), st = Prosody.stressIdx(w);
    if(!sy.length) throw 0;
    return sy.map((s, i) => (i === st ? "ˈ" : "") + ipaSyl(s.t, s.nasal)).join(".");
  }catch(e){
    try{ return Prosody.ipaWord(w); }catch(e2){ return w; }
  }
}
const nasalFinal = w => /[aio]n$/.test(toN(w));
// Phonology §6: a nasal vowel before a bare glide takes the apostrophe, or
// aoyanwa would read /a.o.ja.nwa/ — the n taken as an onset before w.
const J = (w, p) => toTilde(nasalFinal(w) && /^[nyw]/.test(p) ? toN(w) + "'" + p : toN(w) + p);
/* 2026-10-11 — Grammar §1: a row of several words is one phrase, with one accent
   on its last heavy syllable (else its final one), and liaison inside it. Until
   build 2026-10-11-2245 each word was transcribed with its own accent. */
function ipaPhrase(form){
  const toks = form.split(" ").filter(Boolean);
  const flat = [];
  toks.forEach(t => Prosody.sylsOf(toN(t)).forEach((s, si) =>
    flat.push({t: s.t, nasal: s.nasal, coda: s.coda, first: si === 0})));
  if(!flat.length) return form;
  for(let i = 0; i < flat.length - 1; i++){
    const a = flat[i], b = flat[i + 1];
    if(b.first && a.nasal && /^[aeiou\u00fc\u00f6]/.test(b.t)){
      a.t = a.t.replace(/n$/, ""); a.nasal = false; b.t = "n" + b.t; b.liaised = true;
    }
  }
  let k = -1; flat.forEach((x, i) => { if(x.nasal || x.coda) k = i; });
  if(k < 0) k = flat.length - 1;
  return flat.map((x, i) => (i > 0 ? (x.liaised ? "\u203f" : x.first ? " " : ".") : "") +
    (i === k ? "\u02c8" : "") + ipaSyl(x.t, x.nasal)).join("");
}
function pdRow(label, form, note, base){
  const toks = form.split(" ");
  let phon;
  try{ phon = toks.length > 1 ? ipaPhrase(form) : ipaOf(form); }catch(e){ phon = form; }
  const m = toks.reduce((a,t) => { try{ return a + Prosody.morasOfWord(t); }catch(e){ return a; } }, 0);
  let moved = false;
  if(base && toks[0] !== base){
    try{
      const bs = Prosody.sylsOf(base), fs = Prosody.sylsOf(toks[0]);
      const bi = Prosody.stressIdx(base), fi = Prosody.stressIdx(toks[0]);
      moved = bi !== fi || (bs[bi] && fs[fi] && bs[bi].t !== fs[fi].t);
    }catch(e){}
  }
  return `<tr><td style="color:var(--dim);font-size:13px">${label}</td>
    <td><div class="lun" style="font-size:18px">${esc(form)}</div>
    <div class="hint" style="margin:0">/${esc(phon)}/ · ${m}m${moved ? ' · <span style="color:var(--lamp)">stress moves</span>' : ""}</div>
    ${note ? `<div class="hint" style="margin:2px 0 0;opacity:.8">${note}</div>` : ""}</td></tr>`;
}
let pdTable = (title, rows) => `<div class="panel"><h2 style="margin:0 0 8px">${title}</h2><table>${rows.join("")}</table></div>`;

function nounTables(w){
  const nas = nasalFinal(w);
  const top = nas ? w + "a" : w + "na", obj = J(w, "ni");
  return [
    pdTable("Case", [
      pdRow("bare", w, "unspecified for number — one or many", w),
      pdRow("topic", top, nas ? "the nasal dissolves into an onset — <em>as for</em>" : "<em>as for</em> · persists across sentences", w),
      pdRow("subject", w + "ba", "presentative with the existence verbs (§4.7a)", w),
      pdRow("object", obj, nas ? "apostrophe: the nasal holds before <em>ni</em>" : "", w),
      pdRow("possessive", w + "pe", "also the general noun-to-noun link", w),
      pdRow("possessive, before a vowel", w + "p'akyoza", "<em>pe</em> drops its vowel before any vowel (\u00a71b.4)", null),
      pdRow("location", J(w, "wa"), nasalFinal(w) ? "apostrophe: the nasal holds before a glide (Phonology §6)" : "place and time both", w),
      pdRow("oblique", w + "di", "to, with, by, about — not <em>from</em>", w),
      pdRow("object, before <em>ila</em>", obj.slice(0, -1) + "'ila sofu", "<em>ni</em> drops before <em>i</em> or <em>ĩ</em> (\u00a71b.4)", null),
      pdRow("source", w + " toma", "from — written separate", w),
      pdRow("standard, after <em>kügi</em>", leanJoin("kügi", w), "than — <em>kügi</em> stands before it and drops its <em>i</em> before a vowel; the <em>ü</em> stays (\u00a75.4)", null),
      pdRow("equative", w + " uan", "as … as — after the standard (\u00a75.4)", w)
    ]),
    pdTable("Number, size, count", [
      pdRow("plural", w + "ta", "animates only — when it acts (§3.3). Never on plants or objects", w),
      pdRow("plural subject", w + "taba", "", w),
      pdRow("diminutive", w + "jo", "little; dear — names and kin terms", w),
      pdRow("three, animate", "kire " + w, "counter and <em>-ta</em> never co-occur", null),
      pdRow("three, inanimate", "kiko " + w, "", null),
      pdRow("that", "na " + w, "demonstrative precedes; covers <em>the</em>", null)
    ]),
    pdTable("With existence", [
      pdRow("there is (animate)", w + "ba hin", "introducing something that acts", null),
      pdRow("there is (inanimate)", w + "ba yozu", "", null),
      pdRow("it is here", top + " hin", "locating a known referent — topic, not <em>ba</em>", null)
    ])
  ].join("");
}
function pronTables(w){
  const nas = nasalFinal(w);
  return pdTable("Pronoun", [
    pdRow("bare", w, "a whole answer — or said at all only for contrast (§2.3)", w),
    pdRow("subject", w + "ba", "contrastive; a neutral sentence drops it", w),
    pdRow("object", J(w, "ni"), nas ? "apostrophe: the nasal holds before <em>ni</em>" : "", w),
    pdRow("possessive", w + "pe", "the most-said pronoun form", w),
    pdRow("topic", nas ? w + "a" : w + "na", "", w),
    pdRow("oblique", w + "di", "", w),
    pdRow("location", J(w, "wa"), nasalFinal(w) ? "apostrophe: the nasal holds before a glide (Phonology §6)" : "", w),
    pdRow("source", w + " toma", "", w),
    pdRow("plural", w + "ta", "", w),
    pdRow("plural subject", w + "taba", "", w),
    pdRow("possessor + noun", w + "p'akyozana", "my/your name — as topic; <em>pe</em> drops its vowel before a vowel (\u00a71b.4)", null)
  ]);
}
function verbTables(w){
  // 2026-10-03 — Grammar §4: five endings in a fixed order, then one clause
  // particle. Nasal-final verbs are regular; only §1a's link sets them apart.
  const nas = nasalFinal(w), V = function(){ return verbForm.apply(null, [w].concat([].slice.call(arguments))); };
  const link = nas ? "the nasal links \u2014 it leaves the vowel and becomes an onset" : "theme <em>-u</em> never drops";
  const aux = !!(LEX[w] && LEX[w].c === "aux");
  const A = leanJoin;                             // ila + onu → il'onu
  const T = [
    pdTable("Tense and aspect", [
      pdRow("non-past", w, "present and future", w),
      pdRow("past", V("ze"), nas ? "the nasal stays in the vowel before a consonant" : "", w),
      pdRow("ongoing", V("ri"), "", w),
      pdRow("ongoing, past", V("ri", "ze"), "", w),
      // 2026-10-07 — Grammar §4.2: aspect is a particle in front of the verb
      pdRow("completed", A("ila", w), "the particle stands in front and takes no ending" + (startsV(w) ? "; it drops its vowel before a vowel" : ""), null),
      pdRow("completed, past", A("ila", V("ze")), "the tense stays on the verb", null),
      pdRow("habitual", A("zoka", w), "it always has been so, and nothing suggests it is stopping", null),
      pdRow("habitual, for now", A("zoka", V("ri")), "it was not a habit before", null),
      pdRow("used to \u2014 may still be going on", A("zoka", V("ri", "ze")), "the speaker does not know", null),
      pdRow("used to \u2014 certainly over", A("zoka", V("ze")), "", null)
    ]),
    pdTable("Negation \u2014 the ending -ena, before the tense", [
      pdRow("negative", V("ena"), link, w),
      pdRow("past negative", V("ena", "ze"), "", w),
      pdRow("ongoing negative", V("ri", "ena"), "", w),
      pdRow("hasn't", A("ila", V("ena")), "an aspect particle takes nothing: <em>-ena</em> stays on the verb", null),
      pdRow("hadn't", A("ila", V("ena", "ze")), "", null),
      pdRow("doesn't habitually", A("zoka", V("ena")), "", null),
      pdRow("don't!", V("ena"), "the bare negative is the command", w)
    ])];
  if(!aux) T.push(
    pdTable("Can and want to \u2014 -bi, then -du", [
      pdRow("can", V("bi"), "", w),
      pdRow("could", V("bi", "ze"), "", w),
      pdRow("can't", V("bi", "ena"), "", w),
      pdRow("couldn't", V("bi", "ena", "ze"), "", w),
      pdRow("want to", V("du"), /du$/.test(w) ? "the syllable doubles \u2014 legal, a watch item (Grammar \u00a78)" : "", w),
      pdRow("wanted to", V("du", "ze"), "", w),
      pdRow("don't want to", V("du", "ena"), "", w),
      pdRow("want to be able to", V("bi", "du"), "the order is fixed: never <em>-du-bi</em>", w),
      pdRow("has been able to", A("ila", V("bi")), "the aspect particles take no endings, so <em>-bi</em> and <em>-du</em> stay on the verb", null),
      pdRow("habitually wants to", A("zoka", V("du")), "", null),
      pdRow("make (him) \u2026", w + " tsumobã", "the causer is the subject", w),
      pdRow("has made (him) \u2026", A("ila", w) + " tsumobã", "the particle opens the complex, in front of the main verb", null),
      pdRow("can make (him) \u2026", w + " tsumobãbi", "<em>tsumobã</em> is a full verb, so position carries scope", w),
      pdRow("didn't make (him) \u2026", w + " tsumobanenaze", "", w),
      // 2026-10-11 — Grammar §4.3, §4.10: -ena goes on the verb it negates; idovu,
      // to let, is the second auxiliary verb, built as tsumobã is
      pdRow("make (him) not \u2026", V("ena") + " tsumobã", "<em>-ena</em> goes on the verb it negates; the tense stays on the auxiliary", null),
      pdRow("let (him) \u2026", w + " idovu", "the second auxiliary verb, built as <em>tsumobã</em> is: the one allowed takes <em>ni</em>, or <em>di</em> if the verb has an object", w),
      pdRow("don't let (him) \u2026", w + " idovuena", "the way round a double <em>-ena</em> (Grammar \u00a74.3)", w),
      pdRow("didn't let (him) \u2026", w + " idovuenaze", "", w)
    ]));
  // 2026-10-11 — Grammar §4.11 and §2.6
  if(!aux){
    const VU = /vu$/.test(w) ? "the syllable doubles \u2014 legal, a watch item (Grammar \u00a78)" : "";
    const G = V("ga");
    T.push(pdTable("State and agent \u2014 -vu, -ga", [
      pdRow("to be ___ed", V("vu"), (VU ? VU + ". " : "") + "the state the action leaves \u2014 of the object, or of the subject for a verb of change. Not used where the action leaves no state", w),
      pdRow("was ___ed", V("vu", "ze"), "<em>-vu</em> stands right after the root; every ending follows", w),
      pdRow("isn't ___ed", V("vu", "ena"), "", w),
      pdRow("was ___ed by you", "lwajidi " + V("vu", "ze"), "a passive: the doer takes <em>di</em>", null),
      pdRow("-able", V("vu", "bi"), "<em>-vu</em> then <em>-bi</em>", w),
      pdRow("un-\u2026-able", V("vu", "bi", "ena"), "", w),
      pdRow("a ___ed door", V("vu") + " omime", "before a noun, like any verb (\u00a75.1)", null),
      pdRow("one who ___s", G, "a noun, animate only \u2014 a trait as readily as a trade", w),
      pdRow("ones who ___", joinSuffix(G, "ta"), "", w),
      pdRow("one who doesn't", V("ena", "ga"), "after <em>-vu</em>, <em>-bi</em>, <em>-du</em> or <em>-ena</em>; never after <em>-ri</em> or <em>-ze</em>", w),
      pdRow("one who wants to", V("du", "ga"), "", w),
      pdRow("the ___ed one", V("vu", "ga"), "watch: one syllable from <em>" + esc(G) + "</em>, opposite roles (Grammar \u00a78)", w),
      pdRow("one who ___s doors", elideLine("omimepe " + G), "what it is done to comes first, with <em>pe</em>", null)
    ]));
  }
  T.push(
    pdTable("Clause particles \u2014 after every ending, at most one", [
      pdRow("if", V("na"), nas ? "after a nasal the topic is <em>-a</em> and the nasal dissolves" : "the topic particle on a clause", w),
      pdRow("if \u2026 not", V("ena", "na"), "", w),
      pdRow("if \u2026 did", V("ze", "na"), "", w),
      pdRow("if \u2026 didn't", V("ena", "ze", "na"), "", w),
      pdRow("when", V("wa"), "", w),
      pdRow("when \u2026 did", V("ze", "wa"), "", w),
      pdRow("because", V("di"), "", w),
      pdRow("because \u2026 didn't", V("ena", "ze", "di"), "", w)
    ]),
    pdTable("Mood and evidence \u2014 free words after the verb", [
      pdRow("question", w + " jĩ", "", w),
      pdRow("past question", V("ze") + " jĩ", "answered by echo: <em>" + esc(V("ze")) + "</em> or <em>" + esc(V("ena", "ze")) + "</em>", w),
      pdRow("negative question", V("ena", "ze") + " jĩ", "", w),
      pdRow("command", w, "the bare verb", w),
      pdRow("heard, not seen", V("ze") + " la", "direct non-visual", w),
      pdRow("inferred", V("ze") + " po", "from evidence", w),
      pdRow("assumed", V("ze") + " ke", "from what I generally know", w),
      pdRow("\u2026 but", V("ze") + " norõ", "clause-final coordinator", w)
    ]),
    pdTable("Before a noun or verb", [
      pdRow("attributive", w + " helã", "before a noun \u2014 also the relative clause", null),
      pdRow("attributive, negative", V("ena") + " helã", "each clause carries its own negation (\u00a76.2)", null),
      pdRow("adverbial", w + " sofu", "before a verb \u2014 no suffix", null),
      pdRow("comparative", "onãkõzãba kügi lõji " + w, "<em>kügi</em> before the standard \u2014 only meaningful on adjectival verbs (\u00a75.4)", null),
      pdRow("equative", "onãkõzãba lõji uã " + w, "<em>uã</em> after the standard (\u00a75.4)", null)
    ]));
  return T.join("");
}
function paintParadigm(){
  const w = $("pdWord").value.trim().toLowerCase();
  if(!w){ $("pdOut").innerHTML = ""; return; }
  const e = LEX[w];
  let c = $("pdClass").value || (e && e.c) || "";
  if(c === "aux") c = "verb";                    // an auxiliary verb is a verb; byõ and lõ were, until 2026-10-07
  if(!["noun","verb","pron"].includes(c)){
    $("pdOut").innerHTML = e
      ? `<p class="hint">${esc(w)} is stored as a ${esc(e.c)}. Function words don't inflect, so there is no paradigm — choose a class above if the stored one is wrong.</p>`
      : `<p class="hint">${esc(w)} isn't in the lexicon. Choose a class above to see its forms anyway.</p>`;
    return;
  }
  const head = `<p class="hint">${esc(w)} · ${e ? esc(e.g) : "not in the lexicon"} · ${c === "pron" ? "pronoun" : c}${nasalFinal(w) ? " · nasal-final, so it alternates" : ""}</p>`;
  const hadIt = !!e;
  if(!hadIt) LEX[w] = {g:"(preview)", c, real:false};
  try{
    $("pdOut").innerHTML = head + (c === "noun" ? nounTables(w) : c === "verb" ? verbTables(w) : pronTables(w));
  } finally { if(!hadIt) delete LEX[w]; }
}
function fillPdList(){
  $("pdList").innerHTML = Object.keys(LEX).filter(w => ["noun","verb","pron","aux"].includes(LEX[w].c)).sort()
    .map(w => `<option value="${esc(w)}">`).join("");
}

function joinSuffix(w, suf){
  if(!suf) return w;
  w = toN(w);                                   // work in the n-form, write tilde
  const nas = /[aeiou]n$/.test(w);
  // topic first: -na after a nasal dissolves it (aoyã → aoyana, Grammar §1a).
  // 2026-09-30 — this line sat second, so the n-rule below caught -na too.
  if(nas && suf === "na") return toTilde(w + "a");
  if(nas && /^[nyw]/.test(suf)) return toTilde(w + "'" + suf);  // nasal holds before n, y, w
  if(!nas && suf === "a") return toTilde(w + "na");
  return toTilde(w + suf);
}
/* ── dictionary hooks ── */
let OUT = null, FULL = true;
pdRow = function(label, form, note, base){
  const toks = form.split(" ");
  const row = {label, form, note: note || "", single: toks.length === 1};
  if(!FULL) return row;
  let phon;
  try{ phon = toks.length > 1 ? ipaPhrase(form) : ipaOf(form); }catch(e){ phon = form; }
  const m = toks.reduce((a,t) => { try{ return a + Prosody.morasOfWord(t); }catch(e){ return a; } }, 0);
  let moved = false;
  if(base && toks[0] !== base){
    try{
      const bs = Prosody.sylsOf(base), fs = Prosody.sylsOf(toks[0]);
      const bi = Prosody.stressIdx(base), fi = Prosody.stressIdx(toks[0]);
      moved = bi !== fi || (bs[bi] && fs[fi] && bs[bi].t !== fs[fi].t);
    }catch(e){}
  }
  row.ipa = phon; row.moras = m; row.moved = moved;
  return row;
};
pdTable = (title, rows) => { OUT.push({title, rows}); return ""; };
function classOf(w){ const e = LEX[w]; let c = e && e.c; if(c === "aux") c = "verb"; return ["noun","verb","pron"].includes(c) ? c : null; }
return {
  build: "build 2026-10-24-1614",
  setLex(o){ LEX = lexKeys(o || {}); SUFFIX = null; },
  lex(){ return LEX; },
  classOf,
  forms(w, full){
    const c = classOf(w); if(!c) return null;
    OUT = []; FULL = full !== false;
    try{ c === "noun" ? nounTables(w) : c === "verb" ? verbTables(w) : pronTables(w); }
    finally{ FULL = true; }
    const r = OUT; OUT = null; return r;
  },
  ipa(w){ try{ return ipaOf(w); }catch(e){ return w; } },
  verbStem(t){ try{ return verbStem(t); }catch(e){ return null; } },
  agentParse(t){ try{ return agentParse(t); }catch(e){ return null; } },
  unelide(t){ try{ return unelide(t); }catch(e){ return [t]; } },
  toTilde, toN, tildeKeys
};
})({
  getItem(k){ try{ return window.localStorage.getItem(k); }catch(e){ return null; } },
  setItem(){}, removeItem(){}
});
