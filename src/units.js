/* ============================================================
   SinghoModule Converter — the unit database.

   Every conversion factor is an EXACT rational [BigInt num, BigInt den]
   against the category's SI base, so conversions are computed with the
   same BigDecimal-style exactness as the Number module — never floats.
   Temperature is affine (K = m·x + b) with rational m and b; the odd
   ones out (parsec, radian) are π-defined and carry 30+ significant
   digits, far past any rounding the renderer can show.

   Structure per unit: [key, symbol, English name, factor|m, offset?]
   factor: value × factor = value in the SI base of its category
   ============================================================ */

const rg = (a, b) => { while (b) { const t = a % b; a = b; b = t; } return a; };
const rn = (n, d) => { if (d < 0n) { n = -n; d = -d; } let g = rg(n < 0n ? -n : n, d); if (!g) g = 1n; return { n: n / g, d: d / g }; };
const q = (s) => { const [a, b = '1'] = String(s).split('/'); return { n: BigInt(a), d: BigInt(b) }; };
const rmul = (x, y) => rn(x.n * y.n, x.d * y.d);
const rdiv = (x, y) => rn(x.n * y.d, x.d * y.n);
const radd = (x, y) => rn(x.n * y.d + y.n * x.d, x.d * y.d);
const rsub = (x, y) => rn(x.n * y.d - y.n * x.d, x.d * y.d);

/* the categories, in picker order; the second field is the i18n key */
export const CATS = [
  ['length', 'ucLength'], ['mass', 'ucMass'], ['time', 'ucTime'], ['temp', 'ucTemp'],
  ['speed', 'ucSpeed'], ['area', 'ucArea'], ['volume', 'ucVolume'], ['pressure', 'ucPressure'],
  ['energy', 'ucEnergy'], ['power', 'ucPower'], ['force', 'ucForce'], ['data', 'ucData'],
  ['angle', 'ucAngle'], ['frequency', 'ucFrequency'], ['viscosity', 'ucViscosity'],
  ['kinvisc', 'ucKinvisc'], ['activity', 'ucActivity'], ['dose', 'ucDose'], ['dosq', 'ucDosq'],
];

export const UNITS = {
  /* ---- length (base m) — SI + CGS kin + imperial + obsolete ---- */
  length: [
    ['m', 'm', 'metre', '1'],
    ['km', 'km', 'kilometre', '1000'],
    ['dm', 'dm', 'decimetre', '1/10'],
    ['cm', 'cm', 'centimetre', '1/100'],
    ['mm', 'mm', 'millimetre', '1/1000'],
    ['um', 'µm', 'micrometre', '1/1000000'],
    ['nm', 'nm', 'nanometre', '1/1000000000'],
    ['pm', 'pm', 'picometre', '1/1000000000000'],
    ['fm', 'fm', 'femtometre', '1/1000000000000000'],
    ['A', 'Å', 'ångström', '1/10000000000'],
    ['in', 'in', 'inch', '127/5000'],
    ['ft', 'ft', 'foot', '381/1250'],
    ['yd', 'yd', 'yard', '1143/1250'],
    ['mi', 'mi', 'mile', '201168/125'],
    ['nmi', 'nmi', 'nautical mile', '1852'],
    ['fur', 'fur', 'furlong', '25146/125'],
    ['ch', 'ch', 'chain', '25146/1250'],
    ['rd', 'rd', 'rod', '12573/2500'],
    ['ftm', 'ftm', 'fathom', '1143/625'],
    ['mil', 'mil', 'mil (thou)', '127/5000000'],
    ['pt', 'pt', 'point', '127/360000'],
    ['pica', 'pica', 'pica', '127/30000'],
    ['ly', 'ly', 'light-year', '9460730472580800'],
    ['AU', 'AU', 'astronomical unit', '149597870700'],
    ['pc', 'pc', 'parsec (≈)', '30856775814913673000/1000'],
  ],
  /* ---- mass (base kg) ---- */
  mass: [
    ['kg', 'kg', 'kilogram', '1'],
    ['g', 'g', 'gram', '1/1000'],
    ['mg', 'mg', 'milligram', '1/1000000'],
    ['ug', 'µg', 'microgram', '1/1000000000'],
    ['t', 't', 'tonne', '1000'],
    ['q', 'q', 'quintal', '100'],
    ['ct', 'ct', 'carat', '1/5000'],
    ['gr', 'gr', 'grain', '6479891/10000000000'],
    ['oz', 'oz', 'ounce', '45359237/1600000000'],
    ['lb', 'lb', 'pound', '45359237/100000000'],
    ['st', 'st', 'stone', '317514659/50000000'],
    ['cwtUK', 'cwt', 'hundredweight (long)', '635029318/12500000'],
    ['tonUS', 'ton', 'ton (short)', '45359237/50000'],
    ['tonUK', 'LT', 'ton (long)', '635029318/625000'],
    ['ozt', 'oz t', 'troy ounce', '311034768/10000000000'],
    ['slug', 'slug', 'slug', '729695147/50000000'],
    ['dr', 'dr', 'dram', '17718451953125/10000000000000000'],
  ],
  /* ---- time (base s) ---- */
  time: [
    ['s', 's', 'second', '1'],
    ['ms', 'ms', 'millisecond', '1/1000'],
    ['us', 'µs', 'microsecond', '1/1000000'],
    ['ns', 'ns', 'nanosecond', '1/1000000000'],
    ['ps', 'ps', 'picosecond', '1/1000000000000'],
    ['fs', 'fs', 'femtosecond', '1/1000000000000000'],
    ['min', 'min', 'minute', '60'],
    ['h', 'h', 'hour', '3600'],
    ['d', 'd', 'day', '86400'],
    ['wk', 'wk', 'week', '604800'],
    ['fortnight', 'fortnight', 'fortnight', '1209600'],
    ['mo', 'mo', 'month (average)', '2629746'],
    ['yr', 'yr', 'year (Gregorian)', '31556952'],
    ['jyr', 'yr (J)', 'year (Julian)', '31557600'],
    ['shake', 'shake', 'shake', '1/100000000'],
    ['svb', 'Sv', 'svedberg', '1/1000000000000'],
  ],
  /* ---- temperature (base K) — affine: K = m·x + b ---- */
  temp: [
    ['K', 'K', 'kelvin', '1', '0'],
    ['degC', '°C', 'Celsius', '1', '5463/20'],
    ['degF', '°F', 'Fahrenheit', '5/9', '45967/180'],
    ['degR', '°R', 'Rankine', '5/9', '0'],
    ['degRe', '°Ré', 'Réaumur', '5/4', '5463/20'],
    ['degDe', '°De', 'DeLisle', '-2/3', '7463/20'],
    ['degRo', '°Rø', 'Rømer', '40/21', '36241/140'],
    ['degN', '°N', 'Newton', '100/33', '5463/20'],
  ],
  /* ---- speed (base m/s) ---- */
  speed: [
    ['mps', 'm/s', 'metre per second', '1'],
    ['kmh', 'km/h', 'kilometre per hour', '5/18'],
    ['mph', 'mph', 'mile per hour', '1397/3125'],
    ['fts', 'ft/s', 'foot per second', '381/1250'],
    ['kn', 'kn', 'knot', '463/900'],
    ['mach', 'Mach', 'Mach (sea level, ≈)', '34029/100'],
    ['c', 'c', 'speed of light', '299792458'],
  ],
  /* ---- area (base m²) ---- */
  area: [
    ['m2', 'm²', 'square metre', '1'],
    ['km2', 'km²', 'square kilometre', '1000000'],
    ['cm2', 'cm²', 'square centimetre', '1/10000'],
    ['are', 'a', 'are', '100'],
    ['ha', 'ha', 'hectare', '10000'],
    ['acre', 'acre', 'acre', '40468564224/10000000'],
    ['in2', 'in²', 'square inch', '16129/25000000'],
    ['ft2', 'ft²', 'square foot', '145161/1562500'],
    ['yd2', 'yd²', 'square yard', '1306449/1562500'],
    ['mi2', 'mi²', 'square mile', '40468564224/15625'],
    ['barn', 'b', 'barn', '1/10000000000000000000000000000'],
  ],
  /* ---- volume (base m³) ---- */
  volume: [
    ['m3', 'm³', 'cubic metre', '1'],
    ['l', 'L', 'litre', '1/1000'],
    ['ml', 'mL', 'millilitre', '1/1000000'],
    ['cm3', 'cm³', 'cubic centimetre', '1/1000000'],
    ['galUS', 'gal', 'gallon (US)', '473176473/125000000000'],
    ['galUK', 'gal (UK)', 'gallon (imperial)', '454609/100000000'],
    ['qtUS', 'qt', 'quart (US)', '473176473/500000000000'],
    ['qtUK', 'qt (UK)', 'quart (imperial)', '454609/400000000'],
    ['ptUS', 'pt', 'pint (US)', '473176473/1000000000000'],
    ['ptUK', 'pt (UK)', 'pint (imperial)', '454609/800000000'],
    ['cupUS', 'cup', 'cup (US)', '473176473/2000000000000'],
    ['flozUS', 'fl oz', 'fluid ounce (US)', '473176473/16000000000000'],
    ['flozUK', 'fl oz (UK)', 'fluid ounce (imperial)', '454609/16000000000'],
    ['tbsUS', 'tbsp', 'tablespoon (US)', '473176473/32000000000000'],
    ['tspUS', 'tsp', 'teaspoon (US)', '473176473/96000000000000'],
    ['bbl', 'bbl', 'barrel (oil)', '158987294928/1000000000000'],
    ['buUS', 'bu', 'bushel (US)', '3523907016688/100000000000000'],
    ['pkUS', 'pk', 'peck (US)', '880976754172/100000000000000'],
    ['giUS', 'gi', 'gill (US)', '473176473/4000000000000'],
    ['drfl', 'fl dr', 'fluid dram (US)', '473176473/128000000000000'],
    ['minfl', 'minim', 'minim (US)', '473176473/7680000000000000'],
    ['cord', 'cord', 'cord', '3624556363776/1000000000000'],
  ],
  /* ---- pressure (base Pa) ---- */
  pressure: [
    ['Pa', 'Pa', 'pascal', '1'],
    ['kPa', 'kPa', 'kilopascal', '1000'],
    ['MPa', 'MPa', 'megapascal', '1000000'],
    ['bar', 'bar', 'bar', '100000'],
    ['mbar', 'mbar', 'millibar', '100'],
    ['atm', 'atm', 'atmosphere', '101325'],
    ['torr', 'Torr', 'torr', '101325/760'],
    ['mmhg', 'mmHg', 'millimetre of mercury', '133322387415/1000000000'],
    ['inhg', 'inHg', 'inch of mercury', '3386389/1000'],
    ['psi', 'psi', 'pound per square inch', '6894757293168/1000000000'],
    ['ba', 'Ba', 'barye (CGS)', '1/10'],
    ['pz', 'pz', 'pieze', '1000'],
  ],
  /* ---- energy (base J) ---- */
  energy: [
    ['J', 'J', 'joule', '1'],
    ['kJ', 'kJ', 'kilojoule', '1000'],
    ['MJ', 'MJ', 'megajoule', '1000000'],
    ['wh', 'Wh', 'watt-hour', '3600'],
    ['kwh', 'kWh', 'kilowatt-hour', '3600000'],
    ['cal', 'cal', 'calorie', '523/125'],
    ['kcal', 'kcal', 'kilocalorie', '4184'],
    ['erg', 'erg', 'erg (CGS)', '1/10000000'],
    ['ev', 'eV', 'electronvolt', '1602176634/10000000000000000000000000000'],
    ['kev', 'keV', 'kiloelectronvolt', '1602176634/10000000000000000000000000'],
    ['mev', 'MeV', 'megaelectronvolt', '1602176634/10000000000000000000000'],
    ['btu', 'BTU', 'British thermal unit', '105505585262/100000000'],
    ['th', 'th', 'therm', '105506000000'],
    ['eh', 'Eh', 'hartree (≈)', '4359744722071/1000000000000000000000000000000000'],
    ['ftlbf', 'ft·lbf', 'foot-pound', '13558179483314004/10000000000000000'],
    ['tnt', 't TNT', 'ton of TNT', '4184000000'],
  ],
  /* ---- power (base W) ---- */
  power: [
    ['W', 'W', 'watt', '1'],
    ['kW', 'kW', 'kilowatt', '1000'],
    ['MW', 'MW', 'megawatt', '1000000'],
    ['GW', 'GW', 'gigawatt', '1000000000'],
    ['hp', 'hp', 'horsepower', '7456998715822702/10000000000000'],
    ['hpm', 'hp (M)', 'metric horsepower', '2941995/4000'],
    ['btuh', 'BTU/h', 'BTU per hour', '52752792631/180000000000'],
  ],
  /* ---- force (base N) ---- */
  force: [
    ['N', 'N', 'newton', '1'],
    ['kN', 'kN', 'kilonewton', '1000'],
    ['dyn', 'dyn', 'dyne (CGS)', '1/100000'],
    ['kgf', 'kgf', 'kilogram-force', '196133/20000'],
    ['lbf', 'lbf', 'pound-force', '8896443230521/2000000000000'],
    ['ozf', 'ozf', 'ounce-force', '8896443230521/32000000000000'],
    ['pdl', 'pdl', 'poundal', '17281869297/125000000000'],
    ['sn', 'sn', 'sthene', '1000'],
  ],
  /* ---- data (base bit) — exact-case keys, the byte/bit split ---- */
  data: [
    ['bit', 'bit', 'bit', '1'],
    ['B', 'B', 'byte', '8'],
    ['nibble', 'nibble', 'nibble', '4'],
    ['kbit', 'kbit', 'kilobit', '1000'],
    ['kB', 'kB', 'kilobyte', '8000'],
    ['KiB', 'KiB', 'kibibyte', '8192'],
    ['Mbit', 'Mbit', 'megabit', '1000000'],
    ['MB', 'MB', 'megabyte', '8000000'],
    ['MiB', 'MiB', 'mebibyte', '8388608'],
    ['Gbit', 'Gbit', 'gigabit', '1000000000'],
    ['GB', 'GB', 'gigabyte', '8000000000'],
    ['GiB', 'GiB', 'gibibyte', '8589934592'],
    ['Tbit', 'Tbit', 'terabit', '1000000000000'],
    ['TB', 'TB', 'terabyte', '8000000000000'],
    ['TiB', 'TiB', 'tebibyte', '8796093022208'],
    ['Pbit', 'Pbit', 'petabit', '1000000000000000'],
    ['PB', 'PB', 'petabyte', '8000000000000000'],
    ['PiB', 'PiB', 'pebibyte', '9007199254740992'],
    ['EB', 'EB', 'exabyte', '8000000000000000000'],
    ['EiB', 'EiB', 'exbibyte', '9223372036854775808'],
  ],
  /* ---- angle (base turn) — radian is π-defined, ≈ ---- */
  angle: [
    ['tr', 'turn', 'turn', '1'],
    ['deg', '°', 'degree', '1/360'],
    ['gon', 'gon', 'gradian', '1/400'],
    ['am', '′', 'arcminute', '1/21600'],
    ['as', '″', 'arcsecond', '1/1296000'],
    ['rad', 'rad', 'radian (≈)', '1000000000000000000000000000000/6283185307179586476925286766559'],
  ],
  /* ---- frequency (base Hz) ---- */
  frequency: [
    ['hz', 'Hz', 'hertz', '1'],
    ['khz', 'kHz', 'kilohertz', '1000'],
    ['mhz', 'MHz', 'megahertz', '1000000'],
    ['ghz', 'GHz', 'gigahertz', '1000000000'],
    ['thz', 'THz', 'terahertz', '1000000000000'],
    ['rpm', 'rpm', 'revolution per minute', '1/60'],
  ],
  /* ---- dynamic viscosity (base Pa·s) ---- */
  viscosity: [
    ['pas', 'Pa·s', 'pascal-second', '1'],
    ['mpas', 'mPa·s', 'millipascal-second', '1/1000'],
    ['p', 'P', 'poise (CGS)', '1/10'],
    ['cp', 'cP', 'centipoise', '1/1000'],
  ],
  /* ---- kinematic viscosity (base m²/s) ---- */
  kinvisc: [
    ['m2s', 'm²/s', 'square metre per second', '1'],
    ['st', 'St', 'stokes (CGS)', '1/10000'],
    ['cst', 'cSt', 'centistokes', '1/10000000'],
  ],
  /* ---- radioactivity (base Bq) ---- */
  activity: [
    ['bq', 'Bq', 'becquerel', '1'],
    ['ci', 'Ci', 'curie', '37000000000'],
    ['ru', 'Rd', 'rutherford', '1000000'],
  ],
  /* ---- absorbed dose (base Gy) ---- */
  dose: [
    ['gy', 'Gy', 'gray', '1'],
    ['radU', 'rad', 'rad', '1/100'],
  ],
  /* ---- equivalent dose (base Sv) ---- */
  dosq: [
    ['sv', 'Sv', 'sievert', '1'],
    ['rem', 'rem', 'roentgen-equivalent-man', '1/100'],
  ],
};

/* ---- name lookup: symbols, keys, English names, then the curated
       alias table (EN + 中文). Exact case is tried first so kB (kilobyte)
       never collapses into kbit; single letters c/f/k/r read as the
       temperature scales, as they do in conversation. ---- */
const ALIAS = {
  metre: 'm', meter: 'm', metres: 'm', meters: 'm', m: 'm',
  kilometre: 'km', kilometer: 'km', kilometres: 'km', kilometers: 'km',
  centimetre: 'cm', centimeter: 'cm', millimetre: 'mm', millimeter: 'mm',
  micrometre: 'um', micrometer: 'um', micron: 'um', microns: 'um',
  nanometre: 'nm', nanometer: 'nm', picometre: 'pm', picometer: 'pm',
  femtometre: 'fm', femtometer: 'fm', fermi: 'fm',
  angstrom: 'A', angstroms: 'A',
  inch: 'in', inches: 'in', foot: 'ft', feet: 'ft', ft: 'ft',
  yard: 'yd', yards: 'yd', mile: 'mi', miles: 'mi', mi: 'mi',
  nauticalmile: 'nmi', furlong: 'fur', furlongs: 'fur', chain: 'ch', chains: 'ch',
  rod: 'rd', rods: 'rd', pole: 'rd', perch: 'rd', fathom: 'ftm', fathoms: 'ftm',
  mil: 'mil', thou: 'mil', point: 'pt', points: 'pt', pica: 'pica', picas: 'pica',
  lightyear: 'ly', lightyears: 'ly', parsec: 'pc', parsecs: 'pc',
  astronomicalunit: 'AU', au: 'AU',
  kilogram: 'kg', kilograms: 'kg', gram: 'g', grams: 'g', gramme: 'g', grammes: 'g',
  milligram: 'mg', milligrams: 'mg', microgram: 'ug', micrograms: 'ug',
  tonne: 't', tonnes: 't', ton: 'tonUS', tons: 'tonUS', longton: 'tonUK',
  quintal: 'q', carat: 'ct', carats: 'ct', ct: 'ct', grain: 'gr', grains: 'gr',
  ounce: 'oz', ounces: 'oz', oz: 'oz', pound: 'lb', pounds: 'lb', lbs: 'lb', lb: 'lb',
  stone: 'st', stones: 'st', hundredweight: 'cwtUK', troyounce: 'ozt', ozt: 'ozt',
  slug: 'slug', slugs: 'slug', dram: 'dr', drams: 'dr',
  second: 's', seconds: 's', sec: 's', secs: 's', millisecond: 'ms', milliseconds: 'ms',
  microsecond: 'us', microseconds: 'us', nanosecond: 'ns', nanoseconds: 'ns',
  picosecond: 'ps', femtosecond: 'fs',
  minute: 'min', minutes: 'min', hour: 'h', hours: 'h', hr: 'h', hrs: 'h',
  day: 'd', days: 'd', week: 'wk', weeks: 'wk', fortnight: 'fortnight', fortnights: 'fortnight',
  month: 'mo', months: 'mo', year: 'yr', years: 'yr', julianyear: 'jyr',
  shake: 'shake', shakes: 'shake', svedberg: 'svb',
  kelvin: 'K', kelvins: 'K', celsius: 'degC', centigrade: 'degC', c: 'degC',
  fahrenheit: 'degF', f: 'degF', rankine: 'degR', r: 'degR',
  reaumur: 'degRe', réaumur: 'degRe', re: 'degRe', ré: 'degRe', res: 'degRe', delisle: 'degDe',
  romer: 'degRo', rømer: 'degRo', roemer: 'degRo', ro: 'degRo', rø: 'degRo', newtonscale: 'degN',
  kph: 'kmh', kmh: 'kmh', milesperhour: 'mph', feetpersecond: 'fts', fps: 'fts',
  knot: 'kn', knots: 'kn', mach: 'mach', speedoflight: 'c', lightspeed: 'c',
  squaremetre: 'm2', squaremeter: 'm2', sqm: 'm2', squarekilometre: 'km2', squarekilometer: 'km2',
  sqkm: 'km2', squarecentimetre: 'cm2', squarecentimeter: 'cm2', sqcm: 'cm2',
  are: 'are', ares: 'are', hectare: 'ha', hectares: 'ha', ha: 'ha',
  acre: 'acre', acres: 'acre', squareinch: 'in2', sqin: 'in2', squarefoot: 'ft2',
  sqft: 'ft2', squareyard: 'yd2', sqyd: 'yd2', squaremile: 'mi2', sqmi: 'mi2', barn: 'barn', barns: 'barn',
  cubicmetre: 'm3', cubicmeter: 'm3', litre: 'l', liter: 'l', litres: 'l', liters: 'l',
  millilitre: 'ml', milliliter: 'ml', ml: 'ml', cc: 'cm3',
  gallon: 'galUS', gallons: 'galUS', gal: 'galUS', ukgallon: 'galUK', imperialgallon: 'galUK',
  quart: 'qtUS', quarts: 'qtUS', qt: 'qtUS', ukquart: 'qtUK',
  pint: 'ptUS', pints: 'ptUS', cup: 'cupUS', cups: 'cupUS',
  fluidounce: 'flozUS', fluidounces: 'flozUS', floz: 'flozUS', ukfloz: 'flozUK',
  tablespoon: 'tbsUS', tablespoons: 'tbsUS', tbsp: 'tbsUS',
  teaspoon: 'tspUS', teaspoons: 'tspUS', tsp: 'tspUS',
  barrel: 'bbl', barrels: 'bbl', bushel: 'buUS', bushels: 'buUS', peck: 'pkUS', pecks: 'pkUS',
  gill: 'giUS', gills: 'giUS', minim: 'minfl', minims: 'minfl', cord: 'cord', cords: 'cord',
  pascal: 'Pa', pascals: 'Pa', kilopascal: 'kPa', megapascal: 'MPa',
  bar: 'bar', bars: 'bar', millibar: 'mbar', mbar: 'mbar', atmosphere: 'atm', atmospheres: 'atm',
  torr: 'torr', mmhg: 'mmhg', inhg: 'inhg', psi: 'psi', poundspersquareinch: 'psi',
  barye: 'ba', pieze: 'pz',
  joule: 'J', joules: 'J', kilojoule: 'kJ', megajoule: 'MJ', wattsecond: 'wh',
  watthour: 'wh', watthours: 'wh', kilowatthour: 'kwh', kilowatthours: 'kwh',
  calorie: 'cal', calories: 'cal', kilocalorie: 'kcal', kilocalories: 'kcal',
  erg: 'erg', ergs: 'erg', electronvolt: 'ev', electronvolts: 'ev',
  kiloelectronvolt: 'kev', megaelectronvolt: 'mev',
  btu: 'btu', britishthermalunit: 'btu', therm: 'th', therms: 'th',
  hartree: 'eh', footpound: 'ftlbf', ftlb: 'ftlbf', tontnt: 'tnt', tnt: 'tnt',
  watt: 'W', watts: 'W', kilowatt: 'kW', kilowatts: 'kW', megawatt: 'MW', gigawatt: 'GW',
  horsepower: 'hp', metrichorsepower: 'hpm', btuperhour: 'btuh',
  newton: 'N', newtons: 'N', n: 'N', kilonewton: 'kN', dyne: 'dyn', dynes: 'dyn',
  kilogramforce: 'kgf', kilopond: 'kgf', poundforce: 'lbf', ounceforce: 'ozf',
  poundal: 'pdl', poundals: 'pdl', sthene: 'sn',
  bit: 'bit', bits: 'bit', byte: 'B', bytes: 'B', nibble: 'nibble', nibbles: 'nibble',
  kilobit: 'kbit', kilobits: 'kbit', kilobyte: 'kB', kilobytes: 'kB', kib: 'KiB', kibibyte: 'KiB',
  megabit: 'Mbit', megabits: 'Mbit', megabyte: 'MB', megabytes: 'MB', mib: 'MiB', mebibyte: 'MiB',
  gigabit: 'Gbit', gigabits: 'Gbit', gigabyte: 'GB', gigabytes: 'GB', gib: 'GiB', gibibyte: 'GiB',
  terabit: 'Tbit', terabits: 'Tbit', terabyte: 'TB', terabytes: 'TB', tib: 'TiB', tebibyte: 'TiB',
  petabit: 'Pbit', petabits: 'Pbit', petabyte: 'PB', petabytes: 'PB', pib: 'PiB', pebibyte: 'PiB',
  exabyte: 'EB', exabytes: 'EB', eib: 'EiB', exbibyte: 'EiB',
  turn: 'tr', turns: 'tr', revolution: 'tr', revolutions: 'tr', rev: 'tr', 圈: 'tr',
  degree: 'deg', degrees: 'deg', deg: 'deg', '°': 'deg',
  gradian: 'gon', gradians: 'gon', gon: 'gon',
  arcminute: 'am', arcminutes: 'am', arcmin: 'am', arcsecond: 'as', arcseconds: 'as', arcsec: 'as',
  radian: 'rad', radians: 'rad', rad: 'rad',
  hertz: 'hz', kilohertz: 'khz', megahertz: 'mhz', gigahertz: 'ghz', terahertz: 'thz',
  rpm: 'rpm', revolutionsperminute: 'rpm', bpm: 'rpm', beatsperminute: 'rpm',
  pascalsecond: 'pas', millipascalsecond: 'mpas', poise: 'p', poises: 'p', centipoise: 'cp',
  stokes: 'st', centistokes: 'cst', centistoke: 'cst',
  becquerel: 'bq', becquerels: 'bq', curie: 'ci', curies: 'ci', rutherford: 'ru', rutherfords: 'ru',
  gray: 'gy', grays: 'gy', sievert: 'sv', sieverts: 'sv', rem: 'rem', rems: 'rem',
  /* 中文 */
  公里: 'km', 千米: 'km', 公尺: 'm', 米: 'm', 公分: 'cm', 厘米: 'cm',
  公釐: 'mm', 毫米: 'mm', 微米: 'um', 奈米: 'nm', 纳米: 'nm',
  英里: 'mi', 哩: 'mi', 英尺: 'ft', 呎: 'ft', 英寸: 'in', 吋: 'in', 碼: 'yd', 码: 'yd',
  海里: 'nmi', 光年: 'ly', 天文單位: 'AU', 天文单位: 'AU',
  公斤: 'kg', 千克: 'kg', 公克: 'g', 克: 'g', 毫克: 'mg', 磅: 'lb', 盎司: 'oz', 安士: 'oz',
  公噸: 't', 噸: 't', 吨: 't', 克拉: 'ct', 英石: 'st',
  公升: 'l', 升: 'l', 毫升: 'ml', 加侖: 'galUS', 加仑: 'galUS', 夸脫: 'qtUS', 夸脱: 'qtUS',
  品脫: 'ptUS', 品脱: 'ptUS', 杯: 'cupUS',
  攝氏: 'degC', 摄氏: 'degC', 華氏: 'degF', 华氏: 'degF', 凱氏: 'K', 开氏: 'K', 克氏: 'K',
  蘭金: 'degR', 兰金: 'degR', 列氏: 'degRe',
  秒: 's', 秒鐘: 's', 秒钟: 's', 分鐘: 'min', 分钟: 'min', 小時: 'h', 小时: 'h',
  天: 'd', 日: 'd', 週: 'wk', 周: 'wk', 月: 'mo', 年: 'yr',
  公里每小時: 'kmh', 时速: 'kmh', 時速: 'kmh', 英里每小時: 'mph', 節: 'kn', 节: 'kn',
  瓦: 'W', 千瓦: 'kW', 馬力: 'hp', 马力: 'hp', 焦耳: 'J', 卡: 'cal', 卡路里: 'cal',
  大卡: 'kcal', 千卡: 'kcal', 英熱單位: 'btu', 英热单位: 'btu',
  帕: 'Pa', 帕斯卡: 'Pa', 巴: 'bar', 大氣壓: 'atm', 大气压: 'atm', 毫米汞柱: 'mmhg',
  牛頓: 'N', 牛顿: 'N', 達因: 'dyn', 达因: 'dyn', 公斤力: 'kgf',
  位元: 'bit', 比特: 'bit', 位元組: 'B', 字节: 'B', 千位元組: 'kB', 百萬位元組: 'MB',
  度: 'deg', 弧度: 'rad', 赫茲: 'hz', 赫兹: 'hz', 轉每分鐘: 'rpm', 居里: 'ci', 西弗: 'sv',
};

const NORM = (s) => String(s || '').trim().toLowerCase()
  .replace(/[\s·.。]/g, '').replace(/µ|μ/g, 'u').replace(/°/g, '')
  .replace(/²/g, '2').replace(/³/g, '3');

/* resolve a user-written unit → { cat, u } or null */
export function findUnit(str) {
  const raw = String(str || '').trim();
  if (!raw) return null;
  const lookup = (key) => {
    for (const [cat] of CATS) {
      for (const u of UNITS[cat]) if (u[0] === key) return { cat, u };
    }
    return null;
  };
  /* the curated alias table first: it settles the conversational forms —
     c/f/k/r read as the temperature scales, not the speed of light */
  const k = NORM(raw);
  const aliasHit = ALIAS[raw] || (k && ALIAS[k]);
  if (aliasHit) { const h = lookup(aliasHit); if (h) return h; }
  /* exact key / symbol match (case preserved: kB ≠ kbit) */
  for (const [cat] of CATS) {
    for (const u of UNITS[cat]) {
      if (u[0] === raw || u[1] === raw) return { cat, u };
    }
  }
  if (!k) return null;
  for (const [cat] of CATS) {
    for (const u of UNITS[cat]) {
      if (NORM(u[0]) === k || NORM(u[1]) === k) return { cat, u };
    }
  }
  /* English name match, parentheticals stripped */
  for (const [cat] of CATS) {
    for (const u of UNITS[cat]) {
      if (NORM(u[2].split(' (')[0]) === k) return { cat, u };
    }
  }
  return null;
}

/* exact conversion of the rational {n, d} from one unit to another in the
   same category — BigInt end to end, BigDecimal-exact */
export function convertRat(cat, from, to, x) {
  const list = UNITS[cat];
  if (!list || !x) return null;
  const f = list.find((u) => u[0] === from) || list[0];
  const tt = list.find((u) => u[0] === to) || list[0];
  const xf = { n: BigInt(x.n), d: BigInt(x.d || 1) };
  let base;
  if (cat === 'temp') {
    base = radd(rmul(q(f[3]), xf), q(f[4] || '0'));
  } else {
    base = rmul(q(f[3]), xf);
  }
  return rdiv(rsub(base, q(tt[4] || '0')), q(tt[3]));
}

/* a rational → plain decimal string for chat answers: exact when it
   terminates, else ≈ with `max` significant fraction digits */
export function ratToDecimal(x, max = 10) {
  const r = rn(BigInt(x.n), BigInt(x.d || 1));
  const neg = r.n < 0n;
  const n = neg ? -r.n : r.n;
  let ip = n / r.d, rem = n % r.d, fr = '', exact = true;
  for (let i = 0; i < max && rem !== 0n; i++) { rem *= 10n; fr += String(rem / r.d); rem %= r.d; }
  if (rem !== 0n) exact = false;
  fr = fr.replace(/0+$/, '');
  const sign = neg && (ip !== 0n || fr) ? '\u2212' : '';
  const body = fr ? `${ip}.${fr}` : String(ip);
  return exact ? sign + body : `\u2248 ${sign}${body}`;
}
