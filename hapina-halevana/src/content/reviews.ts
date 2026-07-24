export type Review = {
  id: string;
  name: string;
  initial: string;
  rating: number;
  text: string;
  when: string;
  source: "Google" | "Facebook" | "TripAdvisor";
};

export const reviews: Review[] = [
  {
    id: "r1",
    name: "Yael B.",
    initial: "Y",
    rating: 5,
    text: "Best shawarma in the area, hands down. The lamb laffa is unreal and the portions are ridiculous. We've been coming here since I was a kid.",
    when: "2 weeks ago",
    source: "Google",
  },
  {
    id: "r2",
    name: "Amit R.",
    initial: "A",
    rating: 5,
    text: "Generous portions and amazing taste. You can tell everything is fresh — the salads, the tahini, the laffa straight off the fire.",
    when: "1 month ago",
    source: "Google",
  },
  {
    id: "r3",
    name: "Noa K.",
    initial: "N",
    rating: 5,
    text: "Always fresh, always fast, always kind. HaPina HaLevana is a Yehud institution for a reason.",
    when: "3 weeks ago",
    source: "Google",
  },
  {
    id: "r4",
    name: "David S.",
    initial: "D",
    rating: 5,
    text: "The Corner Feast fed six of us and we still took food home. Incredible value and the kebab is grilled perfectly.",
    when: "2 months ago",
    source: "Facebook",
  },
  {
    id: "r5",
    name: "Michal T.",
    initial: "M",
    rating: 5,
    text: "Hummus masabacha with a soft egg — I dream about it. Warm, smooth, perfect every single time.",
    when: "5 days ago",
    source: "Google",
  },
  {
    id: "r6",
    name: "Eitan G.",
    initial: "E",
    rating: 4,
    text: "Busy on Friday afternoons but worth the wait. The lemonana is the best I've had anywhere.",
    when: "1 week ago",
    source: "TripAdvisor",
  },
];
