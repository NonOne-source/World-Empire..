/* ======================= Types ======================= */

interface Player {
  id: string;
  name: string;
  color: string;
  avatar: string;
  money: number;
  position: number;
  isHost: boolean;
  connected: boolean;
  bankrupt: boolean;
  rentCollected: number;
  rentPaid: number;
  isBot: boolean;
}

interface CityState {
  id: string;
  ownerId: string | null;
  developmentLevel: number;
  mortgaged: boolean;
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

interface RoomSettings {
  startingMoney: number;
  maxRounds: number | null;
  eventsEnabled: boolean;
}

interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
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
  startingMoney: number;
  winnerId: string | null;
  trades: TradeOffer[];
  auction: AuctionState | null;
  settings: RoomSettings;
  chat: ChatMessage[];
  round: number;
  turnDeadline: number | null;
}

type ClientMessage =
  | { type: "join"; name: string; color: string; avatar: string }
  | { type: "start_game" }
  | { type: "roll_dice" }
  | { type: "buy_property" }
  | { type: "skip_purchase" }
  | { type: "end_turn" }
  | { type: "propose_trade"; toId: string; offerCities: string[]; offerMoney: number; requestCities: string[]; requestMoney: number }
  | { type: "respond_trade"; tradeId: string; accept: boolean }
  | { type: "cancel_trade"; tradeId: string }
  | { type: "place_bid"; amount: number }
  | { type: "vote_skip_disconnected" }
  | { type: "configure_room"; settings: RoomSettings }
  | { type: "upgrade_property"; cityId: string }
  | { type: "mortgage_property"; cityId: string }
  | { type: "unmortgage_property"; cityId: string }
  | { type: "send_chat"; text: string }
  | { type: "rematch" }
  | { type: "add_bot" }
  | { type: "remove_bot"; botId: string };

type ServerMessage = { type: "state"; state: GameState; you: string } | { type: "error"; message: string };

/* ======================= City data (must match cities.ts) ======================= */

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
const BOT_NAMES = ["Bot Aurora", "Bot Falke", "Bot Krake", "Bot Komet", "Bot Titan", "Bot Yuki"];
const BOT_AVATARS = ["🤖", "👾", "🛰️", "⚙️"];

/* ======================= Random events (30 cards) ======================= */

type EventKind = "self_gain" | "self_loss" | "all_gain" | "steal" | "dev_boost";
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
      cities: Object.fromEntries(Object.keys(CITIES).map((id) => [id, { id, ownerId: null, developmentLevel: 0, mortgaged: false }])),
      lastDice: null,
      trades: [],
      auction: null,
      log: [],
      startingMoney: STARTING_MONEY,
      winnerId: null,
      settings: { startingMoney: STARTING_MONEY, maxRounds: null, eventsEnabled: true },
      chat: [],
      round: 1,
      turnDeadline: null,
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
          playerId = await this.handleJoin(ws, msg.name, msg.color, msg.avatar);
          return;
        }
        if (!playerId || !this.game) return;
        switch (msg.type) {
          case "start_game": this.handleStartGame(playerId); break;
          case "roll_dice": this.handleRollDice(playerId); break;
          case "buy_property": this.handleBuyProperty(playerId); break;
          case "skip_purchase": this.handleSkipPurchase(playerId); break;
          case "end_turn": this.handleEndTurn(playerId); break;
          case "propose_trade": this.handleProposeTrade(playerId, msg); break;
          case "respond_trade": this.handleRespondTrade(playerId, msg.tradeId, msg.accept); break;
          case "cancel_trade": this.handleCancelTrade(playerId, msg.tradeId); break;
          case "place_bid": this.handlePlaceBid(playerId, msg.amount); break;
          case "vote_skip_disconnected": this.handleSkipDisconnected(playerId); break;
          case "configure_room": this.handleConfigureRoom(playerId, msg.settings); break;
          case "upgrade_property": this.handleUpgradeProperty(playerId, msg.cityId); break;
          case "mortgage_property": this.handleMortgage(playerId, msg.cityId); break;
          case "unmortgage_property": this.handleUnmortgage(playerId, msg.cityId); break;
          case "send_chat": this.handleSendChat(playerId, msg.text); break;
          case "rematch": this.handleRematch(playerId); break;
          case "add_bot": this.handleAddBot(playerId); break;
          case "remove_bot": this.handleRemoveBot(playerId, msg.botId); break;
        }
        this.scheduleNextAlarm();
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

  private async handleJoin(ws: WebSocket, name: string, color: string, avatar: string): Promise<string> {
    const game = this.game!;
    const cleanName = (name || "Spieler").trim().slice(0, 20) || "Spieler";
    const cleanAvatar = (avatar || "🙂").slice(0, 4);
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
        avatar: cleanAvatar,
        money: game.startingMoney,
        position: 0,
        isHost: game.players.length === 0,
        connected: true,
        bankrupt: false,
        rentCollected: 0,
        rentPaid: 0,
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
    for (const p of game.players) p.money = game.settings.startingMoney;
    game.phase = "playing";
    game.turnPhase = "awaiting_roll";
    game.currentPlayerIndex = 0;
    game.round = 1;
    game.turnDeadline = Date.now() + 45000;
    this.addLog("Das Spiel hat begonnen.");
  }

  private handleConfigureRoom(playerId: string, settings: RoomSettings) {
    const game = this.game!;
    const player = game.players.find((p) => p.id === playerId);
    if (!player?.isHost || game.phase !== "lobby") return;
    const startingMoney = Math.min(50000, Math.max(1000, Math.round(settings.startingMoney) || STARTING_MONEY));
    const maxRounds = settings.maxRounds && settings.maxRounds > 0 ? Math.min(200, Math.round(settings.maxRounds)) : null;
    game.settings = { startingMoney, maxRounds, eventsEnabled: !!settings.eventsEnabled };
    this.addLog(`${player.name} hat die Spieleinstellungen angepasst.`);
  }

  private handleAddBot(playerId: string) {
    const game = this.game!;
    const player = game.players.find((p) => p.id === playerId);
    if (!player?.isHost || game.phase !== "lobby") return;
    if (game.players.length >= PLAYER_COLORS.length) return;
    const usedColors = new Set(game.players.map((p) => p.color));
    const freeColor = PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? PLAYER_COLORS[0];
    const usedNames = new Set(game.players.map((p) => p.name));
    const botName = BOT_NAMES.find((n) => !usedNames.has(n)) ?? `Bot ${game.players.length + 1}`;
    const bot: Player = {
      id: crypto.randomUUID(),
      name: botName,
      color: freeColor,
      avatar: BOT_AVATARS[Math.floor(Math.random() * BOT_AVATARS.length)],
      money: game.startingMoney,
      position: 0,
      isHost: false,
      connected: true,
      bankrupt: false,
      rentCollected: 0,
      rentPaid: 0,
      isBot: true,
    };
    game.players.push(bot);
    this.addLog(`${botName} (Bot) wurde hinzugefügt.`);
  }

  private handleRemoveBot(playerId: string, botId: string) {
    const game = this.game!;
    const player = game.players.find((p) => p.id === playerId);
    if (!player?.isHost || game.phase !== "lobby") return;
    const bot = game.players.find((p) => p.id === botId && p.isBot);
    if (!bot) return;
    game.players = game.players.filter((p) => p.id !== botId);
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
    const game = this.game!;
    const cityDef = CITIES[cityId];
    const city = game.cities[cityId];
    if (city.mortgaged) return 0;
    const multiplier = [1, 2, 3.5, 6, 10][city.developmentLevel] ?? 1;
    const groupCityIds = Object.keys(CITIES).filter((id) => CITIES[id].group === cityDef.group);
    const ownsFullGroup = city.ownerId !== null && groupCityIds.every((id) => game.cities[id].ownerId === city.ownerId);
    const groupBonus = ownsFullGroup ? 1.5 : 1;
    return Math.round(cityDef.baseRent * multiplier * groupBonus);
  }

  private handleUpgradeProperty(playerId: string, cityId: string) {
    const game = this.game!;
    const player = this.currentPlayer();
    if (game.phase !== "playing" || !player || player.id !== playerId || game.auction) return;
    if (game.turnPhase !== "awaiting_end") return;
    const city = game.cities[cityId];
    const cityDef = CITIES[cityId];
    if (!city || !cityDef || city.ownerId !== playerId || city.mortgaged) return;
    if (city.developmentLevel >= 4) return;
    const cost = Math.round(cityDef.price * 0.5 * (city.developmentLevel + 1));
    if (player.money < cost) return;
    player.money -= cost;
    city.developmentLevel += 1;
    this.addLog(`${player.name} baut ${cityDef.name} aus (Stufe ${city.developmentLevel}) für €${cost}.`);
  }

  private handleMortgage(playerId: string, cityId: string) {
    const game = this.game!;
    const player = this.currentPlayer();
    if (game.phase !== "playing" || !player || player.id !== playerId || game.auction) return;
    if (game.turnPhase !== "awaiting_end") return;
    const city = game.cities[cityId];
    const cityDef = CITIES[cityId];
    if (!city || !cityDef || city.ownerId !== playerId || city.mortgaged || city.developmentLevel > 0) return;
    const amount = Math.round(cityDef.price * 0.5);
    city.mortgaged = true;
    player.money += amount;
    this.addLog(`${player.name} nimmt eine Hypothek auf ${cityDef.name} auf (+€${amount}).`);
  }

  private handleUnmortgage(playerId: string, cityId: string) {
    const game = this.game!;
    const player = this.currentPlayer();
    if (game.phase !== "playing" || !player || player.id !== playerId || game.auction) return;
    if (game.turnPhase !== "awaiting_end") return;
    const city = game.cities[cityId];
    const cityDef = CITIES[cityId];
    if (!city || !cityDef || city.ownerId !== playerId || !city.mortgaged) return;
    const cost = Math.round(cityDef.price * 0.55);
    if (player.money < cost) return;
    player.money -= cost;
    city.mortgaged = false;
    this.addLog(`${player.name} löst die Hypothek auf ${cityDef.name} ab (-€${cost}).`);
  }

  private handleSendChat(playerId: string, text: string) {
    const game = this.game!;
    const player = game.players.find((p) => p.id === playerId);
    const clean = (text || "").trim().slice(0, 200);
    if (!player || !clean) return;
    game.chat.push({ id: crypto.randomUUID(), playerId, playerName: player.name, text: clean, ts: Date.now() });
    game.chat = game.chat.slice(-60);
  }

  private handleRematch(playerId: string) {
    const game = this.game!;
    const player = game.players.find((p) => p.id === playerId);
    if (!player?.isHost || game.phase !== "finished") return;
    for (const p of game.players) {
      p.money = game.settings.startingMoney;
      p.position = 0;
      p.bankrupt = false;
      p.rentCollected = 0;
      p.rentPaid = 0;
    }
    for (const id of Object.keys(game.cities)) game.cities[id] = { id, ownerId: null, developmentLevel: 0, mortgaged: false };
    game.phase = "lobby";
    game.turnPhase = "awaiting_roll";
    game.currentPlayerIndex = 0;
    game.lastDice = null;
    game.trades = [];
    game.auction = null;
    game.winnerId = null;
    game.round = 1;
    game.turnDeadline = null;
    this.addLog("Neue Runde vorbereitet — der Host kann wieder starten.");
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

  private netWorth(player: Player): number {
    const game = this.game!;
    let worth = player.money;
    for (const city of Object.values(game.cities)) {
      if (city.ownerId === player.id) worth += CITIES[city.id].price * (city.mortgaged ? 0.5 : 1);
    }
    return worth;
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

    if (next <= game.currentPlayerIndex) {
      game.round += 1;
      if (game.settings.maxRounds && game.round > game.settings.maxRounds) {
        const ranked = [...active].sort((a, b) => this.netWorth(b) - this.netWorth(a));
        game.phase = "finished";
        game.winnerId = ranked[0]?.id ?? null;
        this.addLog(`Rundenlimit erreicht — ${ranked[0]?.name ?? "Niemand"} gewinnt nach Vermögen!`);
        return;
      }
    }

    game.currentPlayerIndex = next;
    game.turnPhase = "awaiting_roll";
    game.lastDice = null;
    game.turnDeadline = Date.now() + 45000;
  }

  private checkBankruptcy(player: Player) {
    const game = this.game!;
    if (player.money > 0 || player.bankrupt) return;
    player.bankrupt = true;
    for (const city of Object.values(game.cities)) {
      if (city.ownerId === player.id) {
        city.ownerId = null;
        city.developmentLevel = 0;
        city.mortgaged = false;
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

  // Central scheduler: figures out the SOONEST reason this room needs to "wake up" on its own —
  // an auction ending, a bot needing to take its next action, or a human's turn timer expiring —
  // and books exactly one Durable Object alarm for that moment. Called after every state change.
  private scheduleNextAlarm() {
    const game = this.game;
    if (!game) return;
    const candidates: number[] = [];
    if (game.auction) candidates.push(game.auction.endsAt);
    if (game.phase === "playing" && !game.auction) {
      const cp = game.players[game.currentPlayerIndex];
      if (cp && !cp.bankrupt) {
        if (cp.isBot) candidates.push(Date.now() + 1100);
        else if (game.turnDeadline) candidates.push(game.turnDeadline);
      }
    }
    if (candidates.length > 0) this.state.storage.setAlarm(Math.min(...candidates));
  }

  // Called by the platform whenever a scheduled alarm fires — resolves an ended auction, makes a
  // bot's next move, or auto-skips a human who ran out of time. Always re-schedules afterwards.
  async alarm() {
    const stored = await this.state.storage.get<GameState>("game");
    if (!stored) return;
    this.game = stored;
    const game = this.game;

    if (game.auction && Date.now() >= game.auction.endsAt) {
      this.resolveAuction();
    } else if (game.phase === "playing" && !game.auction) {
      const cp = game.players[game.currentPlayerIndex];
      if (cp && !cp.bankrupt) {
        if (cp.isBot) {
          this.performBotTurn(cp);
        } else if (game.turnDeadline && Date.now() >= game.turnDeadline) {
          this.autoAdvanceStuckPlayer(cp);
        }
      }
    }

    this.scheduleNextAlarm();
    await this.persist();
    this.broadcast();
  }

  // Runs a bot's entire turn synchronously by calling the same validated handlers a human's
  // messages would trigger — roll, then a simple buy/skip decision, then an occasional upgrade,
  // then end turn. Stops early if it lands on an auction, which resolves itself via its own alarm.
  private performBotTurn(player: Player) {
    const game = this.game!;
    this.handleRollDice(player.id);
    if (game.auction) return;

    if (game.turnPhase === "awaiting_action") {
      const cityId = BOARD_ORDER[player.position];
      const cityDef = CITIES[cityId];
      if (cityDef && player.money - cityDef.price >= 300) this.handleBuyProperty(player.id);
      else this.handleSkipPurchase(player.id);
      if (game.auction) return;
    }

    if (game.turnPhase === "awaiting_end") {
      const owned = Object.values(game.cities).filter((c) => c.ownerId === player.id && c.developmentLevel < 4 && !c.mortgaged);
      if (owned.length > 0 && Math.random() < 0.3) {
        const target = owned[Math.floor(Math.random() * owned.length)];
        const cost = Math.round(CITIES[target.id].price * 0.5 * (target.developmentLevel + 1));
        if (player.money - cost >= 500) this.handleUpgradeProperty(player.id, target.id);
      }
      this.handleEndTurn(player.id);
    }
  }

  // A human who hasn't acted within the turn timer gets gracefully skipped from wherever they
  // are stuck, so one AFK player never blocks the whole room.
  private autoAdvanceStuckPlayer(player: Player) {
    const game = this.game!;
    this.addLog(`${player.name} war zu langsam und wird übersprungen.`);
    if (game.turnPhase === "awaiting_roll") {
      this.advanceTurn();
    } else if (game.turnPhase === "awaiting_action") {
      this.handleSkipPurchase(player.id);
      if (this.game!.turnPhase === "awaiting_end" && !this.game!.auction) this.handleEndTurn(player.id);
    } else if (game.turnPhase === "awaiting_end") {
      this.handleEndTurn(player.id);
    }
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
    const game = this.game!;
    if (!game.settings.eventsEnabled) return;
    if (Math.random() >= 0.2) return; // ~20% chance per landing
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
        const owned = Object.values(game.cities).filter((c) => c.ownerId === player.id && c.developmentLevel < 4);
        if (owned.length === 0) {
          player.money += 150;
          break;
        }
        const target = owned[Math.floor(Math.random() * owned.length)];
        target.developmentLevel += 1;
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
