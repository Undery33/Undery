"use client";

import { useEffect, useState } from "react";
import { BirthdayGallery } from "./gallery";
import { ArchiveError, birthday, Photo, useArchive, type Album, type Message } from "./archive";

const photosUrl = birthday + "/photos";
const messagesUrl = birthday + "/messages";
const socials = [
  ["vrchat.png", "VRChat", "https://vrchat.com/home/user/usr_c001da31-2e22-4c85-bd15-94feaaff7bf6"],
  ["x.png", "X", "https://x.com/VRC_UDR"],
  ["discord.png", "Discord", "https://discord.gg/sRDD9u38TC"],
  ["group.png", "VRChat 그룹", "https://vrc.group/ASS.8448"],
];

function Heading({ title, more }: { title: string; more?: string }) {
  return <div className="birthday-heading"><h2 lang="en">{title}</h2>{more && <a href={more}>더 보기</a>}</div>;
}

function Credits({ names }: { names: string[] }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (names.length < 2) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;
    function updateTimer() {
      window.clearInterval(timer);
      if (!motion.matches && !document.hidden) timer = window.setInterval(() => setStep(value => value + 1), 2700);
    }
    updateTimer();
    motion.addEventListener("change", updateTimer);
    document.addEventListener("visibilitychange", updateTimer);
    return () => {
      window.clearInterval(timer);
      motion.removeEventListener("change", updateTimer);
      document.removeEventListener("visibilitychange", updateTimer);
    };
  }, [names.length]);
  const radius = names.length >= 5 ? 2 : names.length >= 3 ? 1 : 0;
  return <section className="birthday-credits">
    <h2 lang="en">THANK YOU,</h2>
    {names.length > 0 && <div className="credits-window" style={{ height: `calc(var(--row) * ${radius * 2 + 1})` }}>
      {Array.from({ length: radius * 2 + 3 }, (_, index) => {
        const offset = index - radius - 1;
        const position = step + offset;
        const name = names[((position % names.length) + names.length) % names.length];
        return <span key={position} className="credits-name" data-distance={Math.abs(offset)}
          aria-hidden={offset !== 0} title={name}
          style={{ transform: `translateY(${offset * 100 - 50}%)` }}>{name}</span>;
      })}
    </div>}
  </section>;
}

export default function Birthday() {
  const album = useArchive<Album>("album");
  const messages = useArchive<Message[]>("messages");
  const art = album.data?.art ?? {};
  const names = [...new Set(messages.data?.map(entry => entry.nickname) ?? [])];
  const preview = messages.data?.slice(0, 6) ?? [];
  const card = (entry: Message) => <article key={entry.id}><h3>{entry.nickname}</h3><p>{entry.message}</p></article>;
  return <>
    <header className="birthday-hero">
      {art["hero.png"] && <Photo className="birthday-character" src={art["hero.png"]} fetchPriority="high" />}
      <div className="birthday-intro">
        <h1 lang="en">THANK YOU</h1>
        <div className="birthday-date"><b>참여해주셔서 감사합니다!</b><time dateTime="2026-11-22">2026.11.22</time></div>
        <p>365일 중 한 번 밖에 없는 생일을 축하해주셔서 진심으로 감사드립니다.<br/>추억을 여러분과 다시 꺼내고 싶어 만들었습니다.</p>
        <nav><a href={photosUrl}>사진 목록 보기 <span>↗</span></a><a href={messagesUrl}>메시지 보기 <span>↗</span></a></nav>
      </div>
      <svg className="birthday-wave" viewBox="0 0 1000 150.17" preserveAspectRatio="none" aria-hidden="true">
        <path d="M 266.47 0.00 C 403.74 0.00 526.39 33.16 607.43 85.18 L 620.84 94.68 657.74 87.52 C 699.25 80.68 743.38 77.00 789.14 77.00 C 865.40 77.00 937.15 87.23 999.76 105.25 L 1000.00 105.33 1000 150.17 0 150.17 0.00 47.67 19.42 39.98 C 89.94 14.74 174.96 0.00 266.47 0.00 Z" />
      </svg>
    </header>
    <section className="birthday-letter">
      <h2 lang="en">THANK YOU FOR EVERYONE!</h2>
      <div className="birthday-paper">
        <p>안녕하세요, 언더리 입니다.</p>
        <p>들어가기에 앞서, 월드에 와주신 모든 분들께 감사 인사를 드립니다.<br/>
        솔직히 많은 기대를 못했습니다. 그저 몇 명의 자주 연락하던 친구만 오고 끝날 줄 알았습니다.<br/>
        하지만 그런 생각을 못하게 교류가 적었던 분들부터 친구의 친구분, 어떤 월드인지 궁금해 오신 분들 등 모든 분들이 참여를 해주셨습니다.</p>
        <p>새로운 친구, 새로운 편지, 새로운 사진, 새로운 추억<br/>
        진심으로 잊지 못하는 생일이 되었습니다. 솔직하게 너무 감동 받아서 멍 때릴 정도로 여운을 즐겼습니다.<br/>
        저에게는 정말 여러분들이 있어서 행복하고, 이 인연이 계속되었음 하는 바램 입니다.</p>
        <p>다시 한 번 생일을 축하해주신 모든 분들께 진심으로 감사합니다.<br/>
        변하지 않는 모습으로 여러분들께 계속 찾아 뵙겠습니다.</p>
        <time dateTime="2026-11-23">2026.11.23</time>
      </div>
    </section>
    <section className="birthday-memos">
      <Heading title="MASSAGE ZONE" more={messagesUrl} />
      <div className="birthday-mosaic">
        <div className="birthday-mosaic-left">{preview.filter((_, i) => i !== 2 && i !== 5).map(card)}</div>
        <div className="birthday-mosaic-right">{preview.filter((_, i) => i === 2 || i === 5).map(card)}</div>
        {messages.failed && <ArchiveError />}
      </div>
    </section>
    <section className="birthday-photos">
      <Heading title="PHOTO ZONE" more={photosUrl} />
      {album.data && <BirthdayGallery photos={album.data.photos} preview />}
      {album.failed && <ArchiveError />}
    </section>
    <section className="birthday-bio">
      <Heading title="BIO" />
      <nav>{socials.map(([name, label, href]) => <a key={name} href={href} aria-label={label}>
        {art[name] && <Photo src={art[name]} loading="lazy" />}</a>)}</nav>
    </section>
    <Credits names={names} />
    <footer className="birthday-footer"><h2 lang="en">MAIN HOMEPAGE</h2>
      <a href="/vrchat" aria-label="VRChat 메인 페이지">
        {art["banner.png"] && <Photo src={art["banner.png"]} loading="lazy" />}
        {art["badge.png"] && <Photo className="birthday-badge" src={art["badge.png"]} loading="lazy" />}
      </a>
    </footer>
  </>;
}
