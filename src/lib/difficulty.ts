export const difficulties = ["Easy", "Hard"] as const;
export type Difficulty = typeof difficulties[number];
export const opponents = {
  Easy: { hockeySpeed: 2.6, rallySpeed: 1.1, response: 8, reaction: 320, hockeyError: .65, prediction: .1, rallyError: .24, rallyFatigue: .03, ballSpeed: .8 },
  Hard: { hockeySpeed: 7, rallySpeed: 3.8, response: 24, reaction: 65, hockeyError: .1, prediction: .7, rallyError: .035, rallyFatigue: .006, ballSpeed: 1.15 },
};
