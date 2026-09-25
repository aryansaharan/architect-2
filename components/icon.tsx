import { createElement } from "react";
import {
  BarChart3, BookOpen, Bot, Building2, CalendarCheck, ClipboardList, CreditCard, Database, FilePlus, FileText, Globe,
  GraduationCap, Headset, Inbox, KeyRound, Laptop, LayoutDashboard, Mail, MessageSquare, Newspaper, Plug, Radar,
  Receipt, Search, Send, ShieldCheck, Siren, Smile, Sparkles, Ticket, UserPlus, Users, Wallet, Webhook, Calendar,
  HardDrive, Server, Workflow, type LucideIcon,
} from "lucide-react";

const MAP: Record<string, LucideIcon> = {
  "bar-chart-3": BarChart3, "book-open": BookOpen, bot: Bot, "building-2": Building2, "calendar-check": CalendarCheck,
  "clipboard-list": ClipboardList, "credit-card": CreditCard, database: Database, "file-plus": FilePlus, "file-text": FileText,
  globe: Globe, "graduation-cap": GraduationCap, headset: Headset, inbox: Inbox, "key-round": KeyRound, laptop: Laptop,
  "layout-dashboard": LayoutDashboard, mail: Mail, "message-square": MessageSquare, newspaper: Newspaper, plug: Plug,
  radar: Radar, receipt: Receipt, search: Search, send: Send, "shield-check": ShieldCheck, siren: Siren, smile: Smile,
  sparkles: Sparkles, ticket: Ticket, "user-plus": UserPlus, users: Users, wallet: Wallet, webhook: Webhook,
  calendar: Calendar, "hard-drive": HardDrive, server: Server, workflow: Workflow,
};

export function iconFor(name: string | undefined): LucideIcon {
  return (name && MAP[name]) || LayoutDashboard;
}

const CONNECTION_ICONS: Record<string, LucideIcon> = {
  database: Database, crm: Building2, email: Mail, http: Globe, mcp: Plug, slack: MessageSquare, calendar: Calendar,
  payments: CreditCard, storage: HardDrive, llm: Sparkles, docs: BookOpen,
};
export function connectionIcon(kind: string): LucideIcon {
  return CONNECTION_ICONS[kind] ?? Plug;
}

/** Stable components for dynamic icons (lint-safe: no component created during render). */
export function DynamicIcon({ name, className }: { name: string | undefined; className?: string }) {
  return createElement(iconFor(name), { className, "aria-hidden": true });
}

export function ConnectionIcon({ kind, className }: { kind: string; className?: string }) {
  return createElement(connectionIcon(kind), { className, "aria-hidden": true });
}
