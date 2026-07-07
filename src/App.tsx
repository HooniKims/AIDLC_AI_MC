import { AskPage } from "./components/AskPage";
import { LiveStage } from "./components/LiveStage";
import { LiveOperator } from "./components/LiveOperator";
import { OperatorGate } from "./components/OperatorGate";
import "./styles.css";

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

  // 루트 포함 그 외 경로는 운영 콘솔 (스태프 전용, 로그인 게이트)
  return (
    <OperatorGate screenName="운영 콘솔">
      <LiveOperator />
    </OperatorGate>
  );
}
