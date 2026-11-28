/**
 * @file Every page, its address, its navigation label and icon, in sidebar order.
 *
 * Pages are loaded lazily so the first paint only carries the shell and Today (spec 7.17, initial
 * JavaScript under 250 KB). The order matches the design's sidebar; `inNav: false` pages are
 * reached from other pages (Voice from Connections and Settings, Search from the search field).
 * A page with a `feature` is in the navigation only while that optional feature is on: Library
 * appears once the offline library is turned on (spec 7.2).
 */
import {
  Activity,
  BookOpen,
  BookUser,
  Library,
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
  Smartphone,
  Sun,
  Trash2,
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
  /** The optional feature this page belongs to; it is in the navigation only while that is on. */
  feature?: string;
  page: LazyExoticComponent<ComponentType>;
}

const route = (
  path: string,
  label: string,
  icon: LucideIcon,
  page: () => Promise<{ default: ComponentType }>,
  extra: Partial<Pick<PageRoute, "badge" | "inNav" | "feature">> = {},
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
  route("/library", "Library", Library, () => import("./pages/Library"), {
    feature: "offline_library",
  }),
  route("/setup", "Setup", ListChecks, () => import("./pages/Setup"), { badge: "setup" }),
  route("/settings", "Settings", Settings, () => import("./pages/Settings")),
  route("/voice", "Voice", Mic, () => import("./pages/Voice"), { inNav: false }),
  route("/search", "Search", Search, () => import("./pages/Search"), { inNav: false }),
  route("/docs/:id", "Docs", BookOpen, () => import("./pages/DocReader"), { inNav: false }),
  route("/personal/:domain", "Personal", User, () => import("./pages/DomainRecords"), {
    inNav: false,
  }),
  route("/trash", "Recently deleted", Trash2, () => import("./pages/Trash"), { inNav: false }),
  route("/offline", "Offline pack", Smartphone, () => import("./pages/OfflinePack"), {
    inNav: false,
  }),
];

/** Whether a page belongs in the navigation, given the optional features that are on. */
export const inNavigation = (page: PageRoute, featuresOn: readonly string[]) =>
  page.inNav && (!page.feature || featuresOn.includes(page.feature));

/** The phone's bottom bar (spec 7.12): four pages and More, which is Settings with the page list. */
export const TAB_PATHS = ["/", "/work", "/chat", "/directory", "/settings"];
