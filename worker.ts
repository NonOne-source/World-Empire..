/* ======================= Types ======================= */

interface Player {
  id: string;
  name: string;
  color: string;
  money: number;
  position: number;
  isHost: boolean;
  connected: boolean;
  bankrupt: boolean;
}

interface CityState {
  id: string;
  ownerId: string | null;
  developmentLevel: number;
}

interface GameState {
  gameId: string;
  phase: "lobby" | "playing" | "finished";
  turnPhase: "awaiting_roll" | "awaiting_action" | "awaiting_end";
  players: Player[];
  currentPlayerIndex: number;
  cities: Record<string, CityState>;
  lastDice: [number, number] | null;
  log: { id: string; text: string; ts: number }[];
  startingMoney: number;
  winnerId: string | null;
}

type ClientMessage =
  | { type: "join"; name: string; color: string }
  | { type: "start_game" }
  | { type: "roll_dice" }
  | { type: "buy_property" }
  | { type: "skip_purchase" }
  | { type: "end_turn" };

type ServerMessage = { type: "state"; state: GameState; you: string } | { type: "error"; message: string };

/* ======================= City data (must match src/main.tsx) ======================= */

const CITIES: Record<string, { id: string; price: number; baseRent: number; name: string }> = {
  london: { id: "london", price: 2600, baseRent: 220, name: "London" },
  paris: { id: "paris", price: 2400, baseRent: 200, name: "Paris" },
  hamburg: { id: "hamburg", price: 1600, baseRent: 130, name: "Hamburg" },
  berlin: { id: "berlin", price: 1900, baseRent: 160, name: "Berlin" },
  dortmund: { id: "dortmund", price: 1200, baseRent: 95, name: "Dortmund" },
  koeln: { id: "koeln", price: 1350, baseRent: 105, name: "Köln" },
  duesseldorf: { id: "duesseldorf", price: 1300, baseRent: 100, name: "Düsseldorf" },
  muenchen: { id: "muenchen", price: 2100, baseRent: 175, name: "München" },
  newyork: { id: "newyork", price: 3200, baseRent: 280, name: "New York" },
  chicago: { id: "chicago", price: 2200, baseRent: 190, name: "Chicago" },
  losangeles: { id: "losangeles", price: 2900, baseRent: 250, name: "Los Angeles" },
  miami: { id: "miami", price: 2000, baseRent: 170, name: "Miami" },
  saopaulo: { id: "saopaulo", price: 1500, baseRent: 120, name: "São Paulo" },
  buenosaires: { id: "buenosaires", price: 1400, baseRent: 110, name: "Buenos Aires" },
  tokyo: { id: "tokyo", price: 3400, baseRent: 300, name: "Tokyo" },
  osaka: { id: "osaka", price: 2300, baseRent: 195, name: "Osaka" },
  kyoto: { id: "kyoto", price: 2000, baseRent: 165, name: "Kyoto" },
  sydney: { id: "sydney", price: 2500, baseRent: 210, name: "Sydney" },
};

const BOARD_ORDER: string[] = [
  "london", "paris", "hamburg", "berlin", "dortmund", "koeln", "duesseldorf", "muenchen",
  "newyork", "chicago", "losangeles", "miami",
  "saopaulo", "buenosaires",
  "sydney",
  "tokyo", "osaka", "kyoto",
];

const GO_BONUS = 400;
const STARTING_MONEY = 12500;
const PLAYER_COLORS = ["#C9A227", "#3E8E7E", "#B8543F", "#6C7DD9", "#D98E4A", "#9B6BC9"];

/* ======================= Durable Object ======================= */

interface Env {
  GAME_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
}

interface Session {
  ws: WebSocket;
  playerId: string;
}

export class GameRoom {
  state: DurableObjectState;
  env: Env;
  sessions: Session[] = [];
  game: GameState | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/ws")) {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
      await this.handleSession(server, url);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("Not found", { status: 404 });
  }

  private async loadGame(gameId: string): Promise<GameState> {
    if (this.game) return this.game;
    const stored = await this.state.storage.get<GameState>("game");
    if (stored) {
      this.game = stored;
      return stored;
    }
    const fresh: GameState = {
      gameId,
      phase: "lobby",
      turnPhase: "awaiting_roll",
      players: [],
      currentPlayerIndex: 0,
      cities: Object.fromEntries(Object.keys(CITIES).map((id) => [id, { id, ownerId: null, developmentLevel: 0 }])),
      lastDice: null,
      log: [],
      startingMoney: STARTING_MONEY,
      winnerId: null,
    };
    this.game = fresh;
    await this.persist();
    return fresh;
  }

  private async persist() {
    if (this.game) await this.state.storage.put("game", this.game);
  }

  private addLog(text: string) {
    if (!this.game) return;
    this.game.log.unshift({ id: crypto.randomUUID(), text, ts: Date.now() });
    this.game.log = this.game.log.slice(0, 40);
  }

  private async handleSession(ws: WebSocket, url: URL) {
    // @ts-ignore
    ws.accept();
    const gameId = url.pathname.split("/")[2] ?? "unknown";
    await this.loadGame(gameId);
    let playerId: string | null = null;

    ws.addEventListener("message", async (event: MessageEvent) => {
      try {
        const msg: ClientMessage = JSON.parse(event.data as string);
        if (msg.type === "join") {
          playerId = await this.handleJoin(ws, msg.name, msg.color);
          return;
        }
        if (!playerId || !this.game) return;
        switch (msg.type) {
          case "start_game": this.handleStartGame(playerId); break;
          case "roll_dice": this.handleRollDice(playerId); break;
          case "buy_property": this.handleBuyProperty(playerId); break;
          case "skip_purchase": this.handleSkipPurchase(playerId); break;
          case "end_turn": this.handleEndTurn(playerId); break;
        }
        await this.persist();
        this.broadcast();
      } catch {
        this.sendTo(ws, { type: "error", message: "Ungültige Nachricht." });
      }
    });

    ws.addEventListener("close", () => {
      this.sessions = this.sessions.filter((s) => s.ws !== ws);
      if (playerId && this.game) {
        const p = this.game.players.find((pl) => pl.id === playerId);
        if (p) p.connected = false;
        this.persist();
        this.broadcast();
      }
    });
  }

  private async handleJoin(ws: WebSocket, name: string, color: string): Promise<string> {
    const game = this.game!;
    const cleanName = (name || "Spieler").trim().slice(0, 20) || "Spieler";
    const existing = game.players.find((p) => p.name === cleanName && !p.connected);
    let playerId: string;

    if (existing && game.phase !== "lobby") {
      existing.connected = true;
      playerId = existing.id;
    } else if (game.phase !== "lobby") {
      playerId = crypto.randomUUID();
    } else {
      const usedColors = new Set(game.players.map((p) => p.color));
      const freeColor = PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? color;
      const player: Player = {
        id: crypto.randomUUID(),
        name: cleanName,
        color: freeColor,
        money: game.startingMoney,
        position: 0,
        isHost: game.players.length === 0,
        connected: true,
        bankrupt: false,
      };
      game.players.push(player);
      playerId = player.id;
      this.addLog(`${cleanName} ist dem Spiel beigetreten.`);
    }

    this.sessions.push({ ws, playerId });
    await this.persist();
    this.broadcast();
    return playerId;
  }

  private handleStartGame(playerId: string) {
    const game = this.game!;
    const player = game.players.find((p) => p.id === playerId);
    if (!player?.isHost || game.phase !== "lobby") return;
    if (game.players.length < 2) return;
    game.phase = "playing";
    game.turnPhase = "awaiting_roll";
    game.currentPlayerIndex = 0;
    this.addLog("Das Spiel hat begonnen.");
  }

  private currentPlayer(): Player | undefined {
    return this.game!.players[this.game!.currentPlayerIndex];
  }

  private handleRollDice(playerId: string) {
    const game = this.game!;
    const player = this.currentPlayer();
    if (game.phase !== "playing" || !player || player.id !== playerId) return;
    if (game.turnPhase !== "awaiting_roll") return;

    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    game.lastDice = [d1, d2];
    const steps = d1 + d2;
    const prevPosition = player.position;
    const newPosition = (prevPosition + steps) % BOARD_ORDER.length;
    const passedGo = prevPosition + steps >= BOARD_ORDER.length;
    player.position = newPosition;

    if (passedGo) {
      player.money += GO_BONUS;
      this.addLog(`${player.name} passiert den Start und erhält €${GO_BONUS}.`);
    }

    const cityId = BOARD_ORDER[newPosition];
    const city = game.cities[cityId];
    const cityDef = CITIES[cityId];
    this.addLog(`${player.name} würfelt ${d1}+${d2}=${steps} und landet in ${cityDef.name}.`);

    if (!city.ownerId) {
      game.turnPhase = player.money >= cityDef.price ? "awaiting_action" : "awaiting_end";
      if (player.money < cityDef.price) this.addLog(`${player.name} kann sich ${cityDef.name} nicht leisten.`);
    } else if (city.ownerId !== player.id) {
      const rent = this.computeRent(cityId);
      const owner = game.players.find((p) => p.id === city.ownerId)!;
      const paid = Math.min(rent, player.money);
      player.money -= paid;
      owner.money += paid;
      this.addLog(`${player.name} zahlt €${paid} Miete an ${owner.name} für ${cityDef.name}.`);
      this.checkBankruptcy(player);
      game.turnPhase = "awaiting_end";
    } else {
      game.turnPhase = "awaiting_end";
    }
  }

  private computeRent(cityId: string): number {
    const cityDef = CITIES[cityId];
    const city = this.game!.cities[cityId];
    const multiplier = [1, 2, 3.5, 6, 10][city.developmentLevel] ?? 1;
    return Math.round(cityDef.baseRent * multiplier);
  }

  private handleBuyProperty(playerId: string) {
    const game = this.game!;
    const player = this.currentPlayer();
    if (game.phase !== "playing" || !player || player.id !== playerId) return;
    if (game.turnPhase !== "awaiting_action") return;
    const cityId = BOARD_ORDER[player.position];
    const city = game.cities[cityId];
    const cityDef = CITIES[cityId];
    if (city.ownerId || player.money < cityDef.price) return;
    player.money -= cityDef.price;
    city.ownerId = player.id;
    this.addLog(`${player.name} kauft ${cityDef.name} für €${cityDef.price}.`);
    game.turnPhase = "awaiting_end";
  }

  private handleSkipPurchase(playerId: string) {
    const game = this.game!;
    const player = this.currentPlayer();
    if (game.phase !== "playing" || !player || player.id !== playerId) return;
    if (game.turnPhase !== "awaiting_action") return;
    game.turnPhase = "awaiting_end";
  }

  private handleEndTurn(playerId: string) {
    const game = this.game!;
    const player = this.currentPlayer();
    if (game.phase !== "playing" || !player || player.id !== playerId) return;
    if (game.turnPhase !== "awaiting_end") return;

    const active = game.players.filter((p) => !p.bankrupt);
    if (active.length <= 1) {
      game.phase = "finished";
      game.winnerId = active[0]?.id ?? null;
      this.addLog(`${active[0]?.name ?? "Niemand"} gewinnt das Spiel!`);
      return;
    }

    let next = game.currentPlayerIndex;
    do {
      next = (next + 1) % game.players.length;
    } while (game.players[next].bankrupt);

    game.currentPlayerIndex = next;
    game.turnPhase = "awaiting_roll";
    game.lastDice = null;
  }

  private checkBankruptcy(player: Player) {
    const game = this.game!;
    if (player.money > 0 || player.bankrupt) return;
    player.bankrupt = true;
    for (const city of Object.values(game.cities)) {
      if (city.ownerId === player.id) {
        city.ownerId = null;
        city.developmentLevel = 0;
      }
    }
    this.addLog(`${player.name} ist bankrott und scheidet aus.`);
  }

  private sendTo(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // socket already closed
    }
  }

  private broadcast() {
    if (!this.game) return;
    for (const session of this.sessions) this.sendTo(session.ws, { type: "state", state: this.game, you: session.playerId });
  }
}

/* ======================= Worker entry ======================= */

function randomRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/create" && request.method === "POST") {
      const code = randomRoomCode();
      return Response.json({ gameId: code });
    }

    const match = url.pathname.match(/^\/room\/([A-Z0-9]{4,10})\/ws$/i);
    if (match) {
      const gameId = match[1].toUpperCase();
      const id = env.GAME_ROOM.idFromName(gameId);
      const stub = env.GAME_ROOM.get(id);
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
