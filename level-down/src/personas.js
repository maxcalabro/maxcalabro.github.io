// Per-character personas — hidden flavour that drives the random
// chatter you see floating above the party. Each character is rolled
// a persona key on creation (see scene.createCharacter); the persona
// is never displayed to the player.
//
// Each PERSONAS[key] is an array of 20 candidate lines. Lines may
// reference the speaker's two allies via the placeholders `{ally1}`
// and `{ally2}`; pickComment substitutes the other party members'
// chosen hero names at speak time. If a placeholder can't be filled
// (solo run, allies dead), it falls back to "someone".

export const PERSONAS = {
  // ---- Always hungry ------------------------------------------------
  hungry: [
    "Is anyone else starving?",
    "I'd kill for a sandwich right now.",
    "Did we pack snacks?",
    "My stomach is making concerning noises.",
    "I bet {ally1} has some jerky.",
    "When's lunch? Did we even have lunch?",
    "I could really go for some dumplings.",
    "Adventuring burns so many calories.",
    "{ally2}, are you going to finish those rations?",
    "I dream of pies. Big, warm pies.",
    "Why don't dungeons have kitchens?",
    "I'd trade this whole quest for a hot meal.",
    "Is goblin meat edible? Asking for a friend.",
    "I packed extra cheese. Just in case.",
    "Hunger makes me reckless. Or focused. One of those.",
    "Smell that? No? Probably my imagination.",
    "{ally1}, do you smell food, or is it just me?",
    "I'd fight a dragon for a roast chicken.",
    "Stomach: empty. Soul: also empty.",
    "Just thinking about bread again.",
  ],

  // ---- Looking for love in all the wrong places --------------------
  lonely_heart: [
    "Do you think any of the goblins are, you know, single?",
    "That zombie had a kind face. Underneath.",
    "I once dated a necromancer. It didn't work out.",
    "{ally1}, do you think I'm charming?",
    "Love is just a dungeon you can't escape.",
    "Why are there no eligible bachelors in this dungeon?",
    "I tried writing a poem. It was about a skeleton.",
    "{ally2}, are you seeing anyone?",
    "My horoscope said I'd meet someone today. So far: only monsters.",
    "I'm too pretty to die alone.",
    "Maybe the real treasure was the heartbreak along the way.",
    "I left flowers at the last torch. In case anyone was watching.",
    "I have so much love to give. To the wrong people.",
    "Even mimics need affection.",
    "{ally1}, you wouldn't happen to know any single warlocks?",
    "I'm trying to manifest a tall, dark stranger. Preferably non-undead.",
    "Romance is dead. Like, literally. We just killed it.",
    "Sigh. Another empty room. Another empty heart.",
    "Hold on... that skeleton was REALLY my type.",
    "Note to self: stop flirting with traps.",
  ],

  // ---- Vain, delusions of grandeur ---------------------------------
  vain: [
    "Bards will sing of this. Mostly about me.",
    "I'm the only reason we're still alive.",
    "Try to keep up, peasants.",
    "When I become king, I'll remember this.",
    "{ally1}, you should really study my technique.",
    "Mirror, mirror... oh wait, I don't need one.",
    "I'm clearly the strongest one here.",
    "I dazzle, therefore I am.",
    "{ally2}, you're welcome for carrying you this far.",
    "Statues. There will be statues of me.",
    "I shall write my memoirs as soon as we're done.",
    "Yes, yes, I AM as wonderful as you think.",
    "I should really have a theme song.",
    "My biographer is going to LOVE this dungeon.",
    "{ally1}, take notes.",
    "Do you think they'll name a city after me? At least one?",
    "Hair: flawless. Outfit: regal. Mood: heroic.",
    "I'm basically a demigod.",
    "Future generations will weep at my legend.",
    "Honestly, I'm too talented for this dungeon.",
  ],

  // ---- Loves shiny things, bubbly ----------------------------------
  shiny: [
    "OOH! Did you see that sparkle?!",
    "I LOVE this place!",
    "Everything is so SHINY!",
    "Look at that twinkle! Look!!!",
    "{ally1}, hold this. It's PRETTY.",
    "Chests! My favorite!",
    "I want all the gems. ALL OF THEM.",
    "That coin caught the light just SO.",
    "Adventuring is the BEST.",
    "{ally2}, isn't this SO fun?!",
    "Squeee! Loot!",
    "I collect things. Mostly shiny things.",
    "I'd marry a chandelier if I could.",
    "Glimmer! Glitter! Glee!",
    "{ally1}, you'd look great in gold.",
    "Treasures! Treasures everywhere!",
    "I'm gonna sparkle SO HARD.",
    "Did anything just twinkle? I felt a twinkle.",
    "Look at me! I'm radiant!",
    "Best. Quest. EVER.",
  ],

  // ---- Super nerdy about math --------------------------------------
  math_nerd: [
    "Statistically, we should encounter exactly 1.4 more skeletons.",
    "The volume of this room is approximately 384 cubic meters.",
    "A goblin's mass divided by its speed equals... lunch.",
    "I calculated our success probability: 73.6%.",
    "{ally1}, the angle of incidence equals the angle of reflection.",
    "I love a good Fibonacci sequence. F(5) = 5, by the way.",
    "If we walk in a perfect square, we'll cover 16% more area.",
    "I just did this in my head. You wouldn't believe me.",
    "{ally2}, your damage output has improved by 12.3% this level.",
    "Pi is approximately 3.14159. I can keep going.",
    "Did you know a regular dodecahedron has 12 faces? Useful, probably.",
    "Variance, standard deviation, mean — all of them, simultaneously.",
    "This corridor's slope is precisely 4 degrees.",
    "I bet I could fit a proof of Fermat's Last Theorem on this wall.",
    "{ally1}, you've moved 247 meters since we entered.",
    "Logarithms are nature's poetry.",
    "Hmm, a perfectly symmetric arrangement of torches. Inefficient.",
    "If only I had a graphing slate, you'd see what I mean.",
    "Math doesn't lie. People do. Goblins also.",
    "{ally2}, our combined area of effect covers 18 square meters.",
  ],

  // ---- Melancholy and nostalgic ------------------------------------
  melancholy: [
    "I remember when dungeons were simpler.",
    "*sigh* The old days were quieter.",
    "This torch reminds me of my grandfather.",
    "Everything ends. Even goblins. Especially goblins.",
    "{ally1}, do you ever just feel... tired?",
    "I used to dream of adventure. Now I just dream of bed.",
    "Time slips away like sand. Or skeletons.",
    "The dust here has seen things, I'm sure of it.",
    "{ally2}, remember when we were young and full of hope?",
    "Each step is a step away from who we were.",
    "I had a cat once. Buttons. I still miss her.",
    "These walls have stood longer than any of us will.",
    "Even the echoes sound lonely.",
    "I used to know a song about this exact moment.",
    "{ally1}, the years pass faster than the monsters.",
    "Sometimes I wonder why we keep going.",
    "Glory fades. Bruises remain.",
    "My mentor told me this would happen. I didn't listen.",
    "All things considered, I'd rather be home.",
    "Beautiful. Terrible. Inevitable.",
  ],

  // ---- Hypochondriac and superstitious -----------------------------
  hypochondriac: [
    "I'm pretty sure that goblin gave me a curse.",
    "Did anyone else hear that omen?",
    "I think I'm coming down with something.",
    "{ally1}, do my eyes look yellow to you?",
    "Never step on a third floor tile. Bad luck.",
    "I have at least four diseases right now.",
    "That chest is HEXED. I can feel it.",
    "{ally2}, your aura looks weird today.",
    "I should NOT have left the house this morning.",
    "Cough! See? I told you. Plague.",
    "Knock on wood. Wait, this is stone. Knock on stone?",
    "The number 13 was carved on that wall. We're DOOMED.",
    "I felt a chill. Did anyone else feel a chill?",
    "{ally1}, can you check my forehead? Burning, right?",
    "Three crows on the way in. Three. We're cursed.",
    "Is this a tickle? A tickle of DOOM?",
    "I forgot my lucky pebble at the inn.",
    "{ally2}, I think I may have stepped on a hex line.",
    "The wind shifted. That's never a good sign.",
    "Was that an itch? Or the first sign of necrosis?",
  ],

  // ---- Slapstick (action-only) -------------------------------------
  // No spoken lines for this persona — every entry is a stage
  // direction wrapped in << >>. Treated like any other comment by the
  // display system; the chevrons sell the silent-comedy vibe.
  slapstick: [
    "<<slips on a loose pebble>>",
    "<<trips over own scabbard>>",
    "<<bonks head on a doorway>>",
    "<<sneezes loudly>>",
    "<<accidentally puts boot on backwards>>",
    "<<gets a bug in their nose>>",
    "<<does a perfect cartwheel for no reason>>",
    "<<chases an invisible butterfly>>",
    "<<juggles three torches, drops one>>",
    "<<sits down. for no apparent reason>>",
    "<<makes a face at a wall>>",
    "<<does a dramatic spin>>",
    "<<pats a skeleton skull, gets stuck>>",
    "<<tries to high-five {ally1}, misses>>",
    "<<finds a coin, dramatically pockets it>>",
    "<<does interpretive dance>>",
    "<<mimics {ally2}'s walk perfectly>>",
    "<<pretends to be a statue, fools no one>>",
    "<<eats an apple in three loud bites>>",
    "<<gives a thumbs-up to a goblin corpse>>",
  ],

  // ---- Always thinks they're lost ----------------------------------
  always_lost: [
    "Wait, which way is north again?",
    "I'm pretty sure we passed that wall already.",
    "This dungeon looks exactly like every other dungeon.",
    "{ally1}, you're holding the map upside down.",
    "Are we going up or down?",
    "I knew we should've turned left back there.",
    "Is this the same room? Are we in the same room?",
    "{ally2}, where are we?",
    "I should've left a trail. Of cheese, maybe.",
    "Hmm. This passage feels new. Or old. One of those.",
    "Is east really east in here?",
    "I'm fairly certain we're walking in circles.",
    "{ally1}, do you remember the exit?",
    "I think the dungeon is moving us, not the other way around.",
    "Did we already kill that skeleton, or is that a new one?",
    "This wall looks suspiciously familiar.",
    "I'd ask for directions, but everyone here wants to murder us.",
    "{ally2}, you've been navigating, right? Right??",
    "We are deeply, profoundly turned around.",
    "If only there were signs. Big, helpful signs.",
  ],
};

export const PERSONA_KEYS = Object.keys(PERSONAS);

// Returns a shuffled copy of the persona key list. Used by buildMap
// to deal out a distinct persona per character without picking the
// same one twice (we have 9 personas and only 3 characters).
export function shuffledPersonas() {
  const out = PERSONA_KEYS.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Picks a random line from `persona` and substitutes ally name
// placeholders. `allies` is the speaker's other party members' hero
// names, in arbitrary order; ally1 fills first, ally2 fills second
// (falling back to "someone" if not enough allies are alive).
export function pickComment(persona, allies) {
  const lines = PERSONAS[persona];
  if (!lines || lines.length === 0) return null;
  const line = lines[Math.floor(Math.random() * lines.length)];
  const ally1 = allies[0] || 'someone';
  const ally2 = allies[1] || allies[0] || 'someone';
  return line
    .replace(/\{ally1\}/g, ally1)
    .replace(/\{ally2\}/g, ally2);
}
