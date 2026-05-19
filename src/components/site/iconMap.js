import {
  AirVent,
  Award,
  BadgeCheck,
  Clock,
  Cog,
  Fan,
  Home,
  Plug,
  Refrigerator,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Star,
  Tv,
  Wallet,
  WashingMachine,
  Wind,
} from "lucide-react";

export const iconMap = {
  AirVent,
  Award,
  BadgeCheck,
  Clock,
  Cog,
  Fan,
  Home,
  Plug,
  Refrigerator,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Star,
  Tv,
  Wallet,
  WashingMachine,
  Wind,
};

export function getIcon(name, fallback = Plug) {
  return iconMap[name] || fallback;
}
