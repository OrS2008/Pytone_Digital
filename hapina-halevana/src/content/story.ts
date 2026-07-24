export type TimelineEntry = {
  year: string;
  title: string;
  body: string;
  era: "past" | "present" | "future";
};

export const timeline: TimelineEntry[] = [
  {
    year: "1987",
    title: "A corner and a fire",
    body: "It began with a single spit, a white-tiled corner on Rehov HaMelacha, and a family recipe carried from one generation to the next. The neighborhood called it 'the white corner' — HaPina HaLevana.",
    era: "past",
  },
  {
    year: "1996",
    title: "The line down the street",
    body: "Word travelled. On Friday afternoons the line stretched past the bakery. We never changed the recipe — we just turned the spit faster.",
    era: "past",
  },
  {
    year: "2008",
    title: "A second generation",
    body: "The children who grew up carving shawarma took the tongs. Same hands, same fire, same promise: fresh every morning, generous every plate.",
    era: "past",
  },
  {
    year: "Today",
    title: "A Yehud institution",
    body: "Decades on, families who came as kids now bring their own. We still cut the salads by hand at dawn and carve every order to the plate.",
    era: "present",
  },
  {
    year: "Tomorrow",
    title: "The corner, everywhere",
    body: "Order online, track your food, and bring the legend home — without losing a gram of what made the corner the corner.",
    era: "future",
  },
];

export const values = [
  {
    title: "Fresh every dawn",
    body: "Salads hand-cut each morning, tahini whipped daily, laffa baked to order. Nothing sits.",
  },
  {
    title: "Generous by principle",
    body: "We portion like we're feeding family — because for decades, we have been.",
  },
  {
    title: "Carved to order",
    body: "Never pre-plated. Your shawarma leaves the fire the moment you ask for it.",
  },
  {
    title: "Recipes, not shortcuts",
    body: "The same spice blend, the same slow fire, the same corner since 1987.",
  },
];
