"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import {
  CNN_FILTERS, CNN_INPUT_SIZE, createCnnInput, crossCorrelate2d, maxPool2x2, reluMatrix,
  type CnnFilterId, type CnnMatrix,
} from "@/lib/cnn-demo";
import styles from "./ai-cnn-demo.module.css";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(onChange: () => void) {
  const media = window.matchMedia(reducedMotionQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function reducedMotion() { return window.matchMedia(reducedMotionQuery).matches; }
function serverMotion() { return false; }
function signed(value: number) { return value < 0 ? `(${value})` : String(value); }

type MatrixViewProps = {
  values: CnnMatrix;
  label: string;
  selected?: number;
  onSelect?: (index: number) => void;
  highlighted?: (row: number, column: number) => boolean;
  excluded?: (row: number, column: number) => boolean;
};

function MatrixView({ values, label, selected, onSelect, highlighted, excluded }: MatrixViewProps) {
  const columns = values[0].length;
  return (
    <table className={styles.matrix} aria-label={label}>
      <tbody>{values.map((row, rowIndex) => <tr key={rowIndex}>{row.map((value, columnIndex) => {
        const index = rowIndex * columns + columnIndex;
        const className = [styles.mapCell, value > 0 ? styles.positive : value < 0 ? styles.negative : "",
          selected === index || highlighted?.(rowIndex, columnIndex) ? styles.highlight : "",
          excluded?.(rowIndex, columnIndex) ? styles.excluded : ""].filter(Boolean).join(" ");
        const cellLabel = `${label} ${rowIndex + 1}행 ${columnIndex + 1}열: ${value}`;
        return <td key={index} className={styles.matrixSlot} aria-label={onSelect ? undefined : cellLabel}>{onSelect ? (
          <button className={className} type="button" aria-label={cellLabel} aria-pressed={selected === index} onClick={() => onSelect(index)}>{value}</button>
        ) : <span className={className}>{value}</span>}</td>;
      })}</tr>)}</tbody>
    </table>
  );
}

export function CnnDemo() {
  const id = useId();
  const [input, setInput] = useState(createCnnInput);
  const [filterId, setFilterId] = useState<CnnFilterId>("vertical");
  const [stride, setStride] = useState(1);
  const [padding, setPadding] = useState(0);
  const [position, setPosition] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [focusedPixel, setFocusedPixel] = useState(0);
  const pixelRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const prefersReducedMotion = useSyncExternalStore(subscribeMotion, reducedMotion, serverMotion);
  const filter = CNN_FILTERS.find((item) => item.id === filterId) ?? CNN_FILTERS[0];
  const convolution = useMemo(() => crossCorrelate2d(input, filter.kernel, stride, padding), [input, filter, stride, padding]);
  const activated = useMemo(() => reluMatrix(convolution.values), [convolution]);
  const pooled = useMemo(() => maxPool2x2(activated), [activated]);
  const convolutionCount = convolution.frames.length;
  const totalSteps = convolutionCount + 1 + pooled.frames.length;
  const step = Math.min(position, totalSteps - 1);
  const phase = step < convolutionCount ? "convolution" : step === convolutionCount ? "relu" : "pool";
  const convolutionFrame = convolution.frames[phase === "convolution" ? step : 0];
  const poolFrame = pooled.frames[phase === "pool" ? step - convolutionCount - 1 : 0];
  const reluExample = convolution.frames.find((frame) => frame.value < 0) ?? convolution.frames[0];
  const outputSize = convolution.values.length;
  const poolSize = pooled.values.length;
  const paddedSize = CNN_INPUT_SIZE + padding * 2;
  const running = playing && !prefersReducedMotion && step < totalSteps - 1;

  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(() => {
      setPosition((current) => Math.min(current + 1, totalSteps - 1));
      if (step + 1 >= totalSteps - 1) setPlaying(false);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [running, step, totalSteps]);

  useEffect(() => {
    const media = window.matchMedia(reducedMotionQuery);
    const stopForMotion = () => { if (media.matches) setPlaying(false); };
    const stopWhenHidden = () => { if (document.hidden) setPlaying(false); };
    media.addEventListener("change", stopForMotion);
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      media.removeEventListener("change", stopForMotion);
      document.removeEventListener("visibilitychange", stopWhenHidden);
    };
  }, []);

  function restartSequence() { setPlaying(false); setPosition(0); }
  function goTo(next: number) { setPlaying(false); setPosition(Math.max(0, Math.min(next, totalSteps - 1))); }
  function togglePlay() {
    if (running) { setPlaying(false); return; }
    if (step === totalSteps - 1) setPosition(0);
    setPlaying(true);
  }
  function reset() {
    restartSequence();
    setInput(createCnnInput());
    setFilterId("vertical");
    setStride(1);
    setPadding(0);
  }
  function togglePixel(row: number, column: number) {
    restartSequence();
    setInput((previous) => previous.map((line, rowIndex) => line.map((value, columnIndex) =>
      rowIndex === row && columnIndex === column ? 1 - value : value)));
  }
  function movePixel(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const row = Math.floor(index / CNN_INPUT_SIZE);
    const column = index % CNN_INPUT_SIZE;
    const targets: Record<string, number> = {
      ArrowUp: Math.max(0, row - 1) * CNN_INPUT_SIZE + column,
      ArrowDown: Math.min(CNN_INPUT_SIZE - 1, row + 1) * CNN_INPUT_SIZE + column,
      ArrowLeft: row * CNN_INPUT_SIZE + Math.max(0, column - 1),
      ArrowRight: row * CNN_INPUT_SIZE + Math.min(CNN_INPUT_SIZE - 1, column + 1),
      Home: event.ctrlKey ? 0 : row * CNN_INPUT_SIZE,
      End: event.ctrlKey ? CNN_INPUT_SIZE ** 2 - 1 : (row + 1) * CNN_INPUT_SIZE - 1,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    const next = targets[event.key];
    setFocusedPixel(next);
    pixelRefs.current[next]?.focus();
  }

  const status = phase === "convolution"
    ? `합성곱 ${convolutionFrame.row + 1}행 ${convolutionFrame.column + 1}열: 아홉 곱의 합은 ${convolutionFrame.value}입니다.`
    : phase === "relu"
      ? "ReLU: 모든 위치에서 음수를 0으로 바꾸고 0 이상은 유지합니다."
      : `최대 풀링 ${poolFrame.row + 1}행 ${poolFrame.column + 1}열: 네 값의 최댓값은 ${poolFrame.value}입니다.`;

  return (
    <section className={styles.demo} aria-labelledby={`${id}-title`}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>CNN / FILTER LAB</p><h3 id={`${id}-title`}>작은 창으로 특징을 찾습니다</h3></div>
        <button type="button" className={styles.reset} onClick={reset}>처음 값으로</button>
      </header>
      <p className={styles.intro}>입력 칸을 눌러 그림을 바꿉니다. 수동 필터로 계산하는 예제이며 학습하거나 이미지를 분류하지 않습니다.</p>

      <div className={styles.settings}>
        <fieldset className={styles.filters}>
          <legend>3×3 필터</legend>
          <div>{CNN_FILTERS.map((item) => <button key={item.id} type="button" aria-pressed={filterId === item.id} onClick={() => { restartSequence(); setFilterId(item.id); }}>{item.label}</button>)}</div>
        </fieldset>
        <label htmlFor={`${id}-stride`}>이동 간격 · stride<select id={`${id}-stride`} value={stride} onChange={(event) => { restartSequence(); setStride(Number(event.target.value)); }}><option value={1}>1칸</option><option value={2}>2칸</option></select></label>
        <label htmlFor={`${id}-padding`}>0 테두리 · padding<select id={`${id}-padding`} value={padding} onChange={(event) => { restartSequence(); setPadding(Number(event.target.value)); }}><option value={0}>없음 · 0</option><option value={1}>각 변 1칸</option></select></label>
      </div>
      <p className={styles.dimensions}>입력 7×7 → 합성곱 {outputSize}×{outputSize} → ReLU {outputSize}×{outputSize} → 풀링 {poolSize}×{poolSize}</p>

      <div className={styles.workspace}>
        <section className={styles.inputPanel} aria-labelledby={`${id}-input-title`}>
          <div className={styles.panelHeading}><h4 id={`${id}-input-title`}>입력 · 7×7</h4><button type="button" onClick={() => { restartSequence(); setInput(input.map((row) => row.map(() => 0))); }}>모두 지우기</button></div>
          <div className={styles.inputGrid} style={{ gridTemplateColumns: `repeat(${paddedSize}, minmax(0, 1fr))` }} role="group" aria-label="편집 가능한 이진 입력" aria-describedby={`${id}-input-help`}>
            {Array.from({ length: paddedSize * paddedSize }, (_, index) => {
              const gridRow = Math.floor(index / paddedSize);
              const gridColumn = index % paddedSize;
              const row = gridRow - padding;
              const column = gridColumn - padding;
              const outside = row < 0 || row >= CNN_INPUT_SIZE || column < 0 || column >= CNN_INPUT_SIZE;
              const inWindow = phase === "convolution" && gridRow >= convolutionFrame.row * stride
                && gridRow < convolutionFrame.row * stride + 3 && gridColumn >= convolutionFrame.column * stride
                && gridColumn < convolutionFrame.column * stride + 3;
              const className = [styles.pixel, inWindow ? styles.windowPixel : "", outside ? styles.paddingPixel : ""].filter(Boolean).join(" ");
              if (outside) return <span key={index} className={className} aria-hidden="true">0</span>;
              const pixelIndex = row * CNN_INPUT_SIZE + column;
              const value = input[row][column];
              return <button key={index} ref={(element) => { pixelRefs.current[pixelIndex] = element; }} className={className} type="button" aria-label={`${row + 1}행 ${column + 1}열, 값 ${value}`} aria-pressed={value === 1} tabIndex={focusedPixel === pixelIndex ? 0 : -1} onFocus={() => setFocusedPixel(pixelIndex)} onKeyDown={(event) => movePixel(event, pixelIndex)} onClick={() => togglePixel(row, column)}>{value}</button>;
            })}
          </div>
          <p className={styles.help} id={`${id}-input-help`}>방향키로 이동하고 Enter 또는 Space로 0·1을 바꿉니다. 주황 테두리는 현재 3×3 창입니다.{padding === 1 ? " 점선 칸은 입력 밖에 추가한 0이며 편집하지 않습니다." : ""}</p>
        </section>

        <section className={styles.kernelPanel} aria-labelledby={`${id}-kernel-title`}>
          <div className={styles.panelHeading}><h4 id={`${id}-kernel-title`}>{filter.label} 필터</h4><span>가중치 9개</span></div>
          <div className={styles.kernelGrid}><MatrixView values={filter.kernel} label={`${filter.label} 필터 가중치`} /></div>
          <p className={styles.help}>{filter.description}</p>
          <p className={styles.formula}>출력 한 변 = ⌊(7 + 2×{padding} − 3) / {stride}⌋ + 1 = <strong>{outputSize}</strong></p>
          <p className={styles.help}>⌊ ⌋는 내림입니다. dilation=1, bias=0, 입력·출력 채널은 각각 1개입니다. 필터는 뒤집지 않습니다.</p>
        </section>
      </div>

      <div className={styles.playback} aria-label="계산 단계 조작">
        <button type="button" onClick={() => goTo(step - 1)} disabled={step === 0}>이전 단계</button>
        <button type="button" className={styles.playButton} onClick={togglePlay} disabled={prefersReducedMotion} aria-pressed={running}>{running ? "일시정지" : step === totalSteps - 1 ? "다시 재생" : "재생"}</button>
        <button type="button" onClick={() => goTo(step + 1)} disabled={step === totalSteps - 1}>다음 단계</button>
        <span className={styles.stepCount}>{step + 1} / {totalSteps}</span>
      </div>
      {prefersReducedMotion && <p className={styles.help}>모션 감소 설정에서는 이전·다음 단계 버튼으로 진행합니다.</p>}
      <p className={styles.status} role="status" aria-live={running ? "off" : "polite"} aria-atomic="true">{status}</p>

      <div className={styles.calculation}>
        {phase === "convolution" ? <>
          <h4>현재 창의 곱과 합</h4>
          <div className={styles.products}>{convolutionFrame.terms.map((term, index) => <span key={index} title={term.padding ? "입력 밖의 0 패딩" : `입력 ${term.inputRow + 1}행 ${term.inputColumn + 1}열`}>{term.input} × {signed(term.weight)} = <strong>{term.product}</strong></span>)}</div>
          <p className={styles.sum}>{convolutionFrame.terms.map((term) => signed(term.product)).join(" + ")} = <strong>{convolutionFrame.value}</strong></p>
        </> : phase === "relu" ? <>
          <h4>ReLU · 음수를 0으로</h4>
          <p className={styles.sum}>{reluExample.row + 1}행 {reluExample.column + 1}열: max(0, {reluExample.value}) = <strong>{Math.max(0, reluExample.value)}</strong></p>
          <p className={styles.help}>이 규칙을 모든 칸에 적용합니다. 위치와 행렬 크기는 바뀌지 않습니다.</p>
        </> : <>
          <h4>2×2 최대 풀링 · 네 칸에서 하나로</h4>
          <p className={styles.sum}>max({poolFrame.inputs.join(", ")}) = <strong>{poolFrame.value}</strong></p>
          <p className={styles.help}>ReLU 결과의 {poolFrame.sourceRow + 1}~{poolFrame.sourceRow + 2}행, {poolFrame.sourceColumn + 1}~{poolFrame.sourceColumn + 2}열입니다. 풀링 stride=2, padding=0입니다.</p>
        </>}
      </div>

      <div className={styles.outputs}>
        <section className={styles.outputPanel}><button className={styles.stageTitle} type="button" onClick={() => goTo(0)} aria-current={phase === "convolution" ? "step" : undefined}><span>01 · 합성곱</span><strong>{outputSize}×{outputSize}</strong></button><MatrixView values={convolution.values} label="합성곱 특징 맵" selected={phase === "convolution" ? step : undefined} onSelect={goTo} /><p className={styles.help}>숫자를 누르면 해당 위치의 곱과 합을 확인합니다. 음수도 반응의 방향을 나타냅니다.</p></section>
        <section className={styles.outputPanel}><button className={styles.stageTitle} type="button" onClick={() => goTo(convolutionCount)} aria-current={phase === "relu" ? "step" : undefined}><span>02 · ReLU</span><strong>{outputSize}×{outputSize}</strong></button><MatrixView values={activated} label="ReLU 특징 맵" highlighted={(row, column) => phase === "relu" || (phase === "pool" && row >= poolFrame.sourceRow && row < poolFrame.sourceRow + 2 && column >= poolFrame.sourceColumn && column < poolFrame.sourceColumn + 2)} excluded={(row, column) => row >= poolSize * 2 || column >= poolSize * 2} /><p className={styles.help}>max(0, x). 점선 칸은 2×2 풀링 창에 포함되지 않는 가장자리입니다.</p></section>
        <section className={styles.outputPanel}><button className={styles.stageTitle} type="button" onClick={() => goTo(convolutionCount + 1)} aria-current={phase === "pool" ? "step" : undefined}><span>03 · 최대 풀링</span><strong>{poolSize}×{poolSize}</strong></button><MatrixView values={pooled.values} label="최대 풀링 결과" selected={phase === "pool" ? step - convolutionCount - 1 : undefined} onSelect={(index) => goTo(convolutionCount + 1 + index)} /><p className={styles.help}>출력 한 변 = ⌊({outputSize} − 2) / 2⌋ + 1 = {poolSize}. 완전한 2×2 창만 사용합니다.</p></section>
      </div>
      <p className={styles.note}>전체 결과는 입력을 바꾸면 즉시 다시 계산됩니다. 단계 재생은 계산 순서를 강조합니다. 풀링은 ceil_mode=false이며 남는 가장자리는 사용하지 않습니다.</p>
    </section>
  );
}
