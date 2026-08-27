import { useCallback, useEffect, useRef, useState } from "react";
import { regionDefById } from "./conquest-regions";
import { PLAYER_COLORS } from "./cities";
import { ConquestGlobe } from "./conquest-globe";

/* ======================= Types (mirrors worker.ts's ConquestRoom) ======================= */

export interface ConquestPlayer {
  id: string;
  name: string;
  color: string;
  isHost: boolean;
  connected: boolean;
  eliminated: boolean;
}

export interface ConquestRegionState {
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

export interface ConquestGameState {
  gameId: string;
  phase: "lobby" | "playing" | "finished";
  turnPhase: "reinforce" | "attack" | "fortify";
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

/* ======================= WebSocket hook ======================= */

function wsUrl(gameId: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/conquest-room/${gameId}/ws`;
}

function useConquestSocket(gameId: string | null, name: string, color: string) {
  const [state, setState] = useState<ConquestGameState | null>(null);
  const [youId, setYouId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<ConquestClientMessage[]>([]);

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
        ws.send(JSON.stringify({ type: "join", name, color } satisfies ConquestClientMessage));
        for (const msg of queueRef.current) ws.send(JSON.stringify(msg));
        queueRef.current = [];
      });

      ws.addEventListener("message", (event) => {
        const msg: ConquestServerMessage = JSON.parse(event.data);
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

  const send = useCallback((msg: ConquestClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    else queueRef.current.push(msg);
  }, []);

  return { state, youId, connected, error, send };
}

/* ======================= Lobby ======================= */

function ConquestLobby({
  onEnterRoom,
  onBack,
  game,
  youId,
  connected,
  onStartGame,
}: {
  onEnterRoom: (id: string, name: string, color: string) => void;
  onBack: () => void;
  game: ConquestGameState | null;
  youId: string | null;
  connected: boolean;
  onStartGame: () => void;
}) {
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
          <span className="deed-eyebrow">Wartelobby — World Conquest</span>
          <h1 className="display">Raum {game.gameId}</h1>
          <p className="lobby-hint">43 Territorien, letzter Spieler mit Land gewinnt. Teile den Code, damit andere beitreten.</p>
          <ul className="lobby-players">
            {game.players.map((p) => (
              <li key={p.id}><span className="ledger-swatch" style={{ background: p.color }} />{p.name} {p.isHost && <span className="lobby-host-tag">Host</span>}</li>
            ))}
          </ul>
          {you?.isHost ? (
            <button className="btn btn-primary" disabled={game.players.length < 2} onClick={onStartGame}>
              {game.players.length < 2 ? "Warte auf weitere Spieler…" : "Eroberung starten"}
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
          <button className="btn back-btn" onClick={onBack}>← Zurück</button>
          <span className="deed-eyebrow">World Conquest</span>
          <h1 className="display">Erobere die Welt</h1>
          <p className="lobby-hint">43 Länder, Würfel-Duelle, letzter Überlebende gewinnt — im Stil von Risiko.</p>
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
                const res = await fetch("/api/conquest/create", { method: "POST" });
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

/* ======================= HUD ======================= */

function ConquestHUD({
  game,
  youId,
  pendingFortify,
  onAdvancePhase,
  onConfirmFortify,
  onCancelFortify,
}: {
  game: ConquestGameState;
  youId: string;
  pendingFortify: { from: string; to: string } | null;
  onAdvancePhase: () => void;
  onConfirmFortify: (amount: number) => void;
  onCancelFortify: () => void;
}) {
  const current = game.players[game.currentPlayerIndex];
  const isYourTurn = current?.id === youId;
  const [fortifyAmount, setFortifyAmount] = useState(1);

  const phaseLabel = { reinforce: "Verstärken", attack: "Angreifen", fortify: "Verlegen" }[game.turnPhase];
  const maxFortify = pendingFortify ? Math.max(1, game.regions[pendingFortify.from].troops - 1) : 1;

  return (
    <div className="ledger-bar card conquest-hud">
      <div className="ledger-players">
        {game.players.map((p) => {
          const count = Object.values(game.regions).filter((r) => r.ownerId === p.id).length;
          return (
            <div key={p.id} className={`ledger-player${p.id === current?.id ? " is-current" : ""}${p.eliminated ? " is-bankrupt" : ""}`}>
              <span className="ledger-swatch" style={{ background: p.color }} />
              <span className="ledger-name">{p.name}{!p.connected && " (getrennt)"}</span>
              <span className="ledger-money mono">{count} 🌍</span>
            </div>
          );
        })}
      </div>

      <div className="ledger-action">
        {pendingFortify ? (
          <div className="fortify-inline">
            <span className="mono">{fortifyAmount}</span>
            <input type="range" min={1} max={maxFortify} value={fortifyAmount} onChange={(e) => setFortifyAmount(Number(e.target.value))} />
            <button className="btn" onClick={onCancelFortify}>Abbrechen</button>
            <button className="btn btn-primary" onClick={() => onConfirmFortify(fortifyAmount)}>Verlegen</button>
          </div>
        ) : isYourTurn ? (
          <>
            <span className="phase-tag">{phaseLabel}{game.turnPhase === "reinforce" && ` (${game.reinforcementsRemaining} übrig)`}</span>
            {game.turnPhase === "reinforce" && game.reinforcementsRemaining === 0 && (
              <button className="btn btn-primary" onClick={onAdvancePhase}>Weiter zu Angriff</button>
            )}
            {game.turnPhase === "attack" && <button className="btn btn-primary" onClick={onAdvancePhase}>Weiter zu Verlegen</button>}
            {game.turnPhase === "fortify" && <button className="btn btn-primary" onClick={onAdvancePhase}>Zug beenden</button>}
          </>
        ) : (
          <span className="ledger-waiting">Warte auf {current?.name}…</span>
        )}
      </div>
    </div>
  );
}

/* ======================= Log & combat flash ======================= */

function ConquestLog({ game }: { game: ConquestGameState }) {
  return (
    <div className="log-panel card">
      <span className="deed-eyebrow">Kriegsbericht</span>
      {game.lastCombat && (
        <div className="combat-flash">
          <span>⚔️ {regionDefById(game.lastCombat.attackerRegion)?.name} → {regionDefById(game.lastCombat.defenderRegion)?.name}</span>
          <span className="mono">🎲 {game.lastCombat.attackerDice.join(",")} vs. {game.lastCombat.defenderDice.join(",")}</span>
        </div>
      )}
      <ul className="log-list">
        {game.log.length === 0 && <li className="log-empty">Noch keine Ereignisse.</li>}
        {game.log.map((entry) => <li key={entry.id}>{entry.text}</li>)}
      </ul>
    </div>
  );
}

/* ======================= App ======================= */

export function ConquestApp({ onBack }: { onBack: () => void }) {
  const [gameId, setGameId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#C9A227");
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [pendingFortify, setPendingFortify] = useState<{ from: string; to: string } | null>(null);

  const { state, youId, connected, error, send } = useConquestSocket(gameId, name, color);

  useEffect(() => {
    setSelectedRegion(null);
    setPendingFortify(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.turnPhase, state?.currentPlayerIndex]);

  function handleEnterRoom(id: string, playerName: string, playerColor: string) {
    setName(playerName);
    setColor(playerColor);
    setGameId(id.toUpperCase());
  }

  function handleSelectRegion(regionId: string) {
    if (!state || !youId) return;
    const current = state.players[state.currentPlayerIndex];
    if (current.id !== youId) return;
    const region = state.regions[regionId];
    if (!region) return;
    const ownedByYou = region.ownerId === youId;

    if (state.turnPhase === "reinforce") {
      if (ownedByYou && state.reinforcementsRemaining > 0) send({ type: "place_reinforcement", regionId });
      return;
    }

    if (state.turnPhase === "attack") {
      if (!selectedRegion) {
        if (ownedByYou && region.troops > 1) setSelectedRegion(regionId);
        return;
      }
      if (regionId === selectedRegion) {
        setSelectedRegion(null);
        return;
      }
      if (ownedByYou) {
        setSelectedRegion(region.troops > 1 ? regionId : null);
        return;
      }
      if ((state.regionAdjacency[selectedRegion] ?? []).includes(regionId)) {
        send({ type: "attack", fromRegion: selectedRegion, toRegion: regionId });
      }
      return;
    }

    if (state.turnPhase === "fortify" && !state.fortifyUsed) {
      if (!selectedRegion) {
        if (ownedByYou && region.troops > 1) setSelectedRegion(regionId);
        return;
      }
      if (regionId === selectedRegion) {
        setSelectedRegion(null);
        return;
      }
      if (ownedByYou && (state.regionAdjacency[selectedRegion] ?? []).includes(regionId)) {
        setPendingFortify({ from: selectedRegion, to: regionId });
      } else if (ownedByYou) {
        setSelectedRegion(region.troops > 1 ? regionId : null);
      }
    }
  }

  if (!state || !youId || state.phase === "lobby") {
    return (
      <ConquestLobby
        onEnterRoom={handleEnterRoom}
        onBack={onBack}
        game={state}
        youId={youId}
        connected={connected}
        onStartGame={() => send({ type: "start_game" })}
      />
    );
  }

  if (state.phase === "finished") {
    const winner = state.players.find((p) => p.id === state.winnerId);
    const ranked = [...state.players].sort((a, b) => {
      const ac = Object.values(state.regions).filter((r) => r.ownerId === a.id).length;
      const bc = Object.values(state.regions).filter((r) => r.ownerId === b.id).length;
      return bc - ac;
    });
    return (
      <div className="lobby-shell">
        <div className="lobby-card card ranking-card">
          <span className="deed-eyebrow">Eroberung beendet</span>
          <h1 className="display">{winner ? `${winner.name} hat die Welt erobert!` : "Unentschieden"}</h1>
          <div className="ranking-table">
            <div className="ranking-row ranking-header"><span>#</span><span>Spieler</span><span>Territorien</span></div>
            {ranked.map((p, i) => {
              const count = Object.values(state.regions).filter((r) => r.ownerId === p.id).length;
              return (
                <div key={p.id} className="ranking-row">
                  <span className="mono">{i + 1}</span>
                  <span><span className="ledger-swatch" style={{ background: p.color }} />{p.name}{p.eliminated && " (eliminiert)"}</span>
                  <span className="mono">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-shell">
      <header className="topbar card">
        <div className="topbar-title">
          <h1 className="display" style={{ fontSize: "1.1rem", margin: 0 }}>World Conquest</h1>
          <span className="topbar-code mono">Raum {state.gameId} · Runde {state.round}</span>
        </div>
      </header>
      <div className="game-main">
        <ConquestGlobe game={state} selectedRegion={selectedRegion} onSelectRegion={handleSelectRegion} />
        <ConquestLog game={state} />
      </div>
      <ConquestHUD
        game={state}
        youId={youId}
        pendingFortify={pendingFortify}
        onAdvancePhase={() => send({ type: "advance_phase" })}
        onConfirmFortify={(amount) => {
          if (pendingFortify) send({ type: "fortify", fromRegion: pendingFortify.from, toRegion: pendingFortify.to, amount });
          setPendingFortify(null);
          setSelectedRegion(null);
        }}
        onCancelFortify={() => setPendingFortify(null)}
      />
      {error && <div className="deed-warning" style={{ position: "fixed", bottom: 90, left: 16 }}>{error}</div>}
    </div>
  );
}
