/**
 * Menu content model.
 *
 * Prices are in ILS (₪). `image` points to a slot in /public/menu — drop in
 * real magazine-quality photography with the same filename to upgrade instantly.
 * Until then a deterministic gradient "plate" is rendered from the item's hue.
 */

export type Diet = "vegetarian" | "vegan" | "spicy" | "gluten-free";
export type Allergen = "sesame" | "gluten" | "nuts" | "dairy" | "egg";

export type MenuItem = {
  id: string;
  name: string;
  nameHe: string;
  description: string;
  ingredients: string[];
  price: number;
  category: MenuCategoryId;
  /** hue used for the generated plate art, 0-360 */
  hue: number;
  image?: string;
  popular?: boolean;
  favorite?: boolean;
  recommended?: boolean;
  diet?: Diet[];
  allergens?: Allergen[];
};

export type MenuCategoryId =
  | "shawarma"
  | "laffa"
  | "pita"
  | "plates"
  | "falafel"
  | "hummus"
  | "grill"
  | "salads"
  | "kids"
  | "drinks"
  | "desserts";

export type MenuCategory = {
  id: MenuCategoryId;
  name: string;
  nameHe: string;
  blurb: string;
};

export const menuCategories: MenuCategory[] = [
  { id: "shawarma", name: "Shawarma", nameHe: "שווארמה", blurb: "Carved to order from the fire." },
  { id: "laffa", name: "Laffa", nameHe: "לאפה", blurb: "Fresh-baked, wrapped generously." },
  { id: "pita", name: "Pita", nameHe: "פיתה", blurb: "Pillowy, warm, filled to the brim." },
  { id: "plates", name: "Plates", nameHe: "צלחות", blurb: "The full feast, no compromises." },
  { id: "falafel", name: "Falafel", nameHe: "פלאפל", blurb: "Green inside, golden outside." },
  { id: "hummus", name: "Hummus", nameHe: "חומוס", blurb: "Slow-cooked, silk-smooth." },
  { id: "grill", name: "Grill", nameHe: "על האש", blurb: "Over open flame, charred to perfection." },
  { id: "salads", name: "Salads", nameHe: "סלטים", blurb: "Hand-cut fresh every morning." },
  { id: "kids", name: "Kids", nameHe: "ילדים", blurb: "Small hands, big smiles." },
  { id: "drinks", name: "Drinks", nameHe: "שתייה", blurb: "Cold, sharp, refreshing." },
  { id: "desserts", name: "Desserts", nameHe: "קינוחים", blurb: "The sweet last word." },
];

export const menuItems: MenuItem[] = [
  // SHAWARMA
  {
    id: "shawarma-turkey-pita",
    name: "Classic Turkey Shawarma",
    nameHe: "שווארמה הודו קלאסית",
    description:
      "Our legendary turkey shawarma, slow-turned on the spit and carved to order. The one that built the corner.",
    ingredients: ["Turkey shawarma", "Tahini", "Amba", "Israeli salad", "Pickles"],
    price: 42,
    category: "shawarma",
    hue: 32,
    popular: true,
    favorite: true,
    recommended: true,
    allergens: ["sesame", "gluten"],
  },
  {
    id: "shawarma-lamb-laffa",
    name: "Lamb Shawarma Laffa",
    nameHe: "שווארמה כבש בלאפה",
    description:
      "Rich, marbled lamb shawarma wrapped in warm laffa with charred onion and pine nuts.",
    ingredients: ["Lamb shawarma", "Laffa", "Grilled onion", "Pine nuts", "Tahini"],
    price: 58,
    category: "shawarma",
    hue: 20,
    popular: true,
    allergens: ["sesame", "gluten", "nuts"],
  },
  {
    id: "shawarma-mixed-plate",
    name: "Mixed Shawarma Plate",
    nameHe: "צלחת שווארמה משולבת",
    description:
      "Turkey and lamb piled over saffron rice with four salads, hummus and fresh laffa on the side.",
    ingredients: ["Turkey & lamb shawarma", "Saffron rice", "Four salads", "Hummus", "Laffa"],
    price: 79,
    category: "shawarma",
    hue: 28,
    recommended: true,
    allergens: ["sesame", "gluten"],
  },

  // LAFFA
  {
    id: "laffa-shawarma",
    name: "Loaded Shawarma Laffa",
    nameHe: "לאפה שווארמה עמוסה",
    description: "A laffa so full you'll need both hands. Shawarma, salads, chips and amba.",
    ingredients: ["Shawarma", "Laffa", "Chips", "Amba", "Israeli salad"],
    price: 52,
    category: "laffa",
    hue: 38,
    popular: true,
    allergens: ["sesame", "gluten"],
  },
  {
    id: "laffa-kebab",
    name: "Kebab Laffa",
    nameHe: "לאפה קבב",
    description: "Hand-rolled beef & lamb kebab, grilled over flame, wrapped with grilled peppers.",
    ingredients: ["Beef-lamb kebab", "Laffa", "Grilled peppers", "Tahini", "Onion"],
    price: 54,
    category: "laffa",
    hue: 12,
    allergens: ["sesame", "gluten"],
  },

  // PITA
  {
    id: "pita-shawarma",
    name: "Shawarma Pita",
    nameHe: "פיתה שווארמה",
    description: "The perfect handful — pillowy pita, shawarma, tahini and crisp salad.",
    ingredients: ["Shawarma", "Pita", "Tahini", "Israeli salad", "Pickles"],
    price: 38,
    category: "pita",
    hue: 34,
    favorite: true,
    allergens: ["sesame", "gluten"],
  },
  {
    id: "pita-falafel",
    name: "Falafel Pita",
    nameHe: "פיתה פלאפל",
    description: "Six golden falafel balls, hummus, tahini and salad. Fully plant-based.",
    ingredients: ["Falafel", "Pita", "Hummus", "Tahini", "Salad"],
    price: 30,
    category: "pita",
    hue: 96,
    diet: ["vegetarian", "vegan"],
    allergens: ["sesame", "gluten"],
  },

  // PLATES
  {
    id: "plate-shawarma-feast",
    name: "The Corner Feast",
    nameHe: "משתה הפינה",
    description:
      "Our signature share-plate: shawarma, kebab, wings, hummus, laffa and eight salads for the table.",
    ingredients: ["Shawarma", "Kebab", "Wings", "Hummus", "Eight salads", "Laffa"],
    price: 168,
    category: "plates",
    hue: 30,
    recommended: true,
    popular: true,
    allergens: ["sesame", "gluten"],
  },

  // FALAFEL
  {
    id: "falafel-plate",
    name: "Falafel Plate",
    nameHe: "צלחת פלאפל",
    description: "Ten falafel over hummus with tahini, amba and warm pita. Green herbs inside.",
    ingredients: ["Falafel", "Hummus", "Tahini", "Amba", "Pita"],
    price: 44,
    category: "falafel",
    hue: 100,
    diet: ["vegetarian", "vegan"],
    allergens: ["sesame", "gluten"],
  },

  // HUMMUS
  {
    id: "hummus-masabacha",
    name: "Hummus Masabacha",
    nameHe: "חומוס מסבחה",
    description: "Warm whole chickpeas over silk-smooth hummus, cumin, olive oil and a soft egg.",
    ingredients: ["Hummus", "Whole chickpeas", "Cumin", "Olive oil", "Egg"],
    price: 39,
    category: "hummus",
    hue: 46,
    favorite: true,
    diet: ["vegetarian"],
    allergens: ["sesame", "egg"],
  },
  {
    id: "hummus-shawarma",
    name: "Hummus Shawarma",
    nameHe: "חומוס שווארמה",
    description: "A bowl of hummus crowned with hot shawarma, toasted pine nuts and parsley.",
    ingredients: ["Hummus", "Shawarma", "Pine nuts", "Parsley", "Pita"],
    price: 49,
    category: "hummus",
    hue: 40,
    popular: true,
    allergens: ["sesame", "nuts"],
  },

  // GRILL
  {
    id: "grill-kebab",
    name: "Flame Kebab Skewers",
    nameHe: "שיפודי קבב על האש",
    description: "Two skewers of beef & lamb kebab grilled over open coals with grilled tomato.",
    ingredients: ["Beef-lamb kebab", "Grilled tomato", "Grilled onion", "Tahini"],
    price: 62,
    category: "grill",
    hue: 8,
    diet: ["gluten-free"],
    allergens: ["sesame"],
  },
  {
    id: "grill-wings",
    name: "Charred Chicken Wings",
    nameHe: "כנפיים על האש",
    description: "Eight wings marinated in za'atar and lemon, charred over flame.",
    ingredients: ["Chicken wings", "Za'atar", "Lemon", "Garlic"],
    price: 46,
    category: "grill",
    hue: 16,
    diet: ["spicy"],
  },

  // SALADS
  {
    id: "salad-israeli",
    name: "Israeli Salad",
    nameHe: "סלט ישראלי",
    description: "Finely diced tomato, cucumber, onion and parsley, lemon and olive oil.",
    ingredients: ["Tomato", "Cucumber", "Onion", "Parsley", "Lemon", "Olive oil"],
    price: 22,
    category: "salads",
    hue: 120,
    diet: ["vegetarian", "vegan", "gluten-free"],
  },
  {
    id: "salad-tabbouleh",
    name: "Tabbouleh",
    nameHe: "טאבולה",
    description: "Bright parsley, bulgur, mint, tomato and lemon.",
    ingredients: ["Parsley", "Bulgur", "Mint", "Tomato", "Lemon"],
    price: 24,
    category: "salads",
    hue: 110,
    diet: ["vegetarian", "vegan"],
    allergens: ["gluten"],
  },

  // KIDS
  {
    id: "kids-schnitzel",
    name: "Kids Schnitzel & Chips",
    nameHe: "שניצל צ'יפס לילדים",
    description: "Crispy chicken schnitzel with golden chips and a small salad.",
    ingredients: ["Chicken schnitzel", "Chips", "Small salad"],
    price: 34,
    category: "kids",
    hue: 44,
    allergens: ["gluten", "egg"],
  },

  // DRINKS
  {
    id: "drink-lemonana",
    name: "Fresh Lemonana",
    nameHe: "לימונענע",
    description: "Frozen lemon and fresh mint. The Israeli summer in a glass.",
    ingredients: ["Lemon", "Fresh mint", "Ice"],
    price: 18,
    category: "drinks",
    hue: 140,
    favorite: true,
    diet: ["vegan", "gluten-free"],
  },
  {
    id: "drink-soda",
    name: "Soft Drinks",
    nameHe: "שתייה קלה",
    description: "Cola, soda, and sparkling options, ice cold.",
    ingredients: ["Choice of soft drink"],
    price: 12,
    category: "drinks",
    hue: 210,
    diet: ["vegan", "gluten-free"],
  },

  // DESSERTS
  {
    id: "dessert-knafeh",
    name: "Knafeh",
    nameHe: "כנאפה",
    description: "Warm cheese pastry in crisp kadaif, rosewater syrup and pistachio.",
    ingredients: ["Kadaif", "Cheese", "Rosewater syrup", "Pistachio"],
    price: 32,
    category: "desserts",
    hue: 26,
    popular: true,
    diet: ["vegetarian"],
    allergens: ["gluten", "dairy", "nuts"],
  },
  {
    id: "dessert-malabi",
    name: "Malabi",
    nameHe: "מלבי",
    description: "Silky rosewater milk pudding, raspberry syrup, coconut and peanut.",
    ingredients: ["Milk pudding", "Rosewater", "Raspberry syrup", "Coconut", "Peanut"],
    price: 26,
    category: "desserts",
    hue: 340,
    favorite: true,
    diet: ["vegetarian", "gluten-free"],
    allergens: ["dairy", "nuts"],
  },
];

export const dietLabels: Record<Diet, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  spicy: "Spicy",
  "gluten-free": "Gluten-free",
};

export const allergenLabels: Record<Allergen, string> = {
  sesame: "Sesame",
  gluten: "Gluten",
  nuts: "Nuts",
  dairy: "Dairy",
  egg: "Egg",
};
