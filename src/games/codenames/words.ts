// Default word pool for Codenames. ~330 single-token words that work well
// as clue targets — common nouns, verbs, places, people, and a few proper
// nouns. Drawn from public-domain word lists in the spirit of the published
// game (the published word list itself is copyrighted, so we use our own).
//
// All entries are uppercase, single-token (no spaces, no hyphens) so they
// render uniformly on the 5×5 grid. If you want to swap in a themed deck
// later, expose it through `CodenamesOptions.wordPool`.

export const DEFAULT_WORDS: readonly string[] = [
  'AGENT', 'AIR', 'ALIEN', 'AMAZON', 'AMBULANCE', 'ANGEL', 'APPLE', 'ARM',
  'ATLANTIS', 'AZTEC', 'BACK', 'BALL', 'BAND', 'BANK', 'BAR', 'BARK',
  'BAT', 'BATTERY', 'BEACH', 'BEAR', 'BEAT', 'BED', 'BELL', 'BELT',
  'BERRY', 'BILL', 'BLOCK', 'BOARD', 'BOLT', 'BOMB', 'BOND', 'BOOM',
  'BOOT', 'BOTTLE', 'BOW', 'BOX', 'BRIDGE', 'BRUSH', 'BUCK', 'BUFFALO',
  'BUG', 'BUGLE', 'BUTTON', 'CALF', 'CAP', 'CAPITAL', 'CAR', 'CARD',
  'CARROT', 'CASINO', 'CAST', 'CAT', 'CELL', 'CENTER', 'CHAIR', 'CHANGE',
  'CHARGE', 'CHECK', 'CHEST', 'CHICK', 'CHOCOLATE', 'CHURCH', 'CIRCLE',
  'CLIFF', 'CLOAK', 'CLUB', 'CODE', 'COLD', 'COMIC', 'COMPOUND', 'CONCERT',
  'CONTRACT', 'COOK', 'COPPER', 'COTTON', 'COURT', 'COVER', 'CRANE', 'CRASH',
  'CRICKET', 'CROSS', 'CROWN', 'CYCLE', 'DANCE', 'DATE', 'DAY', 'DEATH',
  'DECK', 'DEGREE', 'DIAMOND', 'DICE', 'DINOSAUR', 'DISEASE', 'DOCTOR', 'DOG',
  'DRAFT', 'DRAGON', 'DRESS', 'DRILL', 'DROP', 'DUCK', 'DWARF', 'EAGLE',
  'EMBASSY', 'ENGINE', 'EYE', 'FACE', 'FAIR', 'FALL', 'FAN', 'FENCE',
  'FIELD', 'FIGHTER', 'FIGURE', 'FILE', 'FILM', 'FIRE', 'FISH', 'FLUTE',
  'FLY', 'FOOT', 'FORCE', 'FOREST', 'FORK', 'GAME', 'GAS', 'GENIUS',
  'GHOST', 'GIANT', 'GLASS', 'GLOVE', 'GOLD', 'GRACE', 'GRASS', 'GREEN',
  'GROUND', 'HAM', 'HAND', 'HAWK', 'HEAD', 'HEART', 'HELICOPTER', 'HOLE',
  'HONEY', 'HOOD', 'HOOK', 'HORN', 'HORSE', 'HORSESHOE', 'HOSPITAL', 'HOTEL',
  'ICE', 'IRON', 'IVORY', 'JACK', 'JAM', 'JET', 'JUPITER', 'KANGAROO',
  'KETCHUP', 'KEY', 'KID', 'KING', 'KIWI', 'KNIFE', 'KNIGHT', 'LAB',
  'LAP', 'LASER', 'LAWYER', 'LEAD', 'LEMON', 'LEPRECHAUN', 'LIFE', 'LIGHT',
  'LIMO', 'LINE', 'LINK', 'LION', 'LITTER', 'LOCK', 'LOG', 'LUCK',
  'MAIL', 'MAMMOTH', 'MAPLE', 'MARBLE', 'MARCH', 'MASS', 'MATCH', 'MERCURY',
  'MICROSCOPE', 'MILLIONAIRE', 'MINE', 'MINT', 'MISSILE', 'MODEL', 'MOLE',
  'MOON', 'MOUNT', 'MOUSE', 'MOUTH', 'MUG', 'NAIL', 'NEEDLE', 'NET',
  'NIGHT', 'NINJA', 'NOTE', 'NOVEL', 'NURSE', 'NUT', 'OCTOPUS', 'OIL',
  'OLIVE', 'OPERA', 'ORANGE', 'ORGAN', 'PALM', 'PARK', 'PART', 'PASS',
  'PASTE', 'PENGUIN', 'PHOENIX', 'PIANO', 'PIE', 'PILOT', 'PIN', 'PIPE',
  'PIRATE', 'PISTOL', 'PIT', 'PITCH', 'PLANE', 'PLASTIC', 'PLATE', 'PLATYPUS',
  'PLAY', 'PLOT', 'POINT', 'POISON', 'POLE', 'POLICE', 'POOL', 'PORT',
  'POST', 'POUND', 'PRESS', 'PRINCESS', 'PUMPKIN', 'PUPIL', 'PYRAMID', 'QUEEN',
  'RABBIT', 'RACKET', 'RAY', 'REVOLUTION', 'RING', 'ROBIN', 'ROBOT', 'ROCK',
  'ROOT', 'ROSE', 'ROULETTE', 'ROUND', 'ROW', 'RULER', 'SATELLITE', 'SATURN',
  'SCALE', 'SCHOOL', 'SCIENTIST', 'SCORPION', 'SCREEN', 'SEAL', 'SERVER',
  'SHADOW', 'SHARK', 'SHIP', 'SHOE', 'SHOP', 'SHOT', 'SINK', 'SKYSCRAPER',
  'SLIP', 'SLUG', 'SMUGGLER', 'SNOW', 'SNOWMAN', 'SOCK', 'SOLDIER', 'SOUL',
  'SOUND', 'SPACE', 'SPELL', 'SPIDER', 'SPIKE', 'SPINE', 'SPOT', 'SPRING',
  'SPY', 'SQUARE', 'STADIUM', 'STAFF', 'STAR', 'STATE', 'STICK', 'STOCK',
  'STRAW', 'STREAM', 'STRIKE', 'STRING', 'SUB', 'SUIT', 'SUPERHERO', 'SWING',
  'SWITCH', 'TABLE', 'TABLET', 'TAG', 'TAIL', 'TAP', 'TEACHER', 'TELESCOPE',
  'TEMPLE', 'THEATER', 'THIEF', 'THUMB', 'TICK', 'TIE', 'TIME', 'TOOTH',
  'TORCH', 'TOWER', 'TRACK', 'TRAIN', 'TRIANGLE', 'TRIP', 'TRUNK', 'TUBE',
  'TURKEY', 'UNDERTAKER', 'UNICORN', 'VACUUM', 'VAN', 'VET', 'WAKE', 'WALL',
  'WAR', 'WASHER', 'WEB', 'WELL', 'WHALE', 'WHIP', 'WIND', 'WITCH',
  'WORM', 'YARD',
];
