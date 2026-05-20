export default function HomeRow({ title }: { title: string }) {
  return (
    <section className="px-12">
      <h2 className="mb-3 text-2xl font-bold">{title}</h2>
      <div className="row-scroll flex gap-4 overflow-x-auto">
        {Array.from({ length: 12 }).map((_, i) => (
          <a
            key={i}
            href="#"
            className="tile relative block aspect-video w-80 flex-shrink-0 overflow-hidden rounded-xl"
          >
            <img
              src={`https://picsum.photos/seed/${encodeURIComponent(title)}-${i}/640/360`}
              alt=""
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
            <div className="absolute bottom-3 left-3 text-sm font-semibold">{`${title} #${i + 1}`}</div>
          </a>
        ))}
      </div>
    </section>
  );
}
