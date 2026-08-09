"use client";

import { useMemo, useState } from "react";
import { parseTigerMessage } from "@/lib/tiger-bot";

const TRIVIA = [
  ["How many strikes make a strikeout in baseball?", "3"],
  ["What planet is known as the Red Planet?", "Mars"],
  ["How many sides does a hexagon have?", "6"],
  ["What does CPU stand for?", "Central Processing Unit"],
  ["Which ocean is the largest?", "Pacific Ocean"],
] as const;

export function GamesPanel() {
  const [command, setCommand] = useState("/help");
  const [seed, setSeed] = useState(1);
  const parsed = useMemo(() => parseTigerMessage(command, String(seed)), [command, seed]);
  const [ttt, setTtt] = useState<("X" | "O" | null)[]>(Array(9).fill(null));
  const [connect, setConnect] = useState<("R" | "Y" | null)[]>(Array(42).fill(null));
  const [rps, setRps] = useState("");
  const [triviaIndex, setTriviaIndex] = useState(0);
  const [showTrivia, setShowTrivia] = useState(false);

  function tttPlay(index: number) {
    if (ttt[index] || winner(ttt)) return;
    const next = [...ttt]; next[index] = "X";
    const free = next.map((v, i) => v ? -1 : i).filter((i) => i >= 0);
    if (!winner(next) && free.length) next[free[Math.floor(Math.random() * free.length)]] = "O";
    setTtt(next);
  }
  function dropConnect(column: number) {
    const next = [...connect];
    let placed = -1;
    for (let row = 5; row >= 0; row -= 1) { const i = row * 7 + column; if (!next[i]) { next[i] = "R"; placed = i; break; } }
    if (placed < 0 || connectWinner(next)) { setConnect(next); return; }
    const cols = Array.from({ length: 7 }, (_, c) => c).filter((c) => { for (let row = 5; row >= 0; row -= 1) if (!next[row * 7 + c]) return true; return false; });
    if (!connectWinner(next) && cols.length) {
      const c = cols[Math.floor(Math.random() * cols.length)];
      for (let row = 5; row >= 0; row -= 1) { const i = row * 7 + c; if (!next[i]) { next[i] = "Y"; break; } }
    }
    setConnect(next);
  }
  function playRps(choice: string) {
    const options = ["rock", "paper", "scissors"]; const bot = options[Math.floor(Math.random() * 3)];
    const result = choice === bot ? "Tie" : (choice === "rock" && bot === "scissors") || (choice === "paper" && bot === "rock") || (choice === "scissors" && bot === "paper") ? "You win" : "Tiger Bot wins";
    setRps(`${result}: you picked ${choice}, Tiger Bot picked ${bot}.`);
  }

  return <div className="tiger-v11-grid">
    <section className="tiger-card tiger-span-2"><h3>🐯 Tiger Bot — no AI/API cost</h3><p>These commands are deterministic code, not a paid AI model. They also work when typed into messages after v11.</p><div className="tiger-inline-form"><input value={command} onChange={(e) => setCommand(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") setSeed((x) => x + 1); }} /><button className="primary-button" onClick={() => setSeed((x) => x + 1)}>Run</button></div><div className="tiger-bot-demo">{parsed.botResult || parsed.body}</div></section>

    <section className="tiger-card"><h3>Tic-tac-toe</h3><div className="tiger-ttt">{ttt.map((value, i) => <button key={i} onClick={() => tttPlay(i)}>{value}</button>)}</div><strong>{winner(ttt) ? `${winner(ttt)} wins` : ttt.every(Boolean) ? "Tie" : "You are X"}</strong><button className="secondary-button" onClick={() => setTtt(Array(9).fill(null))}>Reset</button></section>

    <section className="tiger-card"><h3>Rock · Paper · Scissors</h3><div className="tiger-button-row"><button onClick={() => playRps("rock")}>🪨 Rock</button><button onClick={() => playRps("paper")}>📄 Paper</button><button onClick={() => playRps("scissors")}>✂️ Scissors</button></div>{rps && <p>{rps}</p>}</section>

    <section className="tiger-card tiger-span-2"><h3>Connect Four</h3><div className="tiger-connect">{connect.map((value, i) => <button key={i} onClick={() => dropConnect(i % 7)} className={value ? `piece-${value}` : ""}>{value === "R" ? "●" : value === "Y" ? "○" : "·"}</button>)}</div><strong>{connectWinner(connect) ? `${connectWinner(connect) === "R" ? "You" : "Tiger Bot"} won` : "You are ●"}</strong><button className="secondary-button" onClick={() => setConnect(Array(42).fill(null))}>Reset</button></section>

    <section className="tiger-card tiger-span-2"><h3>Built-in trivia</h3><p><strong>Question {triviaIndex + 1}:</strong> {TRIVIA[triviaIndex][0]}</p>{showTrivia && <p className="tiger-notice">Answer: {TRIVIA[triviaIndex][1]}</p>}<div className="tiger-button-row"><button className="secondary-button" onClick={() => setShowTrivia((v) => !v)}>{showTrivia ? "Hide answer" : "Reveal answer"}</button><button className="primary-button" onClick={() => { setTriviaIndex((i) => (i + 1) % TRIVIA.length); setShowTrivia(false); }}>Next question</button></div></section>
  </div>;
}

function winner(board: ("X" | "O" | null)[]) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const [a,b,c] of lines) if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  return null;
}

function connectWinner(board: ("R" | "Y" | null)[]) {
  const at = (r: number, c: number) => r >= 0 && r < 6 && c >= 0 && c < 7 ? board[r * 7 + c] : null;
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) for (const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]) {
    const v = at(r,c); if (v && v === at(r+dr,c+dc) && v === at(r+2*dr,c+2*dc) && v === at(r+3*dr,c+3*dc)) return v;
  }
  return null;
}
