// @ts-ignore - topojson-client ships no bundled TypeScript declarations
import { REGION_DEFS, CONTINENT_BONUS, matchRegions, computeRegionAdjacency, regionDefById } from "./conquest-regions";
// @ts-ignore - no type declarations shipped for this JSON import
import worldAtlasTopology from "world-atlas/countries-110m.json";

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
}

type ClientMessage =
  | { type: "join"; name: string; color: string }
  | { type: "start_game" }
  | { type: "roll_dice" }
  | { type: "buy_property" }
  | { type: "skip_purchase" }
  | { type: "end_turn" }
  | { type: "propose_trade"; toId: string; offerCities: string[]; offerMoney: number; requestCities: string[]; requestMoney: number }
  | { type: "respond_trade"; tradeId: string; accept: boolean }
  | { type: "cancel_trade"; tradeId: string }
  | { type: "place_bid"; amount: number }
  | { type: "vote_skip_disconnected" };

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
  CONQUEST_ROOM: DurableObjectNamespace;
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
          case "propose_trade": this.handleProposeTrade(playerId, msg); break;
          case "respond_trade": this.handleRespondTrade(playerId, msg.tradeId, msg.accept); break;
          case "cancel_trade": this.handleCancelTrade(playerId, msg.tradeId); break;
          case "place_bid": this.handlePlaceBid(playerId, msg.amount); break;
          case "vote_skip_disconnected": this.handleSkipDisconnected(playerId); break;
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
        rentCollected: 0,
        rentPaid: 0,
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
    const cityDef = CITIES[cityId];
    const city = this.game!.cities[cityId];
    const multiplier = [1, 2, 3.5, 6, 10][city.developmentLevel] ?? 1;
    return Math.round(cityDef.baseRent * multiplier);
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
    if (!stored || !stored.auction) return;
    this.game = stored;
    this.resolveAuction();
    await this.persist();
    this.broadcast();
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

/* ======================= Conquest mode: types ======================= */

interface ConquestPlayer {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  connected: boolean;
  eliminated: boolean;
}

interface ConquestRegionState {
  ownerId: string | null;
  troops: number;
}

interface ConquestCombatResult {
  attackerRegion: string;
  defenderRegion: string;
  attackerDice: number[];
  defenderDice: number[];
  attackerLosses: number;
  defenderLosses: number;
  captured: boolean;
}

type ConquestTurnPhase = "reinforce" | "attack" | "fortify";

interface ConquestGameState {
  gameId: string;
  phase: "lobby" | "playing" | "finished";
  turnPhase: ConquestTurnPhase;
  players: ConquestPlayer[];
  currentPlayerIndex: number;
  regions: Record<string, ConquestRegionState>;
  regionAdjacency: Record<string, string[]>;
  reinforcementsRemaining: number;
  fortifyUsed: boolean;
  lastCombat: ConquestCombatResult | null;
  log: { id: string; text: string; ts: number }[];
  winnerId: string | null;
  round: number;
}

type ConquestClientMessage =
  | { type: "join"; name: string; color: string }
  | { type: "start_game" }
  | { type: "place_reinforcement"; regionId: string }
  | { type: "attack"; fromRegion: string; toRegion: string }
  | { type: "fortify"; fromRegion: string; toRegion: string; amount: number }
  | { type: "advance_phase" };

type ConquestServerMessage =
  | { type: "state"; state: ConquestGameState; you: string }
  | { type: "error"; message: string };

interface ConquestSession {
  ws: WebSocket;
  playerId: string;
}

/* ======================= Conquest mode: Durable Object ======================= */

export class ConquestRoom {
  state: DurableObjectState;
  env: Env;
  sessions: ConquestSession[] = [];
  game: ConquestGameState | null = null;

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

  private async loadGame(gameId: string): Promise<ConquestGameState> {
    if (this.game) return this.game;
    const stored = await this.state.storage.get<ConquestGameState>("game");
    if (stored) {
      this.game = stored;
      return stored;
    }

    // World-atlas ships pre-simplified real country borders — matched here against our curated
    // 43-region list so both the initial region set and the adjacency graph reflect real geography.
    const topology = worldAtlasTopology as any;
    const match = matchRegions(topology);
    const adjacency = computeRegionAdjacency(topology, match);
    const regions: Record<string, ConquestRegionState> = {};
    for (const id of match.matchedRegionIds) regions[id] = { ownerId: null, troops: 0 };

    const fresh: ConquestGameState = {
      gameId,
      phase: "lobby",
      turnPhase: "reinforce",
      players: [],
      currentPlayerIndex: 0,
      regions,
      regionAdjacency: adjacency,
      reinforcementsRemaining: 0,
      fortifyUsed: false,
      lastCombat: null,
      log: [],
      winnerId: null,
      round: 1,
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
        const msg: ConquestClientMessage = JSON.parse(event.data as string);
        if (msg.type === "join") {
          playerId = await this.handleJoin(ws, msg.name, msg.color);
          return;
        }
        if (!playerId || !this.game) return;
        switch (msg.type) {
          case "start_game": this.handleStartGame(playerId); break;
          case "place_reinforcement": this.handlePlaceReinforcement(playerId, msg.regionId); break;
          case "attack": this.handleAttack(playerId, msg.fromRegion, msg.toRegion); break;
          case "fortify": this.handleFortify(playerId, msg.fromRegion, msg.toRegion, msg.amount); break;
          case "advance_phase": this.handleAdvancePhase(playerId); break;
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
      const player: ConquestPlayer = {
        id: crypto.randomUUID(),
        name: cleanName,
        color: freeColor,
        isHost: game.players.length === 0,
        connected: true,
        eliminated: false,
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

  private currentPlayer(): ConquestPlayer | undefined {
    return this.game!.players[this.game!.currentPlayerIndex];
  }

  private ownedRegions(playerId: string): string[] {
    const game = this.game!;
    return Object.entries(game.regions)
      .filter(([, r]) => r.ownerId === playerId)
      .map(([id]) => id);
  }

  private handleStartGame(playerId: string) {
    const game = this.game!;
    const player = game.players.find((p) => p.id === playerId);
    if (!player?.isHost || game.phase !== "lobby") return;
    if (game.players.length < 2) return;
    const regionIds = Object.keys(game.regions);
    if (regionIds.length < game.players.length) {
      this.addLog("Nicht genug Territorien für so viele Spieler.");
      return;
    }

    // Shuffle regions and deal them out round-robin so starting positions are randomized and fair.
    const shuffled = [...regionIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.forEach((regionId, i) => {
      const owner = game.players[i % game.players.length];
      game.regions[regionId] = { ownerId: owner.id, troops: 3 };
    });

    game.phase = "playing";
    game.currentPlayerIndex = 0;
    game.turnPhase = "reinforce";
    game.reinforcementsRemaining = this.computeReinforcements(game.players[0].id);
    game.round = 1;
    this.addLog("Die Eroberung beginnt! Jeder Spieler startet mit mehreren Territorien.");
  }

  private computeReinforcements(playerId: string): number {
    const game = this.game!;
    const owned = this.ownedRegions(playerId);
    let total = Math.max(3, Math.floor(owned.length / 3));

    const byContinent = new Map<string, string[]>();
    for (const def of REGION_DEFS) {
      if (!game.regions[def.id]) continue; // unmatched region, not in play
      if (!byContinent.has(def.continent)) byContinent.set(def.continent, []);
      byContinent.get(def.continent)!.push(def.id);
    }
    for (const [continent, ids] of byContinent) {
      if (ids.every((id) => game.regions[id].ownerId === playerId)) {
        total += CONTINENT_BONUS[continent] ?? 0;
      }
    }
    return total;
  }

  private handlePlaceReinforcement(playerId: string, regionId: string) {
    const game = this.game!;
    const player = this.currentPlayer();
    if (game.phase !== "playing" || !player || player.id !== playerId) return;
    if (game.turnPhase !== "reinforce" || game.reinforcementsRemaining <= 0) return;
    const region = game.regions[regionId];
    if (!region || region.ownerId !== playerId) return;

    region.troops += 1;
    game.reinforcementsRemaining -= 1;
    const def = regionDefById(regionId);
    this.addLog(`${player.name} verstärkt ${def?.name ?? regionId} (+1 Truppe).`);
  }

  private handleAttack(playerId: string, fromRegion: string, toRegion: string) {
    const game = this.game!;
    const player = this.currentPlayer();
    if (game.phase !== "playing" || !player || player.id !== playerId) return;
    if (game.turnPhase !== "attack") return;

    const from = game.regions[fromRegion];
    const to = game.regions[toRegion];
    if (!from || !to || from.ownerId !== playerId || to.ownerId === playerId) return;
    if (!(game.regionAdjacency[fromRegion] ?? []).includes(toRegion)) return;
    if (from.troops < 2) return;

    const attackerDiceCount = Math.min(3, from.troops - 1);
    const defenderDiceCount = Math.min(2, to.troops);
    const attackerDice = Array.from({ length: attackerDiceCount }, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => b - a);
    const defenderDice = Array.from({ length: defenderDiceCount }, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => b - a);

    let attackerLosses = 0;
    let defenderLosses = 0;
    const rounds = Math.min(attackerDice.length, defenderDice.length);
    for (let i = 0; i < rounds; i++) {
      if (attackerDice[i] > defenderDice[i]) defenderLosses++;
      else attackerLosses++; // ties go to the defender, classic Risk rule
    }

    from.troops -= attackerLosses;
    to.troops -= defenderLosses;

    const fromDef = regionDefById(fromRegion);
    const toDef = regionDefById(toRegion);
    let captured = false;

    if (to.troops <= 0) {
      captured = true;
      const defenderId = to.ownerId;
      const moveIn = Math.max(1, Math.min(attackerDiceCount, from.troops - 1));
      from.troops -= moveIn;
      to.ownerId = playerId;
      to.troops = moveIn;
      this.addLog(`${player.name} erobert ${toDef?.name ?? toRegion} von ${fromDef?.name ?? fromRegion}!`);

      if (defenderId) {
        const stillOwnsAny = Object.values(game.regions).some((r) => r.ownerId === defenderId);
        if (!stillOwnsAny) {
          const defenderPlayer = game.players.find((p) => p.id === defenderId);
          if (defenderPlayer) {
            defenderPlayer.eliminated = true;
            this.addLog(`${defenderPlayer.name} wurde eliminiert!`);
          }
        }
      }
    } else {
      this.addLog(
        `${player.name} greift ${toDef?.name ?? toRegion} von ${fromDef?.name ?? fromRegion} an: ` +
          `Würfel ${attackerDice.join(",")} vs. ${defenderDice.join(",")} — ` +
          `Angreifer verliert ${attackerLosses}, Verteidiger verliert ${defenderLosses}.`
      );
    }

    game.lastCombat = { attackerRegion: fromRegion, defenderRegion: toRegion, attackerDice, defenderDice, attackerLosses, defenderLosses, captured };
    this.checkWinCondition();
  }

  private handleFortify(playerId: string, fromRegion: string, toRegion: string, amount: number) {
    const game = this.game!;
    const player = this.currentPlayer();
    if (game.phase !== "playing" || !player || player.id !== playerId) return;
    if (game.turnPhase !== "fortify" || game.fortifyUsed) return;

    const from = game.regions[fromRegion];
    const to = game.regions[toRegion];
    if (!from || !to || from.ownerId !== playerId || to.ownerId !== playerId) return;
    if (!(game.regionAdjacency[fromRegion] ?? []).includes(toRegion)) return;
    if (!Number.isFinite(amount) || amount < 1 || amount >= from.troops) return;

    from.troops -= amount;
    to.troops += amount;
    game.fortifyUsed = true;
    const fromDef = regionDefById(fromRegion);
    const toDef = regionDefById(toRegion);
    this.addLog(`${player.name} verlegt ${amount} Truppen von ${fromDef?.name} nach ${toDef?.name}.`);
  }

  private handleAdvancePhase(playerId: string) {
    const game = this.game!;
    const player = this.currentPlayer();
    if (game.phase !== "playing" || !player || player.id !== playerId) return;

    if (game.turnPhase === "reinforce") {
      if (game.reinforcementsRemaining > 0) return;
      game.turnPhase = "attack";
      return;
    }
    if (game.turnPhase === "attack") {
      game.turnPhase = "fortify";
      return;
    }
    if (game.turnPhase === "fortify") {
      this.endTurn();
    }
  }

  private endTurn() {
    const game = this.game!;
    const active = game.players.filter((p) => !p.eliminated);
    if (active.length <= 1) {
      game.phase = "finished";
      game.winnerId = active[0]?.id ?? null;
      this.addLog(`${active[0]?.name ?? "Niemand"} hat die Welt erobert!`);
      return;
    }

    let next = game.currentPlayerIndex;
    do {
      next = (next + 1) % game.players.length;
    } while (game.players[next].eliminated);

    if (next <= game.currentPlayerIndex) game.round += 1;
    game.currentPlayerIndex = next;
    game.turnPhase = "reinforce";
    game.fortifyUsed = false;
    game.lastCombat = null;
    game.reinforcementsRemaining = this.computeReinforcements(game.players[next].id);
  }

  private checkWinCondition() {
    const game = this.game!;
    const active = game.players.filter((p) => !p.eliminated);
    if (active.length <= 1) {
      game.phase = "finished";
      game.winnerId = active[0]?.id ?? null;
      this.addLog(`${active[0]?.name ?? "Niemand"} hat die Welt erobert!`);
    }
  }

  private sendTo(ws: WebSocket, msg: ConquestServerMessage) {
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
    if (url.pathname === "/api/conquest/create" && request.method === "POST") {
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

    const conquestMatch = url.pathname.match(/^\/conquest-room\/([A-Z0-9]{4,10})\/ws$/i);
    if (conquestMatch) {
      const gameId = conquestMatch[1].toUpperCase();
      const id = env.CONQUEST_ROOM.idFromName(gameId);
      const stub = env.CONQUEST_ROOM.get(id);
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};
