"use client";

import { useId, useState } from "react";
import styles from "./ip-address-demo.module.css";

const initialOctets = ["192", "168", "10", "24"] as const;
const bitWeights = [128, 64, 32, 16, 8, 4, 2, 1] as const;
const octetNames = ["첫 번째", "두 번째", "세 번째", "네 번째"] as const;

/** Accept canonical decimal octets without truncating or clamping edited text. */
export function parseIpv4Octet(input: string): number | null {
  if (!/^(0|[1-9][0-9]{0,2})$/.test(input)) return null;
  const value = Number(input);
  return value <= 255 ? value : null;
}

export function IpAddressDemo() {
  const id = useId();
  const [octets, setOctets] = useState<string[]>([...initialOctets]);
  const values = octets.map(parseIpv4Octet);
  const validAddress = values.every((value) => value !== null);
  const address = validAddress ? values.join(".") : "입력값을 확인하십시오";

  function updateOctet(index: number, value: string) {
    setOctets((previous) => previous.map((octet, position) => position === index ? value : octet));
  }

  function toggleBit(index: number, weight: number) {
    setOctets((previous) => {
      const value = parseIpv4Octet(previous[index]);
      if (value === null) return previous;
      return previous.map((octet, position) => position === index ? String(value ^ weight) : octet);
    });
  }

  return (
    <section className={styles.demo} aria-labelledby={`${id}-title`}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>IPv4 / 32 BITS</p>
          <h3 id={`${id}-title`}>직접 바꾸는 IP 주소</h3>
        </div>
        <button className={styles.reset} type="button" onClick={() => setOctets([...initialOctets])}>
          처음 값으로
        </button>
      </header>
      <p className={styles.introduction} id={`${id}-instructions`}>
        숫자를 입력하거나 비트를 누르면 10진수와 2진수 표기가 함께 바뀝니다.
        각 칸에는 0~255의 정수를 입력합니다.
      </p>

      <div className={styles.octets}>
        {octets.map((octet, index) => {
          const value = values[index];
          const invalid = value === null;
          const inputId = `${id}-octet-${index}`;
          const errorId = `${id}-error-${index}`;
          return (
            <fieldset className={styles.octet} key={index}>
              <legend><span>{String(index + 1).padStart(2, "0")}</span> {octetNames[index]} 옥텟</legend>
              <div className={styles.decimal}>
                <label className={styles.srOnly} htmlFor={inputId}>{octetNames[index]} 옥텟 (0~255)</label>
                <input
                  id={inputId}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  value={octet}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? `${id}-instructions ${errorId}` : `${id}-instructions`}
                  onChange={(event) => updateOctet(index, event.target.value)}
                />
                <span aria-hidden="true">10진수</span>
              </div>
              <div className={styles.bits} role="group" aria-label={`${octetNames[index]} 옥텟의 8비트`}>
                {bitWeights.map((weight) => {
                  const active = value !== null && (value & weight) !== 0;
                  return (
                    <div className={styles.bitColumn} key={weight}>
                      <span className={styles.weight} aria-hidden="true">{weight}</span>
                      <button
                        type="button"
                        className={styles.bit}
                        aria-label={`${octetNames[index]} 옥텟의 ${weight} 자릿값 비트`}
                        aria-pressed={invalid ? undefined : active}
                        disabled={invalid}
                        onClick={() => toggleBit(index, weight)}
                      >
                        {invalid ? "–" : active ? "1" : "0"}
                      </button>
                    </div>
                  );
                })}
              </div>
              {invalid ? (
                <p className={styles.error} id={errorId} role="alert">
                  {octet === "" ? "숫자를 입력하십시오." : "0~255의 십진 정수를 입력하십시오. 01 대신 1로 입력합니다."}
                </p>
              ) : (
                <p className={styles.equation}>
                  <span aria-label="켜진 비트의 자릿값 합">
                    {bitWeights.filter((weight) => (value & weight) !== 0).join(" + ") || "0"}
                  </span>
                  <span> = {value}</span>
                </p>
              )}
            </fieldset>
          );
        })}
      </div>

      <div className={styles.result}>
        <span className={styles.resultLabel}>IPv4 주소 · 10진수</span>
        <output className={styles.address} aria-live="polite" aria-atomic="true">{address}</output>
        <div className={styles.binary}>
          <span>2진수</span>
          <div className={styles.binaryOctets}>
            {values.map((value, index) => (
              <span key={index}>{value === null ? "--------" : value.toString(2).padStart(8, "0")}</span>
            ))}
          </div>
        </div>
      </div>
      <p className={styles.note}>주소의 표기 규칙을 확인하는 실습입니다. 올바른 표기와 실제 연결 가능 여부는 별개입니다.</p>
    </section>
  );
}
