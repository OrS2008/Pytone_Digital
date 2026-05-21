export default function HeroBanner() {
  return (
    <section className="relative h-[70vh] min-h-[480px] w-full overflow-hidden">
      <img
        src="https://picsum.photos/seed/nova-stream-web-hero/1920/1080"
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-r from-black/85 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#06070A] to-transparent" />
      <div className="relative z-10 flex h-full max-w-4xl flex-col justify-end p-16">
        <span className="text-sm font-bold uppercase tracking-[0.3em] text-[#FF3B6E]">
          Live now
        </span>
        <h1 className="mt-2 text-5xl font-extrabold leading-tight md:text-6xl">
          Premier League · Sunday Big Match
        </h1>
        <p className="mt-4 max-w-lg text-base text-white/70">
          Multi-angle, instant replay, AI highlights from kick-off.
        </p>
        <div className="mt-6 flex gap-3">
          <button className="rounded-lg bg-[#FF3B6E] px-7 py-3 text-base font-bold">
            Play
          </button>
          <button className="rounded-lg bg-white/10 px-7 py-3 text-base font-bold">
            More info
          </button>
        </div>
      </div>
    </section>
  );
}
