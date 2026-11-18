import type { NetworkStep } from "@/lib/network-demos";
import styles from "./network-demo.module.css";

export function PlaybackControls({
  stepIndex, stepCount, playing, onStep, onPlay, onReset, unit,
}: {
  stepIndex: number;
  stepCount: number;
  playing: boolean;
  onStep: (index: number) => void;
  onPlay: () => void;
  onReset: () => void;
  unit: "프레임" | "패킷";
}) {
  return (
    <div className={styles.playback}>
      <button type="button" className={styles.primaryButton} onClick={onPlay} aria-pressed={playing}>
        <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span> {playing ? "일시 정지" : stepIndex === stepCount - 1 ? "다시 보내기" : `${unit} 보내기`}
      </button>
      <div className={styles.stepButtons}>
        <button type="button" onClick={() => onStep(stepIndex - 1)} disabled={stepIndex === 0} aria-label="이전 단계">←</button>
        <span aria-label={`${stepCount}단계 중 ${stepIndex + 1}단계`}>{String(stepIndex + 1).padStart(2, "0")} / {String(stepCount).padStart(2, "0")}</span>
        <button type="button" onClick={() => onStep(stepIndex + 1)} disabled={stepIndex === stepCount - 1} aria-label="다음 단계">→</button>
        <button type="button" className={styles.resetButton} onClick={onReset}>초기화</button>
      </div>
    </div>
  );
}

export function SimulationSteps({ steps, stepIndex, onStep }: { steps: NetworkStep[]; stepIndex: number; onStep: (index: number) => void }) {
  return (
    <ol className={styles.steps} aria-label="전달 단계">
      {steps.map((step, index) => (
        <li key={step.id}>
          <button type="button" onClick={() => onStep(index)} aria-current={index === stepIndex ? "step" : undefined} data-complete={index < stepIndex}>
            <span className={styles.stepNumber}>{String(index + 1).padStart(2, "0")}</span>
            <span>{step.title}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

export function CurrentStep({ step, index, total }: { step: NetworkStep; index: number; total: number }) {
  return (
    <div className={styles.currentStep} data-state={step.state} role="status" aria-live="polite" aria-atomic="true">
      <span className={styles.eyebrow}>STEP {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span>
      <h4>{step.title}</h4>
      <p>{step.detail}</p>
    </div>
  );
}
