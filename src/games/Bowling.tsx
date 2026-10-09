import { useCallback, useEffect, useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { BowlingLane, type LaneAPI } from "./BowlingLane";
import {
  frameComplete,
  newPlayer,
  rackResets,
  scoreFrames,
} from "../lib/bowling.mjs";
import { chime, type Settings } from "../lib/store";
import type { useRoom } from "../lib/room";
import TurnHandoff from "../components/TurnHandoff";
import { resultTitle } from "../components/ResultPanel";
type Player = { name: string; frames: number[][] };
export default function Bowling({
  roster,
  suspended = false,
  settings,
  room,
  onComplete,
  onExit,
}: {
  roster: string[];
  suspended?: boolean;
  settings: Settings;
  room: ReturnType<typeof useRoom>;
  onComplete: (score: number, name: string) => void;
  onExit: () => void;
}) {
  const pauseRef = useRef(suspended);
  pauseRef.current = suspended;
  const started = true;
  const names = roster;
  const count = roster.length;
  const [players, setPlayers] = useState<Player[]>(() => roster.map(newPlayer));
  const [turn, setTurn] = useState(0);
  const [frame, setFrame] = useState(0);
  const [standing, setStanding] = useState<number[]>([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
  ]);
  // Set from the phone's Move and Aim buttons; spin comes with the swing.
  const [line, setLine] = useState({ position: 0, angle: 0 });
  const spin = useRef(0);
  const [phase, setPhaseState] = useState<
    "ready" | "rolling" | "result" | "handoff" | "finished"
  >("ready");
  const phaseRef = useRef(phase);
  const setPhase = (next: typeof phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  };
  const acceptTurn = () => {
    if (pauseRef.current || phaseRef.current !== "handoff") return;
    setPhase("ready");
  };
  const [message, setMessage] = useState("Find your line.");
  const lane = useRef<LaneAPI>(null);
  const rolling = useRef(false);
  const start = () => {
    setPlayers(
      names.slice(0, count).map((n) => newPlayer(n.trim() || "Player")),
    );

    setTurn(0);
    setFrame(0);
    setStanding([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    setPhase("ready");
    setMessage("Find your line.");
    rolling.current = false;
  };
  const roll = useCallback(
    (remotePower?: number) => {
      if (
        pauseRef.current ||
        phaseRef.current !== "ready" ||
        !started ||
        rolling.current
      )
        return;
      rolling.current = true;
      setPhase("rolling");
      setMessage("Looking good…");
      lane.current?.roll(line, remotePower ?? 0.5, spin.current, (hits) => {
        const updated = players.map((p) => ({
          ...p,
          frames: p.frames.map((f) => [...f]),
        }));
        updated[turn].frames[frame].push(hits.length);
        const rolls = updated[turn].frames[frame];
        setPlayers(updated);
        setStanding((old) => old.filter((id) => !hits.includes(id)));
        setMessage(
          hits.length === 10
            ? "Strike. Beautifully done!"
            : rolls.length >= 2 &&
                rolls.slice(-2).reduce((a, b) => a + b, 0) === 10
              ? "Spare. Nicely picked up!"
              : hits.length === 0
                ? "A fresh chance on the next roll."
                : `${hits.length} ${hits.length === 1 ? "pin" : "pins"}. Nice roll!`,
        );
        setPhase("result");
        chime(settings.sound, hits.length >= 8);
        rolling.current = false;
      });
    },
    [phase, started, line, players, turn, frame, settings.sound],
  );
  const next = () => {
    if (pauseRef.current || phaseRef.current !== "result") return;
    const rolls = players[turn].frames[frame];
    const complete = frameComplete(rolls, frame === 9);
    if (complete && frame === 9 && turn === players.length - 1) {
      setPhase("finished");
      players.forEach((p) =>
        onComplete(scoreFrames(p.frames).at(-1) || 0, p.name),
      );
      return;
    }
    if (rackResets(rolls, frame)) setStanding([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    if (complete) {
      if (turn === players.length - 1) {
        setFrame((f) => f + 1);
        setTurn(0);
      } else setTurn((t) => t + 1);
    }
    setLine({ position: 0, angle: 0 });
    spin.current = 0;
    setPhase(complete && players.length > 1 ? "handoff" : "ready");
    setMessage("Find your line.");
  };
  useEffect(() => {
    room.publish(
      "bowling",
      started &&
        (phase === "ready" || phase === "result" || phase === "handoff"),
      phase === "finished"
        ? "Game complete"
        : phase === "handoff"
          ? `Your turn, ${players[turn].name}.`
          : phase === "result"
            ? frame === 9 &&
              turn === players.length - 1 &&
              frameComplete(players[turn].frames[frame], true)
              ? "See results"
              : players.length > 1 &&
                  frameComplete(players[turn].frames[frame], frame === 9)
                ? "Next player"
                : "Next roll"
            : !started
              ? "Start the game on the big screen"
              : `${players[turn]?.name || "Player"} · Frame ${frame + 1}`,
      phase === "handoff" ? players[turn].name : null,
      players[turn]?.name ?? null,
    );
    room.handler.current = (e) => {
      if (pauseRef.current) return;
      if (e.action === "next") {
        acceptTurn();
        return;
      }
      if (phaseRef.current === "ready") {
        if (e.action === "position")
          setLine((old) => ({ ...old, position: e.value }));
        if (e.action === "angle") setLine((old) => ({ ...old, angle: e.value }));
      }
      if (e.action === "spin") spin.current = e.value;
      if (e.action === "throw") {
        if (phase === "result") next();
        else roll(e.value);
      }
    };
    return () => {
      room.handler.current = null;
    };
  }, [room.publish, room.handler, phase, started, players, turn, frame, roll]);
  if (phase === "handoff")
    return (
      <TurnHandoff
        name={players[turn].name}
        detail={`Frame ${frame + 1} of 10`}
      />
    );
  if (phase === "finished")
    return (
      <div className="round-finished">
        <h2 tabIndex={-1}>
          {resultTitle(
            players.map((p) => ({
              name: p.name,
              score: scoreFrames(p.frames).at(-1) || 0,
            })),
          )}
        </h2>
        <div className="finish-scores">
          {[...players]
            .sort(
              (a, b) =>
                (scoreFrames(b.frames).at(-1) || 0) -
                (scoreFrames(a.frames).at(-1) || 0),
            )
            .map((p, i) => (
              <div key={i}>
                <span>{p.name}</span>
                <strong>
                  {scoreFrames(p.frames).at(-1)}
                  <small>points</small>
                </strong>
              </div>
            ))}
        </div>
        <div className="finish-actions">
          <button className="primary-button" onClick={start}>
            <RotateCcw size={18} /> Play again
          </button>
          <button className="secondary-button" onClick={onExit}>
            Choose another game
          </button>
        </div>
        <p className="saved-note">
          <Check size={15} /> Saved to Scores
        </p>
      </div>
    );
  const player = players[turn];
  const scores = scoreFrames(player.frames);
  return (
    <div className="bowling-game">
      <div className="scoreboard">
        <div className="player-score">
          <div>
            <strong>{player.name}</strong>
            <span>Frame {frame + 1} of 10</span>
          </div>
          <b>
            {[...scores].reverse().find((n) => n !== null) ?? 0}
            <small>points</small>
          </b>
        </div>
        <div className="frame-strip" role="group" aria-label="Frame scores">
          {player.frames.map((rolls, i) => (
            <div key={i} className={i === frame ? "current" : ""}>
              <span>{i + 1}</span>
              <div>
                {rolls.length ? (
                  rolls.map((n, k) => (
                    <b key={k}>
                      {n === 10
                        ? "X"
                        : k > 0 && rolls[k - 1] + n === 10
                          ? "/"
                          : n === 0
                            ? "–"
                            : n}
                    </b>
                  ))
                ) : (
                  <b>·</b>
                )}
              </div>
              <strong>{scores[i] ?? "—"}</strong>
            </div>
          ))}
        </div>
      </div>
      <div className="lane-wrap">
        <BowlingLane
          ref={lane}
          line={line}
          standing={standing}
          reduced={settings.motion}
          suspended={suspended}
        />
        <div className="lane-status" aria-live="polite">
          <span className={phase === "rolling" ? "rolling-dot" : ""} />
          {message}
        </div>
        <span className="lane-counter">{standing.length} pins standing</span>
      </div>
      {players.length > 1 &&
        phase === "result" &&
        !(
          frame === 9 &&
          turn === players.length - 1 &&
          frameComplete(player.frames[frame], true)
        ) && (
          <p className="next-player-note" role="status">
            {frameComplete(player.frames[frame], frame === 9)
              ? `Up next: ${players[(turn + 1) % players.length].name}. Tap Next player, then pass the phone.`
              : `${player.name}, you have another roll.`}
          </p>
        )}
    </div>
  );
}
