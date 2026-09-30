/* cashart.js — hand-drawn banknotes & coins for every currency SinghoWallet
   supports. Loaded lazily by wallet.js the first time the Cash tab opens, so
   no other page ever pays for it. Each denomination is drawn once as an SVG
   <symbol> and stamped repeatedly with <use> — the DOM stays tiny no matter
   how large the balance is. All motifs are drawn in translucent white ink so
   they read on any banknote color. */

/* ink palette */
const A = 'rgba(255,255,255,.92)', B = 'rgba(255,255,255,.66)', C = 'rgba(255,255,255,.4)',
  D = 'rgba(255,255,255,.17)', K = 'rgba(0,0,0,.3)';

/* ---------------- the motif library (each drawn on a 120x84 canvas) ------- */
export const MOTIFS = {
  /* landscapes */
  mountain: `<path d="M8 74 L44 22 L62 48 L82 14 L114 74 Z" fill="${D}"/><path d="M44 22 L36 36 L44 40 L50 31 L56 40 L64 36 Z" fill="${B}"/><path d="M82 14 L74 28 L81 31 L87 23 L93 30 L100 27 Z" fill="${B}"/><path d="M8 74 H114" stroke="${C}" stroke-width="2"/>`,
  volcano: `<path d="M16 74 L58 22 L102 74 Z" fill="${D}"/><path d="M50 30 h16 l-5 9 h-6 Z" fill="${B}"/><circle cx="44" cy="18" r="5" fill="${C}"/><circle cx="62" cy="12" r="6" fill="${C}"/><circle cx="80" cy="17" r="4" fill="${C}"/><path d="M16 74 H102" stroke="${C}" stroke-width="2"/>`,
  geyser: `<path d="M30 74 q30 -10 60 0 l-8 -12 H38 Z" fill="${D}"/><path d="M60 60 q-6 -20 2 -34 q2 -8 10 -12 q-6 12 -2 22 q-6 -2 -8 -10 q-4 12 2 22 q4 6 -4 12 Z" fill="${C}"/><circle cx="50" cy="20" r="2.5" fill="${C}"/><circle cx="72" cy="26" r="2.5" fill="${C}"/><circle cx="66" cy="12" r="2" fill="${C}"/>`,
  pyramid: `<path d="M12 74 H108 L98 60 H22 Z" fill="${D}"/><path d="M26 60 H94 L84 47 H36 Z" fill="${D}"/><path d="M40 47 H80 L72 36 H48 Z" fill="${D}"/><rect x="54" y="28" width="12" height="8" rx="2" fill="${B}"/><path d="M60 74 V28" stroke="${C}" stroke-width="2" stroke-dasharray="3 4"/>`,
  /* buildings */
  mosque: `<rect x="22" y="46" width="52" height="28" fill="${D}"/><path d="M22 48 Q48 18 74 48 Z" fill="${B}"/><path d="M46 24 q2 -9 4 -12" stroke="${B}" stroke-width="3" fill="none"/><circle cx="51" cy="10" r="3" fill="${B}"/><rect x="12" y="26" width="7" height="48" rx="3" fill="${D}"/><rect x="77" y="26" width="7" height="48" rx="3" fill="${D}"/><circle cx="15.5" cy="22" r="3.5" fill="${B}"/><circle cx="80.5" cy="22" r="3.5" fill="${B}"/><path d="M42 74 v-12 q6 -8 12 0 v12 Z" fill="${K}"/>`,
  pagoda: `<path d="M14 34 Q34 24 60 24 Q86 24 106 34 L98 40 H22 Z" fill="${B}"/><rect x="46" y="40" width="28" height="10" fill="${D}"/><path d="M20 54 Q40 46 60 46 Q80 46 100 54 L92 59 H28 Z" fill="${B}"/><rect x="46" y="59" width="28" height="8" fill="${D}"/><path d="M26 73 Q43 66 60 66 Q77 66 94 73 L88 77 H32 Z" fill="${B}"/><path d="M60 24 V14" stroke="${B}" stroke-width="2"/><circle cx="60" cy="12" r="3" fill="${B}"/>`,
  heaven: `<ellipse cx="60" cy="66" rx="42" ry="8" fill="${D}"/><ellipse cx="60" cy="52" rx="30" ry="7" fill="${B}"/><ellipse cx="60" cy="40" rx="21" ry="6" fill="${B}"/><ellipse cx="60" cy="29" rx="13" ry="5" fill="${B}"/><path d="M60 29 V14 L65 17 L60 20" fill="${B}"/><rect x="54" y="66" width="12" height="8" fill="${D}"/>`,
  gatek: `<path d="M16 30 Q38 20 60 20 Q82 20 104 30 L96 36 H24 Z" fill="${B}"/><path d="M22 48 Q41 40 60 40 Q79 40 98 48 L90 53 H30 Z" fill="${B}"/><rect x="34" y="53" width="52" height="21" fill="${D}"/><path d="M52 74 V60 h16 v14 Z" fill="${K}"/>`,
  temple: `<path d="M14 34 L60 18 L106 34 Z" fill="${B}"/><rect x="18" y="38" width="84" height="6" fill="${B}"/><rect x="24" y="44" width="8" height="26" fill="${D}"/><rect x="45" y="44" width="8" height="26" fill="${D}"/><rect x="67" y="44" width="8" height="26" fill="${D}"/><rect x="88" y="44" width="8" height="26" fill="${D}"/><rect x="16" y="70" width="88" height="6" fill="${B}"/>`,
  clocktower: `<path d="M40 26 L60 8 L80 26 Z" fill="${B}"/><rect x="44" y="26" width="32" height="48" fill="${D}"/><circle cx="60" cy="42" r="11" fill="${C}"/><path d="M60 42 V35 M60 42 L65 45" stroke="${A}" stroke-width="2" fill="none"/><rect x="36" y="74" width="48" height="4" fill="${B}"/><rect x="70" y="30" width="3" height="44" fill="${C}"/>`,
  castle: `<path d="M20 74 V34 h6 v-6 h6 v6 h6 v-6 h6 v6 h6 V74 Z" fill="${D}"/><path d="M84 26 h4 v-5 h5 v5 h5 v-5 h5 v5 h4 V74 H84 Z" fill="${D}"/><path d="M50 74 V62 q5 -7 10 0 v12 Z" fill="${K}"/><rect x="92" y="56" width="8" height="18" fill="${K}"/><path d="M20 34 h30" stroke="${B}" stroke-width="3"/>`,
  towers: `<path d="M36 74 L42 12 H48 L54 74 Z" fill="${D}"/><path d="M66 74 L72 12 H78 L84 74 Z" fill="${D}"/><path d="M42 12 H48 M72 12 H78" stroke="${B}" stroke-width="2"/><rect x="46" y="44" width="28" height="5" rx="2" fill="${B}"/><path d="M45 8 h6 M69 8 h6" stroke="${B}" stroke-width="3"/>`,
  towerhouse: `<rect x="38" y="18" width="44" height="56" fill="${D}"/><path d="M38 30 H82 M38 44 H82 M38 58 H82" stroke="${B}" stroke-width="4"/><path d="M46 24 h6 v5 h-6 Z M68 24 h6 v5 h-6 Z" fill="${K}"/><rect x="52" y="62" width="16" height="12" fill="${K}"/><path d="M56 12 h8 l-4 -6 Z" fill="${B}"/>`,
  spiral: `<path d="M28 74 L60 14 L92 74 Z" fill="${D}"/><path d="M34 68 Q60 56 86 68 M40 58 Q60 48 80 58 M46 48 Q60 41 74 48" stroke="${B}" stroke-width="3" fill="none"/>`,
  archgate: `<path d="M20 74 V26 h80 v48 Z" fill="${D}"/><path d="M44 74 V52 q16 -18 32 0 v22 Z" fill="${K}"/><path d="M20 34 h80" stroke="${B}" stroke-width="3"/><circle cx="76" cy="42" r="4" fill="${B}"/><circle cx="44" cy="42" r="4" fill="${B}"/>`,
  stupa: `<rect x="26" y="66" width="68" height="8" fill="${D}"/><path d="M32 66 Q60 30 88 66 Z" fill="${B}"/><path d="M60 34 V16" stroke="${B}" stroke-width="3"/><circle cx="60" cy="12" r="4" fill="${B}"/><path d="M50 46 q4 -6 10 0 M60 46 q4 -6 10 0" stroke="${K}" stroke-width="2" fill="none"/>`,
  angkor: `<rect x="14" y="66" width="92" height="8" fill="${D}"/><path d="M40 66 V40 q20 -22 40 0 v26 Z" fill="${B}"/><path d="M22 66 V50 q9 -12 18 0 v16 Z" fill="${B}"/><path d="M80 66 V50 q9 -12 18 0 v16 Z" fill="${B}"/><path d="M52 34 h16 l-8 -12 Z" fill="${B}"/>`,
  onion: `<rect x="30" y="52" width="60" height="22" fill="${D}"/><path d="M40 52 q0 -18 12 -24 q-2 -6 2 -10 q6 6 4 12 q12 8 12 22 Z" fill="${B}"/><path d="M24 68 q0 -12 9 -17 q-1 -4 1 -7 q4 4 3 8 q9 6 9 16 Z" fill="${B}"/><path d="M96 68 q0 -12 -9 -17 q1 -4 -1 -7 q-4 4 -3 8 q-9 6 -9 16 Z" fill="${B}"/>`,
  windmill: `<path d="M50 74 L54 36 H66 L70 74 Z" fill="${D}"/><circle cx="60" cy="32" r="5" fill="${B}"/><path d="M60 32 L92 12 M60 32 L28 12 M60 32 L92 52 M60 32 L28 52" stroke="${B}" stroke-width="4"/><path d="M92 12 l6 -3 M28 12 l-6 -3 M92 52 l6 3 M28 52 l-6 3" stroke="${B}" stroke-width="3"/>`,
  lighthouse: `<path d="M48 74 L54 26 H66 L72 74 Z" fill="${D}"/><rect x="52" y="18" width="16" height="8" fill="${B}"/><path d="M56 18 V10 h8 v8 Z" fill="${B}"/><path d="M50 22 L18 12 M70 22 L102 12" stroke="${C}" stroke-width="4"/><path d="M44 74 H76" stroke="${B}" stroke-width="3"/>`,
  bridge: `<rect x="12" y="42" width="96" height="6" fill="${B}"/><path d="M24 48 q14 -20 28 0 M68 48 q14 -20 28 0" stroke="${B}" stroke-width="4" fill="none"/><path d="M24 48 V74 M52 48 V74 M96 48 V74" stroke="${D}" stroke-width="6"/>`,
  /* boats */
  ship: `<path d="M18 58 H102 L92 74 H28 Z" fill="${D}"/><rect x="46" y="34" width="20" height="24" fill="${D}"/><rect x="52" y="24" width="8" height="10" fill="${K}"/><circle cx="36" cy="66" r="3" fill="${K}"/><circle cx="60" cy="66" r="3" fill="${K}"/><circle cx="84" cy="66" r="3" fill="${K}"/><path d="M10 78 q6 -4 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0" stroke="${B}" stroke-width="2" fill="none"/>`,
  dhow: `<path d="M56 12 Q86 26 66 48 H50 Q34 30 56 12 Z" fill="${B}"/><path d="M24 58 H98 L88 72 H34 Z" fill="${D}"/><path d="M56 14 V58" stroke="${B}" stroke-width="3"/><path d="M12 78 q6 -4 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0" stroke="${B}" stroke-width="2" fill="none"/>`,
  junk: `<path d="M50 10 Q80 22 62 40 H46 Q32 24 50 10 Z" fill="${B}"/><path d="M78 18 Q98 28 86 44 H72 Q64 30 78 18 Z" fill="${B}"/><path d="M22 48 H100 L88 66 H34 Z" fill="${D}"/><path d="M12 72 q6 -4 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0" stroke="${B}" stroke-width="2" fill="none"/>`,
  longship: `<path d="M14 56 Q40 74 106 58 Q88 72 60 72 Q32 72 14 56 Z" fill="${D}"/><path d="M44 20 H80 L74 50 H50 Z" fill="${B}"/><path d="M44 28 H80 M46 38 H77" stroke="${C}" stroke-width="2"/><path d="M60 14 V58" stroke="${B}" stroke-width="3"/><circle cx="30" cy="60" r="4" fill="${B}"/><circle cx="90" cy="60" r="4" fill="${B}"/><path d="M106 58 q8 -6 6 -12" stroke="${B}" stroke-width="3" fill="none"/>`,
  /* animals */
  lion: `<circle cx="60" cy="42" r="24" fill="none" stroke="${D}" stroke-width="11" stroke-dasharray="9 5"/><circle cx="60" cy="42" r="15" fill="${B}"/><circle cx="38" cy="24" r="5" fill="${D}"/><circle cx="82" cy="24" r="5" fill="${D}"/><circle cx="54" cy="40" r="2" fill="${K}"/><circle cx="66" cy="40" r="2" fill="${K}"/><path d="M56 47 h8 l-4 5 Z" fill="${K}"/><path d="M60 52 v4 M60 56 q-3 3 -6 2 M60 56 q3 3 6 2" stroke="${K}" stroke-width="1.5" fill="none"/>`,
  elephant: `<circle cx="52" cy="48" r="24" fill="${D}"/><circle cx="82" cy="46" r="16" fill="${D}"/><path d="M92 54 q8 12 -2 18 q-8 4 -10 -4" stroke="${D}" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M74 36 q-10 -8 -18 2" stroke="${D}" stroke-width="10" fill="none"/><circle cx="88" cy="44" r="2" fill="${K}"/><path d="M40 70 v6 M56 70 v6" stroke="${D}" stroke-width="8"/><path d="M92 50 l6 -3" stroke="${B}" stroke-width="3"/>`,
  rhino: `<circle cx="56" cy="50" r="22" fill="${D}"/><path d="M74 44 q14 4 16 18 l-14 2 q-2 -10 -8 -14 Z" fill="${D}"/><path d="M86 46 l10 -8" stroke="${B}" stroke-width="5" stroke-linecap="round"/><circle cx="80" cy="48" r="2" fill="${K}"/><path d="M44 70 v6 M64 70 v6" stroke="${D}" stroke-width="8"/>`,
  giraffe: `<circle cx="46" cy="52" r="20" fill="${D}"/><path d="M58 44 q16 -6 18 -28" stroke="${D}" stroke-width="12" fill="none" stroke-linecap="round"/><circle cx="77" cy="14" r="7" fill="${D}"/><path d="M74 8 l-2 -6 M80 8 l2 -6" stroke="${B}" stroke-width="2"/><circle cx="79" cy="13" r="1.5" fill="${K}"/><path d="M40 58 l6 6 M48 50 l6 6" stroke="${B}" stroke-width="3"/><path d="M36 70 v6 M52 70 v6" stroke="${D}" stroke-width="7"/>`,
  antelope: `<circle cx="52" cy="52" r="18" fill="${D}"/><path d="M68 42 q6 -22 2 -32" stroke="${B}" stroke-width="4" fill="none"/><path d="M72 42 q12 -20 10 -30" stroke="${B}" stroke-width="4" fill="none"/><circle cx="70" cy="44" r="6" fill="${D}"/><circle cx="72" cy="43" r="1.5" fill="${K}"/><path d="M40 68 v6 M56 68 v6" stroke="${D}" stroke-width="7"/><path d="M34 46 l-12 8" stroke="${D}" stroke-width="5"/>`,
  zebra: `<path d="M30 56 q0 -20 24 -20 q22 0 26 16 l14 4 q4 4 -2 6 l-12 -2 q-4 12 -22 12 H38 q-8 -2 -8 -16 Z" fill="${B}"/><path d="M42 38 l-4 18 M54 36 l-2 20 M66 40 l2 16" stroke="${K}" stroke-width="3"/><path d="M78 50 q10 -2 14 -8" stroke="${B}" stroke-width="4" fill="none"/><circle cx="74" cy="46" r="1.5" fill="${K}"/><path d="M42 68 v6 M58 68 v6" stroke="${B}" stroke-width="6"/>`,
  camel: `<path d="M30 58 q0 -14 14 -14 q4 -10 12 -10 q8 0 10 8 q10 2 10 14 l10 2 q2 6 -6 6 H36 q-6 -2 -6 -6 Z" fill="${D}"/><path d="M74 34 q10 -4 14 -12" stroke="${D}" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="88" cy="20" r="6" fill="${D}"/><circle cx="90" cy="19" r="1.5" fill="${K}"/><path d="M40 66 v8 M58 66 v8" stroke="${D}" stroke-width="7"/>`,
  llama: `<ellipse cx="50" cy="54" rx="20" ry="14" fill="${D}"/><path d="M62 50 q6 -20 2 -34" stroke="${D}" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="64" cy="14" r="7" fill="${D}"/><path d="M58 8 q-2 -6 4 -6 M70 8 q2 -6 -4 -6" stroke="${B}" stroke-width="3" fill="none"/><circle cx="66" cy="13" r="1.5" fill="${K}"/><path d="M40 64 v8 M56 64 v8" stroke="${D}" stroke-width="7"/>`,
  horse: `<path d="M30 52 q0 -12 12 -12 h16 q8 0 10 8 l10 6 v8 q-16 6 -30 4 H38 q-8 -6 -8 -14 Z" fill="${B}"/><circle cx="34" cy="34" r="8" fill="${B}"/><path d="M30 28 l-4 -10 M38 28 l4 -10" stroke="${B}" stroke-width="3"/><path d="M28 70 v-8 M40 70 v-10 M60 70 v-10 M74 70 v-8" stroke="${B}" stroke-width="6"/><path d="M78 50 q10 4 8 16" stroke="${B}" stroke-width="4" fill="none"/><circle cx="31" cy="34" r="1.5" fill="${K}"/>`,
  ox: `<ellipse cx="52" cy="52" rx="24" ry="15" fill="${D}"/><path d="M74 40 q10 -2 16 -10" stroke="${D}" stroke-width="12" fill="none" stroke-linecap="round"/><circle cx="90" cy="30" r="7" fill="${D}"/><path d="M84 24 q-8 -10 -18 -8 M96 24 q8 -10 18 -8" stroke="${B}" stroke-width="4" fill="none"/><circle cx="92" cy="29" r="1.5" fill="${K}"/><path d="M40 64 v8 M60 64 v8" stroke="${D}" stroke-width="7"/>`,
  panda: `<circle cx="60" cy="46" r="22" fill="${B}"/><circle cx="44" cy="26" r="7" fill="${D}"/><circle cx="76" cy="26" r="7" fill="${D}"/><ellipse cx="50" cy="42" rx="7" ry="9" fill="${K}" transform="rotate(-14 50 42)"/><ellipse cx="70" cy="42" rx="7" ry="9" fill="${K}" transform="rotate(14 70 42)"/><circle cx="52" cy="42" r="2" fill="${A}"/><circle cx="68" cy="42" r="2" fill="${A}"/><path d="M56 54 q4 4 8 0" stroke="${K}" stroke-width="2" fill="none"/><ellipse cx="60" cy="66" rx="16" ry="9" fill="${D}"/>`,
  tiger: `<circle cx="56" cy="48" r="20" fill="${B}"/><path d="M42 32 l-4 -10 8 4 M70 32 l4 -10 -8 4" fill="${B}"/><circle cx="50" cy="46" r="2" fill="${K}"/><circle cx="62" cy="46" r="2" fill="${K}"/><path d="M54 52 q2 3 4 0" stroke="${K}" stroke-width="2" fill="none"/><path d="M44 40 l6 3 M48 36 l4 4 M68 40 l-6 3 M64 36 l-4 4" stroke="${K}" stroke-width="2"/><path d="M76 54 q12 2 12 12" stroke="${B}" stroke-width="5" fill="none"/><path d="M40 66 v8 M58 68 v8" stroke="${B}" stroke-width="6"/>`,
  kangaroo: `<ellipse cx="58" cy="46" rx="16" ry="22" fill="${D}" transform="rotate(18 58 46)"/><circle cx="76" cy="24" r="8" fill="${D}"/><path d="M70 18 l-4 -8 M80 16 l0 -8" stroke="${D}" stroke-width="4"/><circle cx="78" cy="23" r="1.5" fill="${K}"/><path d="M44 58 q-18 6 -24 18 q10 4 18 -2" stroke="${D}" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M60 64 q10 8 4 14 M50 66 q6 10 -2 14" stroke="${D}" stroke-width="7"/>`,
  dragon: `<path d="M16 62 q10 -18 28 -12 q4 -14 18 -12 q14 2 14 14 q10 2 10 12" stroke="${D}" stroke-width="10" fill="none" stroke-linecap="round"/><circle cx="88" cy="40" r="9" fill="${B}"/><path d="M80 34 l-6 -8 8 2 M96 32 l6 -8 2 8" fill="${B}"/><circle cx="91" cy="39" r="1.5" fill="${K}"/><path d="M96 44 q10 2 12 -6" stroke="${B}" stroke-width="3" fill="none"/><path d="M40 50 l0 -10 M56 38 l0 -9 M70 34 l0 -8" stroke="${B}" stroke-width="3"/>`,
  turtle: `<path d="M28 50 q32 -28 64 0 q-8 16 -32 16 q-24 0 -32 -16 Z" fill="${D}"/><path d="M40 52 l6 8 M60 52 l0 10 M80 52 l-6 8" stroke="${C}" stroke-width="2"/><circle cx="100" cy="52" r="7" fill="${D}"/><circle cx="102" cy="51" r="1.5" fill="${K}"/><path d="M28 50 q-12 -4 -14 -12 M28 54 q-12 4 -14 10" stroke="${D}" stroke-width="5"/><path d="M84 62 l8 6 M56 66 l6 8" stroke="${D}" stroke-width="5"/>`,
  whale: `<path d="M18 48 q22 -22 52 -14 q20 6 26 20 q-10 10 -30 10 q-28 0 -48 -16 Z" fill="${D}"/><path d="M96 54 q10 -14 16 -12 q0 8 -6 12 q6 4 6 12 q-8 0 -16 -12 Z" fill="${D}"/><circle cx="34" cy="46" r="2" fill="${K}"/><path d="M52 60 q4 6 10 6 M64 62 q4 4 8 4" stroke="${C}" stroke-width="2" fill="none"/><path d="M30 28 q4 -10 0 -16 M36 30 q8 -8 6 -16" stroke="${C}" stroke-width="3" fill="none"/>`,
  fish: `<path d="M24 46 q20 -18 44 -6 l14 -10 v28 l-14 -8 q-24 10 -44 -4 Z" fill="${D}"/><circle cx="34" cy="42" r="2" fill="${K}"/><path d="M46 34 q6 -8 12 -6" stroke="${B}" stroke-width="3" fill="none"/><circle cx="88" cy="30" r="2.5" fill="${C}"/><circle cx="94" cy="22" r="2" fill="${C}"/>`,
  eagle: `<path d="M60 40 L24 24 q10 14 20 18 L10 44 q22 4 34 0 Z" fill="${D}"/><path d="M60 40 L96 24 q-10 14 -20 18 L110 44 q-22 4 -34 0 Z" fill="${D}"/><circle cx="60" cy="42" r="9" fill="${B}"/><path d="M56 50 q4 4 8 0" fill="${B}"/><circle cx="57" cy="41" r="1.5" fill="${K}"/><path d="M54 50 h12" stroke="${K}" stroke-width="2"/><path d="M52 52 q4 8 16 6" stroke="${B}" stroke-width="2" fill="none"/>`,
  bird: `<path d="M44 42 q0 -16 18 -16 q16 0 16 14 q0 12 -10 18 l4 12 h-6 l-4 -10 q-14 -2 -18 -18 Z" fill="${D}"/><path d="M78 34 l10 4 -10 4 Z" fill="${B}"/><circle cx="72" cy="32" r="2" fill="${K}"/><path d="M54 58 v10 M62 58 v10" stroke="${B}" stroke-width="2.5"/><path d="M46 40 l-14 6 14 4 Z" fill="${D}"/>`,
  crane: `<ellipse cx="58" cy="48" rx="16" ry="12" fill="${D}"/><path d="M70 44 q14 -10 10 -26" stroke="${D}" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="80" cy="16" r="5" fill="${D}"/><path d="M84 16 l10 2 -10 3 Z" fill="${B}"/><path d="M76 12 q4 -6 8 -2" stroke="${B}" stroke-width="3" fill="none"/><circle cx="81" cy="15" r="1.5" fill="${K}"/><path d="M52 60 v12 M62 60 l4 12" stroke="${B}" stroke-width="2.5"/><path d="M42 48 l-16 8 16 2 Z" fill="${D}"/>`,
  parrot: `<path d="M50 40 q0 -18 18 -18 q18 0 18 16 q0 16 -12 22 l6 12 h-8 l-6 -10 q-16 -2 -16 -22 Z" fill="${D}"/><path d="M86 26 q16 -2 14 10 q-8 6 -16 2 Z" fill="${B}"/><path d="M68 22 q2 -8 8 -10 M76 24 q6 -6 12 -6" stroke="${B}" stroke-width="3" fill="none"/><circle cx="70" cy="30" r="2" fill="${K}"/><path d="M58 60 v10 M66 60 v10" stroke="${B}" stroke-width="2.5"/><path d="M50 42 l-14 6 14 4 Z" fill="${D}"/>`,
  kiwi: `<path d="M46 46 q0 -20 22 -20 q20 0 20 18 q0 16 -14 20 l4 10 h-8 l-4 -8 q-20 -2 -20 -20 Z" fill="${D}"/><path d="M88 32 l18 4 -18 5 Z" fill="${B}"/><circle cx="80" cy="30" r="2" fill="${K}"/><path d="M56 64 v10 M66 64 v10" stroke="${B}" stroke-width="2.5"/><path d="M46 44 l-10 4 10 3 Z" fill="${D}"/>`,
  penguin: `<path d="M60 16 q18 0 18 26 q0 20 -18 26 q-18 -6 -18 -26 q0 -26 18 -26 Z" fill="${D}"/><path d="M60 26 q10 0 10 20 q0 14 -10 18 q-10 -4 -10 -18 q0 -20 10 -20 Z" fill="${B}"/><circle cx="54" cy="30" r="2" fill="${K}"/><circle cx="66" cy="30" r="2" fill="${K}"/><path d="M60 34 l4 6 -4 4 -4 -4 Z" fill="${B}"/><path d="M42 44 q-10 8 -4 18 M78 44 q10 8 4 18" stroke="${D}" stroke-width="6" fill="none"/>`,
  paradise: `<ellipse cx="52" cy="40" rx="12" ry="16" fill="${D}"/><circle cx="58" cy="22" r="6" fill="${D}"/><path d="M62 20 l10 2 -8 4 Z" fill="${B}"/><circle cx="60" cy="21" r="1.5" fill="${K}"/><path d="M60 54 q10 6 24 22 M60 54 q2 14 -6 26 M60 54 q-12 10 -16 28" stroke="${C}" stroke-width="2.5" fill="none"/><circle cx="86" cy="78" r="2" fill="${B}"/><circle cx="54" cy="82" r="2" fill="${B}"/><circle cx="42" cy="82" r="2" fill="${B}"/><path d="M40 36 l-14 6 14 3 Z" fill="${D}"/>`,
  quetzal: `<ellipse cx="56" cy="38" rx="13" ry="15" fill="${D}"/><circle cx="62" cy="22" r="6" fill="${D}"/><path d="M66 22 q10 -2 8 6" stroke="${B}" stroke-width="4" fill="none"/><circle cx="64" cy="21" r="1.5" fill="${K}"/><path d="M50 50 q-6 22 -14 30 M56 50 q0 22 4 32 M62 50 q8 18 16 26" stroke="${B}" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M44 34 l-12 4 12 4 Z" fill="${D}"/>`,
  hummingbird: `<ellipse cx="66" cy="44" rx="14" ry="9" fill="${D}"/><path d="M52 42 q-20 -2 -30 -14 q16 2 30 8 Z" fill="${D}"/><circle cx="80" cy="40" r="5" fill="${D}"/><path d="M85 40 l16 2 -16 4 Z" fill="${B}"/><circle cx="81" cy="39" r="1.5" fill="${K}"/><path d="M70 34 q6 -12 18 -12 M66 34 q0 -14 8 -20" stroke="${C}" stroke-width="2.5" fill="none"/><path d="M64 52 q-2 10 -12 14 M70 52 q4 8 14 10" stroke="${C}" stroke-width="2.5" fill="none"/><circle cx="34" cy="26" r="2" fill="${C}"/>`,
  dodo: `<path d="M50 40 q0 -22 24 -22 q20 0 20 20 q0 8 -6 12 l4 14 h-8 l-4 -10 h-16 l-2 10 h-8 l4 -12 q-8 -4 -8 -12 Z" fill="${D}"/><path d="M92 24 q16 2 12 12 q-6 6 -14 2 Z" fill="${B}"/><circle cx="82" cy="26" r="2" fill="${K}"/><path d="M74 18 q4 -6 10 -4" stroke="${B}" stroke-width="3" fill="none"/><path d="M58 54 v12 M70 54 v12" stroke="${B}" stroke-width="2.5"/><path d="M50 42 l-14 4 14 5 Z" fill="${D}"/>`,
  sloth: `<circle cx="60" cy="46" r="24" fill="${D}"/><circle cx="52" cy="40" r="2" fill="${K}"/><circle cx="68" cy="40" r="2" fill="${K}"/><path d="M50 47 q4 3 8 0 M62 47 q4 3 8 0" stroke="${K}" stroke-width="2.5" fill="none"/><path d="M56 54 q4 5 8 0" stroke="${K}" stroke-width="2" fill="none"/><path d="M40 30 l-6 -10 M80 30 l6 -10" stroke="${D}" stroke-width="6"/><path d="M36 66 v8 q-4 6 2 6 M48 70 v8 M72 70 v8 M84 66 v8 q4 6 -2 6" stroke="${D}" stroke-width="5" fill="none"/>`,
  /* culture */
  drum: `<path d="M40 24 h40 l-4 44 q-16 6 -32 0 Z" fill="${D}"/><ellipse cx="60" cy="24" rx="20" ry="7" fill="${B}"/><path d="M44 30 l28 32 M76 30 l-28 32" stroke="${C}" stroke-width="2"/><path d="M42 18 q4 -8 0 -14 M78 18 q-4 -8 0 -14" stroke="${C}" stroke-width="2.5" fill="none"/>`,
  mask: `<path d="M42 12 h36 q4 30 -18 56 q-22 -26 -18 -56 Z" fill="${D}"/><path d="M50 34 q5 -6 10 0 M60 34 q5 -6 10 0" stroke="${K}" stroke-width="3" fill="none"/><path d="M60 44 v14 l-5 6 M60 44 v14 l5 6" stroke="${K}" stroke-width="2.5" fill="none"/><path d="M60 46 q-10 4 -14 14 M60 46 q10 4 14 14" stroke="${B}" stroke-width="2" fill="none"/><path d="M42 22 l-12 -4 M78 22 l12 -4" stroke="${B}" stroke-width="2.5"/><path d="M60 18 l4 6 -8 0 Z" fill="${B}"/>`,
  pattern: `<path d="M60 14 L78 42 L60 70 L42 42 Z" fill="${D}"/><path d="M60 26 L70 42 L60 58 L50 42 Z" fill="${B}"/><path d="M20 42 h8 M92 42 h8 M60 4 v6 M60 74 v6" stroke="${B}" stroke-width="3"/><path d="M28 20 l10 10 M92 20 l-10 10 M28 64 l10 -10 M92 64 l-10 -10" stroke="${C}" stroke-width="2"/>`,
  tusk: `<path d="M28 20 Q60 84 96 24 Q76 62 48 46 Q34 36 28 20 Z" fill="${B}"/><path d="M36 16 Q64 70 88 22" stroke="${C}" stroke-width="3" fill="none"/>`,
  hat: `<path d="M60 14 L92 58 H28 Z" fill="${B}"/><path d="M34 52 h52" stroke="${C}" stroke-width="2"/><path d="M44 56 q16 8 32 0" stroke="${C}" stroke-width="2" fill="none"/><path d="M60 58 v6 q0 6 -8 6" stroke="${C}" stroke-width="2" fill="none"/><path d="M40 70 h40" stroke="${B}" stroke-width="2"/>`,
  bolt: `<path d="M68 8 L44 46 H60 L52 76 L80 36 H62 Z" fill="${B}"/><circle cx="60" cy="42" r="34" fill="none" stroke="${C}" stroke-width="2" stroke-dasharray="4 6"/>`,
  cactus: `<rect x="54" y="20" width="16" height="56" rx="8" fill="${D}"/><path d="M40 60 v-14 q0 -8 8 -8 v22 Z" fill="${D}"/><path d="M84 54 v-14 q0 -8 -8 -8 v22 Z" fill="${D}"/><path d="M50 76 h24" stroke="${C}" stroke-width="2"/>`,
  /* plants */
  lotus: `<path d="M60 20 q-8 16 -20 24 q-10 -14 -2 -26 q12 0 22 2 Z" fill="${B}"/><path d="M60 20 q8 16 20 24 q10 -14 2 -26 q-12 0 -22 2 Z" fill="${B}"/><path d="M60 16 q-8 20 0 40 q8 -20 0 -40 Z" fill="${A}"/><path d="M24 60 q36 18 72 0" stroke="${C}" stroke-width="2.5" fill="none"/><path d="M30 66 q30 14 60 0" stroke="${C}" stroke-width="2" fill="none"/>`,
  flower: `<circle cx="60" cy="40" r="8" fill="${C}"/><path d="M60 16 q10 6 8 18 q10 -4 16 4 q-8 8 -16 6 q4 10 -4 16 q-8 -6 -8 -16 q-10 4 -16 -4 q8 -8 16 -6 q-4 -12 4 -18 Z" fill="${B}"/><path d="M60 40 q2 -10 10 -12" stroke="${A}" stroke-width="2" fill="none"/><circle cx="71" cy="27" r="2" fill="${A}"/>`,
  palm: `<path d="M58 76 q-6 -28 2 -44" stroke="${D}" stroke-width="7" fill="none"/><path d="M60 32 q-22 -12 -34 -2 q16 2 30 8 Z M60 32 q-14 -18 -30 -18 q14 8 26 22 Z M60 32 q0 -22 14 -30 q-4 16 -8 28 Z M60 32 q16 -14 32 -10 q-16 6 -28 16 Z M60 32 q22 -4 32 8 q-18 -4 -30 -2 Z" fill="${B}"/><circle cx="58" cy="36" r="3" fill="${D}"/><circle cx="64" cy="38" r="3" fill="${D}"/>`,
  cedar: `<path d="M60 10 L80 30 H72 L88 48 H76 L90 66 H30 L44 48 H32 L48 30 H40 Z" fill="${B}"/><path d="M56 66 v10 h8 v-10 Z" fill="${B}"/>`,
  baobab: `<path d="M44 76 q-4 -30 6 -38 h20 q10 8 6 38 Z" fill="${D}"/><path d="M50 38 q-14 -8 -18 -20 M70 38 q14 -8 18 -20 M60 36 q0 -16 4 -24 M50 40 l-12 6 M70 40 l12 6" stroke="${D}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M40 76 h40" stroke="${C}" stroke-width="2"/>`,
  wheat: `<path d="M60 76 V30" stroke="${B}" stroke-width="3"/><path d="M60 34 q-12 -4 -14 -16 q12 2 14 12 Z M60 34 q12 -4 14 -16 q-12 2 -14 12 Z M60 46 q-12 -4 -14 -16 q12 2 14 12 Z M60 46 q12 -4 14 -16 q-12 2 -14 12 Z M60 58 q-12 -4 -14 -16 q12 2 14 12 Z M60 58 q12 -4 14 -16 q-12 2 -14 12 Z" fill="${B}"/><path d="M60 26 q-2 -10 0 -16 M60 26 q2 -10 0 -16" stroke="${C}" stroke-width="1.5" fill="none"/>`,
  olive: `<path d="M28 62 Q58 22 92 32" stroke="${B}" stroke-width="3" fill="none"/><path d="M38 54 q-10 -2 -12 -10 q10 0 12 8 Z M50 44 q-10 -2 -12 -10 q10 0 12 8 Z M62 38 q-10 -2 -12 -10 q10 0 12 8 Z M74 34 q-8 -4 -8 -12 q8 2 10 10 Z" fill="${B}"/><circle cx="46" cy="60" r="5" fill="${D}"/><circle cx="64" cy="52" r="5" fill="${D}"/>`,
  grapes: `<circle cx="48" cy="42" r="9" fill="${D}"/><circle cx="66" cy="42" r="9" fill="${D}"/><circle cx="57" cy="56" r="9" fill="${D}"/><circle cx="48" cy="70" r="8" fill="${D}"/><circle cx="66" cy="70" r="8" fill="${D}"/><path d="M57 34 q0 -12 8 -18" stroke="${B}" stroke-width="3" fill="none"/><path d="M65 16 q14 -4 18 6 q-12 6 -18 -6 Z" fill="${B}"/>`,
  sunflower: `<circle cx="60" cy="30" r="10" fill="${D}"/><path d="M60 12 l4 8 8 -2 -2 8 8 4 -8 4 2 8 -8 -2 -4 8 -4 -8 -8 2 2 -8 -8 -4 8 -4 -2 -8 8 2 Z" fill="${B}"/><path d="M60 40 q-4 20 2 34" stroke="${B}" stroke-width="3" fill="none"/><path d="M62 52 q-12 -2 -14 8 q10 4 14 -8 Z" fill="${B}"/>`,
  /* sky & symbols */
  sun: `<circle cx="60" cy="44" r="18" fill="${B}"/><path d="M60 14 v-8 M60 74 v8 M30 44 h-8 M90 44 h8 M39 23 l-6 -6 M81 23 l6 -6 M39 65 l-6 6 M81 65 l6 6" stroke="${B}" stroke-width="4"/><circle cx="60" cy="44" r="10" fill="${C}"/>`,
  star: `<path d="M60 10 L69 36 H96 L74 52 L82 78 L60 64 L38 78 L46 52 L24 36 H51 Z" fill="${B}"/>`,
  stars: `<circle cx="46" cy="26" r="5" fill="${B}"/><circle cx="76" cy="20" r="5" fill="${B}"/><circle cx="60" cy="46" r="4" fill="${B}"/><circle cx="38" cy="66" r="4" fill="${B}"/><circle cx="68" cy="62" r="2.5" fill="${C}"/><path d="M46 26 L60 46 L76 20 M60 46 L38 66" stroke="${C}" stroke-width="1.5" fill="none"/>`,
  starcrescent: `<path d="M64 14 a30 30 0 1 0 0 60 a24 24 0 1 1 0 -60 Z" fill="${B}"/><path d="M74 32 l4 8 9 1 -7 6 2 9 -8 -5 -8 5 2 -9 -7 -6 9 -1 Z" fill="${B}"/>`,
  starfish: `<path d="M60 12 q6 14 14 18 q12 2 16 12 q-10 8 -16 10 q2 12 -8 18 q-10 -6 -10 -16 q-12 -2 -18 -12 q8 -10 16 -12 q2 -12 6 -18 Z" fill="${B}"/><circle cx="60" cy="40" r="2" fill="${C}"/><circle cx="52" cy="50" r="1.5" fill="${C}"/><circle cx="68" cy="50" r="1.5" fill="${C}"/><circle cx="60" cy="30" r="1.5" fill="${C}"/>`,
};

/* maple leaf & sika deer join the library */
MOTIFS.maple = `<path d="M60 6 l7 13 13 -4 -4 15 13 3 -11 10 4 13 -15 -4 -7 13 -7 -13 -15 4 4 -13 -11 -10 13 -3 -4 -15 13 4 Z" fill="${B}"/><path d="M60 30 V72" stroke="${B}" stroke-width="2.5"/>`;
MOTIFS.deer = `<ellipse cx="52" cy="54" rx="18" ry="12" fill="${D}"/><path d="M64 48 q4 -14 2 -24" stroke="${D}" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="66" cy="22" r="6" fill="${D}"/><path d="M63 18 q-6 -8 -4 -14 M69 18 q6 -8 4 -14 M61 12 q-6 -2 -8 -6 M71 12 q6 -2 8 -6" stroke="${B}" stroke-width="2.5" fill="none"/><circle cx="68" cy="21" r="1.5" fill="${K}"/><path d="M42 64 v8 M60 64 v8" stroke="${D}" stroke-width="6"/><path d="M36 52 l-12 6" stroke="${D}" stroke-width="5"/>`;

/* ---------------- the ladders: real denominations for every currency -----
   [notes high→low, coins high→low] */
export const L = {
  AED: [[1000, 500, 200, 100, 50, 20, 10, 5], [1, .5, .25]],
  AFN: [[1000, 500, 100, 50, 20, 10], [5, 2, 1]],
  ALL: [[10000, 5000, 2000, 1000, 500, 200], [100, 50, 20, 10, 5, 1]],
  AMD: [[100000, 50000, 20000, 10000, 5000, 2000, 1000], [500, 200, 100, 50, 20, 10]],
  ANG: [[100, 50, 25, 10], [1, .25, .1, .05]],
  AOA: [[5000, 2000, 1000, 500, 200, 100, 50], [50, 20, 10, 5]],
  ARS: [[20000, 10000, 2000, 1000, 500, 200, 100], [50, 25, 10, 5, 2, 1]],
  AUD: [[100, 50, 20, 10, 5], [2, 1, .5, .2, .1, .05]],
  AWG: [[500, 200, 100, 50, 25, 10], [5, 2.5, 1, .5, .25]],
  AZN: [[200, 100, 50, 20, 10, 5, 1], [50, 20, 10, 5, 3, 1]],
  BAM: [[200, 100, 50, 20, 10], [5, 2, 1, .5, .2, .1, .05]],
  BBD: [[100, 50, 20, 10, 5, 2], [1, .25, .1, .05, .01]],
  BDT: [[1000, 500, 200, 100, 50, 20, 10, 5, 2], [10, 5, 2, 1]],
  BGN: [[100, 50, 20, 10, 5], [2, 1, .5, .2, .1, .05, .02, .01]],
  BHD: [[20, 10, 5, 1, .5], [.1, .05, .025, .01]],
  BIF: [[10000, 5000, 2000, 1000, 500, 100], [50, 10, 5, 1]],
  BMD: [[100, 50, 20, 10, 5, 2, 1], [.25, .1, .05, .01]],
  BND: [[100, 50, 20, 10, 5, 1], [.5, .2, .1, .05, .01]],
  BOB: [[200, 100, 50, 20, 10], [5, 2, 1, .5, .2, .1]],
  BRL: [[200, 100, 50, 20, 10, 5, 2], [1, .5, .25, .1, .05]],
  BSD: [[100, 50, 20, 10, 5, 3, 1], [.25, .1, .05, .01]],
  BTN: [[1000, 500, 100, 50, 20, 10, 5, 1], [1, .5, .25]],
  BWP: [[200, 100, 50, 20, 10], [5, 2, 1, .5, .25, .1]],
  BYN: [[500, 200, 100, 50, 20, 10, 5], [2, 1, .5, .2, .1, .05, .02, .01]],
  BZD: [[100, 50, 20, 10, 5, 2], [1, .5, .25, .1, .05, .01]],
  CAD: [[100, 50, 20, 10, 5], [2, 1, .25, .1, .05]],
  CDF: [[20000, 10000, 5000, 1000, 500, 100], [50, 25, 10, 5, 1]],
  CHF: [[1000, 500, 200, 100, 50, 20, 10], [5, 2, 1, .5, .2, .1]],
  CLP: [[20000, 10000, 5000, 2000, 1000], [500, 100, 50, 10]],
  CNY: [[100, 50, 20, 10, 5, 1], [1, .5, .1]],
  COP: [[100000, 50000, 20000, 10000, 5000, 2000], [1000, 500, 200, 100, 50]],
  CRC: [[20000, 10000, 5000, 2000, 1000], [500, 100, 50, 25, 10, 5]],
  CUP: [[1000, 500, 200, 100, 50, 20, 10], [5, 3, 1]],
  CVE: [[5000, 2000, 1000, 500, 200], [100, 50, 20, 10, 5, 1]],
  CZK: [[5000, 2000, 1000, 500, 200, 100], [50, 20, 10, 5, 2, 1]],
  DJF: [[10000, 5000, 2000, 1000], [250, 100, 50, 20, 10, 5]],
  DKK: [[1000, 500, 200, 100, 50], [20, 10, 5, 2, 1, .5]],
  DOP: [[2000, 1000, 500, 200, 100, 50], [25, 10, 5, 1]],
  DZD: [[2000, 1000, 500, 200], [200, 100, 50, 20, 10, 5]],
  EGP: [[200, 100, 50, 20, 10, 5], [1, .5, .25]],
  ERN: [[100, 50, 20, 10, 5, 1], [1, .5, .25, .1]],
  ETB: [[200, 100, 50, 10, 5], [1, .5, .25, .1]],
  EUR: [[500, 200, 100, 50, 20, 10, 5], [2, 1, .5, .2, .1, .05, .02, .01]],
  FJD: [[100, 50, 20, 10, 5], [2, 1, .5, .2, .1, .05]],
  FKP: [[50, 20, 10, 5], [2, 1, .5, .2, .1]],
  GBP: [[50, 20, 10, 5], [2, 1, .5, .2, .1, .05]],
  GEL: [[200, 100, 50, 20, 10, 5], [2, 1, .5, .2, .1]],
  GHS: [[200, 100, 50, 20, 10, 5, 2, 1], [2, 1, .5, .2, .1]],
  GIP: [[100, 50, 20, 10, 5], [2, 1, .5, .2]],
  GMD: [[200, 100, 50, 25, 20, 10, 5], [1, .5, .25]],
  GNF: [[20000, 10000, 5000, 2000, 1000, 500], [100, 50, 25]],
  GTQ: [[200, 100, 50, 20, 10, 5, 1], [1, .5, .25, .1]],
  GYD: [[5000, 2000, 1000, 500, 100, 50, 20], [100, 10, 5, 1]],
  HKD: [[1000, 500, 100, 50, 20, 10], [10, 5, 2, 1, .5, .2, .1]],
  HNL: [[500, 100, 50, 20, 10, 5, 2, 1], [5, 2, 1, .5, .2, .1]],
  HTG: [[1000, 500, 250, 100, 50, 25, 10], [5, 1, .5]],
  HUF: [[20000, 10000, 5000, 2000, 1000, 500], [200, 100, 50, 20, 10, 5]],
  IDR: [[100000, 50000, 20000, 10000, 5000, 2000, 1000], [1000, 500, 200, 100]],
  ILS: [[200, 100, 50, 20], [10, 5, 2, 1, .5, .1]],
  INR: [[500, 200, 100, 50, 20, 10], [20, 10, 5, 2, 1]],
  IQD: [[50000, 25000, 10000, 5000, 1000, 500, 250], [100, 50, 25]],
  IRR: [[1000000, 500000, 100000, 50000, 20000, 10000, 5000], [5000, 1000]],
  ISK: [[10000, 5000, 2000, 1000, 500], [100, 50, 10, 5, 1]],
  JMD: [[5000, 1000, 500, 100, 50], [20, 10, 5, 1]],
  JOD: [[50, 20, 10, 5], [.5, .25, .1, .05]],
  JPY: [[10000, 5000, 2000, 1000], [500, 100, 50, 10, 5]],
  KES: [[1000, 500, 200, 100, 50], [20, 10, 5, 1]],
  KGS: [[5000, 1000, 500, 200, 100, 50, 20], [10, 5, 3, 1]],
  KHR: [[100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 100], [200, 100]],
  KMF: [[10000, 5000, 2000, 1000, 500], [250, 100, 50, 25]],
  KPW: [[5000, 2000, 1000, 500, 200, 100, 50], [100, 50, 10, 5, 1]],
  KRW: [[50000, 10000, 5000, 1000], [500, 100, 50]],
  KWD: [[20, 10, 5, 1, .5, .25], [.1, .05, .02, .01]],
  KYD: [[100, 50, 25, 20, 10, 5, 1], [.25, .1, .05, .01]],
  KZT: [[20000, 10000, 5000, 2000, 1000, 500, 200], [200, 100, 50, 20, 10, 5, 1]],
  LAK: [[100000, 50000, 20000, 10000, 5000, 2000, 1000], [500, 100]],
  LBP: [[100000, 50000, 20000, 10000, 5000, 1000], [500, 250]],
  LKR: [[5000, 1000, 500, 100, 50, 20], [20, 10, 5, 2, 1]],
  LRD: [[500, 100, 50, 20, 10, 5], [10, 5, 1]],
  LSL: [[200, 100, 50, 20, 10], [5, 2, 1, .5, .2]],
  LYD: [[50, 20, 10, 5, 1], [.5, .25]],
  MAD: [[200, 100, 50, 20], [10, 5, 2, 1, .5, .2]],
  MDL: [[1000, 500, 200, 100, 50, 20, 10], [50, 25, 10, 5]],
  MGA: [[20000, 10000, 5000, 2000, 1000, 500, 200, 100], [50, 20, 10]],
  MKD: [[2000, 1000, 500, 200, 100, 50, 10], [50, 10, 5, 2, 1]],
  MMK: [[10000, 5000, 1000, 500, 200, 100, 50], [100, 50, 10]],
  MNT: [[20000, 10000, 5000, 1000, 500, 100, 50, 20, 10], [500, 200, 100, 50, 20]],
  MOP: [[1000, 500, 100, 50, 20, 10], [10, 5, 2, 1, .5]],
  MRU: [[1000, 500, 200, 100, 50], [20, 10, 5, 1]],
  MUR: [[2000, 1000, 500, 200, 100, 50, 25], [20, 10, 5, 1, .5, .2]],
  MVR: [[500, 100, 50, 20, 10, 5], [2, 1, .5, .25]],
  MWK: [[5000, 2000, 1000, 500, 200, 100, 50, 20], [10, 5, 1]],
  MXN: [[1000, 500, 200, 100, 50, 20], [20, 10, 5, 2, 1]],
  MYR: [[100, 50, 20, 10, 5, 1], [.5, .2, .1, .05]],
  MZN: [[1000, 500, 200, 100, 50, 20], [50, 20, 10, 5, 2, 1]],
  NAD: [[200, 100, 50, 20, 10], [10, 5, 1]],
  NGN: [[1000, 500, 200, 100, 50, 20, 10, 5], [2, 1, .5]],
  NIO: [[1000, 500, 200, 100, 50, 20, 10], [5, 1, .5, .25, .1]],
  NOK: [[1000, 500, 200, 100, 50], [20, 10, 5, 1]],
  NPR: [[1000, 500, 100, 50, 20, 10, 5], [2, 1]],
  NZD: [[100, 50, 20, 10, 5], [2, 1, .5, .2, .1]],
  OMR: [[50, 20, 10, 5, 1, .5, .25], [.1, .05]],
  PAB: [[100, 50, 20, 10, 5, 1], [1, .5, .25, .1, .05]],
  PEN: [[200, 100, 50, 20, 10], [5, 2, 1, .5, .2, .1]],
  PGK: [[100, 50, 20, 10, 5, 2], [1, .5, .2, .1, .05]],
  PHP: [[1000, 500, 200, 100, 50, 20], [20, 10, 5, 1, .25, .1, .05]],
  PKR: [[5000, 1000, 500, 100, 50, 20, 10], [10, 5, 2, 1]],
  PLN: [[500, 200, 100, 50, 20, 10], [5, 2, 1, .5, .2, .1, .05, .02, .01]],
  PYG: [[100000, 50000, 20000, 10000, 5000, 2000], [1000, 500, 100, 50]],
  QAR: [[500, 200, 100, 50, 10, 5, 1], [.5, .25, .1]],
  RON: [[500, 200, 100, 50, 10], [.5, .1, .05]],
  RSD: [[5000, 2000, 1000, 500, 200, 100, 50, 20, 10], [20, 10, 5, 2, 1]],
  RUB: [[5000, 2000, 1000, 500, 200, 100], [10, 5, 2, 1]],
  RWF: [[5000, 2000, 1000, 500], [100, 50, 20, 10, 5, 1]],
  SAR: [[500, 100, 50, 10, 5], [2, 1, .5, .25]],
  SBD: [[100, 50, 20, 10, 5], [2, 1, .5, .2, .1]],
  SCR: [[500, 100, 50, 25], [5, 1, .25, .1]],
  SDG: [[1000, 500, 200, 100, 50, 20, 10], [20, 10, 5, 1]],
  SEK: [[1000, 500, 200, 100, 50], [10, 5, 2, 1]],
  SGD: [[1000, 100, 50, 10, 5, 2], [1, .5, .2, .1, .05]],
  SHP: [[20, 10, 5, 1], [1, .5, .2, .1]],
  SLE: [[100, 50, 20, 10, 5, 2, 1], [1, .5]],
  SOS: [[1000, 500, 100, 50, 20, 10], [100, 50, 10, 5, 1]],
  SRD: [[500, 200, 100, 50, 20, 10, 5], [1, .25, .1, .05]],
  SSP: [[1000, 500, 100, 50, 25, 20, 10], [10, 5, 1]],
  STN: [[200, 100, 50, 20, 10], [2, 1, .5]],
  SVC: [[200, 100, 50, 25, 10, 5], [1, .5, .25, .1]],
  SYP: [[5000, 2000, 1000, 500, 200, 100, 50], [50, 25, 10, 5]],
  SZL: [[200, 100, 50, 20, 10], [5, 2, 1, .5, .2, .1]],
  THB: [[1000, 500, 100, 50, 20], [10, 5, 2, 1, .5]],
  TJS: [[500, 200, 100, 50, 20, 10, 5, 3, 1], [5, 3, 2, 1]],
  TMT: [[500, 100, 50, 20, 10, 5, 1], [2, 1, .5, .2, .1]],
  TND: [[50, 20, 10, 5], [5, 2, 1, .5]],
  TOP: [[100, 50, 20, 10, 5, 2], [1, .5, .2, .1]],
  TRY: [[200, 100, 50, 20, 10, 5], [1, .5, .25, .1, .05]],
  TTD: [[100, 50, 20, 10, 5, 1], [1, .25, .1, .05]],
  TWD: [[2000, 1000, 500, 200, 100], [50, 10, 5, 1]],
  TZS: [[10000, 5000, 2000, 1000, 500], [500, 200, 100, 50]],
  UAH: [[1000, 500, 200, 100, 50, 20], [10, 5, 2, 1]],
  UGX: [[50000, 20000, 10000, 5000, 2000, 1000], [1000, 500, 200, 100, 50]],
  USD: [[100, 50, 20, 10, 5, 2, 1], [.25, .1, .05, .01]],
  UYU: [[2000, 1000, 500, 200, 100, 50], [50, 10, 5, 2, 1]],
  UZS: [[200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000], [1000, 500, 200, 100]],
  VES: [[500, 200, 100, 50, 20, 10, 5], [1, .5]],
  VND: [[500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000], [5000, 2000, 1000, 500, 200]],
  VUV: [[10000, 5000, 2000, 1000, 500, 200], [100, 50, 20, 10, 5, 1]],
  WST: [[100, 50, 20, 10, 5], [1, .5, .2, .1]],
  XAF: [[10000, 5000, 2000, 1000, 500], [500, 100, 50, 25, 10, 5]],
  XCD: [[100, 50, 20, 10, 5], [1, .25, .1, .05, .02, .01]],
  XOF: [[10000, 5000, 2000, 1000, 500], [500, 250, 200, 100, 50, 25, 10, 5]],
  XPF: [[10000, 5000, 1000, 500], [200, 100, 50, 20, 10, 5, 2, 1]],
  YER: [[1000, 500, 250, 200, 100, 50], [20, 10, 5, 1]],
  ZAR: [[200, 100, 50, 20, 10], [5, 2, 1, .5, .2, .1]],
  ZMW: [[100, 50, 20, 10, 5, 2], [1, .5, .1]],
  ZWG: [[200, 100, 50, 20, 10, 5, 2, 1], [1]],
};

/* subunit handling: 0-decimal currencies, and the rare 3-decimal ones */
const DEC0 = new Set(['JPY', 'KRW', 'VND', 'IDR', 'HUF', 'CLP', 'ISK', 'UGX', 'TZS', 'XAF', 'XOF', 'XPF', 'VUV', 'PYG', 'GNF', 'COP', 'MMK', 'LAK', 'MNT', 'MGA', 'RWF', 'BIF', 'DJF', 'LBP', 'SYP', 'KPW', 'UZS', 'MRU', 'SOS', 'IRR', 'IQD', 'KHR', 'MWK']);
const DEC3 = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND', 'LYD']);

/* ---------------- styles: real banknote colors + iconic motifs ------------
   [height of the note in viewBox units, motifs, colors per ladder position] */
const FR = ['#7d5a8a', '#4a76b8', '#c9a24a', '#7fa86b', '#b8786a']; /* CFA */
const GULF = ['#8a9484', '#a89880', '#7d8ba0', '#9a8a6a', '#6b8a7d', '#93867a'];
export const S = {
  AED: [104, ['eagle', 'towers'], ['#c0392b', '#5f9e63', '#8a6f4d', '#c9a24a', '#4a76b8', '#7d8ba0', '#8a6f4d', '#5f9e63']],
  AFN: [106, ['archgate', 'mountain'], ['#7d8ba0', '#5f9e63', '#8a6f4d', '#9a6bb8', '#a89880']],
  ALL: [106, ['eagle', 'castle'], ['#9a6bb8', '#b8786a', '#7fa86b', '#8a6f4d', '#4a76b8', '#c46a6a']],
  AMD: [106, ['mountain', 'temple'], ['#9a8a6a', '#4a76b8', '#5f9e63', '#c46a6a', '#8a6f4d', '#9a6bb8', '#7fa86b']],
  ANG: [106, ['bridge', 'windmill'], ['#caa24a', '#c0392b', '#5f9e63', '#4a76b8']],
  AOA: [106, ['antelope', 'geyser'], ['#9a6bb8', '#c9a24a', '#c0392b', '#5f9e63', '#8a6f4d', '#4a76b8', '#b8786a']],
  ARS: [106, ['sun', 'mountain'], ['#7fa86b', '#8a6f4d', '#4a76b8', '#9a6bb8', '#a89880', '#b8786a', '#c46a6a']],
  AUD: [104, ['kangaroo', 'parrot'], ['#5f9e63', '#4a76b8', '#c0392b', '#d9a05e', '#b8786a']],
  AWG: [106, ['windmill', 'bird'], ['#8a6f4d', '#4a76b8', '#c0392b', '#9a6bb8', '#5f9e63', '#d9a05e']],
  AZN: [106, ['pattern', 'towers'], ['#4a76b8', '#5f9e63', '#a89880', '#c0392b', '#9a6bb8', '#7d8ba0']],
  BAM: [104, ['bridge', 'mountain'], ['#9a6bb8', '#5f9e63', '#8a6f4d', '#c9a24a', '#4a76b8']],
  BBD: [106, ['fish', 'ship'], ['#7d8ba0', '#c0392b', '#5f9e63', '#8a6f4d', '#4a76b8', '#9a6bb8']],
  BDT: [106, ['dhow', 'lotus'], ['#9a6bb8', '#8a6f4d', '#c46a6a', '#4a76b8', '#7fa86b', '#c9a24a', '#a89880', '#d9a05e']],
  BGN: [106, ['lion', 'flower'], ['#5f9e63', '#9a6bb8', '#c9a24a', '#4a76b8', '#8a6f4d']],
  BHD: [106, ['archgate', 'dhow'], ['#a89880', '#7d8ba0', '#c0392b', '#5f9e63', '#9a8a6a']],
  BIF: [106, ['drum', 'star'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#b8786a', '#9a6bb8', '#7d8ba0']],
  BMD: [106, ['whale', 'ship'], ['#8fa9c0', '#c8a0a8', '#d8b89a', '#d9a05e', '#a08ea8', '#8a9484', '#8a9484']],
  BND: [106, ['mosque', 'flower'], ['#c9a24a', '#4a76b8', '#5f9e63', '#8a6f4d', '#9a6bb8', '#7d8ba0']],
  BOB: [106, ['llama', 'volcano'], ['#9a8a6a', '#7d8ba0', '#5f9e63', '#c46a6a', '#4a76b8']],
  BRL: [104, ['parrot', 'turtle'], ['#7fa86b', '#d98b3f', '#c9a24a', '#c0392b', '#9a6bb8', '#4a76b8', '#8a6f4d']],
  BSD: [106, ['starfish', 'ship'], ['#7d8ba0', '#c0392b', '#5f9e63', '#8a6f4d', '#4a76b8', '#b8786a', '#9a6bb8']],
  BTN: [106, ['dragon', 'mountain'], ['#c0392b', '#d9a05e', '#5f9e63', '#4a76b8', '#8a6f4d', '#9a6bb8', '#7d8ba0']],
  BWP: [106, ['zebra', 'elephant'], ['#a89880', '#8a6f4d', '#5f9e63', '#4a76b8', '#c46a6a']],
  BYN: [106, ['ox', 'castle'], ['#9a6bb8', '#8a6f4d', '#5f9e63', '#4a76b8', '#c46a6a', '#a89880', '#7fa86b']],
  BZD: [106, ['parrot', 'palm'], ['#c0392b', '#5f9e63', '#8a6f4d', '#4a76b8', '#9a6bb8', '#c9a24a']],
  CAD: [104, ['maple', 'bird'], ['#8a6f4d', '#9a6bb8', '#5f9e63', '#c46a6a', '#4a76b8']],
  CDF: [106, ['elephant', 'drum'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#b8786a', '#9a6bb8', '#7d8ba0']],
  CHF: [104, ['mountain', 'flower'], ['#9a6bb8', '#c0392b', '#5f9e63', '#4a76b8', '#8a6f4d', '#d9a05e', '#a89880']],
  CLP: [106, ['mountain', 'eagle'], ['#7d8ba0', '#5f9e63', '#8a6f4d', '#4a76b8', '#9a6bb8']],
  CNY: [108, ['heaven', 'panda'], ['#c0392b', '#5f9e63', '#8a6f4d', '#4a76b8', '#9a6bb8', '#7d8ba0']],
  COP: [106, ['palm', 'hat'], ['#7d8ba0', '#c46a6a', '#5f9e63', '#d9a05e', '#9a6bb8', '#4a76b8']],
  CRC: [106, ['sloth', 'volcano'], ['#c9a24a', '#5f9e63', '#4a76b8', '#c0392b', '#9a6bb8']],
  CUP: [106, ['star', 'palm'], ['#9a6bb8', '#5f9e63', '#8a6f4d', '#4a76b8', '#c46a6a', '#a89880']],
  CVE: [106, ['fish', 'turtle'], ['#c9a24a', '#5f9e63', '#c46a6a', '#4a76b8', '#7d8ba0']],
  CZK: [106, ['castle', 'bridge'], ['#9a8a6a', '#4a76b8', '#5f9e63', '#c46a6a', '#8a6f4d', '#c9a24a']],
  DJF: [106, ['whale', 'archgate'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#b8786a']],
  DKK: [104, ['bridge', 'castle'], ['#8a6f4d', '#9a6bb8', '#5f9e63', '#4a76b8', '#c46a6a']],
  DOP: [106, ['palm', 'sun'], ['#d9a05e', '#c0392b', '#5f9e63', '#4a76b8', '#9a6bb8', '#a89880']],
  DZD: [106, ['archgate', 'palm'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#c46a6a']],
  EGP: [106, ['pyramid', 'mosque'], ['#d9a05e', '#4a76b8', '#5f9e63', '#8a6f4d', '#c0392b']],
  ERN: [106, ['camel', 'archgate'], ['#9a8a6a', '#4a76b8', '#5f9e63', '#8a6f4d', '#b8786a']],
  ETB: [106, ['lion', 'drum'], ['#4a76b8', '#5f9e63', '#8a6f4d', '#9a8a6a', '#c46a6a']],
  EUR: [104, ['bridge', 'temple'], ['#9a9a9a', '#c96a5e', '#4a76b8', '#d98b3f', '#5f9e63', '#e0c050', '#9a6bb8']],
  FJD: [106, ['parrot', 'palm'], ['#5f9e63', '#4a76b8', '#c0392b', '#d9a05e', '#9a6bb8']],
  FKP: [106, ['penguin', 'ship'], ['#4a76b8', '#5f9e63', '#8a6f4d', '#c46a6a']],
  GBP: [106, ['clocktower', 'bridge'], ['#c0392b', '#9a6bb8', '#d98b3f', '#3fa0a8']],
  GEL: [106, ['grapes', 'mountain'], ['#c9a24a', '#5f9e63', '#8a6f4d', '#4a76b8', '#9a6bb8']],
  GHS: [106, ['drum', 'star'], ['#d9a05e', '#5f9e63', '#c9a24a', '#4a76b8', '#9a6bb8', '#c0392b', '#8a6f4d', '#a89880']],
  GIP: [106, ['mountain', 'castle'], ['#c0392b', '#5f9e63', '#8a6f4d', '#4a76b8']],
  GMD: [106, ['bird', 'drum'], ['#d9a05e', '#c46a6a', '#5f9e63', '#4a76b8', '#9a6bb8', '#8a6f4d', '#a89880']],
  GNF: [106, ['mask', 'drum'], FR],
  GTQ: [106, ['quetzal', 'volcano'], ['#8a6f4d', '#c9a24a', '#5f9e63', '#c46a6a', '#9a6bb8', '#7d8ba0']],
  GYD: [106, ['bird', 'geyser'], ['#7d8ba0', '#5f9e63', '#8a6f4d', '#4a76b8', '#c46a6a', '#d9a05e', '#9a6bb8']],
  HKD: [106, ['flower', 'junk'], ['#caa24a', '#8a6f4d', '#c0392b', '#5f9e63', '#4a76b8', '#9a6bb8']],
  HNL: [106, ['pyramid', 'bird'], ['#c9a24a', '#5f9e63', '#c46a6a', '#4a76b8', '#9a6bb8', '#8a6f4d', '#a89880']],
  HTG: [106, ['palm', 'drum'], ['#9a6bb8', '#c46a6a', '#5f9e63', '#4a76b8', '#8a6f4d', '#a89880', '#c9a24a']],
  HUF: [106, ['castle', 'bird'], ['#9a8a6a', '#9a6bb8', '#5f9e63', '#4a76b8', '#c46a6a', '#a89880']],
  IDR: [106, ['eagle', 'temple'], ['#c06a5e', '#4a76b8', '#5f9e63', '#9a6bb8', '#8a6f4d', '#a89a92', '#7fa8c0']],
  ILS: [106, ['temple', 'olive'], ['#c9a24a', '#4a76b8', '#5f9e63', '#c46a6a']],
  INR: [106, ['lotus', 'tiger'], ['#8a6f4d', '#3fb8ae', '#9a6bb8', '#d98b3f', '#c96a5e', '#7d8ba0']],
  IQD: [106, ['spiral', 'palm'], ['#9a8a6a', '#4a76b8', '#5f9e63', '#c46a6a', '#a89880', '#7fa86b', '#9a6bb8']],
  IRR: [106, ['archgate', 'pattern'], ['#7d8ba0', '#8a6f4d', '#5f9e63', '#4a76b8', '#9a6bb8', '#c46a6a', '#a89880']],
  ISK: [106, ['whale', 'fish'], ['#9a6bb8', '#5f9e63', '#4a76b8', '#c46a6a', '#8a6f4d']],
  JMD: [106, ['hummingbird', 'flower'], ['#c9a24a', '#d9a05e', '#5f9e63', '#4a76b8', '#9a6bb8']],
  JOD: [106, ['temple', 'archgate'], ['#c9a24a', '#5f9e63', '#8a6f4d', '#4a76b8']],
  JPY: [110, ['mountain', 'flower'], ['#8a6f4d', '#5f9e63', '#9a6bb8', '#4a76b8']],
  KES: [106, ['lion', 'elephant'], ['#9a6bb8', '#5f9e63', '#8a6f4d', '#4a76b8', '#a89880']],
  KGS: [106, ['pattern', 'horse'], ['#9a8a6a', '#4a76b8', '#5f9e63', '#c46a6a', '#8a6f4d', '#a89880', '#c9a24a']],
  KHR: [106, ['angkor', 'elephant'], ['#7d8ba0', '#5f9e63', '#8a6f4d', '#4a76b8', '#9a6bb8', '#c46a6a', '#a89880', '#d9a05e', '#c9a24a']],
  KMF: [106, ['starcrescent', 'mosque'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#b8786a', '#9a6bb8']],
  KPW: [106, ['gatek', 'star'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#c46a6a', '#a89880', '#7d8ba0', '#c9a24a']],
  KRW: [108, ['gatek', 'hat'], ['#5f9e63', '#d98b3f', '#8a6f4d', '#4a76b8']],
  KWD: [106, ['dhow', 'towers'], ['#4a76b8', '#5f9e63', '#c46a6a', '#9a8a6a', '#8a6f4d', '#9a6bb8']],
  KYD: [106, ['turtle', 'starfish'], ['#7d8ba0', '#c0392b', '#d9a05e', '#5f9e63', '#4a76b8', '#9a6bb8']],
  KZT: [106, ['eagle', 'pattern'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#c46a6a', '#8a6f4d', '#a89880', '#c9a24a']],
  LAK: [106, ['stupa', 'elephant'], ['#c9a24a', '#9a8a6a', '#5f9e63', '#4a76b8', '#9a6bb8', '#c46a6a', '#a89880']],
  LBP: [106, ['cedar', 'archgate'], ['#9a8a6a', '#c46a6a', '#5f9e63', '#4a76b8', '#9a6bb8', '#8a6f4d']],
  LKR: [106, ['elephant', 'lotus'], ['#9a6bb8', '#8a6f4d', '#c46a6a', '#5f9e63', '#4a76b8', '#c9a24a']],
  LRD: [106, ['ship', 'drum'], ['#9a6bb8', '#4a76b8', '#5f9e63', '#8a6f4d', '#a89880']],
  LSL: [106, ['mountain', 'hat'], ['#5f9e63', '#8a6f4d', '#4a76b8', '#c46a6a', '#a89880']],
  LYD: [106, ['archgate', 'starcrescent'], ['#4a76b8', '#5f9e63', '#8a6f4d', '#9a8a6a', '#c46a6a']],
  MAD: [106, ['archgate', 'star'], ['#c46a6a', '#5f9e63', '#4a76b8', '#9a8a6a']],
  MDL: [106, ['ox', 'grapes'], ['#c9a24a', '#5f9e63', '#4a76b8', '#c46a6a', '#8a6f4d', '#a89880', '#9a6bb8']],
  MGA: [106, ['baobab', 'ox'], ['#c46a6a', '#5f9e63', '#9a8a6a', '#4a76b8', '#c9a24a', '#8a6f4d', '#9a6bb8', '#a89880']],
  MKD: [106, ['bridge', 'sun'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#c46a6a', '#a89880', '#d9a05e', '#c9a24a']],
  MMK: [106, ['pagoda', 'drum'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#c46a6a', '#a89880', '#9a6bb8']],
  MNT: [106, ['horse', 'sun'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#c46a6a', '#a89880', '#7d8ba0', '#c9a24a', '#d9a05e', '#c0392b']],
  MOP: [106, ['temple', 'lotus'], ['#9a6bb8', '#5f9e63', '#c46a6a', '#4a76b8', '#8a6f4d', '#d9a05e']],
  MRU: [106, ['archgate', 'camel'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#c46a6a', '#a89880']],
  MUR: [106, ['dodo', 'palm'], ['#9a6bb8', '#5f9e63', '#c46a6a', '#4a76b8', '#d9a05e', '#8a6f4d', '#a89880']],
  MVR: [106, ['fish', 'palm'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#c46a6a', '#a89880']],
  MWK: [106, ['fish', 'sun'], ['#9a6bb8', '#5f9e63', '#4a76b8', '#c46a6a', '#8a6f4d', '#a89880', '#d9a05e', '#c9a24a']],
  MXN: [106, ['pyramid', 'cactus'], ['#7fa8c0', '#c46a6a', '#9a6bb8', '#5f9e63', '#d9a05e', '#4a76b8']],
  MYR: [106, ['flower', 'towers'], ['#9a6bb8', '#3fa0a8', '#d98b3f', '#c0392b', '#5f9e63', '#4a76b8']],
  MZN: [106, ['drum', 'star'], ['#9a6bb8', '#5f9e63', '#4a76b8', '#c46a6a', '#8a6f4d', '#a89880']],
  NAD: [106, ['antelope', 'sun'], ['#5f9e63', '#8a6f4d', '#4a76b8', '#c46a6a', '#a89880']],
  NGN: [106, ['drum', 'pattern'], ['#c9a24a', '#9a6bb8', '#5f9e63', '#4a76b8', '#c46a6a', '#a89880', '#d9a05e', '#7fa86b']],
  NIO: [106, ['volcano', 'sun'], ['#9a6bb8', '#5f9e63', '#4a76b8', '#c46a6a', '#8a6f4d', '#a89880', '#d9a05e']],
  NOK: [104, ['longship', 'mountain'], ['#c0392b', '#8a6f4d', '#5f9e63', '#4a76b8', '#9a6bb8']],
  NPR: [106, ['mountain', 'flower'], ['#9a6bb8', '#4a76b8', '#5f9e63', '#c46a6a', '#8a6f4d', '#a89880']],
  NZD: [104, ['kiwi', 'stars'], ['#c0392b', '#4a76b8', '#9a6bb8', '#d9a05e', '#5f9e63']],
  OMR: [106, ['dhow', 'archgate'], ['#9a6bb8', '#c46a6a', '#5f9e63', '#4a76b8', '#a89880', '#8a6f4d', '#c9a24a']],
  PAB: [106, ['ship', 'hat'], ['#c0392b', '#4a76b8', '#c0392b', '#5f9e63', '#8a6f4d', '#9a6bb8']],
  PEN: [106, ['llama', 'mountain'], ['#9a6bb8', '#9a8a6a', '#c46a6a', '#5f9e63', '#4a76b8']],
  PGK: [106, ['paradise', 'drum'], ['#d9a05e', '#c9a24a', '#5f9e63', '#4a76b8', '#9a6bb8']],
  PHP: [106, ['sun', 'eagle'], ['#d9a05e', '#c46a6a', '#9a6bb8', '#5f9e63', '#4a76b8', '#c0392b']],
  PKR: [106, ['mosque', 'starcrescent'], ['#9a6bb8', '#5f9e63', '#a89880', '#c46a6a', '#8a6f4d', '#4a76b8', '#c9a24a']],
  PLN: [106, ['eagle', 'wheat'], ['#c9a24a', '#5f9e63', '#9a8a6a', '#c46a6a', '#4a76b8', '#d9a05e']],
  PYG: [106, ['palm', 'star'], ['#9a6bb8', '#5f9e63', '#c46a6a', '#d9a05e', '#8a6f4d']],
  QAR: [106, ['dhow', 'palm'], ['#9a8a6a', '#c46a6a', '#5f9e63', '#4a76b8', '#a89880', '#d9a05e', '#9a6bb8']],
  RON: [106, ['castle', 'eagle'], ['#c9a24a', '#4a76b8', '#9a6bb8', '#5f9e63', '#c0392b']],
  RSD: [106, ['bolt', 'bridge'], ['#9a6bb8', '#5f9e63', '#4a76b8', '#c46a6a', '#8a6f4d', '#a89880', '#d9a05e', '#c9a24a', '#9a8a6a']],
  RUB: [106, ['onion', 'castle'], ['#c46a6a', '#5f9e63', '#9a8a6a', '#8a6f4d', '#4a76b8', '#9a6bb8']],
  RWF: [106, ['ox', 'drum'], ['#9a6bb8', '#c9a24a', '#5f9e63', '#4a76b8']],
  SAR: [106, ['palm', 'mosque'], ['#4a76b8', '#5f9e63', '#9a8a6a', '#8a6f4d', '#c9a24a']],
  SBD: [106, ['fish', 'drum'], ['#5f9e63', '#4a76b8', '#c9a24a', '#d9a05e', '#9a6bb8']],
  SCR: [106, ['turtle', 'palm'], ['#9a6bb8', '#5f9e63', '#4a76b8', '#c9a24a']],
  SDG: [106, ['pyramid', 'starcrescent'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#c46a6a', '#8a6f4d', '#a89880', '#c9a24a']],
  SEK: [104, ['horse', 'flower'], ['#c9a24a', '#9a6bb8', '#5f9e63', '#8a6f4d', '#4a76b8']],
  SGD: [106, ['lion', 'flower'], ['#9a6bb8', '#5f9e63', '#4a76b8', '#c0392b', '#d9a05e', '#9a8a6a']],
  SHP: [106, ['bird', 'ship'], ['#4a76b8', '#5f9e63', '#8a6f4d', '#9a6bb8']],
  SLE: [106, ['drum', 'mask'], ['#5f9e63', '#4a76b8', '#9a6bb8', '#c9a24a', '#d9a05e', '#8a6f4d', '#a89880']],
  SOS: [106, ['camel', 'star'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#c46a6a', '#8a6f4d']],
  SRD: [106, ['bird', 'ship'], ['#9a6bb8', '#5f9e63', '#c46a6a', '#4a76b8', '#a89880', '#d9a05e', '#9a8a6a']],
  SSP: [106, ['giraffe', 'drum'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#c46a6a', '#d9a05e', '#a89880', '#c9a24a']],
  STN: [106, ['palm', 'fish'], ['#c9a24a', '#9a6bb8', '#5f9e63', '#4a76b8', '#8a6f4d']],
  SVC: [106, ['volcano', 'hat'], ['#9a6bb8', '#5f9e63', '#c9a24a', '#4a76b8', '#d9a05e', '#c46a6a']],
  SYP: [106, ['archgate', 'eagle'], ['#9a8a6a', '#c46a6a', '#5f9e63', '#4a76b8', '#a89880', '#c9a24a']],
  SZL: [106, ['rhino', 'elephant'], ['#9a6bb8', '#c9a24a', '#4a76b8', '#c46a6a', '#8a6f4d']],
  THB: [106, ['pagoda', 'elephant'], ['#a09078', '#8a6bb8', '#c46a6a', '#4a76b8', '#5f9e63']],
  TJS: [106, ['pattern', 'mountain'], ['#9a8a6a', '#c9a24a', '#5f9e63', '#4a76b8', '#c46a6a', '#a89880', '#7fa86b', '#d9a05e', '#9a6bb8']],
  TMT: [106, ['pattern', 'horse'], ['#8a6f4d', '#9a8a6a', '#5f9e63', '#4a76b8', '#c46a6a', '#a89880', '#9a6bb8']],
  TND: [106, ['archgate', 'olive'], ['#c46a6a', '#4a76b8', '#9a8a6a', '#5f9e63']],
  TOP: [106, ['palm', 'drum'], ['#c9a24a', '#5f9e63', '#4a76b8', '#c46a6a', '#d9a05e', '#9a6bb8']],
  TRY: [106, ['starcrescent', 'mosque'], ['#c0392b', '#9a8a6a', '#d9a05e', '#8a6f4d', '#c46a6a', '#4a76b8']],
  TTD: [106, ['hummingbird', 'bird'], ['#5f9e63', '#c9a24a', '#4a76b8', '#c46a6a', '#9a6bb8', '#a89880']],
  TWD: [106, ['deer', 'mountain'], ['#5f9e63', '#3f6bb8', '#8a6f4d', '#8e6bb8', '#c0392b']],
  TZS: [106, ['mountain', 'giraffe'], ['#9a6bb8', '#5f9e63', '#4a76b8', '#c9a24a', '#8a6f4d']],
  UAH: [106, ['sunflower', 'wheat'], ['#9a6bb8', '#5f9e63', '#4a76b8', '#c46a6a', '#8a6f4d', '#d9a05e']],
  UGX: [106, ['crane', 'drum'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#c46a6a', '#a89880', '#c9a24a']],
  USD: [108, ['temple', 'eagle'], ['#7f9bb8', '#c8a0a8', '#d8b89a', '#d9a05e', '#a08ea8', '#8a9484', '#8a9484']],
  UYU: [106, ['sun', 'bird'], ['#5f9e63', '#9a6bb8', '#d9a05e', '#4a76b8', '#c46a6a', '#a89880']],
  UZS: [106, ['pattern', 'temple'], ['#8a6f4d', '#9a8a6a', '#5f9e63', '#4a76b8', '#c46a6a', '#a89880', '#c9a24a', '#d9a05e']],
  VES: [106, ['bird', 'mountain'], ['#9a6bb8', '#d9a05e', '#8a6f4d', '#4a76b8', '#c46a6a', '#a89880', '#5f9e63']],
  VND: [106, ['bridge', 'mountain'], ['#9a6bb8', '#8a6f4d', '#9a8a6a', '#4a76b8', '#5f9e63', '#c46a6a', '#a89880', '#d9a05e', '#c9a24a']],
  VUV: [106, ['tusk', 'palm'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#c46a6a', '#a89880', '#d9a05e']],
  WST: [106, ['palm', 'star'], ['#c9a24a', '#5f9e63', '#4a76b8', '#c46a6a', '#d9a05e']],
  XAF: [106, ['mask', 'drum'], FR],
  XCD: [106, ['parrot', 'turtle'], ['#9a6bb8', '#d9a05e', '#5f9e63', '#4a76b8', '#c46a6a']],
  XOF: [106, ['mask', 'drum'], FR],
  XPF: [106, ['palm', 'fish'], ['#c46a6a', '#5f9e63', '#d9a05e', '#4a76b8']],
  YER: [106, ['towerhouse', 'archgate'], ['#9a8a6a', '#5f9e63', '#4a76b8', '#c46a6a', '#a89880', '#d9a05e']],
  ZAR: [106, ['rhino', 'lion'], ['#9a6bb8', '#c9a24a', '#5f9e63', '#8a6f4d', '#a89880']],
  ZMW: [106, ['eagle', 'geyser'], ['#c9a24a', '#9a6bb8', '#5f9e63', '#4a76b8', '#d9a05e']],
  ZWG: [106, ['bird', 'mountain'], ['#a89880', '#9a6bb8', '#5f9e63', '#4a76b8', '#c46a6a', '#8a6f4d', '#d9a05e', '#a89880']],
};

/* distinctive coin shapes: Japan's holed 5/50 yen, the Chinese cash coin,
   Britain's heptagonal 20p */
export const COIN_SHAPE = { CNY: { all: 'sq' }, JPY: { 5: 'h', 50: 'h' }, GBP: { 0.2: 'hept' } };

/* ---------------- drawing ------------------------------------------------ */
const grp = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009');
export const cashId = (cur, coin, v) => `${cur}-${coin ? 'c' : 'n'}-${String(v).replace('.', '_')}`;
const serial = (cur, v) => { let h = 7; const s = cur + v; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 1e6; return `${cur.slice(0, 2)} ${(h % 900) + 100} ${(h * 7 % 900000 + 100000)}`; };

export function noteVB(cur) { return `0 0 240 ${(S[cur] || S.USD)[0]}`; }
export const coinVB = () => '0 0 88 88';

/* one banknote: color from the currency's real ladder, a hand-drawn motif in
   a framed vignette, big denomination, serials, guilloche waves */
export function noteSVG(cur, v, sym, idx) {
  const st = S[cur] || S.USD;
  const H = st[0], motifs = st[1], cols = st[2];
  const col = cols[idx % cols.length];
  const motif = MOTIFS[motifs[idx % motifs.length]] || MOTIFS.temple;
  const digits = String(Math.round(v)).replace('.', '').length;
  const fs = digits <= 3 ? 34 : digits === 4 ? 28 : digits === 5 ? 23 : digits === 6 ? 19 : 15;
  const wx = 138, wy = 10, ww = 92, wh = H - 20;
  const ms = Math.min(ww / 124, wh / 88);
  const mx = wx + (ww - 120 * ms) / 2, my = wy + (wh - 84 * ms) / 2;
  return `<symbol id="cn-${cashId(cur, 0, v)}" viewBox="0 0 240 ${H}"><rect x="2" y="2" width="236" height="${H - 4}" rx="11" fill="${col}" stroke="rgba(0,0,0,.45)" stroke-width="3"/><rect x="2" y="2" width="236" height="${(H - 4) / 2}" rx="11" fill="rgba(255,255,255,.07)"/><rect x="9" y="9" width="222" height="${H - 18}" rx="7" fill="none" stroke="rgba(255,255,255,.42)" stroke-width="1.6" stroke-dasharray="1 5" stroke-linecap="round"/><path d="M14 ${H - 13} q22 -16 44 0 t44 0 t44 0 t44 0" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="2.5"/><rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="10" fill="rgba(255,255,255,.13)" stroke="rgba(255,255,255,.5)" stroke-width="1.5"/><g transform="translate(${mx.toFixed(1)} ${my.toFixed(1)}) scale(${ms.toFixed(3)})">${motif}</g><text x="20" y="46" font-size="${fs}" font-weight="700" fill="rgba(255,255,255,.93)">${grp(v)}</text><text x="20" y="${H - 26}" font-size="13" fill="rgba(255,255,255,.82)">${sym} · ${cur}</text><text x="20" y="${H - 11}" font-size="8.5" letter-spacing="1.5" fill="rgba(255,255,255,.55)">${serial(cur, v)}</text><text x="231" y="24" text-anchor="end" font-size="9" letter-spacing="2" fill="rgba(255,255,255,.6)">${serial(cur, v + 'b')}</text></symbol>`;
}

/* one coin: gold / silver / copper by place in the ladder, milled edge,
   and the shape real coins of that currency actually have */
export function coinSVG(cur, v, idx) {
  const metal = idx <= 1 ? 'gold' : idx <= 3 ? 'silver' : 'copper';
  const shape = (COIN_SHAPE[cur] && (COIN_SHAPE[cur][v] || COIN_SHAPE[cur].all)) || 'r';
  const t = (shape === 'sq' || shape === 'h') ? 60 : 52;
  let base;
  if (shape === 'r') base = `<circle cx="44" cy="44" r="40" fill="url(#cg-${metal})" stroke="rgba(0,0,0,.4)" stroke-width="3"/>`;
  else if (shape === 'h') base = `<circle cx="44" cy="44" r="40" fill="url(#cg-${metal})" stroke="rgba(0,0,0,.4)" stroke-width="3"/><circle cx="44" cy="44" r="13" fill="rgba(0,0,0,.38)"/>`;
  else if (shape === 'sq') base = `<circle cx="44" cy="44" r="41" fill="url(#cg-${metal})" stroke="rgba(0,0,0,.4)" stroke-width="3"/><rect x="34" y="34" width="20" height="20" fill="rgba(0,0,0,.38)"/>`;
  else if (shape === 'hept') { const p = []; for (let k = 0; k < 7; k++) { const a = -Math.PI / 2 + k * 2 * Math.PI / 7; p.push(`${(44 + 41 * Math.cos(a)).toFixed(1)},${(44 + 41 * Math.sin(a)).toFixed(1)}`); } base = `<polygon points="${p.join(' ')}" fill="url(#cg-${metal})" stroke="rgba(0,0,0,.4)" stroke-width="3" stroke-linejoin="round"/>`; }
  else { const d = []; for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6; d.push(`${(44 + 38 * Math.cos(a)).toFixed(1)},${(44 + 38 * Math.sin(a)).toFixed(1)} ${+(44 + 41 * Math.cos(a + Math.PI / 12)).toFixed(1)},${+(44 + 41 * Math.sin(a + Math.PI / 12)).toFixed(1)}`); } base = `<polygon points="${d.join(' ')}" fill="url(#cg-${metal})" stroke="rgba(0,0,0,.4)" stroke-width="3" stroke-linejoin="round"/>`; }
  return `<symbol id="cc-${cashId(cur, 1, v)}" viewBox="0 0 88 88">${base}<circle cx="44" cy="44" r="31" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="2" stroke-dasharray="2 4"/><text x="44" y="${t}" text-anchor="middle" font-size="21" font-weight="700" fill="rgba(70,45,0,.75)">${grp(v)}</text></symbol>`;
}

/* the leather wallet they pop out of + metal gradients for the coins */
export const GRADS = `<radialGradient id="cg-gold" cx="35%" cy="30%"><stop offset="0" stop-color="#f7e08b"/><stop offset="1" stop-color="#b8860b"/></radialGradient><radialGradient id="cg-silver" cx="35%" cy="30%"><stop offset="0" stop-color="#f0f2f4"/><stop offset="1" stop-color="#8e979f"/></radialGradient><radialGradient id="cg-copper" cx="35%" cy="30%"><stop offset="0" stop-color="#e2a378"/><stop offset="1" stop-color="#a35a2c"/></radialGradient>`;
export const WALLET_ART = `<defs><linearGradient id="cwl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5a33"/><stop offset="1" stop-color="#5f3a1e"/></linearGradient></defs><rect x="20" y="58" width="300" height="146" rx="20" fill="url(#cwl)"/><rect x="20" y="58" width="300" height="26" rx="12" fill="rgba(0,0,0,.42)"/><rect x="28" y="92" width="284" height="104" rx="14" fill="none" stroke="rgba(255,224,170,.35)" stroke-width="2" stroke-dasharray="6 5"/><rect x="150" y="128" width="170" height="56" rx="14" fill="rgba(0,0,0,.16)"/><rect x="252" y="140" width="50" height="30" rx="9" fill="#caa24a"/><circle cx="277" cy="155" r="5" fill="#8a5a33"/>`;

/* greedy change-making into the currency's real denominations (integer math
   in the currency's own minor-unit scale, so 3-decimal dinars keep their
   fils and 0-decimal yen never invent sen) */
export function splitCash(cur, total) {
  const Ld = L[cur];
  if (!Ld) return { out: [], rest: total };
  const dec = DEC3.has(cur) ? 3 : DEC0.has(cur) ? 0 : 2;
  const sc = 10 ** dec;
  let rem = Math.round(total * sc);
  const out = [];
  Ld[0].forEach((v, idx) => {
    if (out.length >= 22) return;
    const unit = Math.round(v * sc);
    const n = Math.min(Math.floor(rem / unit), 30);
    if (n > 0) { out.push({ v, n, coin: false, idx }); rem -= unit * n; }
  });
  Ld[1].forEach((v, idx) => {
    if (out.length >= 32) return;
    const unit = Math.round(v * sc);
    const n = Math.min(Math.floor(rem / unit), 20);
    if (n > 0) { out.push({ v, n, coin: true, idx }); rem -= unit * n; }
  });
  return { out, rest: rem / sc };
}
