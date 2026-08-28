import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { CITIES, BOARD_ORDER, PLAYER_COLORS } from "./cities";
import { Globe } from "./globe";
import { sounds } from "./sound";

/* ======================= Shared types ======================= */

type GamePhase = "lobby" | "playing" | "finished";
type TurnPhase = "awaiting_roll" | "awaiting_action" | "awaiting_end";

const AVATARS = ["🦁", "🐯", "🦅", "🐺", "🦊", "🐻", "🐸", "🦉", "🐳", "🐉"];

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
}

interface CityState {
  id: string;
  ownerId: string | null;
  developmentLevel: number;
  mortgaged: boolean;
}

interface LogEntry {
  id: string;
  text: string;
  ts: number;
}

export interface TradeOffer {
  id: string;
  fromId: string;
  toId: string;
  offerCities: string[];
  offerMoney: number;
  requestCities: string[];
  requestMoney: number;
  status: "pending" | "accepted" | "declined" | "cancelled";
}

export interface AuctionState {
  cityId: string;
  currentBid: number;
  currentBidderId: string | null;
  endsAt: number;
  triggeredByPlayerId: string;
}

export interface RoomSettings {
  startingMoney: number;
  maxRounds: number | null;
  eventsEnabled: boolean;
}

export interface ChatMessage {
  id: string;
  playerId: string;
  playerName: string;
  text: string;
  ts: number;
}

// Exported so globe.tsx can type its `game` prop without duplicating this shape.
export interface GameState {
  gameId: string;
  phase: GamePhase;
  turnPhase: TurnPhase;
  players: Player[];
  currentPlayerIndex: number;
  cities: Record<string, CityState>;
  lastDice: [number, number] | null;
  log: LogEntry[];
  startingMoney: number;
  winnerId: string | null;
  trades: TradeOffer[];
  auction: AuctionState | null;
  settings: RoomSettings;
  chat: ChatMessage[];
  round: number;
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
  | { type: "rematch" };

type ServerMessage =
  | { type: "state"; state: GameState; you: string }
  | { type: "error"; message: string };

/* ======================= WebSocket hook ======================= */

function wsUrl(gameId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/room/${gameId}/ws`;
}

function useGameSocket(gameId: string | null, name: string, color: string, avatar: string) {
  const [state, setState] = useState<GameState | null>(null);
  const [youId, setYouId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<ClientMessage[]>([]);

  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      const ws = new WebSocket(wsUrl(gameId as string));
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        setConnected(true);
        setError(null);
        ws.send(JSON.stringify({ type: "join", name, color, avatar } satisfies ClientMessage));
        for (const msg of queueRef.current) ws.send(JSON.stringify(msg));
        queueRef.current = [];
      });

      ws.addEventListener("message", (event) => {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === "state") {
          setState(msg.state);
          setYouId(msg.you);
        } else if (msg.type === "error") {
          setError(msg.message);
          sounds.error();
        }
      });

      ws.addEventListener("close", () => {
        setConnected(false);
        if (!cancelled) retryTimer = setTimeout(connect, 1500);
      });

      ws.addEventListener("error", () => ws.close());
    }

    connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else queueRef.current.push(msg);
  }, []);

  return { state, youId, connected, error, send };
}

/* ======================= RouteTrack ======================= */

// A classic "board strip" showing every city in travel order, so a roll of e.g. 3
// is easy to reason about: count 3 pills forward from your current highlighted pill.
function RouteTrack({ game }: { game: GameState }) {
  return (
    <div className="route-track card">
      <div className="route-track-inner">
        {BOARD_ORDER.map((cityId, index) => {
          const city = CITIES[cityId];
          const playersHere = game.players.filter((p) => p.position === index && !p.bankrupt);
          const owner = game.players.find((p) => p.id === game.cities[cityId]?.ownerId);
          return (
            <div
              key={cityId}
              className="route-pill"
              style={{ borderColor: owner ? owner.color : undefined, background: owner ? `${owner.color}22` : undefined }}
            >
              <span className="route-pill-index">{index + 1}</span>
              <span className="route-pill-name">{city.name}</span>
              {playersHere.length > 0 && (
                <span className="route-pill-tokens">
                  {playersHere.map((p) => (
                    <span key={p.id} className="route-token" style={{ background: p.color }} title={p.name} />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ======================= TradePanel ======================= */

function TradePanel({
  game,
  youId,
  onClose,
  onPropose,
  onRespond,
  onCancel,
}: {
  game: GameState;
  youId: string;
  onClose: () => void;
  onPropose: (msg: { toId: string; offerCities: string[]; offerMoney: number; requestCities: string[]; requestMoney: number }) => void;
  onRespond: (tradeId: string, accept: boolean) => void;
  onCancel: (tradeId: string) => void;
}) {
  const others = game.players.filter((p) => p.id !== youId && !p.bankrupt);
  const [toId, setToId] = useState(others[0]?.id ?? "");
  const [offerCities, setOfferCities] = useState<Set<string>>(new Set());
  const [requestCities, setRequestCities] = useState<Set<string>>(new Set());
  const [offerMoney, setOfferMoney] = useState(0);
  const [requestMoney, setRequestMoney] = useState(0);

  const you = game.players.find((p) => p.id === youId);
  const partner = game.players.find((p) => p.id === toId);
  const yourCities = Object.values(game.cities).filter((c) => c.ownerId === youId);
  const theirCities = Object.values(game.cities).filter((c) => c.ownerId === toId);

  const pending = game.trades.filter((t) => t.status === "pending" && (t.toId === youId || t.fromId === youId));

  function toggle(set: Set<string>, setFn: (s: Set<string>) => void, id: string) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setFn(next);
  }

  return (
    <div className="deed-overlay" onClick={onClose}>
      <div className="deed card trade-card" onClick={(e) => e.stopPropagation()}>
        <span className="deed-eyebrow">Handel</span>
        <h2 className="display" style={{ marginTop: 0 }}>Angebot erstellen</h2>

        {others.length === 0 ? (
          <p className="lobby-hint">Keine anderen Spieler zum Handeln verfügbar.</p>
        ) : (
          <>
            <label className="lobby-label">Handelspartner
              <select className="lobby-input" value={toId} onChange={(e) => { setToId(e.target.value); setRequestCities(new Set()); }}>
                {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>

            <div className="trade-columns">
              <div className="trade-column">
                <span className="deed-eyebrow">Du bietest</span>
                <div className="trade-city-list">
                  {yourCities.length === 0 && <span className="lobby-hint">Keine Grundstücke.</span>}
                  {yourCities.map((c) => (
                    <label key={c.id} className="trade-city-item">
                      <input type="checkbox" checked={offerCities.has(c.id)} onChange={() => toggle(offerCities, setOfferCities, c.id)} />
                      {CITIES[c.id].name}
                    </label>
                  ))}
                </div>
                <label className="lobby-label">Geld
                  <input className="lobby-input mono" type="number" min={0} max={you?.money ?? 0} value={offerMoney} onChange={(e) => setOfferMoney(Math.max(0, Number(e.target.value)))} />
                </label>
              </div>

              <div className="trade-column">
                <span className="deed-eyebrow">Du willst</span>
                <div className="trade-city-list">
                  {theirCities.length === 0 && <span className="lobby-hint">Keine Grundstücke.</span>}
                  {theirCities.map((c) => (
                    <label key={c.id} className="trade-city-item">
                      <input type="checkbox" checked={requestCities.has(c.id)} onChange={() => toggle(requestCities, setRequestCities, c.id)} />
                      {CITIES[c.id].name}
                    </label>
                  ))}
                </div>
                <label className="lobby-label">Geld
                  <input className="lobby-input mono" type="number" min={0} max={partner?.money ?? 0} value={requestMoney} onChange={(e) => setRequestMoney(Math.max(0, Number(e.target.value)))} />
                </label>
              </div>
            </div>

            <div className="deed-actions">
              <button className="btn" onClick={onClose}>Schließen</button>
              <button
                className="btn btn-primary"
                disabled={!toId}
                onClick={() => {
                  onPropose({ toId, offerCities: [...offerCities], offerMoney, requestCities: [...requestCities], requestMoney });
                  setOfferCities(new Set());
                  setRequestCities(new Set());
                  setOfferMoney(0);
                  setRequestMoney(0);
                }}
              >
                Angebot senden
              </button>
            </div>
          </>
        )}

        {pending.length > 0 && (
          <div className="trade-pending">
            <span className="deed-eyebrow">Offene Angebote</span>
            {pending.map((t) => {
              const from = game.players.find((p) => p.id === t.fromId);
              const to = game.players.find((p) => p.id === t.toId);
              const incoming = t.toId === youId;
              return (
                <div key={t.id} className="trade-pending-item">
                  <p>
                    <strong>{from?.name}</strong> → <strong>{to?.name}</strong>:{" "}
                    {t.offerCities.map((c) => CITIES[c]?.name).join(", ") || "—"}
                    {t.offerMoney > 0 && ` + €${t.offerMoney.toLocaleString("de-DE")}`}
                    {" ⇄ "}
                    {t.requestCities.map((c) => CITIES[c]?.name).join(", ") || "—"}
                    {t.requestMoney > 0 && ` + €${t.requestMoney.toLocaleString("de-DE")}`}
                  </p>
                  {incoming ? (
                    <div className="deed-actions">
                      <button className="btn" onClick={() => onRespond(t.id, false)}>Ablehnen</button>
                      <button className="btn btn-primary" onClick={() => onRespond(t.id, true)}>Annehmen</button>
                    </div>
                  ) : (
                    <button className="btn" onClick={() => onCancel(t.id)}>Zurückziehen</button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ======================= LedgerBar ======================= */

function LedgerBar({ game, youId, onRoll, onEndTurn, onSkipDisconnected, onOpenBuild }: { game: GameState; youId: string; onRoll: () => void; onEndTurn: () => void; onSkipDisconnected: () => void; onOpenBuild: () => void }) {
  const current = game.players[game.currentPlayerIndex];
  const isYourTurn = current?.id === youId;

  return (
    <div className="ledger-bar card">
      <div className="ledger-players">
        {game.players.map((p) => (
          <div key={p.id} className={`ledger-player${p.id === current?.id ? " is-current" : ""}${p.bankrupt ? " is-bankrupt" : ""}`}>
            <span className="ledger-avatar">{p.avatar}</span>
            <span className="ledger-swatch" style={{ background: p.color }} />
            <span className="ledger-name">{p.name}{!p.connected && " (getrennt)"}</span>
            <span className="ledger-money mono">€{p.money.toLocaleString("de-DE")}</span>
          </div>
        ))}
      </div>
      <div className="ledger-action">
        {game.lastDice && (
          <div className="dice-tray" aria-label={`Würfel: ${game.lastDice[0]} und ${game.lastDice[1]}`}>
            <span className="die">{game.lastDice[0]}</span>
            <span className="die">{game.lastDice[1]}</span>
          </div>
        )}
        {isYourTurn && game.turnPhase === "awaiting_roll" && <button className="btn btn-primary" onClick={onRoll}>Würfeln</button>}
        {isYourTurn && game.turnPhase === "awaiting_end" && <button className="btn" onClick={onOpenBuild}>Ausbauen / Hypothek</button>}
        {isYourTurn && game.turnPhase === "awaiting_end" && <button className="btn btn-primary" onClick={onEndTurn}>Zug beenden</button>}
        {!isYourTurn && game.phase === "playing" && !current?.connected && (
          <button className="btn" onClick={onSkipDisconnected}>Zug überspringen (getrennt)</button>
        )}
        {!isYourTurn && game.phase === "playing" && current?.connected && <span className="ledger-waiting">Warte auf {current?.name}…</span>}
      </div>
    </div>
  );
}

/* ======================= AuctionPanel ======================= */

function AuctionPanel({ game, youId, onBid }: { game: GameState; youId: string; onBid: (amount: number) => void }) {
  const auction = game.auction!;
  const city = CITIES[auction.cityId];
  const you = game.players.find((p) => p.id === youId);
  const bidder = game.players.find((p) => p.id === auction.currentBidderId);
  const [now, setNow] = useState(Date.now());
  const [bidInput, setBidInput] = useState(auction.currentBid + 50);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setBidInput(auction.currentBid + 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auction.currentBid]);

  const remainingMs = Math.max(0, auction.endsAt - now);
  const seconds = Math.ceil(remainingMs / 1000);
  const youAreBidder = bidder?.id === youId;
  const canBid = !!you && bidInput > auction.currentBid && bidInput <= you.money;

  return (
    <div className="deed-overlay">
      <div className="deed card">
        <span className="deed-eyebrow">Auktion — noch {seconds}s</span>
        <h2 className="display" style={{ marginTop: 0 }}>{city.name}</h2>
        <span className="deed-country">{city.country}</span>
        <div className="deed-row"><span>Aktuelles Gebot</span><span className="mono">€{auction.currentBid.toLocaleString("de-DE")}</span></div>
        <div className="deed-row"><span>Höchstbietender</span><span>{bidder ? `${bidder.name}${youAreBidder ? " (du)" : ""}` : "Niemand"}</span></div>
        <label className="lobby-label">Dein Gebot
          <input
            className="lobby-input mono"
            type="number"
            min={auction.currentBid + 1}
            max={you?.money ?? 0}
            value={bidInput}
            onChange={(e) => setBidInput(Number(e.target.value))}
          />
        </label>
        <div className="deed-actions">
          <button className="btn btn-primary" disabled={!canBid} onClick={() => onBid(bidInput)}>Bieten</button>
        </div>
        {you && bidInput > you.money && <p className="deed-warning">Nicht genug Kapital für dieses Gebot.</p>}
      </div>
    </div>
  );
}

/* ======================= PropertyCard ======================= */

function PropertyCard({ cityId, game, onBuy, onSkip }: { cityId: string; game: GameState; onBuy: () => void; onSkip: () => void }) {
  const city = CITIES[cityId];
  const current = game.players[game.currentPlayerIndex];
  if (!city || !current) return null;
  const affordable = current.money >= city.price;

  return (
    <div className="deed-overlay">
      <div className="deed card">
        <div className="deed-header">
          <span className="deed-eyebrow">Unbebautes Grundstück</span>
          <h2 className="display">{city.name}</h2>
          <span className="deed-country">{city.country}</span>
        </div>
        <div className="deed-row"><span>Kaufpreis</span><span className="mono">€{city.price.toLocaleString("de-DE")}</span></div>
        <div className="deed-row"><span>Grundmiete</span><span className="mono">€{city.baseRent.toLocaleString("de-DE")}</span></div>
        <div className="deed-row"><span>Dein Kontostand</span><span className="mono">€{current.money.toLocaleString("de-DE")}</span></div>
        <div className="deed-actions">
          <button className="btn" onClick={onSkip}>Nicht kaufen</button>
          <button className="btn btn-primary" disabled={!affordable} onClick={onBuy}>Kaufen</button>
        </div>
        {!affordable && <p className="deed-warning">Nicht genug Kapital für dieses Grundstück.</p>}
      </div>
    </div>
  );
}

/* ======================= LogPanel ======================= */

/* ======================= BuildPanel ======================= */

function BuildPanel({
  game,
  youId,
  onClose,
  onUpgrade,
  onMortgage,
  onUnmortgage,
}: {
  game: GameState;
  youId: string;
  onClose: () => void;
  onUpgrade: (cityId: string) => void;
  onMortgage: (cityId: string) => void;
  onUnmortgage: (cityId: string) => void;
}) {
  const you = game.players.find((p) => p.id === youId);
  const owned = Object.values(game.cities).filter((c) => c.ownerId === youId);

  return (
    <div className="deed-overlay" onClick={onClose}>
      <div className="deed card trade-card" onClick={(e) => e.stopPropagation()}>
        <span className="deed-eyebrow">Verwaltung</span>
        <h2 className="display" style={{ marginTop: 0 }}>Ausbauen & Hypotheken</h2>
        <p className="lobby-hint">Kontostand: €{you?.money.toLocaleString("de-DE")}</p>

        {owned.length === 0 && <p className="lobby-hint">Du besitzt noch keine Grundstücke.</p>}

        <div className="build-list">
          {owned.map((c) => {
            const def = CITIES[c.id];
            const upgradeCost = Math.round(def.price * 0.5 * (c.developmentLevel + 1));
            const mortgageValue = Math.round(def.price * 0.5);
            const unmortgageCost = Math.round(def.price * 0.55);
            return (
              <div key={c.id} className="build-item">
                <div className="build-item-head">
                  <strong>{def.name}</strong>
                  <span className="mono">Stufe {c.developmentLevel}/4{c.mortgaged && " · verpfändet"}</span>
                </div>
                <div className="build-item-actions">
                  {!c.mortgaged && (
                    <button className="btn" disabled={c.developmentLevel >= 4 || (you?.money ?? 0) < upgradeCost} onClick={() => onUpgrade(c.id)}>
                      Ausbauen (€{upgradeCost.toLocaleString("de-DE")})
                    </button>
                  )}
                  {!c.mortgaged && c.developmentLevel === 0 && (
                    <button className="btn" onClick={() => onMortgage(c.id)}>Verpfänden (+€{mortgageValue.toLocaleString("de-DE")})</button>
                  )}
                  {c.mortgaged && (
                    <button className="btn btn-primary" disabled={(you?.money ?? 0) < unmortgageCost} onClick={() => onUnmortgage(c.id)}>
                      Auslösen (€{unmortgageCost.toLocaleString("de-DE")})
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="deed-actions">
          <button className="btn" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}

/* ======================= ChatPanel ======================= */

function ChatPanel({ game, youId, onSend }: { game: GameState; youId: string; onSend: (text: string) => void }) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [game.chat.length]);

  function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  }

  return (
    <div className="chat-panel card">
      <span className="deed-eyebrow">Chat</span>
      <ul className="chat-list" ref={listRef}>
        {game.chat.length === 0 && <li className="log-empty">Noch keine Nachrichten.</li>}
        {game.chat.map((m) => (
          <li key={m.id} className={m.playerId === youId ? "chat-own" : ""}>
            <strong>{m.playerName}:</strong> {m.text}
          </li>
        ))}
      </ul>
      <div className="chat-input-row">
        <input
          className="lobby-input"
          value={text}
          maxLength={200}
          placeholder="Nachricht…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <button className="btn" onClick={submit}>Senden</button>
      </div>
    </div>
  );
}

/* ======================= LogPanel ======================= */

function LogPanel({ game }: { game: GameState }) {
  return (
    <div className="log-panel card">
      <span className="deed-eyebrow">Ereignisprotokoll</span>
      <ul className="log-list">
        {game.log.length === 0 && <li className="log-empty">Noch keine Ereignisse.</li>}
        {game.log.map((entry) => <li key={entry.id}>{entry.text}</li>)}
      </ul>
    </div>
  );
}

/* ======================= Lobby ======================= */

function Lobby({
  onEnterRoom,
  game,
  youId,
  connected,
  onStartGame,
  onConfigureRoom,
}: {
  onEnterRoom: (id: string, name: string, color: string, avatar: string) => void;
  game: GameState | null;
  youId: string | null;
  connected: boolean;
  onStartGame: () => void;
  onConfigureRoom: (settings: RoomSettings) => void;
}) {
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [name, setName] = useState("");
  const [color, setColor] = useState(PLAYER_COLORS[0]);
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [joinCode, setJoinCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  if (game) {
    const you = game.players.find((p) => p.id === youId);
    return (
      <div className="lobby-shell">
        <div className="lobby-card card">
          <span className="deed-eyebrow">Wartelobby</span>
          <h1 className="display">Raum {game.gameId}</h1>
          <p className="lobby-hint">Teile diesen Code, damit andere beitreten können.</p>
          <ul className="lobby-players">
            {game.players.map((p) => (
              <li key={p.id}>
                <span className="ledger-avatar">{p.avatar}</span>
                <span className="ledger-swatch" style={{ background: p.color }} />
                {p.name} {p.isHost && <span className="lobby-host-tag">Host</span>}
              </li>
            ))}
          </ul>

          {you?.isHost && (
            <div className="room-settings">
              <span className="deed-eyebrow">Spieleinstellungen</span>
              <label className="lobby-label">Startkapital (€)
                <input
                  className="lobby-input mono"
                  type="number"
                  min={1000}
                  max={50000}
                  step={500}
                  value={game.settings.startingMoney}
                  onChange={(e) => onConfigureRoom({ ...game.settings, startingMoney: Number(e.target.value) })}
                />
              </label>
              <label className="lobby-label">Rundenlimit (leer = kein Limit)
                <input
                  className="lobby-input mono"
                  type="number"
                  min={1}
                  max={200}
                  placeholder="kein Limit"
                  value={game.settings.maxRounds ?? ""}
                  onChange={(e) => onConfigureRoom({ ...game.settings, maxRounds: e.target.value ? Number(e.target.value) : null })}
                />
              </label>
              <label className="lobby-checkbox">
                <input
                  type="checkbox"
                  checked={game.settings.eventsEnabled}
                  onChange={(e) => onConfigureRoom({ ...game.settings, eventsEnabled: e.target.checked })}
                />
                Zufallsereignisse aktiv
              </label>
            </div>
          )}
          {!you?.isHost && (
            <p className="lobby-hint">
              Startkapital €{game.settings.startingMoney.toLocaleString("de-DE")} ·{" "}
              {game.settings.maxRounds ? `Limit ${game.settings.maxRounds} Runden` : "kein Rundenlimit"} ·{" "}
              Ereignisse {game.settings.eventsEnabled ? "an" : "aus"}
            </p>
          )}

          {you?.isHost ? (
            <button className="btn btn-primary" disabled={game.players.length < 2} onClick={onStartGame}>
              {game.players.length < 2 ? "Warte auf weitere Spieler…" : "Spiel starten"}
            </button>
          ) : <p className="lobby-hint">Warte, bis der Host das Spiel startet…</p>}
          {!connected && <p className="deed-warning">Verbindung wird aufgebaut…</p>}
        </div>
      </div>
    );
  }

  if (mode === "choose") {
    return (
      <div className="lobby-shell">
        <div className="lobby-card card hero-card">
          <div className="hero-badge">🌍</div>
          <span className="deed-eyebrow">World Empire</span>
          <h1 className="display hero-title">Errichte dein globales Imperium</h1>
          <p className="lobby-hint">Kaufe Städte rund um die Welt, kassiere Miete und ruiniere die Konkurrenz — live mit Freunden auf einem echten 3D-Globus.</p>
          <ul className="hero-features">
            <li>🌐 Echter 3D-Globus mit realen Ländergrenzen</li>
            <li>💰 Handel, Auktionen & Zufallsereignisse</li>
            <li>⚡ Echtzeit-Multiplayer, kein Download nötig</li>
          </ul>
          <div className="lobby-buttons">
            <button className="btn btn-primary" onClick={() => setMode("create")}>Spiel erstellen</button>
            <button className="btn" onClick={() => setMode("join")}>Spiel beitreten</button>
          </div>
        </div>
      </div>
    );
  }

  const nameColorFields = (
    <>
      <label className="lobby-label">Dein Name
        <input className="lobby-input" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} placeholder="z. B. Nik" />
      </label>
      <div className="lobby-label">Avatar
        <div className="avatar-picker">
          {AVATARS.map((a) => (
            <button key={a} className={`avatar-swatch${avatar === a ? " is-selected" : ""}`} onClick={() => setAvatar(a)} aria-label={`Avatar ${a} wählen`}>
              {a}
            </button>
          ))}
        </div>
      </div>
      <div className="lobby-label">Farbe
        <div className="color-picker">
          {PLAYER_COLORS.map((c) => (
            <button key={c} className={`color-swatch${color === c ? " is-selected" : ""}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Farbe ${c} wählen`} />
          ))}
        </div>
      </div>
    </>
  );

  if (mode === "create") {
    return (
      <div className="lobby-shell">
        <div className="lobby-card card">
          <span className="deed-eyebrow">Neues Spiel</span>
          <h1 className="display">Raum erstellen</h1>
          {nameColorFields}
          {createError && <p className="deed-warning">{createError}</p>}
          <div className="lobby-buttons">
            <button className="btn" onClick={() => setMode("choose")}>Zurück</button>
            <button className="btn btn-primary" disabled={!name.trim() || creating} onClick={async () => {
              setCreating(true);
              setCreateError(null);
              try {
                const res = await fetch("/api/create", { method: "POST" });
                if (!res.ok) throw new Error("Serverfehler");
                const data: { gameId: string } = await res.json();
                onEnterRoom(data.gameId, name.trim(), color, avatar);
              } catch {
                setCreateError("Raum konnte nicht erstellt werden. Versuch's nochmal.");
                setCreating(false);
              }
            }}>{creating ? "Erstelle…" : "Raum erstellen"}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lobby-shell">
      <div className="lobby-card card">
        <span className="deed-eyebrow">Spiel beitreten</span>
        <h1 className="display">Gib den Raumcode ein</h1>
        <label className="lobby-label">Raumcode
          <input className="lobby-input mono" value={joinCode} maxLength={6} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="ABC123" />
        </label>
        {nameColorFields}
        <div className="lobby-buttons">
          <button className="btn" onClick={() => setMode("choose")}>Zurück</button>
          <button className="btn btn-primary" disabled={!name.trim() || joinCode.trim().length < 4} onClick={() => onEnterRoom(joinCode.trim(), name.trim(), color, avatar)}>Beitreten</button>
        </div>
      </div>
    </div>
  );
}

/* ======================= App ======================= */

function App() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#C9A227");
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [tradeOpen, setTradeOpen] = useState(false);
  const [buildOpen, setBuildOpen] = useState(false);
  const [moneyToast, setMoneyToast] = useState<{ id: number; delta: number } | null>(null);
  const prevMoneyRef = useRef<number | null>(null);
  const prevDiceRef = useRef<[number, number] | null>(null);

  const { state, youId, connected, error, send } = useGameSocket(gameId, name, color, avatar);

  const you = state?.players.find((p) => p.id === youId);

  // Play a dice sound whenever a fresh roll appears in state, and pop a floating
  // +€/-€ toast whenever the player's own money changes (rent, purchases, events, trades).
  useEffect(() => {
    if (!state) return;
    const diceKey = state.lastDice ? state.lastDice.join(",") : null;
    const prevKey = prevDiceRef.current ? prevDiceRef.current.join(",") : null;
    if (diceKey && diceKey !== prevKey) {
      sounds.diceRoll();
    }
    prevDiceRef.current = state.lastDice;

    if (you) {
      if (prevMoneyRef.current !== null && you.money !== prevMoneyRef.current) {
        const delta = you.money - prevMoneyRef.current;
        setMoneyToast({ id: Date.now(), delta });
        if (delta > 0) sounds.cash();
      }
      prevMoneyRef.current = you.money;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.lastDice, you?.money]);

  useEffect(() => {
    if (!moneyToast) return;
    const t = setTimeout(() => setMoneyToast(null), 1600);
    return () => clearTimeout(t);
  }, [moneyToast]);

  function handleEnterRoom(id: string, playerName: string, playerColor: string, playerAvatar: string) {
    setName(playerName);
    setColor(playerColor);
    setAvatar(playerAvatar);
    setGameId(id.toUpperCase());
  }

  if (!state || !youId || state.phase === "lobby") {
    return (
      <Lobby
        onEnterRoom={handleEnterRoom}
        game={state}
        youId={youId}
        connected={connected}
        onStartGame={() => send({ type: "start_game" })}
        onConfigureRoom={(settings) => send({ type: "configure_room", settings })}
      />
    );
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  const activeCityId = BOARD_ORDER[currentPlayer.position];
  const isYourTurn = currentPlayer.id === youId;
  const showDeed = isYourTurn && state.turnPhase === "awaiting_action";

  if (state.phase === "finished") {
    const winner = state.players.find((p) => p.id === state.winnerId);
    const ranked = [...state.players].sort((a, b) => b.money - a.money);
    return (
      <div className="lobby-shell">
        <div className="lobby-card card ranking-card">
          <span className="deed-eyebrow">Spiel beendet</span>
          <h1 className="display">{winner ? `${winner.avatar} ${winner.name} hat gewonnen!` : "Unentschieden"}</h1>
          <div className="ranking-table">
            <div className="ranking-row ranking-header">
              <span>#</span><span>Spieler</span><span>Vermögen</span><span>Grundstücke</span><span>Miete kassiert</span>
            </div>
            {ranked.map((p, i) => {
              const propertyCount = Object.values(state.cities).filter((c) => c.ownerId === p.id).length;
              return (
                <div key={p.id} className="ranking-row">
                  <span className="mono">{i + 1}</span>
                  <span><span className="ledger-avatar">{p.avatar}</span><span className="ledger-swatch" style={{ background: p.color }} />{p.name}{p.bankrupt && " (bankrott)"}</span>
                  <span className="mono">€{p.money.toLocaleString("de-DE")}</span>
                  <span className="mono">{propertyCount}</span>
                  <span className="mono">€{p.rentCollected.toLocaleString("de-DE")}</span>
                </div>
              );
            })}
          </div>
          {you?.isHost && (
            <button className="btn btn-primary" style={{ marginTop: "0.8rem" }} onClick={() => send({ type: "rematch" })}>
              Nochmal spielen
            </button>
          )}
          {!you?.isHost && <p className="lobby-hint" style={{ marginTop: "0.8rem" }}>Warte, bis der Host eine neue Runde startet…</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="game-shell">
      <header className="topbar card">
        <div className="topbar-title">
          <h1 className="display" style={{ fontSize: "1.1rem", margin: 0 }}>World Empire</h1>
          <span className="topbar-code mono">Raum {state.gameId} · Runde {state.round}</span>
        </div>
        <span className="ledger-money mono topbar-money" style={{ color: you ? you.color : undefined }}>
          {you && `${you.avatar} €${you.money.toLocaleString("de-DE")}`}
          {moneyToast && (
            <span className={`money-toast ${moneyToast.delta >= 0 ? "is-positive" : "is-negative"}`}>
              {moneyToast.delta >= 0 ? "+" : ""}€{moneyToast.delta.toLocaleString("de-DE")}
            </span>
          )}
        </span>
        <button className="btn trade-open-btn" onClick={() => setTradeOpen(true)}>
          Handel
          {state.trades.filter((t) => t.status === "pending" && t.toId === youId).length > 0 && (
            <span className="trade-badge">{state.trades.filter((t) => t.status === "pending" && t.toId === youId).length}</span>
          )}
        </button>
      </header>
      <div className="game-main">
        <Globe game={state} activeCityId={activeCityId} />
        <div className="side-panels">
          <LogPanel game={state} />
          <ChatPanel game={state} youId={youId} onSend={(text) => send({ type: "send_chat", text })} />
        </div>
      </div>
      <RouteTrack game={state} />
      <LedgerBar
        game={state}
        youId={youId}
        onRoll={() => send({ type: "roll_dice" })}
        onEndTurn={() => send({ type: "end_turn" })}
        onSkipDisconnected={() => send({ type: "vote_skip_disconnected" })}
        onOpenBuild={() => setBuildOpen(true)}
      />
      {showDeed && <PropertyCard cityId={activeCityId} game={state} onBuy={() => send({ type: "buy_property" })} onSkip={() => send({ type: "skip_purchase" })} />}
      {state.auction && <AuctionPanel game={state} youId={youId} onBid={(amount) => send({ type: "place_bid", amount })} />}
      {tradeOpen && (
        <TradePanel
          game={state}
          youId={youId}
          onClose={() => setTradeOpen(false)}
          onPropose={(msg) => send({ type: "propose_trade", ...msg })}
          onRespond={(tradeId, accept) => send({ type: "respond_trade", tradeId, accept })}
          onCancel={(tradeId) => send({ type: "cancel_trade", tradeId })}
        />
      )}
      {buildOpen && (
        <BuildPanel
          game={state}
          youId={youId}
          onClose={() => setBuildOpen(false)}
          onUpgrade={(cityId) => send({ type: "upgrade_property", cityId })}
          onMortgage={(cityId) => send({ type: "mortgage_property", cityId })}
          onUnmortgage={(cityId) => send({ type: "unmortgage_property", cityId })}
        />
      )}
      {error && <div className="deed-warning" style={{ position: "fixed", bottom: 90, left: 16 }}>{error}</div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

