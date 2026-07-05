import {
  ShieldCheck,
  Bug,
  Braces,
  Database,
  Wand2,
  GitCommit,
  FileText,
  ClipboardList,
  Mail,
  Sparkles,
  Target,
  Search,
  BarChart3,
  Table2,
  FileCode2,
  ScrollText,
  Bot,
  type LucideIcon,
} from 'lucide-react'

// 图标名 → lucide 组件。种子数据用名字引用,未命中回退 Bot。
const ICON_MAP: Record<string, LucideIcon> = {
  ShieldCheck,
  Bug,
  Regex: Braces,
  Braces,
  Database,
  Wand2,
  GitCommit,
  FileText,
  ClipboardList,
  Mail,
  Sparkles,
  Target,
  Search,
  BarChart3,
  Table2,
  FileCode2,
  ScrollText,
}

export function resolveAgentIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Bot
}
