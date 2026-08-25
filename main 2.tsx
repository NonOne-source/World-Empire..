import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import "./styles.css";
import { CITIES, BOARD_ORDER, PLAYER_COLORS } from "./cities";
import { Globe } from "./globe";

/* ======================= Shared types ======================= */

type GamePhase = "lobby" | "playing" | "finished";
type TurnPhase = "awaiting_roll" | "awaiting_action" | "awaiting_end";

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

interface LogEntry {
  id: string;
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
}

type ClientMessage =
  | { type: "join"; name: string; color: string }
  | { type: "start_game" }
  | { type: "roll_dice" }
  | { type: "buy_property" }
  | { type: "skip_purchase" }
  | { type: "end_turn" };

type ServerMessage =
  | { type: "state"; state: GameState; you: string }
  | { type: "error"; message: string };

/* ======================= WebSocket hook ======================= */

function wsUrl(gameId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/room/${gameId}/ws`;
}

function useGameSocket(gameId: string | null, name: string, color: string) {
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
        ws.send(JSON.stringify({ type: "join", name, color } satisfies ClientMessage));
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

/* ======================= LedgerBar ======================= */

function LedgerBar({ game, youId, onRoll, onEndTurn }: { game: GameState; youId: string; onRoll: () => void; onEndTurn: () => void }) {
  const current = game.players[game.currentPlayerIndex];
  const isYourTurn = current?.id === youId;

  return (
    <div className="ledger-bar card">
      <div className="ledger-players">
        {game.players.map((p) => (
          <div key={p.id} className={`ledger-player${p.id === current?.id ? " is-current" : ""}${p.bankrupt ? " is-bankrupt" : ""}`}>
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
        {isYourTurn && game.turnPhase === "awaiting_end" && <button className="btn btn-primary" onClick={onEndTurn}>Zug beenden</button>}
        {!isYourTurn && game.phase === "playing" && <span className="ledger-waiting">Warte auf {current?.name}…</span>}
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

function Lobby({ onEnterRoom, game, youId, connected, onStartGame }: { onEnterRoom: (id: string, name: string, color: string) => void; game: GameState | null; youId: string | null; connected: boolean; onStartGame: () => void }) {
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [name, setName] = useState("");
  const [color, setColor] = useState(PLAYER_COLORS[0]);
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
              <li key={p.id}><span className="ledger-swatch" style={{ background: p.color }} />{p.name} {p.isHost && <span className="lobby-host-tag">Host</span>}</li>
            ))}
          </ul>
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
        <div className="lobby-card card">
          <span className="deed-eyebrow">World Empire</span>
          <h1 className="display">Errichte dein globales Imperium</h1>
          <p className="lobby-hint">Kaufe Städte rund um die Welt, kassiere Miete und ruiniere die Konkurrenz.</p>
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
                onEnterRoom(data.gameId, name.trim(), color);
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
          <button className="btn btn-primary" disabled={!name.trim() || joinCode.trim().length < 4} onClick={() => onEnterRoom(joinCode.trim(), name.trim(), color)}>Beitreten</button>
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

  const { state, youId, connected, error, send } = useGameSocket(gameId, name, color);

  function handleEnterRoom(id: string, playerName: string, playerColor: string) {
    setName(playerName);
    setColor(playerColor);
    setGameId(id.toUpperCase());
  }

  if (!state || !youId || state.phase === "lobby") {
    return <Lobby onEnterRoom={handleEnterRoom} game={state} youId={youId} connected={connected} onStartGame={() => send({ type: "start_game" })} />;
  }

  const you = state.players.find((p) => p.id === youId);
  const currentPlayer = state.players[state.currentPlayerIndex];
  const activeCityId = BOARD_ORDER[currentPlayer.position];
  const isYourTurn = currentPlayer.id === youId;
  const showDeed = isYourTurn && state.turnPhase === "awaiting_action";

  if (state.phase === "finished") {
    const winner = state.players.find((p) => p.id === state.winnerId);
    return (
      <div className="lobby-shell">
        <div className="lobby-card card">
          <span className="deed-eyebrow">Spiel beendet</span>
          <h1 className="display">{winner ? `${winner.name} hat gewonnen!` : "Unentschieden"}</h1>
          <ul className="lobby-players">
            {[...state.players].sort((a, b) => b.money - a.money).map((p) => (
              <li key={p.id}><span className="ledger-swatch" style={{ background: p.color }} />{p.name} — €{p.money.toLocaleString("de-DE")}</li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="game-shell">
      <header className="topbar card">
        <div className="topbar-title">
          <h1 className="display" style={{ fontSize: "1.1rem", margin: 0 }}>World Empire</h1>
          <span className="topbar-code mono">Raum {state.gameId}</span>
        </div>
        <span className="ledger-money mono" style={{ color: you ? you.color : undefined }}>
          {you && `Du: €${you.money.toLocaleString("de-DE")}`}
        </span>
      </header>
      <div className="game-main">
        <Globe game={state} activeCityId={activeCityId} />
        <LogPanel game={state} />
      </div>
      <LedgerBar game={state} youId={youId} onRoll={() => send({ type: "roll_dice" })} onEndTurn={() => send({ type: "end_turn" })} />
      {showDeed && <PropertyCard cityId={activeCityId} game={state} onBuy={() => send({ type: "buy_property" })} onSkip={() => send({ type: "skip_purchase" })} />}
      {error && <div className="deed-warning" style={{ position: "fixed", bottom: 90, left: 16 }}>{error}</div>}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
