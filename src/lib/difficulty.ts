export const difficulties = ["Easy", "Medium", "Hard", "Impossible"] as const;
export type Difficulty = typeof difficulties[number];
export const difficultyHelp: Record<Difficulty, string> = {
  Easy: "A relaxed opponent. A good place to start.",
  Medium: "Quicker reactions and a closer match.",
  Hard: "Fast, accurate, and tough to beat.",
  Impossible: "Instant reactions and pinpoint accuracy. Good luck!",
};
export const opponents = {
  Easy: { hockeySpeed: 2.6, rallySpeed: 1.1, response: 8, reaction: 320, hockeyError: .65, prediction: .1, rallyError: .24, rallyFatigue: .03, ballSpeed: .8 },
  Medium: { hockeySpeed: 4.6, rallySpeed: 2.1, response: 14, reaction: 170, hockeyError: .32, prediction: .35, rallyError: .12, rallyFatigue: .02, ballSpeed: 1 },
  Hard: { hockeySpeed: 7, rallySpeed: 3.8, response: 24, reaction: 65, hockeyError: .1, prediction: .7, rallyError: .035, rallyFatigue: .006, ballSpeed: 1.15 },
  Impossible: { hockeySpeed: 14, rallySpeed: 10, response: 55, reaction: 0, hockeyError: 0, prediction: 1, rallyError: 0, rallyFatigue: 0, ballSpeed: 1.3 },
};
