// Stable-key vocabularies harvested from FetLife profile data-props.
// keys are FetLife internal identifiers; names are user-facing.
// Update by inspecting more profiles via /BamaKinkyBull etc.

export const ROLES = [
  ["", "Any"],
  ["dom", "Dominant"],
  ["pleasure_dom", "Pleasure Dom"],
  ["sub", "submissive"],
  ["switch", "Switch"],
  ["switch_dom", "Dom-leaning Switch"],
  ["switch_sub", "sub-leaning Switch"],
  ["top", "Top"],
  ["bottom", "Bottom"],
  ["sadist", "Sadist"],
  ["masochist", "Masochist"],
  ["master", "Master"],
  ["slave", "slave"],
  ["mistress", "Mistress"],
  ["daddy", "Daddy"],
  ["mommy", "Mommy"],
  ["little", "little"],
  ["pet", "pet"],
  ["owner", "Owner"],
  ["primal_predator", "Primal (Predator)"],
  ["primal_prey", "Primal (Prey)"],
  ["bull", "Bull"],
  ["hotwife", "Hotwife"],
  ["cuckold", "Cuckold"],
  ["edge_player", "Edge Player"],
  ["sissy", "Sissy"],
  ["kinkster", "Kinkster"],
  ["exploring", "Exploring"],
  ["undecided", "Undecided"],
  ["hedonist", "Hedonist"],
  ["voyeur", "Voyeur"],
  ["exhibitionist", "Exhibitionist"],
  ["fetishist", "Fetishist"],
];

export const ORIENTATIONS = [
  ["", "Any"],
  ["straight", "Straight"],
  ["lesbian", "Lesbian"],
  ["gay", "Gay"],
  ["bisexual", "Bisexual"],
  ["pansexual", "Pansexual"],
  ["queer", "Queer"],
  ["asexual", "Asexual"],
  ["demisexual", "Demisexual"],
  ["heteroflexible", "Heteroflexible"],
  ["homoflexible", "Homoflexible"],
  ["fluid", "Fluid"],
  ["unsure", "Unsure"],
];

export const GENDERS = [
  ["", "Any"],
  ["M", "Male"],
  ["F", "Female"],
  ["MtF", "Trans Female"],
  ["FtM", "Trans Male"],
  ["nonbinary", "Non-binary"],
  ["genderqueer", "Genderqueer"],
  ["agender", "Agender"],
  ["genderfluid", "Genderfluid"],
];

export const LOOKING_FOR = [
  ["lifetime_relationship", "Lifetime Relationship"],
  ["relationship", "Relationship"],
  ["play_partner", "Play Partner"],
  ["someone_to_play_with", "Someone to play with"],
  ["mistress", "Mistress"],
  ["master", "Master"],
  ["dominant", "Dominant"],
  ["submissive", "submissive"],
  ["slave", "slave"],
  ["princess_by_day_slut_by_night", "Princess by Day, Slut by Night"],
  ["friendship", "Friendship"],
  ["mentor_teacher", "Mentor / Teacher"],
  ["events", "Events"],
  ["chat", "Chat"],
  ["online", "Online play"],
];

export const ACCOUNT_TYPES = [
  ["", "Any"],
  ["free", "Free"],
  ["supporter", "Supporter"],
  ["lifetime_supporter", "Lifetime Supporter"],
  ["employee", "FetLife Employee"],
  ["greeter_alumni", "Greeter Alumni"],
];

// Helpers
export function nameForKey(vocab, key) {
  const e = vocab.find(([k]) => k === key);
  return e ? e[1] : key;
}
export function keysFromVocab(vocab) {
  return vocab.map(([k]) => k).filter(Boolean);
}
