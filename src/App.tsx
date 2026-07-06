import { OperatorPanel } from "./components/OperatorPanel";
import { RobotStage } from "./components/RobotStage";
import { AskPage } from "./components/AskPage";
import { LiveStage } from "./components/LiveStage";
import { LiveOperator } from "./components/LiveOperator";
import { OperatorGate } from "./components/OperatorGate";
import { useMcSession } from "./hooks/useMcSession";
import "./styles.css";

function RouteTabs() {
  return (
    <nav className="route-tabs" aria-label="화면 전환">
      <a href="/demo">리허설</a>
      <a href="/stage">무대</a>
      <a href="/operator">운영</a>
    </nav>
  );
}

function DemoScreen() {
  const session = useMcSession();

  return (
    <main className="app-shell app-shell--demo">
      <RouteTabs />
      <section className="demo-grid">
        <div className="demo-stage-card">
          <div className="screen-label">
            <span>Internal preview</span>
            <strong>AI MC 리허설</strong>
          </div>
          <RobotStage
            state={session.robotState}
            question={session.currentQuestionText}
            answer={session.approvedAnswer}
            lipFrame={session.lipFrame}
            captionCueIndex={session.captionCueIndex}
            variant="preview"
          />
        </div>
        <OperatorPanel
          questions={session.questions}
          selectedQuestion={session.selectedQuestion}
          manualQuestion={session.manualQuestion}
          draftAnswer={session.draftAnswer}
          approvedAnswer={session.approvedAnswer}
          robotState={session.robotState}
          error={session.error}
          isGenerating={session.isGenerating}
          isSpeaking={session.isSpeaking}
          isPreparingSpeech={session.isPreparingSpeech}
          isSpeechReady={session.isSpeechReady}
          geminiVoice={session.geminiVoice}
          ttsEngine={session.ttsEngine}
          elevenVoice={session.elevenVoice}
          speechProvider={session.speechProvider}
          onSelectQuestion={session.selectQuestion}
          onManualQuestionChange={session.setManualQuestion}
          onAddManualQuestion={session.addManualQuestion}
          onGenerateAnswer={session.generateAnswer}
          onDraftAnswerChange={session.setDraftAnswer}
          onApproveDraft={session.approveDraft}
          onGeminiVoiceChange={session.setGeminiVoice}
          onTtsEngineChange={session.setTtsEngine}
          onElevenVoiceChange={session.setElevenVoice}
          onSpeak={session.speak}
        />
      </section>
    </main>
  );
}

function StageScreen() {
  const session = useMcSession();

  return (
    <main className="stage-screen">
      <RobotStage
        state={session.robotState}
        question={session.currentQuestionText}
        answer={session.approvedAnswer}
        lipFrame={session.lipFrame}
        captionCueIndex={session.captionCueIndex}
        variant="full"
      />
    </main>
  );
}

function OperatorScreen() {
  const session = useMcSession();

  return (
    <main className="app-shell app-shell--operator">
      <RouteTabs />
      <div className="operator-layout">
        <RobotStage
          state={session.robotState}
          question={session.currentQuestionText}
          answer={session.approvedAnswer}
          lipFrame={session.lipFrame}
          captionCueIndex={session.captionCueIndex}
          variant="compact"
        />
        <OperatorPanel
          questions={session.questions}
          selectedQuestion={session.selectedQuestion}
          manualQuestion={session.manualQuestion}
          draftAnswer={session.draftAnswer}
          approvedAnswer={session.approvedAnswer}
          robotState={session.robotState}
          error={session.error}
          isGenerating={session.isGenerating}
          isSpeaking={session.isSpeaking}
          isPreparingSpeech={session.isPreparingSpeech}
          isSpeechReady={session.isSpeechReady}
          geminiVoice={session.geminiVoice}
          ttsEngine={session.ttsEngine}
          elevenVoice={session.elevenVoice}
          speechProvider={session.speechProvider}
          onSelectQuestion={session.selectQuestion}
          onManualQuestionChange={session.setManualQuestion}
          onAddManualQuestion={session.addManualQuestion}
          onGenerateAnswer={session.generateAnswer}
          onDraftAnswerChange={session.setDraftAnswer}
          onApproveDraft={session.approveDraft}
          onGeminiVoiceChange={session.setGeminiVoice}
          onTtsEngineChange={session.setTtsEngine}
          onElevenVoiceChange={session.setElevenVoice}
          onSpeak={session.speak}
        />
      </div>
    </main>
  );
}

export default function App() {
  const path = window.location.pathname;

  if (path === "/ask") {
    return <AskPage />;
  }

  if (path === "/stage") {
    return (
      <OperatorGate screenName="무대 화면">
        <LiveStage />
      </OperatorGate>
    );
  }

  if (path === "/stage-rehearsal") {
    return <StageScreen />;
  }

  if (path === "/operator") {
    return (
      <OperatorGate screenName="운영 콘솔">
        <LiveOperator />
      </OperatorGate>
    );
  }

  if (path === "/operator-rehearsal") {
    return <OperatorScreen />;
  }

  return <DemoScreen />;
}
