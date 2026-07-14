import {loadFont as loadInter} from "@remotion/google-fonts/Inter";
import {loadFont as loadPlexMono} from "@remotion/google-fonts/IBMPlexMono";
import {loadFont as loadUrbanist} from "@remotion/google-fonts/Urbanist";
import {Audio} from "@remotion/media";
import {
  AbsoluteFill,
  Composition,
  Easing,
  Img,
  interpolate,
  Series,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import demoAudioTimings from "./demo-audio-timings.json";
import demoStoryboard from "./demo-storyboard.json";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

const C = {
  black: "#2D2C2D",
  trueBlack: "#09090B",
  white: "#FFFFFF",
  volt: "#F0DE4A",
  grey: "#F0F2EB",
  orange: "#EE7437",
  sky: "#B1CDD6",
  blue: "#2563EB",
  zinc100: "#F4F4F5",
  zinc200: "#E4E4E7",
  zinc300: "#D4D4D8",
  zinc500: "#71717A",
  zinc700: "#3F3F46",
} as const;

const {fontFamily: displayFont} = loadUrbanist("normal", {
  weights: ["600", "700", "800"],
  subsets: ["latin"],
});
const {fontFamily: bodyFont} = loadInter("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
});
const {fontFamily: monoFont} = loadPlexMono("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
});

type DemoScene = (typeof demoStoryboard)[number];
type DemoSceneProps = {scene: DemoScene; index: number; duration: number};

const sceneFrames = demoAudioTimings.map((timing) =>
  Math.ceil(timing.durationSeconds * FPS),
);
const totalFrames = sceneFrames.reduce((sum, frames) => sum + frames, 0);
const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

const enter = (frame: number, start: number, distance = 24) => {
  const progress = interpolate(frame, [start, start + 18], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  return {
    opacity: progress,
    translate: `0px ${interpolate(progress, [0, 1], [distance, 0])}px`,
  };
};

const BrandLockup: React.FC<{
  variant: "grey" | "softblack" | "volt";
  width?: number;
  height?: number;
}> = ({variant, width = 280, height = 58}) => {
  const files = {
    grey: "brand/Aires_lockup_GREY_[RGB].png",
    softblack: "brand/Aires_lockup_SOFTBLACK_[RGB].png",
    volt: "brand/Aires_lockup_VOLT_[RGB].png",
  } as const;
  return (
    <div style={{width, height, overflow: "hidden"}}>
      <Img
        src={staticFile(files[variant])}
        style={{width: "100%", height: "100%", objectFit: "cover", objectPosition: "center"}}
      />
    </div>
  );
};

const DemoFrame: React.FC<{
  scene: DemoScene;
  index: number;
  children: React.ReactNode;
  dark?: boolean;
  product?: boolean;
}> = ({scene, index, children, dark = false, product = true}) => (
  <AbsoluteFill
    style={{
      backgroundColor: dark ? C.black : C.grey,
      color: dark ? C.white : C.black,
      fontFamily: bodyFont,
      overflow: "hidden",
    }}
  >
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundImage: dark
          ? "linear-gradient(rgba(255,255,255,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.03) 1px, transparent 1px)"
          : "linear-gradient(rgba(45,44,45,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(45,44,45,.035) 1px, transparent 1px)",
        backgroundSize: "64px 64px",
      }}
    />
    <header
      style={{
        position: "absolute",
        top: 48,
        left: 80,
        right: 80,
        height: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 20,
      }}
    >
      <div style={{display: "flex", alignItems: "center", gap: 18}}>
        <BrandLockup variant={dark ? "grey" : "softblack"} />
        <span style={{fontFamily: monoFont, fontSize: 20, letterSpacing: ".14em", textTransform: "uppercase", color: dark ? C.zinc300 : C.zinc700}}>
          / Company OS
        </span>
      </div>
      <div style={{display: "flex", alignItems: "center", gap: 16, fontFamily: monoFont, fontSize: 18, color: dark ? C.zinc300 : C.zinc700}}>
        <span>Illustrative product demo</span>
        <span style={{color: C.zinc500}}>/</span>
        <span>{String(index + 1).padStart(2, "0")}</span>
      </div>
    </header>
    <main
      style={
        product
          ? {position: "absolute", left: 80, right: 80, top: 132, bottom: 98, zIndex: 4}
          : {position: "absolute", inset: "132px 80px 98px", zIndex: 4}
      }
    >
      {children}
    </main>
    <footer
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        bottom: 38,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        zIndex: 20,
      }}
    >
      <span style={{fontFamily: monoFont, fontSize: 16, color: dark ? C.zinc300 : C.zinc500}}>
        {scene.sourceAnchors.join(" · ")}
      </span>
      <div style={{width: 360, height: 3, backgroundColor: dark ? C.zinc700 : C.zinc300}}>
        <div style={{width: `${((index + 1) / demoStoryboard.length) * 100}%`, height: "100%", backgroundColor: C.volt}} />
      </div>
    </footer>
  </AbsoluteFill>
);

const ProductWindow: React.FC<{children: React.ReactNode}> = ({children}) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      backgroundColor: C.white,
      outline: `1px solid ${C.zinc300}`,
      boxShadow: "18px 22px 0 rgba(45,44,45,.10)",
      overflow: "hidden",
    }}
  >
    <div
      style={{
        height: 54,
        display: "flex",
        alignItems: "center",
        padding: "0 22px",
        gap: 16,
        backgroundColor: C.zinc100,
        borderBottom: `1px solid ${C.zinc300}`,
        fontFamily: monoFont,
        fontSize: 15,
        color: C.zinc500,
      }}
    >
      <div style={{display: "flex", gap: 8}}>
        {[C.orange, C.volt, C.sky].map((color) => (
          <span key={color} style={{width: 12, height: 12, borderRadius: "50%", backgroundColor: color}} />
        ))}
      </div>
      <div style={{height: 30, flex: 1, maxWidth: 620, backgroundColor: C.white, border: `1px solid ${C.zinc300}`, display: "flex", alignItems: "center", justifyContent: "center"}}>
        app.aires.ai / company-os / demo-session
      </div>
      <span style={{marginLeft: "auto", padding: "7px 11px", backgroundColor: C.black, color: C.white, letterSpacing: ".06em"}}>
        PROPOSED WORKFLOW
      </span>
    </div>
    <div style={{height: "calc(100% - 54px)"}}>{children}</div>
  </div>
);

const Sidebar: React.FC<{active: string}> = ({active}) => {
  const items = ["Today", "Sessions", "Accounts", "Artifacts"];
  return (
    <aside style={{height: "100%", backgroundColor: C.black, color: C.white, padding: "26px 18px", display: "flex", flexDirection: "column"}}>
      <div style={{fontFamily: displayFont, fontSize: 30, fontWeight: 700, padding: "0 14px 28px"}}>Cooper</div>
      <nav style={{display: "flex", flexDirection: "column", gap: 8}}>
        {items.map((item, i) => (
          <div key={item} style={{height: 54, padding: "0 14px", display: "flex", alignItems: "center", gap: 14, backgroundColor: item === active ? C.volt : "transparent", color: item === active ? C.black : C.zinc300, fontSize: 20, fontWeight: 600}}>
            <span style={{width: 18, height: 18, border: `2px solid ${item === active ? C.black : C.zinc500}`, rotate: i === 1 ? "45deg" : "0deg"}} />
            {item}
          </div>
        ))}
      </nav>
      <div style={{marginTop: "auto", padding: 14, borderTop: `1px solid ${C.zinc700}`, display: "flex", alignItems: "center", gap: 12}}>
        <span style={{width: 34, height: 34, borderRadius: "50%", backgroundColor: C.sky}} />
        <div>
          <div style={{fontSize: 17, fontWeight: 600}}>Michael</div>
          <div style={{fontFamily: monoFont, fontSize: 13, color: C.zinc500}}>AIRES workspace</div>
        </div>
      </div>
    </aside>
  );
};

const AppShell: React.FC<{active: string; children: React.ReactNode}> = ({active, children}) => (
  <div style={{height: "100%", display: "grid", gridTemplateColumns: "230px 1fr"}}>
    <Sidebar active={active} />
    <section style={{height: "100%", backgroundColor: C.grey, overflow: "hidden"}}>{children}</section>
  </div>
);

const Button: React.FC<{
  children: React.ReactNode;
  tone?: "dark" | "volt" | "light";
  style?: React.CSSProperties;
}> = ({children, tone = "dark", style}) => {
  const palette =
    tone === "volt"
      ? {backgroundColor: C.volt, color: C.black, border: C.black}
      : tone === "light"
        ? {backgroundColor: C.white, color: C.black, border: C.zinc300}
        : {backgroundColor: C.black, color: C.white, border: C.black};
  return (
    <div style={{height: 52, padding: "0 22px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10, border: `1px solid ${palette.border}`, backgroundColor: palette.backgroundColor, color: palette.color, fontSize: 19, fontWeight: 600, ...style}}>
      {children}
    </div>
  );
};

const Tag: React.FC<{children: React.ReactNode; color?: string}> = ({children, color = C.zinc100}) => (
  <span style={{display: "inline-flex", alignItems: "center", minHeight: 30, padding: "0 10px", backgroundColor: color, border: `1px solid ${C.zinc300}`, fontFamily: monoFont, fontSize: 13, color: C.zinc700}}>
    {children}
  </span>
);

const Cursor: React.FC<{
  frame: number;
  times: number[];
  xs: number[];
  ys: number[];
  clickAt?: number;
  dark?: boolean;
}> = ({frame, times, xs, ys, clickAt, dark = true}) => {
  const left = interpolate(frame, times, xs, {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut});
  const top = interpolate(frame, times, ys, {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut});
  const click = clickAt === undefined ? 0 : interpolate(frame, [clickAt - 4, clickAt, clickAt + 10], [0, 1, 0], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  return (
    <div style={{position: "absolute", left, top, zIndex: 40, pointerEvents: "none"}}>
      <span style={{position: "absolute", left: -20, top: -20, width: 60, height: 60, borderRadius: "50%", border: `3px solid ${C.volt}`, opacity: click, scale: 0.7 + click * 0.6}} />
      <span style={{display: "block", width: 28, height: 38, backgroundColor: dark ? C.black : C.white, clipPath: "polygon(0 0, 0 100%, 28% 72%, 46% 100%, 62% 90%, 45% 62%, 82% 62%)", filter: dark ? "drop-shadow(0 2px 0 white)" : "drop-shadow(0 2px 0 black)"}} />
    </div>
  );
};

const DemoOpen: React.FC<DemoSceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const steps = ["Start session", "Select context", "Make a document", "Synthesize decisions"];
  return (
    <DemoFrame scene={scene} index={index} dark product={false}>
      <div style={{height: "100%", display: "grid", gridTemplateColumns: "1.1fr .9fr", gap: 90, alignItems: "center"}}>
        <div style={{display: "flex", flexDirection: "column", gap: 28}}>
          <div style={{fontFamily: monoFont, fontSize: 22, textTransform: "uppercase", letterSpacing: ".14em", color: C.volt, ...enter(frame, 0)}}>{scene.kicker}</div>
          <h1 style={{margin: 0, maxWidth: 980, fontFamily: displayFont, fontSize: 104, lineHeight: .94, letterSpacing: "-.045em", ...enter(frame, 7, 42)}}>{scene.title}</h1>
          <p style={{margin: 0, maxWidth: 880, fontSize: 34, lineHeight: 1.3, color: C.zinc300, ...enter(frame, 18)}}>{scene.support}</p>
        </div>
        <div style={{display: "flex", flexDirection: "column", gap: 14}}>
          {steps.map((step, i) => (
            <div key={step} style={{height: 116, padding: "0 30px", display: "grid", gridTemplateColumns: "54px 1fr 26px", alignItems: "center", backgroundColor: i === 1 ? C.volt : C.trueBlack, color: i === 1 ? C.black : C.white, border: `1px solid ${i === 1 ? C.volt : C.zinc700}`, ...enter(frame, 14 + i * 8, 34)}}>
              <span style={{fontFamily: monoFont, fontSize: 18}}>0{i + 1}</span>
              <span style={{fontFamily: displayFont, fontSize: 36, fontWeight: 700}}>{step}</span>
              <span style={{width: 16, height: 16, backgroundColor: i === 1 ? C.black : C.volt, rotate: "45deg"}} />
            </div>
          ))}
        </div>
      </div>
    </DemoFrame>
  );
};

const TodayScene: React.FC<DemoSceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const cards = [
    ["Ready for review", "Westward product review", "Zoom · 3 sources", C.volt],
    ["Needs decision", "Reporting export", "Notion · GitHub", C.sky],
    ["Follow-up due", "Onboarding milestone 03", "Account memory", C.orange],
  ] as const;
  return (
    <DemoFrame scene={scene} index={index}>
      <ProductWindow>
        <AppShell active="Today">
          <div style={{padding: "34px 42px", height: "100%"}}>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", ...enter(frame, 0)}}>
              <div>
                <div style={{fontFamily: monoFont, fontSize: 15, color: C.zinc500, textTransform: "uppercase", letterSpacing: ".1em"}}>Monday · Customer success</div>
                <h2 style={{margin: "6px 0 0", fontFamily: displayFont, fontSize: 48}}>Today</h2>
              </div>
              <Button tone="volt" style={{width: 190}}>+ Start session</Button>
            </div>
            <div style={{display: "grid", gridTemplateColumns: "1.45fr .55fr", gap: 24, marginTop: 30, height: 590}}>
              <div style={{backgroundColor: C.white, border: `1px solid ${C.zinc300}`, padding: 24}}>
                <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20}}>
                  <h3 style={{margin: 0, fontFamily: displayFont, fontSize: 30}}>Sessions needing attention</h3>
                  <Tag>3 OPEN</Tag>
                </div>
                <div style={{display: "flex", flexDirection: "column", gap: 14}}>
                  {cards.map(([status, title, detail, color], i) => (
                    <div key={title} style={{height: 140, display: "grid", gridTemplateColumns: "10px 1fr 190px", gap: 22, alignItems: "center", border: `1px solid ${C.zinc300}`, backgroundColor: C.white, padding: "0 24px", ...enter(frame, 10 + i * 7, 28)}}>
                      <span style={{width: 8, height: 74, backgroundColor: color}} />
                      <div>
                        <div style={{fontFamily: monoFont, fontSize: 14, color: C.zinc500, textTransform: "uppercase"}}>{status}</div>
                        <div style={{fontFamily: displayFont, fontSize: 31, fontWeight: 700, marginTop: 6}}>{title}</div>
                        <div style={{fontSize: 18, color: C.zinc500, marginTop: 4}}>{detail}</div>
                      </div>
                      <Button tone="light">Open session</Button>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{display: "flex", flexDirection: "column", gap: 18}}>
                <div style={{backgroundColor: C.black, color: C.white, padding: 24, height: 270, ...enter(frame, 20)}}>
                  <div style={{fontFamily: monoFont, fontSize: 14, color: C.volt}}>COOPER</div>
                  <div style={{fontFamily: displayFont, fontSize: 30, fontWeight: 700, lineHeight: 1.03, marginTop: 48}}>Three sessions need human judgment.</div>
                  <div style={{fontSize: 17, color: C.zinc300, marginTop: 18}}>Start a new session or continue an evidence-backed review.</div>
                </div>
                <div style={{backgroundColor: C.white, border: `1px solid ${C.zinc300}`, padding: 24, flex: 1}}>
                  <div style={{fontFamily: monoFont, fontSize: 14, color: C.zinc500}}>UPCOMING</div>
                  <div style={{fontFamily: displayFont, fontSize: 26, fontWeight: 700, marginTop: 20}}>Westward implementation sync</div>
                  <div style={{fontSize: 17, color: C.zinc500, marginTop: 8}}>10:30 · 6 participants</div>
                </div>
              </div>
            </div>
          </div>
        </AppShell>
      </ProductWindow>
      <Cursor frame={frame} times={[0, 28, 58]} xs={[1740, 1610, 1590]} ys={[340, 225, 225]} clickAt={58} />
    </DemoFrame>
  );
};

const DefineScene: React.FC<DemoSceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const fields = [
    ["Session title", "Reporting export decision"],
    ["Purpose", "Shape requirements and confirm the next decision"],
    ["Account", "Westward"],
    ["Project", "Customer reporting"],
  ];
  return (
    <DemoFrame scene={scene} index={index}>
      <ProductWindow>
        <AppShell active="Sessions">
          <div style={{height: "100%", position: "relative", padding: "34px 42px"}}>
            <div style={{opacity: .22}}>
              <h2 style={{fontFamily: displayFont, fontSize: 44, margin: 0}}>Sessions</h2>
              <div style={{height: 540, marginTop: 26, backgroundColor: C.white, border: `1px solid ${C.zinc300}`}} />
            </div>
            <div style={{position: "absolute", inset: "22px 150px", backgroundColor: C.white, border: `1px solid ${C.zinc300}`, boxShadow: "14px 18px 0 rgba(45,44,45,.14)", padding: "30px 38px", ...enter(frame, 0, 34)}}>
              <div style={{display: "flex", alignItems: "flex-start", justifyContent: "space-between"}}>
                <div>
                  <div style={{fontFamily: monoFont, color: C.zinc500, fontSize: 14, textTransform: "uppercase", letterSpacing: ".1em"}}>New session · Step 1 of 2</div>
                  <h2 style={{fontFamily: displayFont, fontSize: 40, margin: "8px 0 0"}}>Define the workspace</h2>
                </div>
                <span style={{fontFamily: monoFont, fontSize: 17, color: C.zinc500}}>ESC</span>
              </div>
              <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 26}}>
                {fields.map(([label, value], i) => (
                  <label key={label} style={{gridColumn: i < 2 ? "1 / -1" : "auto", display: "flex", flexDirection: "column", gap: 8, ...enter(frame, 10 + i * 7, 18)}}>
                    <span style={{fontSize: 16, fontWeight: 600}}>{label}</span>
                    <span style={{height: 54, padding: "0 16px", display: "flex", alignItems: "center", border: `1px solid ${i === 0 ? C.black : C.zinc300}`, backgroundColor: C.white, fontSize: 20, color: i === 0 ? C.black : C.zinc700}}>{value}</span>
                  </label>
                ))}
              </div>
              <div style={{marginTop: 20, display: "flex", alignItems: "center", justifyContent: "space-between"}}>
                <div style={{display: "flex", alignItems: "center", gap: 12}}>
                  <span style={{width: 34, height: 34, borderRadius: "50%", backgroundColor: C.sky}} />
                  <span style={{fontSize: 17}}>Michael · session owner</span>
                  <Tag color={C.grey}>+ Add participants</Tag>
                </div>
                <Button tone="dark" style={{width: 186}}>Select context →</Button>
              </div>
            </div>
          </div>
        </AppShell>
      </ProductWindow>
      <Cursor frame={frame} times={[0, 48, 82]} xs={[1440, 1515, 1515]} ys={[420, 826, 826]} clickAt={82} />
    </DemoFrame>
  );
};

const ContextScene: React.FC<DemoSceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const sources = [
    {provider: "NOTION", title: "Westward · Customer account", detail: "Goals, open requests, decisions", color: C.sky, at: 24},
    {provider: "NOTION", title: "Reporting export · discovery", detail: "Requirements draft · updated today", color: C.sky, at: 50},
    {provider: "GITHUB", title: "aires / customer-reporting", detail: "Repository · default branch Peterson", color: C.black, at: 76},
    {provider: "GITHUB", title: "PR #842 · export foundation", detail: "12 files · checks passing", color: C.black, at: 102},
    {provider: "ZOOM", title: "Westward product review", detail: "Summary + transcript · July 12", color: C.orange, at: 999},
  ];
  return (
    <DemoFrame scene={scene} index={index}>
      <ProductWindow>
        <div style={{height: "100%", display: "grid", gridTemplateRows: "86px 1fr 76px", backgroundColor: C.grey}}>
          <div style={{backgroundColor: C.white, borderBottom: `1px solid ${C.zinc300}`, padding: "0 34px", display: "flex", alignItems: "center", justifyContent: "space-between"}}>
            <div>
              <div style={{fontFamily: monoFont, fontSize: 13, color: C.zinc500, textTransform: "uppercase"}}>New session · Step 2 of 2</div>
              <div style={{fontFamily: displayFont, fontSize: 34, fontWeight: 700, marginTop: 4}}>Select context</div>
            </div>
            <div style={{display: "flex", alignItems: "center", gap: 10}}>
              <Tag color={C.volt}>4 SELECTED</Tag>
              <span style={{fontSize: 17, color: C.zinc500}}>Everything stays visible and removable.</span>
            </div>
          </div>
          <div style={{display: "grid", gridTemplateColumns: "250px 1fr 350px", minHeight: 0}}>
            <div style={{backgroundColor: C.white, borderRight: `1px solid ${C.zinc300}`, padding: 20}}>
              <div style={{fontFamily: monoFont, fontSize: 13, color: C.zinc500, margin: "6px 10px 16px"}}>CONNECTIONS</div>
              {["All context", "Notion", "GitHub", "Zoom", "Uploads"].map((label, i) => (
                <div key={label} style={{height: 54, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: i === 0 ? C.black : "transparent", color: i === 0 ? C.white : C.black, fontSize: 19, fontWeight: 600}}>
                  <span>{label}</span>
                  <span style={{fontFamily: monoFont, fontSize: 13, color: i === 0 ? C.volt : C.zinc500}}>{["12", "04", "05", "02", "01"][i]}</span>
                </div>
              ))}
              <div style={{marginTop: 22, padding: 14, border: `1px solid ${C.zinc300}`, backgroundColor: C.grey}}>
                <div style={{fontSize: 15, fontWeight: 600}}>Least privilege</div>
                <div style={{fontSize: 14, lineHeight: 1.35, color: C.zinc500, marginTop: 6}}>Only selected sources enter this session.</div>
              </div>
            </div>
            <div style={{padding: 22, overflow: "hidden"}}>
              <div style={{height: 48, backgroundColor: C.white, border: `1px solid ${C.zinc300}`, padding: "0 16px", display: "flex", alignItems: "center", fontSize: 17, color: C.zinc500}}>Search connected context…</div>
              <div style={{display: "flex", flexDirection: "column", gap: 10, marginTop: 14}}>
                {sources.map((item, i) => {
                  const selected = frame >= item.at;
                  return (
                    <div key={`${item.provider}-${item.title}`} style={{height: 88, padding: "0 18px", display: "grid", gridTemplateColumns: "42px 1fr 116px", alignItems: "center", gap: 12, backgroundColor: C.white, border: `1px solid ${selected ? C.black : C.zinc300}`, boxShadow: selected ? "5px 5px 0 rgba(45,44,45,.10)" : "none", ...enter(frame, 6 + i * 5, 16)}}>
                      <span style={{width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${selected ? C.black : C.zinc300}`, backgroundColor: selected ? C.volt : C.white, fontWeight: 800}}>{selected ? "✓" : ""}</span>
                      <div>
                        <div style={{fontSize: 20, fontWeight: 600}}>{item.title}</div>
                        <div style={{fontSize: 15, color: C.zinc500, marginTop: 4}}>{item.detail}</div>
                      </div>
                      <Tag color={item.color === C.black ? C.zinc100 : item.color}>{item.provider}</Tag>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{backgroundColor: C.white, borderLeft: `1px solid ${C.zinc300}`, padding: 22}}>
              <div style={{fontFamily: monoFont, fontSize: 13, color: C.zinc500}}>CONTEXT BUNDLE</div>
              <h3 style={{fontFamily: displayFont, fontSize: 28, margin: "10px 0 16px"}}>Reporting export decision</h3>
              <div style={{display: "flex", flexDirection: "column", gap: 10}}>
                {sources.slice(0, 4).map((item) => (
                  <div key={item.title} style={{minHeight: 64, padding: "10px 12px", border: `1px solid ${C.zinc300}`, backgroundColor: frame >= item.at ? C.grey : C.white, opacity: frame >= item.at ? 1 : .25}}>
                    <div style={{fontFamily: monoFont, fontSize: 11, color: C.zinc500}}>{item.provider}</div>
                    <div style={{fontSize: 15, fontWeight: 600, marginTop: 4}}>{item.title}</div>
                  </div>
                ))}
              </div>
              <div style={{marginTop: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: C.zinc500}}>
                <span style={{width: 10, height: 10, backgroundColor: C.volt}} />
                Source versions will be recorded.
              </div>
            </div>
          </div>
          <div style={{backgroundColor: C.white, borderTop: `1px solid ${C.zinc300}`, padding: "0 30px", display: "flex", alignItems: "center", justifyContent: "space-between"}}>
            <Button tone="light">← Back</Button>
            <div style={{display: "flex", alignItems: "center", gap: 16}}>
              <span style={{fontSize: 15, color: C.zinc500}}>4 sources · read-only context</span>
              <Button tone="dark" style={{width: 184}}>Start session →</Button>
            </div>
          </div>
        </div>
      </ProductWindow>
      <Cursor frame={frame} times={[0, 24, 50, 76, 102, 132]} xs={[830, 730, 720, 730, 730, 1550]} ys={[330, 358, 455, 548, 646, 862]} clickAt={132} />
    </DemoFrame>
  );
};

const WorkspaceScene: React.FC<DemoSceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  return (
    <DemoFrame scene={scene} index={index}>
      <ProductWindow>
        <div style={{height: "100%", display: "grid", gridTemplateColumns: "350px 1fr", backgroundColor: C.grey}}>
          <aside style={{backgroundColor: C.black, color: C.white, padding: 24, display: "flex", flexDirection: "column"}}>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
              <div style={{fontFamily: displayFont, fontSize: 30, fontWeight: 700}}>Cooper</div>
              <Tag color={C.volt}>LISTENING</Tag>
            </div>
            <div style={{marginTop: 30, fontFamily: monoFont, fontSize: 12, color: C.zinc500}}>BRIEFING</div>
            <div style={{marginTop: 12, padding: 18, border: `1px solid ${C.zinc700}`, backgroundColor: C.trueBlack, ...enter(frame, 6)}}>
              <div style={{fontSize: 22, fontWeight: 600, lineHeight: 1.25}}>The decision is whether reporting exports enter the next planning cycle.</div>
              <div style={{fontSize: 15, lineHeight: 1.45, color: C.zinc300, marginTop: 14}}>I found prior customer evidence, an open requirements draft, and a related foundation PR.</div>
            </div>
            <div style={{marginTop: 20, fontFamily: monoFont, fontSize: 12, color: C.zinc500}}>NEEDS JUDGMENT</div>
            {["Is CSV the first required format?", "Is the PR foundation or committed scope?"].map((q, i) => (
              <div key={q} style={{marginTop: 10, padding: 14, borderLeft: `4px solid ${i === 0 ? C.volt : C.orange}`, backgroundColor: C.zinc700, fontSize: 16, lineHeight: 1.35, ...enter(frame, 18 + i * 8)}}>{q}</div>
            ))}
            <div style={{marginTop: "auto", height: 50, border: `1px solid ${C.zinc700}`, color: C.zinc300, display: "flex", alignItems: "center", padding: "0 14px", fontSize: 15}}>Ask Cooper about this session…</div>
          </aside>
          <section style={{padding: "26px 32px", minWidth: 0}}>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start"}}>
              <div>
                <div style={{display: "flex", gap: 8}}><Tag color={C.volt}>IN SESSION</Tag><Tag>WESTWARD</Tag></div>
                <h2 style={{fontFamily: displayFont, fontSize: 40, margin: "10px 0 0"}}>Reporting export decision</h2>
              </div>
              <div style={{display: "flex", gap: 10}}><Button tone="light">Sources · 4</Button><Button tone="dark">Actions</Button></div>
            </div>
            <div style={{display: "flex", gap: 8, marginTop: 18}}>
              {["Notion · Account", "Notion · Discovery", "GitHub · Repo", "GitHub · PR #842"].map((label, i) => <Tag key={label} color={i < 2 ? C.sky : C.zinc100}>{label}</Tag>)}
            </div>
            <div style={{display: "grid", gridTemplateColumns: "1.15fr .85fr", gap: 18, marginTop: 20, height: 540}}>
              <div style={{backgroundColor: C.white, border: `1px solid ${C.zinc300}`, padding: 24}}>
                <div style={{fontFamily: monoFont, fontSize: 13, color: C.zinc500}}>WORKING BRIEF</div>
                <h3 style={{fontFamily: displayFont, fontSize: 31, margin: "12px 0 18px"}}>What changed for this customer</h3>
                {[
                  ["Customer evidence", "Monthly exports are still assembled manually for the operations team.", C.orange],
                  ["Existing context", "Discovery captured CSV as the likely first slice; scheduling remains open.", C.sky],
                  ["Delivery context", "PR #842 establishes the export service boundary; it does not commit the feature.", C.volt],
                ].map(([title, body, color], i) => (
                  <div key={title} style={{display: "grid", gridTemplateColumns: "7px 1fr", gap: 16, marginTop: i === 0 ? 0 : 14, padding: "16px 18px", border: `1px solid ${C.zinc300}`, ...enter(frame, 14 + i * 8)}}>
                    <span style={{backgroundColor: color}} />
                    <div><div style={{fontSize: 18, fontWeight: 600}}>{title}</div><div style={{fontSize: 16, lineHeight: 1.4, color: C.zinc500, marginTop: 5}}>{body}</div></div>
                  </div>
                ))}
              </div>
              <div style={{display: "flex", flexDirection: "column", gap: 16}}>
                <div style={{backgroundColor: C.black, color: C.white, padding: 22, height: 250}}>
                  <div style={{fontFamily: monoFont, fontSize: 12, color: C.volt}}>RECOMMENDED ORDER</div>
                  {["Confirm the decision", "Shape the first slice", "Create the artifact"].map((item, i) => <div key={item} style={{display: "flex", gap: 12, marginTop: 18, fontSize: 18, ...enter(frame, 26 + i * 7)}}><span style={{fontFamily: monoFont, color: C.volt}}>0{i + 1}</span><span>{item}</span></div>)}
                </div>
                <div style={{backgroundColor: C.white, border: `1px solid ${C.zinc300}`, padding: 22, flex: 1}}>
                  <div style={{fontFamily: monoFont, fontSize: 12, color: C.zinc500}}>SESSION STATE</div>
                  <div style={{display: "flex", justifyContent: "space-between", marginTop: 18, fontSize: 17}}><span>Sources</span><strong>4 ready</strong></div>
                  <div style={{display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 17}}><span>Open questions</span><strong>2</strong></div>
                  <div style={{display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 17}}><span>Artifacts</span><strong>0</strong></div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </ProductWindow>
    </DemoFrame>
  );
};

const MakeDocScene: React.FC<DemoSceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const types = ["Requirements brief", "Decision memo", "Bug brief", "Customer follow-up"];
  return (
    <DemoFrame scene={scene} index={index}>
      <ProductWindow>
        <div style={{height: "100%", display: "grid", gridTemplateColumns: "350px 1fr", backgroundColor: C.grey}}>
          <aside style={{backgroundColor: C.black, color: C.white, padding: 24, opacity: .7}}>
            <div style={{fontFamily: displayFont, fontSize: 30, fontWeight: 700}}>Cooper</div>
            <div style={{marginTop: 40, padding: 18, backgroundColor: C.trueBlack, border: `1px solid ${C.zinc700}`, fontSize: 19, lineHeight: 1.4}}>We have enough context to create a first requirements brief.</div>
          </aside>
          <section style={{padding: "26px 32px", position: "relative"}}>
            <div style={{display: "flex", justifyContent: "space-between"}}>
              <div><Tag color={C.volt}>IN SESSION</Tag><h2 style={{fontFamily: displayFont, fontSize: 40, margin: "10px 0 0"}}>Reporting export decision</h2></div>
              <Button tone="dark">Actions</Button>
            </div>
            <div style={{marginTop: 24, height: 540, backgroundColor: C.white, border: `1px solid ${C.zinc300}`, padding: 26, opacity: .28}}>
              <h3 style={{fontFamily: displayFont, fontSize: 30, margin: 0}}>Working brief</h3>
            </div>
            <div style={{position: "absolute", top: 80, right: 32, width: 300, backgroundColor: C.white, border: `1px solid ${C.black}`, boxShadow: "9px 11px 0 rgba(45,44,45,.14)", padding: 10, ...enter(frame, 5, 18)}}>
              {["Make a document", "Capture a decision", "Create an action", "Show source evidence"].map((item, i) => (
                <div key={item} style={{height: 54, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: i === 0 ? C.volt : C.white, fontSize: 18, fontWeight: i === 0 ? 600 : 500}}><span>{item}</span><span>→</span></div>
              ))}
            </div>
            <div style={{position: "absolute", top: 118, right: 350, width: 560, backgroundColor: C.white, border: `1px solid ${C.black}`, boxShadow: "12px 15px 0 rgba(45,44,45,.16)", padding: 24, ...enter(frame, 30, 24)}}>
              <div style={{fontFamily: monoFont, fontSize: 13, color: C.zinc500}}>MAKE A DOCUMENT</div>
              <h3 style={{fontFamily: displayFont, fontSize: 31, margin: "8px 0 16px"}}>Choose an artifact</h3>
              <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10}}>
                {types.map((type, i) => (
                  <div key={type} style={{height: 86, padding: 14, border: `1px solid ${i === 0 ? C.black : C.zinc300}`, backgroundColor: i === 0 ? C.grey : C.white, display: "flex", flexDirection: "column", justifyContent: "space-between"}}>
                    <span style={{fontSize: 18, fontWeight: 600}}>{type}</span>
                    <span style={{fontFamily: monoFont, fontSize: 11, color: C.zinc500}}>{i === 0 ? "SCOPE · SLICES · ACCEPTANCE" : "SOURCE-GROUNDED"}</span>
                  </div>
                ))}
              </div>
              <div style={{marginTop: 14, padding: 14, backgroundColor: C.grey, border: `1px solid ${C.zinc300}`}}>
                <div style={{fontSize: 15, fontWeight: 600}}>Use context from</div>
                <div style={{display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap"}}><Tag color={C.sky}>2 Notion</Tag><Tag>2 GitHub</Tag><Tag color={C.volt}>This session</Tag></div>
              </div>
              <div style={{display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16}}><Button tone="light">Cancel</Button><Button tone="dark">Create draft →</Button></div>
            </div>
          </section>
        </div>
      </ProductWindow>
      <Cursor frame={frame} times={[0, 18, 46, 74, 104]} xs={[1570, 1570, 1390, 960, 1260]} ys={[232, 232, 295, 372, 700]} clickAt={104} />
    </DemoFrame>
  );
};

const DocScene: React.FC<DemoSceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  return (
    <DemoFrame scene={scene} index={index}>
      <ProductWindow>
        <div style={{height: "100%", display: "grid", gridTemplateRows: "82px 1fr", backgroundColor: C.grey}}>
          <div style={{backgroundColor: C.white, borderBottom: `1px solid ${C.zinc300}`, padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between"}}>
            <div style={{display: "flex", alignItems: "center", gap: 14}}><span style={{fontSize: 26}}>←</span><div><div style={{fontFamily: monoFont, fontSize: 12, color: C.zinc500}}>ARTIFACT · DRAFT</div><div style={{fontFamily: displayFont, fontSize: 28, fontWeight: 700}}>Reporting export — requirements brief</div></div></div>
            <div style={{display: "flex", gap: 10}}><Button tone="light">Edit</Button><Button tone="dark">Preview Notion write</Button></div>
          </div>
          <div style={{display: "grid", gridTemplateColumns: "1fr 340px", minHeight: 0}}>
            <div style={{padding: "24px 34px", overflow: "hidden"}}>
              <div style={{height: "100%", backgroundColor: C.white, border: `1px solid ${C.zinc300}`, padding: "28px 36px"}}>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start"}}>
                  <div><Tag color={C.sky}>FEATURE REQUEST</Tag><h2 style={{fontFamily: displayFont, fontSize: 38, margin: "10px 0 0"}}>Customer reporting export</h2></div>
                  <Tag color={C.volt}>3 SOURCE ANCHORS</Tag>
                </div>
                <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 20}}>
                  {[
                    ["Problem", "Operations teams manually assemble monthly reporting for customers.", "Notion · account memory"],
                    ["Desired outcome", "Export a customer-ready report without manual data assembly.", "Notion · discovery"],
                    ["First vertical slice", "Generate a CSV for one account and one reporting period.", "Session · confirmed"],
                    ["Out of scope now", "Scheduled delivery, custom templates, and PDF formatting.", "Session · proposed"],
                  ].map(([title, body, source], i) => (
                    <div key={title} style={{minHeight: 128, padding: 18, border: `1px solid ${C.zinc300}`, ...enter(frame, 8 + i * 7, 18)}}>
                      <div style={{fontFamily: monoFont, fontSize: 12, color: C.zinc500, textTransform: "uppercase"}}>{title}</div>
                      <div style={{fontSize: 18, lineHeight: 1.35, marginTop: 8}}>{body}</div>
                      <div style={{fontFamily: monoFont, fontSize: 11, color: C.blue, marginTop: 8}}>↳ {source}</div>
                    </div>
                  ))}
                </div>
                <div style={{marginTop: 18, padding: 18, backgroundColor: C.black, color: C.white}}>
                  <div style={{fontFamily: monoFont, fontSize: 12, color: C.volt}}>ACCEPTANCE CRITERIA · DRAFT</div>
                  <div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 12}}>
                    {["Given a selected account", "When export is requested", "Then a source-linked CSV is produced"].map((text, i) => <div key={text} style={{fontSize: 17, lineHeight: 1.3, paddingLeft: 12, borderLeft: `3px solid ${i === 2 ? C.volt : C.zinc700}`}}>{text}</div>)}
                  </div>
                </div>
              </div>
            </div>
            <aside style={{backgroundColor: C.white, borderLeft: `1px solid ${C.zinc300}`, padding: 24}}>
              <div style={{fontFamily: monoFont, fontSize: 12, color: C.zinc500}}>REVIEW GATE</div>
              <h3 style={{fontFamily: displayFont, fontSize: 29, margin: "10px 0 18px"}}>Before this leaves the session</h3>
              {["Problem confirmed", "First slice confirmed", "Acceptance needs review"].map((item, i) => <div key={item} style={{height: 58, display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${C.zinc200}`, fontSize: 16}}><span style={{width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: i < 2 ? C.volt : C.white, border: `2px solid ${i < 2 ? C.black : C.zinc300}`}}>{i < 2 ? "✓" : ""}</span>{item}</div>)}
              <div style={{marginTop: 22, padding: 16, backgroundColor: C.grey, border: `1px solid ${C.zinc300}`}}>
                <div style={{fontSize: 14, fontWeight: 600}}>Destination</div>
                <div style={{fontSize: 17, marginTop: 8}}>Notion / Product requests</div>
                <div style={{fontFamily: monoFont, fontSize: 11, color: C.zinc500, marginTop: 5}}>Preview → approve → write → read back</div>
              </div>
              <Button tone="dark" style={{width: "100%", marginTop: 18}}>Review exact write →</Button>
            </aside>
          </div>
        </div>
      </ProductWindow>
      <Cursor frame={frame} times={[0, 60, 98]} xs={[1450, 1560, 1560]} ys={[450, 775, 775]} clickAt={98} />
    </DemoFrame>
  );
};

const EndScene: React.FC<DemoSceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  return (
    <DemoFrame scene={scene} index={index}>
      <ProductWindow>
        <div style={{height: "100%", position: "relative", backgroundColor: C.grey, padding: 30}}>
          <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", opacity: .25}}><div><Tag color={C.volt}>IN SESSION · 38:14</Tag><h2 style={{fontFamily: displayFont, fontSize: 42, margin: "9px 0 0"}}>Reporting export decision</h2></div><Button tone="dark">End session</Button></div>
          <div style={{height: 590, marginTop: 24, backgroundColor: C.white, border: `1px solid ${C.zinc300}`, opacity: .22}} />
          <div style={{position: "absolute", width: 760, left: "50%", top: "50%", translate: "-50% -48%", scale: interpolate(frame, [5, 23], [.94, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut}), opacity: interpolate(frame, [5, 23], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}), backgroundColor: C.white, border: `1px solid ${C.black}`, boxShadow: "16px 20px 0 rgba(45,44,45,.15)", padding: 32}}>
            <div style={{fontFamily: monoFont, fontSize: 13, color: C.zinc500}}>END LIVE SESSION</div>
            <h2 style={{fontFamily: displayFont, fontSize: 42, margin: "8px 0 12px"}}>End and synthesize?</h2>
            <p style={{fontSize: 19, lineHeight: 1.45, color: C.zinc500, margin: 0}}>The live interaction ends. Sources, artifacts, and the audit trail remain available.</p>
            <div style={{display: "flex", flexDirection: "column", gap: 10, marginTop: 22}}>
              {[
                ["Preserve 4 selected sources and their versions", "Ready"],
                ["Include the requirements brief", "Draft"],
                ["Prepare decisions, actions, and open questions", "Next"],
                ["Draft a post-session recap", "Next"],
              ].map(([item, status], i) => <div key={item} style={{height: 56, padding: "0 14px", display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${C.zinc300}`, backgroundColor: i < 2 ? C.grey : C.white, ...enter(frame, 18 + i * 6, 15)}}><span style={{fontSize: 16}}>{item}</span><Tag color={i < 2 ? C.volt : C.zinc100}>{status}</Tag></div>)}
            </div>
            <div style={{display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22}}><Button tone="light">Keep working</Button><Button tone="dark">End and synthesize →</Button></div>
          </div>
        </div>
      </ProductWindow>
      <Cursor frame={frame} times={[0, 50, 86]} xs={[1490, 1240, 1240]} ys={[330, 800, 800]} clickAt={86} />
    </DemoFrame>
  );
};

const SynthesisScene: React.FC<DemoSceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  return (
    <DemoFrame scene={scene} index={index}>
      <ProductWindow>
        <div style={{height: "100%", display: "grid", gridTemplateColumns: "280px 1fr", backgroundColor: C.grey}}>
          <aside style={{backgroundColor: C.white, borderRight: `1px solid ${C.zinc300}`, padding: 22}}>
            <Tag color={C.sky}>SYNTHESIS READY</Tag>
            <h3 style={{fontFamily: displayFont, fontSize: 28, margin: "14px 0 24px"}}>Reporting export decision</h3>
            {["Summary", "Decisions · 2", "Actions · 3", "Open questions · 2", "Artifacts · 1", "Sources · 4"].map((item, i) => <div key={item} style={{height: 52, padding: "0 12px", display: "flex", alignItems: "center", backgroundColor: i === 1 ? C.black : C.white, color: i === 1 ? C.white : C.black, fontSize: 17, fontWeight: i === 1 ? 600 : 500}}>{item}</div>)}
            <div style={{marginTop: 26, padding: 14, backgroundColor: C.grey, border: `1px solid ${C.zinc300}`, fontSize: 14, lineHeight: 1.4, color: C.zinc500}}>Synthesis is a proposal until a person confirms it.</div>
          </aside>
          <section style={{padding: "24px 30px"}}>
            <div style={{display: "flex", justifyContent: "space-between", alignItems: "flex-start"}}>
              <div><div style={{fontFamily: monoFont, fontSize: 13, color: C.zinc500}}>POST-SESSION REVIEW</div><h2 style={{fontFamily: displayFont, fontSize: 40, margin: "6px 0 0"}}>Decisions</h2></div>
              <div style={{display: "flex", gap: 10}}><Button tone="light">Edit synthesis</Button><Button tone="dark">Confirm reviewed items</Button></div>
            </div>
            <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 20}}>
              <div style={{backgroundColor: C.white, border: `1px solid ${C.black}`, boxShadow: "6px 7px 0 rgba(45,44,45,.10)", padding: 22, ...enter(frame, 6, 18)}}>
                <div style={{display: "flex", justifyContent: "space-between"}}><Tag color={C.volt}>EXPLICIT · READY</Tag><span style={{fontFamily: monoFont, fontSize: 12, color: C.zinc500}}>DECISION 01</span></div>
                <h3 style={{fontFamily: displayFont, fontSize: 29, lineHeight: 1.05, margin: "18px 0 10px"}}>CSV is the first reporting export slice.</h3>
                <p style={{fontSize: 16, lineHeight: 1.4, color: C.zinc500, margin: 0}}>Confirmed in the session after reviewing customer evidence and current delivery context.</p>
                <div style={{display: "flex", gap: 8, marginTop: 18}}><Tag color={C.sky}>Notion · discovery</Tag><Tag color={C.volt}>Session · 31:08</Tag></div>
                <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, borderTop: `1px solid ${C.zinc200}`, paddingTop: 14}}><span style={{fontSize: 15}}>Owner · Product</span><Button tone="volt">✓ Confirm</Button></div>
              </div>
              <div style={{backgroundColor: C.white, border: `1px solid ${C.orange}`, padding: 22, ...enter(frame, 14, 18)}}>
                <div style={{display: "flex", justifyContent: "space-between"}}><Tag color={C.orange}>AMBIGUOUS · REVIEW</Tag><span style={{fontFamily: monoFont, fontSize: 12, color: C.zinc500}}>DECISION 02</span></div>
                <h3 style={{fontFamily: displayFont, fontSize: 29, lineHeight: 1.05, margin: "18px 0 10px"}}>Schedule delivery for the next sprint.</h3>
                <p style={{fontSize: 16, lineHeight: 1.4, color: C.zinc500, margin: 0}}>The discussion shaped scope, but did not explicitly commit delivery capacity.</p>
                <div style={{display: "flex", gap: 8, marginTop: 18}}><Tag>GitHub · PR #842</Tag><Tag color={C.orange}>Inference</Tag></div>
                <div style={{display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18, borderTop: `1px solid ${C.zinc200}`, paddingTop: 14}}><Button tone="light">Edit</Button><Button tone="dark">Reject inference</Button></div>
              </div>
            </div>
            <div style={{display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 16, marginTop: 16}}>
              <div style={{backgroundColor: C.black, color: C.white, padding: 20, ...enter(frame, 26, 18)}}>
                <div style={{display: "flex", justifyContent: "space-between"}}><span style={{fontFamily: monoFont, fontSize: 12, color: C.volt}}>ACTIONS</span><span style={{fontFamily: monoFont, fontSize: 12}}>3</span></div>
                {["Product · review requirements brief", "Engineering · validate CSV constraints", "Customer success · prepare follow-up"].map((item, i) => <div key={item} style={{marginTop: 13, fontSize: 16, color: i === 0 ? C.white : C.zinc300}}>0{i + 1} · {item}</div>)}
              </div>
              <div style={{backgroundColor: C.white, border: `1px solid ${C.zinc300}`, padding: 20, ...enter(frame, 34, 18)}}>
                <div style={{display: "flex", justifyContent: "space-between"}}><span style={{fontFamily: monoFont, fontSize: 12, color: C.zinc500}}>OPEN QUESTIONS</span><span style={{fontFamily: monoFont, fontSize: 12}}>2</span></div>
                <div style={{fontSize: 16, marginTop: 16}}>Who owns CSV schema versioning?</div>
                <div style={{fontSize: 16, marginTop: 12}}>What volume limit matters first?</div>
              </div>
            </div>
          </section>
        </div>
      </ProductWindow>
      <Cursor frame={frame} times={[0, 60, 96, 124]} xs={[1100, 820, 1400, 1450]} ys={[400, 610, 610, 250]} clickAt={124} />
    </DemoFrame>
  );
};

const DemoClose: React.FC<DemoSceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const outcomes = [
    ["Notion", "Requirements brief", "READ BACK", C.sky],
    ["Decisions", "1 confirmed · 1 rejected", "AUDIT RECORDED", C.volt],
    ["GitHub", "Repo + PR context", "SOURCE LINKED", C.white],
    ["Follow-up", "Customer recap", "DRAFT READY", C.orange],
  ] as const;
  return (
    <DemoFrame scene={scene} index={index} dark product={false}>
      <div style={{height: "100%", display: "grid", gridTemplateColumns: ".9fr 1.1fr", gap: 74, alignItems: "center"}}>
        <div style={{display: "flex", flexDirection: "column", gap: 26}}>
          <BrandLockup variant="volt" width={520} height={130} />
          <div style={{fontFamily: monoFont, fontSize: 20, letterSpacing: ".14em", color: C.volt, textTransform: "uppercase", ...enter(frame, 4)}}>{scene.kicker}</div>
          <h1 style={{fontFamily: displayFont, fontSize: 90, lineHeight: .94, letterSpacing: "-.045em", margin: 0, ...enter(frame, 10, 40)}}>{scene.title}</h1>
          <p style={{fontSize: 30, lineHeight: 1.35, color: C.zinc300, margin: 0, maxWidth: 780, ...enter(frame, 20)}}>{scene.support}</p>
        </div>
        <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14}}>
          {outcomes.map(([provider, title, status, color], i) => (
            <div key={provider} style={{height: 238, padding: 24, display: "flex", flexDirection: "column", justifyContent: "space-between", backgroundColor: color, color: C.black, border: `1px solid ${color === C.white ? C.zinc300 : color}`, ...enter(frame, 18 + i * 8, 30)}}>
              <div style={{display: "flex", justifyContent: "space-between", fontFamily: monoFont, fontSize: 13}}><span>0{i + 1}</span><span>{status}</span></div>
              <div><div style={{fontFamily: displayFont, fontSize: 42, fontWeight: 700}}>{provider}</div><div style={{fontSize: 20, marginTop: 5}}>{title}</div></div>
            </div>
          ))}
        </div>
      </div>
    </DemoFrame>
  );
};

const DemoSceneRenderer: React.FC<DemoSceneProps> = (props) => {
  const components = [DemoOpen, TodayScene, DefineScene, ContextScene, WorkspaceScene, MakeDocScene, DocScene, EndScene, SynthesisScene, DemoClose];
  const Component = components[props.index];
  return <Component {...props} />;
};

const AriesCompanyOSDemoVideo: React.FC = () => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill>
      <Series>
        {demoStoryboard.map((scene, index) => (
          <Series.Sequence key={scene.id} durationInFrames={sceneFrames[index]} premountFor={fps}>
            <AbsoluteFill>
              <DemoSceneRenderer scene={scene} index={index} duration={sceneFrames[index]} />
              <Audio src={staticFile(demoAudioTimings[index].audio)} volume={0.98} />
            </AbsoluteFill>
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};

export const AriesCompanyOSDemoComposition: React.FC = () => (
  <Composition
    id="AriesCompanyOSDemo"
    component={AriesCompanyOSDemoVideo}
    durationInFrames={totalFrames}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    defaultProps={{}}
  />
);
