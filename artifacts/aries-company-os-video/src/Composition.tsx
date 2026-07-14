import {loadFont as loadInter} from "@remotion/google-fonts/Inter";
import {loadFont as loadInstrumentSerif} from "@remotion/google-fonts/InstrumentSerif";
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
import audioTimings from "./audio-timings.json";
import storyboard from "./storyboard.json";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

const COLORS = {
  black: "#2D2C2D",
  trueBlack: "#09090B",
  white: "#FFFFFF",
  volt: "#F0DE4A",
  grey: "#F0F2EB",
  orange: "#EE7437",
  mediumGrey: "#9C9C9C",
  sky: "#B1CDD6",
  ink300: "#D4D4D8",
  ink500: "#71717A",
  ink700: "#3F3F46",
} as const;

const {fontFamily: displayFont} = loadUrbanist("normal", {
  weights: ["600", "700", "800"],
  subsets: ["latin"],
});
const {fontFamily: bodyFont} = loadInter("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
});
const {fontFamily: serifFont} = loadInstrumentSerif("normal", {
  weights: ["400"],
  subsets: ["latin"],
});
const {fontFamily: monoFont} = loadPlexMono("normal", {
  weights: ["400", "500", "600"],
  subsets: ["latin"],
});

type StoryScene = (typeof storyboard)[number];
type SceneProps = {scene: StoryScene; duration: number; index: number};

const sceneFrames = audioTimings.map((timing) =>
  Math.ceil(timing.durationSeconds * FPS),
);
const totalFrames = sceneFrames.reduce((sum, frames) => sum + frames, 0);

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

const BrandLockup: React.FC<{
  variant: "grey" | "softblack" | "volt";
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}> = ({variant, width = 300, height = 60, style}) => {
  const files = {
    grey: "brand/Aires_lockup_GREY_[RGB].png",
    softblack: "brand/Aires_lockup_SOFTBLACK_[RGB].png",
    volt: "brand/Aires_lockup_VOLT_[RGB].png",
  } as const;

  return (
    <div style={{width, height, overflow: "hidden", ...style}}>
      <Img
        src={staticFile(files[variant])}
        style={{width: "100%", height: "100%", objectFit: "cover", objectPosition: "center"}}
      />
    </div>
  );
};

const Chrome: React.FC<{
  scene: StoryScene;
  index: number;
  children: React.ReactNode;
  dark?: boolean;
}> = ({scene, index, children, dark = false}) => {
  const foreground = dark ? COLORS.white : COLORS.black;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: dark ? COLORS.black : COLORS.grey,
        color: foreground,
        fontFamily: bodyFont,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: dark
            ? "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)"
            : "linear-gradient(rgba(45,44,45,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(45,44,45,.035) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      <header
        style={{
          position: "absolute",
          top: 58,
          left: 92,
          right: 92,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontFamily: monoFont,
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          <BrandLockup variant={dark ? "grey" : "softblack"} />
          <span style={{color: dark ? COLORS.ink300 : COLORS.ink700}}>/ Company OS</span>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            fontFamily: monoFont,
            fontSize: 20,
            color: dark ? COLORS.ink300 : COLORS.ink700,
          }}
        >
          <span>Internal concept film</span>
          <span style={{color: COLORS.mediumGrey}}>/</span>
          <span>{String(index + 1).padStart(2, "0")}</span>
        </div>
      </header>

      <main
        style={{
          position: "absolute",
          inset: "138px 92px 118px",
          zIndex: 2,
        }}
      >
        {children}
      </main>

      <footer
        style={{
          position: "absolute",
          left: 92,
          right: 92,
          bottom: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          zIndex: 4,
        }}
      >
        <span
          style={{
            fontFamily: monoFont,
            fontSize: 18,
            color: dark ? COLORS.ink300 : COLORS.ink500,
          }}
        >
          {scene.sourceAnchors.join(" · ")}
        </span>
        <div
          style={{
            width: 380,
            height: 3,
            backgroundColor: dark ? COLORS.ink700 : COLORS.ink300,
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${((index + 1) / storyboard.length) * 100}%`,
              backgroundColor: COLORS.volt,
            }}
          />
        </div>
      </footer>
    </AbsoluteFill>
  );
};

const Eyebrow: React.FC<{children: React.ReactNode; dark?: boolean}> = ({
  children,
  dark = false,
}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontFamily: bodyFont,
        fontSize: 24,
        fontWeight: 600,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        color: dark ? COLORS.ink300 : COLORS.ink700,
        opacity: interpolate(frame, [2, 18], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: easeOut,
        }),
        translate: interpolate(frame, [2, 18], ["0px 18px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: easeOut,
        }),
      }}
    >
      <span style={{width: 42, height: 5, backgroundColor: COLORS.volt}} />
      {children}
    </div>
  );
};

const Title: React.FC<{
  children: React.ReactNode;
  size?: number;
  maxWidth?: number;
}> = ({children, size = 112, maxWidth = 1220}) => {
  const frame = useCurrentFrame();
  return (
    <h1
      style={{
        fontFamily: displayFont,
        fontSize: size,
        lineHeight: 0.94,
        letterSpacing: "-0.045em",
        fontWeight: 700,
        margin: 0,
        maxWidth,
        opacity: interpolate(frame, [8, 30], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: easeOut,
        }),
        translate: interpolate(frame, [8, 30], ["0px 42px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: easeOut,
        }),
      }}
    >
      {children}
    </h1>
  );
};

const Support: React.FC<{children: React.ReactNode; maxWidth?: number}> = ({
  children,
  maxWidth = 1000,
}) => {
  const frame = useCurrentFrame();
  return (
    <p
      style={{
        margin: 0,
        maxWidth,
        fontSize: 38,
        lineHeight: 1.28,
        color: COLORS.ink500,
        opacity: interpolate(frame, [20, 42], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: easeOut,
        }),
        translate: interpolate(frame, [20, 42], ["0px 28px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: easeOut,
        }),
      }}
    >
      {children}
    </p>
  );
};

const ContextGap: React.FC<SceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const fragments = [
    ["Customer call", 0, 0],
    ["Product review", 1, 160],
    ["Support escalation", 2, 320],
    ["Sprint discussion", 3, 480],
    ["QA evidence", 4, 640],
  ] as const;

  return (
    <Chrome scene={scene} index={index}>
      <div style={{display: "grid", gridTemplateColumns: "1.08fr .92fr", height: "100%", gap: 100}}>
        <div style={{display: "flex", flexDirection: "column", justifyContent: "center", gap: 34}}>
          <Eyebrow>{scene.kicker}</Eyebrow>
          <Title size={124} maxWidth={980}>{scene.title}</Title>
          <Support maxWidth={860}>{scene.support}</Support>
        </div>
        <div style={{display: "flex", flexDirection: "column", justifyContent: "center", gap: 18}}>
          {fragments.map(([label, index, y]) => {
            const start = 16 + index * 7;
            return (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  height: 92,
                  padding: "0 30px",
                  backgroundColor: index === 4 ? COLORS.volt : COLORS.white,
                  outline: `1px solid ${index === 4 ? COLORS.black : COLORS.ink300}`,
                  boxShadow: index === 4 ? "8px 8px 0 rgba(45,44,45,.14)" : "none",
                  opacity: interpolate(frame, [start, start + 16], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: easeOut,
                  }),
                  translate: interpolate(frame, [start, start + 16], [`${90 + index * 14}px 0px`, "0px 0px"], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: easeOut,
                  }),
                }}
              >
                <span style={{fontSize: 30, fontWeight: 600}}>{label}</span>
                <span style={{fontFamily: monoFont, fontSize: 20, color: COLORS.ink500}}>
                  {String(y / 80 + 1).padStart(2, "0")}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Chrome>
  );
};

const SessionGraph: React.FC<SceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const nodes = [
    {label: "Source", x: 16, y: 12},
    {label: "People", x: 78, y: 12},
    {label: "Decision", x: 8, y: 72},
    {label: "Approval", x: 82, y: 70},
    {label: "Delivery", x: 31, y: 84},
    {label: "QA proof", x: 63, y: 84},
  ];

  return (
    <Chrome scene={scene} index={index}>
      <div style={{display: "grid", gridTemplateColumns: ".9fr 1.1fr", height: "100%", gap: 70}}>
        <div style={{display: "flex", flexDirection: "column", justifyContent: "center", gap: 34}}>
          <Eyebrow>{scene.kicker}</Eyebrow>
          <Title size={112}>{scene.title}</Title>
          <Support maxWidth={760}>{scene.support}</Support>
        </div>
        <div style={{position: "relative", height: "100%"}}>
          <svg viewBox="0 0 1000 760" style={{position: "absolute", inset: 0, width: "100%", height: "100%"}}>
            {nodes.map((node, index) => (
              <line
                key={node.label}
                x1="500"
                y1="380"
                x2={node.x * 10}
                y2={node.y * 7.6}
                stroke={COLORS.mediumGrey}
                strokeWidth="2"
                strokeDasharray="8 10"
                opacity={interpolate(frame, [18 + index * 4, 36 + index * 4], [0, 0.65], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                })}
              />
            ))}
          </svg>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: 330,
              height: 240,
              marginLeft: -165,
              marginTop: -120,
              backgroundColor: COLORS.volt,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              outline: `2px solid ${COLORS.black}`,
              boxShadow: "18px 18px 0 rgba(45,44,45,.14)",
              scale: interpolate(frame, [8, 34], [0.85, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: easeOut,
              }),
              opacity: interpolate(frame, [8, 28], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            <span style={{fontFamily: monoFont, fontSize: 20, letterSpacing: ".15em"}}>DURABLE UNIT</span>
            <span style={{fontFamily: displayFont, fontSize: 76, fontWeight: 700}}>Session</span>
          </div>
          {nodes.map((node, index) => {
            const start = 24 + index * 5;
            return (
              <div
                key={node.label}
                style={{
                  position: "absolute",
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  translate: "-50% -50%",
                  minWidth: 158,
                  padding: "20px 24px",
                  backgroundColor: COLORS.white,
                  outline: `1px solid ${COLORS.ink300}`,
                  fontFamily: monoFont,
                  fontSize: 22,
                  textAlign: "center",
                  opacity: interpolate(frame, [start, start + 18], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: easeOut,
                  }),
                  scale: interpolate(frame, [start, start + 18], [0.9, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: easeOut,
                  }),
                }}
              >
                {node.label}
              </div>
            );
          })}
        </div>
      </div>
    </Chrome>
  );
};

const SignalFlow: React.FC<SceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const steps = [
    {name: "Signal", detail: "Meeting complete"},
    {name: "Evidence", detail: "Authorized assets"},
    {name: "Session", detail: "Ready for review"},
  ];
  return (
    <Chrome scene={scene} index={index} dark>
      <div style={{height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 58}}>
        <div style={{display: "flex", flexDirection: "column", gap: 28}}>
          <Eyebrow dark>{scene.kicker}</Eyebrow>
          <Title size={116}>{scene.title}</Title>
          <p style={{margin: 0, fontSize: 34, color: COLORS.ink300}}>{scene.support}</p>
        </div>
        <div style={{display: "grid", gridTemplateColumns: "1fr 118px 1fr 118px 1fr", alignItems: "center"}}>
          {steps.map((step, index) => (
            <div key={step.name} style={{display: "contents"}}>
              <div
                style={{
                  height: 210,
                  padding: 34,
                  backgroundColor: index === 2 ? COLORS.volt : COLORS.trueBlack,
                  color: index === 2 ? COLORS.black : COLORS.white,
                  outline: `1px solid ${index === 2 ? COLORS.volt : COLORS.ink700}`,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  opacity: interpolate(frame, [12 + index * 18, 30 + index * 18], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: easeOut,
                  }),
                  translate: interpolate(frame, [12 + index * 18, 30 + index * 18], ["0px 34px", "0px 0px"], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: easeOut,
                  }),
                }}
              >
                <span style={{fontFamily: monoFont, fontSize: 20}}>0{index + 1}</span>
                <div>
                  <div style={{fontFamily: displayFont, fontSize: 58, fontWeight: 700}}>{step.name}</div>
                  <div style={{fontSize: 26, color: index === 2 ? COLORS.ink700 : COLORS.ink300}}>{step.detail}</div>
                </div>
              </div>
              {index < 2 ? (
                <div
                  style={{
                    height: 2,
                    backgroundColor: COLORS.ink700,
                    position: "relative",
                    scale: `${interpolate(frame, [28 + index * 18, 48 + index * 18], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})} 1`,
                  }}
                >
                  <span style={{position: "absolute", right: -3, top: -7, width: 14, height: 14, backgroundColor: COLORS.volt, rotate: "45deg"}} />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </Chrome>
  );
};

const Distill: React.FC<SceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const stages = ["Capture", "Segment", "Corroborate", "Draft proposals", "Human review"];
  return (
    <Chrome scene={scene} index={index}>
      <div style={{display: "grid", gridTemplateColumns: "1.15fr .85fr", height: "100%", gap: 110}}>
        <div style={{display: "flex", flexDirection: "column", justifyContent: "center", gap: 36}}>
          <Eyebrow>{scene.kicker}</Eyebrow>
          <Title size={110} maxWidth={1080}>{scene.title}</Title>
          <Support maxWidth={980}>{scene.support}</Support>
        </div>
        <div style={{display: "flex", flexDirection: "column", justifyContent: "center", gap: 14}}>
          {stages.map((stage, index) => {
            const highlighted = index === stages.length - 1;
            return (
              <div
                key={stage}
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 1fr 44px",
                  alignItems: "center",
                  minHeight: 96,
                  padding: "0 26px",
                  backgroundColor: highlighted ? COLORS.black : COLORS.white,
                  color: highlighted ? COLORS.white : COLORS.black,
                  outline: `1px solid ${highlighted ? COLORS.black : COLORS.ink300}`,
                  opacity: interpolate(frame, [12 + index * 8, 28 + index * 8], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut}),
                  translate: interpolate(frame, [12 + index * 8, 28 + index * 8], ["70px 0px", "0px 0px"], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut}),
                }}
              >
                <span style={{fontFamily: monoFont, fontSize: 18, color: highlighted ? COLORS.volt : COLORS.ink500}}>0{index + 1}</span>
                <span style={{fontFamily: displayFont, fontSize: 36, fontWeight: 650}}>{stage}</span>
                <span style={{width: 18, height: 18, backgroundColor: highlighted ? COLORS.volt : COLORS.ink300, rotate: highlighted ? "45deg" : "0deg"}} />
              </div>
            );
          })}
        </div>
      </div>
    </Chrome>
  );
};

const WorkflowChapter: React.FC<
  SceneProps & {
    steps: {label: string; detail: string}[];
    accent: string;
    label: string;
    dark?: boolean;
  }
> = ({scene, index, steps, accent, label, dark = false}) => {
  const frame = useCurrentFrame();
  const foreground = dark ? COLORS.white : COLORS.black;
  const muted = dark ? COLORS.ink300 : COLORS.ink500;

  return (
    <Chrome scene={scene} index={index} dark={dark}>
      <div style={{display: "grid", gridTemplateColumns: ".88fr 1.12fr", height: "100%", gap: 92}}>
        <div style={{display: "flex", flexDirection: "column", justifyContent: "center", gap: 28}}>
          <Eyebrow dark={dark}>{scene.kicker}</Eyebrow>
          <Title size={88} maxWidth={780}>{scene.title}</Title>
          <p style={{margin: 0, maxWidth: 720, fontSize: 31, lineHeight: 1.32, color: muted}}>{scene.support}</p>
          <div
            style={{
              marginTop: 10,
              alignSelf: "flex-start",
              padding: "12px 16px",
              backgroundColor: accent,
              color: COLORS.black,
              fontFamily: monoFont,
              fontSize: 16,
              fontWeight: 600,
              letterSpacing: ".08em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </div>
        </div>
        <div style={{display: "flex", flexDirection: "column", justifyContent: "center", gap: 12}}>
          {steps.map((step, stepIndex) => {
            const isHumanGate = step.label === "Human gate";
            const isOutcome = stepIndex === steps.length - 1;
            const cardColor = isHumanGate ? accent : isOutcome ? foreground : dark ? COLORS.trueBlack : COLORS.white;
            const cardForeground = isHumanGate || !isOutcome ? foreground : dark ? COLORS.black : COLORS.white;
            return (
              <div
                key={`${step.label}-${step.detail}`}
                style={{
                  minHeight: 112,
                  display: "grid",
                  gridTemplateColumns: "70px 210px 1fr",
                  alignItems: "center",
                  gap: 18,
                  padding: "0 28px",
                  backgroundColor: cardColor,
                  color: isHumanGate ? COLORS.black : cardForeground,
                  outline: `1px solid ${isHumanGate ? accent : dark ? COLORS.ink700 : COLORS.ink300}`,
                  opacity: interpolate(frame, [10 + stepIndex * 9, 28 + stepIndex * 9], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: easeOut,
                  }),
                  translate: interpolate(frame, [10 + stepIndex * 9, 28 + stepIndex * 9], ["62px 0px", "0px 0px"], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: easeOut,
                  }),
                }}
              >
                <span style={{fontFamily: monoFont, fontSize: 18, color: isHumanGate ? COLORS.black : muted}}>
                  {String(stepIndex + 1).padStart(2, "0")}
                </span>
                <span style={{fontFamily: monoFont, fontSize: 18, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".06em"}}>
                  {step.label}
                </span>
                <span style={{fontFamily: displayFont, fontSize: 36, lineHeight: 1.03, fontWeight: 700}}>{step.detail}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Chrome>
  );
};

const BugTriage: React.FC<SceneProps> = (props) => (
  <WorkflowChapter
    {...props}
    dark
    accent={COLORS.volt}
    label="Illustrative · proposed first complete flow"
    steps={[
      {label: "Signal", detail: "Intermittent bug reported"},
      {label: "Proposal", detail: "Evidence-anchored brief"},
      {label: "Human gate", detail: "Impact yes · severity open"},
      {label: "Delivery", detail: "Active sprint → linked PR"},
      {label: "Proof", detail: "Sentinel PASS → update"},
    ]}
  />
);

const FeatureRequest: React.FC<SceneProps> = (props) => (
  <WorkflowChapter
    {...props}
    accent={COLORS.sky}
    label="Illustrative · proposed first complete flow"
    steps={[
      {label: "Signal", detail: "Reporting gap detected"},
      {label: "Proposal", detail: "Job + evidence + questions"},
      {label: "Human gate", detail: "False commitment rejected"},
      {label: "Requirements", detail: "Interview → scoped slices"},
      {label: "Canonical", detail: "Notion approval → backlog"},
    ]}
  />
);

const CustomerOnboarding: React.FC<SceneProps> = (props) => (
  <WorkflowChapter
    {...props}
    accent={COLORS.orange}
    label="Proposed workflow · customer-success phase 4"
    steps={[
      {label: "Sources", detail: "Kickoff + plan + Notion"},
      {label: "Account", detail: "Goals + owners + milestones"},
      {label: "Plan", detail: "Dependencies + risks + blockers"},
      {label: "Human gate", detail: "Commitments confirmed"},
      {label: "Memory", detail: "Next milestone starts informed"},
    ]}
  />
);

const HumanGates: React.FC<SceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const gates = [
    "Evidence quality",
    "Interpretation",
    "Requirements readiness",
    "Canonical work",
    "Sprint commitment",
    "Delivery verification",
    "Closeout",
  ];
  return (
    <Chrome scene={scene} index={index}>
      <div style={{height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 42}}>
        <div style={{display: "grid", gridTemplateColumns: "1.25fr .75fr", gap: 80, alignItems: "end"}}>
          <div style={{display: "flex", flexDirection: "column", gap: 32}}>
            <Eyebrow>{scene.kicker}</Eyebrow>
            <Title size={112}>{scene.title}</Title>
          </div>
          <Support maxWidth={650}>{scene.support}</Support>
        </div>
        <div style={{display: "flex", alignItems: "center", gap: 24}}>
          <span style={{fontFamily: monoFont, fontSize: 18, fontWeight: 600}}>COOPER PREPARES</span>
          <div style={{height: 2, flex: 1, backgroundColor: COLORS.ink300, position: "relative"}}>
            <span style={{position: "absolute", right: -4, top: -6, width: 14, height: 14, backgroundColor: COLORS.volt, rotate: "45deg"}} />
          </div>
          <span style={{fontFamily: monoFont, fontSize: 18, fontWeight: 600}}>HUMANS DECIDE</span>
        </div>
        <div style={{display: "grid", gridTemplateColumns: "repeat(7, 1fr)", alignItems: "stretch", gap: 12, height: 260}}>
          {gates.map((gate, index) => (
            <div
              key={gate}
              style={{
                outline: `1px solid ${index === 3 ? COLORS.black : COLORS.ink300}`,
                padding: 20,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                backgroundColor: index === 3 ? COLORS.volt : COLORS.white,
                opacity: interpolate(frame, [14 + index * 8, 30 + index * 8], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}),
              }}
            >
              <span style={{fontFamily: monoFont, fontSize: 18}}>GATE 0{index + 1}</span>
              <span style={{fontFamily: displayFont, fontSize: 30, lineHeight: 1.02, fontWeight: 700}}>{gate}</span>
            </div>
          ))}
        </div>
      </div>
    </Chrome>
  );
};

const DeliveryProof: React.FC<SceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const steps = [
    {tag: "Canonical work", name: "Notion", color: COLORS.sky},
    {tag: "Implementation", name: "GitHub", color: COLORS.white},
    {tag: "Evidence-backed QA", name: "Sentinel", color: COLORS.volt},
  ];
  return (
    <Chrome scene={scene} index={index} dark>
      <div style={{height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", gap: 54}}>
        <div style={{display: "grid", gridTemplateColumns: "1.2fr .8fr", alignItems: "end", gap: 80}}>
          <div style={{display: "flex", flexDirection: "column", gap: 30}}>
            <Eyebrow dark>{scene.kicker}</Eyebrow>
            <Title size={108}>{scene.title}</Title>
          </div>
          <p style={{margin: 0, fontSize: 34, lineHeight: 1.35, color: COLORS.ink300}}>{scene.support}</p>
        </div>
        <div style={{display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22}}>
          {steps.map((step, index) => (
            <div
              key={step.name}
              style={{
                height: 300,
                backgroundColor: step.color,
                color: COLORS.black,
                padding: 34,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                opacity: interpolate(frame, [12 + index * 16, 32 + index * 16], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut}),
                translate: interpolate(frame, [12 + index * 16, 32 + index * 16], ["0px 50px", "0px 0px"], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut}),
              }}
            >
              <div style={{display: "flex", justifyContent: "space-between", fontFamily: monoFont, fontSize: 18}}>
                <span>0{index + 1}</span>
                <span>{step.tag}</span>
              </div>
              <div>
                <div style={{fontFamily: displayFont, fontSize: 72, fontWeight: 700}}>{step.name}</div>
                <div style={{fontFamily: monoFont, fontSize: 19, marginTop: 8}}>{index === 2 ? "PASS · WITH EVIDENCE" : "SOURCE LINKED"}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Chrome>
  );
};

const LearningLoop: React.FC<SceneProps> = ({scene, duration, index}) => {
  const frame = useCurrentFrame();
  const loopNodes = ["Context", "Decision", "Delivery", "Evidence", "Memory"];
  return (
    <Chrome scene={scene} index={index}>
      <div style={{display: "grid", gridTemplateColumns: ".95fr 1.05fr", height: "100%", gap: 60}}>
        <div style={{display: "flex", flexDirection: "column", justifyContent: "center", gap: 34}}>
          <Eyebrow>{scene.kicker}</Eyebrow>
          <Title size={112}>{scene.title}</Title>
          <Support maxWidth={780}>{scene.support}</Support>
        </div>
        <div style={{position: "relative", display: "flex", alignItems: "center", justifyContent: "center"}}>
          <div
            style={{
              width: 650,
              height: 650,
              borderRadius: "50%",
              outline: `2px solid ${COLORS.ink300}`,
              rotate: interpolate(frame, [0, duration], ["0deg", "30deg"], {extrapolateRight: "clamp"}),
            }}
          />
          <div style={{position: "absolute", width: 250, height: 250, backgroundColor: COLORS.volt, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontFamily: displayFont, fontSize: 44, lineHeight: 1.05, fontWeight: 700}}>
            Verified<br />history
          </div>
          {loopNodes.map((node, index) => {
            const angle = (-90 + index * 72) * (Math.PI / 180);
            const x = 50 + Math.cos(angle) * 43;
            const y = 50 + Math.sin(angle) * 43;
            return (
              <div
                key={node}
                style={{
                  position: "absolute",
                  left: `${x}%`,
                  top: `${y}%`,
                  translate: "-50% -50%",
                  minWidth: 170,
                  padding: "20px 24px",
                  backgroundColor: index === 4 ? COLORS.black : COLORS.white,
                  color: index === 4 ? COLORS.white : COLORS.black,
                  outline: `1px solid ${index === 4 ? COLORS.black : COLORS.ink300}`,
                  textAlign: "center",
                  fontFamily: monoFont,
                  fontSize: 21,
                  opacity: interpolate(frame, [10 + index * 8, 28 + index * 8], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut}),
                }}
              >
                {node}
              </div>
            );
          })}
        </div>
      </div>
    </Chrome>
  );
};

const Closing: React.FC<SceneProps> = ({scene, index}) => {
  const frame = useCurrentFrame();
  return (
    <Chrome scene={scene} index={index} dark>
      <div style={{height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 34}}>
        <BrandLockup
          variant="volt"
          width={760}
          height={190}
          style={{
            opacity: interpolate(frame, [4, 24], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut}),
            scale: interpolate(frame, [4, 28], [0.8, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut}),
          }}
        />
        <div style={{fontFamily: bodyFont, fontSize: 24, fontWeight: 600, letterSpacing: ".18em", textTransform: "uppercase", color: COLORS.volt}}>
          {scene.kicker}
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: displayFont,
            fontSize: 156,
            fontWeight: 700,
            letterSpacing: "-.055em",
            lineHeight: .92,
            opacity: interpolate(frame, [12, 38], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut}),
            translate: interpolate(frame, [12, 38], ["0px 42px", "0px 0px"], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut}),
          }}
        >
          {scene.title}
        </h1>
        <p style={{margin: 0, fontFamily: serifFont, fontSize: 54, color: COLORS.ink300}}>{scene.support}</p>
        <div style={{marginTop: 24, width: interpolate(frame, [30, 70], [0, 920], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: easeOut}), height: 7, backgroundColor: COLORS.volt}} />
      </div>
    </Chrome>
  );
};

const Scene: React.FC<{scene: StoryScene; index: number; duration: number}> = ({
  scene,
  index,
  duration,
}) => {
  const timing = audioTimings[index];
  const components = [
    ContextGap,
    SessionGraph,
    SignalFlow,
    Distill,
    BugTriage,
    FeatureRequest,
    CustomerOnboarding,
    HumanGates,
    DeliveryProof,
    LearningLoop,
    Closing,
  ];
  const Component = components[index];
  return (
    <AbsoluteFill>
      <Component scene={scene} duration={duration} index={index} />
      <Audio src={staticFile(timing.audio)} volume={0.98} />
    </AbsoluteFill>
  );
};

const AriesCompanyOSVideo: React.FC = () => {
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill>
      <Series>
        {storyboard.map((scene, index) => (
          <Series.Sequence
            key={scene.id}
            durationInFrames={sceneFrames[index]}
            premountFor={fps}
          >
            <Scene scene={scene} index={index} duration={sceneFrames[index]} />
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};

export const AriesCompanyOSComposition: React.FC = () => {
  return (
    <Composition
      id="AriesCompanyOS"
      component={AriesCompanyOSVideo}
      durationInFrames={totalFrames}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{}}
    />
  );
};
