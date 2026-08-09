export type TigerEffect = "none" | "confetti" | "shake" | "glow" | "balloons";

export type ParsedTigerMessage = {
  body: string;
  effect: TigerEffect;
  botResult: string | null;
};

function stableNumber(seed: string, max: number) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % max;
}

export function parseTigerMessage(rawBody: string, seed: string): ParsedTigerMessage {
  let body = rawBody;
  let effect: TigerEffect = "none";
  const effectMatch = body.match(/^\/(confetti|shake|glow|balloons)\s+([\s\S]+)/i);
  if (effectMatch) {
    effect = effectMatch[1].toLowerCase() as TigerEffect;
    body = effectMatch[2];
  }

  const trimmed = body.trim();
  const lower = trimmed.toLowerCase();
  let botResult: string | null = null;

  if (lower === "/coinflip") {
    botResult = `🐯 Tiger Bot: ${stableNumber(seed, 2) === 0 ? "Heads" : "Tails"}`;
  } else if (lower === "/dice") {
    botResult = `🎲 Tiger Bot rolled ${stableNumber(seed, 6) + 1}`;
  } else if (lower.startsWith("/choose ")) {
    const choices = trimmed.slice(8).split("|").map((x) => x.trim()).filter(Boolean);
    botResult = choices.length ? `🐯 Tiger Bot chooses: ${choices[stableNumber(seed, choices.length)]}` : "Use /choose option one | option two";
  } else if (lower.startsWith("/rps ")) {
    const picked = lower.slice(5).trim();
    const options = ["rock", "paper", "scissors"];
    const bot = options[stableNumber(seed, 3)];
    botResult = options.includes(picked) ? `🐯 Tiger Bot picked ${bot}. You picked ${picked}.` : "Use /rps rock, /rps paper, or /rps scissors.";
  } else if (lower === "/shrug") {
    botResult = "¯\\_(ツ)_/¯";
  } else if (lower === "/time") {
    botResult = "🕒 Tiger Bot: check the message timestamp for the shared send time.";
  } else if (lower === "/help") {
    botResult = "Tiger Bot commands: /coinflip · /dice · /choose A | B · /rps rock · /shrug · /time · /confetti message · /shake message · /glow message · /balloons message";
  }

  return { body, effect, botResult };
}
