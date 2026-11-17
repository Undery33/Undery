export function SectionPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <>
      <div className="page-heading"><p className="eyebrow">Interests</p><h1>{title}</h1><p>{description}</p></div>
      <section className="empty-state" aria-labelledby="coming-soon">
        <span className="badge">준비 중</span>
        <h2 id="coming-soon">이곳에 기록을 쌓아갈 예정입니다.</h2>
        <p>사진·영상 게시물과 방문자 댓글은 추후 구현합니다.<br />현재는 업로드하거나 댓글을 남길 수 없습니다.</p>
      </section>
    </>
  );
}
