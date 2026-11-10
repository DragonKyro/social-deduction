import { WORD_PACKS, type WordPackId } from '@/words';

// ============================================================================
// Word-association lexicon for the heuristic AIs (Codenames + Cross Clues).
//
// There is no embedding model in a static GitHub Pages app, so the AIs
// reason over a hand-curated set of themes. Each theme has one or more
// clue keys (natural one-word clues, in preference order) and a member
// list. Two words are "related" when one is a key of a theme the other is
// in, when both sit in the same theme, or (weaker) when they share a form,
// a rhyme, or a prefix.
//
// The lexicon is PUBLIC knowledge: every client bundles it. Using it is
// fair for any seat; what an AI may or may not look at (the key card, the
// held coordinate) is decided by which view it reads, not by this file.
//
// Pure file: no DOM / network / store imports.
// ============================================================================

interface Theme {
  keys: string[];
  words: Set<string>;
  // Curated themes are tight (1.0); pack-wide themes are broad (0.55).
  weight: number;
}

// [keys, members] — space separated, uppercase.
const CURATED: Array<[string, string]> = [
  ['OCEAN SEA MARINE', 'FISH WHALE SHARK OCTOPUS SEAL SHIP SUB PORT BEACH PIRATE WAKE DECK SINK NET WAVE CORAL REEF DOLPHIN CRAB LOBSTER SAILOR TIDE ISLAND PENGUIN SQUID JELLYFISH STARFISH EEL STINGRAY SHRIMP CLAM OYSTER BAY ANCHOR'],
  ['ANIMAL ZOO WILDLIFE', 'LION BEAR CAT DOG HORSE RABBIT MOUSE KANGAROO PLATYPUS PENGUIN WHALE SHARK OCTOPUS EAGLE HAWK DUCK TURKEY CRANE ROBIN CALF BUFFALO MAMMOTH MOLE BAT SEAL TIGER ELEPHANT GIRAFFE MONKEY ZEBRA WOLF FOX DEER SNAKE FROG OWL PANDA KOALA GORILLA RHINO HIPPO CHEETAH LEOPARD JAGUAR PANTHER CROCODILE ALLIGATOR'],
  ['BIRD FEATHER NEST', 'EAGLE HAWK DUCK TURKEY CRANE ROBIN CHICK PENGUIN PHOENIX OWL PARROT CROW RAVEN SWAN PIGEON SPARROW FALCON GOOSE OSTRICH FLAMINGO PELICAN STORK HERON PEACOCK ROOSTER CHICKEN EMU WING EGG FLY'],
  ['INSECT CREEPY CRAWL', 'BUG FLY CRICKET SPIDER SCORPION WORM SLUG WEB ANT BEE MOTH TICK BEETLE WASP MOSQUITO BUTTERFLY DRAGONFLY'],
  ['FARM BARN RANCH', 'HORSE CALF CHICK DUCK TURKEY TRACTOR CORN FIELD FENCE GRASS STRAW PIG COW SHEEP GOAT EGG CHICKEN ROOSTER DONKEY FARMER MILK YARD'],
  ['ORBIT GALAXY COSMOS ASTRONAUT', 'MOON STAR SATURN JUPITER MERCURY SATELLITE TELESCOPE ALIEN ROCKET PLANET COMET SPACE LASER SHUTTLE METEOR ASTEROID NEBULA GRAVITY MARS VENUS EARTH NEPTUNE PLUTO SUN ECLIPSE PROBE ROVER STATION'],
  ['PLANET SOLAR', 'SATURN JUPITER MERCURY MARS VENUS EARTH NEPTUNE URANUS PLUTO MOON STAR SUN ORBIT RING'],
  ['MUSIC SONG MELODY', 'BAND PIANO FLUTE ORGAN HORN BUGLE NOTE CONCERT OPERA DRUM GUITAR STRING PITCH BEAT SOUND ROCK SCALE TRACK RECORD VIOLIN HARP TRUMPET CHORUS LYRIC TUNE BASS JAZZ'],
  ['ORCHESTRA INSTRUMENT SYMPHONY', 'PIANO FLUTE ORGAN HORN BUGLE DRUM GUITAR VIOLIN HARP TRUMPET BELL STRING BOW CONDUCTOR CELLO TUBA'],
  ['ROYAL ROYALTY PALACE', 'KING QUEEN PRINCESS PRINCE CROWN KNIGHT CASTLE COURT THRONE JACK STAFF EMPIRE DUKE'],
  ['MEDIEVAL CASTLE KINGDOM', 'KNIGHT KING QUEEN PRINCESS CROWN DRAGON TOWER WALL BRIDGE CLOAK BOW TORCH DWARF WITCH SWORD SHIELD ARMOR MOAT LANCE'],
  ['FANTASY MYTHICAL LEGEND', 'DRAGON UNICORN PHOENIX WITCH GIANT DWARF LEPRECHAUN ANGEL GHOST SPELL ATLANTIS WIZARD ELF TROLL FAIRY GENIE MERMAID OGRE GOBLIN CENTAUR'],
  ['MAGIC WIZARD SORCERY', 'WITCH SPELL CLOAK STAFF POISON CAST CHARM WAND HAT RING GENIE POTION CAULDRON CRYSTAL'],
  ['HALLOWEEN SPOOKY HAUNTED', 'GHOST WITCH PUMPKIN DEATH SHADOW SPIDER BAT POISON UNDERTAKER SOUL VAMPIRE ZOMBIE SKELETON GRAVE MUMMY WEB NIGHT CANDY MASK MONSTER'],
  ['POKER GAMBLE BLACKJACK', 'CASINO ROULETTE DICE CARD DECK JACK KING QUEEN ACE CHIP BET LUCK DIAMOND CLUB HEART SPADE SUIT MILLIONAIRE'],
  ['TREASURE JEWEL RICHES', 'DIAMOND GOLD RING CROWN IVORY MARBLE PEARL COPPER MILLIONAIRE BANK CHEST PIRATE EMERALD RUBY SILVER COIN'],
  ['METAL ORE ALLOY', 'GOLD IRON COPPER LEAD MERCURY STEEL TIN SILVER NAIL BOLT MINE CHAIN'],
  ['MONEY CASH WEALTH', 'BANK BILL BUCK POUND MINT GOLD MILLIONAIRE STOCK CHECK CHANGE CASINO COIN DOLLAR CHARGE CAPITAL BOND'],
  ['FINANCE MARKET INVEST', 'STOCK BANK BOND CRASH CAPITAL SHARE TRADE BROKER CONTRACT CHART'],
  ['CRIME DETECTIVE ROBBERY', 'POLICE THIEF SPY AGENT SMUGGLER PISTOL SHOT LAWYER COURT LOCK KEY CELL BADGE CLUE PRISON'],
  ['SECRET UNDERCOVER ESPIONAGE', 'SPY AGENT CODE BOND EMBASSY SHADOW CLOAK LASER NINJA MISSION MOLE TAIL BUG'],
  ['JUSTICE TRIAL LEGAL', 'LAWYER COURT JUDGE CONTRACT POLICE CELL BAR STATE CASE JURY BILL'],
  ['ARMY MILITARY BATTLE', 'WAR SOLDIER MISSILE BOMB FIGHTER TANK PISTOL SHOT FORCE STRIKE REVOLUTION KNIGHT JET HELICOPTER SUB MARCH DRAFT RANK GENERAL'],
  ['WEAPON ARSENAL', 'PISTOL BOW KNIFE MISSILE BOMB LASER WHIP SPIKE SWORD STAFF STICK SPEAR CANNON TORPEDO BLASTER'],
  ['EXPLODE BLAST DYNAMITE', 'BOMB BOOM MISSILE CRASH FIRE STRIKE MINE GAS DRILL FIREWORK'],
  ['FLIGHT AIRPORT SKY', 'PLANE JET PILOT HELICOPTER AIR WING CRANE EAGLE HAWK FLY SATELLITE KITE CLOUD ROCKET'],
  ['VEHICLE TRANSPORT TRAFFIC', 'CAR VAN TRAIN PLANE SHIP SUB LIMO AMBULANCE HELICOPTER JET TRUCK BUS CYCLE ENGINE TRACTOR BIKE BOAT'],
  ['DRIVE HIGHWAY ROAD', 'CAR VAN LIMO TRUCK ENGINE GAS OIL CRASH TRACK BRIDGE PARK LINE BUS'],
  ['MEDICAL HEALTH CLINIC', 'DOCTOR NURSE HOSPITAL AMBULANCE DISEASE VET NEEDLE CELL LAB MICROSCOPE HEART PILL SURGEON'],
  ['SCIENCE EXPERIMENT PHYSICS', 'LAB SCIENTIST MICROSCOPE TELESCOPE CELL LASER GENIUS ROBOT TUBE MASS ATOM GRAVITY PLASMA'],
  ['CLASSROOM STUDENT EDUCATION', 'SCHOOL TEACHER PUPIL RULER DEGREE NOTE TABLET BOARD BOOK LETTER NUMBER CRAYON'],
  ['VISION SIGHT LOOK', 'EYE PUPIL GLASS TELESCOPE MICROSCOPE SCREEN LIGHT SPOT SHADOW'],
  ['BODY ANATOMY SKELETON', 'ARM HAND HEAD HEART FACE FOOT EYE MOUTH TOOTH THUMB SPINE BACK CHEST NAIL LAP TAIL'],
  ['FINGER GRIP WRIST', 'THUMB NAIL GLOVE RING PALM HAND'],
  ['HAT HELMET', 'CAP HOOD CROWN HEAD'],
  ['FASHION WARDROBE OUTFIT', 'DRESS SUIT TIE SOCK SHOE BOOT GLOVE BELT CLOAK CAP HOOD COTTON BUTTON MODEL SHIRT PANTS SCARF COAT JACKET'],
  ['WALK TOE STEP', 'SHOE BOOT SOCK FOOT HORSESHOE TRACK MARCH TRIP'],
  ['FRUIT ORCHARD SMOOTHIE', 'APPLE ORANGE LEMON KIWI BERRY OLIVE PUMPKIN CHERRY BANANA GRAPE PALM PEACH PEAR PLUM MANGO LIME STRAWBERRY'],
  ['KITCHEN DINNER RECIPE', 'COOK PIE JAM HONEY HAM KETCHUP CHOCOLATE CARROT PASTE PLATE FORK KNIFE MUG TABLE OIL MINT TURKEY NUT SINK CHEF SOUP STEW'],
  ['SWEET DESSERT SUGAR', 'CHOCOLATE HONEY JAM PIE MINT BERRY CANDY CAKE COOKIE ICECREAM DONUT'],
  ['AUTUMN THANKSGIVING HARVEST', 'TURKEY PUMPKIN PIE FALL MAPLE CORN LEAF'],
  ['TREE WOOD TIMBER', 'FOREST MAPLE PALM OLIVE ROOT BARK LOG TRUNK BRANCH STICK LEAF PINE OAK BIRCH CEDAR'],
  ['GARDEN PLANT FLOWER', 'ROSE GRASS ROOT SPRING BERRY CARROT PUMPKIN WORM SLUG TULIP SEED DAISY LILY PETAL'],
  ['WINTER FREEZE BLIZZARD', 'SNOW SNOWMAN ICE COLD WIND STORM FROST GLOVE SCARF'],
  ['WEATHER FORECAST', 'SNOW ICE COLD WIND STORM RAIN CLOUD FOG THUNDER LIGHTNING RAINBOW SPRING'],
  ['ELECTRIC POWER VOLT', 'BATTERY CHARGE SWITCH LIGHT PLUG CELL ENGINE BOLT CIRCUIT LASER'],
  ['COMPUTER DIGITAL INTERNET', 'SERVER SCREEN TABLET ROBOT CODE MOUSE BUG FILE CHIP LINK WEB VIRUS KEY NET MAIL POST'],
  ['LETTER DELIVERY ENVELOPE', 'MAIL POST NOTE STAMP CARD BILL BOX'],
  ['OFFICE DESK PAPERWORK', 'FILE CHAIR TABLE NOTE PIN PRESS BOARD CONTRACT STAFF CLIP'],
  ['TOOL WORKSHOP HARDWARE', 'DRILL NAIL HAMMER SCREW BOLT SAW RULER SCALE PIN NEEDLE BRUSH HOOK PIPE LOCK KEY CRANE'],
  ['SEW THREAD TAILOR', 'NEEDLE PIN COTTON BUTTON STRING TIE SOCK DRESS SUIT'],
  ['FISHING ANGLER BAIT', 'HOOK NET LINE POLE WORM FISH STREAM REEL'],
  ['SPORT ATHLETE TOURNAMENT', 'BALL BAT RACKET COURT FIELD STADIUM PITCH STRIKE CLUB GLOVE TRACK POOL GAME MATCH SHOT PASS POINT GOAL'],
  ['BASEBALL INNING HOMERUN', 'BAT BALL PITCH STRIKE GLOVE DIAMOND CAP FIELD'],
  ['TENNIS WIMBLEDON', 'RACKET COURT NET BALL MATCH POINT'],
  ['GOLF PUTT', 'CLUB HOLE GREEN FLAG'],
  ['BOXING PUNCH KNOCKOUT', 'FIGHTER RING GLOVE ROUND BELL STRIKE'],
  ['WATER LIQUID WET', 'POOL STREAM SINK TAP WELL SPRING ICE FISH RIVER LAKE RAIN BOTTLE DROP WAVE'],
  ['SWIM SPLASH', 'POOL LAP TUBE BEACH'],
  ['RIVER CANOE', 'STREAM BANK BRIDGE FISH BOAT DAM'],
  ['MOUNTAIN CLIMB SUMMIT', 'MOUNT CLIFF ROCK PEAK SNOW ICE ROPE'],
  ['CITY BUILDING DOWNTOWN', 'SKYSCRAPER TOWER HOTEL HOSPITAL SCHOOL CHURCH TEMPLE STADIUM THEATER BANK EMBASSY WALL BRIDGE PARK SHOP CAPITAL'],
  ['HOLY PRAYER HEAVEN', 'CHURCH TEMPLE ANGEL SOUL CROSS GRACE SPIRIT PRIEST'],
  ['EGYPT ANCIENT PHARAOH', 'PYRAMID MUMMY TEMPLE AZTEC ATLANTIS SPHINX'],
  ['JUNGLE RAINFOREST TROPICAL', 'AMAZON AZTEC SNAKE MONKEY PARROT VINE PALM'],
  ['AUSTRALIA OUTBACK', 'KANGAROO PLATYPUS KOALA EMU'],
  ['EXTINCT PREHISTORIC FOSSIL', 'DINOSAUR MAMMOTH BONE'],
  ['IRISH CLOVER SHAMROCK', 'LEPRECHAUN LUCK GOLD HORSESHOE GREEN RAINBOW'],
  ['STAGE ACTOR PERFORM', 'THEATER PLAY CAST OPERA DANCE CONCERT SCREEN FILM COMIC MODEL STAR'],
  ['MOVIE CINEMA HOLLYWOOD', 'FILM SCREEN CAST PLOT STAR SCENE THEATER'],
  ['HERO MARVEL CAPE', 'SUPERHERO COMIC CLOAK SHADOW GENIUS NINJA ROBOT ALIEN SPIDER BAT'],
  ['BUCCANEER PARROT PLANK', 'PIRATE SHIP CHEST GOLD HOOK SWORD ISLAND SMUGGLER'],
  ['JAPAN SAMURAI', 'NINJA STAR SWORD SUSHI'],
  ['FLAME BURN BLAZE', 'FIRE TORCH LIGHT GAS OIL SMOKE MATCH LOG SPARK DRAGON PHOENIX'],
  ['BRIGHT SHINE GLOW', 'LIGHT LASER RAY TORCH STAR MOON SUN LAMP SPOT SCREEN'],
  ['DARK MIDNIGHT', 'NIGHT SHADOW MOON STAR BAT GHOST OWL'],
  ['SLEEP NAP DREAM', 'BED NIGHT PILLOW BLANKET PAJAMAS'],
  ['CLOCK CALENDAR HOUR', 'TIME DAY NIGHT DATE MARCH SPRING FALL WATCH TICK CYCLE'],
  ['SHAPE GEOMETRY', 'CIRCLE SQUARE TRIANGLE PYRAMID RING BALL ROUND CYCLE LINE POINT'],
  ['MATH ALGEBRA', 'POINT LINE SQUARE CIRCLE TRIANGLE DEGREE ROOT FIGURE SCALE MASS NUMBER'],
  ['MEASURE LENGTH WEIGHT', 'RULER SCALE DEGREE POUND YARD MASS FOOT'],
  ['COLOR PAINT RAINBOW', 'GREEN ORANGE ROSE GOLD IVORY COPPER OLIVE LEMON CRAYON'],
  ['ART ARTIST MUSEUM', 'BRUSH PAINT MODEL FIGURE MARBLE FRAME STATUE'],
  ['TOY PLAYTIME', 'GAME DICE CARD BALL KITE PUZZLE MARBLE ROBOT DOLL TEDDY YOYO BLOCKS'],
  ['CHESS CHECKMATE', 'KING QUEEN KNIGHT BOARD CHECK CASTLE'],
  ['BATHROOM SHOWER', 'SINK TAP TUBE BRUSH TOOTH WASHER SOAP TOWEL BATH'],
  ['LAUNDRY CHORES', 'WASHER SOCK DRESS COTTON IRON PRESS VACUUM BRUSH'],
  ['FURNITURE HOUSE HOME', 'CHAIR TABLE BED DESK SINK LAMP WALL FENCE YARD DOOR WINDOW ROOF'],
  ['RAILWAY LOCOMOTIVE', 'TRAIN TRACK STATION LINE ENGINE CAR'],
  ['PHONE CALL', 'CELL RING LINE SCREEN TABLET'],
  ['LOUD NOISE ECHO', 'BOOM BELL HORN BUGLE RING BEAT SOUND BARK CRASH POUND'],
  ['PUPPY FETCH LEASH', 'DOG BARK BONE TAIL VET'],
  ['KITTEN PURR', 'CAT LITTER MOUSE TAIL'],
  ['PET VETERINARY', 'VET DOG CAT RABBIT MOUSE FISH LITTER HAMSTER PUPPY KITTEN'],
  ['ELEPHANT TUSK', 'IVORY TRUNK MAMMOTH'],
  ['BEE HIVE', 'HONEY STING FLOWER'],
  ['JOB CAREER PROFESSION', 'DOCTOR NURSE TEACHER LAWYER PILOT SCIENTIST SOLDIER POLICE COOK VET UNDERTAKER AGENT SPY MODEL CHEF FARMER'],
  ['CRIMINAL ROBBER HEIST', 'THIEF SMUGGLER PIRATE NINJA SPY'],
  ['FUNERAL GRAVE CEMETERY', 'DEATH UNDERTAKER GHOST SOUL POISON'],
  ['DIRT SOIL EARTH', 'GROUND GRASS ROCK FIELD ROOT MOLE WORM'],
  ['MINING CAVE SHAFT', 'MINE PIT DRILL GOLD IRON COPPER ROCK HOLE'],
  ['DIG TUNNEL SHOVEL', 'HOLE PIT MINE MOLE WELL SINK GROUND DRILL'],
  ['CHRISTMAS HOLIDAY', 'SNOWMAN STAR BELL ANGEL TURKEY GIFT'],
  ['VACATION TOURIST', 'HOTEL PLANE TRIP PORT EMBASSY BEACH'],
  ['MALL STORE RETAIL', 'SHOP CARD BILL CHECK CHANGE'],
  ['NEWSPAPER JOURNALIST PRINT', 'PRESS POST NOTE NOVEL FILE'],
  ['BOOK LIBRARY AUTHOR', 'NOVEL PLOT COVER SPELL STORY LETTER'],
  ['POLITICS GOVERNMENT ELECTION', 'STATE CAPITAL EMBASSY COURT REVOLUTION WAR BILL'],
  ['JAIL PRISON INMATE', 'CELL LOCK KEY BAR POLICE THIEF'],
  ['DOOR SECURITY SAFE', 'LOCK KEY BOLT'],
  ['DRINK BEVERAGE CUP', 'BOTTLE GLASS MUG STRAW TAP BAR'],
  ['PUB BEER TAVERN', 'BAR TAP MUG GLASS'],
  ['RIDE SADDLE JOCKEY', 'HORSE HORSESHOE CYCLE TRACK'],
  ['COWBOY WESTERN SALOON', 'HORSE PISTOL BUFFALO WHIP BOOT'],
  ['BREEZE BLOW GUST', 'WIND AIR FAN KITE STORM'],
  ['MACHINE FUTURE CYBORG', 'ROBOT LASER ALIEN SATELLITE ENGINE'],
  ['LOVE ROMANCE VALENTINE', 'HEART ROSE RING DATE KISS ANGEL'],
  ['WEDDING BRIDE MARRIAGE', 'RING DRESS BELL CAKE'],
  ['PARTY BIRTHDAY CELEBRATE', 'CAKE CANDLE GIFT DANCE'],
  ['BALLET DISCO WALTZ', 'DANCE SWING BALL STEP'],
  ['PLAYGROUND RECESS', 'SWING SLIDE PARK'],
  ['COFFEE ESPRESSO CAFE', 'MUG BEAN CUP CREAM'],
  ['ROPE KNOT TWINE', 'STRING TIE LINE BOW CHAIN'],
  ['ARCHER ARROW TARGET', 'BOW'],
  ['SQUIRREL ACORN', 'NUT TREE'],
];

// Pack-wide themes: every word of the pack is a (weak) member. Only useful
// when a board mixes packs; on a single-pack board the AI's scoring sees
// the opponent / assassin members and drops them on its own.
const PACK_KEYS: Partial<Record<WordPackId, string>> = {
  fantasy: 'FANTASY MAGICAL SORCERY',
  space: 'COSMOS GALAXY ORBIT',
  food: 'FOOD MEAL CUISINE',
  movies: 'HOLLYWOOD CINEMA',
  sports: 'SPORT ATHLETE',
  tech: 'TECH COMPUTER DIGITAL',
  nature: 'NATURE WILDLIFE OUTDOORS',
  mythology: 'MYTH DEITY LEGEND',
  horror: 'SCARY HAUNTED SPOOKY',
  office: 'CORPORATE WORKPLACE OFFICE',
  travel: 'TRAVEL ABROAD TOURIST',
  history: 'HISTORY EMPIRE ANCIENT',
  music: 'MUSIC SONG MELODY',
};

function split(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

let themes: Theme[] | null = null;
// word → indexes of themes it is a MEMBER of (keys count as members too).
let memberIndex: Map<string, number[]> | null = null;
// clue key → indexes of themes it names.
let keyIndex: Map<string, number[]> | null = null;

function build(): void {
  if (themes) return;
  const out: Theme[] = [];
  for (const [keys, words] of CURATED) {
    out.push({ keys: split(keys), words: new Set(split(words)), weight: 1 });
  }
  for (const [id, keys] of Object.entries(PACK_KEYS) as Array<[WordPackId, string]>) {
    const pack = WORD_PACKS[id];
    if (!pack) continue;
    out.push({ keys: split(keys), words: new Set(pack.words.map((w) => w.toUpperCase())), weight: 0.55 });
  }
  const members = new Map<string, number[]>();
  const keysIdx = new Map<string, number[]>();
  const push = (m: Map<string, number[]>, k: string, i: number) => {
    const cur = m.get(k);
    if (cur) {
      if (!cur.includes(i)) cur.push(i);
    } else m.set(k, [i]);
  };
  out.forEach((t, i) => {
    for (const w of t.words) push(members, w, i);
    for (const k of t.keys) {
      push(keysIdx, k, i);
      push(members, k, i);
    }
  });
  themes = out;
  memberIndex = members;
  keyIndex = keysIdx;
}

export interface ThemeCandidate {
  key: string;
  members: ReadonlySet<string>;
  weight: number;
}

/** Every (clue key, member set) pair, for clue generation. */
export function themeCandidates(): ThemeCandidate[] {
  build();
  const out: ThemeCandidate[] = [];
  for (const t of themes!) {
    for (const key of t.keys) out.push({ key, members: t.words, weight: t.weight });
  }
  return out;
}

/** Every word the lexicon knows (theme keys + members). */
export function vocabulary(): string[] {
  build();
  return [...memberIndex!.keys()];
}

// ---- Word forms -----------------------------------------------------------

const SUFFIXES = ['S', 'ES', 'ED', 'D', 'ING', 'ER', 'ERS', 'Y', 'LY', 'IES'];

/**
 * True when `a` and `b` are the same word or obvious forms of each other
 * (plural / tense / -er), or one contains the other as a compound part
 * (only checked for parts of 4+ letters so ICE doesn't block NICE).
 * Codenames rulebook: "You can't say any form of a visible word".
 */
export function isFormOf(a: string, b: string): boolean {
  const x = a.toUpperCase();
  const y = b.toUpperCase();
  if (!x || !y) return false;
  if (x === y) return true;
  for (const suf of SUFFIXES) {
    if (x === y + suf || y === x + suf) return true;
  }
  // BERRY → BERRIES, BAKE → BAKING.
  if (y.endsWith('Y') && x === y.slice(0, -1) + 'IES') return true;
  if (x.endsWith('Y') && y === x.slice(0, -1) + 'IES') return true;
  if (y.endsWith('E') && (x === y.slice(0, -1) + 'ING')) return true;
  if (x.endsWith('E') && (y === x.slice(0, -1) + 'ING')) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && long.includes(short);
}

// ---- Relatedness ----------------------------------------------------------

function commonSuffix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
}

function commonPrefix(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}

/**
 * How strongly a clue points at a word, 0..1. Symmetric enough for the
 * guessers' purposes. Theme links dominate; spelling links are a weak
 * fallback (they let the AIs decode each other's rhyme / blend clues).
 * Pass `spelling = false` to score theme links only.
 */
export function relatedness(clueRaw: string, wordRaw: string, spelling = true): number {
  build();
  const clue = clueRaw.toUpperCase();
  const word = wordRaw.toUpperCase();
  if (!clue || !word) return 0;
  if (clue === word) return 1;
  let best = 0;
  // Clue names a theme the word belongs to.
  for (const ti of keyIndex!.get(clue) ?? []) {
    const t = themes![ti]!;
    if (t.words.has(word)) best = Math.max(best, t.weight);
  }
  // Both are members of a common theme.
  const a = memberIndex!.get(clue);
  const b = memberIndex!.get(word);
  if (a && b) {
    for (const ti of a) {
      if (b.includes(ti)) best = Math.max(best, 0.7 * themes![ti]!.weight);
    }
  }
  if (best >= 0.9 || !spelling) return best;
  if (isFormOf(clue, word)) best = Math.max(best, 0.6);
  const shorter = Math.min(clue.length, word.length);
  // Rhyme: a long shared ending (BRIDGE / FRIDGE), not just "-TION".
  const suf = commonSuffix(clue, word);
  if (suf >= 3 && suf >= 0.6 * shorter) {
    best = Math.max(best, Math.min(0.62, 0.35 + 0.07 * suf));
  }
  const pre = commonPrefix(clue, word);
  if (pre >= 3 && pre >= 0.5 * shorter) best = Math.max(best, Math.min(0.55, 0.3 + 0.06 * pre));
  return best;
}

/** Cheap string hash → 32-bit, for deterministic AI tie-breaking. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
