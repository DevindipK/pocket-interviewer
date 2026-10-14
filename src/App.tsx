import { useState } from "react";
import Home from "./components/Home";
import SetupScreen from "./components/SetupScreen";
import InterviewScreen from "./components/InterviewScreen";
import ReportScreen from "./components/ReportScreen";
import type { Session, Setup } from "./lib/types";

type Screen =
  | { name: "home" }
  | { name: "setup" }
  | { name: "interview"; setup: Setup }
  | { name: "report"; session: Session; fresh: boolean };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: "home" });
  const go = (next: Screen) => {
    setScreen(next);
    window.scrollTo(0, 0);
  };

  switch (screen.name) {
    case "home":
      return (
        <Home
          onStart={() => go({ name: "setup" })}
          onOpen={(session) => go({ name: "report", session, fresh: false })}
        />
      );
    case "setup":
      return <SetupScreen onBack={() => go({ name: "home" })} onStart={(setup) => go({ name: "interview", setup })} />;
    case "interview":
      return (
        <InterviewScreen
          setup={screen.setup}
          onQuit={() => go({ name: "home" })}
          onFinish={(session) => go({ name: "report", session, fresh: true })}
        />
      );
    case "report":
      return (
        <ReportScreen
          session={screen.session}
          fresh={screen.fresh}
          onHome={() => go({ name: "home" })}
          onAgain={() => go({ name: "interview", setup: screen.session.setup })}
        />
      );
  }
}
