import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Bomb, Car, Crosshair, Footprints, Hand, LogOut, Pause, PersonStanding, Star } from "lucide-react";
import { MISSION_INFO, SHOP_GUNS, SHOP_NADES, VEHICLE_SHOP, WEAPONS, emptyHud, type HudSnap, type MissionId, type WeaponId } from "@/game/catalog";
import { buySaved, readSave, startGame, type Game } from "@/game/engine";
import { startOffline } from "@/game/offline";
import { SPAWNS } from "@/game/world";

function nis(n: number) {
  return `₪${Math.floor(n).toLocaleString("he-IL")}`;
}

function purseFromSave(): HudSnap {
  const save = readSave();
  return { ...emptyHud(), money: save.money, owned: save.owned, ammoMap: save.ammo, vehicles: save.vehicles };
}

export function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Game | null>(null);
  const lookRef = useRef<{ x: number; y: number } | null>(null);
  const [spawn, setSpawn] = useState(SPAWNS[0]!.id);
  const spawnRef = useRef(SPAWNS[0]!.id);
  const [phase, setPhase] = useState<"title" | "play">("title");
  const [paused, setPaused] = useState(false);
  const [shop, setShop] = useState(false);
  const [homeShop, setHomeShop] = useState(false);
  const [help, setHelp] = useState(false);
  const [brief, setBrief] = useState<MissionId | null>(null);
  const [intro, setIntro] = useState(true);
  const [install, setInstall] = useState(false);
  const [savedOffline, setSavedOffline] = useState(false);
  const [orient, setOrient] = useState<"land" | "port">("land");
  const [play, setPlay] = useState<"pc" | "touch">("pc");
  const playRef = useRef<"pc" | "touch">("pc");
  const [bank, setBank] = useState(() => readSave().money);
  const [canResume, setCanResume] = useState(() => !!readSave().resume);
  const [purse, setPurse] = useState<HudSnap>(() => purseFromSave());
  const [shopNote, setShopNote] = useState("");
  const [hud, setHud] = useState<HudSnap>(emptyHud());

  useEffect(() => () => engineRef.current?.dispose(), []);

  useEffect(() => {
    try {
      if (localStorage.getItem("kav-esh-intro-v6") === "1") setIntro(false);
    } catch {
      /* ignore */
    }
    startOffline(() => setSavedOffline(true));
    try {
      const savedOrient = localStorage.getItem("kav-esh-orient");
      if (savedOrient === "port" || savedOrient === "land") setOrient(savedOrient);
      const savedPlay = localStorage.getItem("kav-esh-play");
      if (savedPlay === "pc" || savedPlay === "touch") {
        playRef.current = savedPlay;
        setPlay(savedPlay);
      } else if (window.matchMedia("(pointer: coarse)").matches) {
        playRef.current = "touch";
        setPlay("touch");
      }
    } catch {
      /* ignore */
    }
  }, []);

  function chooseSpawn(id: string) {
    spawnRef.current = id;
    setSpawn(id);
  }

  function begin(spawnId = spawnRef.current, mission?: MissionId, resume = false) {
    const canvas = canvasRef.current;
    const map = mapRef.current;
    if (!canvas || !map || engineRef.current) return;
    const eng = startGame({
      canvas,
      map,
      spawnId,
      resume,
      onHud: setHud,
      onTogglePause: () => {
        setHelp(false);
        setShop(false);
        setPaused((p) => {
          const next = !p;
          eng.setPaused(next);
          return next;
        });
      },
      onShop: () => {
        eng.setPaused(true);
        setPaused(true);
        setShop(true);
      },
      onBrief: (id) => {
        eng.setPaused(true);
        setPaused(true);
        setBrief(id);
      },
      onQuit: () => quit(),
    });
    engineRef.current = eng;
    eng.setPlayMode(playRef.current);
    if (mission) eng.startMission(mission);
    setSpawn(spawnId);
    setPhase("play");
    setPaused(false);
    setShop(false);
    setBrief(null);
    canvas.tabIndex = 0;
    canvas.focus({ preventScroll: true });
  }

  function resume() {
    setShop(false);
    setHelp(false);
    setBrief(null);
    setPaused(false);
    engineRef.current?.setPaused(false);
  }

  function quit() {
    engineRef.current?.dispose();
    engineRef.current = null;
    setPhase("title");
    setPaused(false);
    setShop(false);
    setHelp(false);
    setBrief(null);
    refreshPurse();
  }

  function refreshPurse() {
    const save = readSave();
    const next = purseFromSave();
    setPurse(next);
    setBank(next.money);
    setCanResume(!!save.resume);
  }

  function buy(id: string) {
    engineRef.current?.buy(id);
  }

  function buyHome(id: string) {
    const result = buySaved(id);
    setShopNote(result.message);
    refreshPurse();
  }

  function pickPlay(mode: "pc" | "touch") {
    playRef.current = mode;
    setPlay(mode);
    try {
      localStorage.setItem("kav-esh-play", mode);
    } catch {
      /* ignore */
    }
    engineRef.current?.setPlayMode(mode);
  }

  function dismissIntro() {
    try {
      localStorage.setItem("kav-esh-intro-v6", "1");
    } catch {
      /* ignore */
    }
    setIntro(false);
  }

  const playing = phase === "play";
  const menu = !playing || paused || shop || help || !!brief;

  useEffect(() => {
    const live = () => {
      const type = screen.orientation?.type ?? "";
      if (type.startsWith("landscape")) return true;
      if (type.startsWith("portrait")) return false;
      const angle = screen.orientation?.angle ?? Number(window.orientation ?? 0);
      if (angle === 90 || angle === -90 || angle === 270) return true;
      return window.matchMedia("(orientation: landscape)").matches;
    };
    const follow = () => setOrient(live() ? "land" : "port");
    follow();
    try {
      screen.orientation?.unlock?.();
    } catch {
      /* ignore */
    }
    const q = window.matchMedia("(orientation: landscape)");
    q.addEventListener("change", follow);
    window.addEventListener("orientationchange", follow);
    window.addEventListener("resize", follow);
    screen.orientation?.addEventListener?.("change", follow);
    return () => {
      q.removeEventListener("change", follow);
      window.removeEventListener("orientationchange", follow);
      window.removeEventListener("resize", follow);
      screen.orientation?.removeEventListener?.("change", follow);
    };
  }, []);

  return (
    <main className={`game-shell ${orient === "land" ? "shell-land" : "shell-port"} ${play === "pc" ? "shell-pc" : "shell-touch"}`}>
      <canvas ref={canvasRef} className="game-canvas" />
      <div className={`vignette ${playing ? "" : "hidden"}`} style={{ opacity: playing ? hud.hurt : 0 }} />
      {playing && !menu && (
        <div className="crosshair" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </div>
      )}
      {playing && (
        <div className="overlay">
          <div className="hud-top">
            <button type="button" className="btn-ghost hit hud-exit" onClick={quit}>
              <LogOut size={18} />
              <span className="exit-word">יציאה</span>
            </button>
            <button type="button" className="btn-ghost hit phone-only hud-exit" onClick={() => { engineRef.current?.setPaused(true); setPaused(true); }}>
              <Pause size={18} />
            </button>
            <div className="panel hud-mission">
              <p className="mission-title">{hud.missionTitle}</p>
              <p className="mission-detail">{hud.missionDetail}</p>
            </div>
            <div className="hud-cash">
              <div className="money">{nis(hud.money)}</div>
              <div className="mt-1 flex justify-end gap-0.5">
                {Array.from({ length: 5 }, (_, i) => (
                  <Star key={i} className={i < hud.alert ? "star-on" : "star-off"} size={16} fill={i < hud.alert ? "currentColor" : "none"} />
                ))}
              </div>
            </div>
          </div>
          {hud.toast && (
            <div className="hud-float hud-toast">
              <p className="panel px-4 py-2 text-base font-extrabold text-gold">{hud.toast}</p>
            </div>
          )}
          {hud.banner && (
            <div className="hud-float hud-banner">
              <p className="bg-gold px-4 py-2 text-xl font-extrabold text-gold-ink">{hud.banner}</p>
            </div>
          )}
          <div className="hud-status">
            <p className="text-sm text-muted">{hud.driving ? `נוהג · ${hud.driving}` : "ברגל"}</p>
            <p className="weapon-read font-display leading-none text-fg">{hud.weaponShort}</p>
            <p className="ammo-read font-display leading-none text-gold">{hud.ammo}</p>
            <div className="health" aria-label="חיים">
              <span style={{ width: `${Math.max(0, Math.min(100, hud.health))}%` }} />
            </div>
            <div className="hide-sm flex max-w-xs flex-wrap justify-end gap-1">
              {hud.slots.map((slot, i) => (
                <span key={slot.id} className={`px-2 py-1 text-xs font-bold ${slot.active ? "bg-gold text-gold-ink" : "bg-panel text-muted"}`}>
                  {i + 1} {slot.name}
                </span>
              ))}
            </div>
            <button type="button" className="btn-ghost hit phone-hide flex h-11 items-center gap-2 px-3" onClick={() => { engineRef.current?.setPaused(true); setPaused(true); }}>
              <Pause size={18} />
              תפריט
            </button>
          </div>
          {hud.dead && (
            <div className="overlay hit flex items-center justify-center bg-bg/80">
              <div className="panel px-8 py-6 text-center">
                <p className="text-3xl font-extrabold text-heat">נפלת</p>
                <p className="mt-2 text-muted">הכסף נשמר, פחות קנס קטן</p>
                <button type="button" className="btn-gold mt-4 h-12 px-6 text-lg" onClick={() => engineRef.current?.respawn()}>
                  חזרה לרחוב
                </button>
                <button type="button" className="btn-ghost mt-2 h-11 px-6" onClick={quit}>
                  יציאה · Backspace
                </button>
              </div>
            </div>
          )}
          {play === "touch" && !menu && (
            <>
              <div className="side-stick hit">
                <Stick onChange={(x, y) => engineRef.current?.setStick(x, y)} />
              </div>
              <div className="touch-ui pointer-events-none absolute inset-0">
                <div
                  className="lookpad"
                  onPointerDown={(e) => {
                    lookRef.current = { x: e.clientX, y: e.clientY };
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }}
                  onPointerMove={(e) => {
                    if (!lookRef.current) return;
                    engineRef.current?.addLook(e.clientX - lookRef.current.x, e.clientY - lookRef.current.y);
                    lookRef.current = { x: e.clientX, y: e.clientY };
                  }}
                  onPointerUp={() => {
                    lookRef.current = null;
                  }}
                />
                <div className="touch-actions">
                  <Touch label="ירי" onHold={(v) => engineRef.current?.setHeld("fire", v)}><Crosshair size={16} /></Touch>
                  <Touch label="רימון" onHold={(v) => engineRef.current?.setHeld("grenade", v)}><Bomb size={16} /></Touch>
                  <Touch label="נשק" onHold={(v) => engineRef.current?.setHeld("next", v)}><span className="text-xs font-extrabold">Q</span></Touch>
                  <Touch label="אגרוף" onHold={(v) => engineRef.current?.setHeld("punch", v)}><Hand size={16} /></Touch>
                  <Touch label="בעיטה" onHold={(v) => engineRef.current?.setHeld("kick", v)}><Footprints size={16} /></Touch>
                  <Touch label="חניקה" onHold={(v) => engineRef.current?.setHeld("choke", v)}><PersonStanding size={16} /></Touch>
                  <Touch label="כלי" onHold={(v) => engineRef.current?.setHeld("interact", v)}><Car size={16} /></Touch>
                  {hud.craft === "heli" ? (
                    <>
                      <Touch label="עלה" onHold={(v) => engineRef.current?.setHeld("up", v)}><span className="text-sm font-extrabold">▲</span></Touch>
                      <Touch label="רד" onHold={(v) => engineRef.current?.setHeld("down", v)}><span className="text-sm font-extrabold">▼</span></Touch>
                    </>
                  ) : hud.busRide ? (
                    <Touch label="עצירה" onHold={(v) => { if (v) engineRef.current?.requestStop(); }}><span className="text-xs font-extrabold">B</span></Touch>
                  ) : (
                    <Touch label="כריעה" onHold={(v) => engineRef.current?.setHeld("crouch", v)}><span className="text-xs font-extrabold">▼</span></Touch>
                  )}
                  <button type="button" className="touch-btn btn-ghost flex flex-col items-center justify-center text-[10px]" onClick={() => engineRef.current?.cycleCam()}>
                    <span className="text-xs font-extrabold">{hud.cam === "eyes" ? "עין" : hud.cam === "high" ? "גבוה" : "גב"}</span>
                    <span className="mt-1">מבט</span>
                  </button>
                </div>
              </div>
            </>
          )}
          {play === "pc" && !menu && (
            <p className="pc-keys">WASD הליכה · עכבר מבט · רווח ירי · Ctrl כריעה · V מבט · F כלי · Esc תפריט</p>
          )}
        </div>
      )}

      {!playing && (
        <div className="title-screen absolute inset-0 overflow-y-auto">
          <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center gap-4 px-5 py-5">
            <div className="shop-copy">
              <p className="text-sm font-bold tracking-widest text-heat">משחק פעולה בדיוני</p>
              <h1 className="text-5xl font-extrabold leading-none text-gold sm:text-7xl">קו האש</h1>
              <p className="mt-1 text-xl font-extrabold text-fg">ירושלים</p>
              <p className="font-display text-5xl leading-none text-gold">{nis(bank)}</p>
            </div>
            <div className="shop-copy">
              <p className="mb-2 text-sm font-bold text-gold">איך משחקים</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={`min-h-24 px-3 py-3 text-right ${play === "pc" ? "btn-gold" : "btn-ghost"}`} onClick={() => pickPlay("pc")}>
                  <span className="block text-lg font-extrabold">מחשב</span>
                  <span className={`block text-xs ${play === "pc" ? "text-gold-ink" : "text-muted"}`}>מקלדת ועכבר. לוחצים על המסך, והעכבר מסתכל.</span>
                </button>
                <button type="button" className={`min-h-24 px-3 py-3 text-right ${play === "touch" ? "btn-gold" : "btn-ghost"}`} onClick={() => pickPlay("touch")}>
                  <span className="block text-lg font-extrabold">טלפון ונגן</span>
                  <span className={`block text-xs ${play === "touch" ? "text-gold-ink" : "text-muted"}`}>עיגול בשמאל להליכה. גרירה בימין למבט.</span>
                </button>
              </div>
              <button type="button" className="btn-ghost mt-2 h-11 px-4" onClick={() => { setShopNote(""); setHomeShop(true); }}>נשקייה</button>
            </div>
            {canResume && (
              <button type="button" className="btn-gold h-12 text-lg" onClick={() => begin(spawn, undefined, true)}>המשך משחק</button>
            )}
            <div className="shop-copy">
              <p className="mb-2 text-sm font-bold text-gold">מאיפה יוצאים</p>
              <div className="grid grid-cols-2 gap-2">
                {SPAWNS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onPointerUp={(e) => {
                      if (e.pointerType === "mouse" && e.button !== 0) return;
                      chooseSpawn(s.id);
                    }}
                    onClick={() => chooseSpawn(s.id)}
                    className={`min-h-14 px-3 py-2 text-right ${spawn === s.id ? "btn-gold" : "btn-ghost"}`}
                  >
                    <span className="block font-extrabold">{spawn === s.id ? `נבחר · ${s.name}` : s.name}</span>
                    <span className={`block text-xs ${spawn === s.id ? "text-gold-ink" : "text-muted"}`}>{s.detail}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="shop-copy">
              <p className="mb-2 text-sm font-bold text-gold">משימות</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(MISSION_INFO) as MissionId[]).map((id, i) => (
                  <button key={id} type="button" className="btn-heat min-h-14 px-3 py-2 text-right" onClick={() => setBrief(id)}>
                    <span className="block font-extrabold">משימה {i + 1}</span>
                    <span className="block text-xs">{MISSION_INFO[id].title}</span>
                  </button>
                ))}
              </div>
            </div>
            <button type="button" className="btn-heat flex h-14 flex-col items-center justify-center text-2xl" onClick={() => begin()}>
              <span>התחל סיור</span>
              <span className="text-base">Start · {SPAWNS.find((s) => s.id === spawn)?.name}</span>
            </button>
            <button type="button" className="btn-ghost h-12 text-base" onClick={() => setInstall((open) => !open)}>
              {install ? "סגור הוראות התקנה" : "התקנה כאפליקציה"}
            </button>
            {install && (
              <div className="panel space-y-3 px-4 py-3 text-sm leading-relaxed text-fg">
                <p className="font-extrabold text-gold">איך שמים את המשחק על המסך</p>
                <p>אנדרואיד, בדפדפן כרום:</p>
                <p>1. פותחים את הקישור בכרום. 2. לוחצים על שלוש הנקודות למעלה. 3. בוחרים "התקנת אפליקציה" או "הוסף למסך הבית". 4. לוחצים "התקן".</p>
                <p>אייפון, בדפדפן ספארי:</p>
                <p>1. פותחים את הקישור בספארי. 2. לוחצים על כפתור השיתוף. 3. בוחרים "הוסף למסך הבית". 4. לוחצים "הוסף".</p>
                <p className="font-extrabold text-gold">בלי אינטרנט</p>
                <p>נכנסים פעם אחת כשיש רשת ומחכים שהמשחק ייטען. אחר כך אפשר לפתוח אותו גם בלי קליטה. הכסף נשמר בטלפון.</p>
                <p>לעדכון חדש חייבים להתחבר לרשת, ואז לרענן את הדף. בלי רשת נשארת הגרסה שכבר שמורה.</p>
                <p className="text-muted">{savedOffline ? "המשחק נשמר במכשיר הזה." : "אחרי הפרסום, הביקור הראשון עם רשת שומר את המשחק."}</p>
              </div>
            )}
            <div className="panel px-4 py-3">
              <p className="mb-2 text-sm font-extrabold text-gold">איך משחקים</p>
              <div className="grid gap-2 text-sm text-fg sm:grid-cols-2">
                <p><b>מחשב.</b> W קדימה, S אחורה, A שמאלה, D ימינה. העכבר מסובב את המבט. לחיצה על המסך נועלת את העכבר, Esc משחרר. רווח יורה. V מחליף מבט. Ctrl כריעה. F נכנס לכלי.</p>
                <p><b>טלפון ונגן.</b> דוחפים את העיגול השמאלי לכיוון שרוצים ללכת, והדמות פונה לשם. גוררים אצבע בצד ימין כדי להסתכל. הכפתורים בימין: ירי, נשק, כריעה ומבט. ברכב העיגול למעלה הוא גז, ולצדדים הוא פנייה.</p>
              </div>
              <p className="mt-3 text-sm font-extrabold text-gold">יוצר המשחק: אליהו לוי</p>
              <p className="text-sm font-extrabold text-gold">עוזר בכיר: משה ברטלר</p>
              <p className="mt-2 text-xs leading-relaxed text-muted">הרחובות, קווי הבניינים והרכבת הקלה לפי המפה האמיתית. © תורמי OpenStreetMap</p>
            </div>
          </div>
        </div>
      )}

      {playing && paused && shop && (
        <div className="center-modal">
          <div className="panel center-card p-4">
            <Shop hud={hud} onBuy={buy} onBack={() => setShop(false)} />
          </div>
        </div>
      )}

      {playing && paused && !shop && (
        <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-bg/80 p-4">
          <div className="panel w-full max-w-lg p-5">
            {brief ? (
              <BriefCard id={brief} onGo={() => { engineRef.current?.startMission(brief); resume(); }} onBack={resume} />
            ) : help ? (
              <div>
                <h2 className="text-2xl font-extrabold text-gold">שליטה</h2>
                <ul className="mt-3 space-y-2 text-sm text-fg">
                  <li>מחשב: WASD הליכה לפי המבט. עכבר מסובב. לחיצה נועלת את העכבר, Esc משחרר. רווח ירי. V מחליף עיניים, מאחור, למעלה. Ctrl כריעה. F כלי.</li>
                  <li>טלפון: העיגול השמאלי הוא כיוון ההליכה. גרירה בצד ימין מסובבת את המבט. כפתור מבט מחליף עיניים, גב וגבוה.</li>
                  <li>רכב במחשב: W גז, S בלם או רוורס, A שמאלה, D ימינה. בטלפון העיגול למעלה גז, למטה בלם, לצדדים פנייה.</li>
                  <li>מסוק: במחשב אותם מקשים, Shift עלייה, Ctrl ירידה. בטלפון כפתורי עלה ורד.</li>
                  <li>רכבת קלה עוצרת בכל תחנה. F לעלות ולרדת. באוטובוס B או כפתור עצירה.</li>
                  <li>Backspace יוצא למסך הפתיחה. Esc תפריט. שם אפשר להחליף מחשב או טלפון.</li>
                  <li>כסף על מחבל חמוש בלבד. פגיעה באזרח קונסת.</li>
                </ul>
                <button type="button" className="btn-ghost mt-4 h-11 px-4" onClick={() => setHelp(false)}>חזרה</button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <h2 className="text-3xl font-extrabold text-gold">קו האש</h2>
                <p className="text-muted">{nis(hud.money)}</p>
                <button type="button" className="btn-gold h-12" onClick={resume}>המשך</button>
                {(Object.keys(MISSION_INFO) as MissionId[]).map((id, i) => (
                  <button key={id} type="button" className="btn-heat h-12" onClick={() => setBrief(id)}>
                    משימה {i + 1} · {MISSION_INFO[id].title}
                  </button>
                ))}
                <button type="button" className="btn-ghost h-12" onClick={() => setShop(true)}>נשקייה</button>
                <button type="button" className="btn-ghost h-12" onClick={() => setHelp(true)}>שליטה</button>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" className={`h-12 ${play === "pc" ? "btn-gold" : "btn-ghost"}`} onClick={() => pickPlay("pc")}>מחשב</button>
                  <button type="button" className={`h-12 ${play === "touch" ? "btn-gold" : "btn-ghost"}`} onClick={() => pickPlay("touch")}>טלפון</button>
                </div>
                <button type="button" className="btn-ghost h-12" onClick={quit}>יציאה מהמשחק · Backspace</button>
              </div>
            )}
          </div>
        </div>
      )}

      {!playing && homeShop && (
        <div className="center-modal">
          <div className="panel center-card p-4">
            <Shop hud={purse} onBuy={buyHome} onBack={() => setHomeShop(false)} />
            {shopNote && <p className="mt-3 text-sm font-bold text-gold">{shopNote}</p>}
          </div>
        </div>
      )}

      {!playing && brief && (
        <div className="intro-card absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-bg/85 p-4">
          <div className="panel w-full max-w-lg p-5">
            <BriefCard id={brief} onGo={() => begin(spawnRef.current, brief)} onBack={() => setBrief(null)} />
          </div>
        </div>
      )}

      {intro && (
        <div className="intro-card absolute inset-0 z-40 flex items-center justify-center overflow-y-auto bg-bg/85 p-4">
          <div className="panel w-full max-w-lg p-5">
            <p className="text-sm font-bold tracking-widest text-heat">פעם ראשונה</p>
            <h2 className="mt-1 text-3xl font-extrabold text-gold">היכרות עם קו האש</h2>
            <ol className="mt-3 max-h-[62vh] space-y-2 overflow-y-auto pe-1 text-sm leading-relaxed text-fg">
              <li><b>1. בוחרים איך משחקים.</b> במסך הבית לוחצים מחשב, או טלפון ונגן. הבחירה נשמרת.</li>
              <li><b>2. מחשב, הליכה.</b> W קדימה, S אחורה, A שמאלה, D ימינה, לפי לאן שהמבט פונה.</li>
              <li><b>3. מחשב, מבט.</b> מזיזים את העכבר. לחיצה על המסך נועלת אותו כדי שלא יברח מהחלון. Esc משחרר.</li>
              <li><b>4. טלפון, הליכה.</b> דוחפים את העיגול הזהוב שבשמאל. לאן שהאצבע דוחפת, לשם הדמות הולכת ופונה.</li>
              <li><b>5. טלפון, מבט.</b> גוררים אצבע על הצד הימני של המסך, לא על הכפתורים. כך מסובבים את הראש.</li>
              <li><b>6. ירי.</b> במחשב מקש הרווח. בטלפון כפתור ירי, כל עוד לוחצים.</li>
              <li><b>7. רימון.</b> לוחצים על כפתור הרימון, או על המקש G.</li>
              <li><b>8. אגרוף.</b> לוחצים על כפתור האגרוף, או על המקש Z.</li>
              <li><b>9. בעיטה.</b> לוחצים על כפתור הבעיטה, או על המקש X.</li>
              <li><b>10. חניקה.</b> לוחצים על כפתור החניקה, או על המקש C, כשעומדים קרוב ליריב.</li>
              <li><b>11. החלפת נשק.</b> לוחצים על כפתור הנשק, או על המקש Q, ועוברים לנשק הבא שיש לכם.</li>
              <li><b>12. מבט מהעיניים.</b> רואים את העולם כמו שהדמות רואה אותו, בלי לראות את הגוף שלה.</li>
              <li><b>13. מבט מאחור.</b> רואים את הדמות עצמה, מהגב, ממרחק קצר.</li>
              <li><b>14. מבט מלמעלה.</b> רואים את הדמות מאחור, והמצלמה קצת יותר גבוהה. זה עובד גם ברכב וברכבת.</li>
              <li><b>15. מעבר בין המבטים.</b> במחשב המקש V. בטלפון כפתור מבט. עיניים, אחר כך מאחור, אחר כך מלמעלה.</li>
              <li><b>16. כריעה.</b> כל עוד מחזיקים את כפתור הכריעה, הדמות כפופה. כשעוזבים, היא קמה. במחשב אותו דבר עם Ctrl.</li>
              <li><b>17. מחסה.</b> אם עומדים או כורעים מאחורי קיר, רכב או עץ, הירי של היריב פחות פוגע.</li>
              <li><b>18. שני כיווני הרכבת.</b> רכבת אחת נוסעת מגשר המיתרים לגבעת התחמושת, והשנייה נוסעת בכיוון ההפוך.</li>
              <li><b>19. שלט היעד.</b> על החלק הקדמי של הקרון כתוב לאן הרכבת הזאת נוסעת.</li>
              <li><b>20. עצירות הרכבת.</b> הרכבת עוצרת לבד בכל תחנה. אין בה כפתור עצירה.</li>
              <li><b>21. לעלות ולרדת מהרכבת.</b> כשהרכבת עומדת בתחנה, לוחצים F כדי לעלות. אותו כפתור מוריד אתכם.</li>
              <li><b>22. לעלות לאוטובוס.</b> עומדים בתחנה, מחכים שהאוטובוס יעצור, ולוחצים F.</li>
              <li><b>23. לרדת מהאוטובוס.</b> בתוך האוטובוס לוחצים עצירה, או B. אם נוסע אחר כבר ביקש, הוא יעצור גם בליכם.</li>
              <li><b>24. גז וברקס.</b> במחשב W מאיץ ו-S בולם. בטלפון דוחפים את העיגול למעלה לגז ולמטה לברקס.</li>
              <li><b>25. פנייה ברכב.</b> במחשב A שמאלה ו-D ימינה. בטלפון מטים את העיגול לצד שרוצים לפנות. ימינה פונה ימינה.</li>
              <li><b>26. לפני משימה.</b> אחרי שלוחצים על משימה מופיע הסבר מה צריך לעשות. רק אחר כך יוצאים אליה.</li>
              <li><b>27. כסף על מחבל.</b> במשחק החופשי מקבלים כסף על כל מחבל חמוש שמחסלים.</li>
              <li><b>28. כסף על משימה.</b> בסיום משימה מופיעה הודעה, והפרס נכנס לכסף.</li>
              <li><b>29. רוחב או אורך.</b> אין כפתור מיוחד. מסובבים את הטלפון, והמשחק עובר לרוחב או לאורך מיד, לפי המכשיר.</li>
              <li><b>30. סידור המסך ברוחב.</b> העיגול של ההליכה נשאר בשמאל, והכפתורים בימין, בלי לעלות אחד על השני.</li>
            </ol>
            <button type="button" className="btn-gold mt-4 h-12 w-full text-lg" onClick={dismissIntro}>הבנתי, קדימה</button>
          </div>
        </div>
      )}

      <div className={`hud-map ${playing ? "" : "hidden"}`}>
        <div className="minimap-wrap">
          <canvas ref={mapRef} />
        </div>
        {playing && <p className="hud-hint">{hud.hint}</p>}
      </div>
    </main>
  );
}

function BriefCard({ id, onGo, onBack }: { id: MissionId; onGo: () => void; onBack: () => void }) {
  const info = MISSION_INFO[id];
  return (
    <div>
      <p className="text-sm font-bold tracking-widest text-heat">לפני שיוצאים</p>
      <h2 className="mt-1 text-2xl font-extrabold text-gold">{info.title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-fg">{info.body}</p>
      <p className="mt-3 font-extrabold text-gold">פרס: {nis(info.pay)}</p>
      <button type="button" className="btn-heat mt-4 h-12 w-full text-lg" onClick={onGo}>יצא למשימה</button>
      <button type="button" className="btn-ghost mt-2 h-11 w-full" onClick={onBack}>חזרה</button>
    </div>
  );
}

function Shop({ hud, onBuy, onBack }: { hud: HudSnap; onBuy: (id: string) => void; onBack: () => void }) {
  return (
    <div>
      <h2 className="text-2xl font-extrabold text-gold">נשקייה</h2>
      <p className="text-muted">{nis(hud.money)}</p>
      <div className="mt-3 space-y-2">
        {SHOP_GUNS.map((id) => (
          <WeaponRow key={id} id={id} hud={hud} onBuy={onBuy} />
        ))}
        {SHOP_NADES.map((id) => (
          <WeaponRow key={id} id={id} hud={hud} onBuy={onBuy} />
        ))}
        {VEHICLE_SHOP.map((v) => (
      <div className="shop-row border border-line px-2 py-2">
            <div className="shop-copy">
              <p className="font-extrabold">{v.name}</p>
              <p className="text-xs text-muted">{v.blurb}</p>
            </div>
            <button type="button" className="btn-gold h-11 shrink-0 px-3" onClick={() => onBuy(`veh:${v.id}`)} disabled={hud.money < v.price || hud.vehicles.includes(v.id)}>
              {hud.vehicles.includes(v.id) ? "במגרש" : nis(v.price)}
            </button>
          </div>
        ))}
      </div>
      <button type="button" className="btn-ghost mt-3 h-11 px-4" onClick={onBack}>חזרה</button>
    </div>
  );
}

function WeaponRow({ id, hud, onBuy }: { id: WeaponId; hud: HudSnap; onBuy: (id: string) => void }) {
  const w = WEAPONS[id];
  const owned = hud.owned.includes(id);
  return (
    <div className="shop-row border border-line px-2 py-2">
      <div className="shop-copy">
        <p className="font-extrabold">{w.name}</p>
        <p className="text-xs text-muted">{owned ? `תחמושת ${hud.ammoMap[id] ?? 0}` : "נפתח לחגור"}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        {!owned && (
          <button type="button" className="btn-gold h-11 px-3" disabled={hud.money < w.price} onClick={() => onBuy(`gun:${id}`)}>
            {nis(w.price)}
          </button>
        )}
        {owned && (
          <button type="button" className="btn-ghost h-11 px-3" disabled={hud.money < w.packPrice} onClick={() => onBuy(`ammo:${id}`)}>
            מחסנית {nis(w.packPrice)}
          </button>
        )}
      </div>
    </div>
  );
}

function Touch({ label, onHold, children }: { label: string; onHold: (down: boolean) => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className="touch-btn btn-ghost flex flex-col items-center justify-center text-[10px] leading-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onHold(true);
      }}
      onPointerUp={() => onHold(false)}
      onPointerCancel={() => onHold(false)}
    >
      {children}
      <span className="mt-1">{label}</span>
    </button>
  );
}

function Stick({ onChange }: { onChange: (x: number, y: number) => void }) {
  const zone = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLSpanElement>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const active = useRef<number | null>(null);

  function reset() {
    origin.current = null;
    active.current = null;
    onChange(0, 0);
    if (knob.current) knob.current.style.transform = "translate(0px, 0px)";
    if (base.current) {
      base.current.style.left = "";
      base.current.style.top = "";
      base.current.style.bottom = "";
      base.current.style.transform = "";
    }
  }

  function place(clientX: number, clientY: number) {
    const o = origin.current;
    if (!o) return;
    const maxR = 48;
    const dx = clientX - o.x;
    const dy = clientY - o.y;
    const mag = Math.hypot(dx, dy) || 1;
    const reach = Math.min(maxR, mag);
    const nx = (dx / mag) * reach;
    const ny = (dy / mag) * reach;
    if (knob.current) knob.current.style.transform = `translate(${nx}px, ${ny}px)`;
    onChange(nx / maxR, -ny / maxR);
  }

  function begin(e: ReactPointerEvent<HTMLDivElement>) {
    if (active.current !== null) return;
    const el = zone.current;
    const pad = base.current;
    if (!el || !pad) return;
    e.preventDefault();
    e.stopPropagation();
    active.current = e.pointerId;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* some browsers refuse capture; window listeners still track the finger */
    }
    const box = pad.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const near = Math.hypot(e.clientX - cx, e.clientY - cy) <= box.width / 2 + 28;
    if (near) origin.current = { x: cx, y: cy };
    else {
      const zoneBox = el.getBoundingClientRect();
      origin.current = { x: e.clientX, y: e.clientY };
      pad.style.left = `${e.clientX - zoneBox.left}px`;
      pad.style.top = `${e.clientY - zoneBox.top}px`;
      pad.style.bottom = "auto";
      pad.style.transform = "translate(-50%, -50%)";
    }
    place(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => {
      if (active.current !== ev.pointerId) return;
      ev.preventDefault();
      place(ev.clientX, ev.clientY);
    };
    const end = (ev: PointerEvent) => {
      if (active.current !== ev.pointerId) return;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      reset();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  return (
    <div ref={zone} className="stick-zone" onPointerDown={begin}>
      <div ref={base} className="stick-base">
        <span ref={knob} className="stick-knob" />
      </div>
    </div>
  );
}
