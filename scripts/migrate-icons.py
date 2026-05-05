import os
import re

# Explicit mappings for Lucide names that don't match Tabler's IconName pattern
MAPPING = {
    "CheckCircle2": "IconCircleCheck",
    "HardHat": "IconHelmet",
    "ListTodo": "IconListCheck",
    "Trash2": "IconTrash",
    "Edit": "IconPencil",
    "Edit2": "IconPencil",
    "RefreshCw": "IconRefresh",
    "RefreshCcw": "IconRefresh",
    "Info": "IconInfoCircle",
    "Brain": "IconBrain",
    "ExternalLink": "IconExternalLink",
    "Cpu": "IconCpu",
    "Layers": "IconLayersIntersect",
    "Sparkles": "IconSparkles",
    "Database": "IconDatabase",
    "Target": "IconTarget",
    "LayoutDashboard": "IconLayoutDashboard",
    "Plus": "IconPlus",
    "ChevronRight": "IconChevronRight",
    "ChevronDown": "IconChevronDown",
    "Sun": "IconSun",
    "Moon": "IconMoon",
    "LogOut": "IconLogout",
    "LogIn": "IconLogin",
    "User": "IconUser",
    "Settings": "IconSettings",
    "Zap": "IconBolt",
    "CheckSquare": "IconSquareCheck",
    "ListOrdered": "IconListNumbers",
    "ArrowUpRight": "IconArrowUpRight",
    "Filter": "IconFilter",
    "Layers3": "IconLayersIntersect",
    "GripVertical": "IconGripVertical",
    "ArrowUp": "IconArrowUp",
    "ArrowDown": "IconArrowDown",
    "FileUp": "IconFileUpload",
    "CheckCircle": "IconCircleCheck",
    "ScrollText": "IconFileText",
    "ListFilter": "IconFilter",
    "SortAsc": "IconSortAscending",
    "Users": "IconUsers",
    "UserPlus": "IconUserPlus",
    "Shield": "IconShield",
    "ShieldCheck": "IconShieldCheck",
    "Mail": "IconMail",
    "Save": "IconSave",
    "AlertCircle": "IconAlertCircle",
    "LayoutList": "IconLayoutList",
    "HelpCircle": "IconHelpCircle",
    "CircleHelp": "IconHelpCircle",
    "Archive": "IconArchive",
    "ArrowRight": "IconArrowRight",
    "FileText": "IconFileText",
    "Clock": "IconClock",
    "Eye": "IconEye",
    "EyeOff": "IconEyeOff",
    "MessageSquare": "IconMessage2",
    "Copy": "IconCopy",
    "Key": "IconKey",
    "Bell": "IconBell",
    "Globe": "IconGlobe",
    "Languages": "IconLanguage",
    "Lightbulb": "IconBulb",
    "PencilLine": "IconPencil",
    "CheckCheck": "IconChecks",
    "Share2": "IconShare",
    "DollarSign": "IconCurrencyDollar",
    "Smartphone": "IconDeviceMobile",
    "BookOpen": "IconBook",
    "Webhook": "IconWebhook",
    "LucideIcon": "any"
}

files_to_process = [
    "src/app/[companyId]/company-dashboard.tsx",
    "src/app/[companyId]/data/page.tsx",
    "src/app/[companyId]/goals/page.tsx",
    "src/app/[companyId]/knowmore/page.tsx",
    "src/app/[companyId]/review/page.tsx",
    "src/app/[companyId]/settings/page.tsx",
    "src/app/[companyId]/topics/page.tsx",
    "src/app/client-nav.tsx",
    "src/app/data/page.tsx",
    "src/app/home-client.tsx",
    "src/app/privacy/page.tsx",
    "src/app/strategy/page.tsx",
    "src/app/terms/page.tsx",
    "src/components/LanguageSelector.tsx",
    "src/components/MetricCard.tsx",
    "src/components/checklist-page.tsx",
    "src/components/expert-tip-card.tsx",
    "src/components/help-content.tsx",
    "src/components/intelligence-pulse.tsx",
    "src/components/knowledge-review-card.tsx",
    "src/components/member-list.tsx",
    "src/components/source-data-card.tsx",
    "src/components/tactical-board.tsx",
    "src/components/task-review-card.tsx",
    "src/components/trace-viewer.tsx",
    "src/components/ui/app-shell.tsx",
    "src/components/ui/hashtag-chip-list.tsx",
    "src/components/ui/hashtag-input.tsx",
    "src/components/ui/hashtag-multi-select.tsx",
    "src/components/ui/logo.tsx",
    "src/lib/cookie-consent.tsx"
]

for filepath in files_to_process:
    full_path = os.path.join(os.getcwd(), filepath)
    if not os.path.exists(full_path):
        continue
    
    with open(full_path, 'r') as f:
        content = f.read()
    
    # Aggressive type replacement
    content = content.replace(': LucideIcon', ': any')
    content = content.replace('LucideIcon | string', 'any')
    
    # Regex to find tabler imports
    import_regex = r'import\s+\{\s*([^}]+)\s*\}\s+from\s+"@tabler/icons-react";?'
    
    def replace_import(match):
        icons_str = match.group(1)
        parts = [p.strip() for p in icons_str.split(',') if p.strip()]
        
        new_parts = []
        for part in parts:
            if ' as ' in part:
                orig, alias = part.split(' as ')
                orig = orig.strip()
                alias = alias.strip()
                
                # Check mapping for either original or alias
                lookup_orig = orig.replace('Icon', '')
                if lookup_orig in MAPPING:
                    target = MAPPING[lookup_orig]
                    if target == "any": continue
                    new_parts.append(f"{target} as {alias}")
                elif alias in MAPPING:
                    target = MAPPING[alias]
                    if target == "any": continue
                    new_parts.append(f"{target} as {alias}")
                else:
                    new_parts.append(part)
            else:
                lookup = part.replace('Icon', '')
                if lookup == "LucideIcon":
                    continue
                if lookup in MAPPING:
                    target = MAPPING[lookup]
                    if target == "any": continue
                    new_parts.append(f"{target} as {part}")
                else:
                    if not part.startswith('Icon'):
                        new_parts.append(f"Icon{part} as {part}")
                    else:
                        new_parts.append(part)
        
        if not new_parts:
            return ""
        return f'import {{ {", ".join(new_parts)} }} from "@tabler/icons-react";'

    new_content = re.sub(import_regex, replace_import, content)
    
    if new_content != content:
        with open(full_path, 'w') as f:
            f.write(new_content)
        print(f"Updated: {filepath}")
    else:
        print(f"No changes for: {filepath}")
