import {
  Baby, BedDouble, Beer, Bike, Bus, Car, CarTaxiFront, Clapperboard, Droplets, Dumbbell, Flame, Fuel, Gamepad2, Gift,
  GraduationCap, Hammer, HandCoins, Heart, HeartPulse, House, Landmark, type LucideIcon, Monitor, Music, PawPrint, Plane,
  Receipt, Shapes, ShieldCheck, Shirt, ShoppingCart, Sofa, Sparkles, SquareParking, Trash2, TreePalm, Users, Utensils,
  Wifi, Wrench, Zap, KeyRound, ConciergeBell,
} from "lucide-react";
import { categoryColor, categoryOf, PAYMENT_CATEGORY } from "../domain/categories";
import type { GroupType } from "../domain/types";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "entertainment.games": Gamepad2,
  "entertainment.movies": Clapperboard,
  "entertainment.music": Music,
  "entertainment.sports": Dumbbell,
  "entertainment.other": Shapes,
  "food.dining": Utensils,
  "food.groceries": ShoppingCart,
  "food.liquor": Beer,
  "food.other": Utensils,
  "home.electronics": Monitor,
  "home.furniture": Sofa,
  "home.supplies": Sparkles,
  "home.maintenance": Hammer,
  "home.mortgage": Landmark,
  "home.pets": PawPrint,
  "home.rent": KeyRound,
  "home.services": ConciergeBell,
  "home.other": House,
  "life.childcare": Baby,
  "life.clothing": Shirt,
  "life.education": GraduationCap,
  "life.gifts": Gift,
  "life.insurance": ShieldCheck,
  "life.medical": HeartPulse,
  "life.taxes": Landmark,
  "life.other": Heart,
  "transport.bicycle": Bike,
  "transport.bus": Bus,
  "transport.car": Car,
  "transport.fuel": Fuel,
  "transport.hotel": BedDouble,
  "transport.parking": SquareParking,
  "transport.plane": Plane,
  "transport.taxi": CarTaxiFront,
  "transport.other": Car,
  "utilities.cleaning": Sparkles,
  "utilities.electricity": Zap,
  "utilities.gas": Flame,
  "utilities.trash": Trash2,
  "utilities.internet": Wifi,
  "utilities.water": Droplets,
  "utilities.other": Wrench,
  "uncategorized.general": Receipt,
  [PAYMENT_CATEGORY]: HandCoins,
};

export function categoryIcon(key: string): LucideIcon {
  return CATEGORY_ICONS[categoryOf(key).key] || Receipt;
}

export function CategoryIcon({ category, size = 36 }: { category: string; size?: number }) {
  const Icon = categoryIcon(category);
  return (
    <span
      className="cat-icon"
      style={{ width: size, height: size, background: categoryColor(category) }}
      aria-hidden="true"
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={2} />
    </span>
  );
}

export const GROUP_TYPES: { key: GroupType; label: string; icon: LucideIcon }[] = [
  { key: "home", label: "Casa", icon: House },
  { key: "trip", label: "Viagem", icon: TreePalm },
  { key: "couple", label: "Casal", icon: Heart },
  { key: "other", label: "Outro", icon: Users },
];

export function groupTypeIcon(t: GroupType): LucideIcon {
  return GROUP_TYPES.find((x) => x.key === t)?.icon || Users;
}
