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
  rentCollected: number;
  rentPaid: number;
  inJail: boolean;
  jailTurns: number;
  isBot: boolean;
}

interface CityState {
  id: string;
  ownerId: string | null;
  developmentLevel: number;
}

interface TradeOffer {
  id: string;
  fromId: string;
  toId: string;
  offerCities: string[];
  offerMoney: number;
  requestCities: string[];
  requestMoney: number;
  status: "pending" | "accepted" | "declined" | "cancelled";
}

interface AuctionState {
  cityId: string;
  currentBid: number;
  currentBidderId: string | null;
  endsAt: number;
  triggeredByPlayerId: string;
}

interface ChatMessage {
  id: string;
  playerId: string;
  name: string;
  color: string;
  text: string;
  ts: number;
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
  chat: ChatMessage[];
  startingMoney: number;
  winnerId: string | null;
  trades: TradeOffer[];
  auction: AuctionState | null;
}

type ClientMessage =
  | { type: "join"; name: string; color: string }
  | { type: "start_game" }
  | { type: "add_bot" }
  | { type: "roll_dice" }
  | { type: "buy_property" }
  | { type: "skip_purchase" }
  | { type: "build_house"; cityId: string }
  | { type: "pay_bail" }
  | { type: "end_turn" }
  | { type: "propose_trade"; toId: string; offerCities: string[]; offerMoney: number; requestCities: string[]; requestMoney: number }
  | { type: "respond_trade"; tradeId: string; accept: boolean }
  | { type: "cancel_trade"; tradeId: string }
  | { type: "place_bid"; amount: number }
  | { type: "vote_skip_disconnected" }
  | { type: "chat"; text: string };

type ServerMessage = { type: "state"; state: GameState; you: string } | { type: "error"; message: string };

/* ======================= City data (must match src/main.tsx) ======================= */

const CITIES: Record<string, { id: string; price: number; baseRent: number; name: string; group: string }> = {
  london: { id: "london", price: 2600, baseRent: 220, name: "London", group: "europe" },
  paris: { id: "paris", price: 2400, baseRent: 200, name: "Paris", group: "europe" },
  hamburg: { id: "hamburg", price: 1600, baseRent: 130, name: "Hamburg", group: "germany" },
  berlin: { id: "berlin", price: 1900, baseRent: 160, name: "Berlin", group: "germany" },
  dortmund: { id: "dortmund", price: 1200, baseRent: 95, name: "Dortmund", group: "germany" },
  koeln: { id: "koeln", price: 1350, baseRent: 105, name: "Köln", group: "germany" },
  duesseldorf: { id: "duesseldorf", price: 1300, baseRent: 100, name: "Düsseldorf", group: "germany" },
  muenchen: { id: "muenchen", price: 2100, baseRent: 175, name: "München", group: "germany" },
  newyork: { id: "newyork", price: 3200, baseRent: 280, name: "New York", group: "usa" },
  chicago: { id: "chicago", price: 2200, baseRent: 190, name: "Chicago", group: "usa" },
  losangeles: { id: "losangeles", price: 2900, baseRent: 250, name: "Los Angeles", group: "usa" },
  miami: { id: "miami", price: 2000, baseRent: 170, name: "Miami", group: "usa" },
  saopaulo: { id: "saopaulo", price: 1500, baseRent: 120, name: "São Paulo", group: "samerica" },
  buenosaires: { id: "buenosaires", price: 1400, baseRent: 110, name: "Buenos Aires", group: "samerica" },
  tokyo: { id: "tokyo", price: 3400, baseRent: 300, name: "Tokyo", group: "japan" },
  osaka: { id: "osaka", price: 2300, baseRent: 195, name: "Osaka", group: "japan" },
  kyoto: { id: "kyoto", price: 2000, baseRent: 165, name: "Kyoto", group: "japan" },
  sydney: { id: "sydney", price: 2500, baseRent: 210, name: "Sydney", group: "oceania" },
};

const RENT_MULTIPLIERS = [1, 2, 3.5, 6, 10, 16];
const MAX_DEVELOPMENT_LEVEL = 5;
const BAIL_COST = 200;
const MAX_JAIL_ATTEMPTS = 3;
const BOT_STEP_DELAY_MS = 1100;

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

/* ======================= Random events (30 cards) ======================= */

type EventKind = "self_gain" | "self_loss" | "all_gain" | "steal" | "dev_boost" | "jail";
interface EventDef {
  text: string;
  kind: EventKind;
  amount?: number;
}

const EVENTS: EventDef[] = [
  { text: "Tourismusboom: Du erhältst €400 Zusatzeinnahmen.", kind: "self_gain", amount: 400 },
  { text: "Lottogewinn! Du gewinnst €600.", kind: "self_gain", amount: 600 },
  { text: "Steuerrückerstattung: Du bekommst €250.", kind: "self_gain", amount: 250 },
  { text: "Ein Investor zahlt dir €500 für Beratung.", kind: "self_gain", amount: 500 },
  { text: "Erbschaft: Du erhältst €700.", kind: "self_gain", amount: 700 },
  { text: "Immobilienboom: Du erhältst €350.", kind: "self_gain", amount: 350 },
  { text: "Zinsgutschrift: Du erhältst €150.", kind: "self_gain", amount: 150 },
  { text: "Prämie für gute Führung: €300.", kind: "self_gain", amount: 300 },
  { text: "Gewinnbeteiligung: €450.", kind: "self_gain", amount: 450 },
  { text: "Verkauf von Altmetall: €120.", kind: "self_gain", amount: 120 },
  { text: "Werbedeal: Du verdienst €380.", kind: "self_gain", amount: 380 },
  { text: "Crowdfunding erfolgreich: €500.", kind: "self_gain", amount: 500 },
  { text: "Steuerprüfung: Du zahlst €400.", kind: "self_loss", amount: 400 },
  { text: "Naturkatastrophe: Reparaturkosten €350.", kind: "self_loss", amount: 350 },
  { text: "Bußgeld: Du zahlst €200.", kind: "self_loss", amount: 200 },
  { text: "Gerichtskosten: €500.", kind: "self_loss", amount: 500 },
  { text: "Wartungskosten: €150.", kind: "self_loss", amount: 150 },
  { text: "Diebstahl: Dir werden €300 gestohlen.", kind: "self_loss", amount: 300 },
  { text: "Versicherungsnachzahlung: €250.", kind: "self_loss", amount: 250 },
  { text: "Fehlinvestition: Du verlierst €400.", kind: "self_loss", amount: 400 },
  { text: "Börsenboom: Alle Spieler erhalten €200.", kind: "all_gain", amount: 200 },
  { text: "Wirtschaftsaufschwung: Alle erhalten €150.", kind: "all_gain", amount: 150 },
  { text: "Staatliche Förderung für alle: €100.", kind: "all_gain", amount: 100 },
  { text: "Feiertagsbonus für alle: €180.", kind: "all_gain", amount: 180 },
  { text: "Du gewinnst eine Wette: €300 wechseln den Besitzer.", kind: "steal", amount: 300 },
  { text: "Cleverer Deal: Du nimmst einem Mitspieler €250 ab.", kind: "steal", amount: 250 },
  { text: "Pokerabend: Du gewinnst €200 von einem Mitspieler.", kind: "steal", amount: 200 },
  { text: "Förderprogramm: Eines deiner Grundstücke wird aufgewertet.", kind: "dev_boost" },
  { text: "Renovierungszuschuss: Ausbaustufe einer Stadt steigt.", kind: "dev_boost" },
  { text: "Modernisierung: Eine deiner Städte wird ausgebaut.", kind: "dev_boost" },
  { text: "Verhaftung! Du wanderst direkt ins Gefängnis.", kind: "jail" },
  { text: "Zollkontrolle: Man nimmt dich fest — ab ins Gefängnis.", kind: "jail" },
];

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
      trades: [],
      auction: null,
      log: [],
      chat: [],
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
          case "add_bot": this.handleAddBot(playerId); break;
          case "roll_dice": this.handleRollDice(playerId); break;
          case "buy_property": this.handleBuyProperty(playerId); break;
          case "skip_purchase": this.handleSkipPurchase(playerId); break;
          case "build_house": this.handleBuildHouse(playerId, msg.cityId); break;
          case "pay_bail": this.handlePayBail(playerId); break;
          case "end_turn": this.handleEndTurn(playerId); break;
          case "propose_trade": this.handleProposeTrade(playerId, msg); break;
          case "respond_trade": this.handleRespondTrade(playerId, msg.tradeId, msg.accept); break;
          case "cancel_trade": this.handleCancelTrade(playerId, msg.tradeId); break;
          case "place_bid": this.handlePlaceBid(playerId, msg.amount); break;
          case "vote_skip_disconnected": this.handleSkipDisconnected(playerId); break;
          case "chat": this.handleChat(playerId, msg.text); break;
        }
        await this.persist();
        this.broadcast();
        await this.scheduleNextAlarm();
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
        rentCollected: 0,
        rentPaid: 0,
        inJail: false,
        jailTurns: 0,
        isBot: false,
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

  private handleAddBot(playerId: string) {
    const game = this.game!;
    const requester = game.players.find((p) => p.id === playerId);
    if (!requester?.isHost || game.phase !== "lobby") return;
    if (game.players.length >= PLAYER_COLORS.length) return;
    const usedColors = new Set(game.players.map((p) => p.color));
    const freeColor = PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? PLAYER_COLORS[0];
    const botNumber = game.players.filter((p) => p.isBot).length + 1;
    const bot: Player = {
      id: crypto.randomUUID(),
      name: `Bot ${botNumber}`,
      color: freeColor,
      money: game.startingMoney,
      position: 0,
      isHost: false,
      connected: true,
      bankrupt: false,
      rentCollected: 0,
      rentPaid: 0,
      inJail: false,
      jailTurns: 0,
      isBot: true,
    };
    game.players.push(bot);
    this.addLog(`${bot.name} ist dem Spiel beigetreten.`);
  }

  private handleChat(playerId: string, text: string) {
    const game = this.game!;
    const player = game.players.find((p) => p.id === playerId);
    const clean = (text || "").trim().slice(0, 240);
    if (!player || !clean) return;
    game.chat.push({ id: crypto.randomUUID(), playerId: player.id, name: player.name, color: player.color, text: clean, ts: Date.now() });
    game.chat = game.chat.slice(-100);
  }

  private currentPlayer(): Player | undefined {
    return this.game!.players[this.game!.currentPlayerIndex];
  }

  private handleRollDice(playerId: string) {
    const game = this.game!;
    const player = this.currentPlayer();
    if (game.phase !== "playing" || !player || player.id !== playerId) return;
    if (game.turnPhase !== "awaiting_roll" || game.auction) return;

    const d1 = 1 + Math.floor(Math.random() * 6);
    const d2 = 1 + Math.floor(Math.random() * 6);
    game.lastDice = [d1, d2];

    if (player.inJail) {
      if (d1 === d2) {
        player.inJail = false;
        player.jailTurns = 0;
        this.addLog(`${player.name} würfelt einen Pasch (${d1}+${d2}) und kommt aus dem Gefängnis frei!`);
        // Bei einem Pasch wird ganz normal weitergezogen — fällt durch in die Bewegungslogik unten.
      } else {
        player.jailTurns += 1;
        if (player.jailTurns >= MAX_JAIL_ATTEMPTS) {
          const cost = Math.min(BAIL_COST, player.money);
          player.money -= cost;
          player.inJail = false;
          player.jailTurns = 0;
          this.addLog(`${player.name} kommt nach ${MAX_JAIL_ATTEMPTS} erfolglosen Versuchen gegen €${cost} Kaution frei, verpasst aber den Zug.`);
          this.checkBankruptcy(player);
        } else {
          this.addLog(`${player.name} würfelt ${d1}+${d2} — kein Pasch, bleibt im Gefängnis (Versuch ${player.jailTurns}/${MAX_JAIL_ATTEMPTS}).`);
        }
        game.turnPhase = "awaiting_end";
        return;
      }
    }

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
      if (player.money >= cityDef.price) {
        game.turnPhase = "awaiting_action";
      } else {
        this.addLog(`${player.name} kann sich ${cityDef.name} nicht leisten.`);
        this.startAuction(cityId, player.id);
      }
    } else if (city.ownerId !== player.id) {
      const rent = this.computeRent(cityId);
      const owner = game.players.find((p) => p.id === city.ownerId)!;
      const paid = Math.min(rent, player.money);
      player.money -= paid;
      owner.money += paid;
      player.rentPaid += paid;
      owner.rentCollected += paid;
      this.addLog(`${player.name} zahlt €${paid} Miete an ${owner.name} für ${cityDef.name}.`);
      this.checkBankruptcy(player);
      game.turnPhase = "awaiting_end";
      this.maybeTriggerEvent(player);
    } else {
      game.turnPhase = "awaiting_end";
      this.maybeTriggerEvent(player);
    }
  }

  private computeRent(cityId: string): number {
    const cityDef = CITIES[cityId];
    const city = this.game!.cities[cityId];
    const multiplier = RENT_MULTIPLIERS[city.developmentLevel] ?? 1;
    let rent = Math.round(cityDef.baseRent * multiplier);
    // Richup/Monopoly-Regel: komplette Farbgruppe ohne Bebauung verdoppelt bereits die Miete.
    if (city.developmentLevel === 0 && this.ownsGroup(city.ownerId, cityDef.group)) {
      rent *= 2;
    }
    return rent;
  }

  private ownsGroup(ownerId: string | null, group: string): boolean {
    if (!ownerId) return false;
    const game = this.game!;
    return Object.values(CITIES).filter((c) => c.group === group).every((c) => game.cities[c.id].ownerId === ownerId);
  }

  private handleBuildHouse(playerId: string, cityId: string) {
    const game = this.game!;
    const player = game.players.find((p) => p.id === playerId);
    const cityDef = CITIES[cityId];
    const city = game.cities[cityId];
    if (game.phase !== "playing" || !player || player.bankrupt || !cityDef || !city || game.auction) return;
    if (city.ownerId !== player.id) return;
    if (city.developmentLevel >= MAX_DEVELOPMENT_LEVEL) return;
    if (!this.ownsGroup(player.id, cityDef.group)) return;
    const cost = Math.round(cityDef.price * 0.5);
    if (player.money < cost) return;
    player.money -= cost;
    city.developmentLevel += 1;
    const label = city.developmentLevel >= MAX_DEVELOPMENT_LEVEL ? "ein Hotel" : `Haus Nr. ${city.developmentLevel}`;
    this.addLog(`${player.name} baut ${label} in ${cityDef.name} für €${cost}.`);
  }

  private handlePayBail(playerId: string) {
    const game = this.game!;
    const player = this.currentPlayer();
    if (game.phase !== "playing" || !player || player.id !== playerId || game.auction) return;
    if (!player.inJail || game.turnPhase !== "awaiting_roll") return;
    const cost = Math.min(BAIL_COST, player.money);
    player.money -= cost;
    player.inJail = false;
    player.jailTurns = 0;
    this.addLog(`${player.name} zahlt €${cost} Kaution und wird vorzeitig freigelassen.`);
    this.checkBankruptcy(player);
  }

  private handleBuyProperty(playerId: string) {
    const game = this.game!;
    const player = this.currentPlayer();
    if (game.phase !== "playing" || !player || player.id !== playerId || game.auction) return;
    if (game.turnPhase !== "awaiting_action") return;
    const cityId = BOARD_ORDER[player.position];
    const city = game.cities[cityId];
    const cityDef = CITIES[cityId];
    if (city.ownerId || player.money < cityDef.price) return;
    player.money -= cityDef.price;
    city.ownerId = player.id;
    this.addLog(`${player.name} kauft ${cityDef.name} für €${cityDef.price}.`);
    game.turnPhase = "awaiting_end";
    this.maybeTriggerEvent(player);
  }

  private handleSkipPurchase(playerId: string) {
    const game = this.game!;
    const player = this.currentPlayer();
    if (game.phase !== "playing" || !player || player.id !== playerId || game.auction) return;
    if (game.turnPhase !== "awaiting_action") return;
    const cityId = BOARD_ORDER[player.position];
    if (game.cities[cityId].ownerId) return;
    this.startAuction(cityId, player.id);
  }

  private handleEndTurn(playerId: string) {
    const game = this.game!;
    const player = this.currentPlayer();
    if (game.phase !== "playing" || !player || player.id !== playerId || game.auction) return;
    if (game.turnPhase !== "awaiting_end") return;
    this.advanceTurn();
  }

  private advanceTurn() {
    const game = this.game!;
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

  /* ---- Auctions ---- */

  private startAuction(cityId: string, triggeredByPlayerId: string) {
    const game = this.game!;
    const cityDef = CITIES[cityId];
    const startBid = Math.max(50, Math.round(cityDef.price * 0.1));
    const endsAt = Date.now() + 20000;
    game.auction = { cityId, currentBid: startBid, currentBidderId: null, endsAt, triggeredByPlayerId };
    this.addLog(`Auktion für ${cityDef.name} gestartet — Startgebot €${startBid} (20 Sekunden).`);
    this.state.storage.setAlarm(endsAt);
  }

  private handlePlaceBid(playerId: string, amount: number) {
    const game = this.game!;
    if (!game.auction) return;
    const bidder = game.players.find((p) => p.id === playerId);
    if (!bidder || bidder.bankrupt) return;
    if (!Number.isFinite(amount) || amount <= game.auction.currentBid || amount > bidder.money) return;
    game.auction.currentBid = Math.round(amount);
    game.auction.currentBidderId = playerId;
    const cityDef = CITIES[game.auction.cityId];
    this.addLog(`${bidder.name} bietet €${game.auction.currentBid} für ${cityDef.name}.`);
  }

  // Called by the platform when the auction's alarm fires (~20s after startAuction),
  // even if this Durable Object had no other reason to be active at that moment.
  async alarm() {
    const stored = await this.state.storage.get<GameState>("game");
    if (!stored) return;
    this.game = stored;
    const game = stored;

    if (game.auction && Date.now() >= game.auction.endsAt) {
      this.resolveAuction();
    } else if (game.phase === "playing" && !game.auction) {
      const current = this.currentPlayer();
      if (current && current.isBot && !current.bankrupt) {
        this.runBotStep(current);
      }
    }

    await this.persist();
    this.broadcast();
    await this.scheduleNextAlarm();
  }

  // Arms (or clears) the single Durable Object alarm slot based on what needs to
  // happen next: resolve a running auction, or let a bot take its next step.
  // The DO alarm API only allows one pending alarm at a time, so both concerns
  // share this one scheduler.
  private async scheduleNextAlarm() {
    const game = this.game;
    if (!game) return;
    if (game.auction) {
      await this.state.storage.setAlarm(game.auction.endsAt);
      return;
    }
    if (game.phase === "playing") {
      const current = this.currentPlayer();
      if (current && current.isBot && !current.bankrupt) {
        await this.state.storage.setAlarm(Date.now() + BOT_STEP_DELAY_MS);
        return;
      }
    }
    try {
      await this.state.storage.deleteAlarm();
    } catch {
      // no alarm was pending — fine to ignore
    }
  }

  /* ---- Bot AI: one small scripted step per alarm tick, so bot turns stay visible ---- */

  private runBotStep(bot: Player) {
    const game = this.game!;
    if (bot.inJail) {
      if (bot.money >= BAIL_COST * 2 && Math.random() < 0.4) {
        this.handlePayBail(bot.id);
      } else {
        this.handleRollDice(bot.id);
      }
      return;
    }

    switch (game.turnPhase) {
      case "awaiting_roll":
        this.handleRollDice(bot.id);
        break;
      case "awaiting_action": {
        const cityId = BOARD_ORDER[bot.position];
        const cityDef = CITIES[cityId];
        // Einfache Heuristik: kaufen, solange danach noch ein Sicherheitspolster bleibt.
        if (bot.money - cityDef.price >= 300) this.handleBuyProperty(bot.id);
        else this.handleSkipPurchase(bot.id);
        break;
      }
      case "awaiting_end":
        this.maybeBotBuildHouse(bot);
        this.handleEndTurn(bot.id);
        break;
    }
  }

  private maybeBotBuildHouse(bot: Player) {
    const game = this.game!;
    if (Math.random() >= 0.5) return;
    const buildable = Object.values(game.cities).filter((c) => {
      if (c.ownerId !== bot.id || c.developmentLevel >= MAX_DEVELOPMENT_LEVEL) return false;
      const cityDef = CITIES[c.id];
      return this.ownsGroup(bot.id, cityDef.group) && bot.money - Math.round(cityDef.price * 0.5) >= 300;
    });
    if (buildable.length === 0) return;
    const target = buildable[Math.floor(Math.random() * buildable.length)];
    this.handleBuildHouse(bot.id, target.id);
  }

  private resolveAuction() {
    const game = this.game!;
    const auction = game.auction;
    if (!auction) return;
    const cityDef = CITIES[auction.cityId];
    const city = game.cities[auction.cityId];

    if (auction.currentBidderId && !city.ownerId) {
      const winner = game.players.find((p) => p.id === auction.currentBidderId);
      if (winner) {
        const paid = Math.min(auction.currentBid, winner.money);
        winner.money -= paid;
        city.ownerId = winner.id;
        this.addLog(`${winner.name} ersteigert ${cityDef.name} für €${paid}.`);
      }
    } else {
      this.addLog(`Niemand hat für ${cityDef.name} geboten — bleibt unverkauft.`);
    }

    const triggerer = game.players.find((p) => p.id === auction.triggeredByPlayerId);
    game.auction = null;
    if (triggerer && !triggerer.bankrupt && game.currentPlayerIndex === game.players.indexOf(triggerer)) {
      this.advanceTurn();
    }
  }

  /* ---- Random events ---- */

  private maybeTriggerEvent(player: Player) {
    if (Math.random() >= 0.2) return; // ~20% chance per landing
    const game = this.game!;
    const ev = EVENTS[Math.floor(Math.random() * EVENTS.length)];

    switch (ev.kind) {
      case "self_gain":
        player.money += ev.amount!;
        break;
      case "self_loss": {
        const paid = Math.min(ev.amount!, player.money);
        player.money -= paid;
        this.checkBankruptcy(player);
        break;
      }
      case "all_gain":
        for (const p of game.players) if (!p.bankrupt) p.money += ev.amount!;
        break;
      case "steal": {
        const others = game.players.filter((p) => p.id !== player.id && !p.bankrupt && p.money > 0);
        if (others.length === 0) {
          player.money += Math.round(ev.amount! / 2);
          break;
        }
        const victim = others[Math.floor(Math.random() * others.length)];
        const taken = Math.min(ev.amount!, victim.money);
        victim.money -= taken;
        player.money += taken;
        this.checkBankruptcy(victim);
        break;
      }
      case "dev_boost": {
        const owned = Object.values(game.cities).filter((c) => c.ownerId === player.id && c.developmentLevel < MAX_DEVELOPMENT_LEVEL - 1);
        if (owned.length === 0) {
          player.money += 150;
          break;
        }
        const target = owned[Math.floor(Math.random() * owned.length)];
        target.developmentLevel += 1;
        break;
      }
      case "jail": {
        player.inJail = true;
        player.jailTurns = 0;
        break;
      }
    }
    this.addLog(`🎲 Ereignis: ${ev.text}`);
  }

  /* ---- Reconnect handling ---- */

  private handleSkipDisconnected(requesterId: string) {
    const game = this.game!;
    if (game.phase !== "playing") return;
    const current = this.currentPlayer();
    if (!current || current.connected) return; // only allow if truly disconnected
    const requester = game.players.find((p) => p.id === requesterId);
    if (!requester || !requester.connected) return;
    game.auction = null;
    this.addLog(`${current.name} wurde übersprungen (Verbindung getrennt).`);
    this.advanceTurn();
  }

  private handleProposeTrade(
    fromId: string,
    msg: { toId: string; offerCities: string[]; offerMoney: number; requestCities: string[]; requestMoney: number }
  ) {
    const game = this.game!;
    if (game.phase !== "playing") return;
    const from = game.players.find((p) => p.id === fromId);
    const to = game.players.find((p) => p.id === msg.toId);
    if (!from || !to || from.id === to.id || from.bankrupt || to.bankrupt) return;

    // Reject obviously invalid offers up front (real ownership/money re-checked again on accept,
    // since state can change between proposing and accepting).
    const offerValid = msg.offerCities.every((cid) => game.cities[cid]?.ownerId === from.id);
    const requestValid = msg.requestCities.every((cid) => game.cities[cid]?.ownerId === to.id);
    if (!offerValid || !requestValid) return;
    if (msg.offerMoney < 0 || msg.requestMoney < 0) return;
    if (msg.offerMoney > from.money || msg.requestMoney > to.money) return;

    // Keep the trade list from growing forever — drop old resolved trades first.
    game.trades = game.trades.filter((t) => t.status === "pending").slice(-9);

    const trade: TradeOffer = {
      id: crypto.randomUUID(),
      fromId: from.id,
      toId: to.id,
      offerCities: msg.offerCities,
      offerMoney: msg.offerMoney,
      requestCities: msg.requestCities,
      requestMoney: msg.requestMoney,
      status: "pending",
    };
    game.trades.push(trade);
    this.addLog(`${from.name} bietet ${to.name} einen Handel an.`);
  }

  private handleRespondTrade(playerId: string, tradeId: string, accept: boolean) {
    const game = this.game!;
    const trade = game.trades.find((t) => t.id === tradeId);
    if (!trade || trade.status !== "pending") return;
    if (trade.toId !== playerId) return; // only the recipient may respond

    if (!accept) {
      trade.status = "declined";
      this.addLog(`Handel abgelehnt.`);
      return;
    }

    const from = game.players.find((p) => p.id === trade.fromId);
    const to = game.players.find((p) => p.id === trade.toId);
    if (!from || !to) {
      trade.status = "declined";
      return;
    }

    // Re-validate everything at execution time — ownership/money may have changed
    // since the offer was proposed (this is the server-authoritative check).
    const offerValid = trade.offerCities.every((cid) => game.cities[cid]?.ownerId === from.id);
    const requestValid = trade.requestCities.every((cid) => game.cities[cid]?.ownerId === to.id);
    if (!offerValid || !requestValid || from.money < trade.offerMoney || to.money < trade.requestMoney) {
      trade.status = "declined";
      this.addLog(`Handel konnte nicht abgeschlossen werden (Bestand hat sich geändert).`);
      return;
    }

    // Execute atomically: swap cities, transfer money both directions.
    for (const cid of trade.offerCities) game.cities[cid].ownerId = to.id;
    for (const cid of trade.requestCities) game.cities[cid].ownerId = from.id;
    from.money = from.money - trade.offerMoney + trade.requestMoney;
    to.money = to.money - trade.requestMoney + trade.offerMoney;

    trade.status = "accepted";
    this.addLog(`${from.name} und ${to.name} haben einen Handel abgeschlossen.`);
  }

  private handleCancelTrade(playerId: string, tradeId: string) {
    const game = this.game!;
    const trade = game.trades.find((t) => t.id === tradeId);
    if (!trade || trade.status !== "pending") return;
    if (trade.fromId !== playerId) return; // only the proposer may cancel
    trade.status = "cancelled";
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
