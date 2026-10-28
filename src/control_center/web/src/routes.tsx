/**
 * @file Every page, its address, its navigation label and icon, in sidebar order.
 *
 * Pages are loaded lazily so the first paint only carries the shell and Today (spec 7.17, initial
 * JavaScript under 250 KB). The order matches the design's sidebar; `inNav: false` pages are
 * reached from other pages (Voice from Connections and Settings, Search from the search field).
 */
import {
  Activity,
  BookOpen,
  BookUser,
  Briefcase,
  CalendarClock,
  CircleDollarSign,
  Cpu,
  HardDrive,
  Inbox,
  Layers,
  ListChecks,
  MessageCircle,
  Mic,
  Plug,
  Scale,
  Search,
  Server,
  Settings,
  Shield,
  Sun,
  User,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/** One page of Brain. */
export interface PageRoute {
  path: string;
  label: string;
  icon: LucideIcon;
  /** The key the server uses for this page's navigation badge, if any. */
  badge?: string;
  inNav: boolean;
  page: LazyExoticComponent<ComponentType>;
}

const route = (
  path: string,
  label: string,
  icon: LucideIcon,
  page: () => Promise<{ default: ComponentType }>,
  extra: Partial<Pick<PageRoute, "badge" | "inNav">> = {},
): PageRoute => ({ path, label, icon, inNav: true, page: lazy(page), ...extra });

/** All pages. The first is the home page. */
export const ROUTES: PageRoute[] = [
  route("/", "Today", Sun, () => import("./pages/Today")),
  route("/approvals", "Approvals", Inbox, () => import("./pages/Approvals"), {
    badge: "approvals",
  }),
  route("/decisions", "Decisions", Scale, () => import("./pages/Decisions"), {
    badge: "decisions",
  }),
  route("/live", "Live", Activity, () => import("./pages/Live"), { badge: "live" }),
  route("/work", "Work", Briefcase, () => import("./pages/Work")),
  route("/chat", "Chat", MessageCircle, () => import("./pages/Chat")),
  route("/personal", "Personal", User, () => import("./pages/Personal")),
  route("/finance", "Finance", Wallet, () => import("./pages/Finance")),
  route("/contacts", "Contacts", BookUser, () => import("./pages/Contacts")),
  route("/directory", "Directory", Users, () => import("./pages/Directory")),
  route("/system", "System", Cpu, () => import("./pages/System")),
  route("/models", "Models", Layers, () => import("./pages/Models")),
  route("/spend", "Spend", CircleDollarSign, () => import("./pages/Spend")),
  route("/services", "Services", Server, () => import("./pages/Services")),
  route("/connections", "Connections", Plug, () => import("./pages/Connections")),
  route("/schedule", "Schedule", CalendarClock, () => import("./pages/Schedule")),
  route("/backups", "Backups", HardDrive, () => import("./pages/Backups"), { badge: "backups" }),
  route("/maintenance", "Maintenance", Wrench, () => import("./pages/Maintenance")),
  route("/security", "Security", Shield, () => import("./pages/Security")),
  route("/docs", "Docs", BookOpen, () => import("./pages/Docs")),
  route("/setup", "Setup", ListChecks, () => import("./pages/Setup"), { badge: "setup" }),
  route("/settings", "Settings", Settings, () => import("./pages/Settings")),
  route("/voice", "Voice", Mic, () => import("./pages/Voice"), { inNav: false }),
  route("/search", "Search", Search, () => import("./pages/Search"), { inNav: false }),
];

/** The phone's bottom bar (spec 7.12): four pages and More, which is Settings with the page list. */
export const TAB_PATHS = ["/", "/work", "/chat", "/directory", "/settings"];
